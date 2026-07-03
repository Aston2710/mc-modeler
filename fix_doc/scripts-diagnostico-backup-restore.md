# Scripts de diagnóstico, backup y restauración de diagramas

**Proyecto:** mc-modeler
**Ubicación:** `scripts/*.mjs`
**Fecha:** 2026-07-03
**Estado:** Funcionales, probados contra prod.

> ⚠️ **Los scripts están en `.gitignore` (solo locales, no en GitHub).** Este documento
> guarda su lógica para poder recrearlos si se pierden. Usan `@supabase/supabase-js` +
> `yjs` (ya en `package.json`) — sin dependencias nuevas.

---

## 1. Para qué sirven

Herramientas de administración **fuera de la app**, que corres tú desde la terminal (no gastan tokens de IA), para:
- **Diagnosticar** corrupción de diagramas (pools ajenas, fantasmas, etc.).
- **Respaldar** todos los diagramas a archivos locales versionados.
- **Restaurar** diagramas desde un backup (rollback).
- **Limpiar** participantes fantasma del XML y de la capa Yjs.

Nacieron de una serie de incidentes de corrupción ("un diagrama sobre otro"); ver
`pool-cross-contamination-race-fix.md`, `pool-overlay-yjs-poison-fix.md`, `ADR-persistence-source-of-truth.md`.

---

## 2. Requisito: service_role key

Los scripts leen/escriben con la **service_role key** de Supabase (ignora RLS → ve todos los diagramas/dueños).

- Consíguela: Supabase Dashboard → Project Settings → API → `service_role` (`sb_secret_...`). **Secreta.**
- Guárdala en `.env.local` (ya gitignored) **SIN prefijo `VITE_`** (si lleva `VITE_`, Vite la mete al bundle del navegador = fuga total):
  ```
  SUPABASE_SERVICE_ROLE_KEY=sb_secret_...
  ```
- Los scripts la cargan solos (cargador de `.env.local`/`.env` en `_lib.mjs`), desde cualquier cwd.

---

## 3. `_lib.mjs` — utilidades compartidas

- `getClient()` — cliente Supabase con service_role (sale con error guía si falta la key).
- Cargador de `.env.local`/`.env` (resuelve la raíz del proyecto vía `import.meta.url`, no depende del cwd).
- `fetchAll(sb, tabla, columnas)` — SELECT paginado (>1000 filas).
- `xmlPoolIds(xml)` — ids de `<participant>` (regex agnóstico al prefijo: `bpmn:` o sin prefijo).
- `buildDoc(snapshotB64, updatesB64[])` — reconstruye el `Y.Doc` (snapshot + tail del log).
- `mergedStateB64(doc)` — `Y.encodeStateAsUpdate` en base64 (estado fusionado, para backup/restore exacto).
- `docParticipants(doc)` — participants del doc Yjs: `[{id, parent, name}]`.
- `groupUpdates(updates)` — agrupa filas del log por `diagram_id`, ordenadas por `id`.

---

## 4. `diagram-backup.mjs` — backup local versionado

Respalda por diagrama: fila `diagrams` (`current_xml` + metadata) + **estado Yjs fusionado** (elementos **y comentarios**). Guarda también un mapa `id→email` (`meta.owners`) para mostrar dueños offline. **No** respalda thumbnails (regenerables).

```powershell
node scripts/diagram-backup.mjs create                        # → backups/<timestamp>.json
node scripts/diagram-backup.mjs create -m "antes del pivote"  # → backups/antes-del-pivote-<timestamp>.json
node scripts/diagram-backup.mjs list                          # lista versiones (fecha, nº diagramas)
node scripts/diagram-backup.mjs delete <archivo.json>         # borra una versión
```

- `-m "texto"` → slug (minúsculas, sin acentos/símbolos, espacios→guiones, máx 60) + timestamp.
- Un archivo `backups/<batch>.json` = una **versión** (foto en el tiempo).
- Formato: `{ meta: { batch, createdAt, count, owners{id:email} }, diagrams: [{ row, yjsMergedState }] }`.
- Inserta en chunks; `current_xml` puede pesar cientos de KB por diagrama.

**⚠️ `backups/` está en `.gitignore`** (contiene TODA la data de la org). Copia la carpeta a disco externo/nube cada tanto (una máquina = un punto de fallo).

---

## 5. `scan-pool-location.mjs` — diagnóstico

Por diagrama: nombre, dueño, **POOL-XML** (¿pool en `current_xml`?), **POOL-YJS** (¿pool en Yjs?), **ESTADO** + detalle.

```powershell
node scripts/scan-pool-location.mjs                       # consulta la DB
node scripts/scan-pool-location.mjs --from-backup         # SELECTOR: elige backup (fecha/hora), 0 lecturas DB
node scripts/scan-pool-location.mjs --from-backup <file>  # analiza ese backup, 0 lecturas DB
node scripts/scan-pool-location.mjs --solo-corruptos      # solo lo que no está OK
node scripts/scan-pool-location.mjs --csv                 # + scan-pool-location.csv
```

### Taxonomía de estados

| Estado | Qué es | ¿Se ve? | Acción |
|---|---|---|---|
| **OK** | Pool en XML, con shape, sin ajenos | — | ninguna |
| **CONTAMINADO** | Corrupción **visible**: pools solapadas (geometría DI) / pool ajena en Yjs (id no en XML) / ≥2 raíces de colaboración | **Sí** | limpiar |
| **RESIDUO** | Participante **sin shape** (0×0 o sin DI) → invisible, inofensivo | No | higiene opcional |
| **SOLO-YJS** | Pool solo en Yjs, XML incompleto | — | backfill |
| **SIN-POOL** | Ni XML ni Yjs tienen pool | — | revisar |

### Cómo detecta (lógica clave)
- **Pool en XML:** `xmlPoolIds(xml).size > 0`.
- **Solapamiento (visible):** extrae rects DI de cada participant (`<BPMNShape bpmnElement=part>…<Bounds x y width height>`); dos pools con intersección > 30% del área menor = solape.
- **Fantasma (RESIDUO):** `#participants(XML) > #rects_con_shape_válido` (w>1 && h>1). Participante sin shape = invisible.
- **Pool ajena en Yjs (CONTAMINADO):** participant en el doc Yjs cuyo id **no** está en el XML, teniendo el XML ya un pool. (Los ids Yjs coinciden con los del XML por diseño del binding → un pool Yjs ausente del XML es ajeno.)
- **Multi-raíz:** ≥2 valores distintos de `participant.parent` (colaboraciones) en el doc.

**`--from-backup`** reconstruye todo desde el archivo (XML de `row.current_xml`, Yjs de `yjsMergedState`), sin tocar la DB. El owner sale como email si el backup trae `meta.owners`, si no como `owner_id`.

---

## 6. `fix-ghost.mjs` — limpia fantasmas (XML + Yjs)

Quita participantes fantasma de **ambas capas**: `<participant>` sin shape en el XML, y pools ajenas (id no en XML) en el doc Yjs. Conserva comentarios.

```powershell
node scripts/fix-ghost.mjs                 # dry-run, todos (muestra qué quitaría)
node scripts/fix-ghost.mjs <diagramId>     # dry-run, uno
node scripts/fix-ghost.mjs --yes           # aplica (hace backup automático antes)
```

Lógica:
1. **XML:** participantes con id en `xmlPoolIds` pero sin shape válido (`validPoolIds`) → `stripParticipant` (quita el `<participant>` + su `<BPMNShape>`). **Seguridad:** si el fantasma está referenciado por un `<messageFlow>` → NO se toca (avisa; revisión manual).
2. **Yjs:** participantes en el doc no presentes en el XML (cuando el XML ya tiene pool) → `stripFromYjs`: borra el id + sus descendientes (por `parent`) de `Y.Map('elements')`, re-encodea (`mergedStateB64`), escribe `yjs_documents.state` con `last_seq=0` y borra `yjs_updates` del diagrama.
3. Backup automático (`pre-fix-ghost-<ts>.json`) antes de aplicar.

### Por qué importa (la mina del export)
En `src/utils/bpmExport.ts` (~línea 673), al exportar `.bpm` un participante **sin shape** recibe **bounds default 900×300** → reaparece **VISIBLE** al reimportar. Por eso el ciclo manual "exportar→borrar→importar" **resucitaba** ghosts invisibles como pools visibles. Limpiar el fantasma del XML **antes** de exportar cierra esa mina.

---

## 7. `diagram-restore.mjs` — rollback

Restaura desde un backup local. Escribe: `diagrams` (upsert, re-crea si fue borrado) + `yjs_documents.state` = estado del backup con `last_seq=0`, y **borra** `yjs_updates` del diagrama (el estado fusionado lo reemplaza → restauración exacta, con comentarios).

```powershell
node scripts/diagram-restore.mjs <archivo> <diagramId>          # dry-run
node scripts/diagram-restore.mjs <archivo> <diagramId> --yes    # aplica uno
node scripts/diagram-restore.mjs <archivo> --all --yes          # aplica todo el backup
```

⚠️ **`--all` de un backup viejo re-crea corrupción ya arreglada/borrada.** Prefiere restaurar **por diagrama**. No respalda/restaura colaboradores/roles/proyectos ni thumbnails.

---

## 8. Concurrencia (importante)

`fix-ghost --yes` y `restore --yes` **escriben** en prod:
- Escribir un diagrama que alguien **edita en vivo**: su sesión (con el estado en memoria) puede **re-introducir** el fantasma en su próximo guardado, o su guardado puede pisar el fix (los scripts de escritura no usan CAS).
- Editar **otro** diagrama = sin efecto (cada write toca solo su `diagram_id`).
- **Recomendación:** con pocos usuarios, pídeles pausar 30s, corres el script, listo. No hay urgencia (los RESIDUO son invisibles).

Los scripts de **solo lectura** (scan, backup) no corrompen nada, pero leen varios MB por corrida → no los corras en bucle ni durante uso intenso. Usa `--from-backup` para escanear sin tocar la DB.

---

## 9. Notas técnicas / gotchas aprendidos

- **Regex de Postgres:** `\b` **NO** es límite de palabra en Postgres ARE → un scan SQL con `\b` dio falsos "0 pools en XML" (falso "72 diagramas rotos"). En JS `\b` sí funciona. Detectar pools debe ser en JS o con substring en SQL, nunca con `\b` en Postgres.
- **Dos dialectos de XML:** la app guarda `<bpmn:participant>` y `<participant>` (sin prefijo). Todo regex debe ser agnóstico: `<(?:\w+:)?participant…`.
- **`updated_at` como token de versión:** el trigger `diagrams_set_updated_at` lo mueve en cada UPDATE server-side → sirve de versión para CAS sin columna nueva (ver el CAS del guardado en el ADR).
- **El candado `createShape`** (en `YjsBpmnBinding.ts`, desplegado) evita que una pool ajena se **dibuje** aunque esté en el doc → un CONTAMINADO "pool ajena en Yjs" puede estar oculto en la app, pero sigue siendo basura a limpiar.

---

## 10. Flujo recomendado

```powershell
# 1. Foto fresca (1 lectura a la DB)
node scripts/diagram-backup.mjs create -m "chequeo semanal"

# 2. Diagnóstico offline (0 lecturas)
node scripts/scan-pool-location.mjs --from-backup

# 3. Si hay CONTAMINADO/RESIDUO → (con usuarios en pausa)
node scripts/fix-ghost.mjs            # dry-run
node scripts/fix-ghost.mjs --yes      # aplica (backup auto)

# 4. Confirmar
node scripts/scan-pool-location.mjs --from-backup   # elegir el backup nuevo

# 5. Rollback si algo salió mal
node scripts/diagram-restore.mjs <backup-limpio> <diagramId> --yes
```
