-- Mueve los helpers booleanos de RLS a un schema 'private' (no expuesto por PostgREST),
-- de modo que las políticas los usen pero no queden como RPC público.
-- Resuelve los advisories 0028/0029 (SECURITY DEFINER ejecutable vía API).

create schema if not exists private;
grant usage on schema private to authenticated;

create or replace function private.can_access_diagram(d_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.diagrams d where d.id = d_id and d.owner_id = auth.uid())
      or exists (select 1 from public.diagram_collaborators c where c.diagram_id = d_id and c.user_id = auth.uid());
$$;
create or replace function private.can_edit_diagram(d_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.diagrams d where d.id = d_id and d.owner_id = auth.uid())
      or exists (select 1 from public.diagram_collaborators c where c.diagram_id = d_id and c.user_id = auth.uid() and c.role in ('owner','editor'));
$$;
create or replace function private.is_diagram_owner(d_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.diagrams d where d.id = d_id and d.owner_id = auth.uid());
$$;

revoke execute on function private.can_access_diagram(uuid) from public;
revoke execute on function private.can_edit_diagram(uuid) from public;
revoke execute on function private.is_diagram_owner(uuid) from public;
grant execute on function private.can_access_diagram(uuid) to authenticated;
grant execute on function private.can_edit_diagram(uuid) to authenticated;
grant execute on function private.is_diagram_owner(uuid) to authenticated;

-- Recrear políticas usando private.*
drop policy diagrams_select on public.diagrams;
create policy diagrams_select on public.diagrams for select using (private.can_access_diagram(id));
drop policy diagrams_update on public.diagrams;
create policy diagrams_update on public.diagrams for update using (private.can_edit_diagram(id)) with check (private.can_edit_diagram(id));

drop policy collab_select on public.diagram_collaborators;
create policy collab_select on public.diagram_collaborators for select using (user_id = auth.uid() or private.is_diagram_owner(diagram_id));
drop policy collab_insert on public.diagram_collaborators;
create policy collab_insert on public.diagram_collaborators for insert with check (private.is_diagram_owner(diagram_id) or user_id = auth.uid());
drop policy collab_delete on public.diagram_collaborators;
create policy collab_delete on public.diagram_collaborators for delete using (private.is_diagram_owner(diagram_id) or user_id = auth.uid());

drop policy invites_select on public.diagram_invites;
create policy invites_select on public.diagram_invites for select using (private.is_diagram_owner(diagram_id) or created_by = auth.uid());
drop policy invites_insert on public.diagram_invites;
create policy invites_insert on public.diagram_invites for insert with check (private.is_diagram_owner(diagram_id));
drop policy invites_delete on public.diagram_invites;
create policy invites_delete on public.diagram_invites for delete using (private.is_diagram_owner(diagram_id));

drop policy yjs_select on public.yjs_documents;
create policy yjs_select on public.yjs_documents for select using (private.can_access_diagram(diagram_id));
drop policy yjs_insert on public.yjs_documents;
create policy yjs_insert on public.yjs_documents for insert with check (private.can_edit_diagram(diagram_id));
drop policy yjs_update on public.yjs_documents;
create policy yjs_update on public.yjs_documents for update using (private.can_edit_diagram(diagram_id)) with check (private.can_edit_diagram(diagram_id));

drop policy thumbnails_select on storage.objects;
create policy thumbnails_select on storage.objects for select using (bucket_id = 'thumbnails' and private.can_access_diagram((storage.foldername(name))[1]::uuid));
drop policy thumbnails_write on storage.objects;
create policy thumbnails_write on storage.objects for insert with check (bucket_id = 'thumbnails' and private.can_edit_diagram((storage.foldername(name))[1]::uuid));
drop policy thumbnails_update on storage.objects;
create policy thumbnails_update on storage.objects for update using (bucket_id = 'thumbnails' and private.can_edit_diagram((storage.foldername(name))[1]::uuid));
drop policy thumbnails_delete on storage.objects;
create policy thumbnails_delete on storage.objects for delete using (bucket_id = 'thumbnails' and private.can_edit_diagram((storage.foldername(name))[1]::uuid));

drop function public.can_access_diagram(uuid);
drop function public.can_edit_diagram(uuid);
drop function public.is_diagram_owner(uuid);

revoke execute on function public.handle_new_user() from public;
revoke execute on function public.add_owner_as_collaborator() from public;
