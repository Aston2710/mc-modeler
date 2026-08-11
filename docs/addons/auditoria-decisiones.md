# Auditoría de diseño — registro de decisiones y hallazgos

Registro acumulativo de la auditoría (inicio 2026-07-19). Insumo directo para la futura refactorización/reestructuración. Cada entrada: veredicto, evidencia y acción pendiente. Detalle y argumentos en `arquitectura-patrones.md`.

**Estados:** ✅ decidido · 🔧 acción pendiente · ❓ por decidir

---

## D-01 · Estilo arquitectónico ✅
La arquitectura mixta (capas + puertos + event-driven, cliente-pesado sobre BaaS) es **correcta y se mantiene**. Mixta por diseño: cada estilo resuelve una dimensión distinta (estructura / fronteras / runtime). No hay arquitectura sustituta que cumpla las decisiones vigentes (costo, realtime, sin backend propio).
**Regla a proteger:** ningún dato puede vivir en dos dominios de consistencia a la vez (estructura→XML · metadata→tablas · sesión→Y.Doc). Fue la causa de la corrupción pre-pivote.

## D-02 · Servidor delgado ausente 🔧 (hallazgo mayor)
Hueco de **completitud arquitectónica** (componente faltante, no código mal escrito). Roadmap incremental sin rescritura (detalle en `arquitectura-patrones.md` §5.1):
1. Trigger Postgres: sanidad mínima del XML al UPDATE — *ya mismo*
2. `beforeunload` flush + líder de guardado — *ya mismo, ~30 líneas*
3. Edge Function "ops" (migraciones sin pausar usuarios) — *corto plazo*
4. Edge Function correo (retira Apps Script del camino) — *corto plazo*
5. Servidor CRDT autoritativo (único escritor de `current_xml`) — *gatillo: usuarios externos o >5 editores/diagrama* (decisión #7 del ADR)

## D-03 · Quick wins de implementación 🔧
Por retorno esperado (medir baseline antes): flush al salir · líder de guardado · thumbnail fuera del camino caliente (idle / cada N ciclos) · LRU en caché de imágenes (hoy sin tope) · toda regla de negocio nueva nace en `src/domain/`, no en hooks.

## D-04 · Fricciones estructurales aceptadas (se presupuestan, no se eliminan)
- Binding CRDT↔commandStack: impuesto permanente sobre cada feature de canvas; mantenerlo contenido en `YjsBpmnBinding` ES la arquitectura.
- N escritores async con guards (`canEdit`, `isCanvasReadyFor`, fencing): el líder de guardado (D-02.2) reduce la clase de bugs de raíz.
- Protocolo de sync hecho a mano (coalescer, anti-entropía, handshake): se retira solo cuando llegue D-02.5.

## D-05 · Representación de la arquitectura ✅ 🔧
Un diagrama único mezclando preguntas = ilegible. Adoptado **juego C4 multi-página** (`arquitectura-c4.xml`): completitud en la SUMA de páginas; cada página densa pero UNA pregunta.
Reglas: caja = nombre real + 1 línea de responsabilidad · flecha = mecanismo (1-3 palabras) · agrupación espeja carpetas del repo · máx 1 nota por página.
✅ Hechas: páginas 7 (Motor BPMN, 45 módulos/helpers), 8 (UI + 9 stores + hooks + lib/utils), 9 (modelo de datos/ERD + RLS + buckets), 10 (export/import) → `arquitectura-c4-detalle.xml`.
🔧 Pendiente: completar 3-6 (guards liveSync/viewer, guardado manual, ruta local, subprocesos); checklist carpeta→página. Al terminar, retirar `Arquitectura.xml` (mapa gigante legacy). Flujos paso a paso → BPMN en el propio MC-Modeler (dogfooding, más adelante).

## D-06 · Modo local ✅ 🔧
NO es código muerto, pero se **redeclara**: es *harness de desarrollo + almacén de prefs por dispositivo*, no feature de producto — no invertir en paridad de features (colab/imágenes/comentarios no-op en local es aceptable).
Evidencia: selección por env vars en build (`persistence/index.ts:16`) — en prod nunca corre; `SupabaseRepository` delega prefs en `LocalRepository` (línea 77) — vivo en prod; sandbox dev con vars vacías — en uso real.
🔧 `migrateLocalToCloud.ts`: **código muerto confirmado** (cero llamadores) → borrar en la refactorización.

## D-07 · Versionado histórico de diagramas ❓ (decidir ANTES de más features sobre el guardado)
Gap competitivo #1 vs Figma. Cambia el diseño de guardado: snapshots versionados vs UPDATE in-place actual. Cada feature nueva construida sobre el guardado actual encarece el cambio. Pregunta abierta de producto (§3.5.2 del doc de patrones).

## D-08 · Gaps competitivos estructurales (referencia)
- vs **Figma**: servidor autoritativo (=D-02.5) + historial de versiones (=D-07)
- vs **draw.io**: determinismo de artefactos (thumbnails/exports dependen del browser — bug rgb()/hex fue síntoma) y offline real (hoy no-objetivo explícito del ADR — reconfirmar en D-07)

## D-09 · Preguntas abiertas para producto ❓
1. ¿Editores concurrentes esperados por diagrama? (gatillo de D-02.5)
2. ¿Historial/versiones como feature? (D-07)
3. ¿Editores externos a la organización? (si sí, validación server-side deja de ser opcional → adelanta D-02.1)
4. ¿Offline como feature? (hoy no-objetivo; cambiaría el modelo de merge por completo)
5. ¿Autosave 20s correcto? (con flush-al-salir puede subir a 30–40s)

## D-10 · Conflictos CAS de guardado ✅ 🔧
El conflicto **no se corrige — se detecta** (la alternativa, UPDATE ciego, lo esconde: clobber silencioso pre-pivote). Tres niveles:
1. **Detección (CAS + reintento + toast): correcta, se queda** — red de seguridad permanente, incluso con líder.
2. **Frecuencia: defecto corregible YA.** Hoy los co-editores chocan *por diseño* (autosavan el mismo estado disparados por los mismos eventos — choques administrativos, no desacuerdos). 🔧 Líder de guardado (D-03): un solo peer del canal escribe → cero carreras entre co-editores.
3. **Conflicto legítimo (vista stale que pisa trabajo nuevo): NO automatizable** — un blob XML no tiene semántica de merge (ADR §3.3). El toast (tomar servidor / duplicar) es la UX correcta: preserva ambos, decide un humano. Desaparece solo con escritor único en servidor (D-02.5) — así lo resuelve Figma.

## D-11 · Calidad de código 🔧 (detalle en `auditoria-calidad-codigo.md`)
Radiografía: ~23k LOC · solo 8 TODO · `any` concentrado 86% en la frontera bpmn-js (deuda justificada, no indisciplina — resto del código: 0 usos). Acciones por prioridad:
1. `src/types/bpmn-js.d.ts` con tipos mínimos + alias `BpmnModeler` → mata ~150 eslint-disable
2. Tests faltantes en camino crítico: `SupabaseRepository` (CAS/mapeos) y `useAutoSave` (guards) — hoy 0 directos
3. Test de roundtrip .bpm export→import
4. Partir `App.tsx` (780 líneas: wiring de modales + shell) — los archivos grandes de routing/binding NO se tocan (cohesivos y testeados)
5. ESLint: exigir razón junto a cada disable

## D-12 · Estándar de comentarios ✅
La práctica dominante ya es la correcta (comentar el PORQUÉ: invariantes, carreras, defensas) — se formaliza, no se inventa: español · JSDoc solo en exportado · `//` interno · referencia a `fix_doc/` cuando defiende contra bug pasado · disable con razón · cero código muerto comentado. **Sin barrida retroactiva**: aplica a código nuevo y archivo tocado (boy-scout). Detalle §3.2 de `auditoria-calidad-codigo.md`.

## D-13 · Testing 🔧 (detalle en `auditoria-testing.md`)
Estado: 19 suites · 151 tests · verdes · 11.3s. Estrategia actual (cobertura dirigida por riesgo, mapea 1:1 con fix_doc) es **correcta — se mantiene**; jamás % de cobertura como KPI.
Huecos por prioridad: **1) CI inexistente** (GitHub Actions: lint+tsc+vitest, ~20 líneas — el fix de mayor retorno de toda la auditoría de calidad) · 2) tests de `useAutoSave` (fake timers) · 3) tests de `SupabaseRepository` · 4) roundtrip .bpm · 5) smoke E2E colaborativo Playwright 2-contexts (cierra ADR §2d, pruebas multiusuario reales).
Anti-metas: no testear UI declarativa sin lógica; no pirámide E2E completa.

## D-14 · Código muerto e información obsoleta 🔧 (detalle en `auditoria-codigo-muerto.md`)
Verificado por grafo de imports (no supuesto):
1. **Borrar:** `migrateLocalToCloud.ts` · `utils/cn.ts` (0 llamadores ambos)
2. **Desinstalar 7 deps:** `html-to-image` · `immer` · `zod` · `clsx` · `tailwind-merge` (prod, 0 imports) · `@testing-library/react` · `@testing-library/user-event` (dev, 0 usos)
3. **`YjsCommentBinding` vive solo para el modo local** (CRDT+localforage para el sandbox de dev) → retirarlo bajo D-06; recomendado: modo local sin comentarios
4. **`CLAUDE.md` desactualizado — prioridad #1 del capítulo:** dice "scaffolding phase"/stack "planned" con la app en producción; desorienta cada sesión. Reescribir + README real + marcar `BPMN_MODELER_PROJECT.md` como histórico
5. `backups/` con dumps PII: protegida (.gitignore:83, 0 trackeados); mover fuera del árbol a mediano plazo · archivar one-shots ejecutados de `scripts/` tras correr migrate-images
