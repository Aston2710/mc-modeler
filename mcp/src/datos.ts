import { createHash } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Acceso a datos del conector. Todo con el cliente DEL USUARIO: RLS decide qué
 * ve y la guardia del conector qué puede escribir. Las columnas de lista
 * nunca incluyen `current_xml` (lección de PLAN-012, `LIST_COLUMNS`).
 */

export type Rol = 'owner' | 'editor' | 'viewer'

export class ErrorDatos extends Error {
  constructor(message: string, public readonly tipo: 'permiso' | 'no_existe' | 'conflicto' | 'limite' | 'tamano' | 'otro') {
    super(message)
    this.name = 'ErrorDatos'
  }
}

/** Traduce los códigos de PostgREST y de la guardia (PTnnn) a algo que la IA entienda. */
export function errorDeBase(e: { code?: string; message?: string } | null | undefined): ErrorDatos {
  const code = e?.code ?? ''
  if (code === 'PT403' || code === '42501') return new ErrorDatos(`la base lo rechaza: ${e?.message ?? 'permiso denegado'}`, 'permiso')
  if (code === 'PT413') return new ErrorDatos(`demasiado grande: ${e?.message}`, 'tamano')
  if (code === 'PT429') return new ErrorDatos('límite de escrituras por minuto alcanzado; espera un minuto', 'limite')
  return new ErrorDatos('error de la base de datos', 'otro')
}

const RANGO = (desplazamiento: number, limite: number) => [desplazamiento, desplazamiento + limite - 1] as const

export async function registrarLlamada(sb: SupabaseClient, limitePorMinuto: number): Promise<void> {
  const { data, error } = await sb.rpc('mcp_registrar_llamada', { p_limite_por_minuto: limitePorMinuto })
  if (error) throw errorDeBase(error)
  if (data !== true) throw new ErrorDatos(`límite de ${limitePorMinuto} llamadas por minuto alcanzado; espera un minuto`, 'limite')
}

export async function listarProyectos(sb: SupabaseClient, userId: string, limite: number, desplazamiento: number) {
  const { data, error } = await sb
    .from('projects')
    .select('id, name, owner_id, updated_at')
    .is('deleted_at', null)
    .order('updated_at', { ascending: false })
    .range(...RANGO(desplazamiento, limite))
  if (error) throw errorDeBase(error)
  const ids = (data ?? []).map((p) => p.id)
  const roles = new Map<string, Rol>()
  if (ids.length) {
    const { data: pc, error: e2 } = await sb.from('project_collaborators').select('project_id, role').eq('user_id', userId).in('project_id', ids)
    if (e2) throw errorDeBase(e2)
    for (const r of pc ?? []) roles.set(r.project_id, r.role as Rol)
  }
  return (data ?? []).map((p) => {
    const rol: Rol = p.owner_id === userId ? 'owner' : roles.get(p.id) ?? 'viewer'
    return { id: p.id, nombre: p.name, actualizado: p.updated_at, mi_rol: rol, puedo_crear_diagramas: rol !== 'viewer' }
  })
}

export async function listarDiagramas(
  sb: SupabaseClient,
  filtro: { proyectoId?: string; buscar?: string },
  limite: number,
  desplazamiento: number
) {
  let q = sb
    .from('diagrams')
    .select('id, name, project_id, parent_diagram_id, updated_at')
    .is('deleted_at', null)
    .order('updated_at', { ascending: false })
    .range(...RANGO(desplazamiento, limite))
  if (filtro.proyectoId) q = q.eq('project_id', filtro.proyectoId)
  if (filtro.buscar) q = q.ilike('name', `%${filtro.buscar.replace(/[%_\\]/g, (c) => `\\${c}`)}%`)
  const { data, error } = await q
  if (error) throw errorDeBase(error)
  return (data ?? []).map((d) => ({
    id: d.id,
    nombre: d.name,
    proyecto_id: d.project_id,
    es_subdiagrama: !!d.parent_diagram_id,
    version: d.updated_at,
  }))
}

export interface FilaDiagrama {
  id: string
  name: string
  owner_id: string
  project_id: string | null
  current_xml: string
  updated_at: string
}

export async function leerDiagrama(sb: SupabaseClient, id: string): Promise<FilaDiagrama> {
  const { data, error } = await sb
    .from('diagrams')
    .select('id, name, owner_id, project_id, current_xml, updated_at, deleted_at')
    .eq('id', id)
    .maybeSingle()
  if (error) throw errorDeBase(error)
  // Invisible por RLS e inexistente dan lo mismo: no se revela cuál de los dos.
  if (!data || data.deleted_at) throw new ErrorDatos(`no existe el diagrama ${id} o no tienes acceso`, 'no_existe')
  return data as FilaDiagrama
}

/** Rol efectivo: el más permisivo entre el directo y el heredado del proyecto. */
export async function rolEnDiagrama(sb: SupabaseClient, userId: string, d: Pick<FilaDiagrama, 'id' | 'owner_id' | 'project_id'>): Promise<Rol> {
  if (d.owner_id === userId) return 'owner'
  const roles: Rol[] = []
  const { data: dc } = await sb.from('diagram_collaborators').select('role').eq('diagram_id', d.id).eq('user_id', userId).maybeSingle()
  if (dc?.role) roles.push(dc.role as Rol)
  if (d.project_id) {
    const { data: p } = await sb.from('projects').select('owner_id').eq('id', d.project_id).maybeSingle()
    if (p?.owner_id === userId) roles.push('owner')
    const { data: pc } = await sb.from('project_collaborators').select('role').eq('project_id', d.project_id).eq('user_id', userId).maybeSingle()
    if (pc?.role) roles.push(pc.role as Rol)
  }
  if (roles.includes('owner')) return 'owner'
  if (roles.includes('editor')) return 'editor'
  return 'viewer'
}

export async function puedeEditarProyecto(sb: SupabaseClient, userId: string, proyectoId: string): Promise<boolean> {
  const { data: p, error } = await sb.from('projects').select('owner_id, deleted_at').eq('id', proyectoId).maybeSingle()
  if (error) throw errorDeBase(error)
  if (!p || p.deleted_at) return false
  if (p.owner_id === userId) return true
  const { data: pc } = await sb.from('project_collaborators').select('role').eq('project_id', proyectoId).eq('user_id', userId).maybeSingle()
  return pc?.role === 'owner' || pc?.role === 'editor'
}

/**
 * UUID v5 (RFC 4122 §4.3) del usuario + clave de idempotencia: el mismo
 * reintento produce el mismo id, y la clave primaria impide el duplicado.
 */
const NAMESPACE_MCP = '6f1c2a3e-5b7d-4e8f-9a0b-1c2d3e4f5a6b'
export function idDeterminista(userId: string, clave: string): string {
  const ns = Buffer.from(NAMESPACE_MCP.replace(/-/g, ''), 'hex')
  const hash = createHash('sha1').update(ns).update(`${userId}:${clave}`).digest()
  hash[6] = (hash[6] & 0x0f) | 0x50
  hash[8] = (hash[8] & 0x3f) | 0x80
  const h = hash.subarray(0, 16).toString('hex')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}

export async function insertarDiagrama(
  sb: SupabaseClient,
  fila: { id: string; owner_id: string; name: string; project_id: string | null; current_xml: string; element_count: number }
): Promise<{ version: string; yaExistia: boolean }> {
  const { data, error } = await sb
    .from('diagrams')
    .insert({ ...fila, schema_version: 1 })
    .select('updated_at')
    .single()
  if (!error) return { version: data.updated_at, yaExistia: false }
  if (error.code === '23505') {
    // Reintento con la misma clave: el diagrama ya está; se devuelve, no se duplica.
    const existente = await leerDiagrama(sb, fila.id)
    return { version: existente.updated_at, yaExistia: true }
  }
  throw errorDeBase(error)
}

/**
 * UPDATE con CAS, la misma forma que `SupabaseRepository.save`:
 * `WHERE id = $1 AND updated_at = $esperada`. Nunca un UPDATE ciego.
 *
 * 0 filas puede ser conflicto (alguien guardó antes) o falta de permiso (RLS
 * de un viewer también da 0 filas). Se distinguen releyendo la versión.
 */
export async function actualizarConCas(
  sb: SupabaseClient,
  id: string,
  versionEsperada: string,
  cambios: { current_xml: string; element_count: number }
): Promise<string> {
  const { data, error } = await sb
    .from('diagrams')
    .update(cambios)
    .eq('id', id)
    .eq('updated_at', versionEsperada)
    .select('updated_at')
    .maybeSingle()
  if (error) throw errorDeBase(error)
  if (data) return data.updated_at
  const actual = await leerDiagrama(sb, id)
  if (!mismaVersion(actual.updated_at, versionEsperada)) {
    throw new ErrorDatos(`conflicto: el diagrama cambió (versión actual ${actual.updated_at}); vuelve a leerlo`, 'conflicto')
  }
  throw new ErrorDatos('no tienes permiso de edición sobre este diagrama', 'permiso')
}

/**
 * `updated_at` es un timestamptz con microsegundos y puede llegar con distinta
 * forma textual (offset `+00:00` o `Z`, ceros finales recortados). Se compara el
 * instante exacto en microsegundos; `Date.parse` solo llega al milisegundo.
 */
export function mismaVersion(a: string, b: string): boolean {
  const ma = microsegundos(a)
  const mb = microsegundos(b)
  return ma !== null && mb !== null ? ma === mb : a === b
}

function microsegundos(s: string): bigint | null {
  const m = /^(\d{4}-\d\d-\d\d[T ]\d\d:\d\d:\d\d)(?:\.(\d{1,6}))?(Z|[+-]\d\d(?::?\d\d)?)?$/.exec(s.trim())
  if (!m) return null
  const ms = Date.parse(`${m[1].replace(' ', 'T')}${m[3] ?? 'Z'}`)
  if (!Number.isFinite(ms)) return null
  return BigInt(ms) * 1000n + BigInt((m[2] ?? '').padEnd(6, '0'))
}
