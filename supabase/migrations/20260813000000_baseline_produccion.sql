-- ============================================================================
-- BASELINE — foto del esquema de PRODUCCION al 2026-08-13
--
-- QUE ES
-- Un unico archivo que describe la base tal como esta hoy. Reemplaza a las 29
-- migraciones historicas para el proposito de CONSTRUIR el entorno local.
--
-- POR QUE
-- El historial no reproducia la base: 6 de las 35 migraciones registradas en
-- produccion no tienen archivo en el repositorio (se aplicaron con la
-- herramienta MCP, que ejecuta y registra pero no escribe el .sql). Entre
-- ellas, la que crea comment_threads/comment_replies y la que crea la tabla de
-- respaldo que 0021 necesita. Un Postgres virgen fallaba en 0008 y en 0021.
--
-- Reconstruir 35 pasos no era necesario: para levantar un entorno local basta
-- la foto de hoy. El historial sigue disponible en migrations_legacy/ para
-- consultar POR QUE la base es como es.
--
-- COMO SE OBTUVO
-- Por introspeccion de SOLO LECTURA de la base real, usando las funciones de
-- Postgres que reconstruyen DDL: pg_get_functiondef, pg_get_constraintdef,
-- pg_get_triggerdef, pg_get_expr y pg_indexes. No hay nada inventado ni
-- deducido — es lo que hay.
--
-- ALCANCE
-- Esquema unicamente. Ni una fila de datos de produccion. Los datos de
-- ejemplo para desarrollo estan en supabase/seed.sql.
--
-- REGLA
-- Este archivo NO se aplica a produccion: produccion YA es esto. Existe para
-- construir el local. Los cambios nuevos van en archivos posteriores (0030+),
-- se prueban aqui, y solo entonces se aprueban para produccion.
-- ============================================================================

set search_path = public;

-- ── Extensiones ─────────────────────────────────────────────────────────────
create extension if not exists "pgcrypto"           with schema extensions;
create extension if not exists "uuid-ossp"          with schema extensions;
create extension if not exists "pg_stat_statements" with schema extensions;
create extension if not exists "pg_net"             with schema public;

-- ── Esquema privado ─────────────────────────────────────────────────────────
-- No expuesto por PostgREST y sin grants a anon/authenticated: aqui viven los
-- helpers de RLS (security definer) y los respaldos.
create schema if not exists private;

-- ============================================================================
-- TABLAS
-- ============================================================================

create table if not exists private._xml_backup_20260723 (
  id uuid,
  name text,
  current_xml text,
  updated_at timestamp with time zone,
  backed_up_at timestamp with time zone
);

create table if not exists private.notification_config (
  id boolean default true not null,
  webhook_url text not null,
  secret text not null,
  digest_mode boolean default false not null
);

create table if not exists private.yjs_documents_backup_20260701 (
  diagram_id uuid,
  updated_at timestamp with time zone,
  state text
);

create table if not exists public.profiles (
  id uuid not null,
  email text,
  display_name text,
  avatar_url text,
  created_at timestamp with time zone default now() not null
);

create table if not exists public.folders (
  id uuid default gen_random_uuid() not null,
  owner_id uuid not null,
  name text not null,
  created_at timestamp with time zone default now() not null
);

create table if not exists public.projects (
  id uuid default gen_random_uuid() not null,
  owner_id uuid not null,
  name text not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  deleted_at timestamp with time zone
);

create table if not exists public.diagrams (
  id uuid default gen_random_uuid() not null,
  owner_id uuid not null,
  folder_id uuid,
  name text not null,
  current_xml text not null,
  element_count integer default 0 not null,
  thumbnail_path text,
  schema_version integer default 1 not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  parent_diagram_id uuid,
  sub_process_element_id text,
  project_id uuid,
  deleted_at timestamp with time zone
);

create table if not exists public.diagram_collaborators (
  diagram_id uuid not null,
  user_id uuid not null,
  role text not null,
  invited_by uuid,
  created_at timestamp with time zone default now() not null
);

create table if not exists public.diagram_invites (
  id uuid default gen_random_uuid() not null,
  diagram_id uuid not null,
  email text,
  role text not null,
  token text not null,
  created_by uuid not null,
  expires_at timestamp with time zone,
  accepted_at timestamp with time zone,
  created_at timestamp with time zone default now() not null
);

create table if not exists public.project_collaborators (
  project_id uuid not null,
  user_id uuid not null,
  role text not null,
  invited_by uuid,
  created_at timestamp with time zone default now() not null
);

create table if not exists public.project_invites (
  id uuid default gen_random_uuid() not null,
  project_id uuid not null,
  email text,
  role text not null,
  token text not null,
  created_by uuid not null,
  expires_at timestamp with time zone,
  accepted_at timestamp with time zone,
  created_at timestamp with time zone default now() not null
);

create table if not exists public.comment_threads (
  id uuid default gen_random_uuid() not null,
  diagram_id uuid not null,
  anchor jsonb not null,
  status text default 'open'::text not null,
  orphaned boolean default false not null,
  created_by uuid,
  created_by_name text default 'Usuario'::text not null,
  created_at timestamp with time zone default now() not null
);

create table if not exists public.comment_replies (
  id uuid default gen_random_uuid() not null,
  thread_id uuid not null,
  author_id uuid,
  author_name text default 'Usuario'::text not null,
  content text not null,
  created_at timestamp with time zone default now() not null,
  mentions uuid[] default '{}'::uuid[] not null
);

create table if not exists public.image_folders (
  id uuid default gen_random_uuid() not null,
  owner_id uuid not null,
  project_id uuid,
  name text not null,
  created_at timestamp with time zone default now() not null
);

create table if not exists public.images (
  id uuid default gen_random_uuid() not null,
  owner_id uuid not null,
  project_id uuid,
  folder_id uuid,
  name text not null,
  storage_path text not null,
  mime text default 'image/webp'::text not null,
  size_bytes integer default 0 not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);

create table if not exists public.notification_outbox (
  id uuid default gen_random_uuid() not null,
  recipient_id uuid,
  recipient_email text not null,
  kind text not null,
  payload jsonb default '{}'::jsonb not null,
  created_at timestamp with time zone default now() not null,
  sent_at timestamp with time zone,
  attempts integer default 0 not null,
  error text,
  read_at timestamp with time zone
);

create table if not exists public.notification_prefs (
  user_id uuid not null,
  email_enabled boolean default true not null,
  invite_events boolean default true not null,
  mention_events boolean default true not null,
  updated_at timestamp with time zone default now() not null
);

-- ============================================================================
-- RESTRICCIONES
-- ============================================================================

-- Claves primarias
alter table private.notification_config     add constraint notification_config_pkey PRIMARY KEY (id);
alter table public.comment_replies          add constraint comment_replies_pkey PRIMARY KEY (id);
alter table public.comment_threads          add constraint comment_threads_pkey PRIMARY KEY (id);
alter table public.diagram_collaborators    add constraint diagram_collaborators_pkey PRIMARY KEY (diagram_id, user_id);
alter table public.diagram_invites          add constraint diagram_invites_pkey PRIMARY KEY (id);
alter table public.diagrams                 add constraint diagrams_pkey PRIMARY KEY (id);
alter table public.folders                  add constraint folders_pkey PRIMARY KEY (id);
alter table public.image_folders            add constraint image_folders_pkey PRIMARY KEY (id);
alter table public.images                   add constraint images_pkey PRIMARY KEY (id);
alter table public.notification_outbox      add constraint notification_outbox_pkey PRIMARY KEY (id);
alter table public.notification_prefs       add constraint notification_prefs_pkey PRIMARY KEY (user_id);
alter table public.profiles                 add constraint profiles_pkey PRIMARY KEY (id);
alter table public.project_collaborators    add constraint project_collaborators_pkey PRIMARY KEY (project_id, user_id);
alter table public.project_invites          add constraint project_invites_pkey PRIMARY KEY (id);
alter table public.projects                 add constraint projects_pkey PRIMARY KEY (id);

-- Unicidad
alter table public.diagram_invites add constraint diagram_invites_token_key UNIQUE (token);
alter table public.project_invites add constraint project_invites_token_key UNIQUE (token);

-- Comprobaciones
alter table private.notification_config  add constraint notification_config_id_check CHECK (id);
alter table public.comment_threads       add constraint comment_threads_status_check CHECK ((status = ANY (ARRAY['open'::text, 'resolved'::text])));
alter table public.diagram_collaborators add constraint diagram_collaborators_role_check CHECK ((role = ANY (ARRAY['owner'::text, 'editor'::text, 'viewer'::text])));
alter table public.diagram_invites       add constraint diagram_invites_role_check CHECK ((role = ANY (ARRAY['editor'::text, 'viewer'::text])));
alter table public.notification_outbox   add constraint notification_outbox_kind_check CHECK ((kind = ANY (ARRAY['invite_redeemed_diagram'::text, 'invite_redeemed_project'::text, 'comment_mention'::text])));
alter table public.project_collaborators add constraint project_collaborators_role_check CHECK ((role = ANY (ARRAY['owner'::text, 'editor'::text, 'viewer'::text])));
alter table public.project_invites       add constraint project_invites_role_check CHECK ((role = ANY (ARRAY['editor'::text, 'viewer'::text])));

-- Claves foraneas
alter table public.profiles              add constraint profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.folders               add constraint folders_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.projects              add constraint projects_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.diagrams              add constraint diagrams_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.diagrams              add constraint diagrams_folder_id_fkey FOREIGN KEY (folder_id) REFERENCES public.folders(id) ON DELETE SET NULL;
alter table public.diagrams              add constraint diagrams_parent_diagram_id_fkey FOREIGN KEY (parent_diagram_id) REFERENCES public.diagrams(id) ON DELETE CASCADE;
alter table public.diagrams              add constraint diagrams_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE SET NULL;
alter table public.diagram_collaborators add constraint diagram_collaborators_diagram_id_fkey FOREIGN KEY (diagram_id) REFERENCES public.diagrams(id) ON DELETE CASCADE;
alter table public.diagram_collaborators add constraint diagram_collaborators_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.diagram_collaborators add constraint diagram_collaborators_invited_by_fkey FOREIGN KEY (invited_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public.diagram_invites       add constraint diagram_invites_diagram_id_fkey FOREIGN KEY (diagram_id) REFERENCES public.diagrams(id) ON DELETE CASCADE;
alter table public.diagram_invites       add constraint diagram_invites_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.project_collaborators add constraint project_collaborators_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;
alter table public.project_collaborators add constraint project_collaborators_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.project_collaborators add constraint project_collaborators_invited_by_fkey FOREIGN KEY (invited_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public.project_invites       add constraint project_invites_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;
alter table public.project_invites       add constraint project_invites_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.comment_threads       add constraint comment_threads_diagram_id_fkey FOREIGN KEY (diagram_id) REFERENCES public.diagrams(id) ON DELETE CASCADE;
alter table public.comment_threads       add constraint comment_threads_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);
alter table public.comment_replies       add constraint comment_replies_thread_id_fkey FOREIGN KEY (thread_id) REFERENCES public.comment_threads(id) ON DELETE CASCADE;
alter table public.comment_replies       add constraint comment_replies_author_id_fkey FOREIGN KEY (author_id) REFERENCES auth.users(id);
alter table public.image_folders         add constraint image_folders_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.image_folders         add constraint image_folders_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;
alter table public.images                add constraint images_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.images                add constraint images_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE SET NULL;
alter table public.images                add constraint images_folder_id_fkey FOREIGN KEY (folder_id) REFERENCES public.image_folders(id) ON DELETE SET NULL;
alter table public.notification_outbox   add constraint notification_outbox_recipient_id_fkey FOREIGN KEY (recipient_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
alter table public.notification_prefs    add constraint notification_prefs_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

-- ============================================================================
-- INDICES
-- Los parciales (WHERE deleted_at IS NULL) son de la auditoria 0022/0025: son
-- los que bajaron la lista de diagramas de 31.2 ms a 1.33 ms.
-- ============================================================================

create index if not exists comment_replies_author_idx ON public.comment_replies USING btree (author_id);
create index if not exists comment_replies_thread_idx ON public.comment_replies USING btree (thread_id);
create index if not exists comment_threads_created_by_idx ON public.comment_threads USING btree (created_by);
create index if not exists comment_threads_diagram_idx ON public.comment_threads USING btree (diagram_id);
create index if not exists collab_user_idx ON public.diagram_collaborators USING btree (user_id);
create index if not exists diagram_collaborators_invited_by_idx ON public.diagram_collaborators USING btree (invited_by);
create index if not exists diagram_invites_created_by_idx ON public.diagram_invites USING btree (created_by);
create index if not exists invites_diagram_idx ON public.diagram_invites USING btree (diagram_id);
create index if not exists diagrams_deleted_at_idx ON public.diagrams USING btree (deleted_at) WHERE (deleted_at IS NOT NULL);
create index if not exists diagrams_folder_idx ON public.diagrams USING btree (folder_id);
create index if not exists diagrams_owner_idx ON public.diagrams USING btree (owner_id);
create index if not exists diagrams_parent_idx ON public.diagrams USING btree (parent_diagram_id);
create index if not exists diagrams_project_idx ON public.diagrams USING btree (project_id);
create index if not exists diagrams_project_updated_live_idx ON public.diagrams USING btree (project_id, updated_at DESC) WHERE (deleted_at IS NULL);
create index if not exists diagrams_updated_at_live_idx ON public.diagrams USING btree (updated_at DESC) WHERE (deleted_at IS NULL);
create index if not exists folders_owner_idx ON public.folders USING btree (owner_id);
create index if not exists image_folders_owner_idx ON public.image_folders USING btree (owner_id);
create index if not exists image_folders_project_idx ON public.image_folders USING btree (project_id);
create index if not exists images_folder_idx ON public.images USING btree (folder_id);
create index if not exists images_owner_idx ON public.images USING btree (owner_id);
create index if not exists images_project_idx ON public.images USING btree (project_id);
create index if not exists notification_outbox_recipient_idx ON public.notification_outbox USING btree (recipient_id);
create index if not exists notification_outbox_unsent_idx ON public.notification_outbox USING btree (created_at) WHERE (sent_at IS NULL);
create index if not exists project_collab_user_idx ON public.project_collaborators USING btree (user_id);
create index if not exists project_collaborators_invited_by_idx ON public.project_collaborators USING btree (invited_by);
create index if not exists project_invites_created_by_idx ON public.project_invites USING btree (created_by);
create index if not exists project_invites_project_idx ON public.project_invites USING btree (project_id);
create index if not exists projects_deleted_at_idx ON public.projects USING btree (deleted_at) WHERE (deleted_at IS NOT NULL);
create index if not exists projects_owner_idx ON public.projects USING btree (owner_id);

-- ============================================================================
-- FUNCIONES
-- Los helpers de private son SECURITY DEFINER con search_path fijado: es lo
-- que permite que las politicas de RLS consulten tablas que el usuario no
-- puede leer directamente, sin abrir un agujero.
-- ============================================================================

CREATE OR REPLACE FUNCTION private.can_access_diagram(d_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (select 1 from public.diagrams d where d.id = d_id and d.owner_id = auth.uid())
      or exists (select 1 from public.diagram_collaborators c where c.diagram_id = d_id and c.user_id = auth.uid())
      or exists (
        select 1 from public.diagrams d
        join public.project_collaborators pc on pc.project_id = d.project_id
        where d.id = d_id and pc.user_id = auth.uid()
      )
      or exists (
        select 1 from public.diagrams d
        join public.projects p on p.id = d.project_id
        where d.id = d_id and p.owner_id = auth.uid()
      );
$function$;

CREATE OR REPLACE FUNCTION private.can_access_project(p_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (select 1 from public.projects p where p.id = p_id and p.owner_id = auth.uid())
      or exists (select 1 from public.project_collaborators c where c.project_id = p_id and c.user_id = auth.uid());
$function$;

CREATE OR REPLACE FUNCTION private.can_edit_diagram(d_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (select 1 from public.diagrams d where d.id = d_id and d.owner_id = auth.uid())
      or exists (select 1 from public.diagram_collaborators c where c.diagram_id = d_id and c.user_id = auth.uid() and c.role in ('owner','editor'))
      or exists (
        select 1 from public.diagrams d
        join public.project_collaborators pc on pc.project_id = d.project_id
        where d.id = d_id and pc.user_id = auth.uid() and pc.role in ('owner','editor')
      )
      or exists (
        select 1 from public.diagrams d
        join public.projects p on p.id = d.project_id
        where d.id = d_id and p.owner_id = auth.uid()
      );
$function$;

CREATE OR REPLACE FUNCTION private.can_edit_project(p_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (select 1 from public.projects p where p.id = p_id and p.owner_id = auth.uid())
      or exists (select 1 from public.project_collaborators c where c.project_id = p_id and c.user_id = auth.uid() and c.role in ('owner','editor'));
$function$;

CREATE OR REPLACE FUNCTION private.is_diagram_owner(d_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (select 1 from public.diagrams d where d.id = d_id and d.owner_id = auth.uid());
$function$;

CREATE OR REPLACE FUNCTION private.is_project_owner(p_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (select 1 from public.projects p where p.id = p_id and p.owner_id = auth.uid());
$function$;

CREATE OR REPLACE FUNCTION private.user_can_access_diagram(d_id uuid, u_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (select 1 from public.diagrams d where d.id = d_id and d.owner_id = u_id)
      or exists (select 1 from public.diagram_collaborators c where c.diagram_id = d_id and c.user_id = u_id)
      or exists (
        select 1 from public.diagrams d
        join public.project_collaborators pc on pc.project_id = d.project_id
        where d.id = d_id and pc.user_id = u_id)
      or exists (
        select 1 from public.diagrams d
        join public.projects p on p.id = d.project_id
        where d.id = d_id and p.owner_id = u_id);
$function$;

CREATE OR REPLACE FUNCTION private.deliver_notification()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  cfg record;
  prefs record;
begin
  select * into cfg from private.notification_config limit 1;
  if not found then return new; end if;

  if cfg.digest_mode then return new; end if;

  select * into prefs from public.notification_prefs where user_id = new.recipient_id;
  if found then
    if not prefs.email_enabled then return new; end if;
    if new.kind in ('invite_redeemed_diagram','invite_redeemed_project')
       and not prefs.invite_events then return new; end if;
    if new.kind = 'comment_mention' and not prefs.mention_events then return new; end if;
  end if;

  begin
    perform net.http_post(
      url  := cfg.webhook_url,
      body := jsonb_build_object(
        'secret',          cfg.secret,
        'id',              new.id,
        'recipient_email', new.recipient_email,
        'kind',            new.kind,
        'payload',         new.payload
      )
    );
  exception when others then
    null;
  end;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION private.enqueue_mention_notifications()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  d_id uuid;
  d_name text;
  anchor_label text;
begin
  if new.mentions is null or array_length(new.mentions, 1) is null then
    return new;
  end if;

  select t.diagram_id, coalesce(t.anchor->>'elementLabel', ''), d.name
    into d_id, anchor_label, d_name
  from public.comment_threads t
  join public.diagrams d on d.id = t.diagram_id
  where t.id = new.thread_id;
  if d_id is null then return new; end if;

  insert into public.notification_outbox (recipient_id, recipient_email, kind, payload)
  select p.id, p.email, 'comment_mention',
         jsonb_build_object(
           'diagramId',    d_id,
           'diagramName',  coalesce(d_name, 'Diagrama'),
           'threadId',     new.thread_id,
           'actorName',    coalesce(new.author_name, 'Alguien'),
           'excerpt',      left(new.content, 300),
           'elementLabel', anchor_label)
  from (select distinct unnest(new.mentions) as uid) m
  join public.profiles p on p.id = m.uid
  where m.uid is distinct from new.author_id
    and p.email is not null
    and private.user_can_access_diagram(d_id, m.uid);

  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  insert into public.profiles (id, email, display_name, avatar_url)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', new.email),
    new.raw_user_meta_data->>'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.add_owner_as_collaborator()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  insert into public.diagram_collaborators (diagram_id, user_id, role, invited_by)
  values (new.id, new.owner_id, 'owner', new.owner_id)
  on conflict do nothing;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.add_project_owner_as_collaborator()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  insert into public.project_collaborators (project_id, user_id, role, invited_by)
  values (new.id, new.owner_id, 'owner', new.owner_id)
  on conflict do nothing;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.redeem_invite(invite_token text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  inv record;
  inserted int;
  actor record;
  d_name text;
begin
  select * into inv from public.diagram_invites where token = invite_token limit 1;
  if not found then
    raise exception 'Invitación inválida';
  end if;
  if inv.expires_at is not null and inv.expires_at < now() then
    raise exception 'Invitación expirada';
  end if;

  insert into public.diagram_collaborators (diagram_id, user_id, role, invited_by)
  values (inv.diagram_id, auth.uid(), inv.role, inv.created_by)
  on conflict (diagram_id, user_id) do nothing;
  get diagnostics inserted = row_count;

  update public.diagram_invites set accepted_at = now()
    where id = inv.id and accepted_at is null;

  if inserted > 0 then
    select coalesce(display_name, email, 'Alguien') as name, email
      into actor from public.profiles where id = auth.uid();
    select name into d_name from public.diagrams where id = inv.diagram_id;

    insert into public.notification_outbox (recipient_id, recipient_email, kind, payload)
    select dc.user_id, p.email, 'invite_redeemed_diagram',
           jsonb_build_object(
             'diagramId',   inv.diagram_id,
             'diagramName', coalesce(d_name, 'Diagrama'),
             'actorName',   actor.name,
             'actorEmail',  actor.email,
             'role',        inv.role)
    from public.diagram_collaborators dc
    join public.profiles p on p.id = dc.user_id
    where dc.diagram_id = inv.diagram_id
      and dc.user_id <> auth.uid()
      and p.email is not null;
  end if;

  return inv.diagram_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.redeem_project_invite(invite_token text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  inv record;
  inserted int;
  actor record;
  p_name text;
begin
  select * into inv from public.project_invites where token = invite_token limit 1;
  if not found then
    raise exception 'Invitación inválida';
  end if;
  if inv.expires_at is not null and inv.expires_at < now() then
    raise exception 'Invitación expirada';
  end if;

  insert into public.project_collaborators (project_id, user_id, role, invited_by)
  values (inv.project_id, auth.uid(), inv.role, inv.created_by)
  on conflict (project_id, user_id) do nothing;
  get diagnostics inserted = row_count;

  update public.project_invites set accepted_at = now()
    where id = inv.id and accepted_at is null;

  if inserted > 0 then
    select coalesce(display_name, email, 'Alguien') as name, email
      into actor from public.profiles where id = auth.uid();
    select name into p_name from public.projects where id = inv.project_id;

    insert into public.notification_outbox (recipient_id, recipient_email, kind, payload)
    select pc.user_id, p.email, 'invite_redeemed_project',
           jsonb_build_object(
             'projectId',   inv.project_id,
             'projectName', coalesce(p_name, 'Proyecto'),
             'actorName',   actor.name,
             'actorEmail',  actor.email,
             'role',        inv.role)
    from public.project_collaborators pc
    join public.profiles p on p.id = pc.user_id
    where pc.project_id = inv.project_id
      and pc.user_id <> auth.uid()
      and p.email is not null;
  end if;

  return inv.project_id;
end;
$function$;

-- ============================================================================
-- DISPARADORES
-- ============================================================================

drop trigger if exists on_auth_user_created on auth.users;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

drop trigger if exists diagrams_add_owner on public.diagrams;
CREATE TRIGGER diagrams_add_owner AFTER INSERT ON public.diagrams FOR EACH ROW EXECUTE FUNCTION public.add_owner_as_collaborator();

drop trigger if exists diagrams_set_updated_at on public.diagrams;
CREATE TRIGGER diagrams_set_updated_at BEFORE UPDATE ON public.diagrams FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

drop trigger if exists projects_add_owner on public.projects;
CREATE TRIGGER projects_add_owner AFTER INSERT ON public.projects FOR EACH ROW EXECUTE FUNCTION public.add_project_owner_as_collaborator();

drop trigger if exists projects_set_updated_at on public.projects;
CREATE TRIGGER projects_set_updated_at BEFORE UPDATE ON public.projects FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

drop trigger if exists images_set_updated_at on public.images;
CREATE TRIGGER images_set_updated_at BEFORE UPDATE ON public.images FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

drop trigger if exists comment_replies_mentions on public.comment_replies;
CREATE TRIGGER comment_replies_mentions AFTER INSERT ON public.comment_replies FOR EACH ROW EXECUTE FUNCTION private.enqueue_mention_notifications();

drop trigger if exists notification_outbox_deliver on public.notification_outbox;
CREATE TRIGGER notification_outbox_deliver AFTER INSERT ON public.notification_outbox FOR EACH ROW EXECUTE FUNCTION private.deliver_notification();

-- ============================================================================
-- PERMISOS
--
-- LECCION DE 0023: un REVOKE por columna es un NO-OP si existe un GRANT de
-- tabla. Por eso el orden importa — primero se conceden los privilegios de
-- tabla, LUEGO se revoca UPDATE de tabla en diagrams/projects, y solo entonces
-- se conceden los UPDATE por columna. owner_id queda deliberadamente fuera:
-- un cliente no puede regalarse la propiedad de un diagrama ajeno.
-- El esquema private no recibe ningun permiso.
-- ============================================================================

grant usage on schema public to anon, authenticated, service_role;

grant select, insert, update, delete, truncate, references, trigger
  on all tables in schema public to anon, authenticated, service_role;

revoke update on public.diagrams from anon, authenticated;
revoke update on public.projects from anon, authenticated;

grant update (id, name, current_xml, element_count, thumbnail_path, schema_version,
              folder_id, project_id, parent_diagram_id, sub_process_element_id,
              created_at, updated_at, deleted_at)
  on public.diagrams to anon, authenticated;

grant update (id, name, created_at, updated_at, deleted_at)
  on public.projects to anon, authenticated;

revoke all on all tables in schema private from anon, authenticated;

-- ============================================================================
-- RLS
-- ============================================================================

alter table public.profiles              enable row level security;
alter table public.folders               enable row level security;
alter table public.projects              enable row level security;
alter table public.diagrams              enable row level security;
alter table public.diagram_collaborators enable row level security;
alter table public.diagram_invites       enable row level security;
alter table public.project_collaborators enable row level security;
alter table public.project_invites       enable row level security;
alter table public.comment_threads       enable row level security;
alter table public.comment_replies       enable row level security;
alter table public.image_folders         enable row level security;
alter table public.images                enable row level security;
alter table public.notification_outbox   enable row level security;
alter table public.notification_prefs    enable row level security;

-- ── profiles ────────────────────────────────────────────────────────────────
drop policy if exists profiles_select_self on public.profiles;
create policy profiles_select_self on public.profiles for select to public using (true);
drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles for update to public using ((id = ( SELECT auth.uid() AS uid)));
drop policy if exists profiles_upsert_self on public.profiles;
create policy profiles_upsert_self on public.profiles for insert to public with check ((id = ( SELECT auth.uid() AS uid)));

-- ── folders ─────────────────────────────────────────────────────────────────
drop policy if exists folders_all_owner on public.folders;
create policy folders_all_owner on public.folders for all to public using ((owner_id = ( SELECT auth.uid() AS uid))) with check ((owner_id = ( SELECT auth.uid() AS uid)));

-- ── projects ────────────────────────────────────────────────────────────────
drop policy if exists projects_select on public.projects;
create policy projects_select on public.projects for select to public using (((owner_id = ( SELECT auth.uid() AS uid)) OR (id IN ( SELECT pc.project_id FROM project_collaborators pc WHERE (pc.user_id = ( SELECT auth.uid() AS uid))))));
drop policy if exists projects_insert on public.projects;
create policy projects_insert on public.projects for insert to public with check ((owner_id = ( SELECT auth.uid() AS uid)));
drop policy if exists projects_update on public.projects;
create policy projects_update on public.projects for update to public using (private.can_edit_project(id)) with check (private.can_edit_project(id));
drop policy if exists projects_delete on public.projects;
create policy projects_delete on public.projects for delete to public using ((owner_id = ( SELECT auth.uid() AS uid)));

-- ── diagrams ────────────────────────────────────────────────────────────────
-- El SELECT esta escrito en forma de conjuntos (IN) a proposito, no con
-- EXISTS correlacionado: es el cambio de 0025 que bajo la lista a 1.33 ms.
drop policy if exists diagrams_select on public.diagrams;
create policy diagrams_select on public.diagrams for select to public using (((owner_id = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1 FROM diagram_collaborators c WHERE ((c.diagram_id = diagrams.id) AND (c.user_id = ( SELECT auth.uid() AS uid))))) OR (project_id IN ( SELECT pc.project_id FROM project_collaborators pc WHERE (pc.user_id = ( SELECT auth.uid() AS uid)))) OR (project_id IN ( SELECT p.id FROM projects p WHERE (p.owner_id = ( SELECT auth.uid() AS uid))))));
drop policy if exists diagrams_insert on public.diagrams;
create policy diagrams_insert on public.diagrams for insert to public with check ((owner_id = ( SELECT auth.uid() AS uid)));
drop policy if exists diagrams_update on public.diagrams;
create policy diagrams_update on public.diagrams for update to public using (private.can_edit_diagram(id)) with check (private.can_edit_diagram(id));
drop policy if exists diagrams_delete on public.diagrams;
create policy diagrams_delete on public.diagrams for delete to public using ((owner_id = ( SELECT auth.uid() AS uid)));

-- ── colaboradores e invitaciones ────────────────────────────────────────────
drop policy if exists collab_select on public.diagram_collaborators;
create policy collab_select on public.diagram_collaborators for select to public using (((user_id = ( SELECT auth.uid() AS uid)) OR private.can_access_diagram(diagram_id)));
drop policy if exists collab_insert on public.diagram_collaborators;
create policy collab_insert on public.diagram_collaborators for insert to public with check ((private.is_diagram_owner(diagram_id) OR (user_id = ( SELECT auth.uid() AS uid))));
drop policy if exists collab_delete on public.diagram_collaborators;
create policy collab_delete on public.diagram_collaborators for delete to public using ((private.is_diagram_owner(diagram_id) OR (user_id = ( SELECT auth.uid() AS uid))));

drop policy if exists invites_select on public.diagram_invites;
create policy invites_select on public.diagram_invites for select to public using ((private.is_diagram_owner(diagram_id) OR (created_by = ( SELECT auth.uid() AS uid))));
drop policy if exists invites_insert on public.diagram_invites;
create policy invites_insert on public.diagram_invites for insert to public with check (private.is_diagram_owner(diagram_id));
drop policy if exists invites_delete on public.diagram_invites;
create policy invites_delete on public.diagram_invites for delete to public using (private.is_diagram_owner(diagram_id));

drop policy if exists project_collab_select on public.project_collaborators;
create policy project_collab_select on public.project_collaborators for select to public using (((user_id = ( SELECT auth.uid() AS uid)) OR private.can_access_project(project_id)));
drop policy if exists project_collab_insert on public.project_collaborators;
create policy project_collab_insert on public.project_collaborators for insert to public with check ((private.is_project_owner(project_id) OR (user_id = ( SELECT auth.uid() AS uid))));
drop policy if exists project_collab_delete on public.project_collaborators;
create policy project_collab_delete on public.project_collaborators for delete to public using ((private.is_project_owner(project_id) OR (user_id = ( SELECT auth.uid() AS uid))));

drop policy if exists project_invites_select on public.project_invites;
create policy project_invites_select on public.project_invites for select to public using ((private.is_project_owner(project_id) OR (created_by = ( SELECT auth.uid() AS uid))));
drop policy if exists project_invites_insert on public.project_invites;
create policy project_invites_insert on public.project_invites for insert to public with check (private.is_project_owner(project_id));
drop policy if exists project_invites_delete on public.project_invites;
create policy project_invites_delete on public.project_invites for delete to public using (private.is_project_owner(project_id));

-- ── comentarios ─────────────────────────────────────────────────────────────
-- El acceso se deriva del acceso al diagrama; borrar, solo el autor.
drop policy if exists ct_select on public.comment_threads;
create policy ct_select on public.comment_threads for select to public using (private.can_access_diagram(diagram_id));
drop policy if exists ct_insert on public.comment_threads;
create policy ct_insert on public.comment_threads for insert to public with check (private.can_access_diagram(diagram_id));
drop policy if exists ct_update on public.comment_threads;
create policy ct_update on public.comment_threads for update to public using (private.can_edit_diagram(diagram_id)) with check (private.can_edit_diagram(diagram_id));
drop policy if exists ct_delete on public.comment_threads;
create policy ct_delete on public.comment_threads for delete to public using ((created_by = ( SELECT auth.uid() AS uid)));

drop policy if exists cr_select on public.comment_replies;
create policy cr_select on public.comment_replies for select to public using ((EXISTS ( SELECT 1 FROM comment_threads t WHERE ((t.id = comment_replies.thread_id) AND private.can_access_diagram(t.diagram_id)))));
drop policy if exists cr_insert on public.comment_replies;
create policy cr_insert on public.comment_replies for insert to public with check ((EXISTS ( SELECT 1 FROM comment_threads t WHERE ((t.id = comment_replies.thread_id) AND private.can_access_diagram(t.diagram_id)))));
drop policy if exists cr_delete on public.comment_replies;
create policy cr_delete on public.comment_replies for delete to public using ((author_id = ( SELECT auth.uid() AS uid)));

-- ── biblioteca de imagenes ──────────────────────────────────────────────────
drop policy if exists image_folders_select on public.image_folders;
create policy image_folders_select on public.image_folders for select to authenticated using (true);
drop policy if exists image_folders_insert on public.image_folders;
create policy image_folders_insert on public.image_folders for insert to public with check (((owner_id = ( SELECT auth.uid() AS uid)) AND ((project_id IS NULL) OR private.can_edit_project(project_id))));
drop policy if exists image_folders_update on public.image_folders;
create policy image_folders_update on public.image_folders for update to public using (((owner_id = ( SELECT auth.uid() AS uid)) OR ((project_id IS NOT NULL) AND private.can_edit_project(project_id)))) with check (((owner_id = ( SELECT auth.uid() AS uid)) OR ((project_id IS NOT NULL) AND private.can_edit_project(project_id))));
drop policy if exists image_folders_delete on public.image_folders;
create policy image_folders_delete on public.image_folders for delete to public using (((owner_id = ( SELECT auth.uid() AS uid)) OR ((project_id IS NOT NULL) AND private.can_edit_project(project_id))));

drop policy if exists images_select on public.images;
create policy images_select on public.images for select to authenticated using (true);
drop policy if exists images_insert on public.images;
create policy images_insert on public.images for insert to public with check (((owner_id = ( SELECT auth.uid() AS uid)) AND ((project_id IS NULL) OR private.can_edit_project(project_id))));
drop policy if exists images_update on public.images;
create policy images_update on public.images for update to public using (((owner_id = ( SELECT auth.uid() AS uid)) OR ((project_id IS NOT NULL) AND private.can_edit_project(project_id)))) with check (((owner_id = ( SELECT auth.uid() AS uid)) OR ((project_id IS NOT NULL) AND private.can_edit_project(project_id))));
drop policy if exists images_delete on public.images;
create policy images_delete on public.images for delete to public using (((owner_id = ( SELECT auth.uid() AS uid)) OR ((project_id IS NOT NULL) AND private.can_edit_project(project_id))));

-- ── notificaciones ──────────────────────────────────────────────────────────
drop policy if exists notif_select_own on public.notification_outbox;
create policy notif_select_own on public.notification_outbox for select to public using ((recipient_id = ( SELECT auth.uid() AS uid)));
drop policy if exists notif_update_own on public.notification_outbox;
create policy notif_update_own on public.notification_outbox for update to public using ((recipient_id = ( SELECT auth.uid() AS uid))) with check ((recipient_id = ( SELECT auth.uid() AS uid)));

drop policy if exists notif_prefs_select on public.notification_prefs;
create policy notif_prefs_select on public.notification_prefs for select to public using ((user_id = ( SELECT auth.uid() AS uid)));
drop policy if exists notif_prefs_upsert on public.notification_prefs;
create policy notif_prefs_upsert on public.notification_prefs for insert to public with check ((user_id = ( SELECT auth.uid() AS uid)));
drop policy if exists notif_prefs_update on public.notification_prefs;
create policy notif_prefs_update on public.notification_prefs for update to public using ((user_id = ( SELECT auth.uid() AS uid))) with check ((user_id = ( SELECT auth.uid() AS uid)));

-- ============================================================================
-- STORAGE
-- Los thumbnails son SVG con el texto completo del proceso: su acceso va
-- ligado 1:1 al acceso al diagrama. NO relajar.
-- ============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('thumbnails', 'thumbnails', false, 2097152, '{image/svg+xml,image/webp,image/png}')
on conflict (id) do nothing;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('diagram-images', 'diagram-images', false, 10485760, '{image/webp,image/png,image/jpeg,image/svg+xml}')
on conflict (id) do nothing;

drop policy if exists thumbnails_select on storage.objects;
create policy thumbnails_select on storage.objects for select to public using (((bucket_id = 'thumbnails'::text) AND (((storage.foldername(name))[1])::uuid IN ( SELECT d.id FROM diagrams d WHERE ((d.owner_id = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1 FROM diagram_collaborators c WHERE ((c.diagram_id = d.id) AND (c.user_id = ( SELECT auth.uid() AS uid))))) OR (d.project_id IN ( SELECT pc.project_id FROM project_collaborators pc WHERE (pc.user_id = ( SELECT auth.uid() AS uid)))) OR (d.project_id IN ( SELECT p.id FROM projects p WHERE (p.owner_id = ( SELECT auth.uid() AS uid)))))))));
drop policy if exists thumbnails_write on storage.objects;
create policy thumbnails_write on storage.objects for insert to public with check (((bucket_id = 'thumbnails'::text) AND private.can_edit_diagram(((storage.foldername(name))[1])::uuid)));
drop policy if exists thumbnails_update on storage.objects;
create policy thumbnails_update on storage.objects for update to public using (((bucket_id = 'thumbnails'::text) AND private.can_edit_diagram(((storage.foldername(name))[1])::uuid)));
drop policy if exists thumbnails_delete on storage.objects;
create policy thumbnails_delete on storage.objects for delete to public using (((bucket_id = 'thumbnails'::text) AND private.can_edit_diagram(((storage.foldername(name))[1])::uuid)));

drop policy if exists diagram_images_select on storage.objects;
create policy diagram_images_select on storage.objects for select to public using (((bucket_id = 'diagram-images'::text) AND (((storage.foldername(name))[1])::uuid IN ( SELECT d.id FROM diagrams d WHERE ((d.owner_id = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1 FROM diagram_collaborators c WHERE ((c.diagram_id = d.id) AND (c.user_id = ( SELECT auth.uid() AS uid))))) OR (d.project_id IN ( SELECT pc.project_id FROM project_collaborators pc WHERE (pc.user_id = ( SELECT auth.uid() AS uid)))) OR (d.project_id IN ( SELECT p.id FROM projects p WHERE (p.owner_id = ( SELECT auth.uid() AS uid)))))))));
drop policy if exists diagram_images_insert on storage.objects;
create policy diagram_images_insert on storage.objects for insert to public with check (((bucket_id = 'diagram-images'::text) AND private.can_edit_diagram(((storage.foldername(name))[1])::uuid)));
drop policy if exists diagram_images_update on storage.objects;
create policy diagram_images_update on storage.objects for update to public using (((bucket_id = 'diagram-images'::text) AND private.can_edit_diagram(((storage.foldername(name))[1])::uuid)));
drop policy if exists diagram_images_delete on storage.objects;
create policy diagram_images_delete on storage.objects for delete to public using (((bucket_id = 'diagram-images'::text) AND private.can_edit_diagram(((storage.foldername(name))[1])::uuid)));

-- Biblioteca de imagenes: la carpeta [1] es el owner o el proyecto, y [2] es
-- el marcador 'imglib'. No cuelgan de un diagrama.
drop policy if exists diagram_images_lib_select on storage.objects;
create policy diagram_images_lib_select on storage.objects for select to authenticated using (((bucket_id = 'diagram-images'::text) AND ((storage.foldername(name))[2] = 'imglib'::text)));
drop policy if exists diagram_images_lib_insert on storage.objects;
create policy diagram_images_lib_insert on storage.objects for insert to public with check (((bucket_id = 'diagram-images'::text) AND ((storage.foldername(name))[2] = 'imglib'::text) AND ((((storage.foldername(name))[1])::uuid = auth.uid()) OR private.can_edit_project(((storage.foldername(name))[1])::uuid))));
drop policy if exists diagram_images_lib_update on storage.objects;
create policy diagram_images_lib_update on storage.objects for update to public using (((bucket_id = 'diagram-images'::text) AND ((storage.foldername(name))[2] = 'imglib'::text) AND ((((storage.foldername(name))[1])::uuid = auth.uid()) OR private.can_edit_project(((storage.foldername(name))[1])::uuid))));
drop policy if exists diagram_images_lib_delete on storage.objects;
create policy diagram_images_lib_delete on storage.objects for delete to public using (((bucket_id = 'diagram-images'::text) AND ((storage.foldername(name))[2] = 'imglib'::text) AND ((((storage.foldername(name))[1])::uuid = auth.uid()) OR private.can_edit_project(((storage.foldername(name))[1])::uuid))));

-- ============================================================================
-- REALTIME
-- Solo 5 tablas publicadas. diagrams NO esta: se sincroniza por broadcast, no
-- por replicacion — publicarla fue el 73 % del CPU que diagnostico la auditoria.
-- replica identity full es necesario para que un DELETE publique la fila
-- completa y el filtro por diagram_id del canal pueda emparejar.
-- ============================================================================

alter table public.comment_threads     replica identity full;
alter table public.comment_replies     replica identity full;
alter table public.images              replica identity full;
alter table public.image_folders       replica identity full;
alter table public.notification_outbox replica identity full;

do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
end $$;

do $$
declare t text;
begin
  foreach t in array array['comment_threads','comment_replies','images','image_folders','notification_outbox'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname='supabase_realtime' and schemaname='public' and tablename=t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
