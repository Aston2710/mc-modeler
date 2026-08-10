# [ABIERTO] Mover el pool a la derecha rerutea las flechas internas

**Estado:** 🔴 ABIERTO — sin corregir. **Causa raíz VERIFICADA 2026-08-09** (ver §Verificación).
**Fecha de reporte:** 2026-07-27
**Rama sugerida para el fix:** `fix/pool-move-right-reroute` (NO mezclar con UX/UI)
**No es regresión de UX:** el reporte apareció durante la rama `ux-ui-refactory`, pero
esa rama no toca `src/bpmn/` (diff = solo cromo: `Toolbar`, `MenuBar`, `TabsBar`,
`CanvasZoomControl`, `index.css`, i18n). El comportamiento ya existía en `main`.

---

## Síntoma

Al **mover un pool (Participant) hacia la derecha**, las flechas (sequence flows)
internas **se reruteanan** en vez de trasladarse rígidas con el contenedor.

- **Direccional:** solo ocurre al mover **a la derecha**. Mover el pool
  arriba, abajo o a la izquierda **no** dispara el reruteo (las flechas se
  trasladan bien).
- Comportamiento esperado: mover un contenedor debe **trasladar** las conexiones
  cuyos dos extremos están dentro (ambos endpoints se desplazan igual → los
  waypoints se corren igual), **sin recalcular** la ruta.

## Reproducción

1. Abrir un diagrama con un pool que contenga un flujo (p. ej. inicio → tareas →
   compuerta → fin, con carriles). Ej.: "PRUEBA CONDICION DE CARRERA".
2. Seleccionar el pool y arrastrarlo **a la derecha**.
3. Observar: las flechas cambian de trazado (reruteo), no solo se desplazan.
4. Repetir moviéndolo a la izquierda/arriba/abajo → NO se reruteanan (contraste).

## Capa responsable

Routing propio estilo Bizagi. Ver `fix_doc/routing-orthogonal-invariant-and-shape-invasion.md`.
Archivos candidatos:
- `src/bpmn/connections/BizagiLayouter.ts` — `layoutConnection`, rama auto + optimización §5b.
- `src/bpmn/connections/OrthogonalityBehavior.ts` — Capa 4 (re-ruteo de terceros al mover un shape).
- Interacción con `MoveShapeHandler.postExecute` de bpmn-js (pasa `connectionEnd = dockViejo + delta`).

## Hipótesis originales (2026-07-27) — resueltas por la verificación de abajo

1. ~~**§5b sensible al signo del delta (principal).**~~ **DESCARTADA.** §5b vive
   detrás de `hasMovedAnchor` (`BizagiLayouter.ts:616`), que exige
   `hints.connectionStart/End` como Point. Al mover un pool, TODAS las flechas
   internas son *enclosed* → diagram-js las pasa por `moveConnection` (traslación),
   nunca por `layoutConnection` con hints de movimiento. En la traza completa del
   gesto no aparece ni una sola llamada con `connectionStart/End`: solo
   `{source,target}` y `{source,target,forceReroute}`. §5b no se ejecuta.

2. **Capa 4 sobre las flechas hijas del pool.** **CONFIRMADA** — y es causa
   *primaria*, no secundaria (ver A abajo).

## ✅ Verificación empírica (2026-08-09)

Repro con bpmn-js real en jsdom (mismos shims que `routing.integration.test.ts`),
pool + start + task + gateway + 2 ramas + end, `modeling.moveElements([pool], delta)`
— el camino real del arrastre. Repros guardados fuera del repo (scratchpad de la
sesión: `repro-pool-move.test.ts`, `repro-pool-move-trace.test.ts`).

**Resultado medido:**

| escenario | DER +200 | IZQ −200 | ABA +200 | ARR −200 |
|---|---|---|---|---|
| rutas canónicas ("LIMPIO") | 0 deformadas | 0 | 0 | 0 |
| rutas auto con forma preservada ("PERTURBADO") | **3** (`F_AG`,`F_GC`,`F_CE`) | 2 | 2 | 2 |
| reparaciones de invariante disparadas | 18 | 18 | 18 | 18 |

Traducción: **un solo arrastre de pool re-rutea cada flecha interna 3 veces**
(6 flechas → 18 `[ortho] invariante violado, reparando`), en las 4 direcciones.
Solo se *ve* cuando la ruta guardada ≠ la canónica.

**Diferencia cualitativa derecha vs resto** (lo que el usuario percibe):
en izq/arriba/abajo el reruteo produce rutas canónicas limpias (3 puntos,
plausibles) → se lee como "se movió bien". A la derecha produce rutas
**retorcidas con geometría mezclada**:

```
F_AG  antes    [[370,180],[430,180]]                 (recta)
      esperado [[570,180],[630,180]]
      real     [[570,180],[616,180],[616,219],[655,219],[655,205]]   ← 5 pts, entra al gateway por ABAJO
F_GC  esperado [[680,180],[780,180],[780,370]]
      real     [[630,180],[616,180],[616,141],[780,141],[780,370]]   ← arranca fuera del dock
```

## Causa raíz (verificada)

**A. Capa 4 trata al pool como "shape plantado encima de flechas ajenas".**
`OrthogonalityBehavior.ts:233-256`: al procesar `shape.move`/`elements.move`,
`movedRects` incluye el **Participant**, y `routeInvades(conn.waypoints, pool)` es
TRUE para *toda* flecha interna — el bbox del pool las contiene por definición. El
guard `conn.source === s || conn.target === s` no las salva (su source es una tarea,
no el pool). → `rerouteClean(conn)` con `forceReroute: true` → el layouter descarta
la forma guardada y devuelve la canónica. Confirmado en traza: la **primera**
reescritura del gesto es `layoutConnection(F_GB) forceReroute=true`, con las
coordenadas aún viejas, convirtiendo `[[480,180],[540,180],[540,120],[600,120]]`
en `[[455,155],[455,120],[600,120]]`.

**B. El invariante (prioridad 500) repara a mitad de vuelo.**
`MoveHelper.moveClosure` mueve los shapes **uno por uno** (`moveShape(..., {recurse:false, layout:false})`)
y solo después las conexiones. Cada `shape.move` anidado dispara el hook 500, que
**ignora `hints.layout === false`** — la señal explícita de diagram-js de "no toques
las conexiones, yo las traslado luego". Con un extremo movido y el otro no, la
conexión viola el invariante (extremo desanclado o el shape invadiendo su propia
flecha) → `repair()` → `layoutConnection` con **geometría inconsistente**.

**C. Por qué solo a la derecha se deforma feo.**
El flujo BPMN va izquierda→derecha; las flechas salen por la cara derecha del source
y entran por la izquierda del target. Con delta **+x**, el shape ya movido queda
**a la derecha de / solapado con** la posición aún vieja del siguiente → la elección
de caras cambia (`gatewayFace`/`naturalFace`/`pickFacesMultiConn` caen en la rama
"source a la derecha del target" → sale/entra por top/bottom) → ruta en zigzag, que
después se traslada con el delta y se queda. Con delta **−x** o **±y** la relación
relativa src↔tgt no cambia de cuadrante → mismas caras → misma ruta → invisible.
Prueba: `F_AG` deformada entra al gateway por su vértice inferior (`655,205`),
exactamente lo que produce `gatewayFace` cuando el source está a su derecha.

## Dirección de arreglo (actualizada tras verificar)

diagram-js **ya hace lo correcto**: `MoveHelper.moveClosure` traslada las conexiones
encerradas con `moveConnection` (traslación pura) y solo layoutea las que cruzan la
frontera. El daño lo hacen nuestros dos interceptores. Dos fixes independientes,
ambos de pocas líneas:

1. **Capa 4: ignorar contenedores en `movedRects`.**
   `OrthogonalityBehavior.ts:239` — filtrar `bpmn:Participant` / `bpmn:Lane` /
   `bpmn:Group` (ya existe `isRoutingContainer` en `BizagiLayouter.ts:53`; extraerlo
   a un módulo común). Un pool nunca "se planta encima" de una flecha: la contiene.
   Además ahorra un `routeInvades` × N conexiones por cada move de pool.

2. **Invariante 500: respetar `hints.layout === false`.**
   `OrthogonalityBehavior.ts:261` — si `event.context.hints?.layout === false`, el
   comando declara explícitamente que las conexiones las gestiona el llamador
   (`moveClosure`); saltar la comprobación evita reparar estado transitorio. El
   invariante se sigue verificando al final, en el `elements.move`/`connection.move`
   que cierra el gesto. Elimina 18 reruteos por arrastre de pool en el diagrama de
   prueba (ganancia de rendimiento directa, además del bug).

Riesgo a vigilar: (2) también afecta a `moveShape` interno con `layout:false` en
otros flujos (drop de subproceso, colapso de lane) — cubrir con test.

## Verificación esperada del fix

- Mover el pool en las 4 direcciones → las flechas internas se trasladan idénticas,
  0 reruteo.
- No romper: re-ruteo legítimo al mover un shape **individual** (no contenedor) o al
  plantar un shape encima de una flecha ajena (Capa 4 sigue).
- Añadir caso a `routing.integration.test.ts`: mover Participant con hijos → waypoints
  = originales + delta (traslación pura).

## Notas

- Consultar SIEMPRE `fix_doc/routing-orthogonal-invariant-and-shape-invasion.md`
  (§3-A causa raíz de caras por hint, §5b optimización de cara, §4 Capa 4) antes de
  tocar la capa.
- Referencia de ingeniería inversa: `.syntesis/Router/findings.md`.
