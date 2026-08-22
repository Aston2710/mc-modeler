---
documento: patrones
vigencia: vigente
actualizado: 2026-07-19
---

# MC-Modeler — Auditoría de diseño por capas

**Fecha:** 2026-07-19 · **Propósito:** auditoría del diseño en las distintas capas del proyecto, con la meta de perfeccionar la herramienta hasta nivel competitivo con draw.io / Figma (en su nicho: modelado BPMN). Complementa [`addons/arquitectura.xml`](../addons/arquitectura.xml) (diagrama por capas) y [`arquitectura-persistencia.md`](arquitectura-persistencia.md). Documento vivo: se amplía con cada sesión de cuestionamiento.

---

## 1. Arquitectura macro: ¿qué es esto?

**Cliente pesado (thick client SPA) + Backend-as-a-Service.** No hay backend propio: toda la lógica de negocio vive en el navegador (React + bpmn-js) y Supabase provee las primitivas de infraestructura (Postgres, Auth, Realtime, Storage, pg_net). El único código "de servidor" son las migraciones SQL (RLS, triggers, RPCs) y el Apps Script de correo.

Tres estilos combinados:

| Estilo | Dónde | Rol |
|---|---|---|
| **Layered (por capas)** | Todo el cliente: UI → hooks → motor BPMN → colaboración → persistencia | Separación de responsabilidades; dependencias apuntan hacia abajo |
| **Hexagonal parcial (Ports & Adapters)** | Frontera de persistencia: `IDiagramRepository` / `IImageRepository` con adaptadores Local y Supabase | El dominio no sabe dónde se guarda; backend intercambiable (v2.0 API) |
| **Event-driven** | Zustand, eventBus de bpmn-js, Realtime broadcast, postgres_changes, outbox | Todo el flujo reactivo es pub/sub; casi nada se llama directo entre capas |

**Decisión de autoridad (el ADR):** el cliente es autoritativo para el *contenido* (serializa y escribe el XML completo), la BD es autoritativa para *acceso y versión* (RLS + token CAS server-side). El servidor **no valida contenido** — hueco consciente, diferido (ADR decisión #7).

---

## 2. Catálogo de patrones (dónde y por qué)

### 2.1 Estructurales

| Patrón | Implementación | Problema que resuelve |
|---|---|---|
| **Repository** | `src/persistence/` — interfaces + `LocalRepository`/`SupabaseRepository`, ídem imágenes | Persistencia intercambiable; modo local sin nube funciona con el mismo código de dominio |
| **Adapter / Binding** | `YjsBpmnBinding` (commandStack ↔ Y.Doc), `SupabaseCommentBinding` (store ↔ tablas+Realtime) | Puentes entre mundos con modelos incompatibles (bpmn-js imperativo ↔ CRDT; store síncrono ↔ BD async) |
| **Facade** | Hooks: `useCollab`, `useAutoSave`, `useBpmnModeler`, `useExport` | Cada hook esconde un subsistema completo tras una llamada; React solo ve el facade |
| **Plugin / DI de módulos** | Todos los módulos custom de `src/bpmn/*` inyectados al Modeler de bpmn-js (didi) | Extender el motor sin fork: routing Bizagi, ReadOnly, badges, fases, temas |
| **Strategy** | `ThemeAwareRenderer` (tokens light/dark), routing (router direccional vs ruta manual persistida) | Variar comportamiento sin condicionar el código llamante |

### 2.2 De concurrencia y distribución (el núcleo del sistema)

| Patrón | Implementación | Problema que resuelve |
|---|---|---|
| **Optimistic Concurrency Control (CAS)** | `SupabaseRepository.save`: `UPDATE … WHERE updated_at = esperado`; token movido por trigger server-side | Guardado concurrente sin locks; conflicto → re-sync + 1 reintento → toast. Nunca clobber silencioso |
| **CRDT** | Yjs para la co-edición en sesión | Merge fino op-a-op, conmutativo e idempotente; convergencia sin coordinador |
| **Fencing token** | `canvasSession` (generación por import) | El mismo patrón de locks distribuidos (Chubby/etcd) aplicado al canvas compartido entre pestañas: un import tardío no puede contaminar al vigente |
| **Anti-entropía (gossip)** | `syncProtocol`: state-vector cada 20s → peers responden diff exacto | Broadcast es fire-and-forget; esto garantiza convergencia aunque se pierdan mensajes |
| **Coalescing / batching** | Coalescer 150ms (`Y.mergeUpdates`): ~25 msg/s → ~7 | Rate-limit de Realtime dropea en silencio; menos mensajes = cero drops |
| **Jitter (decorrelación)** | Autosave 20s + random 0–5s | Co-editores disparan por los mismos eventos → sin jitter chocan en CAS cada ciclo |
| **Transactional Outbox** | `notification_outbox` + trigger pg_net + reintentos por time-trigger | El evento nace en la misma transacción que el dato; el correo puede fallar y reintentarse sin perder eventos |
| **Fail-closed** | Binding no arranca sin confirmación de canvas (timeout 10s → sin colab, no corrupción) | Ante duda, degradar funcionalidad antes que arriesgar datos |

### 2.3 De estado y UI

| Patrón | Implementación | Problema que resuelve |
|---|---|---|
| **Store centralizado (Flux-like)** | 9 stores Zustand por dominio | Estado global sin prop-drilling; suscripción selectiva (menos re-renders que Context) |
| **Optimistic UI + reconcile** | Comentarios: store al instante, INSERT async, revert por refetch si falla | Latencia percibida cero; la tabla es la verdad |
| **Interceptor** | `CommandInterceptor` prio 5000 en el binding (fix del typing colaborativo) | Ejecutar antes que los listeners internos de bpmn-js que cancelan directEditing |
| **Guard clauses en cada escritor** | `canEdit()` en autosave/broadcast, `isCanvasReadyFor()` en autosave/binding | Defensa en profundidad: cada ruta de escritura re-valida sus precondiciones |

---

## 3. Evaluación crítica (para cuestionar en esta fase)

### 3.1 Fortalezas reales

1. **Determinismo de carga** — cargar = importar UN XML. Eliminó la clase entera de bugs de corrupción (doble fuente de verdad).
2. **Costo mínimo** — cero servidores propios; el driver de costo es Realtime (conexiones), no almacenamiento ni compute.
3. **Auditable** — el estado persistido es XML legible en una columna; se puede inspeccionar, validar, respaldar y consultar con SQL. Un blob CRDT opaco no.
4. **Degradación limpia** — sin Supabase → modo local completo (IndexedDB); sin canal → edición solo local con autosave; sin canvas-ready → sin colab pero sin corrupción.
5. **Repository real** — la migración a API propia (v2.0) es implementar una interfaz, no reescribir el dominio.

### 3.2 Debilidades / deuda consciente (los puntos a cuestionar)

1. **El servidor no valida contenido.** `looksLikeBpmn` corre en el cliente. Un cliente buggy/malicioso con rol editor puede escribir XML basura (que pase el CAS) y es la verdad para todos. *Mitigación barata: CHECK o trigger en Postgres que valide estructura mínima del XML (`<definitions`, tamaño máximo). Mitigación completa: la decisión #7 diferida (servidor autoritativo).*
2. **Last-write-wins de blob completo.** El CAS evita el torn-write, pero dos ediciones simultáneas en zonas distintas del diagrama que llegan por autosave (no por broadcast, p. ej. si un peer perdió el canal) → gana el último XML entero. El modelo asume "tiempo real funciona"; cuando no funciona, se pierde trabajo fino. *Pregunta: ¿es aceptable? Hoy sí (equipo pequeño, anti-entropía cubre pérdidas). A escala pública, no.*
3. **Ventana de pérdida de ~20–25s.** Si el único editor cierra/crashea antes del autosave, esos segundos no existen en ningún lado (el Y.Doc muere con la sesión). *Mitigación: flush en `beforeunload`/`visibilitychange` — barato y de alto valor.*
4. **N editores = N guardados redundantes.** Todos escriben casi el mismo XML cada ~20s. Con 5 editores son 5 UPDATEs + 5 thumbnails por ciclo. *Alternativa: elección de líder de guardado (el peer con menor userId presente guarda; los demás no). Poco código, elimina 80% de escrituras y de carreras CAS.*
5. **Late-joiner depende de la buena fe de un peer.** El estado de sesión llega por handshake de otro editor. Si ese peer tiene el doc divergido, siembra divergencia. La anti-entropía lo corrige, pero hay ventana. Sin peers editores conectados, el late-joiner solo ve `current_xml` (correcto, pero hasta 25s viejo).
6. **Serialización completa del XML por autosave.** `saveXML` + thumbnail SVG en cada ciclo con dirty. En diagramas grandes (cientos de elementos) esto es trabajo O(n) repetido. *Medir: si `saveXML` > 50ms en diagramas reales, considerar thumbnail solo cada N ciclos o en idle.*
7. **Doble representación viva.** Durante la sesión coexisten el modelo bpmn-js y el Y.Doc espejo — memoria y CPU duplicadas por cambio, y el binding es la pieza más delicada del sistema (los incidentes de `experience/` lo confirman: EXP-001 typing, EXP-007 divergencia de id de conexión, EXP-003 y EXP-005 pools). Es el precio del realtime con motor no-CRDT; la alternativa (motor CRDT-nativo) no existe para BPMN.

### 3.3 Alternativas de industria y por qué (no) hoy

| Alternativa | Qué daría | Veredicto hoy |
|---|---|---|
| **Servidor CRDT autoritativo** (Hocuspocus, PartyKit, y-sweet) | Valida ops, un solo escritor del XML canónico, cierra debilidades 1, 2 y 4 | Correcto a escala; hoy suma un servicio que operar y $$ — es la decisión #7 diferida del ADR. Momento de adoptarlo: cuando haya usuarios externos o >5 editores concurrentes por diagrama |
| **Event sourcing / op-log en BD** | Historial completo, undo entre sesiones, auditoría por operación | Ya se intentó un pariente (append-only Yjs log) y se descartó en el pivote: complejidad alta, el producto no pide historial fino |
| **Liveblocks / Ably / servicios colab SaaS** | Presence + storage CRDT gestionado | Vendor extra + costo por MAU; Supabase Realtime ya cubre el transporte y RLS integra el acceso |
| **Snapshot binario (Y.Doc persistido)** | Merge offline real | Es exactamente lo que el ADR desmontó: blob opaco autoritativo del cliente. No volver |

### 3.4 Rendimiento — dónde mirar primero

Ordenado por retorno esperado (medir baseline antes de tocar):

1. **Flush de autosave al salir** (`beforeunload`) — elimina la ventana de pérdida; costo ~10 líneas.
2. **Líder de guardado** — divide escrituras y thumbnails entre N; elimina carreras CAS de raíz.
3. **Thumbnail fuera del camino caliente** — `requestIdleCallback` o cada 3er ciclo; el thumbnail es lo caro del autosave (serializar SVG completo + remap de colores por string).
4. **Caché de imágenes con límite** — `dataCache` del repo de imágenes crece sin tope; LRU con ~50 entradas.
5. **Presencia/cursores ya están bien** — 50ms throttle + broadcast efímero es el diseño correcto; no tocar.

### 3.5 Preguntas concretas para la sesión de cuestionamiento

1. ¿Cuál es el número real de editores concurrentes esperado por diagrama? (Decide si la deuda #7 del ADR se paga o se sigue difiriendo.)
2. ¿Se necesita historial/versiones de diagrama como feature de producto? (Si sí, el diseño de guardado cambia: snapshots versionados, no UPDATE in-place.)
3. ¿Editores externos a la organización? (Si sí, la validación server-side del XML deja de ser opcional.)
4. ¿Offline como feature? (Hoy es explícitamente un no-objetivo del ADR; confirmarlo o el modelo de merge cambia por completo.)
5. ¿El autosave de 20s es el número correcto? (Trade-off: ventana de pérdida vs escrituras; con flush-al-salir se puede incluso subir a 30–40s.)

---

## 4. ¿La arquitectura mixta es un problema? No — es mixta por diseño

Los tres estilos (capas, hexagonal parcial, event-driven) operan en **dimensiones distintas**: estructura estática, fronteras de variabilidad y comunicación en runtime. Toda aplicación real combina las tres. El smell sería dos estilos compitiendo en la MISMA dimensión (mitad persistencia por Repository, mitad con llamadas directas) — eso no existe aquí: cada dimensión tiene un solo dueño.

Prueba de fuego: cualquier arquitectura "más pura" viola alguna decisión vigente (hexagonal total = ceremonia sin variabilidad; event-sourcing = descartado en el pivote; backend propio = viola la decisión de costo). Frase para defenderla: **la arquitectura no es mixta por indecisión, es mixta por diseño — cada estilo resuelve una dimensión distinta y ninguno invade la del otro.**

Regla a proteger (fue la causa de la corrupción pre-pivote): coexisten tres dominios de consistencia — CRDT en sesión, CAS/LWW al persistir, tablas+realtime para metadata — y **ningún dato nuevo puede vivir en dos dominios a la vez** (estructura→XML, metadata→tablas, sesión→Y.Doc).

---

## 5. Fricciones estructurales: qué encarece el desarrollo (ranking por dolor)

Separación clave: **interacción** (edición, render, colab en vivo) DEBE vivir en el cliente — es lo que da latencia cero y la UX natural, igual que draw.io/Figma. **Autoridad y operación** (validar, consolidar, migrar, notificar) viven en el cliente **por omisión, no por diseño** — ahí están los problemas reales.

1. **Binding CRDT ↔ commandStack — impuesto permanente.** Cada módulo nuevo de canvas debe pensar: ¿eco?, ¿origen remoto?, ¿read-only?, ¿fencing? Evidencia: `experience/` entero (EXP-001 typing, EXP-007 divergencia de id de conexión, EXP-003 y EXP-005 pools). Fricción esencial de "colab sobre motor no-CRDT" — no se elimina, se presupuesta en cada feature.
2. **N escritores async independientes → proliferación de guards.** Autosave, guardado manual, binding, cambio de pestaña: cada ruta re-valida `canEdit()` + `isCanvasReadyFor()` + fencing. Olvidar un guard = bug de corrupción (ya pasó). Un escritor único eliminaría la clase entera de bugs.
3. **Cero capa de ejecución en servidor.** Síntomas concretos: `migrate-images.mjs` requiere pausar usuarios (las operaciones de datos corren desde una laptop); validación de XML solo en cliente; correo vía Apps Script con deploy manual fuera del repo/CI (y pendiente — síntoma de esa fricción).
4. **Protocolo de sync hecho a mano.** Coalescer + anti-entropía + handshake late-joiner = reimplementación parcial de lo que Hocuspocus/y-websocket dan mantenido. Funciona y está testeado, pero sus edge cases son nuestros para siempre.
5. **RLS como única autorización.** Correcto, pero ya son 18 migraciones con helpers en `private` — lógica de negocio en SQL, difícil de testear unitariamente; crece con cada feature compartible.
6. **Artefactos derivados generados por el navegador.** Thumbnails/exports dependen de cómo cada browser serializa (el bug rgb()/hex del theme-remap fue exactamente eso) — resultado no determinista entre clientes.

### 5.1 La mejora: servidor delgado (adición, no rescritura)

Mover la app al servidor mataría la UX. Lo correcto es añadir un servidor delgado con lo ya pagado — Supabase Edge Functions + triggers, cero vendors nuevos:

| Etapa | Qué | Mata qué problema | Costo |
|---|---|---|---|
| Ya mismo | Trigger Postgres: sanidad mínima del XML al UPDATE (`<definitions`, tamaño máx, well-formed) | Basura persistida por cliente buggy | 1 migración |
| Ya mismo | `beforeunload` flush + líder de guardado | Ventana de pérdida + carreras CAS + guards (#2) | ~30 líneas cliente |
| Corto plazo | Edge Function "ops": migraciones y mantenimiento server-side | Pausar usuarios para migrar | 1 función |
| Corto plazo | Edge Function correo (reemplaza Apps Script) | Vendor lateral sin CI | 1 función + proveedor de email |
| Cuando escale | Servidor CRDT autoritativo (Hocuspocus/y-sweet): valida ops, ÚNICO escritor de `current_xml`, sirve estado a late-joiners | #2 de raíz, #4 completo, #1 en parte | Servicio a operar — decisión #7 del ADR; gatillo: usuarios externos o >5 editores/diagrama |

---

## 6. Veredicto de la auditoría: ¿arquitectura o implementación?

Ni lo uno ni lo otro en bloque — tres niveles distintos, con acciones distintas:

| Nivel | Diagnóstico | Acción |
|---|---|---|
| **Estilo arquitectónico** (capas + puertos + event-driven, cliente-pesado) | Correcto. No tocar. | Defenderlo (§4) |
| **Completitud arquitectónica** | Falta UNA pieza: el servidor delgado (autoridad de verificación + ejecutor de operaciones + eventualmente escritor único). Esto SÍ es arquitectura — es un componente ausente, no código mal escrito. | Roadmap §5.1 |
| **Implementación / disciplina** | Flush al salir, líder de guardado, LRU en caché de imágenes, thumbnail en idle, reglas nuevas nacen en `domain/`, presupuestar el impuesto del binding en cada feature de canvas | Quick wins §3.4 + disciplina de equipo |

Es decir: "los puntos de mejora están en la implementación" es cierto solo a medias — los quick wins sí son código, pero el hallazgo mayor de la auditoría (servidor delgado ausente) es un hueco **arquitectónico** de completitud, no de estilo. La diferencia práctica: el hueco de completitud se planifica como componente con roadmap; los de implementación se van pagando feature a feature.

### 6.1 Referencia competitiva (qué tienen draw.io/Figma que esto aún no)

- **Figma:** servidor autoritativo central por documento (un solo escritor, validación de ops server-side) + historial de versiones. Es exactamente la fila "cuando escale" de §5.1 + la pregunta 2 de §3.5 (versionado).
- **draw.io:** colaboración gruesa a nivel archivo (inferior a la nuestra en vivo), pero export/render deterministas y modo offline real.
- **Implicación para el nicho BPMN:** la colab en vivo ya es nivel Figma-lite; los gaps competitivos estructurales son **historial de versiones** (cambia el diseño de guardado: snapshots, no UPDATE in-place — decidir ANTES de acumular más features sobre el guardado actual) y **determinismo de artefactos** (thumbnails/exports server-side o normalizados).

---

## 7. Resumen en una frase

Arquitectura **cliente-pesado por capas con puertos de persistencia (Repository) sobre BaaS**, cuya apuesta central es: **XML canónico en Postgres como única verdad + CRDT efímero como transporte de sesión + control optimista (CAS) al guardar** — barata, determinista y auditable; sus límites conocidos (validación server-side, LWW de blob, guardados redundantes) están documentados y tienen camino de evolución claro (servidor CRDT autoritativo) cuando la escala lo pida.
