---
id: PLAN-007
titulo: Propuesta de rediseno UX/UI
estado: done
creado: 2026-07-27
cerrado: 2026-08-09
aprobado_por: por-determinar
relacionados: [PLAN-008]
---

# Propuesta UX/UI — Modeler

> Documento de propuesta. **No implementa nada.** Sirve para decidir dirección antes de tocar código.
> Fecha: 2026-07-27 · Alcance: vista Home (Diagramas) + Modelador. Meta: limpio, fresco, cómodo, ágil — nivel draw.io / Figma.

---

## 1. Contexto

Estado real (leído del código, no del prototipo):

- **Home** = `src/components/diagrams/DiagramList.tsx`. Proyectos como tarjetas planas que envuelven (`.projects-row`), y debajo una cuadrícula de diagramas (`.diagrams-grid`). 9 proyectos ya ocupan 2 filas y empujan el contenido; 79 diagramas en una sola grilla.
- **Modelador** = `src/components/layout/Toolbar.tsx` (una sola fila con ~18 controles) + `src/components/palette/PalettePanel.tsx` (3 modos: grid / agrupada / bizagi) + tabs + panel derecho + status bar.
- **Identidad actual** (`src/index.css`): primario indigo `#4f46e5`, acento violeta `#8b5cf6`, escala de grises, **modo oscuro por defecto**, radios 6/8/12.

El problema central que planteas: **las carpetas de proyectos no escalan** y ambas pantallas se sienten densas. La identidad indigo/violeta es buena — no se tira, se **afina con más restricción**.

---

## 2. Diagnóstico

### 2.1 Home

| # | Problema | Dónde | Impacto |
|---|----------|-------|---------|
| H1 | Proyectos en fila que envuelve — no escala. A 20+ carpetas la pantalla es un muro de tarjetas antes de ver un solo diagrama. | `DiagramList.tsx:187-208` | Alto |
| H2 | Ícono de basura inline en la tarjeta de proyecto (dueño). Ruido visual + borrado accidental. | `DiagramList.tsx:196-204` | Medio |
| H3 | Botón "X" en cada tarjeta de diagrama para borrar. Se confunde con "cerrar"; borrado accidental. | `DiagramList.tsx:436-445` | Medio |
| H4 | No hay jerarquía: proyectos no anidan, no hay "sin carpeta" claro, no hay papelera. | modelo `Diagram.projectId` plano | Alto |
| H5 | Split cognitivo: proyectos arriba + diagramas abajo compiten por la misma pantalla. | layout | Medio |
| H6 | Búsqueda solo dentro del ámbito actual; no hay búsqueda global. | `DiagramList.tsx:78` | Medio |
| H7 | Miniaturas con zoom/encuadre inconsistente entre tarjetas. | thumbnails | Bajo |
| H8 | Densidad plana: todo pesa igual, sin ritmo tipográfico ni de espaciado. | CSS | Medio |

### 2.2 Modelador

| # | Problema | Dónde | Impacto |
|---|----------|-------|---------|
| M1 | Toolbar = una sola fila con ~18 acciones (marca, nombre, nuevo, importar, exportar, validar, comentar, imagen, deshacer/rehacer, zoom, idioma, tema, notif, presencia, compartir, guardar, salir). Cansa de leer. | `Toolbar.tsx:75-224` | Alto |
| M2 | Zoom en la barra superior. El patrón canónico (Figma, draw.io, Miro) es **zoom flotante abajo-derecha**. Libera la barra y queda a la mano. | `Toolbar.tsx:151-162` | Medio |
| M3 | Acciones de archivo (importar/exportar/validar/imágenes) mezcladas con acciones de edición y de sesión — sin agrupación visual real. | `Toolbar.tsx:108-138` | Medio |
| M4 | Paleta con 3 modos configurables — potente, pero la de por defecto (grid) empuja mucho scroll; búsqueda no es lo primero. | `PalettePanel.tsx` | Bajo |
| M5 | El lienzo (el protagonista) compite con demasiado cromo alrededor. | layout | Medio |
| M6 | Panel derecho (propiedades/comentarios) arranca colapsado y sin señal clara de qué revela. | `RightPanel.tsx` | Bajo |

---

## 3. Sistema visual refinado

No se reinventa la marca. Se le da **disciplina** para que respire.

### 3.1 Color — gastar el color en un solo lugar

El indigo/violeta se usa hoy en marca (degradado), CTA, estados activos, badges. Demasiados frentes. Regla nueva:

- **Indigo `#4f46e5` = solo acción primaria + estado activo.** Nada más.
- Degradado indigo→violeta **solo** en la marca (logo) y como acento de 2px en indicadores activos (el "flow rail", ver 3.4). No en botones ni fondos de tarjeta.
- Todo lo demás vive en la escala de grises que ya existe. El color se vuelve señal, no decoración.

Tokens nuevos sugeridos (aditivos, no rompen los actuales):

```
--surface-hover   (bg-2 hoy)      superficie interactiva en hover
--ring            primary @ 40%   anillo de foco accesible
--flow-accent     linear-gradient(90deg, #4f46e5, #8b5cf6)  solo indicadores activos
--canvas-bg       #f7f8fa / dark #0d0f14   fondo de lienzo, más neutro que la app
```

### 3.2 Tipografía — dar personalidad sin ruido

Hoy es la fuente del sistema, plana. Propuesta con **restricción** (es una herramienta, no una landing):

- **Cuerpo / UI**: `Inter` (o `Geist`) — legible, familiar en herramientas.
- **Firma tipográfica (el toque):** metadatos técnicos —conteo de elementos, fechas, zoom, %— en **cifras tabulares** (`font-variant-numeric: tabular-nums`) y una mono discreta (`Geist Mono` / `JetBrains Mono`). Da una sensación *precisa, de ingeniería*, coherente con modelar procesos. Es sutil pero es lo que diferencia de "otra app con Inter".
- Escala clara: `28/20/16/14/13/12`, títulos con `letter-spacing: -0.01em`, peso 600 en encabezados, 500 en labels.

### 3.3 Espaciado y forma

- Rejilla de **8px** estricta. Aire entre secciones (24–32px), no 12px por todos lados.
- Tarjetas: radio **12px**, sombra suave de 1 capa, borde hairline `--border`. Nada de sombras dobles.
- Densidad con ritmo: encabezado grande → filtros discretos → contenido. No todo del mismo peso.

### 3.4 Firma — el "flow rail"

El elemento que se recuerda, coherente con el tema (procesos BPMN = nodos + conexiones):

- Un **indicador activo tipo conector**: un punto + línea de 2px con el degradado indigo→violeta, usado en el ítem activo del sidebar y en estados vacíos. Evoca un flujo de secuencia BPMN.
- En estados vacíos ("no hay diagramas aún"): un mini-flujo fantasma (inicio → tarea → fin) dibujado en hairline como invitación a crear. No es decoración: **enseña el producto en el hueco**.

Se gasta la audacia **aquí** y se mantiene todo lo demás quieto.

---

## 4. Home — arquitectura de carpetas escalable

El corazón de tu pregunta. Tres opciones; recomiendo la C.

### Opción A — Rail horizontal + página de proyectos
Mantener las tarjetas de proyecto pero en scroll horizontal con "Ver todos" → página dedicada.
*Barato, pero solo pospone el problema de escala.*

### Opción B — Sidebar de navegación (Figma / Drive)
Barra izquierda fija con navegación + carpetas anidables; el contenido a la derecha.
*Escala bien, es el patrón que la gente ya conoce de Drive/Figma.*

### Opción C — Sidebar + breadcrumb + grid (RECOMENDADA)
Híbrido: sidebar para **navegar** (rápido, siempre visible), breadcrumb para **ubicarte**, grid para **el contenido**. Es lo que hacen draw.io/Figma/Notion y escala a cientos de carpetas.

```
┌──────────────────────────────────────────────────────────────────────┐
│  [◆ Modeler]                      [ Buscar en todo…  ⌘K ]   ES/EN 🌙 ⏻ │  ← topbar global
├───────────────┬──────────────────────────────────────────────────────┤
│ ● Todos    79 │  Inicio ▸ AFV 2.0                          [+ Nuevo ▾] │  ← breadcrumb + acción
│ ◷ Recientes   │                                                        │
│ ⇄ Compartidos²│  ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐                      │
│ 🗑 Papelera    │  │  +  │ │thumb│ │thumb│ │thumb│   ← crear + diagramas │
│               │  └─────┘ └─────┘ └─────┘ └─────┘                      │
│ PROYECTOS   + │  ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐                      │
│ ▸ AFV 2.0  21 │  │thumb│ │thumb│ │thumb│ │thumb│                      │
│ ▸ CEDI     11 │  └─────┘ └─────┘ └─────┘ └─────┘                      │
│ ▾ Ventas    7 │                                                        │
│    · Admin  4 │   [ Ordenar: Última modificación ▾ ]   [ ▦ grid / ☰ ] │
│    · Retail 3 │                                                        │
│ ▸ Mejora C. 6 │                                                        │
│ … +5 más      │                                                        │
└───────────────┴──────────────────────────────────────────────────────┘
```

**Por qué escala:**
- Los proyectos ya **no compiten** con los diagramas por el espacio horizontal — viven en una lista vertical que hace scroll natural y colapsa.
- Anidamiento (`▸/▾`) → sub-carpetas. Requiere `parentId` en el modelo de proyecto (hoy plano).
- Contadores a la derecha alineados; el activo lleva el "flow rail".
- Búsqueda global (`⌘K`) sobre todos los ámbitos, no solo el actual → resuelve H6.
- "Todos / Recientes / Compartidos / Papelera" pasan de píldoras a **destinos de navegación** persistentes.

**Cambios de comportamiento asociados:**
- **Borrado → Papelera** (soft delete) en vez de X inline. Resuelve H2 y H3 (borrado accidental). La X de la tarjeta se va; el borrado vive en el menú "···" al hacer hover o en la Papelera.
- **Mover diagrama a carpeta**: arrastrar a la carpeta del sidebar, o menú "···" → "Mover a…".
- Tarjeta de diagrama: hover revela un solo menú "···" (abrir / renombrar / duplicar / mover / compartir / eliminar). Una acción destructiva, no expuesta por defecto.

### 4.1 Tarjeta de diagrama refinada

```
┌───────────────────────┐
│  [Puede editar]    ···│  ← badge de rol (si aplica) + menú discreto en hover
│ ┌───────────────────┐ │
│ │  miniatura         │ │  ← encuadre uniforme, "fit" consistente, fondo --canvas-bg
│ └───────────────────┘ │
│ Proceso de Venta       │  ← nombre, peso 600
│ hace 3 días · 24 elem. │  ← metadatos en cifras tabulares (mono discreta)
└───────────────────────┘
```
- Fuera el badge "BPMN 2.0" en cada tarjeta (redundante, todo es BPMN 2.0). Se muestra una vez en el header o en el status bar del editor.
- Miniatura con encuadre "fit" uniforme → resuelve H7.

### 4.2 Estado vacío (firma en acción)
Carpeta sin diagramas → mini-flujo fantasma (○ → ▢ → ◉) en hairline + "Crea tu primer diagrama". Enseña BPMN en el hueco.

---

## 5. Modelador — orden y calma

Meta: **el lienzo manda**. El cromo se reduce, se agrupa y se saca de la barra superior lo que no es de sesión.

### 5.1 Reorganizar la toolbar en 3 zonas

```
┌────────────────────────────────────────────────────────────────────────────┐
│ ◆ Modeler │ 🗂 Negociación Especial ●   │              [ES/EN] 🌙 🔔 👥 ⤴ Compartir  💾 Guardar │
│           │ Archivo ▾   Editar ▾   Ver ▾ │                                                        │
└────────────────────────────────────────────────────────────────────────────┘
   IZQUIERDA            CENTRO (menús)                    DERECHA (sesión/colab)
   identidad+doc        acciones agrupadas                 lo social + guardar
```

- **Izquierda**: marca + nombre del diagrama (editable) + punto de "sin guardar". Identidad y ubicación.
- **Centro**: menús compactos que **agrupan** lo que hoy son 8 íconos sueltos —
  - `Archivo ▾`: Nuevo · Importar · Exportar · Imágenes
  - `Editar ▾`: Deshacer · Rehacer · Validar
  - `Ver ▾`: Tema · Idioma · Paneles
  Resuelve M1 y M3. (Alternativa más ligera: mantener íconos pero en grupos con separadores reales y etiquetas al hover.)
- **Derecha**: idioma, tema, notificaciones, presencia, Compartir, **Guardar** (CTA, único indigo). Lo de sesión/colaboración junto.

### 5.2 Zoom y navegación → flotante abajo-derecha (patrón canónico)

```
                                                   lienzo
                                          ┌───────────────────┐
                                          │                   │
                                          │                   │
                                          │        ▢ minimap  │
                                          │  ┌──────────────┐ │
                                          │  │ − 30% + ⤢ 🗺 │ │  ← control flotante
                                          └──┴──────────────┴─┘
```
Saca el zoom de la barra superior (M2). Añade minimapa opcional para diagramas grandes como el de la imagen (muy útil con procesos de 40+ nodos).

### 5.3 Paleta — búsqueda primero, rail colapsable

- Búsqueda arriba del todo, con foco al abrir. Escribes "gateway" y filtras — más rápido que scroll por categorías.
- Categorías con conteo (ya existe) pero colapsadas por memoria de uso.
- Colapsada = rail de íconos con tooltip; hoy ya hay `collapsed-rail`, se pule.
- Los 3 modos (grid/agrupada/bizagi) se quedan — son buena feature — pero el selector pasa a `Ver ▾` o a un engranaje discreto, no compite.

### 5.4 Lienzo

- Fondo propio `--canvas-bg`, ligeramente distinto de la app, para que el diagrama "flote".
- Rejilla de puntos más sutil.
- Panel derecho: se abre **al seleccionar** un elemento (contextual), con transición suave; encabezado que diga qué muestra ("Propiedades — Tarea").

---

## 6. Roadmap sugerido (de barato a estructural)

**Fase 1 — Quick wins (solo CSS/markup, sin modelo):**
1. Disciplina de color + espaciado 8px + radios/sombras (§3.1, §3.3).
2. Tarjeta de diagrama: fuera "X" y badge redundante, menú "···" en hover (§4.1).
3. Zoom flotante abajo-derecha (§5.2).
4. Toolbar agrupada en 3 zonas (§5.1, versión de íconos+separadores).
5. Estados vacíos con el mini-flujo (§3.4, §4.2).

**Fase 2 — Navegación escalable (toca layout, no BD):**
6. Sidebar de navegación + breadcrumb + búsqueda global `⌘K` (§4).
7. Menús Archivo/Editar/Ver en toolbar (§5.1).
8. Paleta búsqueda-primero + minimapa (§5.3, §5.2).

**Fase 3 — Modelo de datos (toca Supabase):**
9. `parentId` en proyectos → carpetas anidadas.
10. Soft delete → Papelera (`deletedAt`), con restaurar/vaciar.
11. Mover diagrama entre carpetas (drag / "Mover a…").

Fase 1 sola ya se ve notablemente más limpia sin tocar backend.

---

## 7. Cómo medir que funcionó

- Encontrar un diagrama concreto entre 79: menos clics / scroll (búsqueda global + sidebar).
- Crear/abrir carpeta y navegar 3 niveles sin que la pantalla se llene de tarjetas.
- Barra del modelador legible de un vistazo (3 zonas, no 18 íconos en fila).
- Cero borrados accidentales (papelera en vez de X).
- "Se siente limpio/fresco" — lienzo protagonista, color como señal, no como ruido.

---

## 8. Decisiones abiertas para ti

1. **Navegación**: ¿Opción C (sidebar) — recomendada — u Opción A (rail + página)?
2. **Toolbar**: ¿menús `Archivo/Editar/Ver` (más limpio) o íconos agrupados con separadores (menos cambio)?
3. **Tipografía**: ¿adoptamos Inter + mono para metadatos, o nos quedamos con la fuente del sistema?
4. ¿Hasta qué fase quieres llegar ahora? (Fase 1 no toca backend.)

---

## 9. Viabilidad e impacto en el proyecto actual

**Regla dura confirmada:** el **canvas y las shapes NO se tocan**. Todo el render BPMN (canvas, shapes, pools, carriles, conexiones) es bpmn-js y queda **idéntico**. La propuesta vive **fuera del canvas**: cómo se ordenan y estructuran las cosas alrededor (Home, toolbar, paneles, tarjetas).

### 9.1 Clasificación de cada cambio

🟢 = solo front-end (0 BD, 0 canvas), viable ya · 🟡 = migración BD aditiva (bajo riesgo) · 🔵 = dependencia nueva opcional

| Cambio | Tipo | Qué archivo toca | ¿Dato ya en BD? |
|--------|------|------------------|------------------|
| Disciplina visual (color/espaciado/tipografía/mono) | 🟢 | `src/index.css` | n/a |
| Tarjeta: menú “···” en vez de “X”, sin badge BPMN, thumbs uniformes | 🟢 | `DiagramList.tsx` | `thumbnail` ya existe |
| Toolbar en 3 zonas + menús Archivo/Editar/Ver | 🟢 | `Toolbar.tsx` | n/a |
| Zoom flotante abajo-derecha | 🟢 | layout editor; `zoom` ya en `uiStore` | n/a |
| Panel derecho abrir/cerrar + pestañas Propiedades/Comentarios | 🟢 **ya existe** | `RightPanel.tsx` | comentarios ya en BD |
| Paleta búsqueda-primero | 🟢 | `PalettePanel.tsx` | n/a |
| Sidebar de navegación Home (Todos/Recientes/Compartidos + proyectos) | 🟢 | `DiagramList.tsx` (filtros ya existen) | proyectos y roles ya en BD |
| Búsqueda global ⌘K | 🟢 | client-side sobre `diagrams[]` ya cargado | n/a |
| Acceso a biblioteca de imágenes | 🟢 **ya existe** | botón Home + `Archivo ▾` | `LibraryImage` ya en BD (mig. 0016/0017) |
| Mover diagrama entre carpetas | 🟢 | UI drag/“Mover a…”; `projectId` ya existe | **sí**, `projectId` ya en BD → sin migración |
| Estados vacíos con mini-flujo | 🟢 | UI | n/a |
| Minimapa en el editor | 🔵 | dep `diagram-js-minimap` (no instalada) | n/a |
| **Carpetas anidadas** (sub-proyectos) | 🟡 | `projects.parent_id` + UI árbol | **no** — falta columna aditiva |
| **Papelera** (borrado suave + restaurar) | 🟡 | `deleted_at` en diagramas/proyectos + UI | **no** — hoy `deleteDiagram/deleteProject` borran duro |

### 9.2 Veredicto

- **~85–90 % del rediseño es puro front-end.** No toca canvas, ni bpmn-js, ni base de datos. Se puede hacer ya (Fases 1 y 2 del §6).
- **Solo 2 features tocan la BD**, y ambas son **columnas aditivas de bajo riesgo** (Fase 3):
  1. Carpetas anidadas → `parent_id` en `projects` (+ consulta recursiva para el árbol).
  2. Papelera → `deleted_at` en `diagrams` y `projects` (+ filtrar y restaurar). Reemplaza el borrado duro actual, lo cual además es **más seguro** (evita pérdidas accidentales, tu preocupación H2/H3).
- **1 dependencia opcional:** `diagram-js-minimap` para el minimapa. Prescindible en v1.
- **Nada** obliga a tocar el modelador BPMN interno.

### 9.3 Lo que YA está en BD y se recicla (no se reconstruye)

- Proyectos + roles/colaboración (`projects`, mig. 0007) → la lista/árbol del sidebar.
- Filtros Todos/Recientes/Propios/Compartidos (`uiStore.diagramListFilter`) → destinos de navegación.
- Comentarios e hilos (`commentStore`, mig. 0008/0015) → panel derecho pestaña Comentarios + pines.
- Biblioteca de imágenes (`LibraryImage`, `ImageFolder`, mig. 0016/0017) → botón “Imágenes”, badge en elemento, vínculo `flujo:linkedImages`.
- Miniaturas (`diagram.thumbnail`), conteo de elementos (`elementCount`), fechas → tarjetas.

Conclusión: **viable**. El grueso es reorganización visual sobre datos que ya existen. La BD solo crece con 2 columnas opcionales cuando quieras carpetas anidadas y papelera.
