---
id: MASTER-PLAN-027
titulo: Modulo de diagramas de arquitectura — segunda familia de diagramas
tipo: master-plan
estado: todo
creado: 2026-08-13
cerrado:
aprobado_por:
progreso: 0/6
agrupa: [PLAN-028, PLAN-029, PLAN-030, PLAN-031, PLAN-032, PLAN-033]
relacionados: [EXP-011, DEC-004, MASTER-PLAN-019, PLAN-005]
---

# MASTER-PLAN-027 · Módulo de diagramas de arquitectura

> Expansión de producto, no corrección. [MASTER-PLAN-018](018-master-plan-auditoria-y-frentes-abiertos.md) arregla lo que existe y [MASTER-PLAN-019](019-master-plan-servidor-autoritativo-de-colaboracion.md) cambia dónde vive la verdad; este añade una **segunda familia de diagramas** y, de paso, la estructura para que exista una tercera y una cuarta.

Los seis sub-planes (PLAN-028 … PLAN-033) se redactan al arrancar cada fase, para no congelar detalle que la fase anterior puede desmentir. Este documento fija los requerimientos, las decisiones y el orden.

## Qué resuelve

`mc-modeler` es hoy un modelador BPMN monolítico: un solo tipo de diagrama cableado de punta a punta. Se quiere modelar **arquitectura de sistemas** —dirigido a desarrollo, no a procesos— sin tocar BPMN.

El objetivo **no** es un draw.io. Es un modelador opinado: catálogo cerrado de objetos con semántica (sistema, RPA, IA/ML, base de datos, API, cola, actor, externo), reglas de qué conecta con qué, plantillas de patrones arquitectónicos, y los mismos gestos de creación rápida que ya funcionan en BPMN.

| | Hoy | Con el módulo |
|---|---|---|
| Tipos de diagrama | 1, cableado | N, registrados |
| Añadir un tipo nuevo | refactor de media app | crear carpeta + seguir plantilla |
| Modelar arquitectura | no se puede | C4 + capa MC, con drill-down |
| Estándar visual | — | catálogo cerrado, personalizable por usuario |

## La restricción no negociable

> **Cero regresión en BPMN.** Ninguna fase se cierra si algo que hoy funciona en el modelador de procesos pasa a funcionar distinto. El refactor de desacople mueve y parametriza; no cambia lógica.

Criterio operativo: la suite de Vitest existente pasa **sin editar aserciones**, y `npm run lint --max-warnings 0` queda verde.

## Decisiones acordadas

| # | Decisión | Estado |
|---|---|---|
| D1 | Notación: **C4 como esqueleto + capa MC propia** (RPA, IA/ML, ERP…). Los patrones (hexagonal, capas, clean, cliente-servidor) son plantillas de layout, **no** notaciones distintas | acordado; C4 se detalla en sesión aparte |
| D2 | Motor: **diagram-js puro**, sin bpmn-js encima | acordado, verificado abajo |
| D3 | Niveles C4: **drill-down** reusando la infra de subprocesos (1 diagrama = 1 nivel) | acordado |
| D4 | Segmentación: **lo más separada posible pero mantenible** → espacios de nivel superior en la UI, carpeta de módulo aislada en código, misma tabla + `kind` en BD | punto de partida, **marcado para replantear** |
| D5 | Formas y colores: preset por defecto **editable por el usuario**, persistido en el **navegador**, no en BD | acordado |
| D6 | Aislamiento = **de carpetas del proyecto**: añadir un tipo nuevo = crear carpeta + seguir plantilla | acordado |
| D7 | v1 = editor + paleta + persistencia + plantillas de patrones. Colaboración en vivo fuera | acordado |

Al aprobar, D1–D7 se registran como DEC-NNN en [`docs/context/decisiones.md`](../../context/decisiones.md).

### Verificación de D2

`diagram-js` **ya está en el árbol** como dependencia de `bpmn-js` v18 — no es dependencia nueva. Todo lo bueno del canvas actual vive ahí, no en bpmn-js:

| Capacidad | Dónde vive | ¿Reusable sin BPMN? |
|---|---|---|
| Routing ortogonal Bizagi | `src/bpmn/connections/BizagiLayouter.ts`, `BizagiDirectionalRouter.ts`, `BizagiConnectionDocking.ts`, `orthogonal.ts` | sí — opera sobre shapes y waypoints genéricos |
| Lasso, pan, scroll, página | `src/bpmn/canvas/*` | sí |
| Undo/redo | `commandStack` de diagram-js | sí |
| Overlays de comentarios y cursores | `src/components/comments/CommentsOverlay.tsx`, `src/components/collab/RemoteCursors.tsx` | sí — usan `overlays`/`canvas`/`elementRegistry` |
| Export SVG | `saveSVG()` de diagram-js | sí |
| Solo-lectura | `src/bpmn/elements/ReadOnlyModule.ts` (veto en `canExecute`) | sí |

Lo único BPMN-específico es el metamodelo (`bpmn-moddle`), el renderer y las reglas. React Flow obligaría a reimplementar routing, colaboración, overlays y export desde cero.

---

## 1. Arquitectura de módulos

Es el corazón del encargo: que conectar o desconectar un tipo de diagrama sea una carpeta y una línea.

### RA-1 · Contrato `DiagramModule`

```ts
interface DiagramModule {
  kind: string                                   // 'bpmn' | 'architecture' | 'erd' | ...
  meta: { label, icon, accent, description }     // identidad visual del espacio
  content: {
    empty(): string
    validate(raw: string): boolean               // hoy: looksLikeBpmn
    normalize?(raw: string): string
    countElements(raw: string): number
  }
  editor: {
    create(container: HTMLElement, opts): DiagramEditorHandle
    thumbnailCrop?(registry): Crop | null
  }
  ui: { Palette: FC, Properties: FC, Toolbar?: FC }
  io: { exportFormats: ExportFormat[], importAccept: string }
  templates?: DiagramTemplate[]
  collab?: { createBinding(doc, editor): Binding }   // sin esto → módulo sin colaboración
}
```

`DiagramEditorHandle` **ya existe de facto**: es `BpmnCanvasHandle` (`src/components/canvas/BpmnCanvas.tsx:16-36`, 18 métodos) más la superficie de retorno de `useBpmnModeler.ts:587-609`. Se extrae, no se inventa.

### RA-2 · Registro y desconexión

```
src/modules/
  index.ts        ← register(bpmnModule); register(architectureModule);   ← 1 línea por módulo
  registry.ts     ← contrato + getModule(kind) + listModules()
  _template/      ← carpeta plantilla comentada: se copia y se renombra
  bpmn/           ← lo existente, movido sin cambios de lógica
  architecture/   ← nuevo, autocontenido
```

**Criterio de aceptación:** borrar `src/modules/architecture/` y su línea en `index.ts` deja la app compilando y comportándose como hoy. Y al revés: copiar `_template/` y añadir una línea hace aparecer un tipo nuevo en la UI sin tocar nada más.

### RA-3 · Puntos de corte del refactor

Ocho, identificados sobre el código actual:

| # | Archivo | Qué cambia |
|---|---|---|
| 1 | `src/domain/types.ts:1-16` | `Diagram` gana `kind: string`; `xml` → `content` con alias temporal |
| 2 | `supabase/migrations/00XX_diagram_kind.sql` | `alter table diagrams add column kind text not null default 'bpmn'` + índice parcial |
| 3 | `src/store/diagramStore.ts:17,28,52,218,246,301,466` | `looksLikeBpmn` / `EMPTY_BPMN` / `normalizeBpmnXml` → `getModule(kind).content.*` |
| 4 | `src/components/canvas/BpmnCanvas.tsx` | → `DiagramCanvas`, resuelve editor por `kind`; `BpmnCanvasHandle` → `DiagramEditorHandle` |
| 5 | `src/hooks/useExport.ts:8,290-301`, `ExportModal.tsx:10-11`, `ImportModal.tsx:96` | catálogo de formatos desde el módulo |
| 6 | `src/utils/thumbnailUtils.ts:21` | `topPoolCrop` pasa a ser hook opcional del módulo BPMN |
| 7 | `src/hooks/useCollab.ts:124` | binding CRDT inyectable — **preparado, no usado en v1** |
| 8 | `src/App.tsx:82,663`, `NewDiagramModal`, `DiagramList.tsx:493` | selección de espacio/tipo y switch de editor en un único punto |

`useAutoSave.ts` ya es agnóstico (recibe callbacks): solo se renombra `getXml` → `getContent`.

---

## 2. UX/UI

### RU-1 · Espacios de nivel superior

Dos espacios: **Procesos** (BPMN) y **Arquitectura**, con cambiador persistente en la home. Señales redundantes para que sea implícito dónde estás:

- **acento de color** por espacio (token `--module-accent`) en barra, botón primario y bordes activos,
- **icono e identidad** en el brand del editor y en el badge de cada tarjeta,
- **textura del lienzo**: BPMN mantiene su grid; arquitectura usa grid de puntos más espaciado,
- **paleta con categorías distintas**, evidente al mirar la barra izquierda.

Filtros, orden, búsqueda, papelera, proyectos, compartir y comentarios se reusan tal cual: `DiagramList.tsx` es agnóstica del contenido (solo usa `name`, `thumbnail`, `elementCount`, `updatedAt`).

### RU-2 · Creación de elementos — los mismos tres gestos que BPMN

1. **arrastrar** desde la paleta,
2. **clic en la paleta** → se coloca y entra en edición de nombre,
3. **context pad** de un elemento existente → crea el siguiente ya conectado y posicionado.

El tercero es el que hace rápido a BPMN hoy y el que más separa esto de draw.io.

Añadidos propios de arquitectura:
- **autocompletar por nombre**: escribir "Postgres" propone el tipo Base de Datos con su icono,
- **conexión tipada en un gesto**: al soltar aparece un selector corto (REST, gRPC, SQL, cola/evento, archivo, SFTP), no un campo libre.

### RU-3 · Reglas de conexión

Matriz de qué conecta con qué y con qué relación: un almacén de datos no origina llamadas, un actor solo conecta con elementos de frontera, una conexión no salta niveles. Se implementa como `RulesModule` de diagram-js, mismo patrón que `src/bpmn/elements/GroupConnectionRulesModule.ts`. **Esto es lo que impide el desorden.**

### RU-4 · Catálogo visual y personalización (D5)

Preset por defecto — **color por naturaleza, forma por rol**:

| Naturaleza | Color | | Rol | Forma |
|---|---|---|---|---|
| Sistema propio | azul | | Componente / servicio | rectángulo redondeado |
| Externo / terceros | gris | | Almacén de datos | cilindro |
| RPA / automatización | morado | | Sistema externo | nube |
| IA / ML | verde azulado | | API expuesta | hexágono |
| Datos / persistencia | verde | | Actor / persona | figura humana |
| Mensajería / eventos | ámbar | | Frontera / capa | banda de fondo translúcido |
| Infraestructura | pizarra | | Cola | rectángulo con banda lateral |

Más icono de tecnología en la esquina. Se lee sin leyenda.

Panel **Apariencia** (por diagrama, con presets globales): opacidad de fondos de capa (por defecto ~12 %, equivalente al `opacity=30` de la skill draw.io ajustado a fondo oscuro), densidad, grosor y estilo de conexión, edición del mapa naturaleza→color y rol→forma, exportar/importar preset como JSON.

**Persistencia: navegador, no BD** (D5). Vía `preferencesStore` → `LocalRepository.savePreferences`, que ya es siempre local (`src/persistence/index.ts`), con clave `architecture.appearance`. Implicación aceptada y explícita: **el preset no viaja entre dispositivos ni entre colaboradores**. El contenido guardado es semántico (tipos); el color se resuelve al renderizar.

### RU-5 · Tema

Mismo mecanismo de hoy: tokens CSS en `:root` / `[data-theme="dark"]`, leídos con `getComputedStyle` (`src/bpmn/rendering/ThemeColors.ts`) y `MutationObserver` sobre `data-theme`. Los tokens `--arch-*` viven dentro del módulo, no en `index.css`.

---

## 3. Modelo — C4 + capa MC

### RM-1 · Metamodelo

Documento JSON versionado, validado con **Zod** — dependencia ya declarada y hoy sin uso.

```
ArchDocument {
  schema: 'mc-arch/1', kind: 'architecture',
  level: 'context' | 'container' | 'component',
  nodes:  [ { id, type, name, technology?, description?, parent?, bounds, links? } ],
  edges:  [ { id, source, target, relation, technology?, label?, waypoints? } ],
  frames: [ { id, name, kind: 'layer'|'boundary'|'group', bounds, style? } ]
}
```

Nodos v1: `system`, `externalSystem`, `person`, `container`, `component`, `datastore`, `queue`, `api`, `rpa`, `ai`, `integration`, `infrastructure`.
Relaciones v1: `sync` (REST/gRPC), `async` (cola/evento), `data` (SQL/archivo), `uses`, `deploys`.

### RM-2 · Drill-down e implicaciones de diseño para exportar

Se reusa la infra de subprocesos: `parentDiagramId` + `subProcessElementId`, doble clic para abrir el hijo, miniatura del hijo, `deleteWithChildren`, pestañas.

Para que un diagrama exportado se lea cómodo:

1. **Un nivel = una página.** Presupuesto blando de 12–15 nodos por diagrama; al superarlo la app sugiere bajar un nivel. Esto evita el póster ilegible típico de draw.io.
2. **Miga de pan impresa** (`Ventas › Contenedores › API`): una hoja suelta no pierde contexto.
3. **Elementos de frontera repetidos**: los vecinos del padre aparecen atenuados en el borde del hijo, para entender qué entra y qué sale sin abrir el padre.
4. **Indicador de profundidad**: un nodo con hijo lleva marca visible (esquina plegada o `⊞`), también impresa — quien lee un PDF sabe que hay más detalle.
5. **Export en cascada**: además del diagrama actual, opción de exportar el árbol completo a PDF multipágina, un nivel por página. Aquí gana el drill-down frente al lienzo anidado.
6. **Página fija por defecto** (A4/A3 horizontal) con guías de margen visibles, en lugar de lienzo infinito: lo que ves es lo que sale impreso.

### RM-3 · Plantillas de patrones

Andamio completo ya conectado y con frames: cliente–servidor · N capas · hexagonal (puertos y adaptadores) · clean architecture (anillos) · microservicios + API gateway · event-driven (bus, productores, consumidores) · integración RPA/IA (fuentes → bot → modelo → destino).

Cada plantilla es un `ArchDocument` parcial más reglas de layout. Se eligen al crear (`NewDiagramModal` gana un paso) o se insertan sobre un lienzo con contenido.

---

## 4. No funcionales

| # | Requisito |
|---|---|
| NF-1 | **Rendimiento**: import de 200 nodos < 300 ms; 60 fps con 300 nodos; el renderer cachea tokens en lugar de llamar `getComputedStyle` por elemento. Medir con `src/utils/perf.ts` y el flag `flujo:perf`, con baseline antes de optimizar |
| NF-2 | **Peso**: carga diferida con `import()` y `manualChunk` propio en `vite.config.ts`. Abrir el espacio Procesos **no** descarga el código de arquitectura |
| NF-3 | **Cero regresión BPMN**: Vitest verde sin editar aserciones; `lint --max-warnings 0` |
| NF-4 | **Seguridad**: sin cambios de RLS — la fila sigue siendo `diagrams` y las políticas actuales aplican igual. `kind` es discriminante, **no** un límite de seguridad; validar contra lista blanca al guardar |
| NF-5 | **i18n**: todo texto nuevo en `es.json`/`en.json` bajo `architecture.*`, dentro del módulo |
| NF-6 | **Accesibilidad**: contraste AA en ambos temas para el preset por defecto; el panel de Apariencia avisa si un color elegido baja de AA |

---

## 5. Fases

| Fase | Sub-plan | Contenido | Puerta |
|---|---|---|---|
| 0 | PLAN-028 | **Contrato y registro de módulos** + refactor de desacople (RA-1, RA-2, RA-3). Sin funcionalidad nueva | cierra solo con la suite verde y BPMN idéntico |
| 1 | PLAN-029 | **Metamodelo y motor**: `ArchDocument` + Zod, `ArchModeler` sobre diagram-js, renderer, reglas de conexión | un diagrama se dibuja, se guarda y se recarga |
| 2 | PLAN-030 | **Paleta y gestos**: los tres gestos, autocompletar, conexión tipada, panel de propiedades | crear un diagrama es más rápido que en draw.io |
| 3 | PLAN-031 | **Espacios y home**: cambiador, acentos, badges, creación con tipo | se sabe sin leer dónde estás |
| 4 | PLAN-032 | **Drill-down, apariencia y export**: niveles C4, panel Apariencia con persistencia local, PNG/SVG/PDF + JSON nativo, miniaturas | un árbol de 3 niveles exporta legible |
| 5 | PLAN-033 | **Plantillas de patrones** | insertar hexagonal deja un andamio usable |

Cada fase debe poder abortarse dejando el sistema como estaba. La fase 0 es la única que toca código BPMN.

## Alcance

**v1** — las seis fases de arriba.

**v1.1** — colaboración en vivo (binding CRDT del metamodelo), comentarios sobre nodos de arquitectura, export PDF en cascada del árbol.

**v2** — import desde draw.io / Structurizr DSL, vista de mapa del árbol de niveles, validación de arquitectura (ciclos, capas saltadas, huérfanos), generación desde código.

**Fuera** — simulación, versionado visual, ArchiMate completo.

## Riesgos

| Riesgo | Mitigación |
|---|---|
| El refactor toca `diagramStore` y `App.tsx`, corazón de la app | fase 0 en commits propios, sin funcionalidad nueva, suite verde antes de empezar el módulo |
| [EXP-011](../../experience/011-perdida-silenciosa-de-cambios-entre-colaboradores.md) sigue activo | colaboración fuera de v1: no se amplifica un bug abierto a un segundo tipo de diagrama |
| MASTER-PLAN-019 rediseñará la capa de colaboración | el binding CRDT queda como punto de extensión sin implementar; se implementa **después** del 019 |
| `kind` en la misma tabla no es la separación "máxima" que se pidió | marcado para replantear; el contrato deja la persistencia detrás del repositorio, así que mover a tabla aparte luego no toca la UI |
| C4 sin detallar | sesión aparte antes de congelar el metamodelo; `schema: 'mc-arch/1'` permite versionar |
| Reusar el routing Bizagi fuera de BPMN puede destapar supuestos ocultos | fase 1 incluye una prueba de humo del router con shapes no-BPMN antes de construir encima |

## Verificación de cierre

1. `npm run test` y `npm run lint` verdes, **sin editar aserciones existentes**.
2. `npm run dev`: crear diagrama BPMN, editar, guardar, exportar, compartir — idéntico a `main`.
3. Crear diagrama de arquitectura desde plantilla hexagonal → los tres gestos funcionan → guardar → recargar → contenido intacto.
4. Drill-down: doble clic en un sistema crea/abre el hijo; borrar el padre arrastra al hijo.
5. Apariencia: cambiar opacidad y color, recargar → persiste; abrir en otro navegador → vuelve el preset por defecto (comportamiento esperado de D5).
6. Export PNG/SVG/PDF en tema claro y oscuro; la miga de pan y el indicador de profundidad salen impresos.
7. **Prueba de desconexión (RA-2)**: borrar `src/modules/architecture/` y su línea en `index.ts` → `npm run build` compila y la app funciona como hoy.
8. NF-1 medido con `flujo:perf` sobre un diagrama sintético de 300 nodos.
