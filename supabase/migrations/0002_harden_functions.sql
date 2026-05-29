-- Endurecimiento de funciones (resuelve advisories de seguridad).

-- search_path explícito en la función de trigger restante.
alter function public.set_updated_at() set search_path = public;

-- Las funciones de trigger no se invocan vía API → quitarlas del RPC público.
revoke execute on function public.handle_new_user() from anon, authenticated;
revoke execute on function public.add_owner_as_collaborator() from anon, authenticated;

-- Los helpers booleanos los necesita RLS para 'authenticated'; se revoca solo a 'anon'
-- (anon nunca accede a diagramas, y la app no consulta sin sesión).
revoke execute on function public.can_access_diagram(uuid) from anon;
revoke execute on function public.can_edit_diagram(uuid) from anon;
revoke execute on function public.is_diagram_owner(uuid) from anon;
