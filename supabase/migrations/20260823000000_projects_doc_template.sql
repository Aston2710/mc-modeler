-- PLAN-034 fase 2 — plantilla del cajetín, por proyecto.
--
-- El cajetín es el recuadro de identificación del documento (logo, título,
-- código, fecha, revisión). Sus DATOS viven en el XML del diagrama, como
-- `flujo:DocumentMeta` dentro de extensionElements; lo que vive aquí es la
-- PLANTILLA: qué campos se muestran, con qué etiquetas, qué maqueta y qué logo.
--
-- POR QUÉ EN EL PROYECTO Y NO EN EL USUARIO. Es un estándar compartido. En
-- preferencias de usuario derivaría —cada quien configuraría lo suyo y dejaría
-- de ser un estándar—, y además las preferencias de esta app son locales por
-- dispositivo (`SupabaseRepository.getPreferences`), así que se perderían al
-- cambiar de ordenador. En el proyecto se comparte por `project_collaborators`.
--
-- EL LOGO NO VA AQUÍ EN BYTES. Va como `logoImageId`, una referencia a
-- `public.images`, que ya tiene su bucket y su RLS. Meter un data URL de
-- cientos de kB en esta tabla habría cargado la consulta de la portada, que es
-- exactamente la trampa que PLAN-012 desmontó con `LIST_COLUMNS`.
--
-- RLS: no hace falta tocar nada. `projects_select` ya cubre a dueño y
-- colaboradores, y `projects_update` pasa por `private.can_edit_project(id)`.
-- Una columna nueva hereda esas políticas.
--
-- LOS GRANTS SÍ HAY QUE TOCARLOS, y es lo que casi se nos escapa. El UPDATE de
-- esta tabla no está concedido a nivel de tabla sino **columna a columna**, para
-- que nadie pueda reescribir `owner_id` y apropiarse de un proyecto (migración
-- `0028`). Consecuencia: una columna nueva **no es escribible por nadie** hasta
-- que se le da su GRANT explícito.
--
-- Se detectó al probarlo de verdad en el laboratorio: el UPDATE devolvía
-- `403 permission denied for table projects`, que es un error de GRANT y no de
-- política — una violación de RLS diría otra cosa. Sin esta prueba la función
-- habría salido silenciosamente rota: la interfaz mostraba el cambio porque
-- actualiza su estado antes de guardar.
--
-- Sin `default`: la columna nace nula y Postgres no reescribe ninguna fila.

alter table public.projects
  add column if not exists doc_template jsonb;

-- `owner_id` sigue fuera de la lista, que es el motivo de que los grants sean
-- por columna. No añadirlo aquí.
grant update (doc_template) on public.projects to authenticated;
grant update (doc_template) on public.projects to anon;

comment on column public.projects.doc_template is
  'PLAN-034. Plantilla del cajetín del proyecto: maqueta, etiquetas, campos '
  'visibles y `logoImageId` (referencia a public.images, nunca los bytes). '
  'Nula = el proyecto no define cajetín. Los datos de cada documento viven en '
  'el XML del diagrama, no aquí.';

-- El planificador necesita estadísticas de la columna nueva; sin esto puede
-- ignorar índices y elegir un plan peor (lección de PLAN-010).
analyze public.projects;
