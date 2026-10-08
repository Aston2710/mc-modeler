---
id: PLAN-040
titulo: Núcleo de dominio del conector — modelo semántico, layout, XML, edición y validación
estado: en-progreso
creado: 2026-10-08
cerrado:
aprobado_por:
relacionados: [MASTER-PLAN-038, DEC-011, DEC-013, EXP-018, EXP-022]
---

# Núcleo de dominio: `src/domain/bpmn-model/`

Fase 1 de [MASTER-PLAN-038](038-master-plan-conector-mcp.md). Sin cambios de BD. Puro: sin DOM, React ni bpmn-js. Lo usan el servidor MCP y las pruebas; **la SPA no lo importa** (verificado en el bundle).

| Archivo | Qué |
|---|---|
| `modelo.ts` | Contrato semántico (pools, carriles, nodos por tipo, flujos, mensajes) y límites |
| `validarModelo.ts` | Integridad referencial, **no** reglas de BPMN (DEC-011) |
| `layout.ts` | Layout propio: columnas por camino más largo (ciclos neutralizados), filas por carril asignadas en profundidad y reservando el recorrido de las flechas largas, subprocesos recursivos, eventos de borde |
| `trazado.ts` | Flechas con el `BizagiLayouter` del cliente, ejecutado con formas simuladas |
| `construirXml.ts` | Modelo → XML con el moddle `flujo` de la app; relectura antes de devolverlo |
| `editar.ts` | `agregar_nodo`, `conectar`, `renombrar` y `eliminar` sobre XML existente; todo o nada; no toca lo que no se nombra; se niega si el XML tiene partes que moddle no entiende |
| `simplificar.ts` | XML → estructura legible; lo que no tiene equivalente va a `otros` |
| `validarXml.ts` | La `validateDiagram` de la app, ejecutada sobre moddle |

Además, **`validation.ts` (D7)**: ahora comprueba los procesos dentro de pools. Antes nunca lo hacía, porque solo buscaba formas `bpmn:Process`.

## Estado de ejecución — 2026-10-08

- ✅ 47 pruebas nuevas (`construirXml`, `editar`, `validation`); todos los XML se abren con el `importXML` real de bpmn-js sin avisos.
- ✅ Ida y vuelta con un XML que imita producción, con `bizagi:` (atributo y `extensionElements`), `flujo:manualRoute` y anotación: lo no tocado sale idéntico.
- ✅ Revisión visual en la app de los cuatro casos. Defecto de compuertas encontrado y corregido, con su prueba de regresión.
- ☐ Ida y vuelta con 1–2 diagramas **reales** de producción con `bizagi:` (15 en producción), cargados en el laboratorio. Requiere el visto bueno para manejar datos reales.

## Fuera de alcance

Subprocesos enlazados (diagramas hijo), anotaciones, grupos y fases como entrada del modelo: se conservan al editar, pero no se crean.
