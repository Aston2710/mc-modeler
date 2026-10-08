---
id: PLAN-042
titulo: Etapa 2 — el cliente no pisa a un escritor externo, y modificar_diagrama
estado: en-progreso
creado: 2026-10-08
cerrado:
aprobado_por:
relacionados: [MASTER-PLAN-038, DEC-013, DEC-009, EXP-011, PLAN-036]
---

# Etapa 2: escritor externo y `modificar_diagrama`

Fase 3 de [MASTER-PLAN-038](038-master-plan-conector-mcp.md). **Es la puerta de `modificar_diagrama` en producción.**

## Cliente: opción C (`src/store/diagramStore.ts`)

Ante un conflicto de CAS con el contenido divergente **y nadie más en el canal**, `saveDiagram`:

- no reintenta;
- no adopta la versión ajena;
- avisa una vez con `flujo:save-conflict` y `{ externo: true }`;
- no vuelve a escribir ese diagrama hasta que el usuario recarga la versión del servidor (`refreshXml`).

Con pares en el canal, todo sigue como antes. Sin datos de presencia, se considera solo: pregunta en vez de pisar. El aviso tiene su propio texto (`conflict.externalMessage`).

**Coordinación:** [PLAN-036](036-borrador-local-de-trabajo-no-guardado.md) reutiliza la misma UI de conflicto.

## Servidor

`modificar_diagrama`, que **no existe** si no está `MCP_HABILITAR_MODIFICAR=1`:

- CAS sobre `version_esperada`, con conflicto que devuelve el estado actual;
- rol comprobado antes de escribir;
- operaciones validadas antes de la compuerta;
- **compuerta de presencia**, que falla cerrada;
- con `si_esta_abierto="copiar"`, el resultado va a un diagrama nuevo "(propuesta IA)".

## Estado de ejecución — 2026-10-08

- ✅ 5 pruebas nuevas en `diagramStore.cas.test.ts`. Las existentes pasan sin tocar aserciones.
- ✅ Integración: CAS, conflicto, dos escrituras concurrentes, viewer, compuerta con una pestaña simulada y copia.
- ✅ e2e en la app real:
  - dos navegadores abiertos → el MCP no modifica;
  - cerrados → modifica, y se ve al reabrir;
  - **opción C:** un cambio externo con el usuario solo no se pisa tras dos ciclos de autoguardado, y aparece el aviso.
- ☐ Desplegar la SPA a producción (aprobación) y **después** activar `MCP_HABILITAR_MODIFICAR=1`.
- ☐ Riesgo residual, mitigado y sin resolver: pestaña de fondo desactualizada que vuelve con otra persona ya en el canal. Propuesta: revalidar `updated_at` al reactivar una pestaña cacheada. Sin hacer.
