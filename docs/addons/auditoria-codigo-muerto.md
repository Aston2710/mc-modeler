# Auditoría de código muerto e información obsoleta

**Fecha:** 2026-07-19 · Capítulo 4 de la auditoría. Decisión resultante: D-14 en `auditoria-decisiones.md`. Método: grafo de imports por grep (todo hallazgo verificado con búsqueda de llamadores, no supuesto).

---

## 1. Código muerto confirmado en `src/` — borrar

| Qué | Evidencia | Arrastra |
|---|---|---|
| `persistence/migrateLocalToCloud.ts` | 0 llamadores (ya asentado en D-06) | — |
| `utils/cn.ts` | 0 usos en todo src | deps `clsx` + `tailwind-merge` (solo las usa cn.ts) |

Falsos positivos descartados (verificados vivos): `persistence/index.ts` (importado como `@/persistence`), `i18n/index.ts` (`@/i18n`), `types/bpmn-moddle.d.ts` (ambient), `migratePhotoDiagrams` (lo usa ImageGallery), `en.json` (registrado en i18next).

## 2. Dependencias sin uso — desinstalar

| Paquete | Tipo | Evidencia |
|---|---|---|
| `html-to-image` | prod | 0 imports |
| `immer` | prod | 0 imports (Zustand se usa sin middleware immer) |
| `zod` | prod | 0 imports (estaba en el stack "planeado" del CLAUDE.md; nunca se adoptó) |
| `clsx` + `tailwind-merge` | prod | solo vía `cn.ts` muerto |
| `@testing-library/react` + `@testing-library/user-event` | dev | 0 usos en los 19 tests (los tests no testean componentes — coherente con D-13) |

Total: 5 deps de producción + 2 dev = menos superficie, menos npm audit, bundle más honesto.

## 3. Vivo solo para el modo local — decidir bajo D-06

`YjsCommentBinding.ts` + la rama local de `useCommentSetup.ts`: CRDT de comentarios completo con persistencia localforage que **solo corre cuando Supabase NO está configurado** (= sandbox de dev, según D-06). Mantener un Y.Doc + binding + persistencia solo para que el harness de desarrollo tenga comentarios es paridad de features que D-06 declaró no-objetivo.
**Opciones:** (a) retirarlo y que el modo local no tenga comentarios · (b) degradarlo a comentarios en memoria (store sin persistencia). Recomendación: (a) — nadie desarrolla la feature de comentarios contra el sandbox sin BD real.

## 4. Información obsoleta — actualizar o retirar

| Qué | Problema | Acción |
|---|---|---|
| **`CLAUDE.md`** | Dice "Production scaffolding phase", stack "planned", estructura "will be". La app lleva meses en producción con colab, imágenes y notificaciones. **Desorienta cada sesión de IA y a cualquier dev nuevo** — es el doc más leído del repo. | Reescribir YA (prioridad #1 de este capítulo) |
| `README.md` | 2 líneas placeholder | Escribir README real (qué es, cómo correr, cómo testear, mapa de docs/) |
| `BPMN_MODELER_PROJECT.md` (1.375 líneas) | Spec pre-implementación; roadmap v1.0 ya superado; mezcla lo construido con lo descartado | Marcar como HISTÓRICO en el encabezado o partir: lo vigente → docs/, lo demás archivado |
| `docs/Arquitectura.xml` | Mapa gigante legacy | Retirar al cerrar D-05 (ya decidido) |

## 5. Carpetas del repo

| Carpeta | Estado | Acción |
|---|---|---|
| `backups/` | Dumps JSON de producción **con emails de usuarios** (`con-emails-*.json`). Protegida: en `.gitignore:83` y 0 archivos trackeados (verificado). Riesgo residual: datos personales en disco compartible/respaldable fuera de git. | Aceptable como está; ideal a mediano plazo: mover dumps con PII fuera del árbol del repo |
| `scripts/` | Mezcla: one-shots YA ejecutados (`fix-ghost`, `fix-dup-arrows`, `scan-dup-arrows`, `migrate-comments`, `scan-pool-location`) · pendiente (`migrate-images` — esperar a correrla) · herramientas permanentes (`diagram-backup/restore`, `_lib`, `help`) | Tras correr migrate-images: mover one-shots ejecutados a `scripts/archive/` con nota de cuándo corrieron |
| `dist/` | No trackeada ✓ | — |
| `.syntesis/` | Análisis de Bizagi — intencional | Mantener |

## 6. Resumen ejecutable (D-14)

1. Borrar: `migrateLocalToCloud.ts` · `cn.ts`
2. Desinstalar: `html-to-image` `immer` `zod` `clsx` `tailwind-merge` `@testing-library/*`
3. Decidir y ejecutar retiro de `YjsCommentBinding` (recomendado: sin comentarios en modo local)
4. **Reescribir `CLAUDE.md`** (refleja producción, no scaffolding) + README real + marcar spec como histórico
5. `backups/` ya protegida por .gitignore (PII fuera del árbol a mediano plazo) · archivar one-shots de `scripts/` tras migrate-images
