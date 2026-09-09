---
id: PLAN-037
titulo: El navegador de diagramas del editor muestra el proyecto, no la cuenta entera
estado: en-progreso
creado: 2026-09-09
cerrado:
aprobado_por:
relacionados: [PLAN-008, PLAN-012]
---

# El navegador de diagramas del editor muestra el proyecto, no la cuenta entera

El botón de carpeta de la barra de pestañas (`TabsBar.tsx:43-49`, `title="Ver
diagramas del proyecto"`) abre `ProjectView`. **Su título ya dice "del
proyecto"; su código nunca filtró por proyecto.** Muestra `diagrams` entero —
todo lo que el usuario puede ver, de todos sus proyectos y también lo suelto.

Con 104 diagramas eso son 104 tarjetas en un modal de 720 px de alto útil. Y no
hay scroll: **las tarjetas se aplastan a 14,9 px de alto**. Medido, no supuesto
(§2).

Son **dos defectos independientes** que se manifestan juntos:

| # | Defecto | Dónde |
|---|---|---|
| A | El alcance es la cuenta entera, no el proyecto del diagrama abierto | `ProjectView.tsx:24-28` |
| B | En vista cuadrícula el modal no hace scroll: comprime las filas | `index.css:2132-2136` |

Ninguno toca base de datos, ni persistencia, ni colaboración. Es cliente puro:
`diagrams` ya trae `projectId` (`domain/types.ts:7`) y ya está cargado en memoria.

## 1 · Defecto A — el alcance

`ProjectView` filtra solo por texto de búsqueda:

```ts
diagrams.filter((d) => !search || d.name.toLowerCase().includes(...))
```

`App.tsx:547` ya calcula el dato que falta: `activeDiagram()?.projectId ?? null`.
Está ahí desde la Vista Documento (PLAN-034) y sirve exactamente igual aquí.

**Alcance nuevo, decidido con el usuario el 2026-09-09:**

- **Diagrama del proyecto P** → los diagramas cuyo `projectId === P`. Los
  subdiagramas de drill-down entran solos: `createSubDiagram` hereda el
  `projectId` del padre (`diagramStore.ts:277`), así que no hay nada especial
  que hacer con ellos.
- **Diagrama libre** (`projectId === null`) → **su familia**: la raíz de su árbol
  y todos sus descendientes, siempre con `projectId === null`. No todos los libres
  de la cuenta. Decidido por el usuario el 2026-09-09 sobre la pregunta P1: la
  alternativa —solo el diagrama activo— dejaba fuera al padre cuando se baja a un
  subproceso por drill-down.

La cabecera tiene que **decir cuál de los dos casos es**, o el modal miente igual
que antes: con el nombre del proyecto, o "Diagrama libre". Un contador de "1" sin
explicación se lee como un bug.

## 2 · Defecto B — el aplastamiento, y por qué `max-height` no basta

`.pv-content` es a la vez **item flex** con `flex: 1` (altura definida por el
contenedor, que tiene `max-height`) y **contenedor grid** con filas implícitas
`auto`. Cuando las filas no caben, Chrome no desborda: **encoge las filas**.

Lo permite `.pv-grid-card { overflow: hidden }` (`index.css:2140`): un item de
grid con `overflow` distinto de `visible` tiene **tamaño mínimo automático 0**, así
que la fila puede comprimirlo hasta desaparecer. El thumb de 110 px sigue ahí,
recortado por ese mismo `overflow: hidden`.

Reproducido en banco de pruebas con el CSS real de `index.css` (104 tarjetas,
viewport 1440×900, Chromium):

| Variante | Alto de tarjeta | `scrollHeight` / `clientHeight` |
|---|--:|--:|
| como está hoy | **14,9 px** | 720 / 720 — **no hay scroll** |
| `min-height: 0` en `.pv-content` | 14,9 px | 720 / 720 |
| `flex: 1 1 auto` | 14,9 px | 720 / 720 |
| `align-content: start` | 14,9 px | 720 / 720 |
| `align-items: start` | 160,8 px | 850 / 720 — tarjetas superpuestas |
| **`grid-auto-rows: max-content`** | **160,8 px** | **4513 / 720 — scroll real** |

**La vista lista no está afectada** (`.pv-list`, flex en columna): sus filas
miden 49,6 px y el contenido desborda a 5602 px. Un item flex sin `overflow`
propio conserva su mínimo automático, y `.pv-list-row` no lo pierde.

Y el arreglo ya existe en este mismo archivo: **`.diagrams-grid` (el home) lleva
`grid-auto-rows: max-content` desde PLAN-008** (`index.css:1705`). El mismo bug
se resolvió allí y al modal no llegó. Se usa `max-content` por consistencia con
él; `min-content` mide idéntico con estas tarjetas.

### El mismo defecto está latente en la biblioteca de imágenes

`.ig-grid` (`index.css:2617-2619`) es la misma forma: item flex con `flex: 1` +
grid de filas `auto`, y `.ig-card` también lleva `overflow: hidden`
(`index.css:2622`). Su `align-content: start` **no protege** — es justamente la
variante medida que falla. Replicado con 100 tarjetas: **6,6 px de alto, sin
scroll**; con `grid-auto-rows: max-content`, 229,8 px y `scrollHeight` 8307.

Hoy no salta porque ningún proyecto tiene tantas imágenes. Entra en este plan
porque es una línea, el diagnóstico ya está hecho, y volver a diagnosticarlo en
seis meses cuesta la sesión entera.

## 3 · Cambios, archivo por archivo

**1. `src/components/diagrams/projectScope.ts`** — nuevo. Función pura, para que
la regla se pueda probar sin montar React (el repositorio no tiene pruebas de
componentes; sí de utilidades):

```ts
/** Qué diagramas ve el navegador del editor. Ver PLAN-037. */
export function scopeForProjectView(
  diagrams: Diagram[],
  active: { id: string; projectId: string | null } | null
): Diagram[]
```

- `active === null` → `[]` (el modal no se abre sin pestaña activa, pero la
  función no depende de eso).
- `active.projectId !== null` → los de ese proyecto.
- `active.projectId === null` → la familia: sube por `parentDiagramId` hasta la
  raíz y baja recogiendo descendientes, cortando en cualquiera que tenga
  `projectId` (no debería haberlo: `createSubDiagram` hereda) y con guarda de
  ciclos. O(n) sobre `diagrams`, y solo en esta rama.

**2. `src/components/diagrams/ProjectView.tsx`**

- Props nuevas: `scopeProjectId: string | null`, `activeDiagramId: string | null`,
  `projectName: string | null`, `onNewInProject: (projectId: string) => void`.
- `filtered` = `scopeForProjectView(...)` y **después** el filtro de texto y el
  orden por `updatedAt` que ya hay.
- Cabecera: nombre del proyecto, o "Diagrama libre". El contador se queda.
- Buscador: el `placeholder` de hoy es `t('toolbar.myDiagrams') + '...'` →
  "Mis diagramas…", que es precisamente lo que el modal deja de ser.
- FAB: con proyecto, `onNewInProject(scopeProjectId)`; suelto, `onNew()`. Crear
  desde el navegador de un proyecto un diagrama que cae fuera de él sería el
  mismo desajuste otra vez.

**3. `src/App.tsx:974-980`** — pasar el alcance. `activeProjectId` (línea 547) ya
existe; el nombre sale de `projects.find(...)`, y `handleNewInProject` (línea 465)
también existe. No hay estado nuevo.

**4. `src/index.css`**

- `.pv-grid` → `grid-auto-rows: max-content;` con el comentario de por qué
  (`overflow: hidden` en la tarjeta anula su mínimo automático).
- `.ig-grid` → la misma línea.

**5. `src/i18n/es.json` y `en.json`** — bajo `diagrams`:

```
projectView: { scopeFree, searchInProject, emptyProject }
```

Sin claves nuevas para el nombre del proyecto: ese es dato, no texto.

## 4 · Pruebas

`src/components/diagrams/projectScope.test.ts` — Vitest, sin jsdom:

1. proyecto P → devuelve los de P y **ninguno** de Q ni sueltos
2. proyecto P → incluye el subdiagrama con `parentDiagramId` y `projectId = P`
3. libre sin hijos → exactamente un elemento, el activo
4. libre con otros libres sin parentesco → solo su familia, no los demás
5. libre y **activo el subproceso** → devuelve la raíz y sus hermanos (se sube y
   se baja, no solo se baja)
6. árbol con ciclo (`a → b → a`, dato corrupto) → termina y no repite elementos
7. `active === null` → `[]`

Regresión de B: no hay banco de pruebas de CSS en el repositorio y montar uno
para esto no se sostiene. Se verifica a mano en el laboratorio (§5).

## 5 · Verificación en el laboratorio

Antes de dar nada por hecho, con `npm run lab`:

1. Proyecto con ≥ 30 diagramas → el modal **scrollea** y las tarjetas miden su
   alto normal. Comprobable sin ojo: `$0.scrollHeight > $0.clientHeight` sobre
   `.pv-content`.
2. El modal **no** muestra diagramas de otro proyecto ni sueltos.
3. Diagrama libre abierto → una sola tarjeta y la cabecera dice "Diagrama libre".
4. Subproceso abierto por drill-down → el alcance sigue siendo el del proyecto.
5. FAB en un proyecto → el diagrama nuevo nace dentro de ese proyecto.
6. Vista lista → sin cambios de comportamiento.
7. Biblioteca de imágenes con muchas imágenes → scroll, no aplastamiento.
8. **Modo local sin `VITE_SUPABASE_*`** → todo lo anterior funciona (`projectId`
   es `null` en casi todo: el caso "solo ese diagrama" es el normal ahí).

## 6 · Criterios de aceptación

- El modal solo muestra el alcance de §1, y la cabecera lo nombra.
- Con más tarjetas de las que caben, el modal hace scroll y ninguna tarjeta baja
  de su alto natural.
- `npm run lint` y `npm run test` limpios; las 5 pruebas nuevas pasan.
- Sin cambios de esquema, sin migraciones, sin tocar `collab/` ni `persistence/`.
- Modo local intacto.

## 7 · Preguntas abiertas

**P1 · Un diagrama libre con subdiagramas — cerrada el 2026-09-09.** Se muestra
**la familia** (raíz + descendientes), no solo el diagrama activo: bajar a un
subproceso dejaba al padre fuera del modal.

**P2 · ¿Hace falta una vía a "todos los diagramas"?** El home ya la es, y el modal
tiene su botón de cerrar. No se añade conmutador de alcance salvo que se pida.

## 8 · Estado de ejecución — 2026-09-09

**Implementado y verificado en el navegador. Sin commitear** (rama `main`, árbol
sucio; el commit espera al usuario).

Archivos: `projectScope.ts` y `projectScope.test.ts` (nuevos), `ProjectView.tsx`,
`App.tsx`, `index.css`, `i18n/es.json`, `i18n/en.json`.

`npm run lint` limpio, `npx tsc -b` limpio, **427 pruebas en 39 ficheros**
(las 8 nuevas de `scopeForProjectView`; eran 419 en 38).

Verificado con la app corriendo en **modo local** (IndexedDB, sin
`VITE_SUPABASE_*` — por variables de shell vacías, sin tocar `.env.local`),
sembrando 47 diagramas: 40 en un proyecto, 3 en otro, y una familia suelta
(raíz + 2 subprocesos) más un suelto sin parentesco:

| Comprobación | Resultado |
|---|---|
| abierto un diagrama del proyecto | 40 tarjetas, **ninguna** de otro proyecto ni suelta |
| cabecera | "Proyecto Ventas · 40", con icono de carpeta |
| aplastamiento | tarjetas de **164,9 px**; `scrollHeight` 1789 > `clientHeight` 720 → **scroll real** |
| abierto un **subproceso suelto** | 3 tarjetas: la raíz y sus dos hijos; el suelto ajeno **fuera** |
| cabecera del caso suelto | "Diagrama libre · 3", buscador "Buscar en este diagrama…" |
| vista lista | sin cambios (filas de 49,6 px) y con el mismo alcance |
| FAB dentro de un proyecto | el diagrama nuevo nace con `projectId` del proyecto (comprobado en IndexedDB) |
| modo local | todo lo anterior **es** el modo local |

Dos cosas que se apartaron de lo escrito, ambas a más:

1. **Cabecera con proyecto pero sin nombre.** Salió durante la verificación: si
   `projectId` está y su fila de `projects` no —un proyecto compartido que aún no
   ha llegado— la cabecera decía "Diagrama libre", que es falso. Ahora dice
   "Diagramas del proyecto" (clave `scopeProject`). El icono y el buscador
   dependen también de `scopeProjectId`, no del nombre.
2. **Los textos del estado vacío** ("Sin resultados" / "No hay diagramas aún")
   estaban en español a pelo en el JSX; se movieron a i18n al tocar el bloque.

**Lo que falta para poder cerrar el plan:**

- El visto bueno visual del usuario.
- `.ig-grid` está arreglado y **medido en banco** (6,6 px → 229,8 px de alto de
  tarjeta), pero **no verificado en la app**: sembrar 100 imágenes en la
  biblioteca pedía el laboratorio con Docker, que no estaba levantado.
- Aprobación explícita de cierre.

## 9 · Fuera de alcance

- Tocar el tamaño de las tarjetas o el `minmax(180px, 1fr)` de la cuadrícula. Con
  el alcance por proyecto la queja de "salen super pequeños" se cae por sí sola;
  si sigue molestando, es otro cambio y otra decisión.
- Paginación o virtualización. Con el alcance corregido no hay volumen que la
  justifique, y `diagrams` ya está entero en memoria: no ahorraría ni una consulta.
- La vista de lista y el home.
