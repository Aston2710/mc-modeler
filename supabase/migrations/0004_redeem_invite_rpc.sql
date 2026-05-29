-- RPC para canjear invitaciones: el invitado no puede leer la fila de invites
-- por RLS, así que una función SECURITY DEFINER valida el token y lo inscribe
-- como colaborador. Intencionalmente expuesta a 'authenticated' vía RPC.
create or replace function public.redeem_invite(invite_token text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  inv record;
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
  update public.diagram_invites set accepted_at = now()
    where id = inv.id and accepted_at is null;
  return inv.diagram_id;
end;
$$;

revoke execute on function public.redeem_invite(text) from public;
grant execute on function public.redeem_invite(text) to authenticated;
