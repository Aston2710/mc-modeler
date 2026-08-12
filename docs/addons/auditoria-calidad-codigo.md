# Auditoría de calidad de código y comentarios

**Fecha:** 2026-07-19 · Capítulo 2 de la auditoría (capítulo 1: arquitectura, ver `arquitectura-patrones.md`). Decisiones resultantes: D-11/D-12 en `auditoria-decisiones.md`.

---

## 1. Radiografía (medido, no estimado)

| Métrica | Valor | Lectura |
|---|---|---|
| Código producción | 144 archivos · ~23.000 LOC | `bpmn/` 8.0k · `components/` 5.3k · `utils/` 2.6k · `collab/` 2.5k · `store/` 1.6k · `hooks/` 1.3k |
| Tests | 19 archivos · 2.775 LOC | collab 9 · bpmn 5 · utils 3 · store 2 · **components/hooks/persistence: 0** |
| TODO/FIXME/HACK | **8** en todo src | Excelente — la deuda se documenta en `fix_doc/`, no se esconde en el código |
| `any` / `as any` | 112 usos (178 eslint-disable de `no-explicit-any`) | Concentrado: `bpmn/` 61 · `hooks/` 35 · **resto ≈ 0** |
| `@ts-ignore/@ts-expect-error` | 36 | Misma frontera |
| JSDoc `/** */` | 239 bloques | Alto para el tamaño del código |
| Archivos >500 líneas | 8 | `bpmExport.ts` 1100 · `App.tsx` 780 · `BizagiLayouter` 696 · `bpmImport` 622 · `diagramStore` 564 · `PhaseModule` 550 · `BizagiDirectionalRouter` 544 · `YjsBpmnBinding` 516 |

## 2. Hallazgos de calidad

### 2.1 El `any` es deuda de FRONTERA, no de disciplina ✅/🔧
El 86% del `any` vive en `bpmn/` + `hooks/` — exactamente la frontera con bpmn-js, que **no publica tipos** para sus internals (didi, elementos del canvas, eventBus). El resto del código (stores, collab, persistence, components) está limpio: 0 usos. Veredicto: deuda justificada PERO mejorable barato:
- 🔧 Un archivo `src/types/bpmn-js.d.ts` con los ~10 shapes que más se repiten (Element, Connection, EventBus, CommandStack, Canvas) mataría la mayoría de los 178 disable de golpe. Los tipos no necesitan ser perfectos — con `unknown` estructurado ya se gana chequeo.
- 🔧 `modelerRef: React.RefObject<any>` se propaga por todos los hooks — un solo alias `BpmnModeler` tipado elimina la cascada.

### 2.2 Tests: bien apuntados, con dos huecos 🔧
La cobertura sigue al riesgo (donde hubo bugs: collab 9 suites, routing, CAS) — estrategia correcta, no cobertura decorativa. Huecos reales:
1. **`persistence/` sin tests** — SupabaseRepository (CAS, thumbnails caché, mapeos) es el camino crítico de datos y solo se testea indirectamente vía diagramStore.
2. **Hooks sin tests** — `useAutoSave` tiene la lógica de guards más delicada (viewer, canvas-ready, jitter) y cero tests directos.
UI components sin tests: aceptable por ahora (bajo churn de lógica, alto costo de test).

### 2.3 Archivos grandes: 3 de 8 son problema real 🔧
- `App.tsx` (780): raíz que acumula layout + wiring de modales + orquestación de pestañas + atajos. Candidato #1 a partir (extraer wiring de modales y el shell de layout).
- `bpmExport.ts` (1100) + `bpmImport.ts` (622): formato binario .bpm — cohesivos internamente, pero sin tests del roundtrip completo export→import (el bug int32 de fix_doc habría caído aquí).
- Los de routing (`BizagiLayouter`, `DirectionalRouter`) y `YjsBpmnBinding`: grandes pero cohesivos y testeados — no tocar por tamaño.

### 2.4 ESLint: correcto pero permisivo 🔧
Flat config ESLint 9, solo `src/`. La regla más violada (`no-explicit-any`) se apaga 178 veces en vez de resolverse (ver 2.1). Falta: regla que exija razón junto a cada `eslint-disable` (`eslint-comments/require-description`).

## 3. Comentarios: diagnóstico y estándar

### 3.1 Lo que hay (muestreado)
- **Calidad de contenido: alta.** La práctica dominante es comentar el *porqué* — invariantes, carreras, defensas ("Guarda anti-NaN…", "No sembramos el diagrama completo porque…", "El toolbar tiene overflow:hidden → el dropdown se porta a body"). Esto es lo difícil de lograr y ya existe.
- **Idioma: mezclado.** Mayoría español, minoría inglés ("Import current diagram XML — called both from…"). Sin regla.
- **Formato: mezclado.** 239 JSDoc conviven con headers de bloque informales; sin criterio de cuándo va cada uno.
- **Densidad: dispareja.** `collab/` y `persistence/` densamente documentados (post-bugs); `components/` casi sin comentarios (aceptable: UI declarativa).

### 3.2 Estándar propuesto (formalizar la práctica dominante, no inventar)
1. **Idioma: español.** Identificadores en inglés, comentarios en español (mayoría actual; el equipo opera en español).
2. **Contenido: el porqué, nunca el qué.** Invariantes, restricciones, carreras, decisiones. Prohibido narrar la línea siguiente.
3. **JSDoc `/** */`** solo para lo exportado (funciones/clases/módulos públicos): una frase de responsabilidad + params no obvios. **`//`** para todo lo interno.
4. **Referencia cruzada obligatoria** cuando el comentario defiende contra un bug pasado: `— ver fix_doc/<doc>.md` (ya se hace a veces; volverlo regla).
5. **`eslint-disable` siempre con razón** en la misma línea o la anterior.
6. **Cero código comentado muerto** — para eso está git.
7. Migración: **no hay barrida retroactiva** — el estándar aplica a código nuevo y a todo archivo que se toque (boy-scout rule). Los comentarios EN existentes se traducen al tocar el archivo.

## 4. Acciones (van al registro como D-11/D-12)

| Prioridad | Acción | Costo |
|---|---|---|
| 1 | `bpmn-js.d.ts` con tipos mínimos + alias `BpmnModeler` en hooks | ~1 sesión, mata ~150 disables |
| 2 | Tests: `SupabaseRepository` (CAS/mapeos) y `useAutoSave` (guards) | ~1 sesión |
| 3 | Test de roundtrip .bpm (export→import idéntico) | corto |
| 4 | Partir `App.tsx` (wiring de modales + shell) | 1 sesión, sin cambio de conducta |
| 5 | Adoptar estándar de comentarios §3.2 (documento = este; regla eslint de descripción en disable) | inmediato |
