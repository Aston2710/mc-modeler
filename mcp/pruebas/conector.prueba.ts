import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { crearApp } from '../src/app'
import { leerConfig } from '../src/config'
import { MODELO_POOLS_CARRILES, MODELO_SIMPLE } from '../../src/domain/bpmn-model/fixtures'
import { ENV, claims, laboratorioArriba, llamarTool, sesionApp, sqlLab, tokenConector } from './lab'

/**
 * Pruebas de integración del conector contra el LABORATORIO, con tokens OAuth
 * reales. Se saltan solas si el laboratorio no está levantado.
 *
 * Ids del seed (supabase/seed.sql):
 *   A = dev@local.test  — dueño de todo lo sembrado
 *   B = dev2@local.test — editor de c1, viewer de c3, nada más
 */
const PROYECTO_A = 'aaaaaaaa-0000-0000-0000-000000000001'
const C1_EDITOR_B = 'cccccccc-0000-0000-0000-000000000001'
const C2_SOLO_A = 'cccccccc-0000-0000-0000-000000000002'
const C3_VIEWER_B = 'cccccccc-0000-0000-0000-000000000003'

const arriba = await laboratorioArriba()

describe.skipIf(!arriba)('conector MCP contra el laboratorio', () => {
  const app = crearApp(leerConfig({ ...ENV, MCP_HABILITAR_MODIFICAR: '1', MCP_PUBLIC_URL: 'http://localhost:7655' }))
  let tokenA = ''
  let tokenB = ''
  let creado = ''
  const sufijo = Date.now().toString(36)

  beforeAll(async () => {
    // Cada ejecución empieza con los contadores de ritmo a cero: la ventana de
    // un minuto sobrevive entre ejecuciones seguidas (solo laboratorio).
    sqlLab('delete from private.mcp_ventanas; delete from private.mcp_auditoria')
    tokenA = await tokenConector('dev@local.test')
    tokenB = await tokenConector('dev2@local.test')
  })

  // ── Autenticación ────────────────────────────────────────────────────────
  describe('autenticación', () => {
    it('el token del conector lleva client_id y es del usuario', () => {
      const c = claims(tokenA)
      expect(typeof c.client_id).toBe('string')
      expect(c.sub).toBe('11111111-1111-1111-1111-111111111111')
      expect(c.role).toBe('authenticated')
    })

    it('sin token → 401 con WWW-Authenticate y sin detalles', async () => {
      const r = await llamarTool(app, null, 'listar_proyectos')
      expect(r.status).toBe(401)
      expect(r.cabeceras.get('www-authenticate')).toMatch(/resource_metadata=/)
      expect(r.texto).not.toMatch(/supabase|postgres|stack/i)
    })

    it('token inválido → 401', async () => {
      expect((await llamarTool(app, 'x.y.z', 'listar_proyectos')).status).toBe(401)
    })

    it('token caducado o manipulado → 401', async () => {
      const [h, , s] = tokenA.split('.')
      const cuerpo = Buffer.from(JSON.stringify({ ...claims(tokenA), exp: 1 })).toString('base64url')
      expect((await llamarTool(app, `${h}.${cuerpo}.${s}`, 'listar_proyectos')).status).toBe(401)
    })

    it('una sesión normal de la app (sin client_id) → 401: el conector solo acepta tokens OAuth', async () => {
      const { token } = await sesionApp('dev@local.test')
      expect((await llamarTool(app, token, 'listar_proyectos')).status).toBe(401)
    })
  })

  // ── Lo que ve un cliente MCP al conectarse ───────────────────────────────
  it('tools/list: las seis tools, con esquemas JSON y anotaciones honestas', async () => {
    const res = await app(new Request('http://localhost:7655/mcp', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${tokenA}`, 'content-type': 'application/json',
        accept: 'application/json, text/event-stream', 'mcp-protocol-version': '2025-06-18',
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }),
    }))
    const cuerpo = await res.text()
    const json = res.headers.get('content-type')?.includes('event-stream')
      ? JSON.parse(cuerpo.split('\n').filter((l) => l.startsWith('data: ')).map((l) => l.slice(6)).pop()!)
      : JSON.parse(cuerpo)
    const tools = json.result.tools as { name: string; inputSchema: { type: string }; annotations?: Record<string, boolean> }[]
    expect(tools.map((t) => t.name).sort()).toEqual(
      ['crear_diagrama', 'listar_diagramas', 'listar_proyectos', 'modificar_diagrama', 'obtener_diagrama', 'validar_diagrama'])
    for (const t of tools) expect(t.inputSchema.type, t.name).toBe('object')
    const por = Object.fromEntries(tools.map((t) => [t.name, t.annotations ?? {}]))
    for (const n of ['listar_proyectos', 'listar_diagramas', 'obtener_diagrama', 'validar_diagrama']) expect(por[n].readOnlyHint, n).toBe(true)
    expect(por.crear_diagrama.destructiveHint).toBe(false)
    expect(por.modificar_diagrama.destructiveHint).toBe(true)
    // Ninguna tool borra ni mueve diagramas o proyectos.
    expect(tools.some((t) => /borrar|eliminar_diagrama|mover|papelera|purgar/.test(t.name))).toBe(false)
    // El esquema recursivo de los subprocesos se serializa (con $defs/$ref o en línea).
    expect(JSON.stringify(tools.find((t) => t.name === 'crear_diagrama')!.inputSchema)).toMatch(/"nodos"/)
  })

  it('sin MCP_HABILITAR_MODIFICAR, modificar_diagrama no existe (etapa 1)', async () => {
    // .env.lab la enciende; aquí se apaga explícitamente, como en producción hasta PLAN-042.
    const etapa1 = crearApp(leerConfig({ ...ENV, MCP_HABILITAR_MODIFICAR: undefined, MCP_PUBLIC_URL: 'http://localhost:7655' }))
    const r = await llamarTool(etapa1, tokenA, 'modificar_diagrama', {
      diagrama_id: C1_EDITOR_B, version_esperada: '2026-01-01T00:00:00+00:00', operaciones: [{ op: 'renombrar', id: 'x', nombre: 'y' }],
    })
    expect(r.isError).toBe(true)
    expect(r.texto).toMatch(/not found|no encontrad|Unknown tool|desconocid/i)
  })

  // ── Lectura y aislamiento ────────────────────────────────────────────────
  describe('lectura y aislamiento entre usuarios', () => {
    it('A ve su proyecto como dueño; B no lo ve', async () => {
      const a = await llamarTool(app, tokenA, 'listar_proyectos')
      const b = await llamarTool(app, tokenB, 'listar_proyectos')
      const pa = (a.datos as { proyectos: { id: string; mi_rol: string }[] }).proyectos
      const pb = (b.datos as { proyectos: { id: string }[] }).proyectos
      expect(pa.find((p) => p.id === PROYECTO_A)?.mi_rol).toBe('owner')
      expect(pb.find((p) => p.id === PROYECTO_A)).toBeUndefined()
    })

    it('B no puede leer un diagrama de A que no le compartieron', async () => {
      const r = await llamarTool(app, tokenB, 'obtener_diagrama', { diagrama_id: C2_SOLO_A })
      expect(r.isError).toBe(true)
      expect(r.texto).toMatch(/no existe .* o no tienes acceso/)
    })

    it('B lee c1 como editor y c3 como viewer', async () => {
      const c1 = await llamarTool(app, tokenB, 'obtener_diagrama', { diagrama_id: C1_EDITOR_B })
      const c3 = await llamarTool(app, tokenB, 'obtener_diagrama', { diagrama_id: C3_VIEWER_B })
      expect((c1.datos as { puedo_editar: boolean }).puedo_editar).toBe(true)
      expect((c3.datos as { puedo_editar: boolean; mi_rol: string }).mi_rol).toBe('viewer')
    })

    it('la estructura no incluye el XML crudo', async () => {
      const r = await llamarTool(app, tokenA, 'obtener_diagrama', { diagrama_id: C2_SOLO_A })
      expect(r.texto).not.toMatch(/<bpmn:|<\?xml/)
      expect((r.datos as { version: string }).version).toBeTruthy()
    })
  })

  // ── Creación ─────────────────────────────────────────────────────────────
  describe('crear_diagrama', () => {
    const nombre = () => `MCP prueba ${sufijo}`

    it('crea en el proyecto de A, con auditoría', async () => {
      const antes = Number(sqlLab(`select count(*) from private.mcp_auditoria where operacion='crear'`))
      const r = await llamarTool(app, tokenA, 'crear_diagrama', { nombre: nombre(), proyecto_id: PROYECTO_A, modelo: MODELO_POOLS_CARRILES })
      expect(r.isError, r.texto).toBe(false)
      const d = r.datos as { id: string; ya_existia: boolean; url: string }
      expect(d.ya_existia).toBe(false)
      expect(d.url).toContain(`?d=${d.id}`)
      creado = d.id
      expect(Number(sqlLab(`select count(*) from private.mcp_auditoria where operacion='crear'`))).toBe(antes + 1)
      expect(sqlLab(`select client_id is not null and user_id = '11111111-1111-1111-1111-111111111111' from private.mcp_auditoria where diagram_id='${d.id}'`)).toBe('t')
    })

    it('reintentar lo mismo no duplica: devuelve el mismo diagrama', async () => {
      const r = await llamarTool(app, tokenA, 'crear_diagrama', { nombre: nombre(), proyecto_id: PROYECTO_A, modelo: MODELO_POOLS_CARRILES })
      const d = r.datos as { id: string; ya_existia: boolean }
      expect(d.id).toBe(creado)
      expect(d.ya_existia).toBe(true)
      expect(sqlLab(`select count(*) from public.diagrams where name='${nombre()}'`)).toBe('1')
    })

    it('B no puede crear en el proyecto de A (y la base tampoco le dejaría)', async () => {
      const r = await llamarTool(app, tokenB, 'crear_diagrama', { nombre: `intruso ${sufijo}`, proyecto_id: PROYECTO_A, modelo: MODELO_SIMPLE })
      expect(r.isError).toBe(true)
      expect(sqlLab(`select count(*) from public.diagrams where name='intruso ${sufijo}'`)).toBe('0')
    })

    it('entrada inválida → error claro y nada escrito', async () => {
      const malo = structuredClone(MODELO_SIMPLE)
      malo.flujos!.push({ desde: 'fin', hasta: 'fantasma' })
      const r = await llamarTool(app, tokenA, 'crear_diagrama', { nombre: `malo ${sufijo}`, modelo: malo })
      expect(r.isError).toBe(true)
      expect(r.texto).toMatch(/fantasma/)
      expect(sqlLab(`select count(*) from public.diagrams where name='malo ${sufijo}'`)).toBe('0')
    })

    it('ids duplicados → error y nada escrito', async () => {
      const malo = structuredClone(MODELO_SIMPLE)
      malo.pools[0].nodos[1].id = 'inicio'
      const r = await llamarTool(app, tokenA, 'crear_diagrama', { nombre: `dup ${sufijo}`, modelo: malo })
      expect(r.isError).toBe(true)
      expect(r.texto).toMatch(/repetido/)
    })

    it('validar_diagrama avisa y no bloquea', async () => {
      const r = await llamarTool(app, tokenA, 'validar_diagrama', {
        modelo: { pools: [{ id: 'P', nombre: 'P', nodos: [{ id: 't', tipo: 'tarea' }] }] },
      })
      expect(r.isError).toBe(false)
      const codigos = (r.datos as { resultados: { code: string }[] }).resultados.map((x) => x.code)
      expect(codigos).toEqual(expect.arrayContaining(['MISSING_START_EVENT', 'MISSING_END_EVENT']))
    })
  })

  // ── Modificación: CAS, permisos, presencia ───────────────────────────────
  describe('modificar_diagrama', () => {
    const version = async (id: string, token = tokenA) =>
      ((await llamarTool(app, token, 'obtener_diagrama', { diagrama_id: id })).datos as { version: string }).version

    it('con la versión correcta modifica y deja auditoría con la versión anterior', async () => {
      const v = await version(creado)
      const r = await llamarTool(app, tokenA, 'modificar_diagrama', {
        diagrama_id: creado, version_esperada: v,
        operaciones: [{ op: 'agregar_nodo', id: 'archivar', tipo: 'tarea', nombre: 'Archivar pedido', despues_de: 'confirmar' }],
      })
      expect(r.isError, r.texto).toBe(false)
      expect((r.datos as { version: string }).version).not.toBe(v)
      expect(sqlLab(`select count(*) from private.mcp_auditoria where diagram_id='${creado}' and operacion='modificar' and version_anterior is not null`)).toBe('1')
    })

    it('con una versión vieja → conflicto, devuelve el estado actual y no escribe', async () => {
      const antes = sqlLab(`select md5(current_xml) from public.diagrams where id='${creado}'`)
      const r = await llamarTool(app, tokenA, 'modificar_diagrama', {
        diagrama_id: creado, version_esperada: '2020-01-01T00:00:00.000000+00:00',
        operaciones: [{ op: 'renombrar', id: 'confirmar', nombre: 'otro' }],
      })
      expect(r.isError).toBe(true)
      expect(r.texto).toMatch(/Conflicto/)
      expect(r.texto).toMatch(/"estructura"/)
      expect(sqlLab(`select md5(current_xml) from public.diagrams where id='${creado}'`)).toBe(antes)
    })

    it('dos escrituras sobre la misma versión base: una gana, la otra recibe conflicto', async () => {
      const v = await version(creado)
      const op = (nombre: string) => llamarTool(app, tokenA, 'modificar_diagrama', {
        diagrama_id: creado, version_esperada: v, operaciones: [{ op: 'renombrar', id: 'confirmar', nombre }],
      })
      const [x, y] = await Promise.all([op('Confirmar (X)'), op('Confirmar (Y)')])
      const exitos = [x, y].filter((r) => !r.isError)
      const conflictos = [x, y].filter((r) => r.isError && /conflicto/i.test(r.texto ?? ''))
      expect(exitos).toHaveLength(1)
      expect(conflictos).toHaveLength(1)
      // El que ganó es el que está en la base: nada mezclado ni perdido a medias.
      const ganador = exitos[0] === x ? 'Confirmar (X)' : 'Confirmar (Y)'
      expect(sqlLab(`select current_xml like '%${ganador}%' from public.diagrams where id='${creado}'`)).toBe('t')
    })

    it('un viewer no puede modificar y no se escribe nada', async () => {
      const antes = sqlLab(`select updated_at from public.diagrams where id='${C3_VIEWER_B}'`)
      const r = await llamarTool(app, tokenB, 'modificar_diagrama', {
        diagrama_id: C3_VIEWER_B, version_esperada: await version(C3_VIEWER_B, tokenB),
        operaciones: [{ op: 'renombrar', id: 'StartEvent_1', nombre: 'x' }],
      })
      expect(r.isError).toBe(true)
      expect(r.texto).toMatch(/permiso/)
      expect(sqlLab(`select updated_at from public.diagrams where id='${C3_VIEWER_B}'`)).toBe(antes)
    })

    describe('con el diagrama abierto en Flujo', () => {
      let canal: RealtimeChannel
      let cerrar: () => Promise<void>

      beforeAll(async () => {
        // Simula una pestaña del editor: el mismo canal y el mismo track() que useCollab.
        const { sb, userId } = await sesionApp('dev2@local.test')
        await sb.realtime.setAuth()
        canal = sb.channel(`diagram:${C1_EDITOR_B}`, { config: { presence: { key: userId } } })
        await new Promise<void>((ok) => canal.subscribe((s) => { if (s === 'SUBSCRIBED') { void canal.track({ userId, name: 'Dev Segundo', color: '#000' }).then(() => ok()) } }))
        await new Promise((r) => setTimeout(r, 800))
        cerrar = async () => { await sb.removeChannel(canal) }
      })
      afterAll(async () => { await cerrar?.() })

      it('no se modifica en sitio: rechaza y dice quién lo tiene abierto', async () => {
        const antes = sqlLab(`select updated_at from public.diagrams where id='${C1_EDITOR_B}'`)
        const r = await llamarTool(app, tokenA, 'modificar_diagrama', {
          diagrama_id: C1_EDITOR_B, version_esperada: await version(C1_EDITOR_B),
          operaciones: [{ op: 'renombrar', id: 'StartEvent_1', nombre: 'Inicio IA' }],
        })
        expect(r.isError).toBe(true)
        expect(r.texto).toMatch(/abierto en Flujo \(Dev Segundo\)/)
        expect(sqlLab(`select updated_at from public.diagrams where id='${C1_EDITOR_B}'`)).toBe(antes)
      })

      it('con si_esta_abierto="copiar" guarda una copia y deja el original intacto', async () => {
        const antes = sqlLab(`select md5(current_xml) from public.diagrams where id='${C1_EDITOR_B}'`)
        const r = await llamarTool(app, tokenA, 'modificar_diagrama', {
          diagrama_id: C1_EDITOR_B, version_esperada: await version(C1_EDITOR_B), si_esta_abierto: 'copiar',
          operaciones: [{ op: 'renombrar', id: 'StartEvent_1', nombre: 'Inicio IA' }],
        })
        expect(r.isError, r.texto).toBe(false)
        const d = r.datos as { copia: boolean; id: string; nombre: string }
        expect(d.copia).toBe(true)
        expect(d.nombre).toMatch(/\(propuesta IA\)$/)
        expect(sqlLab(`select md5(current_xml) from public.diagrams where id='${C1_EDITOR_B}'`)).toBe(antes)
        expect(sqlLab(`select current_xml like '%Inicio IA%' from public.diagrams where id='${d.id}'`)).toBe('t')
      })
    })
  })

  // ── Límite de ritmo (al final: consume la ventana del minuto de B) ───────
  it('límite de llamadas por minuto', async () => {
    let limitado = false
    for (let i = 0; i < 65 && !limitado; i++) {
      const r = await llamarTool(app, tokenB, 'listar_proyectos')
      limitado = !!r.isError && /límite/.test(r.texto ?? '')
    }
    expect(limitado).toBe(true)
  })
})
