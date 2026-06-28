# Fix: Pool fantasma y artefactos en proceso equivocado — Importación/Exportación Bizagi

**Archivos afectados:** `src/utils/bpmImport.ts`, `src/utils/bpmExport.ts`  
**Fecha:** 2026-06-28  
**Síntomas:** Pool invisible arrastrable, comentarios/grupos ocultos bajo el pool real, desfase de shapes al expandir el pool fantasma. En diagramas complejos (ej. "Trazabilidad de pedidos"), el ghost pool aparecía **visiblemente** en mc-modeler y algunos comentarios quedaban atrapados dentro de él.

---

## 1. Contexto: qué hace el importador

`importBpm()` lee un archivo `.bpm` de Bizagi (ZIP exterior → ZIP interior `.diag` → `Diagram.xml` en XPDL 2.2) y lo convierte a BPMN 2.0 para que bpmn-js lo cargue.

La función central es `xpdlToBpmn()`. Su flujo:

1. Parsea el XPDL con `DOMParser`.
2. Itera cada `<Pool>` y genera un `<bpmn:participant>` + `<bpmn:process>` con sus actividades y lanes.
3. Recoge los `<Artifact>` del paquete (anotaciones, grupos, data objects).
4. Inyecta esos artefactos **dentro** de un `<bpmn:process>` (bpmn-js los requiere dentro de un proceso, no sueltos en la definición).
5. Ensambla el XML BPMN final con el `<bpmndi:BPMNDiagram>`.

---

## 2. El problema raíz: "Proceso principal" de Bizagi

### 2.1 Qué genera Bizagi en el XPDL

Todo proyecto de Bizagi exporta **obligatoriamente** un pool contenedor llamado "Proceso principal". Este pool es invisible en la UI de Bizagi —el usuario nunca lo ve— pero está presente en el XPDL con `BoundaryVisible="false"`.

**Forma mínima** (diagramas simples, ej. Prueba.bpm):
```xml
<Pool Id="cfd50d1f-..." Name="Proceso principal" Process="f2bfdb37-..." BoundaryVisible="false">
  <Lanes />
  <NodeGraphicsInfos>
    <NodeGraphicsInfo Height="0" Width="0">
      <Coordinates XCoordinate="30" YCoordinate="30" />
    </NodeGraphicsInfo>
  </NodeGraphicsInfos>
</Pool>
```

**Forma con dimensiones reales** (diagramas editados/complejos, ej. Trazabilidad de pedidos.bpm):
```xml
<Pool Id="f8c2999b-..." Name="Proceso principal" Process="aa686297-..." BoundaryVisible="false">
  <Lanes />
  <NodeGraphicsInfos>
    <NodeGraphicsInfo Height="350" Width="700">
      <Coordinates XCoordinate="30" YCoordinate="30" />
    </NodeGraphicsInfo>
  </NodeGraphicsInfos>
</Pool>
```

**Invariantes del ghost pool en TODOS los archivos Bizagi:**
- `BoundaryVisible="false"` — siempre.
- `<Lanes />` vacío — nunca tiene Lane children.
- `WorkflowProcess` asociado vacío — sin `<Activities>`, sin `<Transitions>`.
- Aparece **primero** en el listado de `<Pools>`.

Las dimensiones varían: Bizagi las actualiza cuando el usuario interactúa con el diagrama raíz antes de exportar. Por eso no son un identificador confiable.

### 2.2 Lo que el importador hacía (primer fix — condición insuficiente)

La primera versión del fix filtraba con condición doble: `BoundaryVisible=false` **y** `Width=0 && Height=0`:

```typescript
if (pool.getAttribute('BoundaryVisible') === 'false') {
  const { bounds: pb0 } = readGraphics(pool)
  if (!pb0 || (pb0.width === 0 && pb0.height === 0)) return  // ← solo filtraba 0×0
}
```

**Falla:** "Trazabilidad de pedidos" tiene ghost pool con `Height=350, Width=700` → pasa el check → se renderiza como pool real visible en mc-modeler.

---

## 3. Consecuencias en bpmn-js

### 3.1 Ghost pool 0×0 — invisible pero interactuable

Un `<rect width="0" height="0">` en SVG no tiene área visual → invisible. Sin embargo, bpmn-js lo registra en su `elementRegistry` como participante legítimo:
- Su label ("Proceso principal") aparece como texto flotante en `(30, 30)`.
- Seleccionable por Ctrl+A o clic en la posición `(30, 30)` (superpuesto al pool real).
- Arrastrable una vez seleccionado.

### 3.2 Ghost pool con dimensiones reales — visible directamente

Cuando el ghost tiene dimensiones > 0 (ej. 700×350), bpmn-js lo renderiza como un participant real con borde y etiqueta "Proceso principal" visible en el canvas. El usuario ve dos pools superpuestos: el real y el fantasma.

### 3.3 Expandir el ghost rompía el diagrama (ambos casos)

bpmn-js implementa **reparenting automático**: al hacer resize de un participante, cualquier elemento dentro de sus nuevos bounds pasa a ser hijo de ese participante (`shape.parent` cambia).

Cuando el usuario expandía "Proceso principal" hasta cubrir "cualquiera":
1. Tareas, eventos y lanes de "cualquiera" se reparentaban a "Proceso principal".
2. "cualquiera" perdía sus hijos → laneSet y procesos internos inconsistentes.
3. Mover cualquier elemento causaba desfases por relaciones padre-hijo rotas.

---

## 4. Bug secundario: artefactos en el proceso equivocado

### 4.1 El mecanismo de inyección original

Los artefactos XPDL (textAnnotation, Group, DataObject) viven a nivel de `<Package>`. BPMN 2.0 requiere que estén dentro de un `<bpmn:process>`. El importador original los inyectaba siempre en `processesXml[0]`:

```typescript
// ANTES
const artifactEls: string[] = []
if (artifactEls.length > 0) {
  processesXml[0] = processesXml[0].replace('</bpmn:process>', `${artifactEls.join('')}</bpmn:process>`)
}
```

### 4.2 Por qué era el proceso equivocado

`processesXml` se llenaba en orden de aparición de pools. Bizagi siempre pone "Proceso principal" primero:

```
XPDL order:
  Pool 1: "Proceso principal"  →  processesXml[0] = proceso VACÍO
  Pool 2: pool real del usuario →  processesXml[1] = proceso REAL
```

Los artefactos se inyectaban en el proceso vacío del fantasma, no en el proceso real.

### 4.3 Caso agravado con ghost pool visible (Trazabilidad)

Ghost pool bounds: `x=30, y=30, w=700, h=350` → cubre `(30–730, 30–380)`.

Artefacto "El ERP retiene el pedido..." en `(521, 130)`, centro en `(607, 160)` — geometricamente dentro del ghost pool. Con el ghost pool sin filtrar y en `poolBoundsMap`, la contención geométrica lo asignaba **correctamente al proceso del ghost**, que era el proceso incorrecto. El artefacto aparecía atrapado dentro del ghost pool visible.

### 4.4 Consecuencia visual (caso 0×0)

El comentario estaba en el proceso de "Proceso principal" pero visualmente en `(436, 171)`, dentro de los bounds de "cualquiera":
- bpmn-js lo renderizaba correctamente en `(436, 171)`.
- Su z-order y ownership correspondían al participante fantasma.
- El pool "cualquiera" (encima) lo cubría visualmente.
- Al mover "cualquiera", el comentario no se movía → quedaba desplazado.

---

## 5. La solución — importación

### 5.1 Fix definitivo — filtro robusto

La condición correcta usa `BoundaryVisible="false"` como señal primaria y ausencia de `<Lane>` children como guarda secundaria para compatibilidad con XPDL de terceros:

```typescript
pools.forEach((pool) => {
  // BoundaryVisible=false es siempre el pool contenedor oculto de Bizagi.
  // Guarda secundaria (sin Lane children): protege contra herramientas XPDL que
  // usen BoundaryVisible=false para pools sin borde pero con contenido real.
  if (pool.getAttribute('BoundaryVisible') === 'false' &&
      pool.querySelectorAll('Lane').length === 0) return

  // ... resto del procesamiento
})
```

**Por qué esta combinación es segura:**
- `BoundaryVisible=false` + sin lanes → SIEMPRE el ghost de Bizagi (confirmado en todos los archivos analizados).
- Un pool real nunca tiene ambos a la vez: si tiene contenido, tiene lanes; si tiene `BoundaryVisible=false` sin lanes, es el contenedor oculto.
- Dimensiones 0×0 o 700×350 o cualquier otra: ambas quedan filtradas.

### 5.2 Fix 2 — Inyección de artefactos por contención geométrica

Se introduce `poolBoundsMap` que registra bounds de cada pool aceptado y el índice de su proceso en `processesXml`:

```typescript
const poolBoundsMap: Array<{ bounds: Bounds; procIdx: number }> = []

// En el loop de pools, después de emitProcess():
const procIdx = processesXml.length
emitProcess(procId, lanes, nodes, edges)
if (poolBounds) poolBoundsMap.push({ bounds: poolBounds, procIdx })
```

`findProcIdx()` asigna cada artefacto al proceso del pool que lo contiene geométricamente:

```typescript
const findProcIdx = (b: Bounds | null): number => {
  if (b && poolBoundsMap.length > 0) {
    const cx = b.x + b.width / 2
    const cy = b.y + b.height / 2
    for (const entry of poolBoundsMap) {
      if (cx >= entry.bounds.x && cx <= entry.bounds.x + entry.bounds.width &&
          cy >= entry.bounds.y && cy <= entry.bounds.y + entry.bounds.height) {
        return entry.procIdx
      }
    }
  }
  return 0
}
```

`artifactEls: string[]` → reemplazado por `artifactsByProc: Map<number, string[]>` + `artifactProcMap: Map<string, number>`:

```typescript
const artifactsByProc = new Map<number, string[]>()
const artifactProcMap = new Map<string, number>()

const addArtifact = (procIdx: number, el: string, artifactId?: string) => {
  if (!artifactsByProc.has(procIdx)) artifactsByProc.set(procIdx, [])
  artifactsByProc.get(procIdx)!.push(el)
  if (artifactId) artifactProcMap.set(artifactId, procIdx)
}
```

Inyección final por proceso correcto:
```typescript
artifactsByProc.forEach((els, pi) => {
  const idx = Math.min(pi, processesXml.length - 1)
  processesXml[idx] = processesXml[idx].replace('</bpmn:process>', `${els.join('')}</bpmn:process>`)
})
```

### 5.3 Asociaciones enrutadas correctamente

```typescript
const assocProcIdx = artifactProcMap.get(src) ?? artifactProcMap.get(tgt) ?? 0
addArtifact(assocProcIdx, `<bpmn:association id="${aid}" sourceRef="${src}" targetRef="${tgt}" />`)
```

---

## 6. La solución — exportación

### 6.1 Problema: mc-modeler no generaba el ghost pool

Los `.bpm` exportados por mc-modeler no incluían el pool "Proceso principal". Al reimportar en Bizagi:
- Visualmente correcto (Bizagi mostraba los pools reales).
- Bizagi reconstruía "Proceso principal" internamente al guardar.
- Para diagramas con BPSim, variables de proceso o atributos del proceso raíz: posible pérdida de datos durante el ciclo de importación.

### 6.2 Fix — `buildGhostPoolXml()` en bpmExport.ts

Nueva función que genera el pool fantasma y su WorkflowProcess vacío:

```typescript
function buildGhostPoolXml(now: string): { pool: string; wf: string } {
  const ghostPoolId = crypto.randomUUID()
  const ghostProcId = crypto.randomUUID()
  const rtProps = buildRuntimeProperties('Proceso principal', now)
  const pool = `<Pool Id="${ghostPoolId}" Name="Proceso principal" Process="${ghostProcId}" BoundaryVisible="false">
      <Lanes />
      <NodeGraphicsInfos>
        <NodeGraphicsInfo ToolId="BizAgi_Process_Modeler" Height="0" Width="0" ...>
          <Coordinates XCoordinate="30" YCoordinate="30" />
          ...
        </NodeGraphicsInfo>
      </NodeGraphicsInfos>
    </Pool>`
  const wf = `<WorkflowProcess Id="${ghostProcId}" Name="Proceso principal">
    <ProcessHeader><Created>${now}</Created><Description /></ProcessHeader>
    <RedefinableHeader><Author /><Version /><Countrykey>CO</Countrykey></RedefinableHeader>
    <ActivitySets />
    <DataInputOutputs />
    <ExtendedAttributes>
      <ExtendedAttribute Name="RuntimeProperties" Value="${rtProps}" />
    </ExtendedAttributes>
  </WorkflowProcess>`
  return { pool, wf }
}
```

En `buildDiagramXml`, se prepend antes de todos los pools reales:

```typescript
const poolParts: string[] = []
const wfParts:   string[] = []

// Ghost pool primero — Bizagi siempre lo espera como primer elemento
const { pool: ghostPool, wf: ghostWf } = buildGhostPoolXml(now)
poolParts.push(ghostPool)
wfParts.push(ghostWf)

// ... pools reales del diagrama
```

**Resultado del round-trip:** Bizagi recibe "Proceso principal" exactamente donde lo espera → no necesita reconstruirlo → comportamiento idéntico al de un archivo nativo Bizagi.

---

## 7. Por qué el Fix 1 original era insuficiente (y el nuevo es robusto)

| Versión | Condición | Prueba.bpm (0×0) | Trazabilidad (700×350) |
|---|---|---|---|
| Fix original | `BoundaryVisible=false` + `Width=0 && Height=0` | ✓ filtrado | ✗ no filtrado → visible |
| Fix definitivo | `BoundaryVisible=false` + `querySelectorAll('Lane').length === 0` | ✓ filtrado | ✓ filtrado |

Las dimensiones del ghost pool varían entre archivos Bizagi. `BoundaryVisible` y ausencia de lanes son los únicos invariantes confiables.

---

## 8. Cobertura de casos

| Caso | Comportamiento |
|------|---------------|
| `.bpm` ghost pool 0×0 | Filtrado en import. ✓ |
| `.bpm` ghost pool con dimensiones reales | Filtrado en import. ✓ |
| `.bpm` con un solo pool real | Fix 1 elimina ghost; Fix 2 enruta artefactos al único pool real. ✓ |
| `.bpm` con múltiples pools reales | Fix 2 usa contención geométrica para asignar artefactos al pool correcto. ✓ |
| Artefacto fuera de todos los pools | Fallback a `procIdx=0` (primer pool real). ✓ |
| `.bpm` sin pools (proceso suelto) | `poolBoundsMap` vacío; fallback a 0. ✓ |
| Pool `BoundaryVisible=false` con lanes (XPDL terceros) | NO se filtra — guarda secundaria protege pools reales sin borde. ✓ |
| Export mc-modeler → Bizagi | Ghost pool emitido → round-trip limpio sin reconstrucción Bizagi. ✓ |

---

## 9. Archivos verificados

`src/utils/bpmImport.ts` y `src/utils/bpmExport.ts` pasan `tsc --noEmit` sin errores tras todos los cambios.
