-- 0024_rls_initplan
-- auth.uid() desnudo se reevalua POR FILA. Envuelto en (select ...) se
-- convierte en un InitPlan que se ejecuta UNA sola vez por consulta.
-- Reportado por el linter auth_rls_initplan en 22 politicas.
-- Cambio mecanico, misma semantica exacta.
--
-- Nota: pg_policies deparsa `(select auth.uid())` como `( SELECT auth.uid() AS uid)`.
-- Un grep de '%select auth.uid()%' NO lo encuentra — no es un fallo.

-- profiles
drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles
  for update using (id = (select auth.uid()));
drop policy if exists profiles_upsert_self on public.profiles;
create policy profiles_upsert_self on public.profiles
  for insert with check (id = (select auth.uid()));

-- folders
drop policy if exists folders_all_owner on public.folders;
create policy folders_all_owner on public.folders
  for all using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

-- diagrams (INSERT/DELETE; el SELECT va en 0025)
drop policy if exists diagrams_insert on public.diagrams;
create policy diagrams_insert on public.diagrams
  for insert with check (owner_id = (select auth.uid()));
drop policy if exists diagrams_delete on public.diagrams;
create policy diagrams_delete on public.diagrams
  for delete using (owner_id = (select auth.uid()));

-- projects (INSERT/DELETE; el SELECT va en 0025)
drop policy if exists projects_insert on public.projects;
create policy projects_insert on public.projects
  for insert with check (owner_id = (select auth.uid()));
drop policy if exists projects_delete on public.projects;
create policy projects_delete on public.projects
  for delete using (owner_id = (select auth.uid()));

-- diagram_collaborators
drop policy if exists collab_select on public.diagram_collaborators;
create policy collab_select on public.diagram_collaborators
  for select using (user_id = (select auth.uid()) or private.can_access_diagram(diagram_id));
drop policy if exists collab_insert on public.diagram_collaborators;
create policy collab_insert on public.diagram_collaborators
  for insert with check (private.is_diagram_owner(diagram_id) or user_id = (select auth.uid()));
drop policy if exists collab_delete on public.diagram_collaborators;
create policy collab_delete on public.diagram_collaborators
  for delete using (private.is_diagram_owner(diagram_id) or user_id = (select auth.uid()));

-- project_collaborators
drop policy if exists project_collab_select on public.project_collaborators;
create policy project_collab_select on public.project_collaborators
  for select using (user_id = (select auth.uid()) or private.can_access_project(project_id));
drop policy if exists project_collab_insert on public.project_collaborators;
create policy project_collab_insert on public.project_collaborators
  for insert with check (private.is_project_owner(project_id) or user_id = (select auth.uid()));
drop policy if exists project_collab_delete on public.project_collaborators;
create policy project_collab_delete on public.project_collaborators
  for delete using (private.is_project_owner(project_id) or user_id = (select auth.uid()));

-- invites
drop policy if exists invites_select on public.diagram_invites;
create policy invites_select on public.diagram_invites
  for select using (private.is_diagram_owner(diagram_id) or created_by = (select auth.uid()));
drop policy if exists project_invites_select on public.project_invites;
create policy project_invites_select on public.project_invites
  for select using (private.is_project_owner(project_id) or created_by = (select auth.uid()));

-- comentarios
drop policy if exists ct_delete on public.comment_threads;
create policy ct_delete on public.comment_threads
  for delete using (created_by = (select auth.uid()));
drop policy if exists cr_delete on public.comment_replies;
create policy cr_delete on public.comment_replies
  for delete using (author_id = (select auth.uid()));

-- notificaciones
drop policy if exists notif_select_own on public.notification_outbox;
create policy notif_select_own on public.notification_outbox
  for select using (recipient_id = (select auth.uid()));
drop policy if exists notif_update_own on public.notification_outbox;
create policy notif_update_own on public.notification_outbox
  for update using (recipient_id = (select auth.uid()))
  with check (recipient_id = (select auth.uid()));

drop policy if exists notif_prefs_select on public.notification_prefs;
create policy notif_prefs_select on public.notification_prefs
  for select using (user_id = (select auth.uid()));
drop policy if exists notif_prefs_upsert on public.notification_prefs;
create policy notif_prefs_upsert on public.notification_prefs
  for insert with check (user_id = (select auth.uid()));
drop policy if exists notif_prefs_update on public.notification_prefs;
create policy notif_prefs_update on public.notification_prefs
  for update using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- images (SELECT sigue siendo `true` para authenticated: decision deliberada,
-- biblioteca compartida entre todo usuario autenticado — commit 752484c)
drop policy if exists images_insert on public.images;
create policy images_insert on public.images
  for insert with check (
    owner_id = (select auth.uid())
    and (project_id is null or private.can_edit_project(project_id)));
drop policy if exists images_update on public.images;
create policy images_update on public.images
  for update using (
    owner_id = (select auth.uid())
    or (project_id is not null and private.can_edit_project(project_id)))
  with check (
    owner_id = (select auth.uid())
    or (project_id is not null and private.can_edit_project(project_id)));
drop policy if exists images_delete on public.images;
create policy images_delete on public.images
  for delete using (
    owner_id = (select auth.uid())
    or (project_id is not null and private.can_edit_project(project_id)));

-- image_folders
drop policy if exists image_folders_insert on public.image_folders;
create policy image_folders_insert on public.image_folders
  for insert with check (
    owner_id = (select auth.uid())
    and (project_id is null or private.can_edit_project(project_id)));
drop policy if exists image_folders_update on public.image_folders;
create policy image_folders_update on public.image_folders
  for update using (
    owner_id = (select auth.uid())
    or (project_id is not null and private.can_edit_project(project_id)))
  with check (
    owner_id = (select auth.uid())
    or (project_id is not null and private.can_edit_project(project_id)));
drop policy if exists image_folders_delete on public.image_folders;
create policy image_folders_delete on public.image_folders
  for delete using (
    owner_id = (select auth.uid())
    or (project_id is not null and private.can_edit_project(project_id)));
