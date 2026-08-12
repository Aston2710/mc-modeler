---
id: EXP-008
titulo: Diagrama corrupto en produccion: diagnostico y plan de mejora continua
estado: resuelto
severidad: critica
fecha_deteccion: 2026-07-23
fecha_cierre: 2026-07-23
componentes: [src/persistence, current_xml]
relacionados: []
---

# Diagnóstico CONFIRMADO — diagrama "se corrompio, abro ticket"

Fecha: 2026-07-23 · Rama: **main** · Estado: **causa raíz confirmada por consola**
Diagrama: **"se corrompio, abro ticket"** · id `f78f191f-bb0a-4a1d-9b0a-ff5d39a0eb85`
(proyecto "Mejora Continua"; creado hace ~3 h con el build actual → **no está en
ningún backup**, último backup 19-jul).

## Respuesta directa: ¿red o código?

**CÓDIGO, 100% cliente. NO es red.** En el log de consola **todos** los `fetch` a
Supabase resuelven 200 (auth, projects, diagrams, comment_threads, etc.). El único
`400 Bad Request` es un thumbnail faltante (`0074849b…/thumb`) — cosmético,
irrelevante. Diagrama mono-autor → tampoco es colaboración.

## Causa raíz (probada por el stack)

El error que **rechaza `importXML`**:

```
[Flujo] importXml failed: Error: expected between [1, 2] circle -> line intersections
    at lJ → mP → EJ → n → Array.forEach → … → _i.updateWaypoints
    (dentro de le.importXML)
```

- `"expected between [1, 2] circle -> line intersections"` proviene de **bpmn-js
  core**: `node_modules/bpmn-js/lib/features/modeling/behavior/util/LineAttachmentUtil.js`.
  Esa util recoloca el **label** de una conexión cuando cambian sus waypoints:
  traza un círculo y busca 1-2 intersecciones con cada segmento. Recibe **0**
  porque los **waypoints son NaN/degenerados** → lanza.
- Los errores previos lo confirman: `<path> d: Expected number, "MNaNNaNL3084NaN…"`
  en `bpmn:Association` (una **anotación de texto**), `<rect> x/y/width/height:
  "NaN"`, y `TypeError: setTranslate … non-finite`. Hay **waypoints con NaN**
  (x real, y NaN) en al menos una conexión.

Cadena causal:
1. Durante el import, la **capa de routing custom** (`OrthogonalityBehavior` →
   `BizagiLayouter`/`BizagiDirectionalRouter`) recalcula waypoints. Sobre este
   diagrama produce **NaN/degenerados** en ≥1 conexión — sospechoso principal: las
   **Associations a anotaciones de texto** (el diagrama tiene 4+ notas: "La N.E.
   existe para incrementar volumen", "Activación de SKUs", "El ticket promedio",
   "El sistema sugiere…") y/o el docking sobre los **eventos circulares** (inicio
   verde / fin rojo).
2. `modeling.updateWaypoints` dispara el recálculo de attachment del label →
   `LineAttachmentUtil` recibe geometría NaN → **lanza** → la promesa de
   `importXML` **rechaza** → toast **"Error al cargar el diagrama"** (App.tsx:248).
3. El throw ocurre **a mitad de un comando dentro de `importXML`** → el
   commandStack del modeler queda en estado roto.
4. Al mover un shape: el comando `move` reentra en la misma ruta que lanza →
   **el shape no se confirma** (no se mueve), mientras el contorno de
   selección/resize se actualiza de forma optimista → **los puntos de resize sí se
   mueven pero el shape no** (Image 5), y el NaN se propaga al outline
   (`<rect> NaN`, `setTranslate non-finite`).

## Por qué contamina a los demás diagramas (PROBADO)

En **main hay UN solo canvas/modeler compartido** para todas las pestañas; cambiar
de diagrama = `importXML` sobre la MISMA instancia (App.tsx:665 monta un único
`<BpmnCanvas>`; App.tsx:239/276 reimportan; App.tsx:338 y canvasSession.ts lo
documentan). El modeler solo se destruye/recrea en el cleanup del `useEffect`
(useBpmnModeler.ts:247-254) → al **refrescar la página**.

→ Cuando el import roto deja el commandStack/estado de módulos sucio, ese estado
**sobrevive al `importXML`** del siguiente diagrama (misma instancia) → todo
buguea → único reset = refrescar. También aparece
`[collab] el canvas nunca confirmó el diagrama f78f191f… — colaboración
deshabilitada` porque `completeImport()` no corrió (el import rechazó antes).

## Por qué "no se arregla exportando/reimportando"

Dos posibilidades, a confirmar con el XML vivo:
- (A) **NaN persistido en el dato**: la creación/edición de hace 3 h con el build
  actual pudo autoguardar waypoints NaN. Reimportar preserva el NaN → mismo crash.
- (B) **NaN calculado en cada import**: el dato está "casi bien" pero la geometría
  hace que el router custom derive NaN determinísticamente en cada carga.
En ambos casos el reimport reproduce el fallo. Distinguirlos define el arreglo
(reparar dato vs solo código).

## Qué tiene de distinto este diagrama

Combina **anotaciones de texto + Associations** con **eventos circulares** y una
disposición que hace que el router custom genere geometría degenerada. La mayoría
de diagramas que abren bien no tienen esa combinación exacta o su geometría no
degenera.

---

## Cómo FORTALECER / cerrar (pinpoint exacto)

1. **Obtener el XML vivo** de `f78f191f-bb0a-4a1d-9b0a-ff5d39a0eb85` (exportar
   .bpmn desde otra sesión sana, o `scripts/diagram-backup.mjs`, o acceso
   Supabase). Buscar en él waypoints/bounds NaN y qué conexión (¿Association?)
   los tiene → resuelve A vs B.
2. **Reproducción headless** (scratchpad, sin tocar `src/`): Modeler real + stack
   custom, `importXML(xmlVivo)` en try/catch, e instrumentar
   `layouter.layoutConnection` para volcar la conexión cuyo resultado tiene algún
   `!Number.isFinite` → archivo + línea exactos del NaN.

## Direcciones de arreglo (a decidir, NO implementadas)

1. **Contención del blast-radius** (mata síntomas 4/5 para cualquier diagrama):
   - Envolver la re-ruta de import y los `postExecuted` custom de forma que un
     throw NO rechace todo el `importXML` ni deje el commandStack sucio; y/o
     recrear el modeler al cambiar de pestaña en vez de reimportar sobre la misma
     instancia.
2. **Causa puntual** (mata síntomas 1/2/3):
   - En `BizagiLayouter`/`OrthogonalityBehavior`: **nunca emitir waypoints no
     finitos** — validar `Number.isFinite` en cada punto producido y hacer
     fallback a la ruta previa/identidad si falla.
   - Excluir las **Associations** de la reparación ortogonal forzada (deben
     conservar su ruta nativa; forzarlas a ortogonal sobre una anotación es el
     sospechoso del NaN `d="MNaNNaN…"`).
   - Guarda de dock sobre **shapes circulares** (eventos) equivalente al fix de la
     util core.
3. **Reparar el dato** si es caso (A): sanear los waypoints NaN del XML almacenado.

## Archivos relevantes

- `node_modules/bpmn-js/.../util/LineAttachmentUtil.js` — origen del throw (core, no tocar).
- `src/bpmn/connections/OrthogonalityBehavior.ts` — repara/re-rutea en cada comando; incluye Associations en `collectConnections`.
- `src/bpmn/connections/BizagiLayouter.ts` — `layoutConnection`; manejo de Associations (l.379-384); posible origen del NaN.
- `src/bpmn/connections/orthogonal.ts` — geometría de docking (`slideDock`/`gatewayVertexDock`).
- `src/App.tsx` — canvas único (665), reimport por pestaña (239/276/338), toast de error (248).
- `src/hooks/useBpmnModeler.ts` — modeler único; destroy solo en unmount (247-254); import (258-288).
