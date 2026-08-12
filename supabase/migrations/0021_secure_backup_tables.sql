-- 0021_secure_backup_tables
-- P0: public._xml_backup_20260723 tenia RLS OFF + GRANT ALL a anon y estaba
-- expuesta por PostgREST con el XML completo de 29 diagramas.
-- Se conserva el dato en el esquema `private`, que PostgREST no expone, y se
-- elimina la tabla de `public`. Reversible: el respaldo sigue existiendo.

create table if not exists private._xml_backup_20260723 as
  select * from public._xml_backup_20260723;

drop table if exists public._xml_backup_20260723;

-- yjs_documents_backup_20260701: sin PK, RLS ON sin politicas (sin fuga, pero
-- basura del pivote Yjs cerrado en 0018). Mismo tratamiento.
create table if not exists private.yjs_documents_backup_20260701 as
  select * from public.yjs_documents_backup_20260701;

drop table if exists public.yjs_documents_backup_20260701;

-- El esquema private no esta en la lista de esquemas expuestos de PostgREST y
-- no tiene GRANTs a anon/authenticated.
revoke all on all tables in schema private from anon, authenticated;
