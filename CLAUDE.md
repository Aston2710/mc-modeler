# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Status

Production scaffolding phase. Design prototype exists as visual reference only. Production app lives at repo root (outside `design-prototype/`).

## ⚠️ CRITICAL: design-prototype/ is READ-ONLY

**NEVER modify any file inside `design-prototype/`.** It is a static visual reference, not production code.

- Do not edit `design-prototype/*.jsx`, `design-prototype/*.css`, or `design-prototype/*.html`
- Use it only to extract: colors, spacing, component layout, UX patterns, BPMN element styles
- All production code goes in the repo root (sibling to `design-prototype/`, not inside it)

## Prototype (Current)

Entry point: `design-prototype/Flujo BPMN.html` — open directly in browser, no build step.

Files:
- `app.jsx` — root state, multi-tab, diagram CRUD
- `canvas.jsx` — BPMN element models + SVG rendering
- `home.jsx` — diagram list view
- `properties.jsx` — selected-element properties panel
- `icons.jsx` — BPMN element SVG icons
- `tweaks-panel.jsx` — live UI tweak system
- `styles.css` — light/dark themes, layout, BPMN color tokens

## Production App Location

All production files live at **repo root** (`mc modeler/`), NOT inside `design-prototype/`. Structure will be:

```
mc modeler/
  design-prototype/   ← READ-ONLY visual reference, never touch
  src/                ← production source
  public/
  package.json
  vite.config.ts
  ...
```

## Production Stack (Phase 1.0 — planned)

React 19 + TypeScript + Vite + bpmn-js v18 + Zustand + Tailwind v4 + localforage + Zod + shadcn/ui.

Build commands when scaffolded:
```
npm run dev      # Vite dev server
npm run build    # production build
npm run test     # Vitest
npm run lint     # ESLint 9
```

## Architecture (planned)

```
/src
  /bpmn        ← bpmn-js engine integration, custom palette/renderer/context pad
  /store       ← Zustand stores (diagrams, UI state, preferences)
  /hooks       ← useBpmnModeler, useDiagramStore, useAutoSave, useValidation, useExport, useKeyboard
  /persistence ← Repository pattern: LocalRepository (v1.0), ApiRepository placeholder (v2.0)
  /components  ← React UI (layout, canvas, palette, properties, modals, diagram list)
  /domain      ← business logic, validation, BPMN element definitions
  /utils       ← ID gen, date formatting, export helpers
  /i18n        ← es.json (default), en.json
```

**Key decisions:**
- Repository Pattern abstracts persistence — `LocalRepository` uses localforage (IndexedDB + localStorage fallback); swap for API in v2.0
- bpmn-js v18 is the BPMN 2.0 engine (Camunda-maintained, certified)
- Zustand replaces prop-drilling/Context for global state
- Tailwind utility classes avoid CSS conflicts with bpmn-js internal styles

## Design Reference

`design-prototype/` is the source of truth for visual design — colors, spacing, and component structure. Dark mode is default. Do not deviate from prototype UX patterns when implementing production components.

Full spec: `BPMN_MODELER_PROJECT.md` (1,375 lines) — covers functional requirements, data models, BPMN element catalog, export specs, validation rules, and roadmap.

## Scope Boundaries

**v1.0:** 100% client-side, no backend, no auth. Persistence via IndexedDB only.

**Out of scope until v2.0+:** backend/cloud storage, user auth, real-time collaboration, simulation, versioning, Word/PowerPoint export.
