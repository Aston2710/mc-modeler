# CLAUDE.md

Guía para Claude Code (claude.ai/code) al trabajar en este repositorio.

## Estado del proyecto

**En producción.** No es un andamiaje ni un prototipo: hay usuarios reales, datos reales
y una base Supabase viva. A 2026-08-21: **176 diagramas de 21 usuarios en 17 proyectos**.

`main` **despliega a producción** (Vercel). Todo lo que entre ahí sale al usuario.

## Regla #1 — la documentación vive en `docs/` y se consulta ANTES de tocar código

`docs/` no es un archivo muerto: es el sistema que define la arquitectura y el orden de
trabajo. **Leerlo primero evita rediscutir decisiones ya cerradas y rediagnosticar bugs
ya resueltos.**

| Antes de… | Leer |
|---|---|
| cualquier cosa | [`docs/README.md`](docs/README.md) — cómo está organizado y dónde va lo nuevo |
| preguntar "¿qué toca ahora?" | [`docs/plans/todo/INDEX.md`](docs/plans/todo/INDEX.md) — los tres master plans activos y su orden |
| escribir código que toque una capa | `docs/context/` — **gobierna el código futuro**, no es historia |
| diagnosticar un bug de Yjs, XML, colaboración, routing o corrupción | `docs/experience/` — 21 incidentes con su causa y su fix |
| tomar una decisión de arquitectura | `docs/context/decisiones.md` — 12 decisiones con sus alternativas descartadas |

Cuatro reglas del esquema que importan al escribir en él:

- **`context/` son documentos vivos**: se editan en sitio. No se crea `arquitectura-v2.md`.
- **La numeración es orden de descubrimiento, no de ejecución.** El orden vive en el master plan.
- **`mitigado` no es `resuelto`.** Confundirlos es cómo un problema vuelve en un año.
- **Cerrar un plan requiere aprobación explícita del usuario.** Pasos completados ≠ plan cerrado.

## Reglas duras de operación

1. **Nunca tocar `.env.local`** — ni renombrar, ni mover, ni editar, ni borrar. Contiene
   secretos de producción. Para el modo local se usan variables vacías por shell.
2. **Los cambios de base de datos requieren aprobación explícita.** Supabase es producción
   viva. Se prototipa el SQL y se espera. Las lecturas sí están permitidas.
3. **Ninguna migración se estrena en producción.** Se prueba primero en el laboratorio local
   (`npm run lab`) — ver [`docs/context/desarrollo-local.md`](docs/context/desarrollo-local.md)
   y EXP-016, que es por qué existe esta regla.
4. **No commitear ni pushear sin que el usuario lo pida.** Se implementa, se prueba en el
   laboratorio, y se para.
5. **Medir antes de optimizar.** Baseline primero con `flujo:perf` o
   `EXPLAIN (ANALYZE, BUFFERS)` bajo el rol real — sin `set local role` la consulta que mides
   no es la que corre el usuario (factor 700 de diferencia, medido).
6. **Entregables largos van a archivo**, no al chat: código, XML o texto extenso a `docs/`,
   y en el chat solo el resumen y la ruta.

## Comandos

```
npm run dev        # Vite dev server
npm run build      # tsc -b && vite build
npm run test       # Vitest (35 ficheros, 393 pruebas)
npm run lint       # ESLint 9 — src/**, --max-warnings 0
npm run lab        # laboratorio local: stack Supabase en Docker + Vite en el puerto 7654
npm run lab:reset  # supabase db reset + Vite en modo lab
npm run db:start / db:stop / db:status / db:reset / db:diff
```

## Stack real

React 19 · TypeScript 5.6 · Vite 6 · **bpmn-js 18** (motor BPMN 2.0) · Zustand 5 ·
Tailwind 4 · Zod 3 · Yjs 13.6 · `@supabase/supabase-js` 2 · localforage · i18next
(es por defecto, en disponible) · lucide-react · jsPDF · JSZip · html-to-image · Immer.

Pruebas: Vitest 4 + Testing Library + jsdom.

> `shadcn/ui` **no** está instalado, aunque el plan original de 2026-04 lo previera.
> La UI son componentes propios con Tailwind.

## Estructura

```
mc-modeler/
├── src/
│   ├── bpmn/          motor: renderer, paleta, context pad, reglas, routing Bizagi, canvas, modelerCache
│   ├── collab/        Yjs: YjsBpmnBinding, yBpmnModel, canvasSession — la pieza más delicada del sistema
│   ├── components/    UI React: layout, canvas, diagramas, propiedades, modales, comentarios, auth
│   ├── domain/        types.ts, bpmnElements.ts, validation.ts
│   ├── hooks/         useBpmnModeler, useCollab, useAutoSave, useExport, useComments, useKeyboard…
│   ├── persistence/   patrón repositorio: Local (IndexedDB) | Supabase (nube), elegido en index.ts
│   ├── store/         Zustand: diagram, auth, collab, comment, image, notification, preferences, presence, ui
│   ├── i18n/          es.json (por defecto), en.json
│   ├── lib/           supabase.ts, sharing.ts, notificationNav.ts
│   └── utils/         export .bpm, thumbnails, perf, incidents, fechas, ids
├── docs/              addons · context · experience · plans/{todo,done}  ← ver Regla #1
├── supabase/          migrations/ (baseline por introspección) · migrations_legacy/ (0001–0030, histórico)
├── scripts/           diagnóstico y backup — en .gitignore, salvo lab.mjs
├── prototype/         dos mockups HTML de UX/UI, referencia visual read-only
└── appscript/         Apps Script del módulo de notificaciones
```

## Arquitectura — lo que no se rediscute

- **La fuente de verdad de un diagrama es un XML canónico en Postgres** (`diagrams.current_xml`).
  DEC-001.
- **Yjs es transporte de sesión, no autoridad de persistencia.** DEC-002. Las tablas
  `yjs_documents`/`yjs_updates` se eliminaron de producción.
- **La concurrencia se resuelve por CAS** sobre la fila, con granularidad de documento entero.
  Es la limitación que MASTER-PLAN-019 existe para arreglar.
- **El patrón repositorio abstrae la persistencia.** Sin `VITE_SUPABASE_*` la app funciona
  entera en IndexedDB, sin auth ni nube. **Ese modo no se rompe.**
- **Las políticas RLS de tipo `SELECT` usan predicado conjuntista, no función por fila.**
  DEC-005 — la diferencia medida fue 0.26 ms contra 8.7 ms.
- **El usuario dibuja lo que quiera.** No se imponen reglas semánticas de BPMN.

## Diseño visual

Tema oscuro por defecto. Tokens CSS en `:root` / `[data-theme="dark"]` en `src/index.css`,
leídos por el renderer con `getComputedStyle` (`src/bpmn/rendering/ThemeColors.ts`) y un
`MutationObserver` sobre `data-theme`.

`prototype/` contiene dos mockups HTML (`mejora-UX-UI-01.html`, `-02.html`) como referencia
visual. **No se modifican.** La carpeta `design-prototype/` que mencionaban documentos
antiguos **ya no existe**.

## Documentos históricos — no son la especificación viva

`BPMN_MODELER_PROJECT.md` (v1.3, 2026-04-25) describe el proyecto tal como se planeó antes
de que existieran la nube, la auth y la colaboración. **Conserva valor como catálogo de
elementos BPMN y de requisitos funcionales, pero su arquitectura, su alcance y su stack
están superados por `docs/context/`.** Ante contradicción, gana `docs/context/`.

Igual con los cuatro `docs/addons/auditoria-*.md`: son informes fechados en 2026-07-19 que
se citan, no gobiernan, y sus referencias a `fix_doc/` apuntan a la estructura anterior
al 2026-08-10 (DEC-008).
