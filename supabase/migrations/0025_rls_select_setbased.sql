-- 0025_rls_select_setbased
-- P1: private.can_access_diagram(id) se evaluaba UNA VEZ POR FILA y ejecutaba
-- 4 subconsultas EXISTS en cada evaluacion. Coste ~63 us/fila, LINEAL.
--
-- Benchmark en caliente, 132 filas, 10 iteraciones tras 3 de calentamiento:
--   sin RLS (baseline)          0.0449 ms/consulta
--   predicado conjuntista       0.262  ms/consulta   <- este cambio
--   RLS por funcion (anterior)  8.733  ms/consulta   = 194x el baseline
--
-- Efecto end-to-end en la consulta de lista (getAll, usuario con 78 visibles):
--   antes   31.212 ms · 1344 buffers · Seq Scan + Sort
--   despues  1.330 ms ·  121 buffers · Index Scan (diagrams_updated_at_live_idx)
--
-- Equivalencia PROBADA sobre datos reales antes de aplicar:
--   23 usuarios evaluados, 23 md5 identicos, 0 divergentes, 497 filas en ambas.
--
-- Solo se cambian las politicas SELECT, que son las que se aplican sobre
-- conjuntos grandes. Las de UPDATE/DELETE siguen usando can_edit_* porque se
-- evaluan sobre una fila concreta, donde no hay diferencia.
-- Las funciones private.can_* NO se eliminan: siguen en uso.

drop policy if exists diagrams_select on public.diagrams;
create policy diagrams_select on public.diagrams
  for select using (
       owner_id = (select auth.uid())
    or exists (
         select 1 from public.diagram_collaborators c
          where c.diagram_id = diagrams.id
            and c.user_id = (select auth.uid()))
    or project_id in (
         select pc.project_id from public.project_collaborators pc
          where pc.user_id = (select auth.uid()))
    or project_id in (
         select p.id from public.projects p
          where p.owner_id = (select auth.uid()))
  );

drop policy if exists projects_select on public.projects;
create policy projects_select on public.projects
  for select using (
       owner_id = (select auth.uid())
    or id in (
         select pc.project_id from public.project_collaborators pc
          where pc.user_id = (select auth.uid()))
  );

-- ---------------------------------------------------------------------------
-- VERIFICACION tras aplicar. Ejecutar con al menos TRES usuarios distintos:
-- dueno puro, colaborador de diagrama, colaborador de proyecto.
-- Los conjuntos de id deben ser IDENTICOS antes y despues.
-- ---------------------------------------------------------------------------
-- begin;
--   set local role authenticated;
--   set local request.jwt.claims = '{"sub":"<UUID>","role":"authenticated"}';
--   select count(*), md5(string_agg(id::text, ',' order by id)) from public.diagrams;
-- rollback;
