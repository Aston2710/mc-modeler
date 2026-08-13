-- ============================================================================
-- Visibilidad de imágenes: lectura para cualquier usuario autenticado.
--
-- Problema: el ámbito de las imágenes se ancló al proyecto (can_access_project),
-- mientras el acceso a diagramas se ancla al diagrama (can_access_diagram). Un
-- viewer, o un invitado a un diagrama suelto (project_id null → scopeId = uid del
-- dueño), no podía leer ni la fila ni el objeto de Storage → badge 📷 sin imagen.
--
-- El vínculo imagen↔elemento vive en el XML (flujo:linkedImages), no en la BD, así
-- que Postgres no puede evaluar "esta imagen la usa un diagrama que puedo ver".
-- Decisión: abrir la LECTURA a todo usuario autenticado.
--
-- Alcance del cambio:
--   • Solo SELECT. Insert/update/delete quedan igual (dueño o can_edit_project).
--   • Solo rol `authenticated` — `anon` sigue sin acceso.
--   • El bucket 'diagram-images' sigue privado (public = false): nada se sirve por
--     URL sin token.
--   • Consecuencia aceptada: cualquier usuario con cuenta puede listar los nombres
--     de public.images/image_folders y descargar cualquier imagen de biblioteca.
-- ============================================================================

drop policy if exists images_select on public.images;
create policy images_select on public.images
  for select to authenticated using (true);

drop policy if exists image_folders_select on public.image_folders;
create policy image_folders_select on public.image_folders
  for select to authenticated using (true);

-- Objeto de Storage con prefijo de biblioteca: '<scopeId>/imglib/<uuid>.<ext>'.
-- Se conserva el guard del segmento [2] = 'imglib' para no afectar a las imágenes
-- embebidas por diagrama ('<diagramId>/<uuid>.<ext>'), que siguen bajo
-- diagram_images_select → private.can_access_diagram(...).
drop policy if exists diagram_images_lib_select on storage.objects;
create policy diagram_images_lib_select on storage.objects
  for select to authenticated using (
    bucket_id = 'diagram-images'
    and (storage.foldername(name))[2] = 'imglib'
  );
