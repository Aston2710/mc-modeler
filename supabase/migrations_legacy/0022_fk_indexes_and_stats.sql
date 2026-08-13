-- 0022_fk_indexes_and_stats
-- Indices de cobertura para las 7 FKs que no lo tenian. Sin impacto hoy
-- (tablas de decenas de filas); evitan un seq scan por tabla referenciante
-- al borrar una cuenta de auth.users.
-- Se usa `create index` y no `concurrently` porque apply_migration corre en
-- transaccion y las tablas son de tamano trivial.

create index if not exists comment_replies_author_idx
  on public.comment_replies (author_id);
create index if not exists comment_threads_created_by_idx
  on public.comment_threads (created_by);
create index if not exists diagram_collaborators_invited_by_idx
  on public.diagram_collaborators (invited_by);
create index if not exists diagram_invites_created_by_idx
  on public.diagram_invites (created_by);
create index if not exists notification_outbox_recipient_idx
  on public.notification_outbox (recipient_id);
create index if not exists project_collaborators_invited_by_idx
  on public.project_collaborators (invited_by);
create index if not exists project_invites_created_by_idx
  on public.project_invites (created_by);

-- Indices para el patron exacto de la consulta de lista (getAll) y de la vista
-- por proyecto. Parciales: solo indexan las filas vivas.
create index if not exists diagrams_updated_at_live_idx
  on public.diagrams (updated_at desc)
  where deleted_at is null;

create index if not exists diagrams_project_updated_live_idx
  on public.diagrams (project_id, updated_at desc)
  where deleted_at is null;

-- Umbrales de autoanalyze en tablas pequenas de alta rotacion: con el default
-- (10% de las filas) una tabla de 5 filas casi nunca cruza el umbral.
alter table public.comment_threads
  set (autovacuum_analyze_scale_factor = 0.0, autovacuum_analyze_threshold = 20);
alter table public.comment_replies
  set (autovacuum_analyze_scale_factor = 0.0, autovacuum_analyze_threshold = 20);
alter table public.diagram_invites
  set (autovacuum_analyze_scale_factor = 0.0, autovacuum_analyze_threshold = 20);
alter table public.notification_prefs
  set (autovacuum_analyze_scale_factor = 0.0, autovacuum_analyze_threshold = 20);
alter table public.image_folders
  set (autovacuum_analyze_scale_factor = 0.0, autovacuum_analyze_threshold = 20);

-- IMPORTANTE: correr ANALYZE tras aplicar. Sin estadisticas reales el
-- planificador ignora los indices parciales de arriba (reltuples = -1).
-- No va dentro de la migracion porque ANALYZE no debe correr en la misma
-- transaccion que crea los indices.
--   analyze public.diagrams; analyze public.projects; ...
