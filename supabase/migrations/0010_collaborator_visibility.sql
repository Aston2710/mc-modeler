-- Menciones (@) en comentarios: cualquier colaborador necesita ver la lista de
-- colaboradores del diagrama/proyecto para el autocomplete — antes solo el
-- owner (o la fila propia). Los helpers son security definer → sin recursión RLS.

drop policy if exists collab_select on public.diagram_collaborators;
create policy collab_select on public.diagram_collaborators
  for select using (user_id = auth.uid() or private.can_access_diagram(diagram_id));

drop policy if exists project_collab_select on public.project_collaborators;
create policy project_collab_select on public.project_collaborators
  for select using (user_id = auth.uid() or private.can_access_project(project_id));
