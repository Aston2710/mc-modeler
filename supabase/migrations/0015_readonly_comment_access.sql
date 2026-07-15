-- ============================================================================
-- Solo lectura + comentarios para viewers
-- ============================================================================
-- Un colaborador 'viewer' NO puede modificar el diagrama (lo impide
-- diagrams_update → private.can_edit_diagram) PERO sí debe poder LEER y
-- COMENTAR. Los comentarios viven fuera del diagrama (comment_threads /
-- comment_replies), así que su acceso debe basarse en ACCESO al diagrama
-- (private.can_access_diagram), no en permiso de edición.
--
-- Estado previo (verificado en la BD): las políticas de INSERT de ambas tablas
-- exigían private.can_edit_diagram → un viewer NO podía comentar. Este es el
-- único cambio: swap can_edit_diagram → can_access_diagram en los dos INSERT.
--
-- Se deja INTACTO todo lo demás:
--   * SELECT (ya usaba can_access) — viewer ya podía leer.
--   * ct_update (resolver/reabrir hilo sigue en can_edit) — resolver es un
--     cambio de estado, no un comentario: el viewer NO debe poder.
--   * DELETE (solo autor).
-- ============================================================================

-- comment_threads: crear hilo (comentario nuevo) con acceso al diagrama.
drop policy if exists ct_insert on public.comment_threads;
create policy ct_insert on public.comment_threads
  for insert with check (private.can_access_diagram(diagram_id));

-- comment_replies: responder en un hilo con acceso al diagrama del hilo.
drop policy if exists cr_insert on public.comment_replies;
create policy cr_insert on public.comment_replies
  for insert with check (
    exists (
      select 1 from public.comment_threads t
      where t.id = thread_id and private.can_access_diagram(t.diagram_id)
    )
  );
