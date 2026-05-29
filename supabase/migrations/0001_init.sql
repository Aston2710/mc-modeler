-- ============================================================================
-- McModeler — Esquema inicial: cloud + colaboración
-- Tablas: profiles, folders, diagrams, diagram_collaborators,
--         diagram_invites, yjs_documents
-- + RLS, triggers y bucket de Storage para thumbnails.
-- ============================================================================

-- ── Extensiones ─────────────────────────────────────────────────────────────
create extension if not exists "pgcrypto";  -- gen_random_uuid()

-- ── profiles ────────────────────────────────────────────────────────────────
create table if not exists public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  email        text,
  display_name text,
  avatar_url   text,
  created_at   timestamptz not null default now()
);

-- ── folders ─────────────────────────────────────────────────────────────────
create table if not exists public.folders (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null references auth.users(id) on delete cascade,
  name       text not null,
  created_at timestamptz not null default now()
);
create index if not exists folders_owner_idx on public.folders(owner_id);

-- ── diagrams ────────────────────────────────────────────────────────────────
create table if not exists public.diagrams (
  id             uuid primary key default gen_random_uuid(),
  owner_id       uuid not null references auth.users(id) on delete cascade,
  folder_id      uuid references public.folders(id) on delete set null,
  name           text not null,
  current_xml    text not null,             -- snapshot canónico (listas / export / lectura)
  element_count  int  not null default 0,
  thumbnail_path text,                       -- ruta en Storage bucket 'thumbnails'
  schema_version int  not null default 1,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists diagrams_owner_idx on public.diagrams(owner_id);
create index if not exists diagrams_folder_idx on public.diagrams(folder_id);

-- ── diagram_collaborators ────────────────────────────────────────────────────
create table if not exists public.diagram_collaborators (
  diagram_id uuid not null references public.diagrams(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  role       text not null check (role in ('owner','editor','viewer')),
  invited_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (diagram_id, user_id)
);
create index if not exists collab_user_idx on public.diagram_collaborators(user_id);

-- ── diagram_invites ──────────────────────────────────────────────────────────
create table if not exists public.diagram_invites (
  id          uuid primary key default gen_random_uuid(),
  diagram_id  uuid not null references public.diagrams(id) on delete cascade,
  email       text,                          -- null = enlace abierto
  role        text not null check (role in ('editor','viewer')),
  token       text not null unique,
  created_by  uuid not null references auth.users(id) on delete cascade,
  expires_at  timestamptz,
  accepted_at timestamptz,
  created_at  timestamptz not null default now()
);
create index if not exists invites_diagram_idx on public.diagram_invites(diagram_id);

-- ── yjs_documents (snapshot CRDT — Fase 5) ───────────────────────────────────
create table if not exists public.yjs_documents (
  diagram_id uuid primary key references public.diagrams(id) on delete cascade,
  state      bytea not null,
  updated_at timestamptz not null default now()
);

-- ============================================================================
-- Helpers (security definer) — rompen la recursión de RLS entre
-- diagrams ↔ diagram_collaborators.
-- ============================================================================
create or replace function public.can_access_diagram(d_id uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.diagrams d where d.id = d_id and d.owner_id = auth.uid()
  ) or exists (
    select 1 from public.diagram_collaborators c
    where c.diagram_id = d_id and c.user_id = auth.uid()
  );
$$;

create or replace function public.can_edit_diagram(d_id uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.diagrams d where d.id = d_id and d.owner_id = auth.uid()
  ) or exists (
    select 1 from public.diagram_collaborators c
    where c.diagram_id = d_id and c.user_id = auth.uid() and c.role in ('owner','editor')
  );
$$;

create or replace function public.is_diagram_owner(d_id uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.diagrams d where d.id = d_id and d.owner_id = auth.uid()
  );
$$;

-- ============================================================================
-- Triggers
-- ============================================================================
-- Crear perfil al registrarse.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, display_name, avatar_url)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', new.email),
    new.raw_user_meta_data->>'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- updated_at automático en diagrams.
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists diagrams_set_updated_at on public.diagrams;
create trigger diagrams_set_updated_at
  before update on public.diagrams
  for each row execute function public.set_updated_at();

-- Registrar al creador como colaborador 'owner' al crear un diagrama.
create or replace function public.add_owner_as_collaborator()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.diagram_collaborators (diagram_id, user_id, role, invited_by)
  values (new.id, new.owner_id, 'owner', new.owner_id)
  on conflict do nothing;
  return new;
end;
$$;

drop trigger if exists diagrams_add_owner on public.diagrams;
create trigger diagrams_add_owner
  after insert on public.diagrams
  for each row execute function public.add_owner_as_collaborator();

-- ============================================================================
-- RLS
-- ============================================================================
alter table public.profiles              enable row level security;
alter table public.folders               enable row level security;
alter table public.diagrams              enable row level security;
alter table public.diagram_collaborators enable row level security;
alter table public.diagram_invites       enable row level security;
alter table public.yjs_documents         enable row level security;

-- profiles: cada quien gestiona el suyo; lectura de perfiles de colaboradores permitida.
create policy profiles_select_self on public.profiles
  for select using (true);
create policy profiles_upsert_self on public.profiles
  for insert with check (id = auth.uid());
create policy profiles_update_self on public.profiles
  for update using (id = auth.uid());

-- folders: solo el dueño.
create policy folders_all_owner on public.folders
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- diagrams
create policy diagrams_select on public.diagrams
  for select using (public.can_access_diagram(id));
create policy diagrams_insert on public.diagrams
  for insert with check (owner_id = auth.uid());
create policy diagrams_update on public.diagrams
  for update using (public.can_edit_diagram(id)) with check (public.can_edit_diagram(id));
create policy diagrams_delete on public.diagrams
  for delete using (owner_id = auth.uid());

-- diagram_collaborators
create policy collab_select on public.diagram_collaborators
  for select using (user_id = auth.uid() or public.is_diagram_owner(diagram_id));
create policy collab_insert on public.diagram_collaborators
  for insert with check (public.is_diagram_owner(diagram_id) or user_id = auth.uid());
create policy collab_delete on public.diagram_collaborators
  for delete using (public.is_diagram_owner(diagram_id) or user_id = auth.uid());

-- diagram_invites
create policy invites_select on public.diagram_invites
  for select using (public.is_diagram_owner(diagram_id) or created_by = auth.uid());
create policy invites_insert on public.diagram_invites
  for insert with check (public.is_diagram_owner(diagram_id));
create policy invites_delete on public.diagram_invites
  for delete using (public.is_diagram_owner(diagram_id));

-- yjs_documents
create policy yjs_select on public.yjs_documents
  for select using (public.can_access_diagram(diagram_id));
create policy yjs_insert on public.yjs_documents
  for insert with check (public.can_edit_diagram(diagram_id));
create policy yjs_update on public.yjs_documents
  for update using (public.can_edit_diagram(diagram_id)) with check (public.can_edit_diagram(diagram_id));

-- ============================================================================
-- Storage: bucket de thumbnails (privado; acceso vía RLS por diagrama)
-- ============================================================================
insert into storage.buckets (id, name, public)
values ('thumbnails', 'thumbnails', false)
on conflict (id) do nothing;

-- Convención de path: '<diagram_id>/thumb.png' → primer segmento = diagram_id.
create policy thumbnails_select on storage.objects
  for select using (
    bucket_id = 'thumbnails'
    and public.can_access_diagram((storage.foldername(name))[1]::uuid)
  );
create policy thumbnails_write on storage.objects
  for insert with check (
    bucket_id = 'thumbnails'
    and public.can_edit_diagram((storage.foldername(name))[1]::uuid)
  );
create policy thumbnails_update on storage.objects
  for update using (
    bucket_id = 'thumbnails'
    and public.can_edit_diagram((storage.foldername(name))[1]::uuid)
  );
create policy thumbnails_delete on storage.objects
  for delete using (
    bucket_id = 'thumbnails'
    and public.can_edit_diagram((storage.foldername(name))[1]::uuid)
  );
