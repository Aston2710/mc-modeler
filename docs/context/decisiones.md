---
documento: decisiones
vigencia: vigente
actualizado: 2026-08-10
---

# Decisiones

Append-only. Entradas más recientes arriba. **Las alternativas descartadas con su motivo son la razón de existir de este documento**: sin ellas alguien reabre el debate en tres meses partiendo de cero.

---

## DEC-011 — El servidor de colaboración hospeda el `Y.Doc` existente; Figma es referencia, no objetivo

- **Fecha:** 2026-08-11
- **Estado:** vigente
- **Contexto:** al planificar el servidor autoritativo aparecieron tres arquitecturas posibles y la duda de si replicar el modelo de Figma. También hacía falta acotar qué valida el servidor, porque el producto debe permitir dibujar diagramas libremente.
- **Decisión:**
  1. **El renderizado sigue en el cliente.** El servidor guarda la verdad del documento, no el canvas. bpmn-js es una biblioteca de navegador y el arrastre debe seguir a 60 fps sin ida y vuelta de red.
  2. **Yjs + Hocuspocus**, hospedando el mismo `Y.Doc` que ya existe. `YjsBpmnBinding.ts` no se reescribe.
  3. **La validación del servidor se limita a integridad referencial** (que toda referencia apunte a algo que existe). **Nunca reglas semánticas de BPMN**: el usuario dibuja lo que quiera.
- **Alternativas descartadas:**
  - *Canvas en el servidor* — perdería la fluidez del arrastre y exigiría transmitir renderizados. Ninguna herramienta de modelado seria lo hace; Figma también renderiza en el cliente.
  - *Replicar el modelo de Figma* (objetos con ID + propiedades LWW + orden del servidor) — es elegante y encaja conceptualmente con BPMN, pero obligaría a tirar `YjsBpmnBinding.ts`, que es el resultado de EXP-001, EXP-005 y EXP-007: meses de casos límite resueltos. Figma lo construyó para mover cientos de objetos a 60 fps con decenas de personas; aquí hay 23 usuarios. **Se copia el principio —que el servidor asigne el orden—, que Hocuspocus da gratis por hospedar el documento en un único proceso.**
  - *OT (Operational Transformation)* — más complejo que un CRDT para un grafo; Figma también lo descartó.
  - *Validar reglas semánticas de BPMN* — sería rigidez, no corrección. draw.io y Bizagi tampoco las imponen.
  - *Edge function* — no mantiene estado entre invocaciones, que es exactamente lo que se necesita.
- **Consecuencias:** hace falta un host con estado (Vercel serverless no sostiene websockets): proveedor nuevo, coste fijo mensual y un punto único de fallo que hoy no existe. Yjs consume más memoria por documento que el modelo de Figma —los CRDT arrastran metadatos de operaciones borradas—, irrelevante con documentos de decenas de KB. La validación referencial convierte cinco parches dispersos del cliente (EXP-003, 005, 007, 008 y 011) en una regla central.
- **Relacionados:** MASTER-PLAN-019, PLAN-021, PLAN-023, PLAN-024, DEC-001, DEC-002, DEC-004

---

## DEC-010 — Los planes que agrupan otros planes se llaman master plans y llevan un tablero

- **Fecha:** 2026-08-10
- **Estado:** vigente
- **Contexto:** la auditoría produjo ocho planes en tres frentes. El documento que los secuenciaba era indistinguible de los demás: mismo prefijo `PLAN-`, mismo aspecto en el índice. Además la numeración se leía como orden de ejecución cuando en realidad es orden de descubrimiento, lo que hacía confuso saber por dónde empezar.
- **Decisión:** un plan que agrupa a otros lleva `id: MASTER-PLAN-NNN`, `tipo: master-plan`, y los campos `agrupa:` y `progreso: N/M`. El nombre de archivo es `NNN-master-plan-slug.md` — número primero para conservar el orden de la carpeta, `master-plan` a continuación para verlo de un vistazo. Contiene un tablero de casillas; cerrar un plan agrupado marca su casilla en el mismo turno. Cuando todas están marcadas, el master plan se cierra.
- **Alternativas descartadas:**
  - *Contador propio para master plans* — habría permitido `MASTER-PLAN-001` y `PLAN-001` simultáneos, es decir, dos documentos citables como "el 001".
  - *Prefijo al principio del nombre de archivo (`master-018-...`)* — rompe el orden numérico de la carpeta.
  - *Estados nuevos tipo `activo` o `terminado`* — rompería `grep 'estado: todo'`. Se reutiliza el vocabulario cerrado de los planes; en un master plan `en-progreso` significa "algunas fases cerradas, no todas".
  - *Deducir el progreso automáticamente de las cabeceras de los planes agrupados* — no hay herramienta que lo haga; un tablero que hay que marcar a mano se queda obsoleto, pero uno que nadie mantiene tampoco existe.
- **Consecuencias:** cerrar un plan agrupado pasa a ser un procedimiento de cinco pasos (casilla, progreso, estado, registro, dos índices). Es más trabajo por cierre, a cambio de que exista un único documento que responda "¿qué toca ahora?".
- **Relacionados:** MASTER-PLAN-018, `docs/README.md`, DEC-008

---

## DEC-009 — La pérdida de trabajo en colaboración se mitiga antes de producción; la solución estructural espera datos

- **Fecha:** 2026-08-10
- **Estado:** vigente
- **Contexto:** EXP-011 documenta tres mecanismos que descartan trabajo del usuario en silencio. La causa de fondo es la ausencia de árbitro (DEC-004, diferida). Hay una presentación en producción próxima y el escenario de fallo —dos pestañas, mismo diagrama— es el primero que alguien prueba.
- **Decisión:** separar mitigación de solución. **PLAN-014** (cliente) hace imposible la pérdida silenciosa y va antes de la presentación. **PLAN-015** (servidor autoritativo) elimina la causa, pero no arranca sin los datos de PLAN-013.
- **Alternativas descartadas:**
  - *Montar el servidor ya* — necesita un host con estado (Vercel serverless no sostiene websockets), o sea proveedor nuevo y coste fijo, decidido con intuiciones en vez de con medición. Y no llega a tiempo.
  - *No hacer nada hasta tener datos* — se estaría corriendo un riesgo conocido de pérdida de datos durante la presentación.
  - *Solo registrar sin tocar el comportamiento* — el registro da forense, no prevención: sabrías **después** que se perdió trabajo.
- **Consecuencias:** el doble conflicto de CAS pasa a exigir una decisión del usuario, que es UI nueva en un producto que decidió no mostrar errores en producción. La distinción que lo resuelve: *mostrar estado* no es *mostrar un error*, y aquí no hay forma de preguntar sin preguntar.
- **Relacionados:** EXP-011, PLAN-014, PLAN-015, PLAN-013, PLAN-018, DEC-004

---

## DEC-008 — Unificar `docs/` y `fix_doc/` en un solo árbol versionado

- **Fecha:** 2026-08-10
- **Estado:** vigente
- **Contexto:** la documentación vivía en dos sitios con criterios distintos: `fix_doc/` (versionado, post-mortems y planes) y `docs/` (ignorado por git, insumos e informes). Nadie sabía dónde poner algo nuevo, y `docs/` no se versionaba.
- **Decisión:** un solo `docs/` con la estructura `addons` / `context` / `experience` / `plans{todo,done}`, versionado, con `INDEX.md` por carpeta y front-matter de vocabulario cerrado. `docs/` sale del `.gitignore`. Solo `.md` (más los `.xml` de draw.io en `addons/`).
- **Alternativas descartadas:**
  - *Dejar `docs/` ignorado y mover `fix_doc/` dentro* — habría des-versionado 21 documentos que sí estaban seguidos.
  - *Versionar `docs/` tal cual, incluidos los `.bpm`* — esos tres archivos son diagramas reales de procesos de la empresa; entrar al historial de git es irreversible sin reescribirlo. Se eliminaron.
  - *Mantener las dos carpetas con criterios documentados* — no resuelve la pregunta "¿dónde va esto?", solo la escribe.
- **Consecuencias:** todo movimiento se hizo con `git mv`, así que `git log --follow` sigue el historial. Cerrar un plan pasa a requerir aprobación explícita. Cada escritura obliga a tocar el `INDEX.md` de su carpeta.
- **Relacionados:** `docs/README.md`

## DEC-007 — Los fallos silenciosos se registran en una cola propia en Postgres, no en un servicio externo

- **Fecha:** 2026-08-10
- **Estado:** vigente
- **Contexto:** tres modos de fallo de la colaboración ocurren sin que nadie se entere: el binding que nunca arranca, el gate de `canEdit` que descarta ediciones, y el doble conflicto de CAS que descarta trabajo. No se quiere mostrar errores en la UI de producción, pero sí tener un histórico rastreable.
- **Decisión:** tabla append-only en el propio Postgres, con `INSERT` para `authenticated` y sin `SELECT`/`UPDATE`/`DELETE`. Fuera de la publicación de realtime. Solo escalares en el payload: ids, códigos, contadores, milisegundos.
- **Alternativas descartadas:**
  - *Sentry u equivalente* — captura breadcrumbs y contexto automáticamente, lo que en esta app significa ids de diagrama, etiquetas de elementos y potencialmente XML en un stack trace. Los diagramas contienen procesos internos de la empresa.
  - *Mostrar el estado en la UI* — descartado para producción por decisión de producto. Queda como posible flag apagado.
  - *Solo `console.warn`* — es lo que hay hoy y es exactamente el problema.
- **Consecuencias:** el log da forense, no prevención: se sabrá **después** que se perdió trabajo por CAS. La regla dura es que el contenido de la tabla debe poder enseñarse a alguien sin derecho a ver ningún proceso.
- **Relacionados:** PLAN-012, `context/arquitectura-persistencia.md`

## DEC-006 — 3NF como forma normal objetivo, con desnormalizaciones documentadas en el esquema

- **Fecha:** 2026-08-09
- **Estado:** vigente
- **Contexto:** auditoría de la base de datos. El esquema estaba en 3NF con seis excepciones sin declarar; no había criterio para decidir si normalizar más.
- **Decisión:** 3NF. Se desnormaliza solo si el dato es (a) snapshot inmutable de un evento, (b) caché de algo caro de recalcular, o (c) opaco para la base. Cada excepción se documenta con `COMMENT ON COLUMN` en el propio esquema.
- **Alternativas descartadas:**
  - *BCNF/4NF/5NF* — bajo RLS cada tabla nueva es un multiplicador de coste, no un divisor: un JOIN adicional arrastra la evaluación completa de la política de la tabla nueva. Medido: 0.045 ms sin RLS contra 8.7 ms con RLS sobre la misma tabla de 132 filas.
  - *Desnormalizar más* — la base entera cabe en `shared_buffers`; los JOINs cuestan microsegundos. No compra nada y añade riesgo de inconsistencia.
- **Consecuencias:** `comment_replies.mentions` se queda como `uuid[]` (viola 1NF a propósito). Se reconsidera solo si aparece una bandeja de menciones por usuario, porque ahí cambia el patrón de acceso.
- **Relacionados:** `context/normalizacion.md`

## DEC-005 — Las políticas RLS de tipo SELECT usan predicado conjuntista, no llamada a función por fila

- **Fecha:** 2026-08-09
- **Estado:** vigente
- **Contexto:** `private.can_access_diagram(id)` se evaluaba una vez por fila con 4 subconsultas `EXISTS` dentro. La consulta de lista tardaba 31.2 ms para 132 filas, con coste lineal (~63 µs/fila).
- **Decisión:** las políticas `SELECT` de tablas que se escanean expresan el predicado de forma conjuntista, para que el planificador materialice los conjuntos una vez. Las políticas `UPDATE`/`DELETE`/`INSERT` siguen usando las funciones `can_*`: se evalúan sobre una fila concreta y ahí no hay diferencia.
- **Alternativas descartadas:**
  - *Dejarlo* — a 10 000 diagramas la lista tardaría ~630 ms solo autorizando.
  - *Marcar las funciones como `STABLE` y confiar en el cacheo* — ya son `STABLE`; el planificador no puede materializar una función opaca sobre un conjunto.
  - *Eliminar las funciones `can_*`* — centralizar la autorización evita recursión de RLS y duplicar lógica entre 42 políticas. El problema era dónde se usaban, no que existieran.
- **Consecuencias:** el predicado queda duplicado entre la política y la función. Cualquier cambio del modelo de permisos hay que aplicarlo en ambos sitios. Toda modificación de RLS exige la prueba de equivalencia: hash del conjunto de ids visibles por usuario, antes y después.
- **Relacionados:** migraciones `0025`, `0029`; `context/base-de-datos.md`

## DEC-004 — El servidor autoritativo de CRDT queda diferido

- **Fecha:** 2026-07-02
- **Estado:** vigente
- **Contexto:** sin servidor, el Y.Doc es efímero y cada garantía de la colaboración es un acuerdo entre clientes.
- **Decisión:** diferir. Es inversión para concurrencia alta real.
- **Alternativas descartadas:** *montarlo ya* — con la concurrencia actual (equipo comunicado, tiempo real, baja-media) las mitigaciones cliente-side bastaban.
- **Consecuencias:** deuda técnica consciente. Los tres modos de fallo silencioso de la colaboración son su síntoma directo. La decisión se revisará con datos reales de PLAN-012, no con intuiciones.
- **Relacionados:** `context/arquitectura-persistencia.md` (§4 decisión 7), PLAN-012

## DEC-003 — Google Drive descartado como almacenamiento de diagramas

- **Fecha:** 2026-07-02
- **Estado:** vigente
- **Contexto:** draw.io usa Drive para desplazar el coste de almacenamiento al usuario.
- **Decisión:** Supabase Storage cubre el rol de blobs, integrado con el RLS y el Auth existentes.
- **Alternativas descartadas:** *Drive* — pelea con el modelo de tiempo real (no es una base de datos de tiempo real), no reduce el coste real (el driver es Realtime y compute, no almacenar XMLs de KB), y suma OAuth y permisos de Drive peleando con el modelo de compartir propio.
- **Relacionados:** `context/arquitectura-persistencia.md` (§3.6)

## DEC-002 — Yjs se degrada a transporte de sesión; no es autoridad de persistencia

- **Fecha:** 2026-07-02
- **Estado:** vigente
- **Contexto:** Yjs era simultáneamente transporte, persistencia y autoridad, y controlado por el cliente. Esa conflación de roles causó la corrupción documentada en EXP-003, EXP-004 y EXP-005.
- **Decisión:** el Y.Doc nace vacío en cada sesión, transporta los cambios en vivo por broadcast y muere con la sesión. Se mantiene para el merge fino en sesión, que es lo que un CRDT hace bien.
- **Alternativas descartadas:**
  - *Mantener Yjs autoritativo* — es un blob binario opaco: RLS controla quién escribe la fila, no qué contiene. El veneno no era detectable por la base.
  - *Eliminar Yjs del todo* — la co-edición fina en sesión es el núcleo del producto y XML no tiene semántica de merge.
- **Consecuencias:** la colaboración offline con merge persistente se debilita. Las tablas `yjs_documents` y `yjs_updates` se eliminaron en la migración `0018`.
- **Relacionados:** EXP-004, EXP-005, PLAN-001

## DEC-001 — La fuente de verdad de un diagrama es un XML canónico en Postgres

- **Fecha:** 2026-07-02
- **Estado:** vigente
- **Contexto:** doble fuente de verdad (`current_xml` y la capa Yjs) que podía divergir. Cargar un diagrama dependía de dos entradas más la lógica de merge, luego no era determinista.
- **Decisión:** un único XML canónico en `diagrams.current_xml`, validado al guardar, con control optimista por versión (el token es `updated_at`, movido server-side por el trigger `diagrams_set_updated_at`).
- **Alternativas descartadas:**
  - *Archivo en repositorio externo* — pierde la transaccionalidad con la metadata y el CAS, y añade un segundo sistema de permisos. Para documentos de KB el campo en Postgres gana.
  - *Exclusión mutua con advisory lock por diagrama* — válida, pero el modelo de tiempo real hace que todos escriban un estado ya acordado; el CAS encaja mejor y no serializa.
- **Consecuencias:** requiere disciplina al guardar. Las imágenes embebidas en base64 deben ir a Storage o inflan la fila a MBs.
- **Relacionados:** `context/arquitectura-persistencia.md`, PLAN-001, EXP-008
