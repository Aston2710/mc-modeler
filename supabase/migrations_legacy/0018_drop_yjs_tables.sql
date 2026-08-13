-- ============================================================================
-- Etapa 6 del pivote ADR (fuente de verdad única = current_xml).
-- Drop de las tablas Yjs CONGELADAS desde el pivote (~2026-07-03).
--
-- Seguridad (verificado):
--   · El cliente NO las lee ni escribe (useCollab crea Y.Doc efímero por sesión;
--     el test sessionTransport.pivot prohíbe loadYjsState/appendYjsUpdate).
--   · Ningún FK las referencia, no tienen triggers, NO están en la publicación
--     supabase_realtime.
--   · Sus RLS policies (yjs_select/insert/update) caen con la tabla.
--   · YjsCommentBinding (modo local) usa localforage, NO estas tablas.
-- Backup archivado previo: backups/pre-drop-yjs-*.json.
-- Ver fix_doc/ADR-persistence-source-of-truth.md §6 y plan-implementacion-pivote-ADR.md Etapa 6.
-- ============================================================================

drop table if exists public.yjs_updates;
drop table if exists public.yjs_documents;
