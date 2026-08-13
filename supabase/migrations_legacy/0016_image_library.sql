-- ============================================================================
-- Biblioteca de imágenes: imágenes como entidad de primera clase (no diagramas).
-- Se organizan en carpetas y se vinculan a elementos BPMN vía flujo:linkedImages.
-- Reutiliza el bucket privado 'diagram-images' con un prefijo propio:
--     <scopeId>/imglib/<uuid>.<ext>   (scopeId = project_id ?? owner_id)
-- El primer segmento del path es SIEMPRE un uuid → las políticas existentes por
-- diagrama (que castean [1]::uuid) no fallan al evaluarse sobre estos objetos.
-- ============================================================================

-- ── image_folders ────────────────────────────────────────────────────────────
create table if not exists public.image_folders (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null references auth.users(id) on delete cascade,
  project_id uuid references public.projects(id) on delete cascade,
  name       text not null,
  created_at timestamptz not null default now()
);
create index if not exists image_folders_owner_idx   on public.image_folders(owner_id);
create index if not exists image_folders_project_idx on public.image_folders(project_id);

-- ── images ───────────────────────────────────────────────────────────────────
create table if not exists public.images (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null references auth.users(id) on delete cascade,
  project_id   uuid references public.projects(id) on delete set null,
  folder_id    uuid references public.image_folders(id) on delete set null,
  name         text not null,
  storage_path text not null,                 -- path dentro del bucket 'diagram-images'
  mime         text not null default 'image/webp',
  size_bytes   int  not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists images_owner_idx   on public.images(owner_id);
create index if not exists images_project_idx on public.images(project_id);
create index if not exists images_folder_idx  on public.images(folder_id);

drop trigger if exists images_set_updated_at on public.images;
create trigger images_set_updated_at
  before update on public.images
  for each row execute function public.set_updated_at();

-- ── RLS ──────────────────────────────────────────────────────────────────────
alter table public.image_folders enable row level security;
alter table public.images        enable row level security;

-- image_folders: dueño siempre; colaboradores del proyecto (si tiene proyecto).
create policy image_folders_select on public.image_folders
  for select using (
    owner_id = auth.uid()
    or (project_id is not null and private.can_access_project(project_id))
  );
create policy image_folders_insert on public.image_folders
  for insert with check (
    owner_id = auth.uid()
    and (project_id is null or private.can_edit_project(project_id))
  );
create policy image_folders_update on public.image_folders
  for update using (
    owner_id = auth.uid()
    or (project_id is not null and private.can_edit_project(project_id))
  ) with check (
    owner_id = auth.uid()
    or (project_id is not null and private.can_edit_project(project_id))
  );
create policy image_folders_delete on public.image_folders
  for delete using (
    owner_id = auth.uid()
    or (project_id is not null and private.can_edit_project(project_id))
  );

-- images: mismo criterio.
create policy images_select on public.images
  for select using (
    owner_id = auth.uid()
    or (project_id is not null and private.can_access_project(project_id))
  );
create policy images_insert on public.images
  for insert with check (
    owner_id = auth.uid()
    and (project_id is null or private.can_edit_project(project_id))
  );
create policy images_update on public.images
  for update using (
    owner_id = auth.uid()
    or (project_id is not null and private.can_edit_project(project_id))
  ) with check (
    owner_id = auth.uid()
    or (project_id is not null and private.can_edit_project(project_id))
  );
create policy images_delete on public.images
  for delete using (
    owner_id = auth.uid()
    or (project_id is not null and private.can_edit_project(project_id))
  );

-- ============================================================================
-- Storage: bucket 'diagram-images' (creado fuera de migraciones; se asegura aquí)
-- Convención biblioteca: '<scopeId>/imglib/<uuid>.<ext>'.
--   [1] = scopeId (project_id o owner_id, siempre uuid)
--   [2] = 'imglib' (marca que distingue de las imágenes embebidas por diagrama)
-- ============================================================================
insert into storage.buckets (id, name, public)
values ('diagram-images', 'diagram-images', false)
on conflict (id) do nothing;

-- Acceso: el scope es accesible si es un proyecto del usuario/colaborador, o si
-- el scopeId es el propio uid (imágenes sueltas, sin proyecto).
create policy diagram_images_lib_select on storage.objects
  for select using (
    bucket_id = 'diagram-images'
    and (storage.foldername(name))[2] = 'imglib'
    and (
      (storage.foldername(name))[1]::uuid = auth.uid()
      or private.can_access_project((storage.foldername(name))[1]::uuid)
    )
  );
create policy diagram_images_lib_insert on storage.objects
  for insert with check (
    bucket_id = 'diagram-images'
    and (storage.foldername(name))[2] = 'imglib'
    and (
      (storage.foldername(name))[1]::uuid = auth.uid()
      or private.can_edit_project((storage.foldername(name))[1]::uuid)
    )
  );
create policy diagram_images_lib_update on storage.objects
  for update using (
    bucket_id = 'diagram-images'
    and (storage.foldername(name))[2] = 'imglib'
    and (
      (storage.foldername(name))[1]::uuid = auth.uid()
      or private.can_edit_project((storage.foldername(name))[1]::uuid)
    )
  );
create policy diagram_images_lib_delete on storage.objects
  for delete using (
    bucket_id = 'diagram-images'
    and (storage.foldername(name))[2] = 'imglib'
    and (
      (storage.foldername(name))[1]::uuid = auth.uid()
      or private.can_edit_project((storage.foldername(name))[1]::uuid)
    )
  );
