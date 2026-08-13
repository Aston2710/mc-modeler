-- Deep link enfocado: el correo de mención debe abrir el hilo exacto, no solo
-- el diagrama. Se agrega threadId al payload para construir ?d=&thread= .
create or replace function private.enqueue_mention_notifications()
returns trigger language plpgsql security definer set search_path = public as $$
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
$$;
revoke execute on function private.enqueue_mention_notifications() from public, anon, authenticated;
