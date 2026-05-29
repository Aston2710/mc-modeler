-- Guardar el estado del Y.Doc como base64 (text) en vez de bytea:
-- más simple de transportar vía PostgREST/supabase-js. La tabla está vacía.
alter table public.yjs_documents drop column state;
alter table public.yjs_documents add column state text;
