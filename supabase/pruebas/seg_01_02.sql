-- Verificación de supabase/migrations/20261015120000_seg_01_02_colaboradores_y_outbox.sql.
-- SOLO LABORATORIO. Uso:
--   Get-Content -Raw supabase/pruebas/seg_01_02.sql | docker exec -i supabase_db_mc-modeler psql -U postgres -d postgres
-- Sesiones normales de la app (sin client_id). Todo con rollback: no deja datos.
-- Cada línea dice lo ESPERADO con la migración aplicada.
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

create or replace function public._contar(p_claims text, p_sql text)
returns text language plpgsql as $$
declare n bigint;
begin
  perform set_config('request.jwt.claims', p_claims, true);
  perform set_config('role', 'authenticated', true);
  execute p_sql into n;
  perform set_config('role', 'postgres', true);
  return n::text;
exception when others then
  perform set_config('role', 'postgres', true);
  return 'ERR ' || sqlstate || ' ' || sqlerrm;
end $$;

\set appA '''{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}'''
\set appB '''{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}'''

-- c2 y el proyecto aaaa… son de A; B no tiene relación con ellos.
\echo '── SEG-01 · ataques (esperado: ERR 42501)'
begin;
select '1a B editor en c2 ajeno:     ' || public._probar(:appB, $$insert into public.diagram_collaborators(diagram_id, user_id, role) values ('cccccccc-0000-0000-0000-000000000002','22222222-2222-2222-2222-222222222222','editor')$$);
select '1b B owner en c2 ajeno:      ' || public._probar(:appB, $$insert into public.diagram_collaborators(diagram_id, user_id, role) values ('cccccccc-0000-0000-0000-000000000002','22222222-2222-2222-2222-222222222222','owner')$$);
select '1c B en proyecto ajeno:      ' || public._probar(:appB, $$insert into public.project_collaborators(project_id, user_id, role) values ('aaaaaaaa-0000-0000-0000-000000000001','22222222-2222-2222-2222-222222222222','editor')$$);
select '1d B sigue sin ver c2:       ' || public._contar(:appB, $$select count(*) from public.diagrams where id='cccccccc-0000-0000-0000-000000000002'$$) || ' (esperado 0)';
rollback;

\echo '── SEG-01 · flujos legítimos (esperado: OK)'
begin;
select '1e A comparte c2 con B:      ' || public._probar(:appA, $$insert into public.diagram_collaborators(diagram_id, user_id, role, invited_by) values ('cccccccc-0000-0000-0000-000000000002','22222222-2222-2222-2222-222222222222','editor','11111111-1111-1111-1111-111111111111')$$);
select '1f A comparte el proyecto:   ' || public._probar(:appA, $$insert into public.project_collaborators(project_id, user_id, role, invited_by) values ('aaaaaaaa-0000-0000-0000-000000000001','22222222-2222-2222-2222-222222222222','viewer','11111111-1111-1111-1111-111111111111')$$);
rollback;
begin;
select '1g B crea un diagrama:       ' || public._probar(:appB, $$insert into public.diagrams(id, owner_id, name, current_xml) values ('eeeeeeee-0000-0000-0000-0000000000b1','22222222-2222-2222-2222-222222222222','de B','<x/>')$$);
select '1h  …y queda como owner:     ' || count(*) || ' (esperado 1)' from public.diagram_collaborators where diagram_id='eeeeeeee-0000-0000-0000-0000000000b1' and role='owner';
select '1i B crea un proyecto:       ' || public._probar(:appB, $$insert into public.projects(id, owner_id, name) values ('eeeeeeee-0000-0000-0000-0000000000b2','22222222-2222-2222-2222-222222222222','proy de B')$$);
select '1j  …y queda como owner:     ' || count(*) || ' (esperado 1)' from public.project_collaborators where project_id='eeeeeeee-0000-0000-0000-0000000000b2' and role='owner';
rollback;
begin;
insert into public.diagram_invites(diagram_id, token, role, created_by)
values ('cccccccc-0000-0000-0000-000000000002', 'tok-seg-01', 'editor', '11111111-1111-1111-1111-111111111111');
select '1k B canjea una invitación:  ' || public._probar(:appB, $$select public.redeem_invite('tok-seg-01')$$);
select '1l  …y entra como editor:    ' || count(*) || ' (esperado 1)' from public.diagram_collaborators where diagram_id='cccccccc-0000-0000-0000-000000000002' and user_id='22222222-2222-2222-2222-222222222222' and role='editor';
rollback;
begin;
select '1m B sale de c1 compartido:  ' || public._probar(:appB, $$delete from public.diagram_collaborators where diagram_id='cccccccc-0000-0000-0000-000000000001' and user_id='22222222-2222-2222-2222-222222222222'$$);
rollback;

\echo '── SEG-02'
begin;
insert into public.notification_outbox(id, recipient_id, recipient_email, kind, payload, sent_at, attempts)
values ('ffffffff-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'dev@local.test',
        'comment_mention', '{"text":"original"}', now(), 1);
select '2a UPDATE email permitido:   ' || has_column_privilege('authenticated', 'public.notification_outbox', 'recipient_email', 'UPDATE') || ' (esperado false)';
select '2b UPDATE read_at permitido: ' || has_column_privilege('authenticated', 'public.notification_outbox', 'read_at', 'UPDATE') || ' (esperado true)';
select '2c A reescribe destinatario: ' || public._probar(:appA, $$update public.notification_outbox set recipient_email='victima@externo.test', sent_at=null, attempts=0 where id='ffffffff-0000-0000-0000-000000000001'$$) || ' (esperado ERR 42501)';
select '2d A rearma created_at:      ' || public._probar(:appA, $$update public.notification_outbox set created_at=now() where id='ffffffff-0000-0000-0000-000000000001'$$) || ' (esperado ERR 42501)';
select '2e A marca leída (la app):   ' || public._probar(:appA, $$update public.notification_outbox set read_at=now() where id='ffffffff-0000-0000-0000-000000000001'$$) || ' (esperado OK 1)';
select '2f B marca leída la de A:    ' || public._probar(:appB, $$update public.notification_outbox set read_at=now() where id='ffffffff-0000-0000-0000-000000000001'$$) || ' (esperado OK 0)';
select '2g fila intacta:             ' || recipient_email || ' · sent_at ' || (sent_at is not null) || ' · attempts ' || attempts
  from public.notification_outbox where id='ffffffff-0000-0000-0000-000000000001';
rollback;

drop function public._probar(text, text);
drop function public._contar(text, text);
