-- ============================================================================
-- Realtime para la biblioteca de imágenes: sin esto, lo que un colaborador sube
-- o crea (imágenes/carpetas) no aparece en las sesiones ya abiertas de los demás
-- hasta recargar. Se añaden ambas tablas a la publicación supabase_realtime.
-- RLS sigue aplicando: cada usuario solo recibe cambios de lo que puede ver.
-- ============================================================================

-- replica identity full → los eventos DELETE traen la fila completa (old record),
-- útil si más adelante se quiere filtrado granular en cliente.
alter table public.images        replica identity full;
alter table public.image_folders replica identity full;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'images'
  ) then
    alter publication supabase_realtime add table public.images;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'image_folders'
  ) then
    alter publication supabase_realtime add table public.image_folders;
  end if;
end $$;
