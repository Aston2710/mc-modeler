-- 0023_protect_owner_id
--
-- ATENCION: esta migracion NO SURTIO EFECTO. Se conserva porque esta aplicada
-- en produccion y el historial debe coincidir. La correccion esta en
-- 0028_fix_owner_id_column_grants.sql — leer esa.
--
-- Motivo del fallo: en PostgreSQL `REVOKE UPDATE (columna)` es un no-op cuando
-- existe un `GRANT UPDATE` a nivel de tabla, porque el privilegio de tabla
-- cubre todas las columnas y el revoke de columna no lo perfora.
-- Verificado tras aplicar:
--   has_column_privilege('authenticated','public.diagrams','owner_id','UPDATE') = true
--
-- Intencion original (correcta, mal ejecutada): la politica diagrams_update usa
-- can_edit_diagram(id) en USING y WITH CHECK. Un colaborador con rol 'editor'
-- pasa ambas y nada le impedia incluir owner_id en el UPDATE -> robo de
-- propiedad via PATCH manual. El cliente lo evitaba a mano
-- (SupabaseRepository.ts:151-152), pero eso es defensa en el cliente.

revoke update (owner_id) on public.diagrams from authenticated, anon;
revoke update (owner_id) on public.projects from authenticated, anon;

-- No se toca public.folders ni public.image_folders: su cliente usa upsert()
-- con owner_id en el payload (SupabaseRepository.ts:459,
-- SupabaseImageRepository.ts:149), y un upsert sobre fila existente es UPDATE.
