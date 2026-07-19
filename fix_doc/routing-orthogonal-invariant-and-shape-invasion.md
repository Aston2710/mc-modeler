# Capa de routing: invariante ortogonal, semántica Bizagi y no-invasión de shapes

**Rama:** `routers-links-and-more`
**Fecha:** 2026-07-15
**Archivos núcleo:** `src/bpmn/connections/{orthogonal.ts, BizagiLayouter.ts, BizagiDirectionalRouter.ts, BizagiConnectionDocking.ts, BizagiSegmentHandles.ts, OrthogonalityBehavior.ts, ManualRouteBehavior.ts, ConnectionContextPadModule.ts, manualRoute.ts, groupDocking.ts}`
**Tests:** `orthogonal.test.ts` (unit), `routing.integration.test.ts` (bpmn-js real en jsdom)
**Referencia de ingeniería inversa Bizagi:** `.syntesis/Router/findings.md`

---

## 1. Contexto — qué es la capa de routing

El modelador usa **bpmn-js v18** (motor diagram-js). El enrutamiento de flechas (sequence flows, message flows, associations) está reescrito como una capa propia estilo **Bizagi Modeler**, reemplazando servicios nativos de diagram-js por su nombre de inyección de dependencias:

| Servicio nativo | Reemplazo | Rol |
|---|---|---|
| `layouter` | `BizagiLayouter` | Calcula waypoints de cada conexión |
| `connectionDocking` | `BizagiConnectionDocking` | Recorta extremos al borde real del shape (incl. rombo de gateway) |
| `bendpoints` | `BizagiSegmentHandles` | Interacción de arrastre de segmentos/extremos |

Más behaviors a nivel de commandStack:
- `OrthogonalityBehavior` — invariante de calidad (ver §4).
- `ManualRouteBehavior` — ciclo de vida del flag `flujo:manualRoute`.

El router geométrico (`BizagiDirectionalRouter`) es una traducción fiel del `DirectionalRouter`/`BaseRouter` de Bizagi (decompilado con ilspycmd): `buildInitialSolution` (L/Z/U según direcciones) → `verifySolutionPoints` (esquiva shapes en vértices) → `verifySolutionLines` (desvíos alrededor de shapes atravesados) → `refineSolution`/`refinePoints`. Padding 13px.

### Conceptos clave

- **Cardinales vs dock deslizante:** los extremos se anclan en el centro de cada cara (cardinal) para autos, o deslizándose a lo largo del borde (`slideDock`, estilo Ports de Bizagi con `Percent`, findings §15) para grupos y drag manual. Gateways: vértice del rombo con histéresis.
- **Ruta manual (`flujo:manualRoute`):** cuando el usuario arrastra una flecha, se marca manual y persiste en el XML. El layouter la trata distinto (ver §3).
- **Invariante de ortogonalidad:** ninguna conexión puede quedar con segmentos diagonales ni extremos desanclados. Se garantiza a nivel de comando, no como parche reactivo.

---

## 2. Semántica Bizagi "repair-or-reroute" (§14 de findings)

Del decompilado (`DirectionalRouter.CalculateRoute`): al recalcular una conexión con waypoints existentes, Bizagi **repara** los extremos preservando la forma del usuario, y **conserva** la ruta reparada **solo si** sigue siendo válida (ortogonal, extremos en los shapes) **y no tiene más puntos que la ruta fresca óptima**. Si no, re-rutea completo en silencio. Ese criterio de simplicidad es el "auto-sanado sin botón fix" de Bizagi.

Implementado en `BizagiLayouter.layoutConnection`, rama `manualRoute`: se calcula `repaired` (reparación en cadena con `repairChainFromStart/End`) y `fresh` (router limpio); se devuelve `repaired` solo si es válida y `repaired.length <= fresh.length`; si no, gana `fresh` y se limpia el flag manual vía `hints.orthoAutoRerouted` (canal del comando; nunca se muta la conexión para no dejar markers huérfanos en llamadas fuera de comando).

---

## 3. El bug reportado — la flecha queda DENTRO del shape

### Síntoma
Al mover un shape (p. ej. una tarea conectada a un gateway hasta quedar debajo de él), la flecha entra en el shape, hace la esquina **dentro** del bbox y remata apuntando al interior. Se puede arreglar a mano, pero vuelve a pasar: nada lo considera un estado erróneo, así que nada lo auto-sana.

### Causa raíz — dos partes

**(A) La cara de entrada se elige con historia, no con geometría.**
Cuando bpmn-js mueve un shape, `MoveShapeHandler.postExecute` pasa al layouter `connectionEnd = dock anterior + delta` (un `Point`). Eso activa `hasMovedAnchor` en `BizagiLayouter`, y la cara del target se elige con `nearestFace(tgt, hint)` — **la cara más cercana al dock viejo trasladado**, no a la posición actual.

Ejemplo del screenshot: la tarea estaba a la derecha del gateway (entrada por la **izquierda**). Se mueve hasta quedar **debajo**. El hint sigue siendo el punto más cercano a la cara izquierda → el layouter mantiene la entrada por la izquierda aunque ahora lo correcto es entrar por arriba. Con salida `bottom` (gateway) + entrada `left`, `buildInitialSolution` genera **una esquina en `(x_gateway, y_dock_izquierdo)`**, que cae dentro del bbox de la tarea.

**(B) "Entra y muere dentro" era un punto ciego de TODAS las validaciones.**
Cada capa buscaba únicamente "el segmento atraviesa el shape de lado a lado" (traversal completo), y ninguna detectaba "el segmento entra y termina en una esquina interior":

| Defensa | Por qué no lo atrapaba |
|---|---|
| `verifySolutionPoints` (router) | Deflexión best-effort: si el desvío cae en zona de padding, hace `continue` y deja la esquina dentro |
| `verifySolutionLines` (router) | Solo detecta traversal completo (entra Y sale). El segmento que muere dentro no sale → invisible |
| `isSolutionValid` (router) | Solo corre en la rama de reparación; la solución fresca se devolvía sin validación final |
| Check `valid` de rutas manuales | Usaba `routeTraversesObstacle` (traversal completo) y excluía src/tgt |
| `OrthogonalityBehavior` | Solo verificaba ortogonalidad + que los extremos tocaran el bbox. Una ruta ortogonal con esquina interior pasaba limpio |

No había red final: `LayoutConnectionHandler` asigna la salida del layouter tal cual.

**Bizagi no sufre esto** porque `createDirectionalPoints()` recalcula caras desde la geometría **actual** en cada `Route()` (findings §13-14).

---

## 4. La solución — no-invasión como invariante verificable (4 capas)

Principio: convertir "ninguna ruta invade un shape" en un **invariante verificable y auto-sanado**, igual que ya se hizo con la ortogonalidad — no en otra corrección best-effort.

### Capa 1 — primitivas puras (`orthogonal.ts`)
El predicado que faltaba, unit-testable, sin dependencias de bpmn-js:
- `pointInRectInterior(rect, p)` — punto en el interior estricto (no en el borde).
- `segmentClipsRect(p1, p2, rect)` — un segmento ortogonal solapa el **interior** del rect por **solape de intervalos**, no por cruce de extremos → detecta traversal completo **y** "entra y muere dentro". Un segmento que corre por el borde o por fuera no dispara (interior estricto), así que el dock legítimo sobre la arista no da falso positivo.
- `routeInvades(wps, rect)` — algún waypoint en el interior o algún segmento que clipea. Uniforme para src, tgt y obstáculos.

### Capa 2 — validación final + fallback de caras (`BizagiLayouter`)
Tras calcular la ruta (`fresh`), `ensureClean()` verifica que sea limpia: ortogonal y sin invadir src, tgt ni obstáculos. Si invade:
1. Recalcula las caras **geométricas** desde la posición actual (`naturalFace`/`gatewayExitFace`, ignorando el hint viejo) — **esto mata la causa raíz (A)**.
2. Si aún invade, búsqueda acotada sobre los 16 pares de caras; devuelve el primero limpio.
3. Si ninguno limpio (degenerado), devuelve el primario + `console.warn('[ortho] …')` en dev.

El check `valid` de la rama manual se reforzó con `routeInvades` sobre src/tgt/obstáculos (reemplaza a `routeTraversesObstacle`, ahora eliminado).

Se aplica también a la ruta manual que pierde validez (cae a `ensureClean(fresh)`). Associations exentas (cruzar shapes es normal para un link a anotación).

### Capa 3 — invariante extendido (`OrthogonalityBehavior.violatesInvariant`)
Añade la invasión de src/tgt al invariante (barato: 2 rects). Cualquier comando que deje una ruta invadiendo su propio shape → se repara **dentro del mismo comando** (undo atómico, un snapshot Yjs). Auto-sanado real: el estado del screenshot se corrige en el instante en que se produce, sin depender del botón "Restablecer ruta". Associations y self-loops exentos.

### Capa 4 — conexiones de terceros (`OrthogonalityBehavior`, paridad Bizagi §13)
Al mover/redimensionar/**crear** un shape, se re-rutean las conexiones **ajenas** cuyo camino ahora pasa por dentro del shape — "las flechas se apartan cuando les plantas un shape encima". Solo las que realmente invaden (test bbox por conexión); autos y manuales rotas se re-rutean limpias (`rerouteClean` con `forceReroute`), associations se respetan.

---

## 5. Orquestación de comandos (prioridades) — por qué no hay ping-pong ni undo roto

Todos los behaviors son `CommandInterceptor` (requieren `X.prototype = Object.create(CommandInterceptor.prototype)`, sin esto el modeler no arranca). Prioridades en `postExecuted`:

- **1500 `ManualRouteBehavior`** — fija/limpia el flag manual según hints (`segmentMove`/`bendpointMove` → manual; `resetRoute` → auto; `orthoAutoRerouted` → limpia). Corre primero para que el invariante vea el flag actualizado.
- **500 `OrthogonalityBehavior` (invariante)** — verifica ortogonalidad + anclaje + no-invasión; repara anidado (mismo grupo de undo).
- **400 `OrthogonalityBehavior` (Capa 4)** — terceros invadidos.

**Reglas de oro que evitan los problemas clásicos:**
- Nunca `modeling.*` desde `connection.changed`/`commandStack.changed` (ese era el pecado del viejo `WaypointRounder`, que contaminaba undo/redo y arriesgaba churn Yjs). Todo se hace desde fases de `CommandInterceptor` → un `commandStack.changed` por gesto → un snapshot Yjs.
- **Idempotencia**: si el invariante ya se cumple no se toca nada → el `correctivePass` de la colaboración converge sin ping-pong (los waypoints remotos ya vienen normalizados por el mismo código del peer).
- Guard `fixing: Set<id>` contra re-entrada dentro de la misma pila de reparación.

`WaypointRounder` quedó degradado a una aserción `[ortho]` en dev: si aparece una diagonal fuera del flujo de comandos, es un camino no cubierto y se reporta — no debería dispararse nunca.

---

## 5d. Arrastrabilidad garantizada: snap a ortogonal EXACTA en el commit (mirror de Bizagi)

**Síntoma:** a veces un segmento del MEDIO de una flecha no se podía arrastrar; tras otras operaciones, el mismo segmento sí. Intermitente y auto-curable.

**Causa (diagram-js):** un segmento solo es arrastrable si está alineado al eje dentro de `ALIGNED_THRESHOLD = 2px`. Dos compuertas usan `pointsAligned`: `createSegmentDraggers` (no crea handle si no está alineado) y `ConnectionSegmentMove.start` (`if (!pointsAligned) return` — aborta en silencio, "do not move diagonal connection"). Un segmento transitoriamente torcido (>2px, o >1px que nuestro invariante toleraba) → sin handle + move abortado → "no hace nada". Se curaba porque el siguiente comando re-layouteaba a ortogonal.

**Cómo lo maneja Bizagi** (`.syntesis/Router/findings.md` §9,§14,§16): NO lo maneja como caso — lo hace imposible. Los puntos del conector SON siempre la solución ortogonal del router (`isSolutionValid` rechaza diagonales), y crea **un handle por segmento** (`CreateHandles`, tipado LeftRight/UpDown) regenerado en cada `Route()`. Nunca hay segmento no-ortogonal ni sin handle. Previene el estado, no lo parchea.

**Fix (opción A) — endurecer el invariante de "≤1px" a EXACTO (0px, entero):** primitivas puras en `orthogonal.ts`:
- `isExactOrthogonal(wps)` — todos los puntos enteros y cada segmento 0px alineado.
- `snapOrthogonal(wps)` — redondea a enteros + alinea cada segmento al eje dominante (propaga hacia adelante) + colapsa degenerados. La entrada ya viene casi-ortogonal (≤tol) → solo elimina residuos, no reforma.

Aplicado en el commit de `OrthogonalityBehavior` (el único choke point de todo comando de conexión): tras cada comando, si `!isExactOrthogonal(wps)` → `snapOrthogonal` + `updateWaypoints` (rama barata); el `repair()` también commitea con `snapOrthogonal`. Resultado: **toda ruta commiteada es ortogonal exacta entera** → la compuerta de diagram-js siempre pasa → todo segmento siempre tiene handle y siempre se arrastra. Es la garantía de `SetSolution` de Bizagi aplicada a nuestro modelo, **sin sacrificar la libertad manual** (se snapea la forma del usuario a exacta, no se re-rutea) ni pelear con diagram-js.

Descartadas: (B) bajar/quitar la compuerta de 2px → pelea con la librería y permitiría arrastrar diagonales; (C) mirror completo (re-rutear todo en cada cambio, como Bizagi) → mataría la libertad manual que elegimos.

Tests: `orthogonal.test.ts` (isExactOrthogonal/snapOrthogonal) + `routing.integration.test.ts` (tras mover/updateWaypoints/mover-con-manual, `isExactOrthogonal(waypoints)` es true).

## 5b. Optimización de cara al mover un shape (ruta corta, no sobrepaso)

**Síntoma relacionado:** mover un shape a otro lado del recorrido dejaba la flecha entrando por la cara **lejana** (p. ej. rodeando el shape para entrar por la derecha cuando la izquierda era la más corta). No es invasión (la ruta es limpia), solo sub-óptima — por eso las Capas 2/3 no la tocan (solo disparan ante invasión/diagonal; la optimalidad no es un invariante para no arriesgar churn/ping-pong Yjs).

**Causa:** misma familia que el bug de invasión. Para conexiones auto, al mover un shape el layouter hereda (a) la **cara del hint viejo** (`nearestFace(tgt, dockViejo+delta)`) y (b) la **forma vieja** (reuso de `existingWaypoints`, que el router solo "repara"). Nada recomputa "¿cuál cardinal es el más corto ahora?".

**Fix** (`BizagiLayouter.layoutConnection`, cierre de la rama auto): al haber hint de movimiento se calcula también la ruta **geométrica fresca** (caras `sGeo`/`tGeo` desde la posición actual, sin reusar waypoints) y se prefiere **solo si es estrictamente más simple** — métrica `routeCost` = longitud Manhattan + 20px por codo. Como la conexión es auto no hay preferencia de lado del usuario que respetar (el arrastre manual va por la otra rama). Se excluyen message flows y boundary events (tienen su propia lógica de cara) y los pares con ≥2 paralelas (perderían su separación ±10px, que sí trae la ruta preservada). Reutiliza `computeRoute`/`isClean`/caras geométricas de la Capa 2 — sin arquitectura nueva.

## 5c. Prioridad a la ruta manual del usuario (relajación de §14)

**Síntoma:** al modelar diagramas reales (flechas largas cruzando carriles), las rutas dibujadas a mano "volvían al inicio" al mover cualquier shape, y el botón fix no ayudaba. El arreglo automático se sentía intrusivo.

**Causa dominante:** el criterio de simplicidad de §14 — conservar la ruta reparada solo si `repaired.length <= fresh.length`. Una ruta manual larga SIEMPRE tiene más codos que la canónica → la condición fallaba → se descartaba la edición del usuario. Contribuían además: (b) el handler de segmento re-anclaba el extremo gateway/grupo en **cada frame** aunque arrastraras un segmento lejano (peleaba la parte cercana al gateway); (c) la Capa 4 re-ruteaba también rutas manuales de terceros al plantarles un shape encima.

**Fix (decisión de producto):** la ruta manual del usuario tiene **prioridad**; el arreglo automático solo actúa cuando la ruta es **inválida**. "Inválida" = no ortogonal, extremos desanclados, o metida dentro de su propio src/tgt. Se eliminó el criterio de longitud y el chequeo de cruce con obstáculos de terceros del "keep-decision" de rutas manuales.
- `BizagiLayouter` rama manual: `if (valid) return repaired` — sin `≤ fresh` ni obstáculos. Válida = ortogonal + anclada + (no-assoc) no invade src/tgt.
- `BizagiSegmentHandles`: re-dock del extremo gateway/grupo **solo** cuando se arrastra su segmento adyacente (`segmentStartIndex===0` / `segmentEndIndex===last`).
- `OrthogonalityBehavior` Capa 4: exime conexiones **manuales** (solo autos se apartan). `repair()` manual: descarta la forma solo si tras reparar sigue no-ortogonal o invadiendo src/tgt.

**Trade-off:** el diagrama puede acumular rutas manuales subóptimas — pero son las que el usuario dibujó a propósito. La garantía de **no-invasión de src/tgt** y de **ortogonalidad** se mantiene (esas sí se auto-corrigen). El botón "fix" (`forceReroute`) sigue disponible para re-canonizar a voluntad. Cambio de semántica respecto a §14 estricto, elegido explícitamente ("la ruta manual del usuario tiene prioridad; solo cuando algo es inválido se hace la ruta automática").

## 6. Efectos secundarios / limitaciones conocidas

- **Costo del fallback de caras (Capa 2):** hasta 17 `calculateRoute` extra, pero solo cuando la ruta primaria invade (raro). Ruta normal = 0 extra (idempotente).
- **Costo de Capa 4:** un test bbox por conexión por cada move/create de shape — O(conexiones). Aceptable para diagramas típicos; a vigilar en diagramas de miles de elementos.
- **Separación de paralelas en el fallback:** si una ruta paralela cae al fallback de caras, pierde su offset ±10px de separación (correctitud > estética). El invariante mantiene la no-invasión; la separación se recupera en el siguiente layout normal.
- **Pendiente de burn-in manual:** feel del drag y colaboración con 2 clientes (no verificable headless). La consola dev grita `[ortho]` ante cualquier camino no cubierto.

---

## 7. Verificación

- **Unit** (`orthogonal.test.ts`, 29): primitivas de ortogonalidad, reparación en cadena, dock deslizante, y las de invasión (`pointInRectInterior`, `segmentClipsRect` incl. "entra y muere dentro", `routeInvades` con el caso screenshot).
- **Integración** (`routing.integration.test.ts`, 15, bpmn-js real en jsdom con shims SVG): invariante de ortogonalidad, repair-or-reroute §14, undo atómico del flag, reset del context pad, preferencias por tipo (message flow/boundary/association), paralelas, self-loops, y **no-invasión**: mover target debajo del gateway, `updateWaypoints` con esquina interior auto-sanada, y Capa 4 (soltar shape encima de flecha ajena).
- Suite completa: **103/103**. `tsc -b` limpio, `npm run lint` limpio (ESLint 9 flat config), `npm run build` OK.

### Reproducir el bug original (antes del fix)
Diagrama con gateway → tarea (entrada por la izquierda); mover la tarea hasta quedar debajo del gateway solapando su eje vertical. Antes: la flecha hacía esquina dentro de la tarea. Ahora: `routeInvades(flow.waypoints, tarea) === false` garantizado por el invariante.
