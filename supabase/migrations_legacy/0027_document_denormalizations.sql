-- 0027_document_denormalizations
-- Documenta en el propio esquema las desnormalizaciones DELIBERADAS, para que
-- nadie las "arregle" mas adelante y rompa la semantica.
-- Razonamiento completo en fix_doc/DB/03-normalizacion.md

comment on column public.notification_outbox.recipient_email is
  'SNAPSHOT DELIBERADO del email al momento del envio. Viola 3NF a proposito: un outbox registra a donde SE ENVIO, no donde vive el usuario hoy. NO sincronizar con profiles.email.';

comment on column public.comment_threads.created_by_name is
  'SNAPSHOT DELIBERADO del nombre del autor al crear el hilo. Viola 3NF a proposito: created_by es nullable con FK NO ACTION, este es el plan B cuando el autor ya no existe. Evita ademas un JOIN a profiles bajo RLS.';

comment on column public.comment_replies.author_name is
  'SNAPSHOT DELIBERADO del nombre del autor. Ver comment_threads.created_by_name.';

comment on column public.comment_replies.mentions is
  'Array de uuid en vez de tabla puente. Viola 1NF/4NF a proposito: siempre se lee completo junto con su reply, nunca se consulta por usuario mencionado. Normalizarlo anadiria un JOIN bajo RLS. Reconsiderar SOLO si aparece una bandeja de menciones por usuario.';

comment on column public.diagrams.element_count is
  'CACHE DERIVADO de current_xml. Contar elementos exige parsear el XML, cosa que la base no puede hacer. Sin este cache la lista no podria mostrar el conteo sin traer 3.7 MB de XML. El cliente es el unico escritor.';

comment on column public.diagrams.thumbnail_path is
  'REDUNDANTE: siempre vale id || ''/thumb'' (verificado 119/119 filas), identico a thumbPath() en SupabaseRepository.ts. Unica violacion de 3NF sin justificacion. Sustituir por has_thumbnail boolean cuando el cliente pueda migrarse.';

comment on column public.comment_threads.anchor is
  'jsonb deliberado: la forma del anclaje depende del tipo de elemento BPMN y evoluciona con el modelador. Dato OPACO para la base, nunca se consulta por su contenido.';

comment on column public.notification_outbox.payload is
  'jsonb deliberado: la forma depende de kind. Dato OPACO para la base.';

comment on table public.diagram_collaborators is
  'REDUNDANCIA DELIBERADA con diagrams.owner_id: el trigger diagrams_add_owner inserta al dueno con role=owner (129 de 156 filas son ese duplicado). Unifica "que diagramas veo" en una sola tabla. Fuente de verdad de la PROPIEDAD es diagrams.owner_id; esta tabla es la proyeccion de la AUTORIZACION.';

comment on column public.images.storage_path is
  'NO es derivable del id (a diferencia de diagrams.thumbnail_path). Duplicar mime y size_bytes desde storage.objects es deliberado: evita acoplar el modelo aplicativo a la estructura interna de Supabase Storage y evita un JOIN a una tabla con su propio RLS.';

comment on table public.folders is
  'EN USO por el cliente (SupabaseRepository.getFolders/saveFolder/deleteFolder) aunque hoy tiene 0 filas. NO borrar sin retirar antes esos metodos.';
