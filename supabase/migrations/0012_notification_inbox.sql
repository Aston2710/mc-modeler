-- ============================================================================
-- Centro de notificaciones in-app (campanita). notification_outbox pasa a ser
-- también la fuente de la bandeja: cada quien lee SUS filas y marca read_at.
-- El correo sigue igual; email y campana comparten la misma tabla y destino.
-- ============================================================================

alter table public.notification_outbox
  add column if not exists read_at timestamptz;

-- Lectura de lo propio. Antes la tabla era invisible (RLS sin policies).
drop policy if exists notif_select_own on public.notification_outbox;
create policy notif_select_own on public.notification_outbox
  for select using (recipient_id = auth.uid());

-- Marcar leído lo propio. El grant a nivel columna limita a authenticated a
-- tocar solo read_at (no payload/sent_at/etc.), evitando abuso del retry.
drop policy if exists notif_update_own on public.notification_outbox;
create policy notif_update_own on public.notification_outbox
  for update using (recipient_id = auth.uid()) with check (recipient_id = auth.uid());

grant select on public.notification_outbox to authenticated;
grant update (read_at) on public.notification_outbox to authenticated;

-- Realtime: la campana se actualiza al instante al llegar una notificación.
alter table public.notification_outbox replica identity full;
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'notification_outbox'
  ) then
    alter publication supabase_realtime add table public.notification_outbox;
  end if;
end $$;
