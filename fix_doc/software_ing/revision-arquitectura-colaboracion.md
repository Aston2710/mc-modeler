# Revisión de arquitectura — colaboración, persistencia y derivados

**Fecha:** 2026-07-07
**Alcance:** revisión conversacional (sin cambios de código) del sistema de colaboración en vivo, la persistencia y la generación de thumbnails. Motivada por la cadena de bugs de thumbnails (flash de tema, colores dark residuales, lasso capturado) y por la familia de parches CAS (conflictos fantasma).

---

## 1. Cómo funciona hoy (resumen de capas)

Con *n* personas editando un diagrama existen **n+1 copias**, ninguna "la del servidor" en el sentido clásico:

| Capa | Dónde vive | Qué es |
|---|---|---|
| Modelo bpmn-js | RAM de cada navegador | Lo que el usuario ve y muta (objetos JS) |
| `Y.Doc` (CRDT Yjs) | RAM de cada navegador | Espejo del modelo vía `YjsBpmnBinding`; updates conmutativos e idempotentes |
| Broadcast | Supabase Realtime (websocket, canal por diagrama) | Updates binarios Yjs entre peers, ~ms; el servidor solo retransmite |
| Log append-only | Postgres `yjs_updates` | Cada update se INSERTa (nunca UPDATE) → durabilidad continua, sin esperar al "guardar" |
| Snapshot CRDT | Postgres `yjs_documents` (`state` + `last_seq`) | Consolidación del log por compactador server-side |
| Foto materializada | Postgres `diagrams.current_xml` + thumbnail en Storage | Snapshot XML + imagen para lista, exports, apertura no-colaborativa |

Quien entra tarde: snapshot + cola del log + anti-entropía por state-vector con los peers (commit `c620ed6`).

**Veredicto general:** la base es sólida y estándar de industria (patrón Figma/Linear: CRDT + log append-only + snapshot compactado). No es caos. Hay **un** defecto estructural y deuda de transición normal de un pivote.

---

## 2. Antipatrón central: dato derivado tratado como primario

`current_xml` y el thumbnail son **derivados** del CRDT — una foto. Pero los escriben **todos los clientes, concurrentemente**, en cada guardado manual y autosave (~20s). Consecuencia: una familia de mecanismos defensivos acumulados, cada uno razonable en aislamiento:

1. CAS optimista sobre `updated_at` (evitar pisar al otro)
2. Retry con re-fetch al conflictar
3. `adoptPersisted` — atajo de idempotencia si el XML remoto es idéntico
4. Jitter 0–5s en autosave — decorrelacionar timers sincronizados por eventos remotos
5. `saveChain` — serializar guardados del mismo cliente
6. Skip del UPDATE de `thumbnail_path` si no cambió — no bumpear `updated_at` (trigger) en cada autosave

Seis parches protegiendo una escritura que, conceptualmente, **ningún cliente debería hacer más de una vez**: el estado ya es idéntico en todos los peers (CRDT convergente); n clientes materializando la misma foto es trabajo redundante que además compite consigo mismo.

### Corrección arquitectónica recomendada (una sola)

Mover la materialización al **compactador server-side** (que ya existe para el snapshot Yjs):

- El compactador, al consolidar el log, deriva también `current_xml` y (opcionalmente) el thumbnail.
- Los clientes quedan **read-only** sobre `diagrams.current_xml` y el thumbnail.
- Desaparecen de un plumazo: CAS, retry, adoptPersisted, jitter, saveChain, skip de thumbnail_path. Menos código, menos estados raros.
- El "guardar" del cliente queda solo para el modo no-colaborativo (LocalRepository), donde no hay concurrencia y nada de esto aplica.

Costo: renderizar XML/SVG desde el CRDT fuera del navegador (headless bpmn-js en edge function, o un cliente designado como "materializador"). No es trivial — por eso es dirección a mediano plazo, no fix urgente.

---

## 3. Olores secundarios (en orden de riesgo)

### 3.1 Thumbnail = screenshot de la superficie de edición viva

El thumbnail se genera raspando (`saveSVG`) el canvas del usuario **en medio de su interacción**. Clase de bugs que esto ya produjo:

- Flash de tema al guardar en dark (se re-renderizaba el canvas real a light y de vuelta) — corregido con remapeo de colores por string, sin tocar el DOM (`useExport.ts`).
- Colores dark residuales — el browser serializa `style="fill: ..."` como `rgb(r, g, b)`, no hex; el mapa necesita ambas formas (`hexToRgbString`).
- Rectángulo negro — el autosave disparó en mitad de un arrastre de lasso y `saveSVG` capturó `djs-lasso-overlay`, que sin el CSS de la app renderiza con fill negro por defecto. Corregido con `sanitizeExportedSvg` (poda de markup transitorio: lasso, draggers, resizers, bendpoints).

Los fixes son estables, pero la fragilidad es de diseño: cualquier widget de interacción futuro que dibuje en la capa activa del canvas volverá a aparecer en exports (mitigación: añadir su clase a `TRANSIENT_SELECTORS`). La eliminación total es render dedicado (offscreen o server-side, ver §2).

### 3.2 El binding bpmn-js ↔ Yjs pelea contra el framework

bpmn-js no fue diseñado para espejarse a un CRDT. Evidencia: interceptores con prioridad 5000, guards M1/C1/C3/C4, pasada correctiva del binding, anti-entropía. No hay alternativa corta (sería forkear bpmn-js) — es el punto más frágil del sistema y **cada upgrade de bpmn-js es un riesgo**. Mantener la batería de tests de regresión del binding como condición para cualquier bump de versión.

### 3.3 Salud del log depende del compactador

`yjs_updates`: ~1,190 filas / 95 docs hoy — trivial. Pero sin compactación corriendo en serio, el join de un colaborador nuevo se degrada linealmente con la historia. El compactador es infraestructura crítica, no opcional (etapas del pivote ADR aún sin desplegar a la fecha de esta revisión).

### 3.4 Documentación desactualizada

`CLAUDE.md` aún declara "v1.0: 100% client-side, sin backend, sin auth" — el pivote ADR lo volvió falso (Supabase, auth, realtime). Barato de corregir, caro de ignorar: quien entre al proyecto arranca con el mapa equivocado.

### 3.5 Deuda de transición

- Dos sistemas de comments (`YjsCommentBinding` → `SupabaseCommentBinding`): el viejo debería marcarse deprecated o borrarse al cerrar el pivote.
- `yjs_documents_backup_20260701` viva en prod (100 filas) — poner fecha de expiración.
- Commits multi-tema (ej. `bbba3b7`: thumbnails + comments + CAS parcial en uno) — dificulta bisect y revert selectivo.

---

## 4. Notas de datos encontradas durante la revisión (no bugs)

- **XML con 2+ `bpmndi:BPMNDiagram` NO es corrupción**: bpmn-js crea un plane de drilldown vacío por cada subproceso colapsado (12/103 diagramas en BD lo tienen). No sanitizar.
- Diagramas importados de otras herramientas traen IDs arbitrarios (`n_<uuid>`) — cualquier heurística por prefijo de ID (`Participant_...`) falla; identificar elementos siempre por `$type` del modelo (así lo hace `topPoolCrop`).
- Un solo diagrama en BD con múltiples pools reales (contenido, no bug de render); el thumbnail multi-pool ahora recorta al pool superior.

---

## 5. Prioridades sugeridas

| # | Acción | Esfuerzo | Elimina |
|---|---|---|---|
| 1 | Desplegar/verificar compactador en prod | bajo (ya diseñado) | riesgo de degradación del join |
| 2 | Actualizar CLAUDE.md al estado post-pivote | trivial | onboarding con mapa falso |
| 3 | Limpiar deuda de transición (§3.5) | bajo | confusión y peso muerto |
| 4 | Materialización server-side de `current_xml`/thumbnail (§2) | medio-alto | CAS + jitter + adoptPersisted + saveChain + toda la clase de bugs de thumbnail |
| 5 | Congelar versión de bpmn-js salvo upgrade deliberado con regresión completa del binding | política | roturas silenciosas del binding |
