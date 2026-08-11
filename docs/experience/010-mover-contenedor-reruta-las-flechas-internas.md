---
id: EXP-010
titulo: Mover el pool a la derecha reruta las flechas internas
estado: activo
severidad: alta
fecha_deteccion: 2026-07-27
fecha_cierre: 
componentes: [src/bpmn/connections]
relacionados: [context/patrones-routing.md]
---

# [ABIERTO] Mover el pool a la derecha rerutea las flechas internas

**Estado:** 🔴 ABIERTO — sin corregir. Documentado para atacarlo en rama aparte.
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

## Hipótesis (sin confirmar — requieren trace)

1. **Elección de cara / §5b sensible al signo del delta (principal).**
   Al mover, el layouter hereda la cara del hint viejo (`nearestFace(dockViejo+delta)`)
   y §5b calcula una ruta "fresca" y la prefiere **solo si es estrictamente más
   simple** (`routeCost` = Manhattan + 20px/codo). Mover a la derecha probablemente
   inclina el `<` estricto a favor de la ruta fresca (o cambia la cara "más cercana"),
   mientras que las otras direcciones dejan el empate → conserva la ruta trasladada.
   Explica la **asimetría direccional**.

2. **Capa 4 viendo el bbox del pool sobre sus propias flechas hijas (secundaria).**
   Al mover un shape, Capa 4 re-rutea conexiones cuyo camino queda dentro del bbox
   del shape. El pool contiene a sus flechas hijas → podría reruteárselas. Pero esto
   dispararía en **cualquier** dirección, así que no explica la asimetría por sí solo.

## Dirección de arreglo propuesta

Eximir el **move de contenedor** del re-layout: si TODOS los extremos de una
conexión están dentro del shape que se mueve (descendientes del Participant/pool),
**trasladar** los waypoints por el delta en vez de pasar por `layoutConnection`.
Es el comportamiento correcto de un contenedor y elimina la asimetría de raíz.
Alternativa/complemento: en §5b, no preferir la ruta fresca cuando el gesto es un
move de contenedor (delta uniforme en todos los endpoints → relativas iguales →
nunca "estrictamente más simple").

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
