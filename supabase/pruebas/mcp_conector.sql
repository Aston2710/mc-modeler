-- Verificación de supabase/migrations/20261008120000_mcp_conector.sql (PLAN-039).
-- SOLO LABORATORIO. Uso:
--   Get-Content -Raw supabase/pruebas/mcp_conector.sql | docker exec -i supabase_db_mc-modeler psql -U postgres -d postgres
-- Todo corre dentro de transacciones con rollback: no deja datos.
\set QUIET on
\pset format unaligned
\pset tuples_only on
\set ON_ERROR_STOP off

create or replace function public._probar(p_claims text, p_sql text)
returns text language plpgsql as $$
declare n bigint;
begin
  perform set_config('request.jwt.claims', p_claims, true);
  perform set_config('role', 'authenticated', true);
  execute p_sql;
  get diagnostics n = row_count;
  perform set_config('role', 'postgres', true);
  return 'OK (' || n || ' filas)';
exception when others then
  perform set_config('role', 'postgres', true);
  return 'ERR ' || sqlstate || ' ' || sqlerrm;
end $$;

\set appA '''{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}'''
\set conA '''{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated","client_id":"cliente-prueba"}'''
\set appB '''{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}'''
\set conB '''{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated","client_id":"cliente-prueba"}'''

\echo '── 1. Sesión de la app: nada cambia'
begin;
select '1a app A edita c1:          ' || public._probar(:appA, $$update public.diagrams set name='x' where id='cccccccc-0000-0000-0000-000000000001'$$);
select '1b app A papelera c1:       ' || public._probar(:appA, $$update public.diagrams set deleted_at=now() where id='cccccccc-0000-0000-0000-000000000001'$$);
select '1c app A mueve c1 a proy.:  ' || public._probar(:appA, $$update public.diagrams set project_id='aaaaaaaa-0000-0000-0000-000000000001' where id='cccccccc-0000-0000-0000-000000000001'$$);
select '1d app A comenta:           ' || public._probar(:appA, $$insert into public.comment_threads(diagram_id, anchor, created_by, created_by_name) values ('cccccccc-0000-0000-0000-000000000001','{}','11111111-1111-1111-1111-111111111111','A')$$);
select '1e app A borra c1:          ' || public._probar(:appA, $$delete from public.diagrams where id='cccccccc-0000-0000-0000-000000000001'$$);
select '1f auditoría tras app:      ' || count(*) from private.mcp_auditoria;
rollback;

\echo '── 2. Conector: crear y modificar contenido'
begin;
select '2a con A crea en su proy.:  ' || public._probar(:conA, $$insert into public.diagrams(id, owner_id, project_id, name, current_xml, element_count) values ('eeeeeeee-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','aaaaaaaa-0000-0000-0000-000000000001','IA','<x/>',3)$$);
select '2b alta owner automática:   ' || count(*) from public.diagram_collaborators where diagram_id='eeeeeeee-0000-0000-0000-000000000001' and role='owner';
select '2c con A modifica c1:       ' || public._probar(:conA, $$update public.diagrams set name='por IA', current_xml='<y/>', element_count=4 where id='cccccccc-0000-0000-0000-000000000001'$$);
select '2d auditoría:               ' || string_agg(operacion || ':' || diagram_id || ':' || coalesce(version_anterior::text,'-'), ' | ' order by id) from private.mcp_auditoria;
rollback;

\echo '── 3. Conector: todo lo demás se rechaza'
begin;
select '3a papelera:                ' || public._probar(:conA, $$update public.diagrams set deleted_at=now() where id='cccccccc-0000-0000-0000-000000000001'$$);
select '3b mover de proyecto:       ' || public._probar(:conA, $$update public.diagrams set project_id='aaaaaaaa-0000-0000-0000-000000000001' where id='cccccccc-0000-0000-0000-000000000001'$$);
select '3c borrar:                  ' || public._probar(:conA, $$delete from public.diagrams where id='cccccccc-0000-0000-0000-000000000001'$$);
select '3d comentar:                ' || public._probar(:conA, $$insert into public.comment_threads(diagram_id, anchor, created_by, created_by_name) values ('cccccccc-0000-0000-0000-000000000001','{}','11111111-1111-1111-1111-111111111111','A')$$);
select '3e invitar colaborador:     ' || public._probar(:conA, $$insert into public.diagram_collaborators(diagram_id,user_id,role,invited_by) values ('cccccccc-0000-0000-0000-000000000002','22222222-2222-2222-2222-222222222222','editor','11111111-1111-1111-1111-111111111111')$$);
select '3f renombrar proyecto:      ' || public._probar(:conA, $$update public.projects set name='x' where id='aaaaaaaa-0000-0000-0000-000000000001'$$);
select '3g subir a storage:         ' || public._probar(:conA, $$insert into storage.objects(bucket_id, name, owner) values ('thumbnails','cccccccc-0000-0000-0000-000000000001/thumb','11111111-1111-1111-1111-111111111111')$$);
select '3h editar diagrama borrado: ' || public._probar(:conA, $$update public.diagrams set name='x' where id='cccccccc-0000-0000-0000-000000000004'$$);
select '3i crear con padre:         ' || public._probar(:conA, $$insert into public.diagrams(owner_id, name, current_xml, parent_diagram_id) values ('11111111-1111-1111-1111-111111111111','x','<x/>','cccccccc-0000-0000-0000-000000000001')$$);
rollback;

\echo '── 4. SEG-11: crear en un proyecto ajeno'
begin;
select '4a APP B en proyecto de A:  ' || public._probar(:appB, $$insert into public.diagrams(owner_id, project_id, name, current_xml) values ('22222222-2222-2222-2222-222222222222','aaaaaaaa-0000-0000-0000-000000000001','intruso','<x/>')$$);
select '4b CON B en proyecto de A:  ' || public._probar(:conB, $$insert into public.diagrams(owner_id, project_id, name, current_xml) values ('22222222-2222-2222-2222-222222222222','aaaaaaaa-0000-0000-0000-000000000001','intruso','<x/>')$$);
rollback;

\echo '── 5. RLS intacta bajo el conector'
begin;
select '5a con B edita c3 (viewer): ' || public._probar(:conB, $$update public.diagrams set name='x' where id='cccccccc-0000-0000-0000-000000000003'$$);
select '5b con B edita c1 (editor): ' || public._probar(:conB, $$update public.diagrams set name='x' where id='cccccccc-0000-0000-0000-000000000001'$$);
select '5c con B edita c2 (ajeno):  ' || public._probar(:conB, $$update public.diagrams set name='x' where id='cccccccc-0000-0000-0000-000000000002'$$);
rollback;

\echo '── 6. Límites'
begin;
select '6a XML de 1,1 MB:           ' || public._probar(:conA, $$update public.diagrams set current_xml=repeat('a', 1153434) where id='cccccccc-0000-0000-0000-000000000001'$$);
select '6b 501 elementos:           ' || public._probar(:conA, $$update public.diagrams set element_count=501 where id='cccccccc-0000-0000-0000-000000000001'$$);
select '6c escrituras 1..20:        ' || coalesce(string_agg(r, ','), 'las 20 OK') from (
  select public._probar(:conA, $$update public.diagrams set name='n' where id='cccccccc-0000-0000-0000-000000000001'$$) as r
  from generate_series(1,20)) s where r not like 'OK%';
select '6d escritura 21:            ' || public._probar(:conA, $$update public.diagrams set name='n' where id='cccccccc-0000-0000-0000-000000000001'$$);
rollback;

\echo '── 7. mcp_registrar_llamada'
begin;
select '7a app (sin client_id):     ' || public._probar(:appA, $$select public.mcp_registrar_llamada(60)$$);
select '7b llamadas 1..60 true:     ' || count(*) filter (where ok) || '/60' from (
  select (set_config('request.jwt.claims', :conA, true) is not null and public.mcp_registrar_llamada(60)) as ok
  from generate_series(1,60)) s;
select '7c llamada 61:              ' || public.mcp_registrar_llamada(60);
rollback;

\echo '── 8. Privados ilegibles para authenticated'
begin;
select '8a leer auditoría:          ' || public._probar(:conA, $$select * from private.mcp_auditoria$$);
rollback;

drop function public._probar(text, text);
