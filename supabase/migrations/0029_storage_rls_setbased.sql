-- 0029_storage_rls_setbased
-- Mismo patron que 0025, ahora en las politicas SELECT de storage.objects.
-- thumbnails_select y diagram_images_select llamaban a
-- private.can_access_diagram() POR OBJETO. Coste medido sobre 194 thumbnails:
--   politica actual   12.298 ms
--   politica nueva     2.408 ms   (5.1x)
-- Equivalencia verificada antes de aplicar: 78 objetos visibles en ambas.
--
-- La semantica de seguridad NO cambia: mismo conjunto de objetos visibles,
-- expresado de forma que el planificador materialice el conjunto de diagramas
-- accesibles UNA vez en vez de evaluar 4 EXISTS por objeto.
--
-- El control de acceso de los thumbnails sigue ligado 1:1 al acceso al
-- diagrama. NO relajar: los thumbnails son SVG con el texto completo del
-- proceso (ver fix_doc/DB/08-thumbnails-seguros.md).

drop policy if exists thumbnails_select on storage.objects;
create policy thumbnails_select on storage.objects
  for select using (
    bucket_id = 'thumbnails'
    and ((storage.foldername(name))[1])::uuid in (
      select d.id from public.diagrams d
       where d.owner_id = (select auth.uid())
          or exists (select 1 from public.diagram_collaborators c
                      where c.diagram_id = d.id and c.user_id = (select auth.uid()))
          or d.project_id in (select pc.project_id from public.project_collaborators pc
                               where pc.user_id = (select auth.uid()))
          or d.project_id in (select p.id from public.projects p
                               where p.owner_id = (select auth.uid()))
    )
  );

drop policy if exists diagram_images_select on storage.objects;
create policy diagram_images_select on storage.objects
  for select using (
    bucket_id = 'diagram-images'
    and ((storage.foldername(name))[1])::uuid in (
      select d.id from public.diagrams d
       where d.owner_id = (select auth.uid())
          or exists (select 1 from public.diagram_collaborators c
                      where c.diagram_id = d.id and c.user_id = (select auth.uid()))
          or d.project_id in (select pc.project_id from public.project_collaborators pc
                               where pc.user_id = (select auth.uid()))
          or d.project_id in (select p.id from public.projects p
                               where p.owner_id = (select auth.uid()))
    )
  );

-- diagram_images_lib_select (biblioteca de imagenes) NO se toca: su predicado
-- es (foldername(name))[2] = 'imglib' sin llamada a funcion, ya es barato.
