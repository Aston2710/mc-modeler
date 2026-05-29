import { supabase } from '@/lib/supabase'
import type { Collaborator, CollaboratorRole } from '@/domain/types'

function sb() {
  if (!supabase) throw new Error('Supabase no configurado')
  return supabase
}

/** Rol del usuario actual en cada diagrama al que tiene acceso (incluye 'owner'). */
export async function getMyRoles(): Promise<Record<string, CollaboratorRole>> {
  if (!supabase) return {}
  const { data: u } = await supabase.auth.getUser()
  if (!u.user) return {}
  const { data, error } = await supabase
    .from('diagram_collaborators')
    .select('diagram_id, role')
    .eq('user_id', u.user.id)
  if (error) throw error
  const map: Record<string, CollaboratorRole> = {}
  for (const row of data as { diagram_id: string; role: CollaboratorRole }[]) {
    map[row.diagram_id] = row.role
  }
  return map
}

/** Lista de colaboradores de un diagrama (con datos de perfil). */
export async function listCollaborators(diagramId: string): Promise<Collaborator[]> {
  const client = sb()
  const { data: collabs, error } = await client
    .from('diagram_collaborators')
    .select('user_id, role')
    .eq('diagram_id', diagramId)
  if (error) throw error
  const rows = (collabs ?? []) as { user_id: string; role: CollaboratorRole }[]

  type Profile = { id: string; email: string | null; display_name: string | null; avatar_url: string | null }
  const profilesById: Record<string, Profile> = {}
  if (rows.length) {
    const { data: profs } = await client
      .from('profiles')
      .select('id, email, display_name, avatar_url')
      .in('id', rows.map((r) => r.user_id))
    for (const p of (profs ?? []) as Profile[]) profilesById[p.id] = p
  }

  return rows.map((r) => {
    const p = profilesById[r.user_id]
    return {
      userId: r.user_id,
      email: p?.email ?? null,
      displayName: p?.display_name ?? null,
      avatarUrl: p?.avatar_url ?? null,
      role: r.role,
    }
  })
}

/**
 * Añade directamente a un usuario ya registrado (busca su perfil por email).
 * Devuelve true si lo añadió, false si no existe un usuario con ese email.
 */
export async function addCollaboratorByEmail(
  diagramId: string,
  email: string,
  role: Exclude<CollaboratorRole, 'owner'>
): Promise<boolean> {
  const client = sb()
  const { data: profile, error: pErr } = await client
    .from('profiles')
    .select('id')
    .ilike('email', email.trim())
    .maybeSingle()
  if (pErr) throw pErr
  if (!profile) return false
  const { data: u } = await client.auth.getUser()
  const { error } = await client.from('diagram_collaborators').upsert(
    { diagram_id: diagramId, user_id: (profile as { id: string }).id, role, invited_by: u.user?.id },
    { onConflict: 'diagram_id,user_id' }
  )
  if (error) throw error
  return true
}

/** Crea (o devuelve) un enlace de invitación con token. */
export async function createInviteLink(
  diagramId: string,
  role: Exclude<CollaboratorRole, 'owner'>
): Promise<string> {
  const client = sb()
  const { data: u } = await client.auth.getUser()
  const token = crypto.randomUUID()
  const { error } = await client.from('diagram_invites').insert({
    diagram_id: diagramId,
    role,
    token,
    created_by: u.user?.id,
  })
  if (error) throw error
  return `${window.location.origin}/?invite=${token}`
}

/** Canjea un token de invitación para el usuario actual. Devuelve el diagram_id. */
export async function redeemInvite(token: string): Promise<string> {
  const { data, error } = await sb().rpc('redeem_invite', { invite_token: token })
  if (error) throw error
  return data as string
}

export async function removeCollaborator(diagramId: string, userId: string): Promise<void> {
  const { error } = await sb()
    .from('diagram_collaborators')
    .delete()
    .eq('diagram_id', diagramId)
    .eq('user_id', userId)
  if (error) throw error
}

// ════════════════════════════════════════════════════════════════
// Proyectos (mismo patrón que diagramas, sobre project_*)
// ════════════════════════════════════════════════════════════════

/** Rol del usuario actual en cada proyecto al que tiene acceso. */
export async function getMyProjectRoles(): Promise<Record<string, CollaboratorRole>> {
  if (!supabase) return {}
  const { data: u } = await supabase.auth.getUser()
  if (!u.user) return {}
  const { data, error } = await supabase
    .from('project_collaborators')
    .select('project_id, role')
    .eq('user_id', u.user.id)
  if (error) throw error
  const map: Record<string, CollaboratorRole> = {}
  for (const row of data as { project_id: string; role: CollaboratorRole }[]) {
    map[row.project_id] = row.role
  }
  return map
}

export async function listProjectCollaborators(projectId: string): Promise<Collaborator[]> {
  const client = sb()
  const { data: collabs, error } = await client
    .from('project_collaborators')
    .select('user_id, role')
    .eq('project_id', projectId)
  if (error) throw error
  const rows = (collabs ?? []) as { user_id: string; role: CollaboratorRole }[]

  type Profile = { id: string; email: string | null; display_name: string | null; avatar_url: string | null }
  const profilesById: Record<string, Profile> = {}
  if (rows.length) {
    const { data: profs } = await client
      .from('profiles')
      .select('id, email, display_name, avatar_url')
      .in('id', rows.map((r) => r.user_id))
    for (const p of (profs ?? []) as Profile[]) profilesById[p.id] = p
  }
  return rows.map((r) => {
    const p = profilesById[r.user_id]
    return {
      userId: r.user_id,
      email: p?.email ?? null,
      displayName: p?.display_name ?? null,
      avatarUrl: p?.avatar_url ?? null,
      role: r.role,
    }
  })
}

export async function addProjectCollaboratorByEmail(
  projectId: string,
  email: string,
  role: Exclude<CollaboratorRole, 'owner'>
): Promise<boolean> {
  const client = sb()
  const { data: profile, error: pErr } = await client
    .from('profiles')
    .select('id')
    .ilike('email', email.trim())
    .maybeSingle()
  if (pErr) throw pErr
  if (!profile) return false
  const { data: u } = await client.auth.getUser()
  const { error } = await client.from('project_collaborators').upsert(
    { project_id: projectId, user_id: (profile as { id: string }).id, role, invited_by: u.user?.id },
    { onConflict: 'project_id,user_id' }
  )
  if (error) throw error
  return true
}

export async function createProjectInviteLink(
  projectId: string,
  role: Exclude<CollaboratorRole, 'owner'>
): Promise<string> {
  const client = sb()
  const { data: u } = await client.auth.getUser()
  const token = crypto.randomUUID()
  const { error } = await client.from('project_invites').insert({
    project_id: projectId,
    role,
    token,
    created_by: u.user?.id,
  })
  if (error) throw error
  return `${window.location.origin}/?projectInvite=${token}`
}

/** Canjea un token de invitación de proyecto. Devuelve el project_id. */
export async function redeemProjectInvite(token: string): Promise<string> {
  const { data, error } = await sb().rpc('redeem_project_invite', { invite_token: token })
  if (error) throw error
  return data as string
}

export async function removeProjectCollaborator(projectId: string, userId: string): Promise<void> {
  const { error } = await sb()
    .from('project_collaborators')
    .delete()
    .eq('project_id', projectId)
    .eq('user_id', userId)
  if (error) throw error
}
