# Flujo — BPMN Web Modeler — Documento de Proyecto Completo
> Versión 1.3 — Referencia para Claude Code y equipo de desarrollo  
> Última actualización: 2026-04-25  
> Desarrollador: individual (un solo desarrollador)  
> Nombre del producto: **Flujo**  
> Referencia de diseño: carpeta `design-prototype/` en la raíz del proyecto

> ⚠️ **INSTRUCCIÓN CRÍTICA PARA CLAUDE CODE — DISEÑO VISUAL:**  
> La carpeta `design-prototype/` contiene los archivos HTML/CSS/SVG generados por Claude Design.  
> **Antes de crear cualquier componente, definir cualquier color, espaciado, tipografía o token de diseño, Claude Code DEBE leer los archivos de esa carpeta y extraer los valores exactos.**  
> No inventar ni aproximar valores visuales. Si un color, radio de borde, sombra o espaciado no está en el prototipo, preguntar antes de asumir.  
> Los archivos en `design-prototype/` son la fuente de verdad para todo lo visual. El resto de este documento describe arquitectura, requisitos y comportamiento — no sustituye al prototipo para decisiones de UI.

---

## Índice

1. [Contexto y Visión del Producto](#1-contexto-y-visión-del-producto)
2. [Decisiones Estratégicas Tomadas](#2-decisiones-estratégicas-tomadas)
3. [Alcance del MVP](#3-alcance-del-mvp)
4. [Requisitos Funcionales](#4-requisitos-funcionales)
5. [Requisitos No Funcionales](#5-requisitos-no-funcionales)
6. [Reglas de Negocio](#6-reglas-de-negocio)
7. [Arquitectura de Software](#7-arquitectura-de-software)
8. [Estructura de Directorios](#8-estructura-de-directorios)
9. [Stack Tecnológico y Dependencias](#9-stack-tecnológico-y-dependencias)
10. [Modelo de Datos](#10-modelo-de-datos)
11. [Diseño de Interfaz — Guía UX](#11-diseño-de-interfaz--guía-ux)
12. [Elementos BPMN Soportados](#12-elementos-bpmn-soportados)
13. [Módulos y Responsabilidades](#13-módulos-y-responsabilidades)
14. [Flujos de Usuario Principales](#14-flujos-de-usuario-principales)
15. [Internacionalización](#15-internacionalización)
16. [Persistencia y Almacenamiento](#16-persistencia-y-almacenamiento)
17. [Exportación](#17-exportación)
18. [Manejo de Errores](#18-manejo-de-errores)
19. [Testing](#19-testing)
20. [Convenciones de Código](#20-convenciones-de-código)
21. [Roadmap por Fases](#21-roadmap-por-fases)
22. [Restricciones y Lo que NO se Debe Hacer](#22-restricciones-y-lo-que-no-se-debe-hacer)

---

## 1. Contexto y Visión del Producto

### 1.1 Qué es este proyecto

Una herramienta web de modelado de procesos de negocio (BPM) que implementa el estándar **BPMN 2.0** (Business Process Model and Notation). Funciona completamente en el navegador, sin instalación, sin backend, sin costo para el usuario final.

La referencia de experiencia de usuario es **Bizagi Modeler** (herramienta de escritorio Windows). Se replica la **experiencia de uso (UX)** — flujos de trabajo, disposición de paneles, comportamientos esperados — pero **no la interfaz visual propietaria (UI)** de Bizagi.

### 1.2 Por qué existe

Bizagi Modeler no tiene cliente nativo para macOS. La versión web de Bizagi es inconsistente en disponibilidad. Las alternativas gratuitas (Camunda Modeler) requieren instalación de escritorio. Este producto cubre ese hueco: **modelado BPMN 2.0 completo, gratuito, que funciona en cualquier sistema operativo desde el navegador**.

### 1.3 Usuario objetivo

- Analistas de negocio y procesos
- Consultores BPM
- Estudiantes y académicos de procesos
- Equipos de transformación digital
- Cualquier persona que necesite documentar procesos visualmente sin instalar software

### 1.4 Propuesta de valor diferenciadora

- Cero instalación, funciona en Mac, Windows, Linux
- 100% gratuito, sin registro obligatorio
- BPMN 2.0 estricto y validado
- **Interoperabilidad total: los archivos `.bpmn` de Flujo se abren en Bizagi, Camunda y cualquier herramienta compatible con el estándar OMG, y viceversa**
- Exportación a BPMN 2.0 XML, PDF e imágenes
- Interfaz limpia y moderna, mejor que las alternativas gratuitas actuales
- Español e inglés desde el primer día

---

## 2. Decisiones Estratégicas Tomadas

Estas decisiones están **cerradas**. No requieren evaluación adicional durante el desarrollo.

| Decisión | Elección | Razón |
|---|---|---|
| Librería de diagramación | **bpmn-js v18** | BPMN 2.0 certificado, mantenido por Camunda, MIT |
| Framework UI | **React 19 + TypeScript** | Ecosistema maduro, tipado estricto |
| Build tool | **Vite** | DX superior, HMR instantáneo |
| Estilos | **Tailwind CSS v4** | Utilidades, sin conflictos con bpmn-js |
| Estado global | **Zustand** | Simple, sin boilerplate, ideal para estado de canvas |
| Componentes UI | **shadcn/ui + Radix UI** | Accesibles, sin opinionated styles, fácil override |
| Persistencia | **Patrón Repositorio + localforage** | 100% cliente en v1.0; intercambiable por API REST sin tocar UI ni stores |
| Preparación backend | **Interfaces `IDiagramRepository`** | La capa de datos está abstraída; agregar backend = nueva implementación de la interfaz |
| Idiomas | **Español + Inglés (i18next)** | Desde v1.0 |
| Validación de datos | **Zod** | Schemas para modelos de datos internos |
| Iconos | **Lucide React** | Consistente, tree-shakeable |
| Exportación PDF | **jsPDF + html-to-image** | Genera PDF desde el canvas renderizado |
| Exportación imagen | **html-to-image** | PNG y SVG desde el DOM |
| Backend | **Ninguno en v1.0** | 100% cliente |

---

## 3. Alcance del MVP

### 3.1 Incluido en v1.0

- Canvas BPMN 2.0 completo con todos los elementos del estándar
- Panel de propiedades de elementos
- Swimlanes (pools y lanes)
- Toolbar con paleta de elementos BPMN
- Undo / Redo ilimitado
- Zoom y navegación en el canvas
- Guardar diagrama en localStorage (persistencia automática)
- Gestión de múltiples diagramas (lista/galería con thumbnails y búsqueda)
- **Importar archivo `.bpmn` desde Bizagi, Camunda o cualquier herramienta BPMN estándar**
- **Exportar a BPMN 2.0 XML compatible con Bizagi Modeler y Camunda**
- Exportar a PNG (1x, 2x, 3x)
- Exportar a SVG
- Exportar a PDF
- Interfaz en español e inglés
- Modo oscuro y modo claro
- Validación básica BPMN (elementos requeridos, conexiones inválidas)

### 3.2 Explícitamente fuera de v1.0

- Versioning de diagramas (v1.0, v2.3, etc.) — Fase 2
- Estados publicado / en revisión / borrador compartido — Fase 2 (con backend)
- Simulación de procesos (tiempos, costos, recursos) — Fase 2
- Backend / almacenamiento en nube — Fase 2
- Colaboración en tiempo real — Fase 3
- Exportación a Word/PowerPoint — Fase 2
- Autenticación y usuarios — Fase 2
- Comentarios y anotaciones colaborativas — Fase 3
- Sistema de temas/personalizaciones de comunidad — Fase 3

---

## 4. Requisitos Funcionales

### RF-01: Canvas de Modelado

- **RF-01.1** El usuario puede arrastrar elementos desde la paleta al canvas
- **RF-01.2** El usuario puede mover elementos ya colocados en el canvas
- **RF-01.3** El usuario puede conectar elementos mediante flujos de secuencia
- **RF-01.4** El usuario puede conectar elementos de diferentes pools mediante flujos de mensaje
- **RF-01.5** El usuario puede redimensionar elementos que lo permitan (pools, lanes, subprocesos)
- **RF-01.6** El usuario puede seleccionar múltiples elementos (click + drag, o Ctrl/Cmd + click)
- **RF-01.7** El usuario puede copiar, cortar y pegar elementos (Ctrl/Cmd + C/X/V)
- **RF-01.8** El usuario puede eliminar elementos seleccionados (Delete / Backspace)
- **RF-01.9** El canvas soporta zoom entre 25% y 400% (rueda del mouse, botones, Ctrl+0 para reset)
- **RF-01.10** El canvas soporta navegación por pan (espacio + drag, o drag en área vacía)
- **RF-01.11** El canvas tiene una cuadrícula visual opcional (snap to grid configurable: 5px, 10px, 20px)
- **RF-01.12** Los elementos se alinean con guías automáticas al moverlos (smart guides)

### RF-02: Panel de Propiedades

- **RF-02.1** Al seleccionar un elemento, el panel lateral derecho muestra sus propiedades editables
- **RF-02.2** Propiedades comunes a todos los elementos: `id` (solo lectura), `name` (editable), `documentation` (texto largo, editable)
- **RF-02.3** Propiedades específicas por tipo de elemento (ver sección 12)
- **RF-02.4** El panel muestra "Sin selección" cuando no hay elemento activo
- **RF-02.5** Los cambios en el panel se reflejan en el canvas en tiempo real (sin botón guardar)
- **RF-02.6** El panel es colapsable/expandible

### RF-03: Paleta de Elementos

- **RF-03.1** La paleta está fija en el lado izquierdo del canvas
- **RF-03.2** Los elementos están agrupados por categoría: Eventos, Actividades, Compuertas, Conexiones, Contenedores
- **RF-03.3** Cada elemento en la paleta muestra un ícono BPMN estándar y una etiqueta
- **RF-03.4** La paleta es colapsable para maximizar el canvas
- **RF-03.5** Al hacer hover sobre un elemento de la paleta, aparece un tooltip con nombre y descripción breve

### RF-04: Gestión de Diagramas

- **RF-04.1** El usuario puede crear un nuevo diagrama (con nombre)
- **RF-04.2** El usuario puede ver la lista de diagramas guardados
- **RF-04.3** El usuario puede abrir un diagrama existente
- **RF-04.4** El usuario puede renombrar un diagrama
- **RF-04.5** El usuario puede duplicar un diagrama
- **RF-04.6** El usuario puede eliminar un diagrama (con confirmación)
- **RF-04.7** El diagrama activo se guarda automáticamente cada 30 segundos y en cada cambio significativo
- **RF-04.8** Se muestra indicador visual de "guardado" / "cambios pendientes"
- **RF-04.9** El usuario puede importar un archivo `.bpmn` desde su sistema de archivos
- **RF-04.10** Cada diagrama tiene: id, nombre, fecha de creación, fecha de última modificación, thumbnail (generado automáticamente)

### RF-05: Deshacer / Rehacer

- **RF-05.1** Undo con Ctrl/Cmd + Z
- **RF-05.2** Redo con Ctrl/Cmd + Shift + Z (o Ctrl/Cmd + Y)
- **RF-05.3** El historial soporta mínimo 100 acciones
- **RF-05.4** Se puede hacer undo/redo desde botones en la toolbar
- **RF-05.5** Al crear un nuevo diagrama o abrir uno, se limpia el historial

### RF-06: Exportación

- **RF-06.1** Exportar como BPMN 2.0 XML (.bpmn) — descarga directa
- **RF-06.2** Exportar como PNG — el usuario puede elegir resolución (1x, 2x, 3x)
- **RF-06.3** Exportar como SVG — vectorial, incluye estilos
- **RF-06.4** Exportar como PDF — tamaño A4 horizontal o vertical, con nombre del diagrama como título
- **RF-06.5** Todas las exportaciones incluyen solo el contenido del diagrama, con padding razonable
- **RF-06.6** Si el diagrama está vacío, el botón de exportar está deshabilitado con tooltip explicativo

### RF-07: Validación BPMN

- **RF-07.1** El sistema valida que todo proceso tenga al menos un evento de inicio y uno de fin
- **RF-07.2** El sistema alerta si hay elementos desconectados (no tienen ninguna conexión)
- **RF-07.3** El sistema alerta si hay flujos de secuencia que cruzan boundaries de pools incorrectamente
- **RF-07.4** Las validaciones se muestran en un panel de "errores/advertencias" (similar a un linter)
- **RF-07.5** Los elementos con errores se resaltan visualmente en el canvas (borde rojo)
- **RF-07.6** La validación se ejecuta on-demand (botón "Validar") y no de forma continua automática

### RF-08: Interfaz General

- **RF-08.1** Toolbar superior con: nombre del diagrama (editable inline), acciones principales (nuevo, abrir, guardar, exportar, validar, undo, redo, zoom)
- **RF-08.2** Selector de idioma en la toolbar (ES / EN)
- **RF-08.3** Toggle de modo oscuro/claro en la toolbar
- **RF-08.4** Panel izquierdo: paleta de elementos
- **RF-08.5** Área central: canvas de modelado
- **RF-08.6** Panel derecho: propiedades del elemento seleccionado
- **RF-08.7** Barra de estado inferior: zoom actual, cantidad de elementos, estado de guardado
- **RF-08.8** Atajos de teclado documentados en un modal de ayuda (Ctrl/Cmd + ?)

---

## 5. Requisitos No Funcionales

### RNF-01: Rendimiento

- **RNF-01.1** El canvas debe manejar hasta 200 elementos sin degradación visible (< 16ms por frame)
- **RNF-01.2** El tiempo de carga inicial de la aplicación debe ser < 3 segundos en conexión de 10Mbps
- **RNF-01.3** Las operaciones de undo/redo deben ejecutarse en < 50ms
- **RNF-01.4** La exportación a PNG/SVG/PDF debe completarse en < 5 segundos para diagramas de hasta 100 elementos

### RNF-02: Compatibilidad

- **RNF-02.1** Compatible con Chrome 120+, Firefox 120+, Safari 17+, Edge 120+
- **RNF-02.2** Compatible con macOS, Windows, Linux (a través del navegador)
- **RNF-02.3** Resolución mínima soportada: 1280x768px
- **RNF-02.4** No requiere plugins, extensiones ni instalación de software

### RNF-03: Usabilidad

- **RNF-03.1** Un usuario con conocimiento básico de BPMN debe poder crear su primer diagrama en menos de 5 minutos
- **RNF-03.2** Todos los elementos interactivos deben tener tooltips descriptivos
- **RNF-03.3** Los errores del sistema se muestran como notificaciones no bloqueantes (toasts)
- **RNF-03.4** El sistema nunca debe perder datos del usuario sin advertencia previa

### RNF-04: Accesibilidad

- **RNF-04.1** Cumplimiento WCAG 2.1 nivel AA para la UI fuera del canvas
- **RNF-04.2** El canvas tiene roles ARIA apropiados
- **RNF-04.3** Navegación por teclado disponible para todas las acciones fuera del canvas

### RNF-05: Mantenibilidad

- **RNF-05.1** Cobertura de tests > 70% en lógica de negocio y utilidades
- **RNF-05.2** Componentes con responsabilidad única (Single Responsibility Principle)
- **RNF-05.3** Sin dependencias circulares entre módulos

---

## 6. Reglas de Negocio

### RN-01: Estándar BPMN 2.0

La herramienta implementa BPMN 2.0 según la especificación del Object Management Group (OMG). El XML exportado debe ser válido según el schema XSD oficial de BPMN 2.0. No se inventan extensiones propietarias al estándar.

### RN-02: Flujos de Secuencia vs Flujos de Mensaje

- Un **flujo de secuencia** (Sequence Flow) solo puede conectar elementos dentro del **mismo pool**.
- Un **flujo de mensaje** (Message Flow) solo puede conectar elementos de **pools distintos**.
- Intentar conectar con el tipo incorrecto muestra un error y no crea la conexión.

### RN-03: Eventos de Inicio y Fin

- Un proceso colaborativo (con múltiples pools) debe tener al menos un evento de inicio y uno de fin **por cada pool que tenga actividades**.
- Un pool vacío (sin actividades) no requiere evento de inicio ni fin.

### RN-04: Compuertas

- Una **compuerta exclusiva (XOR)** debe tener exactamente 1 flujo de entrada y 2+ flujos de salida, O 2+ flujos de entrada y 1 flujo de salida. No puede tener 1 entrada y 1 salida (eso sería innecesario).
- Una **compuerta paralela (AND)** y una **compuerta inclusiva (OR)** tienen la misma regla estructural que la XOR pero con semántica diferente.
- Una **compuerta de evento** solo puede tener flujos de salida conectados a eventos intermedios.

### RN-05: Subprocesos

- Un subproceso colapsado se representa como una tarea con el ícono `+`.
- Un subproceso expandido muestra su contenido inline en el canvas.
- Los subprocesos expandidos pueden contener sus propios eventos de inicio y fin.
- Los elementos dentro de un subproceso no pueden tener flujos de secuencia que salgan del subproceso (excepto flujos de excepción desde eventos de borde).

### RN-06: Swimlanes (Pools y Lanes)

- Un **pool** representa un participante del proceso (organización, sistema, rol mayor).
- Un **lane** es una subdivisión dentro de un pool (departamento, rol específico).
- Los lanes no pueden existir fuera de un pool.
- Un pool puede no tener lanes (pool simple).
- Los elementos de flujo (tareas, eventos, compuertas) deben estar dentro de un pool o lane cuando hay pools presentes. No pueden flotar fuera de pools si ya existe al menos un pool en el diagrama.

### RN-07: Eventos de Borde (Boundary Events)

- Un evento de borde debe estar adjunto al borde de una tarea o subproceso.
- No puede estar adjunto a compuertas ni a otros eventos.
- Los eventos de borde de interrupción cancelan la actividad padre al activarse.
- Los eventos de borde de no-interrupción permiten que la actividad padre continúe.

### RN-08: Identificadores

- Cada elemento BPMN tiene un `id` generado automáticamente con el formato `{tipo}_{uuid_corto}` (ej: `Task_3f2a1b`, `Gateway_9c4d2e`).
- El `id` es inmutable una vez creado.
- El `name` es opcional en todos los elementos excepto en los pools (donde es recomendado pero no obligatorio).

### RN-09: Persistencia Local

- Los diagramas se guardan en el dispositivo del usuario (localStorage / IndexedDB).
- No existe sincronización automática con ningún servidor externo en v1.0.
- Si el usuario limpia el almacenamiento del navegador, los diagramas se pierden. El sistema advierte esto en una notificación informativa al primer uso.
- El límite de almacenamiento es el del navegador (~5MB localStorage, ~50-250MB IndexedDB). Si se supera, mostrar advertencia.

### RN-10: Importación de Archivos

- Solo se aceptan archivos con extensión `.bpmn`.
- El archivo debe ser XML válido que pase la validación básica de estructura BPMN.
- Si el archivo es inválido, se muestra un mensaje de error descriptivo y no se crea el diagrama.
- La importación crea un nuevo diagrama (no sobreescribe el actual sin confirmación).

### RN-11: Límites del Diagrama

- Máximo 500 elementos por diagrama en v1.0 (para garantizar rendimiento).
- Si se intenta agregar el elemento 501, se muestra una advertencia.

---

## 7. Arquitectura de Software

### 7.1 Tipo de Arquitectura

**Single Page Application (SPA)** 100% cliente en v1.0. Sin SSR. La capa de persistencia está diseñada bajo **patrón repositorio** para que agregar un backend en v2.0 sea únicamente agregar una nueva implementación de la interfaz `IDiagramRepository`, sin modificar stores, hooks ni componentes.

```
┌──────────────────────────────────────────────────────────────┐
│                         NAVEGADOR                            │
│                                                              │
│  ┌─────────────┐    ┌────────────────────────────────────┐  │
│  │   React UI  │◄──►│         bpmn-js Engine             │  │
│  │  (Vite/TS)  │    │      (canvas + moddle)             │  │
│  └──────┬──────┘    └────────────────────────────────────┘  │
│         │                                                    │
│  ┌──────▼──────┐                                            │
│  │   Zustand   │                                            │
│  │   (estado)  │                                            │
│  └──────┬──────┘                                            │
│         │ usa interfaz                                       │
│  ┌──────▼──────────────────────────────────────────────┐   │
│  │           IDiagramRepository (interfaz)              │   │
│  └──────┬──────────────────────────────────────────────┘   │
│         │                                                    │
│  ┌──────▼──────────────┐   ┌────────────────────────────┐  │
│  │  LocalRepository     │   │  ApiRepository (v2.0)      │  │
│  │  (localforage)       │   │  (REST/Supabase/etc)       │  │
│  │  ← activo en v1.0   │   │  ← solo cambiar aquí       │  │
│  └─────────────────────┘   └────────────────────────────┘  │
└──────────────────────────────────────────────────────────────┘
```

**Cómo migrar a backend en el futuro (para Claude Code en v2.0):**
1. Crear `ApiRepository` que implemente `IDiagramRepository`
2. Cambiar el binding en `/src/persistence/index.ts` de `LocalRepository` a `ApiRepository`
3. Nada más. Cero cambios en stores, hooks o componentes.

### 7.2 Separación de Responsabilidades

El proyecto sigue una separación clara en capas:

**Capa de Presentación** (`/src/components`)
- Componentes React puros de UI
- No contienen lógica de negocio BPMN
- No acceden directamente a bpmn-js
- Solo consumen estado de Zustand y llaman a acciones

**Capa de Orquestación** (`/src/hooks`)
- Custom hooks que conectan UI con bpmn-js y estado
- `useBpmnModeler` — interfaz principal con el engine bpmn-js
- `useDiagramStore` — acceso al estado global
- `useExport` — lógica de exportación
- `useKeyboard` — atajos de teclado globales

**Capa de Engine** (`/src/bpmn`)
- Inicialización y configuración de bpmn-js
- Módulos personalizados de bpmn-js (custom renderer, custom palette)
- Adaptadores para traducir eventos bpmn-js a acciones de Zustand
- Esto es lo más cercano a bpmn-js que llega el código propio

**Capa de Estado** (`/src/store`)
- Stores de Zustand
- Estado de la aplicación (diagramas, UI, preferencias)
- Acciones puras sin efectos secundarios directos al DOM

**Capa de Persistencia** (`/src/persistence`)
- Servicio de lectura/escritura a localforage
- Serialización/deserialización de diagramas
- Manejo de límites de almacenamiento

**Capa de Dominio** (`/src/domain`)
- Tipos TypeScript del dominio (Diagram, BpmnElement, etc.)
- Validaciones de negocio BPMN (independientes del engine)
- Funciones puras sin dependencias de UI

**Capa de Utilidades** (`/src/utils`)
- Funciones genéricas reutilizables
- Generadores de ID
- Formateadores de fecha
- Helpers de exportación

### 7.3 Flujo de Datos

```
Acción del usuario
      │
      ▼
Componente React
      │ llama
      ▼
Custom Hook (useBpmnModeler / useDiagramStore)
      │ coordina
      ├──────────────────────────┐
      ▼                          ▼
bpmn-js Engine              Zustand Store
(manipula canvas)           (actualiza estado UI)
      │                          │
      ▼                          ▼
Evento bpmn-js          Componentes re-renderizan
      │
      ▼
Adaptador (bpmn → store)
      │
      ▼
Zustand Store actualizado
      │
      ▼ (cada 30s o en cambios)
localforage (persistencia)
```

### 7.4 Integración con bpmn-js

bpmn-js se instancia **una sola vez** por sesión de diagrama activo. El ref del contenedor DOM se pasa en la inicialización. Para cambiar de diagrama, se llama a `modeler.importXML(newXml)` en lugar de destruir y recrear la instancia.

Los módulos personalizados de bpmn-js se declaran en la configuración inicial:
- `customPalette` — paleta personalizada con categorías
- `customRenderer` — estilos visuales propios (sin tocar colores estándar BPMN)
- `customContextPad` — menú contextual al seleccionar elementos

---

## 8. Estructura de Directorios

```
bpmn-web-modeler/
├── public/
│   ├── favicon.svg
│   └── fonts/                    # Fuente BPMN icons si se usa bpmn-font
├── src/
│   ├── main.tsx                  # Entry point
│   ├── App.tsx                   # Router raíz y providers
│   │
│   ├── bpmn/                     # Todo lo relacionado con bpmn-js
│   │   ├── config.ts             # Configuración del modeler (módulos, opciones)
│   │   ├── modules/
│   │   │   ├── CustomPalette.ts  # Paleta personalizada
│   │   │   ├── CustomRenderer.ts # Renderer con estilos propios
│   │   │   └── CustomContextPad.ts
│   │   ├── adapters/
│   │   │   └── eventAdapter.ts   # Traduce eventos bpmn-js → acciones store
│   │   └── index.ts              # Exports del módulo bpmn
│   │
│   ├── components/
│   │   ├── layout/
│   │   │   ├── AppLayout.tsx     # Layout principal (toolbar + panels + canvas)
│   │   │   ├── Toolbar.tsx       # Barra superior
│   │   │   ├── StatusBar.tsx     # Barra inferior de estado
│   │   │   ├── PalettePanel.tsx  # Panel izquierdo (paleta)
│   │   │   └── PropertiesPanel.tsx # Panel derecho (propiedades)
│   │   │
│   │   ├── canvas/
│   │   │   └── BpmnCanvas.tsx    # Wrapper del canvas bpmn-js
│   │   │
│   │   ├── palette/
│   │   │   ├── PaletteGroup.tsx  # Grupo de elementos
│   │   │   └── PaletteItem.tsx   # Item individual de la paleta
│   │   │
│   │   ├── properties/
│   │   │   ├── CommonProperties.tsx   # id, name, documentation
│   │   │   ├── TaskProperties.tsx
│   │   │   ├── GatewayProperties.tsx
│   │   │   ├── EventProperties.tsx
│   │   │   └── PoolProperties.tsx
│   │   │
│   │   ├── diagrams/
│   │   │   ├── DiagramList.tsx   # Vista de lista/galería de diagramas
│   │   │   ├── DiagramCard.tsx   # Tarjeta individual
│   │   │   └── NewDiagramModal.tsx
│   │   │
│   │   ├── modals/
│   │   │   ├── ExportModal.tsx
│   │   │   ├── ImportModal.tsx
│   │   │   ├── ValidationModal.tsx
│   │   │   └── KeyboardShortcutsModal.tsx
│   │   │
│   │   └── ui/                   # Componentes base (shadcn/ui re-exports + custom)
│   │       ├── Button.tsx
│   │       ├── Input.tsx
│   │       ├── Tooltip.tsx
│   │       ├── Toast.tsx
│   │       └── ...
│   │
│   ├── hooks/
│   │   ├── useBpmnModeler.ts     # Hook principal de integración bpmn-js
│   │   ├── useDiagramStore.ts    # Acceso tipado al store de diagramas
│   │   ├── useExport.ts          # Lógica de exportación
│   │   ├── useKeyboard.ts        # Atajos de teclado globales
│   │   ├── useAutoSave.ts        # Auto-guardado cada 30s
│   │   └── useValidation.ts      # Validaciones BPMN
│   │
│   ├── store/
│   │   ├── diagramStore.ts       # Estado: lista de diagramas, diagrama activo
│   │   ├── uiStore.ts            # Estado: paneles, modals, zoom, selección
│   │   └── preferencesStore.ts   # Estado: idioma, tema, grid, snap
│   │
│   ├── persistence/
│   │   ├── IDiagramRepository.ts  # Interfaz (contrato inmutable)
│   │   ├── LocalRepository.ts     # Implementación v1.0 (localforage)
│   │   ├── index.ts               # Binding: exporta la instancia activa
│   │   ├── thumbnailService.ts    # Generación de thumbnails
│   │   └── migrations.ts          # Migraciones de schema futuras
│   │
│   ├── domain/
│   │   ├── types.ts              # Tipos TypeScript del dominio
│   │   ├── validation.ts         # Reglas de validación BPMN puras
│   │   └── bpmnElements.ts       # Definición de todos los elementos BPMN soportados
│   │
│   ├── i18n/
│   │   ├── index.ts              # Configuración i18next
│   │   ├── es.json               # Traducciones español
│   │   └── en.json               # Traducciones inglés
│   │
│   └── utils/
│       ├── idGenerator.ts        # Generación de IDs únicos
│       ├── dateFormatter.ts
│       └── exportHelpers.ts      # Helpers para PDF/PNG/SVG
│
├── tests/
│   ├── unit/
│   │   ├── domain/
│   │   └── utils/
│   └── integration/
│
├── index.html
├── vite.config.ts
├── tailwind.config.ts
├── tsconfig.json
├── package.json
└── README.md
```

---

## 9. Stack Tecnológico y Dependencias

### 9.1 Dependencias de Producción

```json
{
  "dependencies": {
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "bpmn-js": "^18.15.0",
    "bpmn-js-properties-panel": "^5.54.0",
    "@bpmn-io/properties-panel": "^3.41.2",
    "camunda-bpmn-moddle": "^7.0.1",
    "zustand": "^5.0.0",
    "immer": "^11.1.4",
    "localforage": "^1.10.0",
    "zod": "^3.23.0",
    "i18next": "^26.0.0",
    "react-i18next": "^17.0.0",
    "html-to-image": "^1.11.0",
    "jspdf": "^2.5.0",
    "lucide-react": "^0.460.0",
    "clsx": "^2.1.0",
    "tailwind-merge": "^2.5.0"
  }
}
```

### 9.2 Dependencias de Desarrollo

```json
{
  "devDependencies": {
    "typescript": "^5.6.0",
    "vite": "^6.0.0",
    "@vitejs/plugin-react": "^4.3.0",
    "tailwindcss": "^4.0.0",
    "@tailwindcss/vite": "^4.0.0",
    "vitest": "^2.1.0",
    "@testing-library/react": "^16.0.0",
    "@testing-library/user-event": "^14.5.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "eslint": "^9.0.0",
    "@typescript-eslint/eslint-plugin": "^8.0.0",
    "prettier": "^3.3.0"
  }
}
```

### 9.3 Notas Importantes sobre bpmn-js

- bpmn-js usa su propio sistema de módulos (Didi injector), distinto a los módulos ES.
- El CSS de bpmn-js (`bpmn-js/dist/assets/bpmn-js.css` y `diagram-js.css`) **debe importarse** en el entry point o en el componente del canvas.
- bpmn-js manipula el DOM directamente. El componente `BpmnCanvas` es un wrapper thin que solo expone el ref del contenedor.
- Para personalizar estilos del canvas, se usa CSS con selectores `.djs-*` (clases internas de diagram-js) o módulos custom renderer.
- Los tipos TypeScript de bpmn-js no son perfectos. Usar `// @ts-ignore` con comentario explicativo cuando sea necesario, nunca sin comentario.

---

## 10. Modelo de Datos

### 10.1 Diagrama (entidad principal de persistencia)

```typescript
interface Diagram {
  id: string;                    // UUID v4
  name: string;                  // Nombre editable, max 100 chars
  xml: string;                   // BPMN 2.0 XML completo (compatible con Bizagi/Camunda)
  thumbnail: string | null;      // Data URL de imagen PNG pequeña (200x150) — auto-generado
  folderId: string | null;       // Carpeta de organización local (null = raíz)
  elementCount: number;          // Cantidad de elementos BPMN — calculado al guardar
  schemaVersion: number;         // Para migraciones de schema del modelo de datos, empieza en 1
  createdAt: string;             // ISO 8601
  updatedAt: string;             // ISO 8601
}
// NOTA: Sin versioning de diagrama (v1.0, v2.3) — Fase 2
// NOTA: Sin estado publicado/borrador/revisión compartido — Fase 2 (requiere backend)
```

### 10.2 Carpeta (organización local)

```typescript
interface Folder {
  id: string;                    // UUID v4
  name: string;                  // Nombre, max 60 chars
  createdAt: string;
}
// Las carpetas son solo organización visual local, no tienen semántica de permisos
```

### 10.3 Preferencias de Usuario

```typescript
interface UserPreferences {
  language: 'es' | 'en';
  theme: 'light' | 'dark' | 'system';
  gridEnabled: boolean;
  gridSize: 5 | 10 | 20;
  snapToGrid: boolean;
  autoSaveInterval: number;      // segundos, default 30
  lastOpenedDiagramId: string | null;
}
```

### 10.4 Estado de UI (Zustand, no persistido)

```typescript
interface UIState {
  activePanel: 'palette' | null;
  propertiesPanelOpen: boolean;
  selectedElementIds: string[];
  zoom: number;                    // 0.25 a 4.0
  validationResults: ValidationResult[];
  isExporting: boolean;
  activeModal: 'export' | 'import' | 'shortcuts' | 'validation' | 'newDiagram' | null;
  toasts: Toast[];
  unsavedChanges: boolean;
  diagramListFilter: 'all' | 'recent';   // filtros simples sin backend
  diagramListSearch: string;
}
```

### 10.5 Resultado de Validación

```typescript
interface ValidationResult {
  id: string;
  elementId: string | null;        // null = error global del diagrama
  elementName: string | null;
  severity: 'error' | 'warning';
  code: string;                    // ej: 'MISSING_END_EVENT'
  message: string;                 // Ya traducido al idioma activo
}
```

---

## 11. Diseño de Interfaz — Referencia: Prototipo Claude Design

> **Regla principal:** Toda decisión visual debe apegarse al prototipo generado por Claude Design. Este documento describe lo observado en ese prototipo. Si hay ambigüedad, el prototipo manda.

### 11.1 Identidad Visual

| Atributo | Valor |
|---|---|
| Nombre del producto | **Flujo** |
| Logo | Isotipo cuadrado con radio de borde, color púrpura/violeta (`#7C5CFC` aprox), letra "b" estilizada |
| Tipografía | Sans-serif moderna (Inter o equivalente) |
| Color primario (accent) | Púrpura/violeta — usado en botones CTA, selecciones activas, badges |
| Color de fondo modo oscuro | `#0F1117` aprox (casi negro, no negro puro) |
| Color de fondo modo claro | Blanco / gris muy claro |
| Color de superficie modo oscuro | `#1A1D27` aprox (paneles, cards) |

### 11.2 Layout General — Editor

```
┌──────────────────────────────────────────────────────────────────────┐
│ TOOLBAR: [Logo Flujo.] [breadcrumb] [NombreDiagrama ▼] [+][⬛][⬇]  │
│          [✓] [─] [85%] [+] [⤢]  [ES][EN] [☀/☾] [Guardar]          │
├──────────────────┬───────────────────────────────────┬───────────────┤
│ [tabs abiertos ×]│                                   │               │
├──────────────────┤                                   │               │
│ PALETA    [◁]   │         C A N V A S               │  PROPIEDADES  │
│                  │                                   │   [▷]         │
│ 🔍 Buscar...    │    (cuadrícula de puntos sutil)    │               │
│                  │                                   │  Ícono + tipo │
│ ▾ EVENTOS    6  │                                   │  Nombre bold  │
│  [○][⊙][✉][◎]  │                                   │  ID mono      │
│  [●][✉̶]          │                                   │               │
│                  │                                   │  [General]    │
│ ▾ ACTIVIDADES 6 │                                   │  [Documentac.]│
│  [□][👤][⚙][≡]  │                                   │               │
│  [✉][🏦]         │                          [minimap]│  campos...    │
│                  │                                   │               │
│ ▾ COMPUERTAS 4  │                                   │               │
│  [◇][✛◇][◎◇][⬠]│                                   │               │
│                  │                                   │               │
│ ▾ CONEXIONES 4  │                                   │               │
│  [→][⇢][···][⊢] │                                   │               │
│                  │                                   │               │
│ ▾ CONTENEDORES 4│                                   │               │
│  [▭][⊏][📄][🗄] │                                   │               │
├──────────────────┴───────────────────────────────────┴───────────────┤
│ STATUS: [●guardado] [85% · zoom] [2 pestañas] [● 1 error · 1 advert]│
└──────────────────────────────────────────────────────────────────────┘
```

### 11.3 Toolbar Superior — Detalle

Observado en el prototipo (de izquierda a derecha):

- **Logo** `[b]` + wordmark `Flujo.` — click lleva a "Mis diagramas"
- **Breadcrumb** `Compras / Aprobación de Orden de Compra` — muestra carpeta / nombre
- **Separador**
- **Botones de acción del canvas:** `+` (nuevo elemento), `⬛` (importar/abrir), `⬇` (exportar/guardar), `✓` (validar)
- **Controles de zoom:** `−` `[85%]` `+` `⤢` (fit to screen)
- **Separador**
- **Selector de idioma:** `ES` `EN` — pills, el activo resaltado
- **Toggle tema:** `☀` / `☾`
- **Botón Guardar** — CTA primario, color accent (púrpura), esquina derecha

### 11.4 Pestañas de Diagramas Abiertos

- Ubicadas justo debajo del toolbar, encima del área de trabajo
- Cada pestaña muestra: icono de diagrama + nombre truncado + `×` para cerrar
- La pestaña activa tiene indicador visual (punto de color o subrayado accent)
- Botón `+` al final para abrir otro diagrama
- Máximo recomendado visible: 5-6 pestañas, resto en overflow menu

### 11.5 Panel Izquierdo — Paleta

- Ancho: ~215px
- Header de sección: texto uppercase pequeño + contador de elementos (`EVENTOS  6`)
- Grupos colapsables con chevron `▾` / `▸`
- Cada elemento: ícono BPMN en cuadrado redondeado + tooltip al hover con nombre
- Campo de búsqueda en la parte superior con ícono lupa
- Botón `◁` en el header para colapsar el panel completo
- Los íconos de los elementos respetan los colores BPMN estándar (verde=inicio, rojo=fin, azul=tarea, amarillo=compuerta)

### 11.6 Panel Derecho — Propiedades

- Ancho: ~280px
- Cuando hay elemento seleccionado:
  - **Header:** ícono del tipo de elemento (cuadrado azul redondeado) + label del tipo (`TAREA DE USUARIO`) + nombre en bold + ID en fuente monoespaciada gris
  - **Tabs:** `General` | `Documentación` — subrayado activo en accent
  - **Secciones con label uppercase:** `IDENTIDAD`, `ASIGNACIÓN`, etc.
  - Campos: inputs limpios con label arriba, fondo ligeramente diferenciado
  - Dropdowns con chevron para campos tipo select (`Tipo de tarea ▼`, `Prioridad ▼`)
- Cuando no hay selección: texto sutil centrado "Selecciona un elemento"
- Botón `▷` para colapsar el panel

### 11.7 Canvas

- Fondo: cuadrícula de puntos sutiles (no líneas), color `rgba(255,255,255,0.05)` en oscuro
- Los elementos BPMN mantienen sus colores estándar con ligero ajuste para el modo oscuro (más saturados, fondo del elemento más oscuro)
- **Minimap** en esquina inferior derecha: muestra vista general del diagrama con rectángulo de viewport
- Indicador de errores/advertencias en la parte superior del canvas: pill amarillo/rojo `● 1 error, 1 advertencia`

### 11.8 Barra de Estado Inferior

De izquierda a derecha:
- `● Guardado hace 12 s` — punto verde cuando guardado, amarillo cuando hay cambios
- `85% · zoom`
- `2 pestañas`
- `● 1 error · 1 advert.` — click abre panel de validación
- `Atajos ?` — link a modal de atajos de teclado
- `BPMN 2.0` — badge informativo, esquina derecha

### 11.9 Vista "Mis Diagramas" — Lista

- Ruta: pantalla de inicio (`/`)
- Header: título `Diagramas` + subtítulo `N diagramas BPMN en N carpetas`
- Barra superior: buscador centrado + botones `Importar` y `+ Nuevo diagrama` (CTA accent)
- **Filtros (pills):** `Todos N` | `Míos N` | `Borradores N` — sin estados que requieran backend
- Ordenamiento: `Filtros` | `Recientes` — esquina derecha
- **Grid de tarjetas 3 columnas:**
  - Primera tarjeta siempre: "Crear diagrama" con ícono `+` grande en cuadrado accent
  - Resto: thumbnail auto-generado del diagrama (preview del BPMN en miniatura)
  - Footer de tarjeta: nombre bold + carpeta · fecha + badges (cantidad de elementos)
- En modo oscuro: fondo de tarjetas `#1A1D27`, border sutil

### 11.10 Reglas de Implementación UI

- **Modo oscuro por defecto** — es el que aparece en el prototipo de Claude Design
- **Colores, tokens y estilos:** extraer exclusivamente de `design-prototype/` — no definir valores propios
- **Transición de tema:** suave, no instantánea (`background-color`, `color`)
- **Fuente monoespaciada para IDs:** `font-family: 'JetBrains Mono', 'Fira Code', monospace`
- **El botón "Guardar" siempre visible** en el toolbar con color accent — nunca deshabilitado ni oculto
- **Animaciones:** preferir `transform` y `opacity` para mantener 60fps. Evitar animar `width`/`height`
- **Sombras en modo oscuro:** no usar sombras, usar bordes sutiles en su lugar



## 12. Elementos BPMN Soportados

### Eventos de Inicio
| Elemento | Descripción | Propiedades adicionales |
|---|---|---|
| Ninguno | Evento de inicio simple | — |
| Mensaje | Proceso iniciado por mensaje | `messageRef` |
| Temporizador | Proceso iniciado por tiempo | `timerDefinition` |
| Señal | Proceso iniciado por señal | `signalRef` |
| Condicional | Proceso iniciado por condición | `condition` |

### Eventos de Fin
| Elemento | Descripción |
|---|---|
| Ninguno | Fin normal |
| Mensaje | Envía mensaje al finalizar |
| Error | Termina con error |
| Escalada | Termina con escalada |
| Terminación | Termina todo el proceso |

### Eventos Intermedios (Captura y Lanzamiento)
| Elemento | Captura | Lanzamiento |
|---|---|---|
| Mensaje | ✓ | ✓ |
| Temporizador | ✓ | — |
| Señal | ✓ | ✓ |
| Escalada | — | ✓ |
| Error | ✓ (solo borde) | — |

### Actividades
| Elemento | Descripción | Propiedades adicionales |
|---|---|---|
| Tarea | Tarea genérica | — |
| Tarea de usuario | Realizada por persona | `assignee`, `candidateGroups` |
| Tarea de servicio | Realizada por sistema | `implementation` |
| Tarea de script | Ejecuta script | `scriptFormat`, `script` |
| Tarea de envío | Envía mensaje | `messageRef` |
| Tarea de recepción | Recibe mensaje | `messageRef` |
| Tarea de negocio | Regla de negocio | — |
| Subproceso colapsado | Contiene subproceso | — |
| Subproceso expandido | Contenido visible | — |
| Llamada a actividad | Reutiliza proceso | `calledElement` |

### Compuertas
| Elemento | Símbolo interno | Descripción |
|---|---|---|
| Exclusiva (XOR) | × | Solo una rama |
| Paralela (AND) | + | Todas las ramas |
| Inclusiva (OR) | ○ | Una o más ramas |
| De evento | ⬠ | Primera rama que recibe evento |
| Compleja | * | Condición compleja |

### Conexiones
| Elemento | Descripción |
|---|---|
| Flujo de secuencia | Conexión dentro del mismo pool |
| Flujo de mensaje | Conexión entre pools distintos |
| Asociación | Conecta artefactos con elementos de flujo |
| Asociación de datos | Conecta objetos de datos |

### Contenedores y Artefactos
| Elemento | Descripción |
|---|---|
| Pool | Participante del proceso |
| Lane | Subdivisión de participante |
| Grupo | Agrupación visual sin semántica |
| Anotación de texto | Comentario en el diagrama |
| Objeto de datos | Dato producido/consumido |

---

## 13. Módulos y Responsabilidades

### 13.1 `BpmnCanvas.tsx`

**Responsabilidad única**: Montar y desmontar el engine bpmn-js en un div. Nada más.

```typescript
// Solo hace esto:
// 1. Crea el div contenedor con ref
// 2. Llama a useBpmnModeler(containerRef)
// 3. Aplica estilos CSS del contenedor
// No contiene lógica de negocio
```

### 13.2 `useBpmnModeler.ts`

**Responsabilidad**: Ser la única interfaz entre React y bpmn-js.

Expone:
- `importXml(xml: string): Promise<void>`
- `exportXml(): Promise<string>`
- `exportSvg(): Promise<string>`
- `undo(): void`
- `redo(): void`
- `zoom(level: number): void`
- `fitToScreen(): void`
- `getSelectedElements(): BpmnElement[]`
- `modeler` — instancia bpmn-js (para casos edge)

### 13.3 `diagramStore.ts`

**Responsabilidad**: Estado de los diagramas del usuario.

```typescript
interface DiagramStore {
  diagrams: Diagram[];
  activeDiagramId: string | null;
  // Acciones
  createDiagram(name: string): string;       // retorna id
  updateDiagram(id: string, xml: string): void;
  renameDiagram(id: string, name: string): void;
  deleteDiagram(id: string): void;
  setActiveDiagram(id: string): void;
  importDiagram(xml: string, name: string): string;
}
```

### 13.4 `persistence/index.ts`

**Responsabilidad**: Único punto de binding. Exporta la instancia activa de `IDiagramRepository`.

```typescript
// v1.0: usa almacenamiento local
import { LocalRepository } from './LocalRepository';
export const diagramRepository: IDiagramRepository = new LocalRepository();

// v2.0: cambiar SOLO esta línea
// import { ApiRepository } from './ApiRepository';
// export const diagramRepository: IDiagramRepository = new ApiRepository();
```

Los stores de Zustand y los hooks **solo importan `diagramRepository` desde este archivo**. Nunca importan `LocalRepository` directamente.

---

## 14. Flujos de Usuario Principales

### FU-01: Crear y Guardar un Diagrama Nuevo

1. Usuario abre la aplicación → ve la pantalla de lista de diagramas
2. Click en "Nuevo diagrama"
3. Modal pide nombre (default: "Diagrama sin título")
4. Se crea diagrama con XML inicial mínimo (proceso vacío)
5. Se redirige al canvas con el diagrama vacío
6. Usuario modela → auto-guardado cada 30s o al hacer Ctrl+S

### FU-02: Importar un Archivo .bpmn

1. Click en "Importar" en toolbar o en pantalla de lista
2. Se abre file picker del sistema operativo filtrado a `.bpmn`
3. Se lee el archivo, se valida que sea XML y tenga estructura BPMN
4. Si válido → se crea nuevo diagrama con ese XML → se abre en canvas
5. Si inválido → toast de error con descripción del problema

### FU-03: Exportar a PDF

1. Click en "Exportar" en toolbar
2. Modal de exportación muestra opciones
3. Usuario selecciona PDF, orientación (horizontal/vertical)
4. Click "Exportar"
5. Se captura el canvas como imagen con html-to-image
6. Se crea PDF con jsPDF, se agrega imagen + nombre del diagrama como header
7. Se descarga el archivo `{nombre-diagrama}.pdf`

### FU-04: Validar Diagrama

1. Click en "Validar" en toolbar
2. Se ejecuta validación sobre el XML actual
3. Modal/panel muestra lista de errores y advertencias
4. Click en un error → el canvas hace zoom y selecciona el elemento problemático

---

## 15. Internacionalización

### 15.1 Configuración

- Librería: `i18next` + `react-i18next`
- Idiomas: `es` (default) y `en`
- Las traducciones están en `/src/i18n/es.json` y `/src/i18n/en.json`
- El idioma se persiste en `UserPreferences`

### 15.2 Qué se traduce

- Todos los textos de la UI (labels, tooltips, placeholders, mensajes)
- Nombres de los elementos BPMN en la paleta
- Mensajes de error y validación
- Textos del panel de propiedades

### 15.3 Qué NO se traduce

- Los `id` internos de los elementos BPMN
- El XML BPMN exportado (el estándar es en inglés)
- Las keys internas del código

### 15.4 Convención de keys

```json
{
  "toolbar": {
    "newDiagram": "Nuevo diagrama",
    "export": "Exportar"
  },
  "palette": {
    "groups": {
      "events": "Eventos",
      "activities": "Actividades"
    },
    "elements": {
      "startEvent": "Inicio",
      "endEvent": "Fin"
    }
  },
  "validation": {
    "errors": {
      "MISSING_END_EVENT": "El proceso no tiene evento de fin"
    }
  }
}
```

---

## 16. Persistencia y Almacenamiento

### 16.1 Principio de Diseño: Patrón Repositorio

**La capa de persistencia está completamente abstraída detrás de una interfaz.** Ningún store, hook ni componente importa `localforage` directamente. Todo accede a través de `IDiagramRepository`.

```typescript
// /src/persistence/IDiagramRepository.ts
// Esta interfaz es el contrato. Nunca cambia.
export interface IDiagramRepository {
  getAll(): Promise<Diagram[]>;
  getById(id: string): Promise<Diagram | null>;
  save(diagram: Diagram): Promise<void>;
  delete(id: string): Promise<void>;
  getThumbnail(id: string): Promise<string | null>;
  saveThumbnail(id: string, dataUrl: string): Promise<void>;
}

// /src/persistence/index.ts
// ÚNICO lugar donde se decide qué implementación usar.
// En v2.0, solo cambiar esta línea:
import { LocalRepository } from './LocalRepository';
export const diagramRepository: IDiagramRepository = new LocalRepository();
```

### 16.2 Implementación v1.0: LocalRepository

`LocalRepository` implementa `IDiagramRepository` usando `localforage` (IndexedDB con fallback a localStorage).

```typescript
// /src/persistence/LocalRepository.ts
import localforage from 'localforage';
import type { IDiagramRepository } from './IDiagramRepository';

const store = localforage.createInstance({ name: 'bpmn-modeler' });

export class LocalRepository implements IDiagramRepository {
  async getAll(): Promise<Diagram[]> {
    return (await store.getItem<Diagram[]>('diagrams')) ?? [];
  }
  async save(diagram: Diagram): Promise<void> {
    const all = await this.getAll();
    const idx = all.findIndex(d => d.id === diagram.id);
    if (idx >= 0) all[idx] = diagram; else all.push(diagram);
    await store.setItem('diagrams', all);
  }
  // ... resto de métodos
}
```

### 16.3 Keys de Almacenamiento (LocalRepository)

```
flujo:diagrams              → Diagram[]
flujo:folders               → Folder[]
flujo:preferences           → UserPreferences
flujo:thumbnails:{id}       → string (data URL PNG)
```

### 16.4 Auto-guardado

- El hook `useAutoSave` escucha cambios en el store de Zustand
- Debounce de 2 segundos para cambios continuos
- Guardado inmediato en: importar, crear, eliminar elemento
- Indicador visual en StatusBar: "Guardado", "Guardando...", "Cambios sin guardar"

### 16.5 Manejo de Espacio

- Al iniciar, verificar espacio estimado
- Si `diagrams` supera el 80% del límite, mostrar advertencia no bloqueante
- Ofrecer opción de exportar y eliminar diagramas antiguos

---

## 17. Exportación e Importación — Interoperabilidad

### 17.1 Compatibilidad con Bizagi Modeler (VERIFICADA)

**Pruebas realizadas con bpmn-moddle v10.0.0 confirman:**

| Escenario | Resultado | Notas |
|---|---|---|
| Flujo → exportar `.bpmn` → abrir en Bizagi | ✅ Compatible | Mismo namespace OMG estándar |
| Bizagi → exportar `.bpmn` → importar en Flujo | ✅ Compatible | Sin warnings |
| Extensiones propietarias `bizagi:` en el XML | ✅ Preservadas | Se mantienen en round-trip aunque Flujo no las interpreta |
| Camunda Modeler → exportar → importar en Flujo | ✅ Compatible | Mismo estándar |

**El namespace que usa bpmn-js (y por tanto Flujo):**
```xml
xmlns:bpmn2="http://www.omg.org/spec/BPMN/20100524/MODEL"
```
Este es el namespace oficial OMG, compatible con todas las herramientas BPMN estándar.

**Nota sobre extensiones propietarias:** Si un archivo de Bizagi tiene propiedades extra (`bizagi:assignee`, `bizagi:priority`, etc.), Flujo las preserva intactas en el XML pero no las muestra en la UI. Al volver a abrir en Bizagi, esa información sigue presente. No hay pérdida de datos.

### 17.2 BPMN XML (.bpmn)

```typescript
// bpmn-js exporta XML estándar OMG directamente
const { xml } = await modeler.saveXML({ format: true });
// Descargar como archivo .bpmn
const blob = new Blob([xml], { type: 'application/xml' });
const url = URL.createObjectURL(blob);
// <a download="nombre-diagrama.bpmn" href={url}>
```

### 17.3 PNG

```typescript
import { toPng } from 'html-to-image';
// Escala configurable: 1x (pantalla), 2x (presentaciones), 3x (impresión)
const dataUrl = await toPng(canvasElement, { pixelRatio: scale });
```

### 17.4 SVG

```typescript
// bpmn-js tiene exportación SVG nativa — resultado limpio y vectorial
const { svg } = await modeler.saveSVG();
```

### 17.5 PDF

```typescript
// 1. Exportar SVG nativo de bpmn-js (más limpio que html-to-image para PDF)
const { svg } = await modeler.saveSVG();
// 2. Convertir SVG a imagen PNG con html-to-image
// 3. Crear documento jsPDF (A4 horizontal por defecto)
// 4. Header: nombre del diagrama + fecha
// 5. Imagen del diagrama centrada con padding
// 6. jsPDF.save(`${nombreDiagrama}.pdf`)
```

### 17.6 Importación

```typescript
// Aceptar solo archivos .bpmn
// Validar que sea XML válido con estructura BPMN antes de crear el diagrama
const { warnings } = await modeler.importXML(xmlString);
// warnings puede contener elementos no reconocidos (ej: extensiones propietarias)
// — no son errores fatales, el diagrama se importa igualmente
// Si hay error real (XML malformado, no es BPMN): mostrar toast descriptivo
```

---

## 18. Manejo de Errores

### 18.1 Tipos de Error

| Tipo | Manejo | UI |
|---|---|---|
| Error de importación (XML inválido) | Catch + log | Toast rojo con descripción |
| Error de exportación | Catch + retry | Toast rojo con botón reintentar |
| Error de persistencia (storage lleno) | Catch + alerta | Modal con opciones de limpieza |
| Error de validación BPMN | Resultado esperado | Panel de validación |
| Error inesperado (uncaught) | Error boundary React | Pantalla de error con "Recargar" |

### 18.2 Error Boundary

Implementar `ErrorBoundary` global que capture errores no manejados. Mostrar pantalla amigable con opción de recargar. En desarrollo, mostrar stack trace.

### 18.3 Logging

En desarrollo (`import.meta.env.DEV`): `console.error` con contexto. En producción: silencioso para el usuario, considerar integración futura con Sentry.

---

## 19. Testing

### 19.1 Estrategia

- **Tests unitarios**: lógica de dominio (`/src/domain`), utilidades (`/src/utils`), validaciones BPMN
- **Tests de integración**: hooks principales (`useBpmnModeler`, `useDiagramStore`), servicio de persistencia
- **No testar**: componentes puramente visuales, integración bpmn-js (confiar en sus propios tests)

### 19.2 Framework

Vitest + Testing Library. Los tests viven en `/tests/` espejando la estructura de `/src/`.

### 19.3 Casos Críticos a Testear

```
✓ Validación: proceso sin evento de fin → debe retornar error MISSING_END_EVENT
✓ Validación: flujo de secuencia entre pools → debe retornar error INVALID_SEQUENCE_FLOW
✓ Persistencia: guardar y recuperar diagrama mantiene el XML intacto
✓ IDs: dos elementos generados en el mismo ms tienen IDs distintos
✓ Importación: archivo .bpmn válido se importa correctamente
✓ Importación: archivo no-BPMN retorna error descriptivo
```

---

## 20. Convenciones de Código

### 20.1 TypeScript

- `strict: true` en tsconfig. Sin excepciones.
- Nunca usar `any`. Usar `unknown` + type guard si es necesario.
- Los tipos del dominio van en `/src/domain/types.ts`.
- Interfaces para objetos de datos, types para uniones y aliases.

### 20.2 Componentes React

- Componentes funcionales únicamente. Sin clases.
- Un archivo = un componente principal + sus tipos locales.
- Props siempre tipadas con interface: `interface ButtonProps { ... }`.
- Nunca pasar el store de Zustand completo como prop. Seleccionar solo lo necesario.

### 20.3 Nombrado

| Elemento | Convención | Ejemplo |
|---|---|---|
| Componentes | PascalCase | `PropertiesPanel.tsx` |
| Hooks | camelCase con `use` | `useBpmnModeler.ts` |
| Stores | camelCase con `Store` | `diagramStore.ts` |
| Utilidades | camelCase | `idGenerator.ts` |
| Constantes | UPPER_SNAKE_CASE | `MAX_ELEMENTS = 500` |
| Keys i18n | camelCase anidado | `palette.groups.events` |

### 20.4 CSS / Tailwind

- Tailwind para todo lo posible.
- CSS plano solo para estilos del canvas bpmn-js (clases `.djs-*`).
- Los overrides de bpmn-js en un archivo separado: `/src/bpmn/bpmn-overrides.css`.
- Sin CSS-in-JS. Sin styled-components.

### 20.6 Consideraciones para Desarrollador Individual

Dado que el proyecto lo desarrolla una sola persona, priorizar en este orden:

1. **Que funcione correctamente** — no cortar esquinas en lógica de negocio ni en la interfaz `IDiagramRepository`
2. **Que sea legible después de 2 semanas** — comentar las integraciones con bpmn-js, que tienen API no obvia
3. **Que sea fácil de extender** — especialmente la capa de persistencia (ya diseñada para esto)
4. **Cobertura de tests** — enfocarse en `/src/domain/validation.ts` y `/src/persistence/`. El resto puede crecer con el proyecto.

No sobre-optimizar prematuramente. Si algo funciona y es legible, es suficiente para v1.0.

Formato conventional commits:
```
feat: agregar exportación PDF
fix: corregir validación de compuertas sin salida
refactor: extraer lógica de auto-guardado a hook
docs: actualizar README con instrucciones de desarrollo
```

---

## 21. Roadmap por Fases

### Fase 1 — MVP (v1.0) — ~2-3 meses

Todo lo descrito en la sección de alcance. Al finalizar: herramienta funcional, completa para modelado y exportación.

### Fase 2 — Backend y Nube (~3 meses adicionales)

**La arquitectura ya está preparada. Los pasos concretos son:**

1. Decidir proveedor (Supabase, Firebase, backend propio con Node/Express, etc.)
2. Crear `ApiRepository` que implemente `IDiagramRepository`
3. Cambiar el binding en `/src/persistence/index.ts`
4. Agregar autenticación (el `UserPreferences` ya tiene campo `userId` reservado para esto)

**Funcionalidades de esta fase:**
- Autenticación (Google OAuth recomendado para fricción mínima)
- Sincronización de diagramas en la nube
- Acceso desde múltiples dispositivos
- Exportación a Word (.docx) con descripción de cada elemento

### Fase 3 — Colaboración y Comunidad (~3 meses adicionales)

- Colaboración en tiempo real (WebSockets / CRDT)
- Comentarios por elemento
- Historial de versiones en nube
- Compartir diagrama por link (solo lectura)
- Exportación a PowerPoint

**Sistema de temas y personalización de comunidad:**
- Definir un formato de tema (JSON) que describa: colores de elementos BPMN, colores de UI, tipografía, estilos del canvas
- Editor visual de temas dentro de la app
- Exportar/importar temas como archivos `.flujo-theme.json`
- Repositorio público de temas de la comunidad (GitHub-based o similar)
- Los temas son completamente independientes del estándar BPMN — no afectan el XML exportado

---

## 22. Restricciones y Lo que NO se Debe Hacer

### 22.1 Legales

- **NO** copiar código fuente de Bizagi Modeler bajo ninguna circunstancia.
- **NO** usar assets (íconos, imágenes) de Bizagi.
- **NO** usar el nombre "Bizagi" en la UI, documentación pública o marketing.
- Los colores BPMN estándar (azul para tareas, verde/rojo para eventos) son convención del estándar OMG y son libres de usar.

### 22.2 Técnicas

- **NO** hacer server-side rendering (SSR). bpmn-js requiere DOM real. SPA pura.
- **NO** destruir y recrear la instancia de bpmn-js para cambiar de diagrama. Usar `importXML`.
- **NO** acceder a bpmn-js fuera de `useBpmnModeler` y los módulos en `/src/bpmn/`.
- **NO** guardar el XML en el estado de React (Zustand). El XML vive en bpmn-js; se extrae solo para persistir.
- **NO** usar `localforage` directamente fuera de `LocalRepository`. Siempre a través de `IDiagramRepository`.
- **NO** importar `LocalRepository` directamente en stores o hooks. Siempre importar `diagramRepository` desde `/src/persistence/index.ts`.
- **NO** agregar dependencias sin evaluar su impacto en el bundle size.

### 22.3 UX

- **NO** mostrar modales bloqueantes para operaciones no destructivas.
- **NO** perder el trabajo del usuario sin confirmación explícita.
- **NO** requerir registro o login en v1.0.
- **NO** agregar telemetría o analytics sin consentimiento explícito del usuario.

---

*Fin del documento — versión 1.0*  
*Este documento debe mantenerse actualizado conforme evolucione el proyecto.*
