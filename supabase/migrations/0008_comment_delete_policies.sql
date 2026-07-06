-- Borrado de comentarios colaborativos: solo el autor puede eliminar lo suyo.
-- Las replies de un hilo caen por on delete cascade (fk thread_id).

create policy ct_delete on public.comment_threads
  for delete using (created_by = auth.uid());

create policy cr_delete on public.comment_replies
  for delete using (author_id = auth.uid());

-- Realtime: con replica identity default un DELETE solo publica la PK del old
-- row, así el filtro diagram_id=eq.<id> del canal nunca matchea y los demás
-- clientes no se enteran del borrado. FULL publica el row completo.
alter table public.comment_threads replica identity full;
alter table public.comment_replies replica identity full;
