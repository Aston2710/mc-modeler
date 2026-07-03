# Fix: "un diagrama sobre otro" reaparece en producción — veneno histórico en la capa Yjs

**Proyecto:** mc-modeler
**Stack:** React 19 · bpmn-js v18 · Yjs CRDT · Supabase (Postgres + Realtime + Storage) · localforage
**Archivos centrales:** `src/collab/YjsBpmnBinding.ts` (candado) + `src/collab/YjsBpmnBinding.guard.test.ts`
**Severidad:** Alta — corrupción visual/persistida (pool de un diagrama dibujada sobre otro)
**Fecha:** 2026-07-02
**Estado:** Candado implementado (local, verificado), pendiente commit/deploy. Diagramas corruptos existentes: saneados manualmente por el usuario (borrar + reimportar). Escaneo org-wide: sin más contaminación real.

---

## 1. Síntoma

En producción, tras desplegar el fix de contaminación de canvas (fencing `canvasSession`, commits p1–p3) y el rework de persistencia append-only, un diagrama (**S4-PLN-F-07**, proyecto CEDI) volvió a mostrar **una pool de otro diagrama superpuesta**. El usuario lo "recuperaba" con Ctrl+Z sobre la pool ajena → exportar `.bpm` → reimportar como diagrama nuevo → borrar el corrupto.

Existía **desde antes** de los fixes → señal de daño histórico, no nuevo.

---

## 2. Investigación (evidencia, no teoría)

Se inspeccionó S4-PLN-F-07 en la DB y se decodificó su doc Yjs.

**`current_xml` (canónico): LIMPIO.**
- 1 pool (`Part_PLN_F_07`), 1 proceso (`Proc_PLN_F_07`), 15 shapes, 11 edges, **0 duplicados** en DI.
- Inventario semántico coherente: `s, a1, f1, f2, a2, g1, e2, a3, f3, e1` + lanes + anotaciones. Cada elemento una vez.

**Doc Yjs (snapshot congelado `yjs_documents.state`): ENVENENADO.**
- 39 elementos: 17 propios + **una pool entera ajena del diagrama VEN-F-19**:
  ```
  Part_VEN_F_19  (Participant) "Inventario disponible y prorrogado"  parent=Collab_VEN_F_19
  Lane_asesor_VEN_F_19 "Asesor de Ventas"
  Lane_afv_VEN_F_19 "AFV 2.0"
  TextAnnotation_0if6rly, Flow_VEN_F_19_0..7, Association_1r53bl7
  ```
- La pool ajena tiene `parent=Collab_VEN_F_19`, una **raíz de colaboración que no existe** en S4-PLN-F-07.

---

## 3. Causa raíz

**Veneno histórico en la capa Yjs, re-inyectado en cada apertura por un `reconcile` aditivo y un fallback inseguro de `createShape`.**

Secuencia al abrir el diagrama:
1. Se importa `current_xml` (limpio) → canvas correcto.
2. `useCollab` carga el snapshot Yjs (envenenado, era pre-fix) → doc.
3. El binding arranca y `reconcileCanvasToDoc` (aditivo, `YjsBpmnBinding.ts`) ve la pool `Part_VEN_F_19` en el doc y no en el canvas → la **crea**.
4. `createShape` resolvía el parent así:
   ```ts
   const parent = (snap.parent && registry.get(snap.parent)) || m.get('canvas').getRootElement()
   ```
   Como `Collab_VEN_F_19` **no existe** aquí, caía a **la raíz del canvas** → la pool ajena se dibujaba encima. = "un diagrama sobre otro".

**Por qué persistía** ("lo borro, guardo, recargo y sigue"): el veneno vive en el snapshot Yjs congelado, no en `current_xml`. Tras la Fase 5 (clientes no escriben `yjs_documents`), ese snapshot quedó inmutable desde el cliente; y si el binding no llegaba a sincronizar el borrado al log, al recargar el `reconcile` lo volvía a inyectar.

**Origen del veneno:** contaminación cruzada de la era pre-fix (antes de `canvasSession`). El fencing evita contaminación **nueva**, pero **no limpia** snapshots ya envenenados. Por eso reaparecía.

**Por qué el método del usuario funciona:** reimportar `.bpm` crea un diagrama con **id nuevo** → sin snapshot Yjs → limpio.

---

## 4. Solución aplicada: candado en `createShape` (defensa estructural)

El punto único por el que pasa toda creación de shape. Se reemplaza el fallback-a-raíz por resolución estricta del parent, **sin romper** los diagramas legítimos cuya pool vive en Yjs (ver §5).

### `resolveParentOrSkip` (helper puro, exportado, testeable)

```ts
export function resolveParentOrSkip(
  snapParent: string | null | undefined,
  registry: RegistryLike,
  canvasRoot: RootLike | null | undefined,
  canvasHasParticipants = false
): unknown | null {
  if (!snapParent) return canvasRoot ?? null
  const p = registry.get(snapParent)
  if (p) return p
  if (canvasRoot && snapParent === canvasRoot.id) return canvasRoot
  // parent declarado pero no resoluble:
  if (canvasHasParticipants) return null   // contaminación: pool ajena extra → DESCARTAR
  return canvasRoot ?? null                 // pool propia (XML solo-proceso) → permitir
}
```

### Uso en `createShape`

```ts
const canvasRoot = m.get('canvas').getRootElement()
const canvasHasParticipants = registry.filter((el) => el.type === 'bpmn:Participant').length > 0
const parent = resolveParentOrSkip(snap.parent, registry, canvasRoot, canvasHasParticipants)
if (parent === null) {
  console.warn('[collab] elemento descartado: pool/elemento ajeno (parent no resoluble con pools ya presentes)', snap.id)
  return
}
```

### `orderShapeAdds` (contenedores primero)

Al reconciliar un lote, crear `Participant → Lane → resto`, para que un hijo legítimo no se descarte por orden (su pool padre existe antes). Aplicado en `reconcileCanvasToDoc` y `applyRemote`.

```ts
export function orderShapeAdds(snaps: ElementSnapshot[]): ElementSnapshot[] {
  const rank = (t: string) => (t === 'bpmn:Participant' ? 0 : t === 'bpmn:Lane' ? 1 : 2)
  return [...snaps].sort((a, b) => rank(a.type) - rank(b.type))
}
```

**Dos capas ahora:**
1. **Fencing** (`canvasSession`, ya en prod) — evita que contaminación **nueva** entre a un diagrama sano.
2. **Candado `createShape`** — aunque un doc tenga veneno (histórico o futuro), un elemento con parent ajeno **no se dibuja** (cuando ya hay pool propia).

---

## 5. La trampa que evitó un segundo bug (por qué el candado es "seguro")

La **primera** versión del candado descartaba TODO elemento con parent no resoluble. El escaneo org-wide reveló que eso **habría roto 23 diagramas legítimos**: muchos tienen `current_xml` **solo-proceso** (sin `<participant>`), con su **única pool viviendo en Yjs** con parent `Collaboration_1` que no está en el canvas. El candado v1 los habría **borrado la pool**.

Distinción correcta (v2, la aplicada):
- **Contaminación:** parent ajeno no resoluble **Y el canvas ya tiene una pool propia** → la ajena es extra → descartar.
- **Benigno:** parent no resoluble **Y el canvas no tiene ninguna pool** → es la pool propia (XML solo-proceso) → crear bajo la raíz.

Regla: `canvasHasParticipants` decide. Cambiar un bug por otro = evitado.

---

## 6. Escaneo org-wide (alcance de la corrupción)

Se decodificaron todos los docs Yjs (103 diagramas, ~96 con Yjs) fuera del contexto (dump a archivo + script Node con `yjs`), para no inflar contexto.

**Método de detección (firma dura, tras 2 correcciones de heurística):**
- Contaminado = doc con **≥2 raíces de colaboración distintas** entre sus pools, **O** una pool que no está en un `current_xml` que **sí** declara pools.
- Correcciones necesarias: (1) el regex inicial solo casaba `<bpmn:participant>`; la app usa **dos dialectos** (`<bpmn:participant>` y `<participant>` sin prefijo) → regex agnóstico al prefijo. (2) la raíz de colaboración nunca está en el mapa de elementos → no usarla como señal de "ajeno".

**Resultados:**
- **Cuenta jredondo (62 visibles, 53 con Yjs):** 2 contaminados reales — **Anulación de un pedido** (pool ajena `Part_LOG02` "LOG-02 Circuito de carga y facturacion") y **Facturación (2)** (pool extra `Participant_1` "Proceso de facturación"). Ambos saneados por el usuario (borrar+reimportar). `bpmn_interaccion_v5`: falso positivo (pool propia, XML sin prefijo) — sano.
- **Fuera de la cuenta (27 con Yjs):** **0 contaminación real.** 23 caen en el patrón benigno "pool propia en Yjs, XML solo-proceso" (dueños fmtovar/svargas/otros; p. ej. "Reclutamiento de personal para ventas" se repite porque son sub-diagramas del mismo proceso).

**Conclusión:** la corrupción estaba acotada; no hay más casos reales en la org. La repetición de nombres de pool = sub-diagramas del mismo proceso, no contaminación.

---

## 7. Integridad referencial al sanear (borrar + reimportar)

Verificado en la DB:
- `yjs_updates.diagram_id` y `yjs_documents.diagram_id` tienen **`ON DELETE CASCADE`** hacia `diagrams`.
- Borrar un diagrama → auto-elimina su log + snapshot. **0 huérfanos** (verificado: 0 log, 0 snapshot huérfanos).
- Reimportar → id nuevo → log/snapshot frescos, sin relación con el viejo.
- Los huecos en la secuencia `bigint identity` del log son normales (cursor de orden, no contador).

Método del usuario = referencialmente limpio por diseño.

---

## 8. Verificación

- `resolveParentOrSkip` + `orderShapeAdds`: **10 tests** (`YjsBpmnBinding.guard.test.ts`) — contaminación descartada, pool-propia-sin-XML preservada, orden de contenedores. Pasan.
- `tsc -b` + `vite build`: limpios.

---

## 9. Archivos

| Archivo | Cambio |
|---|---|
| `src/collab/YjsBpmnBinding.ts` | `createShape` usa `resolveParentOrSkip` (candado seguro); `orderShapeAdds` aplicado en `reconcileCanvasToDoc` y `applyRemote`; helpers exportados |
| `src/collab/YjsBpmnBinding.guard.test.ts` | **Nuevo.** 10 tests de regresión |

---

## 10. Pendiente

1. Commit + deploy del candado + test (usuario).
2. Imágenes embebidas base64 → mover a Storage (otra conversación; ver ADR).
3. Decisión de arquitectura sobre fuente de verdad — ver `ADR-persistence-source-of-truth.md`.
