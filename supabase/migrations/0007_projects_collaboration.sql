-- ============================================================================
-- Proyectos colaborativos: agrupan diagramas; compartir a nivel proyecto da
-- acceso a todos sus diagramas. Conviven con diagramas sueltos.
-- ============================================================================

create table if not exists public.projects (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null references auth.users(id) on delete cascade,
  name       text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists projects_owner_idx on public.projects(owner_id);

create table if not exists public.project_collaborators (
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  role       text not null check (role in ('owner','editor','viewer')),
  invited_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (project_id, user_id)
);
create index if not exists project_collab_user_idx on public.project_collaborators(user_id);

create table if not exists public.project_invites (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects(id) on delete cascade,
  email       text,
  role        text not null check (role in ('editor','viewer')),
  token       text not null unique,
  created_by  uuid not null references auth.users(id) on delete cascade,
  expires_at  timestamptz,
  accepted_at timestamptz,
  created_at  timestamptz not null default now()
);
create index if not exists project_invites_project_idx on public.project_invites(project_id);

alter table public.diagrams
  add column if not exists project_id uuid references public.projects(id) on delete set null;
create index if not exists diagrams_project_idx on public.diagrams(project_id);

-- ── Helpers de proyecto (schema privado, no expuesto por la API) ─────────────
create or replace function private.can_access_project(p_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.projects p where p.id = p_id and p.owner_id = auth.uid())
      or exists (select 1 from public.project_collaborators c where c.project_id = p_id and c.user_id = auth.uid());
$$;
create or replace function private.can_edit_project(p_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.projects p where p.id = p_id and p.owner_id = auth.uid())
      or exists (select 1 from public.project_collaborators c where c.project_id = p_id and c.user_id = auth.uid() and c.role in ('owner','editor'));
$$;
create or replace function private.is_project_owner(p_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.projects p where p.id = p_id and p.owner_id = auth.uid());
$$;
revoke execute on function private.can_access_project(uuid) from public;
revoke execute on function private.can_edit_project(uuid) from public;
revoke execute on function private.is_project_owner(uuid) from public;
grant execute on function private.can_access_project(uuid) to authenticated;
grant execute on function private.can_edit_project(uuid) to authenticated;
grant execute on function private.is_project_owner(uuid) to authenticated;

-- ── Extender acceso a diagramas: heredar del proyecto ────────────────────────
create or replace function private.can_access_diagram(d_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.diagrams d where d.id = d_id and d.owner_id = auth.uid())
      or exists (select 1 from public.diagram_collaborators c where c.diagram_id = d_id and c.user_id = auth.uid())
      or exists (
        select 1 from public.diagrams d
        join public.project_collaborators pc on pc.project_id = d.project_id
        where d.id = d_id and pc.user_id = auth.uid()
      )
      or exists (
        select 1 from public.diagrams d
        join public.projects p on p.id = d.project_id
        where d.id = d_id and p.owner_id = auth.uid()
      );
$$;
create or replace function private.can_edit_diagram(d_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.diagrams d where d.id = d_id and d.owner_id = auth.uid())
      or exists (select 1 from public.diagram_collaborators c where c.diagram_id = d_id and c.user_id = auth.uid() and c.role in ('owner','editor'))
      or exists (
        select 1 from public.diagrams d
        join public.project_collaborators pc on pc.project_id = d.project_id
        where d.id = d_id and pc.user_id = auth.uid() and pc.role in ('owner','editor')
      )
      or exists (
        select 1 from public.diagrams d
        join public.projects p on p.id = d.project_id
        where d.id = d_id and p.owner_id = auth.uid()
      );
$$;

-- ── Triggers ─────────────────────────────────────────────────────────────────
create or replace function public.add_project_owner_as_collaborator()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.project_collaborators (project_id, user_id, role, invited_by)
  values (new.id, new.owner_id, 'owner', new.owner_id)
  on conflict do nothing;
  return new;
end;
$$;
drop trigger if exists projects_add_owner on public.projects;
create trigger projects_add_owner after insert on public.projects
  for each row execute function public.add_project_owner_as_collaborator();

drop trigger if exists projects_set_updated_at on public.projects;
create trigger projects_set_updated_at before update on public.projects
  for each row execute function public.set_updated_at();

-- ── RLS ──────────────────────────────────────────────────────────────────────
alter table public.projects              enable row level security;
alter table public.project_collaborators enable row level security;
alter table public.project_invites       enable row level security;

create policy projects_select on public.projects
  for select using (private.can_access_project(id));
create policy projects_insert on public.projects
  for insert with check (owner_id = auth.uid());
create policy projects_update on public.projects
  for update using (private.can_edit_project(id)) with check (private.can_edit_project(id));
create policy projects_delete on public.projects
  for delete using (owner_id = auth.uid());

create policy project_collab_select on public.project_collaborators
  for select using (user_id = auth.uid() or private.is_project_owner(project_id));
create policy project_collab_insert on public.project_collaborators
  for insert with check (private.is_project_owner(project_id) or user_id = auth.uid());
create policy project_collab_delete on public.project_collaborators
  for delete using (private.is_project_owner(project_id) or user_id = auth.uid());

create policy project_invites_select on public.project_invites
  for select using (private.is_project_owner(project_id) or created_by = auth.uid());
create policy project_invites_insert on public.project_invites
  for insert with check (private.is_project_owner(project_id));
create policy project_invites_delete on public.project_invites
  for delete using (private.is_project_owner(project_id));

-- ── RPC: canjear invitación de proyecto ──────────────────────────────────────
create or replace function public.redeem_project_invite(invite_token text)
returns uuid language plpgsql security definer set search_path = public as $$
declare inv record;
begin
  select * into inv from public.project_invites where token = invite_token limit 1;
  if not found then raise exception 'Invitación inválida'; end if;
  if inv.expires_at is not null and inv.expires_at < now() then raise exception 'Invitación expirada'; end if;
  insert into public.project_collaborators (project_id, user_id, role, invited_by)
  values (inv.project_id, auth.uid(), inv.role, inv.created_by)
  on conflict (project_id, user_id) do nothing;
  update public.project_invites set accepted_at = now() where id = inv.id and accepted_at is null;
  return inv.project_id;
end;
$$;
revoke execute on function public.redeem_project_invite(text) from public, anon;
grant execute on function public.redeem_project_invite(text) to authenticated;

-- ── Hardening: trigger functions no expuestas por API ────────────────────────
revoke execute on function public.add_project_owner_as_collaborator() from anon, authenticated;
revoke execute on function public.add_owner_as_collaborator() from anon, authenticated;
revoke execute on function public.handle_new_user() from anon, authenticated;
revoke execute on function public.redeem_invite(text) from anon;
