# Plan de implementación — Limpieza de flechas duplicadas + cierre del pivote (Etapa 6)

**Proyecto:** mc-modeler
**Fecha:** 2026-07-17
**Base:** `ADR-persistence-source-of-truth.md`, `plan-implementacion-pivote-ADR.md`, `collab-duplicate-arrows-connection-id-divergence.md`, `routing-orthogonal-invariant-and-shape-invasion.md`
**Estado:** en ejecución (actualizado 2026-07-18)

---

## Estado de ejecución (2026-07-18)

| Fase | Estado | Nota |
|---|---|---|
| FASE 0 — cerrar el grifo | ✅ fix vivo (`a53241e`) | Gate multiusuario formal lo corre el usuario. |
| FASE 1 — backup | ✅ | `backups/pre-drop-yjs-2026-07-19T00-50-39-184Z.json` (121 diagramas) archivado. |
| FASE 2 — limpiar duplicados | ✅ **10/13 limpios**, 3 diferidos | Diferidos por estructura malformada (2 procesos / 1 plano) → la red de verificación bloqueó la escritura (sin corrupción). Los maneja el usuario a mano. Diferidos: `Pruebas` (svargas), `Proceso de Gestión de Translados` suelto (svargas), `Ciclo de Vida` (jhosberynojosa). |
| FASE 3 — Etapa 6 (drop Yjs) | ✅ **completa** | Borrado `yjsPersistence.ts` + migración `0018_drop_yjs_tables.sql` (`ba23580`). **DROP aplicado en producción 2026-07-18** (migración `20260719014131`): `yjs_documents`/`yjs_updates` eliminadas; 121 diagramas intactos, 0 sin XML. Scripts endurecidos con `fetchAllOptional`. |

**Corrección importante (descubierta 2026-07-18):** `YjsCommentBinding.ts` **NO es código muerto** — lo usa `useCommentSetup.ts` en **modo local** (persistencia de comentarios vía `localforage`, no toca las tablas Supabase `yjs_*`). El plan original lo listaba para borrar en Etapa 6; **se conserva**. Solo `yjsPersistence.ts` era muerto y se borró.

---

## 0. Contexto y diagnóstico (por qué existe este plan)

Tras el pivote ADR (fuente de verdad única = `current_xml`; Yjs = solo transporte de sesión, efímero), quedaron **dos residuos de datos** que este plan cierra:

1. **534 flechas duplicadas persistidas en `current_xml`** (13 diagramas). Causa: el bug de identidad de conexión (`YjsBpmnBinding.createConnection` creaba la conexión con `businessObject.id` automático ≠ id del elemento). Durante sesiones colaborativas / reconcile / late-join, se creaba una copia con id divergente junto a la del `current_xml`; el autosave persistía **ambas**. Ver `collab-duplicate-arrows-connection-id-divergence.md`. **El grifo ya está cerrado**: el fix (`bo.id = snap.id` + dedup) está deployado (`a53241e`).

2. **Tablas `yjs_documents` / `yjs_updates` congeladas** desde el pivote (~2026-07-03). La app **no las lee ni escribe** (test `sessionTransport.pivot` lo obliga). Son un snapshot histórico pre-pivote. El plan del pivote (Etapa 6) siempre contempló **dropearlas** en la limpieza final.

### Cifras (medidas contra la DB, 2026-07-17)
- Duplicados **reales** (en `current_xml`, lo que la app carga): **534, en 13 diagramas.** Peor: `AS-IS` (fmtovar, cribado de CV) 419; `Proceso de Gestión de Translados` (svargas) 56; `Trazabilidad de pedido` (mvasquez) 19; `Negociación Especial` (jredondo) 7.
- El scan combinado XML+Yjs daba 617 — **inflado** por el Yjs muerto; el número real es 534 (solo XML).
- El Yjs congelado contiene además contenido "solo-Yjs" (ej. ~26 elementos en Negociación) que NO está en `current_xml`. Como la app no carga Yjs, ese contenido **no se ve** (fue borrado tras el pivote o quedó obsoleto). El Yjs congelado es, de facto, un backup histórico.

### Estado de cumplimiento de las reglas
- **Código actual: cumple.** No genera nuevos incumplimientos (no persiste Yjs; no duplica al crear/mover — fix deployado).
- **Datos: incumplen parcialmente** (los 534 duplicados + Yjs congelado). Este plan los sanea.

---

## Objetivo
Todos los diagramas limpios (0 duplicados), regla "XML única verdad" cumplida también en datos, **sin perder ni un diagrama ni una conexión legítima**, y garantía de que no se generan duplicados nuevos (al mover, crear, refrescar, o con varios usuarios en el mismo diagrama).

## Criterio de duplicado (acordado, el más robusto)
Dos o más conexiones que comparten el **par ORDENADO `(origen, destino, tipo)`**. Justificación:
- **Ordenado** → `A→B` ≠ `B→A` (retorno legítimo, no se marca).
- **Por identidad de shape** → convergencia (varios orígenes→1 destino), divergencia (1 origen→varios destinos) y **gateways** tienen pares distintos → nunca se marcan. Solo el mismo par exacto agrupa.
- **Independiente de waypoints e ids** (que es justo lo que divergía por el bug).
- **Tipo normalizado** (`bpmn:SequenceFlow` ≡ `SequenceFlow` — el modeler serializa con inicial mayúscula).
- **Extremo null → se deja intacta** (por reglas de la app no debería existir; ante duda, no tocar).
- Al limpiar: **conservar 1 por grupo** (preferir la que tenga label), borrar el resto.

No hay categoría "ambigua": el usuario confirmó que en estos diagramas nunca se ponen a propósito dos flechas entre el mismo par (el estándar BPMN lo permite como flujo no controlado, pero es mala práctica y no se usa aquí).

---

## FASE 0 — Cerrar el grifo (verificar que no se generan nuevos duplicados)

Estado: el fix ya está deployado. Falta verificación formal.

1. **Confirmar fix vivo** (`a53241e`): `YjsBpmnBinding.createConnection` construye el `businessObject` y fija `businessObject.id = snap.id` (espejo de `createShape`) + red de dedup no destructiva. Tests verdes: `YjsBpmnBinding.connid.test.ts`, `YjsBpmnBinding.move.test.ts`.
2. **Gate multiusuario** (checklist, 2 navegadores, resto de usuarios en pausa):
   - Crear flecha, mover shapes (individual y multi-selección), refrescar, edición simultánea de A y B.
   - Late-join a mitad de sesión.
   - Confirmar **0 duplicados** en ambos clientes tras cada acción + tras refrescar.
3. (Opcional, refuerzo) test headless de idempotencia multi-doc: peer A crea conexión → aplicar update a doc B → assert 1 sola conexión en B (no duplica por broadcast).

**Gate de salida:** checklist multiusuario sin duplicados.

---

## FASE 1 — Red de seguridad

1. Backup fresco: `node scripts/diagram-backup.mjs create -m "pre-limpieza-duplicados"`.
2. Copiar `backups/` a disco externo / nube.
3. Herramienta **sin uso** durante la limpieza: si un usuario tiene abierto un diagrama con duplicados (canvas viejo) y guarda, re-introduce los duplicados. Coordinar ventana.

**Gate de salida:** backup verificado + ventana coordinada.

---

## FASE 2 — Limpiar los 534 duplicados en `current_xml`

**Enfoque: bpmn-js headless (NO cirugía de regex).** Importar cada `current_xml` en un modeler headless y borrar con `modeling.removeElements` → bpmn-js mantiene automáticamente la validez (refs `<incoming>`/`<outgoing>` del flowNode + `BPMNEdge` del DI). La reescritura a mano del XML es frágil y puede dejar refs colgantes; bpmn-js hace la contabilidad.

### 2.1 Ajustar el scan a XML-only
`scripts/scan-dup-arrows.mjs`: analizar **solo `current_xml`** (la app no carga Yjs). Deja de fusionar el Yjs muerto. Cifra real = 534. Mantener `--name`, `--csv`, `--from-backup`, `--dump`.

### 2.2 Nuevo `scripts/fix-dup-arrows.mjs`
- Reusa el harness headless de los tests (`bpmn-js/lib/Modeler` + shims jsdom SVG). Para node puro, usar `bpmn-moddle` headless si el render molesta; preferible el modeler completo para que `removeElements` haga el DI.
- Por diagrama:
  1. `importXML(current_xml)`.
  2. Agrupar conexiones del registry por `(source.id, target.id, tipo-normalizado)`.
  3. En cada grupo con ≥2: elegir la que **conserva** (con label > sin label; a igualdad, la primera por orden de documento). `modeling.removeElements([...las demás])`.
  4. `saveXML({ format: true })` → nuevo `current_xml`.
  5. Escritura con **CAS** (`diagramRepository.save` equivalente vía service_role: `UPDATE ... WHERE updated_at = <esperado>`), leyendo `updated_at` fresco antes.
- Flags: **`--dry-run` por defecto** (reporta por diagrama: qué pares, qué ids se borran, conteo antes/después), `--yes` aplica, `--id <uuid>` / `--name <substr>` para uno, `--all` para lote.
- **No toca Yjs.** Solo `diagrams.current_xml`.

### 2.3 Rollout incremental (verificar antes de escalar)
1. **Un diagrama** primero (ej. `Negociación Especial`): `--name "Negociación" --dry-run` → revisar salida → `--name "Negociación" --yes`.
2. **Verificar en la app**: abrir el diagrama, refrescar, confirmar a ojo que no faltan flechas legítimas ni quedan duplicados.
3. **Si algo falla** → `node scripts/diagram-restore.mjs <backup> <diagramId> --yes` (revierte solo ese diagrama).
4. **Si bien** → lote del resto: `--all --yes` (o por tandas por dueño).
5. **Verificar global**: `scan-dup-arrows.mjs` → **0 duplicados** en los 13.

**Gate de salida:** scan = 0 duplicados; spot-check en app de 2–3 diagramas.

**Rollback:** por-diagrama con `diagram-restore.mjs` desde el backup de FASE 1.

---

## FASE 3 — Etapa 6 del pivote: eliminar el Yjs congelado

Cierra la arquitectura. No urge (el Yjs congelado no afecta lo que se ve), pero elimina la basura y el riesgo de confusión futura.

1. **Backup final archivado** del estado Yjs — ✅ `backups/pre-drop-yjs-2026-07-19T00-50-39-184Z.json` (121 diagramas).
2. `drop table yjs_updates; drop table yjs_documents;` + quitarlas de publicaciones Realtime / policies — ✅ **aplicado 2026-07-18** (migración `20260719014131 / 0018_drop_yjs_tables`). Pre-flight verificado: 92 docs / 1183 updates, 0 FK, fuera de la publicación realtime. Post-drop: tablas no existen, 121 diagramas intactos, 0 sin XML.
3. Borrar código muerto: `src/collab/yjsPersistence.ts` — ✅ borrado. **`YjsCommentBinding.ts` NO se borra** (no es muerto: modo local lo usa vía `localforage`; ver corrección arriba). Scripts: **NO** se quitan las ramas de compat (`buildDoc`, `yjsMergedState`) — en su lugar se endurecieron con `fetchAllOptional` (tolera tablas ausentes → devuelve `[]`), así los scripts de diagnóstico/backup siguen funcionando solo-XML tras el drop.
4. ~~Endurecer `resolveParentOrSkip`~~ — **diferido** (no bloquea el cierre; el candado actual ya descarta parents no resolubles en la práctica). Anotado como deuda menor.
5. Actualizar docs: `scripts-diagnostico-backup-restore.md`, ADR §6, este plan — ✅ (esta actualización).

**Gate de salida:** ✅ app funcionando sin las tablas; suite verde (tsc + lint + 148 tests + build); scan sin regresiones; DROP aplicado.

---

## Riesgos y mitigaciones

| Riesgo | Fase | Mitigación |
|---|---|---|
| Un usuario re-guarda duplicados durante la limpieza | 1–2 | Ventana coordinada, herramienta en pausa |
| Borrar una flecha legítima por error | 2 | Criterio estricto (par ordenado + tipo); conservar 1 por grupo; bpmn-js hace el DI; dry-run + rollout incremental + restore por-diagrama |
| XML inválido tras la edición | 2 | Se usa bpmn-js (`saveXML`) que garantiza validez; `looksLikeBpmn` en el save |
| Pérdida de contenido pre-pivote al dropear Yjs | 3 | Backup archivado antes del drop; el contenido no se ve en la app de todos modos |
| Duplicado nuevo en multiusuario tras limpiar | 0 | Fix deployado + gate multiusuario antes de limpiar |

## Resumen en una frase
El código cumple (XML manda, no se persiste Yjs, no se duplica al crear/mover) y los **datos** ya se sanearon: **10/13 diagramas limpios** (3 diferidos por estructura malformada, los maneja el usuario). Cierre de arquitectura (Etapa 6) **completo**: código committeado (`ba23580`) + **DROP de las tablas Yjs aplicado en producción 2026-07-18** (121 diagramas intactos). Sin perder ni un diagrama.
