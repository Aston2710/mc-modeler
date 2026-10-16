/**
 * Guía de modelado BPMN del equipo, servida por el conector.
 *
 * Fuente: la skill `modelado-bpmn` del equipo y
 * docs/context/elementos-y-reglas-de-modelado.md. En claude.ai no hay skills
 * instaladas, así que el conector lleva la guía consigo: un resumen en las
 * `instructions` del servidor (RESUMEN_GUIA) y el texto completo en la tool
 * `guia_modelado` (GUIA_MODELADO).
 *
 * Es la convención POR DEFECTO, no una restricción. Mc-modeler no impone
 * reglas a quien dibuja ("el usuario dibuja lo que quiera"); la guía solo
 * orienta lo que genera la IA, y si el usuario pide otra cosa, se hace lo que
 * pide. El conector nunca rechaza un diagrama por la guía: como mucho devuelve
 * sugerencias (src/domain/bpmn-model/sugerenciasGuia.ts).
 *
 * Si la guía del equipo cambia, se actualiza aquí y se redespliega el conector.
 */

export const RESUMEN_GUIA =
  'Al crear o modificar diagramas sigue por defecto la guía de modelado del equipo (tool guia_modelado; consúltala antes del primer diagrama de la conversación): ' +
  '1) cada tarea se nombra con un verbo en 3.ª persona del singular + objeto, corto ("Valida factura", no "Validar factura" ni "Validación de factura"); los eventos nombran un hecho ("Factura recibida"); ' +
  '2) ninguna compuerta va directamente a un evento de fin: entre medias, una tarea que nombre el trabajo de esa rama; ' +
  '3) el detalle no va en el nombre de la tarea; ' +
  '4) un carril por actor, actores externos en otro pool conectados con mensajes, flujo de izquierda a derecha. ' +
  'Es la convención por defecto, NO una restricción: si el usuario pide expresamente otra cosa (otros nombres, otros símbolos, otra estructura), hazlo como lo pide, sin discutir ni negarte. ' +
  'Las tools pueden devolver "sugerencias_guia": no son errores; aplícalas en la siguiente iteración salvo que contradigan lo que pidió el usuario.'

export const GUIA_MODELADO = `# Guía de modelado BPMN del equipo

Es la forma en que el equipo modela procesos. Síguela por defecto cada vez que generes o corrijas un diagrama.

## Quién manda
La guía es la convención por defecto, no una prohibición. Mc-modeler deja que cada persona dibuje lo que quiera. Si el usuario pide expresamente otra cosa (un nombre distinto, otro tipo de tarea, un evento con símbolo, una estructura diferente), hazlo como lo pide, sin discutir ni negarte. Puedes mencionar la guía una vez si ayuda, pero la decisión es suya.

## Regla 1 · Nombre de tarea: verbo en 3.ª persona del singular
Toda tarea (y sus variantes: usuario, servicio, manual, script, envío, recepción, regla de negocio) empieza por un verbo conjugado en 3.ª persona del singular, como si el proceso narrara lo que hace el actor de ese carril.

| Bien | Mal | Por qué |
|---|---|---|
| Realiza autenticación | Se autentica | reflexivo: esconde quién actúa |
| Consume API | Consumir API | infinitivo: nombra la capacidad, no el paso |
| Valida factura | Validación de factura | sustantivo: nombra el área, no la acción |
| Registra el pago | Registrando el pago | gerundio: describe un estado |
| Envía notificación | Notificación enviada | participio: es un resultado, y eso es un evento |

- El sujeto es el carril: quien ejecuta ya está dicho por el carril o el pool.
- Los eventos NO siguen esta regla: nombran un hecho ("Factura recibida", "Vence el plazo").
- Subprocesos: trátalos igual que una tarea.

## Regla 2 · Ninguna compuerta desemboca directamente en un fin
Entre una compuerta (exclusiva, paralela, inclusiva, de eventos, compleja) y cualquier evento de fin va siempre al menos una tarea que nombre el trabajo de esa rama ("Rechaza la solicitud", "Archiva el expediente", "Notifica al cliente"). La compuerta decide, no hace. Si una rama de verdad no tiene trabajo, sobra: quítala.

## Regla 3 · La tarea es la acción, no la explicación
El nombre es corto: verbo + objeto, una línea. Una condición, una regla de negocio o una aclaración no van en el nombre: van en una anotación enlazada a la tarea. Una tarea con varias líneas de texto está mal nombrada o debería dividirse en dos.
(El conector todavía no crea anotaciones: si hace falta el detalle, díselo al usuario en el chat para que lo añada en la app.)

## Composición
- Un carril por actor dentro del mismo pool. Cada tarea va en el carril de quien la ejecuta.
- Un actor externo (cliente, proveedor, otro sistema u otra empresa) va en un pool aparte, conectado con "mensajes", nunca con flujos de secuencia.
- Carriles de arriba abajo en el orden en que intervienen los actores; si el usuario ya fijó un orden, respétalo.
- El proceso corre de izquierda a derecha: inicio a la izquierda, fin o fines a la derecha.
- Ramas paralelas de una compuerta: cada una con su trabajo; si son de actores distintos, en sus carriles.
- Usa el tipo de tarea y el disparador de evento que correspondan cuando aporten información (tarea de usuario, de servicio, de envío; inicio por mensaje, temporizador…). Si el usuario pide un símbolo concreto, úsalo.

## Lo que hace el conector por ti
El conector calcula coordenadas, tamaños (eventos 36×36, tareas 90×60, compuertas 50×50) y el trazado de las flechas. Tú solo describes el modelo: pools, carriles, nodos, flujos y mensajes.

## Flujo de trabajo sugerido
1. Identifica los actores: un carril por actor, o un pool aparte si es externo.
2. Traza el camino feliz de inicio a fin.
3. Nombra cada tarea con la regla 1.
4. Añade las compuertas y comprueba que cada rama termina en una tarea antes del fin (regla 2).
5. Revisa que ningún nombre de tarea se haya alargado (regla 3).
6. Crea el diagrama y revisa las "sugerencias_guia" que devuelva el conector; corrígelas en la siguiente iteración salvo que el usuario haya pedido otra cosa.
`
