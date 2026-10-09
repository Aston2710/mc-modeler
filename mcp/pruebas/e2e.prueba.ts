import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright-core'
import { crearApp } from '../src/app'
import { leerConfig } from '../src/config'
import { actualizarConCas, leerDiagrama } from '../src/datos'
import { clienteDelUsuario } from '../src/supabase'
import { editarXml } from '../../src/domain/bpmn-model/editar'
import {
  MODELO_COMPUERTAS,
  MODELO_POOLS_CARRILES,
  MODELO_SIMPLE,
  MODELO_SUBPROCESO,
} from '../../src/domain/bpmn-model/fixtures'
import { ENV, laboratorioArriba, llamarTool, sqlLab, tokenConector } from './lab'

/**
 * Prueba de extremo a extremo con la APP REAL del laboratorio en un navegador
 * (Edge o Chrome instalados; playwright-core no descarga ninguno).
 *
 * Requiere: `npm run lab` (o `vite --mode lab`) en http://localhost:7654 y
 * MCP_E2E=1. Deja capturas en mcp/pruebas/capturas/ para revisarlas a ojo.
 */
const APP = 'http://localhost:7654'
const PROYECTO_A = 'aaaaaaaa-0000-0000-0000-000000000001'
const C1 = 'cccccccc-0000-0000-0000-000000000001' // A dueño, B editor
const CAPTURAS = new URL('./capturas/', import.meta.url)
/** Ruta de archivo real (fileURLToPath: con `.pathname` los espacios saldrían como %20). */
const captura = (nombre: string) => fileURLToPath(new URL(nombre, CAPTURAS))

const activo = process.env.MCP_E2E === '1' && (await laboratorioArriba())

async function appArriba(): Promise<boolean> {
  try { return (await fetch(APP)).ok } catch { return false }
}

describe.skipIf(!activo)('extremo a extremo con la app del laboratorio', async () => {
  const conApp = await appArriba()
  const app = crearApp(leerConfig({ ...ENV, MCP_HABILITAR_MODIFICAR: '1', MCP_PUBLIC_URL: 'http://localhost:7655' }))
  let navegador: Browser
  let tokenA = ''
  const sufijo = Date.now().toString(36)
  const creados: Record<string, string> = {}

  beforeAll(async () => {
    if (!conApp) throw new Error(`la app del laboratorio no responde en ${APP}`)
    mkdirSync(CAPTURAS, { recursive: true })
    sqlLab('delete from private.mcp_ventanas; delete from private.mcp_auditoria')
    tokenA = await tokenConector('dev@local.test')
    navegador = await chromium.launch({ channel: 'msedge', headless: true }).catch(() => chromium.launch({ channel: 'chrome', headless: true }))
  })
  afterAll(async () => { await navegador?.close() })

  /** Contexto de navegador con sesión del usuario indicado (vía la barra del laboratorio). */
  async function sesion(usuario: 'Dev Local' | 'Dev Segundo'): Promise<{ ctx: BrowserContext; page: Page; errores: string[] }> {
    const ctx = await navegador.newContext({ viewport: { width: 1600, height: 1000 }, acceptDownloads: true })
    const page = await ctx.newPage()
    const errores: string[] = []
    page.on('pageerror', (e) => errores.push(String(e)))
    page.on('console', (m) => { if (m.type() === 'error') errores.push(m.text()) })
    await page.goto(APP)
    await page.getByRole('button', { name: /Dev Local|Dev Segundo/ }).waitFor({ timeout: 30_000 })
    if (usuario === 'Dev Segundo') {
      await page.getByRole('button', { name: /Dev Local/ }).click()
      await page.getByRole('button', { name: /Dev Segundo dev2@local\.test/ }).click()
      await page.getByRole('button', { name: /^Dev Segundo/ }).waitFor({ timeout: 30_000 })
    }
    return { ctx, page, errores }
  }

  async function abrir(page: Page, id: string, unNodo: string) {
    await page.goto(`${APP}/?d=${id}`)
    try {
      await page.locator(`.djs-element[data-element-id="${unNodo}"]`).first().waitFor({ timeout: 30_000 })
    } catch (e) {
      await page.screenshot({ path: captura(`fallo-${id.slice(0, 8)}-${Date.now()}.png`) })
      throw e
    }
    await page.waitForTimeout(1500) // normalizer de conexiones + render
  }

  it.each([
    ['simple', MODELO_SIMPLE, 'revisar'],
    ['compuertas', MODELO_COMPUERTAS, 'valido'],
    ['pools-carriles', MODELO_POOLS_CARRILES, 'preparar'],
    ['subproceso', MODELO_SUBPROCESO, 'verificar'],
  ] as const)('el diagrama "%s" creado por el MCP se abre en la app sin errores', async (nombre, modelo, nodo) => {
    const r = await llamarTool(app, tokenA, 'crear_diagrama', { nombre: `E2E ${nombre} ${sufijo}`, proyecto_id: PROYECTO_A, modelo })
    expect(r.isError, r.texto).toBe(false)
    const id = (r.datos as { id: string }).id
    creados[nombre] = id
    const { ctx, page, errores } = await sesion('Dev Local')
    try {
      await abrir(page, id, nodo)
      await page.screenshot({ path: captura(`${nombre}.png`) })
      expect(errores.filter((e) => !/getContext|favicon|ResizeObserver/.test(e))).toEqual([])
      // Ningún conflicto ni aviso de guardado al abrir.
      expect(await page.getByText(/cambió en el servidor/).count()).toBe(0)
    } finally {
      await ctx.close()
    }
  })

  it('un diagrama creado por el MCP se exporta (.bpmn, PNG, SVG, PDF), se edita y se guarda desde la UI', async () => {
    const id = creados['pools-carriles']
    const { ctx, page, errores } = await sesion('Dev Local')
    try {
      await abrir(page, id, 'preparar')
      const formatos: [string, RegExp, number][] = [
        ['BPMN 2.0', /\.bpmn$/, 2_000],
        ['PNG', /\.png$/, 5_000],
        ['SVG', /\.svg$/, 5_000],
        ['PDF', /\.pdf$/, 5_000],
      ]
      for (const [formato, extension, minimo] of formatos) {
        await page.getByRole('button', { name: /^Archivo/ }).click()
        await page.getByText(/^Exportar…$/).click()
        await page.locator('.exp__fmt', { hasText: formato }).first().click()
        const [descarga] = await Promise.all([
          page.waitForEvent('download', { timeout: 30_000 }),
          page.locator('.modal-footer .btn-primary, button.btn-primary', { hasText: /^Exportar$/ }).last().click(),
        ])
        expect(descarga.suggestedFilename(), formato).toMatch(extension)
        const ruta = captura(`export-${descarga.suggestedFilename()}`)
        await descarga.saveAs(ruta)
        const { statSync, readFileSync } = await import('node:fs')
        expect(statSync(ruta).size, formato).toBeGreaterThan(minimo)
        if (formato === 'BPMN 2.0') {
          const xml = readFileSync(ruta, 'utf8')
          for (const nodo of ['preparar', 'plazo', 'confirmar', 'Comercial', 'Cliente']) expect(xml, nodo).toContain(`"${nodo}"`)
        }
        await page.keyboard.press('Escape').catch(() => undefined)
      }

      // Editar (mover una tarea) y guardar con el botón.
      const antes = sqlLab(`select updated_at from public.diagrams where id='${id}'`)
      await page.locator('.djs-element[data-element-id="escalar"]').first().click()
      await page.keyboard.press('ArrowRight')
      await page.getByRole('button', { name: /^Guardar$/ }).click()
      await page.waitForTimeout(3000)
      expect(sqlLab(`select updated_at from public.diagrams where id='${id}'`)).not.toBe(antes)
      for (const nodo of ['preparar', 'plazo', 'confirmar', 'esperar', 'Operaciones']) {
        expect(sqlLab(`select current_xml like '%"${nodo}"%' from public.diagrams where id='${id}'`), nodo).toBe('t')
      }
      expect(await page.getByText(/cambió en el servidor/).count()).toBe(0)
      expect(errores.filter((e) => !/getContext|favicon|ResizeObserver/.test(e))).toEqual([])
    } finally {
      await ctx.close()
    }
  }, 120_000)

  it('con el diagrama abierto en dos navegadores el MCP no lo modifica; cerrados, sí, y se ve al reabrir', async () => {
    // B primero: para pasar a dev2, la barra del laboratorio hace signOut() de
    // dev, que por defecto es GLOBAL y revocaría la sesión de A si ya existiera.
    const b = await sesion('Dev Segundo')
    const a = await sesion('Dev Local')
    try {
      await abrir(b.page, C1, 'StartEvent_1')
      await abrir(a.page, C1, 'StartEvent_1')
      await a.page.waitForTimeout(2000) // presencia sincronizada
      const v = sqlLab(`select updated_at from public.diagrams where id='${C1}'`)
      const version = ((await llamarTool(app, tokenA, 'obtener_diagrama', { diagrama_id: C1 })).datos as { version: string }).version
      const r = await llamarTool(app, tokenA, 'modificar_diagrama', {
        diagrama_id: C1, version_esperada: version, operaciones: [{ op: 'renombrar', id: 'StartEvent_1', nombre: 'Inicio E2E' }],
      })
      expect(r.isError).toBe(true)
      expect(r.texto).toMatch(/abierto en Flujo/)
      expect(r.texto).toMatch(/Dev Segundo/)
      expect(sqlLab(`select updated_at from public.diagrams where id='${C1}'`)).toBe(v)
    } finally {
      await a.ctx.close()
      await b.ctx.close()
    }

  })

  it('cerrados los navegadores, el MCP sí modifica y el cambio se ve al reabrir, sin errores', async () => {
    await new Promise((r) => setTimeout(r, 2500)) // la presencia tarda en vaciarse
    const version = ((await llamarTool(app, tokenA, 'obtener_diagrama', { diagrama_id: C1 })).datos as { version: string }).version
    const r = await llamarTool(app, tokenA, 'modificar_diagrama', {
      diagrama_id: C1, version_esperada: version, operaciones: [{ op: 'renombrar', id: 'StartEvent_1', nombre: 'Inicio E2E' }],
    })
    expect(r.isError, r.texto).toBe(false)

    const b = await sesion('Dev Segundo')
    try {
      await abrir(b.page, C1, 'StartEvent_1')
      await b.page.locator('.djs-container').getByText('Inicio E2E').first().waitFor({ timeout: 15_000 })
      expect(b.errores.filter((e) => !/getContext|favicon|ResizeObserver/.test(e))).toEqual([])
    } finally {
      await b.ctx.close()
    }
  })

  it('pantalla de consentimiento: muestra el cliente y los permisos, y "Permitir" devuelve un código canjeable', async () => {
    // La app en el site_url del laboratorio (5175), apuntando al laboratorio por variables de shell.
    const SITE = 'http://localhost:5175'
    if (!(await fetch(SITE).then((r) => r.ok).catch(() => false))) {
      throw new Error(`arranca la app en ${SITE} con VITE_SUPABASE_URL/ANON_KEY del laboratorio`)
    }
    const { createHash, randomBytes } = await import('node:crypto')
    const { sesionApp, AUTH } = await import('./lab')
    const redirect = 'http://localhost:7799/callback'
    const reg = await fetch(`${AUTH}/oauth/clients/register`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ client_name: 'Claude (prueba)', redirect_uris: [redirect], token_endpoint_auth_method: 'none', grant_types: ['authorization_code'], response_types: ['code'] }),
    }).then((r) => r.json()) as { client_id: string }
    const verifier = randomBytes(32).toString('base64url')
    const challenge = createHash('sha256').update(verifier).digest('base64url')
    const q = new URLSearchParams({ response_type: 'code', client_id: reg.client_id, redirect_uri: redirect, code_challenge: challenge, code_challenge_method: 'S256', state: 'e2e' })
    const consent = (await fetch(`${AUTH}/oauth/authorize?${q}`, { redirect: 'manual' })).headers.get('location')!

    // Sesión de dev en el navegador (lo mismo que deja el enlace mágico).
    const { sb } = await sesionApp('dev@local.test')
    const { data } = await sb.auth.getSession()
    const ctx = await navegador.newContext()
    await ctx.addInitScript((s) => localStorage.setItem('sb-127-auth-token', s), JSON.stringify(data.session))
    const page = await ctx.newPage()
    try {
      await page.goto(consent)
      await page.getByText(/Claude \(prueba\) quiere trabajar con tus diagramas/).waitFor({ timeout: 20_000 })
      await page.getByText(/Borrar ni mover diagramas o proyectos/).waitFor()
      await page.screenshot({ path: captura('consentimiento.png') })
      const [salida] = await Promise.all([
        page.waitForRequest((r) => r.url().startsWith(redirect), { timeout: 20_000 }),
        page.getByRole('button', { name: /^Permitir$/ }).click(),
      ])
      const code = new URL(salida.url()).searchParams.get('code')
      expect(code).toBeTruthy()
      const tok = await fetch(`${AUTH}/oauth/token`, {
        method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ grant_type: 'authorization_code', code: code!, redirect_uri: redirect, client_id: reg.client_id, code_verifier: verifier }),
      }).then((r) => r.json()) as { access_token?: string }
      expect(tok.access_token).toBeTruthy()
      // Y ese token funciona contra el MCP.
      const r = await llamarTool(app, tok.access_token!, 'listar_proyectos')
      expect(r.isError, r.texto).toBe(false)
    } finally {
      await ctx.close()
    }
  }, 90_000)

  it('regresión: la colaboración en vivo sigue propagando ediciones entre dos navegadores', async () => {
    const b = await sesion('Dev Segundo')
    const a = await sesion('Dev Local')
    try {
      await abrir(b.page, C1, 'StartEvent_1')
      await abrir(a.page, C1, 'StartEvent_1')
      await a.page.waitForTimeout(3000) // binding Yjs activo en los dos
      const xEnB = async () => (await b.page.locator('.djs-element[data-element-id="StartEvent_1"]').first().boundingBox())!.x
      const antes = await xEnB()
      await a.page.locator('.djs-element[data-element-id="StartEvent_1"]').first().click()
      for (let i = 0; i < 6; i++) await a.page.keyboard.press('ArrowRight')
      await b.page.waitForTimeout(3000)
      expect(await xEnB()).toBeGreaterThan(antes + 10)
    } finally {
      await a.ctx.close()
      await b.ctx.close()
    }
  }, 90_000)

  it('regresión: el modo local (IndexedDB, sin Supabase) funciona y no ofrece conector', async () => {
    const LOCAL = 'http://localhost:5176'
    const ok = await fetch(LOCAL).then((r) => r.ok).catch(() => false)
    if (!ok) throw new Error(`arranca la app sin VITE_SUPABASE_* en ${LOCAL} (npx vite --port 5176)`)
    const ctx = await navegador.newContext({ viewport: { width: 1600, height: 1000 } })
    const page = await ctx.newPage()
    const errores: string[] = []
    page.on('pageerror', (e) => errores.push(String(e)))
    try {
      await page.goto(LOCAL)
      await page.getByText(/^Crear diagrama$/).first().click()
      await page.getByPlaceholder(/Nombre del diagrama/).fill('Local sin nube')
      await page.getByRole('button', { name: /^Crear diagrama$/ }).last().click()
      await page.locator('.djs-element[data-element-id="StartEvent_1"]').first().waitFor({ timeout: 20_000 })
      await page.getByRole('button', { name: /^Guardar$/ }).click()
      await page.waitForTimeout(1500)
      await page.reload()
      await page.getByText('Local sin nube').first().waitFor({ timeout: 20_000 })
      await page.goto(`${LOCAL}/oauth/consent?authorization_id=x`)
      await page.getByText(/modo local y no admite conectores/).waitFor({ timeout: 10_000 })
      expect(errores.filter((e) => !/getContext|ResizeObserver/.test(e))).toEqual([])
    } finally {
      await ctx.close()
    }
  }, 90_000)

  it('opción C en la app real: un cambio externo con el usuario solo NO se pisa al autoguardar', async () => {
    const id = creados.simple
    const a = await sesion('Dev Local')
    try {
      await abrir(a.page, id, 'revisar')
      // Escritor externo con CAS (lo que haría el conector si la compuerta no
      // lo viera, p. ej. una pestaña de fondo): renombra "registrar".
      const sb = clienteDelUsuario(leerConfig(ENV), tokenA)
      const d = await leerDiagrama(sb, id)
      const { xml, elementos } = await editarXml(d.current_xml, [{ op: 'renombrar', id: 'registrar', nombre: 'CAMBIO EXTERNO' }])
      await actualizarConCas(sb, id, d.updated_at, { current_xml: xml, element_count: elementos })

      // El usuario, que no se ha enterado, edita: mueve una tarea con el teclado.
      await a.page.locator('.djs-element[data-element-id="revisar"]').first().click()
      await a.page.keyboard.press('ArrowDown')
      await a.page.keyboard.press('ArrowDown')

      // Autoguardado (20 s + hasta 5 s de jitter): choca, está solo → pregunta.
      await a.page.getByText(/se modificó fuera de esta sesión/).waitFor({ timeout: 45_000 })
      await a.page.screenshot({ path: captura('conflicto-externo.png') })
      // Y el cambio externo sigue en la base: no se pisó.
      expect(sqlLab(`select current_xml like '%CAMBIO EXTERNO%' from public.diagrams where id='${id}'`)).toBe('t')
      // Pasado otro ciclo de autoguardado, sigue sin pisarse.
      await a.page.waitForTimeout(27_000)
      expect(sqlLab(`select current_xml like '%CAMBIO EXTERNO%' from public.diagrams where id='${id}'`)).toBe('t')
    } finally {
      await a.ctx.close()
    }
  }, 120_000)
})
