---
id: PLAN-023
titulo: Validacion de integridad referencial en el servidor
estado: todo
creado: 2026-08-11
cerrado:
aprobado_por:
relacionados: [MASTER-PLAN-019, EXP-003, EXP-005, EXP-007, EXP-008, DEC-011]
---

# Fase 3 · Validación de integridad referencial

> **Solo integridad referencial. Nunca reglas semánticas de BPMN.** El usuario dibuja lo que quiera.

## Objetivo

Que el servidor rechace las operaciones que dejarían el documento **referencialmente roto**, convirtiendo cinco defensas dispersas en el cliente en una regla que se impone una vez.

## La distinción que define el alcance

| Nivel | Qué es | ¿Se valida? |
|---|---|---|
| **1. XML bien formado** | el archivo parsea | sí — es corrupción |
| **2. Integridad referencial** | toda referencia apunta a algo que existe | **sí — es corrupción** |
| **3. Reglas semánticas BPMN** | una compuerta debe tener >1 salida, un evento de inicio no tiene entradas… | **NO** |

El nivel 3 queda **explícitamente fuera**. draw.io y Bizagi tampoco lo imponen. Un diagrama "incorrecto" según el estándar es una decisión legítima del usuario; un diagrama con un flujo que apunta a la nada es un archivo roto.

## El problema concreto

Dos usuarios pueden hacer cada uno un cambio localmente válido que juntos rompen el documento:

```
A borra la tarea T
B crea un flujo con targetRef="T"
→ <sequenceFlow targetRef="T"/>  apuntando a nada
```

El XML parsea. Pero al importar, bpmn-js falla o crea una conexión colgante.

**Un CRDT converge, pero no garantiza validez.** Yjs llega a *un* estado consistente en todos los clientes — puede ser un grafo roto de forma determinista. Eso es lo que ni Yjs ni un servidor que solo hospede el documento resuelven.

## Precondiciones

PLAN-021 cerrado. Puede ir en paralelo con PLAN-022.

## Pasos

### 1 · Catálogo de invariantes referenciales

Cerrar la lista antes de escribir código. Punto de partida, derivado de los incidentes reales:

| Invariante | Incidente que lo motiva |
|---|---|
| `sourceRef`/`targetRef` de un flujo referencian elementos existentes | el caso de arriba |
| Todo elemento tiene un padre existente (proceso, pool o carril) | [EXP-003](../../experience/003-contaminacion-de-pools-entre-diagramas.md) |
| Todo `BPMNShape`/`BPMNEdge` referencia un elemento del modelo | [EXP-005](../../experience/005-veneno-de-overlay-de-pool-en-el-doc-yjs.md) |
| No hay dos elementos con el mismo `id` | [EXP-007](../../experience/007-flechas-duplicadas-por-divergencia-de-id-de-conexion.md) |
| Un elemento pertenece a un solo padre | [EXP-003](../../experience/003-contaminacion-de-pools-entre-diagramas.md) |

La lista sale de la experiencia, no del estándar. **Cada invariante debe poder citar un incidente o un modo de fallo concreto**; si no, no entra.

### 2 · Validar sobre el estado resultante, no sobre la operación

Una operación aislada no dice si rompe algo: hay que aplicarla y comprobar el resultado. Aplicar sobre una copia, validar, y aceptar o descartar.

### 3 · Qué hacer al rechazar

**No basta con descartar**: el cliente ya aplicó el cambio localmente y creería que se guardó. El servidor debe devolver el estado correcto para que el cliente lo adopte.

El usuario ve que su acción "se deshizo". Es peor que no poder hacerla, así que **preferir prevenir en el cliente** cuando sea posible —los candados que ya existen— y dejar el servidor como red de seguridad, no como interfaz principal.

### 4 · Registrar cada rechazo

Con el código de invariante violada. Un rechazo frecuente indica un hueco en las defensas del cliente, no una validación que sobra.

### 5 · Modo permisivo primero

Durante la fase, **registrar sin rechazar**. Mide cuántas operaciones legítimas se rechazarían por error antes de que el rechazo afecte a nadie. Solo activar el rechazo cuando el ruido sea cero.

## Criterios de aceptación

- El catálogo está cerrado y cada invariante cita su motivo
- Ninguna regla semántica de BPMN: el usuario puede dibujar una compuerta sin salidas, un evento de inicio con entradas, o un flujo entre lo que quiera
- Reproducir el escenario "A borra / B conecta" deja el documento íntegro
- En modo permisivo, cero rechazos de operaciones legítimas durante un periodo acordado
- Un rechazo deja al cliente en el estado correcto, no en uno divergente

## Riesgos

**Rechazar operaciones legítimas.** Es el riesgo principal: una validación demasiado estricta rompe el uso normal. Mitigación: el paso 5, modo permisivo con medición previa.

**Deslizarse hacia el nivel 3.** Empezar con integridad referencial y acabar imponiendo el estándar porque "ya que estamos". Mitigación: cada invariante debe citar un incidente real; ninguno de los cinco es semántico.

**Duplicar la lógica del cliente.** Los candados de `createShape` y los guards del binding hacen comprobaciones parecidas. Mitigación: son capas distintas a propósito — el cliente previene, el servidor garantiza. La duplicación aquí es deliberada, como en DEC-005.

## Registro de ejecución

(se rellena durante la ejecución)

## Resultado

(se rellena al cerrar)
