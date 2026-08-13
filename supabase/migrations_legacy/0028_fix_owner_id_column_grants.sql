-- 0028_fix_owner_id_column_grants
-- Correccion de 0023: `REVOKE UPDATE (owner_id)` es un no-op cuando existe un
-- `GRANT UPDATE` a nivel de tabla, porque el privilegio de tabla cubre todas
-- las columnas. Verificado: has_column_privilege(...,'owner_id','UPDATE') = true
-- despues de 0023.
--
-- Forma correcta: revocar el UPDATE de tabla y volver a concederlo columna a
-- columna, omitiendo owner_id.
--
-- ATENCION al anadir columnas nuevas a diagrams/projects: hay que anadirlas
-- tambien a estos GRANT o el cliente no podra escribirlas.

revoke update on public.diagrams from authenticated, anon;
grant update (
  id, folder_id, name, current_xml, element_count, thumbnail_path,
  schema_version, created_at, updated_at, parent_diagram_id,
  sub_process_element_id, project_id, deleted_at
) on public.diagrams to authenticated, anon;

revoke update on public.projects from authenticated, anon;
grant update (
  id, name, created_at, updated_at, deleted_at
) on public.projects to authenticated, anon;

-- Verificacion:
--   has_column_privilege('authenticated','public.diagrams','owner_id','UPDATE')  -> false
--   has_column_privilege('authenticated','public.diagrams','name','UPDATE')      -> true
--   has_table_privilege ('authenticated','public.diagrams','INSERT')             -> true
