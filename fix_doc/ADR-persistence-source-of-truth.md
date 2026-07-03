# ADR: Fuente de verdad de los diagramas, persistencia y colaboración

**Tipo:** Architecture Decision Record
**Proyecto:** mc-modeler
**Fecha:** 2026-07-02
**Estado:** Aceptado (dirección). Implementación por etapas; parte diferida.
**Contexto previo:** ver `pool-cross-contamination-race-fix.md`, `yjs-persistence-append-only-log.md`, `pool-overlay-yjs-poison-fix.md`.

---

## 1. Contexto

Tras una serie de bugs de corrupción ("un diagrama sobre otro", retroceso de estado persistido), se hizo evidente que la causa profunda **no** era un bug puntual sino una **decisión de arquitectura difusa**: no está declarado **quién es la fuente de verdad** de un diagrama.

Estado de facto hoy (todo en Supabase):
- `diagrams.current_xml` (TEXT) — BPMN 2.0 XML. Se importa al canvas, se exporta, genera thumbnails.
- `yjs_documents` + `yjs_updates` — estado CRDT (Yjs) para co-edición.
- Supabase Realtime — broadcast del sync en vivo.
- Supabase Storage — thumbnails (y debería, imágenes).
- Cliente — bpmn-js + binding Yjs.

**El modelo de uso es tiempo real:** los cambios de un usuario los ve el resto en segundos. Por tanto, al guardar, los estados de todos son **casi idénticos** — el guardado es una **confirmación** de un acuerdo, no una fuente de divergencia.

---

## 2. Problema central

**Doble fuente de verdad + CRDT autoritativo del lado del cliente.**

- `current_xml` y la capa Yjs pueden **divergir**. Al abrir, se importa XML y luego Yjs se reconcilia **encima de forma aditiva** → Yjs puede añadir/sobrescribir. Ahí vivió y persistió el veneno.
- Yjs es un **blob binario opaco**: RLS controla *quién* escribe la fila, no *qué* contiene. Un cliente buggy/malicioso mete cualquier cosa y la DB no lo detecta. Sin validación ni auditoría de contenido.
- Cargar = XML + merge de Yjs → resultado depende de dos entradas + lógica de merge → **no determinista** si divergen.

Yjs quedó siendo **transporte + persistencia + autoridad**, y encima controlado por el cliente. Esa **conflación de roles** es el smell de fondo.

---

## 3. Preguntas de decisión y análisis

### 3.1 ¿Qué es Yjs?

CRDT (Conflict-free Replicated Data Type). Motor de **edición concurrente**, no un formato de documento. Cada cambio = operación con id único (clientID + reloj lógico), **conmutativa e idempotente** → convergen sin conflictos. Es un **mecanismo de sincronización** (infraestructura), **no** estado de dominio.

### 3.2 ¿Está bien que unos diagramas reflejen la pool en XML y otros en Yjs?

**No.** Es la raíz de los bugs. Viola *single source of truth*. La misma cosa lógica (una pool) viviendo en capas distintas según el historial → imposible razonar, validar o garantizar determinismo.

### 3.3 XML como única verdad + Yjs efímero — ¿por qué la concurrencia lo complica?

- **XML es monolítico, sin semántica de merge.** Guardar = sobrescribir todo el blob. La concurrencia necesita merge a nivel de **operación**; XML no puede → guardado concurrente = last-write-wins = **pérdida** (la carrera de la celda compartida, pero sobre el doc entero).
- Modos de fallo bajo concurrencia: ¿quién serializa a XML?; pérdida de updates; late-join/reconexión desde XML rezagado; edición offline sin merge.
- Empeora a escala (público tipo draw.io): más sesiones, ventanas más anchas, más reconexión/offline.

**Matiz clave:** con **tiempo real**, todos escriben casi el mismo estado acordado → "último gana" es **seguro** para buen-uso. La carrera solo duele con vistas **desactualizadas** (mal-uso), que se ataja con **version-check**.

### 3.4 Manejo de la carrera de guardado (teoría de concurrencia → herramientas reales)

- Bakery de Lamport / Peterson / semáforos = exclusión mutua en **memoria compartida** (una máquina). Tu caso es **clientes distribuidos + DB**. Mismo objetivo, otra capa. Bakery es elegante pero herramienta equivocada aquí (asume lectura continua de variables compartidas).
- Herramientas reales (Postgres):
  - **Advisory lock por diagrama** (`pg_advisory_xact_lock(diagram_id)`) o `SELECT … FOR UPDATE` — sección crítica; la DB es "el panadero", encola y libera al terminar la tx.
  - **Optimista con versión (CAS):** columna `version`; `UPDATE … WHERE version=$esperada`; 0 filas → conflicto → re-sync + reconfirmar. Encaja con el modelo "acuerdo al guardar".
  - Orden total (si se necesita): contador monótono / timestamp (relojes de Lamport como concepto).
  - Idempotencia: sobrescribir el mismo XML = mismo estado; hash de contenido para reintentos.
- **Deadlock:** un solo lock por diagrama = imposible (el interbloqueo requiere ≥2 recursos en ciclo). Sección crítica mínima.

### 3.5 XML en campo de DB vs archivo en repositorio (Drive/Storage)

| | XML en campo Postgres | Archivo en repo (Drive/S3/Storage) |
|---|---|---|
| Transaccional con metadata + version CAS | ✅ | ❌ (dos escrituras, pueden divergir) |
| RLS / seguridad por fila | ✅ directa | ⚠️ segundo sistema de permisos |
| Inspeccionable / validable / auditable | ✅ | ⚠️ |
| Consultable / respaldo unificado | ✅ | ❌ |
| Docs grandes (MBs) / CDN | ❌ (bloat) | ✅ |

Para documentos de **KB** (BPMN puro), **el campo Postgres gana**. Archivo-en-repo es para blobs grandes o modelo "trae-tu-almacenamiento".

**Riesgo real de bloat:** imágenes embebidas como base64 en el XML (`[IMAGE:dataUrl]`). Esas sí inflan la fila a MBs → deben ir a **Storage** (URLs en el XML), como ya hacen los thumbnails.

### 3.6 Imitar draw.io / Google Drive

draw.io usa Drive para **desplazar el costo de almacenamiento al usuario** + modelo bring-your-own-storage, y su colaboración es **gruesa** (nivel archivo, no merge fino op-a-op). Para mc-modeler:
- **Pelea con el modelo real-time** (Drive no es DB de tiempo real).
- **No reduce el costo real** (el driver de costo es Realtime + compute, no almacenar XMLs de KB).
- Suma OAuth + permisos de Drive peleando con el modelo de compartir propio.

**Descartado.** Supabase Storage cubre el rol de blobs, integrado con RLS/Auth existentes, sin vendor extra.

### 3.7 Costo al escalar

- Supabase solo (Postgres + Realtime + Storage + Auth) cubre todo. Almacenar XMLs de KB = insignificante.
- Driver de costo = Realtime (conexiones concurrentes) + compute. Mínimo viable público ≈ Supabase Pro. Ningún otro vendor necesario.

---

## 4. Decisión

1. **Fuente de verdad = UN XML canónico** (KB) en `diagrams.current_xml` (Postgres), con columna **`version` para CAS** y validación al guardar. Una sola verdad, inspeccionable, transaccional.
2. **Real-time se mantiene con Yjs en vivo** (broadcast). Es el núcleo del producto y el CRDT es la herramienta correcta para el merge fino en sesión.
3. **Yjs se degrada a transporte/cache de sesión**, NO autoridad de persistencia. La autoridad es el XML canónico.
4. **Concurrencia de guardado:** modelo tiempo-real (todos escriben estado acordado) + **CAS por `version`**; conflicto (vista stale) → re-sync + confirmación explícita, nunca clobber silencioso. Opción de advisory lock por diagrama si se prefiere serializar duro.
5. **Imágenes embebidas → Supabase Storage** (URLs en el XML); XML se mantiene en KB.
6. **Google Drive: descartado.**
7. **Servidor autoritativo de CRDT** (edge function / Hocuspocus-like que valida ops y escribe el XML canónico): **diferido** — inversión para alta concurrencia real (público masivo). Cierra el hueco del blob opaco cuando haga falta.

---

## 5. Consecuencias

**Positivas:**
- Una sola fuente de verdad → elimina la divergencia que causó la corrupción.
- Seguridad de contenido: el XML es validable/escaneable/auditable; el veneno no puede esconderse en un blob opaco autoritativo.
- Determinismo: cargar = importar UN XML.
- Barato: sin vendors nuevos; todo en Supabase.

**Costos / trade-offs:**
- La colaboración offline con merge persistente de CRDT se debilita (aceptable para el uso actual: equipo comunicado, tiempo real, concurrencia baja-media).
- Requiere disciplina al guardar (CAS + validación).
- El "servidor autoritativo" queda como deuda técnica consciente para escalar.

**Ya implementado / en prod (mitigaciones que sostienen esta dirección):**
- Fencing `canvasSession` (evita contaminación nueva).
- Persistencia append-only Yjs (INSERT-only, concurrency-safe a nivel op) — sirve de puente mientras Yjs siga presente.
- Candado `createShape` (impide dibujar elementos de parent ajeno) — ver `pool-overlay-yjs-poison-fix.md`.

---

## 6. Pendiente (por etapas, futuras conversaciones)

1. Columna `version` + guardado con CAS + UI de conflicto (re-sync/confirmar).
2. Imágenes embebidas → Storage.
3. (Escala) Servidor autoritativo de CRDT con validación de ops + snapshot XML canónico.
4. Forzar serialización canónica única en cada guardado (cerrar el "dos dialectos de XML" y el "pool solo en Yjs").

---

## 7. Resumen en una frase

**La arquitectura (Supabase) es correcta; lo que faltaba es declarar quién manda.** Hoy mandan dos (XML y Yjs) y uno es opaco y del cliente. Decisión: **manda el XML canónico validado en Postgres; Yjs es transporte en vivo; imágenes a Storage; sin Drive.** Barato, limpio, determinista y seguro.
