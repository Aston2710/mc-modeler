---
id: PLAN-005
titulo: Cambio de pestanas con una instancia bpmn-js viva por diagrama
estado: en-progreso
creado: 2026-07-15
cerrado:
aprobado_por:
auditado: 2026-08-14
relacionados: [context/flags-operacion.md, EXP-011, PLAN-014, MASTER-PLAN-018]
---

# Optimización: cambio de pestañas con instancia viva por diagrama

> ## ⚠️ Auditoría del 2026-08-14 — este documento estaba desactualizado
>
> Se contrastó cada paso contra el código. **El multicanva lleva meses activo en producción**, no apagado como decía este plan.
>
> | Paso | Decía | Es |
> |---|---|---|
> | 1 · `modelerCache.ts` | hecho | ✓ `src/bpmn/modelerCache.ts` |
> | 2 · cableado tras flag | hecho | ✓ `useBpmnModeler.ts:289` |
> | 3 · listeners centralizados | hecho | ✓ `wireInstance` + `keydown` global |
> | 4 · `canvasSession`/`readOnlyState` por instancia | hecho | ✗ **NO** — los dos siguen siendo globales |
> | 5 · re-bind de colaboración | pendiente | ✓ **HECHO** — `activeVersion` en `useCollab`, `useComments`, `useCommentSetup` (`BpmnCanvas.tsx:71-76`) |
> | 6 · `dispose` al cerrar pestaña | pendiente | ✓ **HECHO el 2026-08-14** — `diagramStore.closeTab` |
> | 6 · quitar `persistCanvasTab` del cambio | pendiente | ✗ sigue en `App.tsx:331` |
> | **flag por defecto** | **"sigue OFF"** | ✗ **ON** — `isTabsCacheEnabled()` devuelve `true` salvo `'0'` explícito |
>
> Dos errores en direcciones opuestas: el paso 5 constaba pendiente y estaba hecho; el paso 4 constaba hecho y no lo estaba.
>
> **Lo que queda abierto está más abajo, en *Pendiente real*.**

**Estado:** en producción con el flag ON; dos puntos pendientes.
**Fecha:** 2026-07-15 · auditado 2026-08-14
**Archivos afectados:** `src/App.tsx`, `src/hooks/useBpmnModeler.ts`, `src/hooks/useCollab.ts`, `src/collab/canvasSession.ts`, `src/bpmn/readOnlyState.ts`, `src/bpmn/modelerCache.ts`, `src/store/diagramStore.ts`, `src/components/canvas/BpmnCanvas.tsx`
**Investigación de respaldo:** `.syntesis/Tabs - cache diagramas/findings.md` (decompilación de Bizagi Modeler), código fuente de Camunda Modeler

---

## Problema

Abrir un diagrama tiene un delay perceptible, y **cambiar entre pestañas ya abiertas tiene el mismo delay** — la pestaña abierta no aporta nada: cada cambio paga el costo completo de carga otra vez.

### Anatomía del delay (flujo actual)

Hay **una sola instancia de bpmn-js** (`useBpmnModeler.ts:49`) compartida por todas las pestañas. Al cambiar de pestaña (`App.tsx:296-305`) ocurre, en serie y bloqueando:

1. **`persistCanvasTab()`** (`App.tsx:326-344`) — si hay cambios sin guardar:
   `exportXml()` + **generar thumbnail** (serializar SVG completo + rasterizar) + **`saveDiagram` a Supabase (red)**. Todo con `await` ANTES de empezar a cargar la pestaña destino.
2. **`modeler.importXML(xml)`** — re-parsear el XML (moddle), reconstruir el element registry y re-renderizar TODO el SVG desde cero. Costo dominante en diagramas grandes. Se paga en **cada** cambio porque el canvas es único.
3. **Reconexión de colaboración** (`useCollab.ts:225`) — el effect depende de `activeTabId`: destruye Y.Doc + canal Realtime y reconecta al diagrama nuevo. Handshake de red.
4. Zoom `fit-viewport` + render final.

### Lo que NO es el problema

El XML **ya se cachea en memoria**: `ensureXml` (`diagramStore.ts:155-168`) solo va a red la primera vez; cambios posteriores leen del store Zustand. Cachear "más datos" no quita el delay — lo caro no es obtener el XML, es **reconstruir el editor** a partir de él, más el guardado bloqueante previo.

Estado de cachés existentes (todas vivas, ninguna legacy): XML en `diagramStore`, thumbnails + rutas en `SupabaseRepository`, imágenes embebidas en `imageStorage`, candidatos a obstáculo en `BizagiLayouter`.

---

## Propuestas evaluadas

### A. Quick wins sobre la arquitectura actual (bajo costo)

1. **Guardado en background al cambiar de pestaña**: exportar XML síncrono, disparar `saveDiagram` sin `await` (encadenado en `saveChain`, `diagramStore.ts:118`), importar la pestaña destino de inmediato. Quita la red del camino crítico.
2. **Diferir el thumbnail**: `buildThumbnail` (SVG→raster) es caro; generarlo async fuera del camino crítico o saltarlo en cambios de pestaña (ya se genera en guardado manual y autosave).

Elimina los pasos 1 (red + raster) del delay. No toca el paso 2 (`importXML`), que sigue pagándose en cada cambio.

### B. Instancia viva de bpmn-js por pestaña abierta ⭐ GANADORA

Una instancia `BpmnModeler` por pestaña abierta, guardada en un registro `Map<diagramId, instancia>`. Cambiar de pestaña = `detach()` de la actual + `attachTo(container)` de la destino (API pública de bpmn-js/diagram-js). **Sin `importXML`, sin export, sin red.** Cerrar pestaña = `destroy()` + eliminar del registro; reabrir = crear + importar (lazy, como hoy).

### C. Variante intermedia: pool LRU acotado

Igual que B pero con tope de N instancias vivas (p. ej. 3-5); la menos usada se destruye y se re-importa si se vuelve a visitar. Cubre memoria acotada si preocupan pestañas masivas.

---

## Propuesta ganadora y por qué es el estándar de la industria

**B (instancia viva por pestaña), ejecutada en dos fases: primero A como paso barato e inmediato, luego B como destino.** A no se descarta — sus cambios (guardado async, thumbnail diferido) siguen siendo necesarios en B para el autosave y el cierre de pestañas.

La evidencia de que B es el patrón estándar viene de las dos referencias más cercanas a nuestro stack:

### Camunda Modeler (mismo motor bpmn-js, código fuente público)

`client/src/app/cached/` (`Cache.js`, `WithCachedState.js`, `CachedComponent.js`):

- Una instancia `BpmnModeler` por pestaña, creada una vez vía `createCachedState()` y cacheada.
- Cambio de pestaña = `modeler.detach()` / `modeler.attachTo(dom)`. Nunca `importXML` al cambiar.
- `isImportNeeded()` guarda `lastXML`; re-importa solo si `xml !== lastXML`.
- Dirty tracking comparando `commandStack._stackIdx` contra el `stackIdx` cacheado.
- Cerrar pestaña → `__destroy` de la entrada del cache.

### Bizagi Modeler (verificado por decompilación — ver findings.md)

- `FrmModeler.ShowDiagram()`: si el diagrama ya tiene editor abierto → `TabControlDocuments.SelectedTab = tab; return;` — **solo selecciona la pestaña, cero recarga**.
- Registro central de instancias vivas: `FlowchartManager` (lista de `DiagramFlowChart`) / `DiagramEditorHandleManager` (editores nuevos), con `GetFlowChart(diagramId)` que devuelve la instancia existente.
- Carga perezosa: `if (!diagram.IsLoaded) LoadDiagram(...)` — equivalente exacto de nuestro `ensureXml`.
- Cierre: `Tabs.Remove` + `Dispose()` del editor + `ClearUndoContext(diagramId)`.
- Undo **por diagrama**, vivo mientras la pestaña esté abierta (`SetUndoContext()` al cambiar).
- Dato clave: el editor moderno de Bizagi es **Chromium embebido (CefSharp) por pestaña** — aun pagando un webview completo por diagrama abierto, eligieron instancia viva antes que recargar. Un bpmn-js por pestaña es una fracción de ese costo.

VS Code sigue el mismo principio (`retainContextWhenHidden` en webviews; text buffers siempre en memoria por documento abierto). La excepción es draw.io (re-render por página), viable solo porque mxGraph renderiza mucho más barato que un `importXML` de bpmn-js.

---

## Cambios a aplicar

### Fase 1 — quick wins (sin refactor estructural)

| # | Cambio | Dónde |
|---|---|---|
| 1.1 | En el cambio de pestaña: exportar XML síncrono, encolar `saveDiagram` en `saveChain` sin `await`, importar destino de inmediato. Mantener el fencing de `isCanvasReadyFor` | `App.tsx:296-305`, `persistCanvasTab` |
| 1.2 | Thumbnail fuera del camino crítico: generarlo tras el import del destino (idle) o solo en autosave/guardado manual | `App.tsx:326-344` |
| 1.3 | `lastXML` por pestaña: si se vuelve a una pestaña cuyo XML no cambió desde el último import… (aplica de lleno en Fase 2; en Fase 1 solo como preparación) | `App.tsx` |

### Fase 2 — instancia viva por pestaña (patrón Camunda/Bizagi)

| # | Cambio | Dónde |
|---|---|---|
| 2.1 | Registro `Map<diagramId, {modeler, lastXML}>`. Crear al abrir pestaña, `destroy()` al cerrarla | nuevo módulo (p. ej. `src/bpmn/modelerCache.ts`) |
| 2.2 | Cambio de pestaña = `modeler.detach()` + `modeler.attachTo(container)`. Import solo si `xml !== lastXML` (patrón `isImportNeeded` de Camunda) | `useBpmnModeler.ts`, componente canvas |
| 2.3 | `canvasSession` (tokens de fencing) y `isBpmnReadOnly` pasan de estado global único a estado por instancia | `src/collab/canvasSession.ts`, `src/bpmn/readOnlyState.ts` |
| 2.4 | Listeners globales (teclado, contextmenu, MutationObserver de tema) se centralizan una vez y despachan a la instancia activa — hoy se registran dentro del effect del modeler único | `useBpmnModeler.ts:206-244` |
| 2.5 | Colaboración: decidir entre (a) canal Realtime + Y.Doc **por pestaña abierta** (sync continuo de todas, más conexiones) o (b) binding solo en la pestaña visible con re-bind al cambiar (menos conexiones, re-sync al volver). Empezar con (b): conserva el comportamiento actual y no multiplica canales | `useCollab.ts` |
| 2.6 | `persistCanvasTab` en cambio de pestaña desaparece (nada que exportar: la instancia conserva su estado); el guardado queda solo en autosave/manual/cierre de pestaña | `App.tsx` |
| 2.7 | Undo/redo leen del `commandStack` de la instancia activa — cada pestaña conserva su pila (gratis con instancias separadas) | `App.tsx`, `useBpmnModeler.ts` |
| 2.8 | Opcional (si la memoria preocupa): tope LRU de instancias vivas, configurable | `modelerCache.ts` |

Riesgos a vigilar en Fase 2: fugas de memoria por listeners no liberados en `destroy()`; interacción autosave↔pestaña no visible; `ThemeAwareRenderer` y resolución de imágenes (`imageStorage`) ya son módulos por instancia — verificar que no asuman canvas único.

### Fase 2 — decisión de ejecución (2026-07-16)

**Enfoque elegido: B — cache de instancias + `detach`/`attachTo`, con un solo canvas React activo.**
Descartado A (N `<BpmnCanvas>` montados, activo visible): montaría N canales Realtime + N suscripciones de comentarios simultáneos, y la presencia se filtraría a todas las pestañas abiertas (aparecerías "presente" en diagramas que no estás viendo). Con un subsistema de colaboración documentadamente frágil, B es más prudente: la colaboración sigue vinculada SOLO a la instancia activa, exactamente como hoy (`useCollab`/`useComments` ya se keyean por `activeTabId`) — solo evitamos el re-`importXML` guardando la instancia y re-adjuntándola. Es además el patrón exacto de Camunda (`WithCache` + `attachTo`/`detach`).

**Dato que refuerza la prioridad (medido en Fase 0/verificación):** `importXML` escala pésimo — diagrama de 400 elementos = **17-25s** de bloqueo síncrono del hilo (probable culpa: capa de routing Bizagi corriendo en cada import). Cada cambio a una pestaña ya vista paga eso hoy. B lo lleva a `attach` (<16ms).

**Orden de migración (incremental, cada paso verificable y con feature flag `flujo:tabsCache`):**
1. `src/bpmn/modelerCache.ts` — módulo puro: `Map<diagramId, {modeler, imported}>`, `getOrCreate`, `detach`, `attachTo`, `dispose`, tope LRU. **Aislado, sin cablear (paso actual).**
2. Wire en `useBpmnModeler`/`BpmnCanvas` DETRÁS del flag: con flag OFF, comportamiento actual intacto (cero riesgo). Con ON, usar el cache: import solo la 1ª vez por diagramId (`imported`), `detach`/`attach` en cambio.
3. Centralizar listeners globales (teclado/contextmenu/tema) fuera del ciclo de vida por-instancia (2.4).
4. `canvasSession`/`readOnlyState` por instancia (2.3).
5. **CHECKPOINT con el usuario** antes de tocar colaboración (2.5): re-bind de `useCollab`/`useComments` a la instancia activa + verificación manual multiusuario en nube (no verificable headless).
6. Quitar `persistCanvasTab` del cambio de pestaña (2.6); undo por instancia (2.7).

**Plan de verificación:** headless en modo local (flag ON) — abrir A, abrir B, volver a A → confirmar **0 `importXML`** en el regreso y `tab:switch` <16ms. Colaboración: manual, 2 clientes en nube, en el checkpoint.

**Pasos 1-3 HECHOS y verificados (2026-07-16):**
- Paso 1: `src/bpmn/modelerCache.ts` (cache puro, LRU 6, flag `flujo:tabsCache`).
- Paso 2: cableado en `useBpmnModeler` detrás del flag. `wireInstance` extraído (listeners por-instancia reutilizables); listeners globales de teclado ahora leen `modelerRef.current`; `importXml` bifurca: flag ON crea/adjunta del cache e importa solo la 1ª vez por diagrama (`bpmn:reattach` en revisitas); cleanup `disposeAll()`. Flag OFF byte-idéntico (117/117 tests pasan).
- **Resultado medido (modo local, diagrama 120 tareas, revisitas A↔B):**

| | revisita a pestaña abierta (diagram:load p50) | re-importa? |
|---|---|---|
| flag OFF (actual) | **1409ms** | sí, 8/8 |
| flag ON (cache) | **12.4ms** (~113×) | **no, 0 importXML** |

**Paso 4 HECHO y verificado (2026-07-16):** auxiliares siguen a la instancia activa. Señal `activeVersion` en `useBpmnModeler` (se incrementa en cada attach); el effect de scrollbars en `BpmnCanvas` depende de ella y re-vincula el listener `canvas.viewbox.changed` a la nueva instancia (captura la instancia para el cleanup). Helper `applyThemeTo` extraído + re-tematizado al re-adjuntar (instancia oculta durante cambio de tema). Zoom por-instancia ya venía de `wireInstance`. Smoke flag ON: revisita restaura el diagrama correcto (64 vs 124 shapes), `bpmn:reattach` sin `importXML`, **0 errores de página**. 117/117 tests, tsc+lint limpios.

**Paso 5 HECHO** (fecha sin registrar; verificado por auditoría el 2026-08-14): `useCollab`, `useComments` y `useCommentSetup` reciben `activeVersion` y se re-vinculan a la instancia activa en cada `attach` (`BpmnCanvas.tsx:71-76`). La verificación manual con 2 clientes en nube **no consta**: el checkpoint con el usuario que el plan exigía no aparece registrado en ningún sitio.

**Paso 6 — `dispose` al cerrar pestaña: HECHO (2026-08-14).** `diagramStore.closeTab` llama a `modelerCache.dispose(id)` tras reasignar `activeTabId`. Antes, cerrar una pestaña dejaba su instancia viva —SVG, element registry y pila de undo— hasta que el LRU la desalojara (tope 6) o se volviera al inicio. 5 pruebas en `src/store/diagramStore.closeTab.test.ts`.

**El flag está ON por defecto**, no OFF: `isTabsCacheEnabled()` devuelve `true` salvo que localStorage tenga `'0'`. Producción lleva meses con el multicanva activo.

## Pendiente real (auditoría 2026-08-14)

### 1. Paso 4 — `canvasSession` y `readOnlyState` siguen siendo globales

`src/collab/canvasSession.ts` mantiene **un solo** contador de generación (`generation`, `readyDiagramId`, `readyGeneration`) para todas las instancias, y `src/bpmn/readOnlyState.ts` una sola bandera.

> **Corrección del 2026-08-14.** Una primera versión de esta auditoría afirmó que ese contador único rompía el fencing con varias instancias vivas —que cada `attach` invalidaba la confirmación de las demás— y lo señaló como causa probable del mecanismo A de [EXP-011](../../experience/011-perdida-silenciosa-de-cambios-entre-colaboradores.md).
>
> **Es falso.** Al trazar el código: `useBpmnModeler.ts:299-308`, en el camino de re-adjuntar una instancia ya importada, llama a `beginImport()` y `completeImport()` de forma síncrona y consecutiva. La generación se reclama y se confirma sin ventana entre medias, así que `isCanvasReadyFor()` responde correctamente tras cada cambio de pestaña. El caso está resuelto.
>
> **El mecanismo A sigue sin causa identificada.** El registro de PLAN-014 (`collab.bind_timeout` con `ready_diagram`, `active_version` y `retries`) sigue siendo la vía para averiguarlo, ahora sin una hipótesis previa que sesgue la lectura.

Lo que queda es deuda de diseño, no un fallo activo: el estado global funciona porque solo hay una instancia adjunta a la vez, pero es frágil ante cualquier cambio que rompa esa premisa (p. ej. dos canvas visibles a la vez). El patrón correcto es `Map<diagramId, estado>`, igual que el propio `modelerCache`.

**No tocar el fencing sin una causa concreta que arreglar**: relajarlo mal es lo que causó [EXP-003](../../experience/003-contaminacion-de-pools-entre-diagramas.md) (elementos de un diagrama dentro del pool de otro).

### 1b. Bug real: una importación interrumpida no queda marcada

`useBpmnModeler.ts:324-326`:

```ts
await entry.modeler.importXML(sane.xml)
if (modelerRef.current !== entry.modeler) return   // sale aquí…
cacheMarkImported(diagramId)                       // …y esto no corre
```

Si el usuario cambia de pestaña mientras un diagrama se importa, la importación **sí termina** en su instancia, pero `entry.imported` se queda en `false`. Al volver a esa pestaña se re-importa entera, pagando otra vez el coste que el cache existe para evitar.

Impacto: rendimiento, no corrupción. Se auto-corrige en el segundo intento. La guarda de la línea 324 es correcta —protege de escribir sobre la instancia equivocada—; lo que falta es marcar el import como completado cuando de hecho lo está.

### 2. Paso 6 — `persistCanvasTab` sigue en el cambio de pestaña

`App.tsx:331` continúa exportando y guardando al cambiar de pestaña. Con instancia viva no hace falta: la instancia conserva su estado, así que el guardado podría quedar solo en autosave, guardado manual y cierre de pestaña. Es la optimización que queda sin recoger; no es un fallo.

### 3. Sin verificación manual registrada

El plan exigía un checkpoint con 2 clientes en nube antes de dar por bueno el paso 5. El código está, el checkpoint no consta. Ahora hay un entorno donde hacerlo sin tocar producción: `npm run lab` (ver [`desarrollo-local.md`](../../context/desarrollo-local.md)).

## Resultados esperados

- **Cambio entre pestañas abiertas: instantáneo** (mostrar/ocultar DOM; hoy: guardado en red + importXML completo).
- Primera apertura de un diagrama: igual que hoy (lazy `ensureXml` + import), una sola vez por pestaña.
- **Undo/redo por pestaña sobrevive a los cambios de pestaña** (hoy se pierde en cada `importXML`).
- Zoom, scroll y selección de cada pestaña se conservan.
- Sin red en el camino crítico del cambio (Fase 1 ya lo logra).
- Cerrar pestaña libera la memoria; comportamiento de reapertura idéntico al actual.
- Memoria acotada por número de pestañas abiertas (no por diagramas totales); con tope LRU si hiciera falta.

## Otras prácticas de optimización de carga de diagramas

Complementarias, ordenadas por relación beneficio/esfuerzo:

1. **Skip-import por `lastXML`** (Camunda `isImportNeeded`): incluso sin multi-instancia, si el XML no cambió desde el último import de esa pestaña, no re-importar. Barato y efectivo.
2. **Prefetch de XML en background**: al restaurar sesión con varias pestañas, `ensureXml` de las no activas en idle (`requestIdleCallback`) — la primera visita a cada pestaña ya no paga red.
3. **Precarga especulativa**: `ensureXml` al hacer hover sobre una tarjeta del home o una pestaña — la red corre durante el tiempo de reacción del usuario.
4. **Render en dos tiempos**: importar y mostrar primero, `fit-viewport` y decoraciones después (percepción de carga menor).
5. **Caché de lectura local (stale-while-revalidate)**: `LocalRepository` (IndexedDB) ya existe como fallback; usarlo como caché de primera pintura — mostrar el XML local al instante y reconciliar con el servidor en background. Útil sobre todo en conexiones lentas. Requiere cuidado con conflictos (ya existe CAS + toast de conflicto).

   > **Evaluado y aplazado el 2026-08-14.** Con la instancia viva funcionando, el cambio entre diagramas ya es rápido incluso en diagramas grandes, así que la ganancia restante es pequeña.
   >
   > Datos que lo respaldan: 155 diagramas vivos, **26 kB de XML medio**, 66 kB en el p95, 294 kB el mayor. Y el XML **ya se cachea en memoria** (`ensureXml` solo va a red la primera vez por sesión). Lo único que añadiría la persistencia es sobrevivir a una recarga de página o al cierre del navegador.
   >
   > Si se retoma, tres precisiones que costaron tiempo aclarar:
   > - **`localStorage` no se limpia al cerrar la pestaña** — persiste indefinidamente. El que sí se limpia es `sessionStorage`, que por eso no sirve aquí.
   > - **`localStorage` es síncrono**: escribir 294 kB congela el hilo principal. Para esto va IndexedDB, y localforage ya está en el proyecto.
   > - **Riesgos a cubrir**, ninguno descalificante: equipo compartido (el siguiente usuario del perfil encuentra los diagramas del anterior), acceso revocado (la copia local sobrevive a perder el permiso → revalidar en cada arranque), y XSS (hoy alcanza lo que esté abierto; con caché completo, el corpus entero).
   >
   > Regla si se hace: el caché es para **pintar rápido**, nunca para **guardar**. El XML canónico en Postgres sigue siendo la única fuente de verdad (DEC-001); confundir eso es la clase de bug que costó EXP-004 y EXP-008.
   >
   > **Antes que esto**, por orden de retorno: `getSession()` en vez de `getUser()` al cargar roles (dos líneas, quita la mitad de los viajes de red), y la precarga en segundo plano del punto 2 de esta lista.
6. **Thumbnails en idle**: generar siempre vía `requestIdleCallback`/cola de baja prioridad, nunca en camino crítico de navegación.
7. **Conexión de colaboración diferida**: conectar el canal Realtime después del primer render del diagrama, no antes (el usuario ve el diagrama ya; la presencia llega medio segundo después).
8. **Mantener diagramas ligeros**: el costo de `importXML` escala con el número de elementos; los subprocesos enlazados (ya soportados) son la herramienta de modelado para partir diagramas gigantes.

## Estado de ejecución

- **Fase 0 (instrumentación + baseline): HECHA (2026-07-16).** Instrumentación permanente en `src/utils/perf.ts` (activa en dev, expuesta en `window.__flujoPerf`), con spans en los caminos calientes de `App.tsx`, `useBpmnModeler.ts`, `diagramStore.ts`, `useCollab.ts`. Baseline medido y documentado en `kpi/baseline-2026-07-16.md` (+ JSON crudo). Hallazgo central confirmado con datos reales: **`importXML` domina y escala mal — ~3.1s (p50) en diagrama grande de 150 elementos**, pagado en cada cambio de pestaña. Es el costo que la Fase 2 lleva a <16ms.
- **Fase 2 (instancia viva): EN PRODUCCIÓN con el flag ON.** Pasos 1, 2, 3, 5 y el `dispose` del 6 hechos. Quedan el paso 4 (estado por instancia) y quitar `persistCanvasTab` del cambio — ver *Pendiente real*.
- **Fase 1 (guardado en background + captura no bloqueante): HECHA (2026-07-16).** Al cambiar de pestaña, `saveDiagram` ya no se espera (background, serializado en `saveChain`); el XML se stashea en memoria con `cacheXml` antes de disparar el guardado (sin pérdida si el usuario vuelve a la pestaña). Rutas de salida del editor (home/enlace) siguen con guardado esperado. Resultado verificado con A/B controlado (mismo build, misma sesión, aislando la variable): `tab:persist` p50 68→**14.5ms** (~4.7×), max 320→**40ms** (~8×) en modo local. (La comparación cross-run inicial daba ~7.5× pero estaba inflada por variación de máquina; el A/B es el número confiable.) Detalle en `kpi/fase1-2026-07-16.md`. Cambios en `src/App.tsx` (persistCanvasTab con opción `background`), `src/store/diagramStore.ts` (acción `cacheXml`).
- Fases 3-4: no llegaron a definirse.

## Referencias

- `kpi/baseline-2026-07-16.md` — baseline de rendimiento con desglose por tamaño y metas por fase.
- `.syntesis/Tabs - cache diagramas/findings.md` — decompilación de Bizagi: `ShowDiagram`, `CloseDocument`, `FlowchartManager`, handler de tab-change, con citas de código.
- Camunda Modeler: [repo](https://github.com/camunda/camunda-modeler/), `client/src/app/cached/` y `client/src/app/tabs/bpmn/BpmnEditor.js` (`createCachedState`, `attachTo`/`detach`, `isImportNeeded`, dirty por `stackIdx`).
- Flujo actual: `App.tsx:296-305` (cambio de pestaña), `App.tsx:326-344` (`persistCanvasTab`), `useBpmnModeler.ts:257-287` (`importXml` + fencing), `diagramStore.ts:155-168` (`ensureXml`), `useCollab.ts:46-225` (ciclo de vida por `activeTabId`).
