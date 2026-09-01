---
id: EXP-018
titulo: Extender un tipo concreto de BPMN en el moddle corrompe el nombre del elemento en el XML
estado: activo
severidad: alta
fecha_deteccion: 2026-08-23
fecha_cierre:
componentes: [src/bpmn/moddle/flujo.json, current_xml, bpmn-moddle]
relacionados: [DEC-001, PLAN-034]
---

# Extender un tipo concreto de BPMN corrompe el nombre del elemento en el XML

## Síntoma

El XML canónico de producción no es BPMN válido. Medido el **2026-08-23** sobre los 177 diagramas:

| Elemento | Como se guarda hoy | Canónico |
|---|---:|---:|
| `sequenceFlow` | **139 diagramas** con `<bpmn:SequenceFlow>` | 1 |
| `group` | **40** con `<bpmn:Group>` | 0 |
| `subProcess` | **20** con `<bpmn:SubProcess>` | 0 |
| `definitions` | 0 | 162 |

XML distingue mayúsculas. El XSD de BPMN 2.0 define `sequenceFlow`, no `SequenceFlow`, así que **esos ficheros no validan** y una herramienta estricta puede rechazarlos o ignorar los elementos.

Nadie lo había notado porque bpmn-js **se lee a sí mismo sin problema**: importa igual de bien lo que escribe. El fallo solo se manifiesta al salir del ecosistema.

## Causa

Declarar `extends` sobre un tipo **concreto** en el paquete moddle:

```json
{ "name": "ManualRoute", "extends": ["bpmn:SequenceFlow"], ... }
{ "name": "PhaseName",   "extends": ["bpmn:Group"], ... }
{ "name": "LinkedDiagram", "extends": ["bpmn:SubProcess"], ... }
```

Cuando moddle registra una extensión sobre un tipo concreto, las instancias de ese tipo pasan a serializarse con el **nombre del tipo** (`SequenceFlow`) en vez de con el nombre canónico del elemento (`sequenceFlow`).

**Extender un tipo abstracto no tiene ese efecto.** `flujo:linkedImages` cuelga de `bpmn:FlowNode` y no rompe nada, porque `FlowNode` no se serializa nunca por sí mismo, solo sus concreciones.

Está medido, no deducido, en `src/bpmn/moddle/extensionCasing.test.ts`:

| `extends` sobre | ¿Conserva el nombre canónico? |
|---|---|
| `bpmn:Definitions` | **no** |
| `bpmn:Process` | **no** |
| `bpmn:Collaboration` | **no** |
| `bpmn:Group` | **no** ← en uso |
| `bpmn:SubProcess` | **no** ← en uso |
| `bpmn:SequenceFlow` | **no** ← en uso |
| `bpmn:FlowNode` (abstracto) | **sí** |

## Cómo se descubrió

Al añadir los datos de la cabecera de [PLAN-034](../plans/todo/034-vista-documento-y-cabecera-configurable.md) con `extends: ["bpmn:Definitions"]`, la prueba `normalizeBpmnXml.test.ts` falló: el elemento raíz salía `<bpmn:Definitions>`.

Esa prueba existía y cazó la regresión **del elemento raíz**. No existía equivalente para `sequenceFlow`, `group` ni `subProcess`, y por eso la misma rotura llevaba ahí desde que se añadieron esas extensiones.

## La vía correcta

`bpmn:extensionElements` con un tipo **suelto**, que es el mecanismo que BPMN prevé para esto y no toca el descriptor de ningún tipo:

```json
{ "name": "DocumentMeta", "superClass": ["Element"], "properties": [ … ] }
```

Los datos se guardan como `<flujo:DocumentMeta>` dentro del `<bpmn:extensionElements>` del elemento raíz. Verificado por roundtrip en `documentMeta.test.ts`: los datos van y vuelven completos y ni la raíz ni el proceso cambian de nombre.

## Estado: activo

**PLAN-034 no lo introduce ni lo arregla.** Sus datos usan la vía correcta desde el principio; las tres extensiones anteriores siguen rompiendo lo suyo.

Arreglarlo no es solo cambiar `flujo.json`: hay que decidir qué se hace con los **139 diagramas ya guardados**. Cambiar la declaración haría que a partir de ese momento se escribiera `<bpmn:sequenceFlow>`, dejando la base mezclada; y reescribir el XML de 139 diagramas en producción es una migración de datos con su propio riesgo. Merece su plan.

## Prevención

`extensionCasing.test.ts` **afirma la rotura actual**, no la ausencia de rotura. Es deliberado: si alguien corrige el enfoque o moddle cambia de comportamiento, esas pruebas fallarán y obligarán a volver aquí en vez de dejar el incidente desactualizado.

Regla para el futuro: **en `flujo.json`, `extends` solo sobre tipos abstractos.** Cualquier dato nuevo va en `extensionElements` con un tipo suelto. Y toda extensión nueva se acompaña de un roundtrip que compruebe que el XML sigue siendo canónico — que es la única forma de que esto no vuelva.
