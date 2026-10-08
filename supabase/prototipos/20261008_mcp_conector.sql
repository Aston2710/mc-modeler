-- ============================================================================
-- PROTOTIPO — NO EJECUTAR EN PRODUCCIÓN. MASTER-PLAN-038 / PLAN-039.
--
-- Vive en supabase/prototipos/ y no en supabase/migrations/ a propósito: la CLI
-- solo aplica migrations/, así que este archivo no corre con `db reset`. Cuando
-- se apruebe, se copia a migrations/ con su marca de tiempo, se prueba con
-- `npm run lab:reset` y solo entonces se pide aprobación para producción
-- (CLAUDE.md, reglas 2 y 3; EXP-016; DEC-012).
--
-- QUÉ HACE
-- Pone límites en la BASE —no solo en el servidor MCP— a lo que puede hacer un
-- token emitido por el servidor OAuth de Supabase para el conector. Se
-- reconoce por la claim `client_id`, que las sesiones normales de la app no
-- llevan (supabase.com/docs/guides/auth/oauth-server/token-security).
--
--   1. Con token de conector, solo se puede CREAR y MODIFICAR el contenido de
--      diagramas. Nada de borrar, mover de proyecto, papelera, colaboradores,
--      invitaciones, comentarios, imágenes, perfiles ni notificaciones.
--   2. Límites duros: 1 MB de XML, 500 elementos, 20 escrituras por minuto.
--   3. Auditoría de cada escritura del conector, escrita por trigger: no la
--      puede saltar quien llame a PostgREST directamente con el token.
--   4. Contador de llamadas por usuario y minuto para el límite de las tools
--      de lectura (las de escritura ya las cuenta el punto 2).
--
-- POR QUÉ EN LA BASE
-- Los scopes de Supabase OAuth no limitan el acceso a datos: un token del
-- conector vale lo mismo que la sesión del usuario contra PostgREST
-- (docs/addons/investigacion-mcp.md §6.2). Si los límites vivieran solo en el
-- MCP, un token filtrado los saltaría. Con triggers, las funciones SECURITY
-- DEFINER como redeem_invite también quedan cubiertas: un trigger se dispara
-- aunque la política no se evalúe.
--
-- QUÉ NO CAMBIA
-- Nada para las sesiones de la app: todas las comprobaciones empiezan por
-- `if not private.es_conector() then return`. Ninguna política existente se
-- toca, ningún dato se migra.
--
-- CÓDIGOS DE ERROR
-- SQLSTATE 'PTnnn' hace que PostgREST responda con el estado HTTP nnn.
--   PT403 operación no permitida al conector · PT413 demasiado grande
--   PT429 límite de ritmo superado
--
-- REVERSIBLE: ver el bloque REVERTIR al final.
-- ============================================================================

-- ── 1. ¿La petición viene del conector? ─────────────────────────────────────
create or replace function private.es_conector()
 returns boolean
 language sql
 stable
 set search_path to ''
as $$
  select nullif(auth.jwt() ->> 'client_id', '') is not null;
$$;

comment on function private.es_conector() is
  'MASTER-PLAN-038. true si el JWT de la petición lo emitió el servidor OAuth '
  '(lleva client_id). Las sesiones de la app no lo llevan.';

-- ── 2. Auditoría ────────────────────────────────────────────────────────────
-- Solo escalares, nunca XML (DEC-007: el contenido de la tabla debe poder
-- enseñarse a alguien sin derecho a ver ningún proceso). Sin FK a diagrams:
-- el rastro sobrevive al borrado del diagrama.
create table if not exists private.mcp_auditoria (
  id                bigint generated always as identity primary key,
  creado            timestamptz not null default now(),
  user_id           uuid        not null,
  client_id         text        not null,
  operacion         text        not null check (operacion in ('crear', 'modificar')),
  diagram_id        uuid        not null,
  version_anterior  timestamptz,
  version_nueva     timestamptz not null,
  elementos         integer,
  bytes_xml         integer
);

create index if not exists mcp_auditoria_user_creado
  on private.mcp_auditoria (user_id, creado desc);

comment on table private.mcp_auditoria is
  'MASTER-PLAN-038. Escrituras hechas con token del conector MCP. La escribe '
  'un trigger; nadie con rol authenticated puede leerla ni escribirla.';

-- ── 3. Ventanas del límite de llamadas ──────────────────────────────────────
create table if not exists private.mcp_ventanas (
  user_id   uuid        not null,
  ventana   timestamptz not null,
  llamadas  integer     not null default 0,
  primary key (user_id, ventana)
);

-- ── 4. Guardia de diagrams ──────────────────────────────────────────────────
create or replace function private.conector_guardia_diagrams()
 returns trigger
 language plpgsql
 security definer
 set search_path to ''
as $$
declare
  escrituras_ultimo_minuto integer;
begin
  if not private.es_conector() then
    return coalesce(new, old);
  end if;

  if tg_op = 'DELETE' then
    raise exception 'el conector no puede borrar diagramas' using errcode = 'PT403';
  end if;

  if octet_length(new.current_xml) > 1048576 then
    raise exception 'XML mayor de 1 MB' using errcode = 'PT413';
  end if;
  if new.element_count > 500 then
    raise exception 'más de 500 elementos' using errcode = 'PT413';
  end if;

  select count(*) into escrituras_ultimo_minuto
    from private.mcp_auditoria
   where user_id = auth.uid() and creado > now() - interval '1 minute';
  if escrituras_ultimo_minuto >= 20 then
    raise exception 'límite de escrituras por minuto' using errcode = 'PT429';
  end if;

  if tg_op = 'INSERT' then
    -- La política diagrams_insert no comprueba el proyecto (SEG-11). Para el
    -- conector se cierra aquí; el arreglo general es asunto de la auditoría.
    if new.project_id is not null and not private.can_edit_project(new.project_id) then
      raise exception 'sin permiso de edición en el proyecto' using errcode = 'PT403';
    end if;
    if new.parent_diagram_id is not null or new.sub_process_element_id is not null
       or new.deleted_at is not null or new.thumbnail_path is not null then
      raise exception 'campos no permitidos al conector' using errcode = 'PT403';
    end if;
    return new;
  end if;

  -- UPDATE: solo contenido. Nada de papelera, proyecto, carpeta ni jerarquía.
  if old.deleted_at is not null then
    raise exception 'el diagrama está en la papelera' using errcode = 'PT403';
  end if;
  if (new.owner_id, new.project_id, new.folder_id, new.parent_diagram_id,
      new.sub_process_element_id, new.deleted_at, new.thumbnail_path, new.created_at)
     is distinct from
     (old.owner_id, old.project_id, old.folder_id, old.parent_diagram_id,
      old.sub_process_element_id, old.deleted_at, old.thumbnail_path, old.created_at) then
    raise exception 'el conector solo puede cambiar nombre y contenido' using errcode = 'PT403';
  end if;
  return new;
end;
$$;

create or replace function private.conector_auditar_diagrams()
 returns trigger
 language plpgsql
 security definer
 set search_path to ''
as $$
begin
  if private.es_conector() then
    insert into private.mcp_auditoria
      (user_id, client_id, operacion, diagram_id, version_anterior, version_nueva, elementos, bytes_xml)
    values
      (auth.uid(), auth.jwt() ->> 'client_id',
       case tg_op when 'INSERT' then 'crear' else 'modificar' end,
       new.id,
       case tg_op when 'UPDATE' then old.updated_at end,
       new.updated_at, new.element_count, octet_length(new.current_xml));
  end if;
  return null;
end;
$$;

drop trigger if exists conector_guardia on public.diagrams;
create trigger conector_guardia
  before insert or update or delete on public.diagrams
  for each row execute function private.conector_guardia_diagrams();

drop trigger if exists conector_auditoria on public.diagrams;
create trigger conector_auditoria
  after insert or update on public.diagrams
  for each row execute function private.conector_auditar_diagrams();

-- ── 5. El resto de tablas: solo lectura para el conector ────────────────────
-- Excepción única: el alta automática del dueño que hace diagrams_add_owner al
-- crear un diagrama (rol owner, sobre sí mismo, en un diagrama suyo).
create or replace function private.conector_solo_lectura()
 returns trigger
 language plpgsql
 security definer
 set search_path to ''
as $$
begin
  if not private.es_conector() then
    return coalesce(new, old);
  end if;
  -- Anidado a propósito: plpgsql no cortocircuita el AND, y leer new.role en
  -- una tabla sin esa columna lanza 42703 en vez del 403 que toca.
  if tg_table_name = 'diagram_collaborators' and tg_op = 'INSERT' then
    if new.role = 'owner' and new.user_id = auth.uid()
       and exists (select 1 from public.diagrams d
                    where d.id = new.diagram_id and d.owner_id = auth.uid()) then
      return new;
    end if;
  end if;
  raise exception 'el conector no puede modificar %', tg_table_name using errcode = 'PT403';
end;
$$;

do $$
declare t text;
begin
  foreach t in array array[
    'profiles', 'folders', 'projects',
    'diagram_collaborators', 'diagram_invites',
    'project_collaborators', 'project_invites',
    'comment_threads', 'comment_replies',
    'image_folders', 'images',
    'notification_outbox', 'notification_prefs'
  ] loop
    execute format('drop trigger if exists conector_solo_lectura on public.%I', t);
    execute format(
      'create trigger conector_solo_lectura before insert or update or delete on public.%I '
      'for each row execute function private.conector_solo_lectura()', t);
  end loop;
end $$;

-- Storage: el conector no sube, cambia ni borra objetos (thumbnails, imágenes).
-- Restrictivas: se suman con AND a las permisivas que ya existen.
drop policy if exists conector_sin_storage_insert on storage.objects;
create policy conector_sin_storage_insert on storage.objects
  as restrictive for insert to public with check (not private.es_conector());
drop policy if exists conector_sin_storage_update on storage.objects;
create policy conector_sin_storage_update on storage.objects
  as restrictive for update to public using (not private.es_conector());
drop policy if exists conector_sin_storage_delete on storage.objects;
create policy conector_sin_storage_delete on storage.objects
  as restrictive for delete to public using (not private.es_conector());

-- ── 6. Límite de llamadas (tools de lectura) ────────────────────────────────
-- La llama el servidor MCP al empezar cada tool, con el JWT del usuario.
-- Devuelve true si la llamada entra en el límite. Poda las ventanas viejas del
-- propio usuario en la misma transacción: no hay pg_cron (PLAN-013).
create or replace function public.mcp_registrar_llamada(p_limite_por_minuto integer default 60)
 returns boolean
 language plpgsql
 security definer
 set search_path to ''
as $$
declare
  v_ventana timestamptz := date_trunc('minute', now());
  v_llamadas integer;
begin
  if not private.es_conector() or auth.uid() is null then
    raise exception 'solo para el conector' using errcode = 'PT403';
  end if;

  delete from private.mcp_ventanas
   where user_id = auth.uid() and ventana < v_ventana - interval '10 minutes';

  insert into private.mcp_ventanas as v (user_id, ventana, llamadas)
  values (auth.uid(), v_ventana, 1)
  on conflict (user_id, ventana) do update set llamadas = v.llamadas + 1
  returning llamadas into v_llamadas;

  return v_llamadas <= least(greatest(p_limite_por_minuto, 1), 120);
end;
$$;

revoke all on function public.mcp_registrar_llamada(integer) from public, anon;
grant execute on function public.mcp_registrar_llamada(integer) to authenticated;

-- ============================================================================
-- VERIFICACIÓN EN EL LABORATORIO (PLAN-039)
--  1. Sesión normal de la app: crear, editar, borrar y mover diagramas, comentar,
--     invitar y subir imágenes. Todo como hoy.
--  2. Token de conector (JWT con client_id): crear y editar el contenido de un
--     diagrama propio → ok, y una fila en private.mcp_auditoria por escritura.
--  3. Token de conector: DELETE, papelera, mover de proyecto, redeem_invite,
--     comentar, subir a storage → 403.
--  4. Token de conector: crear en el proyecto de otro usuario → 403 (SEG-11).
--  5. 21 escrituras en un minuto → la 21.ª da 429. XML de 1,1 MB → 413.
--  6. mcp_registrar_llamada: la llamada 61 del minuto devuelve false.
--  7. Huella del esquema antes/después: solo cambian los objetos de este archivo.
-- ============================================================================

-- ============================================================================
-- REVERTIR
--   drop trigger if exists conector_guardia on public.diagrams;
--   drop trigger if exists conector_auditoria on public.diagrams;
--   (y conector_solo_lectura en cada tabla de la lista del bloque 5)
--   drop policy if exists conector_sin_storage_insert on storage.objects;
--   drop policy if exists conector_sin_storage_update on storage.objects;
--   drop policy if exists conector_sin_storage_delete on storage.objects;
--   drop function if exists public.mcp_registrar_llamada(integer);
--   drop function if exists private.conector_solo_lectura();
--   drop function if exists private.conector_auditar_diagrams();
--   drop function if exists private.conector_guardia_diagrams();
--   drop function if exists private.es_conector();
--   -- La auditoría se conserva salvo decisión expresa:
--   -- drop table if exists private.mcp_ventanas; drop table if exists private.mcp_auditoria;
-- ============================================================================
