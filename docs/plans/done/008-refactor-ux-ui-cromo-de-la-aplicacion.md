---
id: PLAN-008
titulo: Refactor UX/UI del cromo de la aplicacion (el modelado BPMN no se toca)
estado: done
creado: 2026-07-27
cerrado: 2026-08-09
aprobado_por: por-determinar
relacionados: [PLAN-007]
---

# Plan de cambios UX/UI — rama `ux-ui-refactory`

> Plan de implementación. Fuente visual = `prototype/mejora-UX-UI-02.html`.
> **El canvas del 02 es solo ilustrativo.** El modelado BPMN real NO se toca.

---

## ⛔ REGLA #1 — El modelado BPMN NO CAMBIA. NADA.

Esto es lo más importante del plan. En los prototipos, de una u otra forma, se
alteró el aspecto del modelado (grid de puntos, colores de shapes, formas). **Eso
fue solo maqueta.** En la implementación real:

- **Colores de shapes** (tareas, eventos, compuertas, pools, carriles, conexiones): **idénticos**.
- **Formas / geometría** de cualquier elemento BPMN: **idénticas**.
- **Cuadrícula del canvas, fondo, render**: **idéntico**.
- **Iconos de la paleta** (representan las formas): **idénticos** en geometría y color.
- **Comportamiento del canvas** (lasso, pan, selección, etiquetas de carril): **idéntico**.
- **Temas del renderer** (cómo bpmn-js pinta claro/oscuro): **idéntico**.

**El cambio es EXCLUSIVAMENTE el cromo alrededor del canvas**: cómo se ordenan y
agrupan las funcionalidades externas (barra superior, paleta como contenedor,
panel derecho como contenedor, Home). El lienzo y su contenido quedan tal cual.

### Archivos PROHIBIDOS (no se editan bajo ninguna circunstancia)

```
src/bpmn/rendering/ThemeColors.ts            ← colores de shapes BPMN
src/bpmn/rendering/ThemeAwareRenderer.ts     ← cómo se pintan los shapes
src/bpmn/rendering/ThemeAwareRendererModule.ts
src/bpmn/canvas/*                            ← lasso, pan, page, selección, carriles
src/bpmn/elements/*                          ← modelos e íconos de badge/enlace
src/bpmn/connections/*                       ← conexiones
src/bpmn/moddle/*                            ← esquema BPMN
src/components/canvas/BpmnCanvas.tsx         ← montaje del modeler (no reestructurar)
src/components/palette/BpmnElementIcon.tsx   ← geometría/color de íconos de shapes
```

> Si algún cambio de layout parece exigir tocar uno de estos, **detenerse y
> replantear** — hay otra forma de lograrlo sin tocar el modelado.

---

## ✅ Regla #2 — Respetar claro/oscuro siempre

Todo el CSS nuevo usa **tokens existentes** (`var(--bg)`, `var(--text)`,
`var(--border)`, `var(--primary)`, etc.) definidos en `src/index.css` para
`:root` (claro) y `[data-theme="dark"]`. **Cero colores hardcodeados.** Ambos
temas deben verse bien; se verifica alternando el toggle.

---

## Alcance de esta rama

Front-end puro. **No** toca base de datos. **No** toca el modelado (Regla #1).

**Se implementa:**
1. Barra superior del editor en 3 zonas + menús **Archivo / Editar / Ver**.
2. Home: navegación lateral (sidebar) + breadcrumb + grid; tarjeta con menú "···"
   en vez de "X"; sin badge "BPMN 2.0" redundante; miniaturas con encuadre uniforme.
3. Panel derecho: se conserva (2 pestañas Propiedades/Comentarios + abrir/cerrar).
4. Zoom flotante abajo-derecha (control externo al canvas, overlay).
5. Paleta: búsqueda primero (ya existe search; solo reordenar el contenedor).
6. Sistema visual del cromo: rejilla 8px, metadatos en cifras tabulares, radios/sombras.
7. Acceso claro a la biblioteca de imágenes (botón visible en Home + `Archivo ▾`).

**Se difiere (NO en esta rama):**
- Carpetas anidadas (`projects.parent_id`) — requiere migración BD.
- Papelera / borrado suave (`deleted_at`) — requiere migración BD.
- Minimapa — no existe; no se agrega.
- Temas personalizables por el usuario — versión futura.

Solo se muestran funcionalidades **que ya existen** en el código. Nada de relleno.

---

## Detalle por área

### A. Barra superior del editor (`src/components/layout/Toolbar.tsx`)

Hoy: una fila con ~18 controles sueltos. Objetivo: **3 zonas**.

- **Izquierda**: marca (`Brand`) + nombre del diagrama (editable) + punto "sin guardar". *(ya existe, se conserva)*
- **Centro**: menús desplegables **Archivo / Editar / Ver** (nuevo componente reutilizable de menú).
- **Derecha**: idioma, tema, notificaciones, presencia, Compartir, **Guardar** (CTA). *(ya existen, se reagrupan)*

**Nuevo componente:** `src/components/layout/MenuBar.tsx` — dropdowns accesibles
(rol `menu`/`menuitem`, `aria-expanded`, cierre por Esc/clic-fuera, hover-switch
entre menús, foco visible). CSS con tokens, claro/oscuro. Botón de menú = **texto
plano** (sin borde/caja), consistente con el resto de la barra.

**Contenido de los menús — solo acciones reales (verificadas en código):**

| Menú | Ítem | Handler existente | Atajo (verificado en `useKeyboard.ts`) |
|------|------|-------------------|------|
| Archivo | Nuevo diagrama | `onNew` | Ctrl N |
| Archivo | Ir a Mis diagramas | `onGoHome` | — |
| Archivo | Importar BPMN… | `onImport` | — |
| Archivo | Exportar BPMN 2.0 (XML) / SVG / PNG | `onExport` → `ExportModal` (formatos reales en `useExport.ts`) | — |
| Archivo | Biblioteca de imágenes… | `onOpenImages` | — |
| Archivo | Guardar | `onSave` | Ctrl S |
| Editar | Deshacer / Rehacer | `onUndo` / `onRedo` | Ctrl Z / Ctrl ⇧ Z |
| Editar | Copiar / Pegar / Eliminar | `editorActions` (copy/paste/removeSelection en `useBpmnModeler.ts`) | Ctrl C / Ctrl V / Supr |
| Editar | Validar diagrama | `onValidate` | Ctrl ⇧ V (o F5) |
| Ver | Acercar / Alejar / Ajustar | `onZoomIn` / `onZoomOut` / `onFitToScreen` | — |
| Ver | Comentarios (toggle) | `commentStore.setPanelOpen` | Ctrl ⇧ C |
| Ver | Panel de propiedades (toggle) | `setPropertiesPanelOpen` | — |
| Ver | Paleta: Principal / Agrupada / Bizagi | `preferencesStore.setPaletteMode` (`grid`/`dropdown`/`bizagi`) | — |

> Nada de Cortar/Duplicar/Seleccionar todo/Cuadrícula/Minimapa: no existen hoy.

### B. Home (`src/components/diagrams/DiagramList.tsx`)

- **Sidebar de navegación** (nuevo, columna izquierda): destinos **Todos /
  Recientes / Compartidos** (reusar `uiStore.diagramListFilter`, ya existe) +
  lista de **Proyectos** con contador (reusar `projects` + `rolesByProject`, ya
  existen). El proyecto activo lleva el indicador de acento.
  - *Sin anidamiento por ahora* (eso es Fase BD). Lista plana, scroll vertical.
- **Breadcrumb** arriba del grid (Inicio ▸ Proyecto).
- **Grid de diagramas**: se conserva; tarjeta refinada.
- **Tarjeta** (`DiagramCard`): quitar la "X" de borrado; menú "···" en hover
  (Abrir / Renombrar / Compartir / Eliminar — solo acciones ya existentes).
  Quitar el badge "BPMN 2.0" redundante. Miniatura con encuadre uniforme.
- **Acceso a imágenes**: botón "Imágenes" visible (ya existe `onOpenImages`/galería).
- **Búsqueda**: se conserva (client-side sobre `diagrams[]`); opcionalmente global.

> El borrado sigue siendo el actual (`deleteDiagram`/`deleteProject`), solo se
> mueve de la "X" al menú "···" con su modal de confirmación (ya existe). No se
> agrega papelera en esta rama.

### C. Panel derecho (`src/components/layout/RightPanel.tsx`)

Ya es correcto: una barra con pestañas **Propiedades | Comentarios** + colapsar a
rail. Se conserva. Solo pulido visual con tokens si hace falta. Abre/cierra normal.

### D. Zoom flotante (overlay externo al canvas)

Control flotante abajo-derecha (acercar/alejar/%/ajustar) como overlay sobre el
área del canvas — **no se toca el canvas**, es un `div` posicionado encima que
llama a los mismos `onZoomIn/onZoomOut/onFitToScreen`. Se quita el `zoom-pill` de
la barra superior. Ubicación: contenedor del canvas en `App.tsx` (el `div` que ya
envuelve `<BpmnCanvas>`), o un componente `CanvasOverlay` hermano — sin tocar
`BpmnCanvas.tsx`.

### E. Paleta (`src/components/palette/PalettePanel.tsx`)

Solo el **contenedor**: búsqueda arriba con foco, categorías con conteo (ya
existe). Los 3 modos se conservan; su selector va discreto. **Los íconos de
elementos NO cambian** (Regla #1).

### F. Sistema visual del cromo (`src/index.css`, solo selectores fuera del canvas)

- Rejilla de 8px, aire entre secciones.
- Metadatos (fechas, conteos, %) en `font-variant-numeric: tabular-nums`.
- Radios/sombras suaves coherentes.
- **Prohibido** tocar selectores que afecten el interior del canvas / `.djs-*` /
  colores de shapes. Solo `.toolbar`, `.home*`, `.sidebar-*`, `.diagram-*`,
  `.menu*`, etc.

---

## Verificación (obligatoria antes de dar por hecho)

1. `npm run build` sin errores de tipos.
2. `npm run lint` limpio.
3. `npm run dev` y comprobar **a ojo**:
   - Abrir un diagrama existente → **el canvas se ve EXACTAMENTE igual** que en
     `main` (mismos colores de shapes, formas, grid). Comparar lado a lado.
   - Alternar tema claro/oscuro en Home y editor → todo el cromo legible en ambos.
   - Menús Archivo/Editar/Ver abren, cada acción dispara su handler real.
   - Guardar / Importar / Exportar / Validar / Imágenes funcionan igual que antes.
   - Home: sidebar navega proyectos y filtros; tarjeta "···" borra con confirmación.
   - Zoom flotante controla el canvas; el % coincide con `uiStore.zoom`.
4. Git diff: confirmar que **ningún archivo de la lista PROHIBIDA** aparece tocado.

---

## Orden de implementación (slices con build entre cada uno)

1. `MenuBar.tsx` + CSS + rewire de `Toolbar.tsx` (3 zonas + menús). → build
2. Zoom flotante overlay + quitar `zoom-pill` de la barra. → build
3. `DiagramList.tsx`: sidebar + breadcrumb + tarjeta "···" + quitar badge. → build
4. Paleta: reordenar contenedor (search-first). → build
5. Barrido de sistema visual en `index.css` (solo cromo). → build + revisión visual
6. Revisión final: diff contra lista PROHIBIDA + comparación de canvas claro/oscuro.

Cada slice: cambio pequeño, `npm run build`, seguir. Nada se mezcla con el modelado.
