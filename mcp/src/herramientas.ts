import { createHash } from 'node:crypto'
import { z } from 'zod'
import type { McpServer, ServerContext } from '@modelcontextprotocol/server'
import { construirXml, ErrorModelo } from '../../src/domain/bpmn-model/construirXml'
import { editarXml, ErrorEdicion, type Operacion } from '../../src/domain/bpmn-model/editar'
import { simplificar } from '../../src/domain/bpmn-model/simplificar'
import { validarXml } from '../../src/domain/bpmn-model/validarXml'
import type { ModeloSemantico } from '../../src/domain/bpmn-model/modelo'
import { LIMITES_HTTP, type Config } from './config'
import {
  ErrorDatos,
  actualizarConCas,
  idDeterminista,
  insertarDiagrama,
  leerDiagrama,
  listarDiagramas,
  listarProyectos,
  mismaVersion,
  puedeEditarProyecto,
  registrarLlamada,
  rolEnDiagrama,
} from './datos'
import { esquemaModelo, esquemaOperacion } from './esquemas'
import { comprobarPresencia } from './presencia'
import { clienteDelUsuario, usuarioDe } from './supabase'

/**
 * Las tools del conector. Nombres y descripciones en español: es lo que lee la
 * IA para decidir qué usar, así que dicen CUÁNDO usarlas y qué devuelven.
 *
 * Ninguna es destructiva sobre el espacio de trabajo: no se borran ni se
 * mueven diagramas ni proyectos (D5). La base lo impide además para el token
 * del conector, por si alguien lo usa sin pasar por aquí.
 */

type Resultado = { content: { type: 'text'; text: string }[]; isError?: boolean }

const ok = (datos: unknown): Resultado => ({ content: [{ type: 'text', text: JSON.stringify(datos, null, 2) }] })
const fallo = (mensaje: string, datos?: unknown): Resultado => ({
  isError: true,
  content: [{ type: 'text', text: datos === undefined ? mensaje : `${mensaje}\n${JSON.stringify(datos, null, 2)}` }],
})

function conPlazo<T>(p: Promise<T>): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, rechazar) => setTimeout(() => rechazar(new ErrorDatos('la operación tardó demasiado', 'otro')), LIMITES_HTTP.TIMEOUT_TOOL_MS)),
  ])
}

export function registrarHerramientas(server: McpServer, config: Config): void {
  const url = (id: string) => `${config.appUrl}/?d=${id}`

  /** Envoltorio común: autenticación, límite de llamadas, plazo y errores sin filtrar internals. */
  const tool = <A>(fn: (args: A, u: ReturnType<typeof contexto>) => Promise<Resultado>) =>
    async (args: A, ctx: ServerContext): Promise<Resultado> => {
      try {
        const u = contexto(ctx)
        await registrarLlamada(u.sb, LIMITES_HTTP.LLAMADAS_POR_MINUTO)
        return await conPlazo(fn(args, u))
      } catch (e) {
        if (e instanceof ErrorModelo) return fallo('El modelo no es válido. No se guardó nada.', { errores: e.errores })
        if (e instanceof ErrorEdicion || e instanceof ErrorDatos) return fallo(`${e.message}. No se guardó nada.`)
        return fallo('Error interno del conector. No se guardó nada.')
      }
    }

  const contexto = (ctx: ServerContext) => {
    const u = usuarioDe(ctx.http?.authInfo)
    return { ...u, sb: clienteDelUsuario(config, u.token) }
  }

  // ── listar_proyectos ──────────────────────────────────────────────────────
  server.registerTool('listar_proyectos', {
    title: 'Listar proyectos',
    description:
      'Lista los proyectos de Flujo a los que tienes acceso, con tu rol en cada uno. ' +
      'Úsala primero para saber dónde crear un diagrama: solo se crean en proyectos donde puedo_crear_diagramas es true.',
    inputSchema: z.object({
      limite: z.number().int().min(1).max(50).default(20),
      desplazamiento: z.number().int().min(0).max(10_000).default(0).describe('Para paginar: cuántos saltar'),
    }),
    annotations: { readOnlyHint: true, openWorldHint: false },
  }, tool(async ({ limite, desplazamiento }: { limite: number; desplazamiento: number }, u) =>
    ok({ proyectos: await listarProyectos(u.sb, u.userId, limite, desplazamiento), limite, desplazamiento })))

  // ── listar_diagramas ──────────────────────────────────────────────────────
  server.registerTool('listar_diagramas', {
    title: 'Listar diagramas',
    description:
      'Lista diagramas BPMN a los que tienes acceso, del más reciente al más antiguo. Filtra por proyecto o por texto en el nombre. ' +
      'Devuelve id, nombre y versión; para ver el contenido usa obtener_diagrama.',
    inputSchema: z.object({
      proyecto_id: z.guid().optional(),
      buscar: z.string().max(100).optional().describe('Texto contenido en el nombre'),
      limite: z.number().int().min(1).max(50).default(20),
      desplazamiento: z.number().int().min(0).max(10_000).default(0),
    }),
    annotations: { readOnlyHint: true, openWorldHint: false },
  }, tool(async (a: { proyecto_id?: string; buscar?: string; limite: number; desplazamiento: number }, u) => {
    const diagramas = await listarDiagramas(u.sb, { proyectoId: a.proyecto_id, buscar: a.buscar }, a.limite, a.desplazamiento)
    return ok({ diagramas: diagramas.map((d) => ({ ...d, url: url(d.id) })), limite: a.limite, desplazamiento: a.desplazamiento })
  }))

  // ── obtener_diagrama ──────────────────────────────────────────────────────
  server.registerTool('obtener_diagrama', {
    title: 'Obtener diagrama',
    description:
      'Devuelve la estructura de un diagrama: pools, carriles, nodos (con tipo, nombre e id), flujos y mensajes. ' +
      'No devuelve el XML. Incluye "version": pásala tal cual como version_esperada a modificar_diagrama. ' +
      'Los elementos sin equivalente (anotaciones, grupos…) aparecen en "otros".',
    inputSchema: z.object({ diagrama_id: z.guid() }),
    annotations: { readOnlyHint: true, openWorldHint: false },
  }, tool(async ({ diagrama_id }: { diagrama_id: string }, u) => {
    const d = await leerDiagrama(u.sb, diagrama_id)
    const rol = await rolEnDiagrama(u.sb, u.userId, d)
    return ok({
      id: d.id,
      nombre: d.name,
      proyecto_id: d.project_id,
      version: d.updated_at,
      mi_rol: rol,
      puedo_editar: rol !== 'viewer',
      url: url(d.id),
      estructura: await simplificar(d.current_xml),
    })
  }))

  // ── validar_diagrama ──────────────────────────────────────────────────────
  server.registerTool('validar_diagrama', {
    title: 'Validar diagrama',
    description:
      'Revisa un diagrama guardado (diagrama_id) o un modelo sin guardar (modelo) con la misma validación que el botón Validar de Flujo: ' +
      'procesos sin inicio o fin, elementos desconectados. Solo AVISA: nunca impide guardar.',
    inputSchema: z.object({
      diagrama_id: z.guid().optional(),
      modelo: esquemaModelo.optional().describe('Un modelo como el de crear_diagrama, para revisarlo antes de crearlo'),
    }),
    annotations: { readOnlyHint: true, openWorldHint: false },
  }, tool(async (a: { diagrama_id?: string; modelo?: ModeloSemantico }, u) => {
    if (!a.diagrama_id === !a.modelo) return fallo('Indica diagrama_id o modelo (uno de los dos).')
    const xml = a.diagrama_id ? (await leerDiagrama(u.sb, a.diagrama_id)).current_xml : (await construirXml(a.modelo!)).xml
    return ok(await validarXml(xml))
  }))

  // ── crear_diagrama ────────────────────────────────────────────────────────
  server.registerTool('crear_diagrama', {
    title: 'Crear diagrama',
    description:
      'Crea un diagrama BPMN nuevo a partir de un modelo SIN coordenadas: pools, carriles, nodos, flujos y mensajes. ' +
      'El conector calcula el layout y lo guarda en el proyecto indicado; al abrir Flujo el diagrama ya está. ' +
      'Reglas: ids únicos; cada flujo une nodos del mismo pool y nivel; entre pools se usan "mensajes"; ' +
      'si un pool tiene carriles, cada nodo de primer nivel indica su carril; un evento_borde lleva adjunto_a. ' +
      'Reintentar con los mismos datos (o la misma clave_idempotencia) devuelve el mismo diagrama, no crea otro.',
    inputSchema: z.object({
      nombre: z.string().min(1).max(200),
      proyecto_id: z.guid().optional().describe('Proyecto donde crearlo (ver listar_proyectos). Sin él, va a tus diagramas sueltos'),
      modelo: esquemaModelo,
      clave_idempotencia: z.string().min(8).max(128).optional()
        .describe('Opcional. Misma clave = mismo diagrama. Si falta, se deriva del contenido'),
    }),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, tool(async (a: { nombre: string; proyecto_id?: string; modelo: ModeloSemantico; clave_idempotencia?: string }, u) => {
    if (a.proyecto_id && !(await puedeEditarProyecto(u.sb, u.userId, a.proyecto_id))) {
      return fallo('No tienes permiso para crear diagramas en ese proyecto (o no existe). No se guardó nada.')
    }
    const { xml, elementos } = await construirXml(a.modelo)
    const clave = a.clave_idempotencia ??
      createHash('sha256').update(JSON.stringify([a.nombre, a.proyecto_id ?? null, a.modelo])).digest('hex')
    const id = idDeterminista(u.userId, clave)
    const { version, yaExistia } = await insertarDiagrama(u.sb, {
      id, owner_id: u.userId, name: a.nombre, project_id: a.proyecto_id ?? null, current_xml: xml, element_count: elementos,
    })
    const { resultados } = await validarXml(xml)
    return ok({
      id,
      nombre: a.nombre,
      version,
      url: url(id),
      ya_existia: yaExistia,
      elementos,
      avisos: resultados,
      nota: 'La miniatura de la portada aparece cuando alguien edita el diagrama en Flujo.',
    })
  }))

  // ── modificar_diagrama (etapa 2) ──────────────────────────────────────────
  if (!config.habilitarModificar) return

  server.registerTool('modificar_diagrama', {
    title: 'Modificar diagrama',
    description:
      'Aplica operaciones a un diagrama existente: agregar_nodo, conectar, renombrar, eliminar (un nodo o un flujo; nunca pools, carriles ni el diagrama). ' +
      'Todas se aplican o ninguna. El resto del diagrama no se toca. ' +
      'Requiere version_esperada (la de obtener_diagrama): si alguien guardó después, falla con "conflicto" y no escribe nada. ' +
      'Si alguien tiene el diagrama abierto en Flujo, no se modifica en sitio para no pisar su trabajo: ' +
      'con si_esta_abierto="copiar" se guarda el resultado como un diagrama nuevo en el mismo proyecto.',
    inputSchema: z.object({
      diagrama_id: z.guid(),
      version_esperada: z.string().min(10).max(40),
      operaciones: z.array(esquemaOperacion).min(1).max(50),
      si_esta_abierto: z.enum(['fallar', 'copiar']).default('fallar'),
    }),
    // destructiveHint: true porque "eliminar" quita elementos DENTRO del
    // diagrama. Así el cliente pide confirmación antes de ejecutarla. No borra
    // diagramas ni proyectos: eso no existe en el conector.
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
  }, tool(async (a: { diagrama_id: string; version_esperada: string; operaciones: Operacion[]; si_esta_abierto: 'fallar' | 'copiar' }, u) => {
    const d = await leerDiagrama(u.sb, a.diagrama_id)
    if (!mismaVersion(d.updated_at, a.version_esperada)) {
      return fallo('Conflicto: el diagrama cambió desde que lo leíste. No se guardó nada. Esta es la versión actual:', {
        version: d.updated_at, estructura: await simplificar(d.current_xml),
      })
    }
    if ((await rolEnDiagrama(u.sb, u.userId, d)) === 'viewer') return fallo('No tienes permiso de edición sobre este diagrama. No se guardó nada.')

    // Validar las operaciones ANTES de mirar la presencia: un error de entrada
    // se devuelve igual esté o no abierto.
    const editado = await editarXml(d.current_xml, a.operaciones)

    const presencia = await comprobarPresencia(u.sb, d.id)
    if (presencia.estado !== 'libre') {
      const quien = presencia.estado === 'ocupado'
        ? presencia.presentes.map((p) => (p.userId === u.userId ? 'tú mismo' : p.name)).join(', ')
        : 'no se pudo comprobar'
      if (a.si_esta_abierto !== 'copiar') {
        return fallo(
          `El diagrama está abierto en Flujo (${quien}). Para no pisar ese trabajo no se modifica en sitio. ` +
          'Pide que lo cierren, o repite con si_esta_abierto="copiar" para guardar el resultado como diagrama nuevo. No se guardó nada.'
        )
      }
      if (d.project_id && !(await puedeEditarProyecto(u.sb, u.userId, d.project_id))) {
        return fallo('El diagrama está abierto y no tienes permiso para crear una copia en su proyecto. No se guardó nada.')
      }
      const nombre = `${d.name} (propuesta IA)`.slice(0, 200)
      const id = idDeterminista(u.userId, `copia:${d.id}:${d.updated_at}:${createHash('sha256').update(JSON.stringify(a.operaciones)).digest('hex')}`)
      const { version, yaExistia } = await insertarDiagrama(u.sb, {
        id, owner_id: u.userId, name: nombre, project_id: d.project_id, current_xml: editado.xml, element_count: editado.elementos,
      })
      return ok({ copia: true, motivo: `abierto por ${quien}`, id, nombre, version, url: url(id), ya_existia: yaExistia, cambios: editado.cambios })
    }

    const version = await actualizarConCas(u.sb, d.id, a.version_esperada, {
      current_xml: editado.xml, element_count: editado.elementos,
    })
    const { resultados } = await validarXml(editado.xml)
    return ok({ id: d.id, version, url: url(d.id), cambios: editado.cambios, avisos: resultados })
  }))
}
