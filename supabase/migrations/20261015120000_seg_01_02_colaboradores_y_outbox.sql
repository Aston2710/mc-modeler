-- ============================================================================
-- SEG-01 y SEG-02 (docs/addons/auditoria-seguridad-acceso.md), confirmados en
-- el laboratorio el 2026-10-15 durante la revisión del PR #1.
--
-- *** NO APLICADA EN PRODUCCIÓN. *** Aplicarla allí requiere aprobación
-- explícita del usuario (CLAUDE.md, reglas 2 y 3; EXP-016). Probada con
-- `npm run db:reset` y `supabase/pruebas/seg_01_02.sql`.
--
-- SEG-01 · Auto-alta como colaborador
--   `collab_insert` y `project_collab_insert` aceptaban la fila si
--   `user_id = auth.uid()`, sin mirar el diagrama, el proyecto ni el rol: quien
--   conociera un id se daba de alta como editor (o dueño) y lo leía y editaba.
--   Nadie legítimo usa esa rama: el alta del dueño al crear
--   (`add_owner_as_collaborator`, `add_project_owner_as_collaborator`) y el
--   canje de invitaciones (`redeem_invite`, `redeem_project_invite`) son
--   SECURITY DEFINER y no pasan por RLS, y la app solo inserta colaboradores
--   siendo dueño (`lib/sharing.ts`). Se deja solo la condición de dueño.
--   Las políticas de DELETE conservan `user_id = auth.uid()`: es "salir de un
--   diagrama o proyecto compartido", y eso sí es legítimo.
--
-- SEG-02 · Relé de correo por notification_outbox
--   El baseline concede UPDATE de tabla a anon y authenticated, así que el
--   grant por columna que daba por hecho la migración 0012 no limitaba nada
--   (EXP-015). Un usuario reescribía recipient_email, payload, sent_at,
--   attempts y created_at de sus filas y Apps Script volvía a enviarlas a
--   cualquier dirección. La app solo actualiza `read_at` (notificationStore).
--   Se revoca el UPDATE de tabla y se concede solo esa columna. Apps Script usa
--   service_role: no le afecta.
--
-- REVERSIBLE: ver el bloque REVERTIR al final.
-- ============================================================================

-- ── SEG-01 ──────────────────────────────────────────────────────────────────
drop policy if exists collab_insert on public.diagram_collaborators;
create policy collab_insert on public.diagram_collaborators
  for insert to public
  with check (private.is_diagram_owner(diagram_id));

drop policy if exists project_collab_insert on public.project_collaborators;
create policy project_collab_insert on public.project_collaborators
  for insert to public
  with check (private.is_project_owner(project_id));

-- ── SEG-02 ──────────────────────────────────────────────────────────────────
revoke update on public.notification_outbox from anon, authenticated;
grant update (read_at) on public.notification_outbox to authenticated;

-- ============================================================================
-- REVERTIR (vuelve exactamente al baseline):
--
-- drop policy if exists collab_insert on public.diagram_collaborators;
-- create policy collab_insert on public.diagram_collaborators for insert to public
--   with check ((private.is_diagram_owner(diagram_id) OR (user_id = ( SELECT auth.uid() AS uid))));
-- drop policy if exists project_collab_insert on public.project_collaborators;
-- create policy project_collab_insert on public.project_collaborators for insert to public
--   with check ((private.is_project_owner(project_id) OR (user_id = ( SELECT auth.uid() AS uid))));
-- revoke update (read_at) on public.notification_outbox from authenticated;
-- grant update on public.notification_outbox to anon, authenticated;
-- ============================================================================
