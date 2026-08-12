-- 0019_soft_delete
-- Reconstruido 2026-08-09 desde supabase_migrations.schema_migrations del
-- proyecto remoto: la migracion se habia aplicado en produccion pero su
-- archivo nunca se anadio al repo. Contenido literal del registro remoto.

alter table public.diagrams add column if not exists deleted_at timestamptz;
alter table public.projects add column if not exists deleted_at timestamptz;
create index if not exists diagrams_deleted_at_idx on public.diagrams (deleted_at) where deleted_at is not null;
create index if not exists projects_deleted_at_idx on public.projects (deleted_at) where deleted_at is not null;
