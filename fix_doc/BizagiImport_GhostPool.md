# Fix: Pool fantasma y artefactos en proceso equivocado — Importación Bizagi

**Archivo afectado:** `src/utils/bpmImport.ts`  
**Fecha:** 2026-06-28  
**Síntomas:** Pool invisible arrastrable, comentarios/grupos ocultos bajo el pool real, desfase de shapes al expandir el pool fantasma.

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

Todo proyecto de Bizagi exporta **obligatoriamente** un pool contenedor llamado "Proceso principal". Este pool es invisible en la UI de Bizagi —el usuario nunca lo ve— pero está presente en el XPDL con estas características:

```xml
<Pool Id="cfd50d1f-60b6-4782-a2b3-6601d13b89f1"
      Name="Proceso principal"
      Process="f2bfdb37-7ff6-4ca0-87ea-f65dd50deef2"
      BoundaryVisible="false">
  <Lanes />
  <NodeGraphicsInfos>
    <NodeGraphicsInfo Height="0" Width="0">
      <Coordinates XCoordinate="30" YCoordinate="30" />
    </NodeGraphicsInfo>
  </NodeGraphicsInfos>
</Pool>
```

Flags clave:
- `BoundaryVisible="false"` — Bizagi no lo dibuja.
- `Height=0, Width=0` — dimensiones explícitamente nulas.
- Posición `(30, 30)` — idéntica a la del pool real del usuario.
- `<Lanes />` vacío y `WorkflowProcess` asociado también vacío (sin actividades).

El pool real del usuario (ej. "cualquiera") aparece **a continuación** en el XPDL:

```xml
<Pool Id="3535cab7-19c9-423f-9e5c-1ce9ffc9dea8"
      Name="cualquiera"
      Process="8068af47-4861-4469-8f60-da72a7ba086c"
      BoundaryVisible="true">
  <NodeGraphicsInfos>
    <NodeGraphicsInfo Height="240" Width="700">
      <Coordinates XCoordinate="30" YCoordinate="30" />
```

Ambos pools comparten la misma posición `(30, 30)`.

### 2.2 Lo que el importador hacía

El loop original en `xpdlToBpmn()` iteraba **todos** los pools sin distinción:

```typescript
// ANTES — sin filtro
if (pools.length > 0) {
  pools.forEach((pool) => {
    const poolId = id(pool.getAttribute('Id'))
    // ... generaba participant + process para TODOS los pools
    participantsXml.push(`<bpmn:participant id="${poolId}" name="${esc(poolName)}" .../>`)
    shapesXml.push(`<dc:Bounds x="30" y="30" width="0" height="0" />`)
    emitProcess(procId, lanes, nodes, edges)
  })
}
```

Para "Proceso principal" esto generaba BPMN completamente válido:

```xml
<bpmn:participant id="n_cfd50d1f60b64782a2b36601d13b89f1"
                  name="Proceso principal"
                  processRef="n_f2bfdb377ff64ca087eaf65dd50deef2" />
<bpmndi:BPMNShape ...>
  <dc:Bounds x="30" y="30" width="0" height="0" />  <!-- 0×0 -->
</bpmndi:BPMNShape>
<bpmn:process id="n_f2bfdb377ff64ca087eaf65dd50deef2" isExecutable="false"/>
```

bpmn-js recibía una colaboración con **dos participantes**: uno 0×0 (fantasma) y uno 700×240 (real), ambos en `(30, 30)`.

---

## 3. Consecuencias en bpmn-js

### 3.1 Por qué el pool 0×0 es invisible pero interactuable

Un `<rect width="0" height="0">` en SVG no tiene área visual → invisible. Sin embargo, bpmn-js crea el elemento en su `elementRegistry` como un participante legítimo. Existen:
- Su shape en el registry.
- Su label ("Proceso principal") como elemento separado, posicionado en `(30, 30)` con altura degenerada → texto disperso visible en el canvas a escala.
- Sus handles de selección/resize una vez seleccionado.

El usuario podía llegar a seleccionarlo accidentalmente (por Ctrl+A o clic en `(30, 30)` donde ambos pools se superponen) y arrastrarlo.

### 3.2 Por qué expandirlo rompía el diagrama

bpmn-js implementa **reparenting automático**: al hacer resize de un participante, cualquier elemento cuyos bounds caigan dentro del nuevo tamaño del participante pasa a ser hijo de ese participante (`shape.parent` cambia). 

Cuando el usuario expandía "Proceso principal" hasta cubrir el área de "cualquiera":
1. Las tareas, eventos y lanes de "cualquiera" quedaban geométricamente dentro de "Proceso principal".
2. bpmn-js los reparentaba a "Proceso principal".
3. "cualquiera" perdía sus hijos → su laneSet y procesos internos quedaban inconsistentes.
4. Mover cualquier elemento causaba desfases porque las relaciones padre-hijo estaban rotas.

---

## 4. Bug secundario: artefactos en el proceso equivocado

### 4.1 El mecanismo de inyección original

Los artefactos XPDL (textAnnotation, Group, DataObject) viven a nivel de `<Package>`, no dentro de un `<WorkflowProcess>`. BPMN 2.0 requiere que estén dentro de un `<bpmn:process>`. El importador los colectaba y los inyectaba así:

```typescript
// ANTES — siempre processesXml[0]
const artifactEls: string[] = []
// ... llenaba artifactEls ...
if (artifactEls.length > 0) {
  processesXml[0] = processesXml[0].replace(
    '</bpmn:process>',
    `${artifactEls.join('')}</bpmn:process>`
  )
}
```

### 4.2 Por qué `processesXml[0]` era el proceso equivocado

El array `processesXml` se llenaba en el orden de aparición de los pools en el XPDL. En todo archivo Bizagi:

```
XPDL order:
  Pool 1: "Proceso principal"  →  processesXml[0] = proceso VACÍO
  Pool 2: "cualquiera"         →  processesXml[1] = proceso REAL
```

Los artefactos (ej. "comentario 1", coordenadas `x=436, y=171` — dentro de "cualquiera") se inyectaban en `processesXml[0]` = el proceso del fantasma, no en el proceso de "cualquiera".

### 4.3 Consecuencia visual

En bpmn-js, un elemento pertenece al participante de su proceso. El comentario estaba en el proceso de "Proceso principal" pero visualmente en `(436, 171)`, dentro de los bounds de "cualquiera" `(30–730 × 30–270)`.

- bpmn-js lo renderizaba en `(436, 171)` correctamente.
- Pero su **z-order** y **ownership** correspondían al participante fantasma.
- El pool "cualquiera" (renderizado encima) lo cubría visualmente.
- Al mover "cualquiera", el comentario no se movía (no era su hijo) → quedaba visible, desplazado de su posición original relativa.

Lo mismo para grupos Bizagi y data objects.

---

## 5. La solución

### 5.1 Fix 1 — Filtrar el pool contenedor (Bug principal)

En el loop de pools, antes de procesar cualquier pool, se evalúan sus atributos de visibilidad y sus dimensiones. Si un pool tiene `BoundaryVisible="false"` **y** sus dimensiones son 0×0, se omite completamente:

```typescript
pools.forEach((pool) => {
  // Skip Bizagi's invisible outer container pool (BoundaryVisible=false + 0×0 dims)
  if (pool.getAttribute('BoundaryVisible') === 'false') {
    const { bounds: pb0 } = readGraphics(pool)
    if (!pb0 || (pb0.width === 0 && pb0.height === 0)) return
  }
  // ... resto del procesamiento
})
```

**Por qué la condición doble (`BoundaryVisible` + dimensiones 0×0):**
- `BoundaryVisible="false"` solo podría ser una convención interna de Bizagi para marcar el contenedor. La combinación con `0×0` garantiza que no se salten pools que el usuario haya marcado como no-visible pero con dimensiones reales (caso hipotético pero posible en XPDL de terceros).
- Es la condición más específica y segura posible.

**Resultado:** El BPMN generado contiene solo los pools reales del usuario. `processesXml[0]` pasa a ser el primer proceso con contenido real.

### 5.2 Fix 2 — Inyección de artefactos por contención geométrica (Bug secundario)

Se introduce un mapa `poolBoundsMap` que registra los bounds de cada pool aceptado y el índice de su proceso en `processesXml`:

```typescript
const poolBoundsMap: Array<{ bounds: Bounds; procIdx: number }> = []

// En el loop de pools, justo antes/después de emitProcess():
const procIdx = processesXml.length   // índice que tomará el proceso nuevo
emitProcess(procId, lanes, nodes, edges)
if (poolBounds) poolBoundsMap.push({ bounds: poolBounds, procIdx })
```

Se añade `findProcIdx()` que dado los bounds de un artefacto busca qué pool lo contiene geométricamente (punto central del artefacto dentro del rectángulo del pool). Fallback a índice 0 si no hay coincidencia:

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

`artifactEls: string[]` se reemplaza por `artifactsByProc: Map<number, string[]>` y `addArtifact(procIdx, el, id?)`:

```typescript
const artifactsByProc = new Map<number, string[]>()
const artifactProcMap = new Map<string, number>() // artifact bpmn-id → process index

const addArtifact = (procIdx: number, el: string, artifactId?: string) => {
  if (!artifactsByProc.has(procIdx)) artifactsByProc.set(procIdx, [])
  artifactsByProc.get(procIdx)!.push(el)
  if (artifactId) artifactProcMap.set(artifactId, procIdx)
}
```

La inyección final itera el mapa en lugar de siempre usar índice 0:

```typescript
artifactsByProc.forEach((els, pi) => {
  const idx = Math.min(pi, processesXml.length - 1)
  processesXml[idx] = processesXml[idx].replace('</bpmn:process>', `${els.join('')}</bpmn:process>`)
})
```

### 5.3 Fix bonus — Asociaciones enrutadas correctamente

Las `<bpmn:association>` (línea que conecta anotación ↔ tarea) también deben estar dentro del proceso correcto. `artifactProcMap` registra a qué proceso fue cada artefacto. Las asociaciones consultan el mapa con sus endpoints:

```typescript
const assocProcIdx = artifactProcMap.get(src) ?? artifactProcMap.get(tgt) ?? 0
addArtifact(assocProcIdx, `<bpmn:association id="${aid}" sourceRef="${src}" targetRef="${tgt}" />`)
```

Esto garantiza que la asociación entre "comentario 1" y "Tarea 3" quede en el mismo proceso que la anotación.

---

## 6. Por qué no bastaba con Fix 1 solo (en general)

En el caso de Prueba.bpm, Fix 1 era suficiente para arreglar Fix 2 también: al eliminar "Proceso principal", `processesXml[0]` pasa a ser "cualquiera" y los artefactos van al proceso correcto.

Sin embargo, para diagramas con **múltiples pools reales** (Pool A + Pool B + artefactos en Pool B), el `processesXml[0]` sería el proceso de Pool A, no el de Pool B. Fix 2 resuelve este caso correctamente con la contención geométrica.

---

## 7. Cobertura de casos restantes

| Caso | Comportamiento |
|------|---------------|
| `.bpm` con un solo pool | Fix 1 elimina el fantasma; Fix 2 enruta artefactos al único pool real. |
| `.bpm` con múltiples pools reales | Fix 2 usa contención geométrica para cada artefacto. |
| Artefacto fuera de todos los pools | Fallback a `procIdx=0` (primer pool real). |
| `.bpm` sin pools (proceso suelto) | `poolBoundsMap` queda vacío; fallback a 0 = único proceso. Comportamiento sin cambio. |
| Pool con `BoundaryVisible="false"` y dimensiones > 0 | NO se salta — solo se salta la combinación invisible + 0×0. |
| Asociación con source en un pool y target en otro | Va al proceso del endpoint que sea artefacto; si ninguno es artefacto (caso inválido en BPMN), va a índice 0. |

---

## 8. Archivo verificado

`src/utils/bpmImport.ts` pasa `tsc --noEmit` sin errores tras los cambios. No quedan referencias a `artifactEls`.
