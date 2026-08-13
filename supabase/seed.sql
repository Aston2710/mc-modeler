-- ============================================================================
-- SEED DE DESARROLLO LOCAL — solo se aplica en `supabase db reset`.
-- NUNCA se envia a produccion: el CLI solo lo ejecuta contra el stack local.
--
-- Crea un usuario de prueba y contenido de ejemplo para poder maquetar la
-- base y la UI sin tocar datos reales.
--
-- COMO ENTRAR: en la app local, pedir enlace magico para  dev@local.test
-- y recogerlo en Mailpit → http://127.0.0.1:54324
-- GoTrue reconoce el correo ya existente y firma como ESTE usuario, asi que
-- los diagramas de abajo aparecen en la portada nada mas entrar.
--
-- Para un segundo usuario (probar compartir, roles, presencia y comentarios)
-- basta pedir enlace para  dev2@local.test , que tambien se siembra aqui.
-- ============================================================================

-- ── Usuarios ────────────────────────────────────────────────────────────────
-- El trigger on_auth_user_created (0001) crea el perfil solo; no hace falta
-- insertar en public.profiles.
-- Contrasena fija 'lab' para los dos. La app no tiene login por contrasena —
-- solo la usa el modo laboratorio (src/lab/LabBar.tsx) para iniciar sesion
-- solo al arrancar y para cambiar de usuario con un clic. Produccion no tiene
-- ni este usuario ni esta contrasena, y el codigo que la usa desaparece del
-- bundle de produccion.
--
-- crypt/gen_salt van cualificados con `extensions.`: pgcrypto vive en ese
-- esquema y no esta en el search_path del seed.
-- Los campos de token van a '' y NO a null: GoTrue los lee como string de Go,
-- y un null revienta el escaneo con "Database error querying schema" (500) al
-- iniciar sesion. Es la trampa clasica de sembrar auth.users a mano.
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change,
  email_change_token_new, email_change_token_current, reauthentication_token
)
values
  ('00000000-0000-0000-0000-000000000000',
   '11111111-1111-1111-1111-111111111111',
   'authenticated', 'authenticated', 'dev@local.test',
   extensions.crypt('lab', extensions.gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}'::jsonb,
   '{"full_name":"Dev Local"}'::jsonb, now(), now(),
   '', '', '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000',
   '22222222-2222-2222-2222-222222222222',
   'authenticated', 'authenticated', 'dev2@local.test',
   extensions.crypt('lab', extensions.gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}'::jsonb,
   '{"full_name":"Dev Segundo"}'::jsonb, now(), now(),
   '', '', '', '', '', '')
on conflict (id) do nothing;

-- Identidad de correo: GoTrue la exige para reconocer el usuario al pedir el
-- enlace magico. provider_id = user id para el proveedor 'email'.
insert into auth.identities (
  id, user_id, provider_id, identity_data, provider,
  last_sign_in_at, created_at, updated_at
)
values
  (gen_random_uuid(), '11111111-1111-1111-1111-111111111111',
   '11111111-1111-1111-1111-111111111111',
   '{"sub":"11111111-1111-1111-1111-111111111111","email":"dev@local.test","email_verified":true}'::jsonb,
   'email', now(), now(), now()),
  (gen_random_uuid(), '22222222-2222-2222-2222-222222222222',
   '22222222-2222-2222-2222-222222222222',
   '{"sub":"22222222-2222-2222-2222-222222222222","email":"dev2@local.test","email_verified":true}'::jsonb,
   'email', now(), now(), now())
on conflict do nothing;

-- ── Proyecto y carpeta ──────────────────────────────────────────────────────
insert into public.projects (id, owner_id, name)
values ('aaaaaaaa-0000-0000-0000-000000000001',
        '11111111-1111-1111-1111-111111111111',
        'Proyecto de prueba')
on conflict (id) do nothing;

insert into public.folders (id, owner_id, name)
values ('bbbbbbbb-0000-0000-0000-000000000001',
        '11111111-1111-1111-1111-111111111111',
        'Carpeta de prueba')
on conflict (id) do nothing;

-- ── Diagramas ───────────────────────────────────────────────────────────────
-- XML identico al EMPTY_BPMN de src/store/diagramStore.ts, con el nombre del
-- pool cambiado: asi pasa looksLikeBpmn() y bpmn-js lo importa sin quejarse.
-- Un diagrama suelto, uno dentro del proyecto y uno en la papelera, para
-- ejercitar los tres filtros de la portada.
with plantilla as (
  select $xml$<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
  xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"
  xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"
  id="Definitions_1"
  targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:collaboration id="Collaboration_1">
    <bpmn:participant id="Participant_1" name="POOL_NAME" processRef="Process_1" />
  </bpmn:collaboration>
  <bpmn:process id="Process_1" isExecutable="false">
    <bpmn:startEvent id="StartEvent_1" />
  </bpmn:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_1">
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="Collaboration_1">
      <bpmndi:BPMNShape id="Participant_1_di" bpmnElement="Participant_1" isHorizontal="true">
        <dc:Bounds x="100" y="50" width="600" height="250" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="StartEvent_1_di" bpmnElement="StartEvent_1">
        <dc:Bounds x="152" y="157" width="36" height="36" />
      </bpmndi:BPMNShape>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>$xml$ as xml
)
insert into public.diagrams (id, owner_id, project_id, folder_id, name, current_xml, element_count, deleted_at)
select d.id, '11111111-1111-1111-1111-111111111111'::uuid, d.project_id, d.folder_id, d.name,
       replace(p.xml, 'POOL_NAME', d.pool), 2, d.deleted_at
from plantilla p,
     (values
        ('cccccccc-0000-0000-0000-000000000001'::uuid, null::uuid, null::uuid,
         'Diagrama suelto', 'Proceso suelto', null::timestamptz),
        ('cccccccc-0000-0000-0000-000000000002'::uuid,
         'aaaaaaaa-0000-0000-0000-000000000001'::uuid, null::uuid,
         'Diagrama del proyecto', 'Proceso del proyecto', null::timestamptz),
        ('cccccccc-0000-0000-0000-000000000003'::uuid, null::uuid,
         'bbbbbbbb-0000-0000-0000-000000000001'::uuid,
         'Diagrama en carpeta', 'Proceso en carpeta', null::timestamptz),
        ('cccccccc-0000-0000-0000-000000000004'::uuid, null::uuid, null::uuid,
         'Diagrama borrado', 'Proceso borrado', now())
     ) as d(id, project_id, folder_id, name, pool, deleted_at)
on conflict (id) do nothing;

-- ── Compartir con el segundo usuario ────────────────────────────────────────
-- Editor en uno, viewer en otro: cubre el camino de solo-lectura (ReadOnlyModule
-- + politica RLS) sin tener que crear invitaciones a mano.
insert into public.diagram_collaborators (diagram_id, user_id, role, invited_by)
values
  ('cccccccc-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222',
   'editor', '11111111-1111-1111-1111-111111111111'),
  ('cccccccc-0000-0000-0000-000000000003', '22222222-2222-2222-2222-222222222222',
   'viewer', '11111111-1111-1111-1111-111111111111')
on conflict do nothing;

-- ── Un hilo de comentarios ──────────────────────────────────────────────────
insert into public.comment_threads (id, diagram_id, anchor, created_by, created_by_name)
values ('dddddddd-0000-0000-0000-000000000001',
        'cccccccc-0000-0000-0000-000000000001',
        '{"elementId":"StartEvent_1"}'::jsonb,
        '11111111-1111-1111-1111-111111111111', 'Dev Local')
on conflict (id) do nothing;

insert into public.comment_replies (thread_id, author_id, author_name, content)
values ('dddddddd-0000-0000-0000-000000000001',
        '11111111-1111-1111-1111-111111111111', 'Dev Local',
        'Comentario de ejemplo sembrado por seed.sql')
on conflict do nothing;
