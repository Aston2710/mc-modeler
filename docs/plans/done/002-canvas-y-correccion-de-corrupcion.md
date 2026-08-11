---
id: PLAN-002
titulo: Reestructuracion del canvas y correccion de la corrupcion de diagramas
estado: done
creado: 2026-07-23
cerrado: 2026-07-23
aprobado_por: por-determinar
relacionados: [EXP-008]
---

# Plan: fix corrupción NaN + decisión de arquitectura de canvas

Fecha: 2026-07-23 · Rama: main · Estado: **plan, NO implementado**

## 0. Resumen ejecutivo

Dos problemas **independientes**, no confundir:

- **Incidencia (crash "no se suelta el shape" + toast al abrir):** bug de **DATO** —
  waypoints `NaN` persistidos por un autosave, originados por una **Association
  cuyo source es OTRA Association** (una conexión no tiene bounds → docking = NaN).
  Es **código cliente**, no red, no colaboración.
- **Arquitectura de canvas:** hoy hay **un canvas único** reimportado por pestaña.
  Afecta rendimiento y **radio de daño** (por qué un diagrama roto contamina a los
  demás). NO es la causa del crash.

**La mejor decisión de canvas es B (instancia viva por pestaña, cache
`detach`/`attachTo`), pero NO arregla la incidencia — solo la contiene.** El crash
se arregla con el Track 1 (dato + reglas de conexión + guardas anti-NaN).

---

## 1. Diagnóstico confirmado (con datos de Supabase)

Diagrama `f78f191f-bb0a-4a1d-9b0a-ff5d39a0eb85` ("se corrompio, abro ticket").

Elemento culpable en el XML almacenado:
```xml
<bpmn:Association id="Association_0smwwgo" associationDirection="None"
    sourceRef="Association_13187ou" targetRef="TextAnnotation_1lggpbp" />
```
`sourceRef` apunta a `Association_13187ou`, que es **otra `bpmn:Association`** (una
conexión, sin `x/y/width/height`). Al rutear/dockear se opera sobre bounds
`undefined` → NaN. DI resultante:
```xml
<bpmndi:BPMNEdge bpmnElement="Association_0smwwgo">
  <di:waypoint x="NaN" y="NaN" />
  <di:waypoint x="3084" y="NaN" />
  <di:waypoint x="3020" y="NaN" />
  <di:waypoint x="3020" y="167" />
</bpmndi:BPMNEdge>
```
(La nota `TextAnnotation_1lggpbp` quedó en x=2970, muy lejos del resto x∈[135,1550].)

Cadena: NaN en waypoints → `modeling.updateWaypoints` durante `importXML` →
bpmn-js core `LineAttachmentUtil.getAttachment` lanza *"expected between [1,2]
circle -> line intersections"* → `importXML` rechaza (toast "Error al cargar el
diagrama") → commandStack a medias → como el **modeler es único y compartido**, el
estado roto sobrevive al reimport del siguiente diagrama → todo buguea → refrescar
es el único reset. Mover un shape reentra en la ruta que lanza → el shape no
confirma (no se suelta) mientras el outline de selección sí se actualiza.

### Alcance (scan org-wide)
- **5 diagramas con `NaN` persistido:** "se corrompio, abro ticket" (23-jul),
  "TO-BE" (19-jul), "Pruebas" (3-jul), "Proceso de Gestión de Translados" (3-jul),
  "Ciclo de Vida" (24-jun).
- **3 con Association cuyo source es otra Association:** "se corrompio…",
  "Ciclo de Vida" (ya con NaN) y **"Torneo de Tenis" (latente, aún sin NaN)**.
- Hay NaN por más de una causa (los 3 viejos no tienen assoc→assoc): el
  **autosave que persiste coordenadas no finitas** es el amplificador común.

---

## 2. Verificación de la arquitectura de canvas (no solo el doc)

Comprobado en el código real, no en la documentación:
- **Canvas único confirmado:** `App.tsx:665` monta UN `<BpmnCanvas>`; `:239/:276`
  reimportan por pestaña sobre la misma instancia; `:338` y `canvasSession.ts` lo
  documentan. `useBpmnModeler.ts` crea `new BpmnModeler` una vez (dep
  `[containerRef]`), `destroy()` solo en unmount.
- **`attachTo`/`detach` EXISTEN** en el bpmn-js instalado
  (`node_modules/bpmn-js/lib/BaseViewer.js:619` y `:659`) → el enfoque B es
  técnicamente viable en esta versión.
- **Rama `tabs-cache`** (no en main): `src/bpmn/modelerCache.ts` implementa cache
  `Map<diagramId,{modeler,imported,lastUsed}>` con LRU 6, flag `flujo:tabsCache`
  (OFF por defecto). Pasos 1-4 hechos y verificados; **paso 5 (colaboración) es el
  checkpoint pendiente**; 6+ pendientes.
- **Perf (medición del equipo, `kpi/`, re-verificable con `src/utils/perf.ts`):**
  `importXML` domina y escala mal (400 elementos ≈ 17-25s; 150 ≈ 3.1s p50). Con
  cache: `attach` <16ms (~113×). Recomendado re-confirmar el baseline antes de
  invertir el esfuerzo de la Fase 2.

### Decisión: **B (instancia viva por pestaña)**
| Opción | Perf switch | Aislamiento (radio de daño) | Colaboración | Memoria |
|---|---|---|---|---|
| Single (hoy) | malo (reimport 3-25s) | **acopla** (contamina + refresh) | 1 canal (simple) | mínima |
| **B: cache detach/attach** | **<16ms** | **aísla** (diagrama roto no contagia) | 1 canal (bind a la activa) | N vivas, tope LRU |
| A: N canvas montados | <16ms | aísla | **N canales + fuga presencia** | N vivas |

B gana: bate a single en perf y aislamiento; bate a A en colaboración. Es el patrón
de Camunda (mismo motor) y Bizagi (verificado por decompilación en `.syntesis`).
Único costo real: memoria (acotada por LRU) y el **re-bind de colaboración** (riesgo
que hay que validar manual, 2 clientes en nube — no headless).

**Matices honestos:**
- B **no cura** el crash: el `importXML` del diagrama roto igual corre 1 vez por
  diagrama → seguiría fallando en su pestaña. B solo evita el contagio.
- B **no es urgente** para la incidencia; es inversión de perf + robustez que,
  de paso, habría contenido este incidente.

---

## 3. Plan paso a paso

### TRACK 1 — Arreglar la incidencia (urgente) — dato + código

**1.1 Backup antes de tocar dato.** `scripts/diagram-backup.mjs` o snapshot de las
filas afectadas.

**1.2 Reparar el dato del diagrama roto (`f78f191f`).** `Association_0smwwgo` es
inválida (source = conexión). Dos opciones (a elegir por el usuario):
- (a) **Borrarla** (+ su `BPMNEdge`): pierde ese único vínculo de nota. Mínimo riesgo.
- (b) **Reparar `sourceRef`** al nodo que se pretendía (probable `Activity_109ie3q`,
  "Modifica la negociación…", que es el source de `Association_13187ou`) y **quitar
  los waypoints NaN** (dejar que bpmn-js recompute, o poner una ruta recta).
- Recomendado (b) si se confirma la intención; si no, (a). Aplicar vía
  `execute_sql`/migración tras backup, y verificar reabriendo.

**1.3 Sanear los otros 4 diagramas con NaN** ("TO-BE", "Pruebas", "Translados",
"Ciclo de Vida") + el latente "Torneo de Tenis" (assoc→assoc sin NaN aún). Mismo
criterio: reparar refs inválidas y/o strip de waypoints NaN.

**1.4 Regla de conexión (raíz #1).** Módulo de reglas bpmn-js que **prohíbe** que el
source/target de una Association (y de cualquier conexión) sea una conexión. Esto
cierra la puerta a crear el estado inválido desde la UI (drag de endpoint sobre una
flecha). Archivos: `src/bpmn/elements/` (nuevo `ConnectionRulesModule` o extender
`GroupConnectionRulesModule`).

**1.5 Guarda anti-NaN en el router (raíz #2).** `BizagiLayouter`/
`OrthogonalityBehavior` nunca deben emitir waypoints no finitos: validar
`Number.isFinite` en cada punto producido y hacer fallback (ruta previa / recta) si
falla; y saltar el docking cuando el src/tgt no tiene bounds (es una conexión).
`rerouteClean` (OrthogonalityBehavior.ts:100) además necesita la guarda
`!src?.width || !tgt?.width` que ya tiene `repair`.

**1.6 Guarda de persistencia (raíz #3, la que hace el daño permanente).** El
export/autosave debe **rechazar** persistir coordenadas no finitas (validar el XML
antes de `saveDiagram`). Así un glitch transitorio nunca se vuelve corrupción
durable. Archivos: `useAutoSave.ts` / `useExport.ts` / capa de persistencia.

**1.7 Contención en import (defensa en profundidad).** Envolver el recompute de
waypoints en import para que una conexión mala no rechace todo `importXML` ni deje
el commandStack sucio (try/catch por conexión; sanear NaN → recta o drop del edge).

**1.8 Regresión.** Test con un XML que tenga association→association y con
waypoints NaN → import no lanza, no persiste NaN, la regla bloquea recrearlo.

### TRACK 2 — Canvas B (perf + robustez) — no urgente

**2.1** Rebase `tabs-cache` sobre main; resolver conflictos (routing reescrito,
drop-Yjs, imágenes).
**2.2** Re-verificar baseline con `perf.ts` (confirmar el 3-25s real hoy).
**2.3** Paso 5 del plan de la rama: re-bind de `useCollab`/`useComments`/cursores/
overlays a la instancia activa. **CHECKPOINT: verificación manual 2 clientes en
nube** (no headless).
**2.4** Paso 6: quitar `persistCanvasTab` del cambio de pestaña; undo por instancia;
`dispose` al cerrar pestaña; centralizar listeners globales (ya iniciado en paso 4).
**2.5** Verificación headless flag ON: 0 `importXML` en revisita, switch <16ms.
**2.6** Activar `flujo:tabsCache` por defecto; luego retirar el flag y simplificar/
retirar la maquinaria de `canvasSession` que deja de ser necesaria.

**Nota:** aun con B, mantener el Track 1 — B contiene el contagio pero el dato malo
sigue roto sin la reparación + reglas.

---

## 4. Orden recomendado
1. Track 1.1-1.3 (backup + reparar dato) → recupera los diagramas ya rotos **hoy**.
2. Track 1.4-1.8 (reglas + guardas) → evita nuevas corrupciones. **Prioridad alta.**
3. Track 2 (canvas B) → perf + aislamiento, tras el checkpoint de colaboración.
