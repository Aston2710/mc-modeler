-- Soporte de subprocesos anidados (rescatado de solve-I-L).
alter table public.diagrams
  add column if not exists parent_diagram_id uuid references public.diagrams(id) on delete cascade,
  add column if not exists sub_process_element_id text;

create index if not exists diagrams_parent_idx on public.diagrams(parent_diagram_id);
