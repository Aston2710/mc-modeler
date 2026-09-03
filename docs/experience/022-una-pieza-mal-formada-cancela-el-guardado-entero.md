---
id: EXP-022
titulo: Una sola pieza mal formada en el árbol del modelo cancela el guardado del diagrama entero
estado: mitigado
severidad: critica
fecha_deteccion: 2026-09-02
fecha_cierre:
componentes: [src/hooks/useBpmnModeler.ts, src/bpmn/elements/NativeCopyPasteModule.ts, src/bpmn/model/sanitizeModelTree.ts, moddle-xml, bpmn-js-native-copy-paste]
relacionados: [PLAN-035, EXP-008, EXP-011, EXP-018, DEC-001]
---

# Una sola pieza mal formada cancela el guardado del diagrama entero

## Síntoma

El **2026-09-02 a las 21:13 UTC** una usuaria dejó de poder guardar el diagrama
`Entrega directa` (`bc32b555-6e4b-40ae-b77b-565f3d08bea6`). Siguió trabajando
alrededor de tres horas sobre un diagrama que ya no se podía persistir.

Dos avisos, que parecían dos fallos y eran **el mismo**:

| Acción | Aviso |
|---|---|
| Guardar | `Error al guardar el diagrama` — sin detalle |
| Exportar a `.bpmn` | `Error al exportar el diagrama` · `Cannot read properties of undefined (reading 'isGeneric')` |

Los dos caminos pasan por `exportXml()` → `modeler.saveXML()`. El toast de
guardado no muestra la causa y el de exportación sí, y por eso el mensaje real
solo se vio al intentar exportar.

## Estado de los datos

**La fila de Postgres nunca se corrompió.** Su `current_xml` era XML válido y
parseable, congelado en el último guardado bueno: 3.789 bytes, un pool, un
evento de inicio, una tarea y un objeto de datos. Todo lo dibujado después
—decenas de tareas, cuatro carriles, compuertas, notas— **existía solo en la
memoria de una pestaña de Chrome**.

Esto no es EXP-008. Ahí el dato guardado estaba corrupto; aquí el dato guardado
está sano y lo que no existe en ningún sitio es lo nuevo.

## Causa

El diagrama vive en memoria como un árbol de objetos `moddle`. Cada tipo generado
por la factoría lleva su descriptor **en el prototipo**, y el serializer lo lee
para saber cómo escribir la pieza (`moddle-xml/dist/index.js:1242-1248`):

```js
var elementDescriptor = element.$descriptor
var isGeneric = elementDescriptor.isGeneric   // ← revienta si no hay descriptor
```

En el árbol había **un objeto que no nació de esa factoría**: un objeto plano con
un `$type` y sin descriptor. Se dibuja bien y no molesta hasta que se guarda.

Y el serializer es **todo o nada**: no escribe el 99 % bueno y omite lo malo. Una
sola pieza así cancela el guardado **completo** del diagrama, de forma permanente,
hasta que alguien la quita. Ese es el defecto de diseño que convirtió un problema
pequeño en tres horas de trabajo irrecuperable.

### Los dos síntomas son distinguibles, y eso permite diagnosticar por el texto

Medido en `src/bpmn/model/sanitizeModelTree.test.ts` con un bpmn-js real:

| Qué hay en el árbol | Mensaje de `saveXML` |
|---|---|
| objeto plano (con `$type`) | `Cannot read properties of undefined (reading 'isGeneric')` |
| hueco (`undefined`) | `Cannot read properties of undefined (reading '$descriptor')` |

El mensaje de producción era el primero. **Lo que había era un objeto plano, no
un hueco** — y esa distinción descarta uno de los dos agujeros del portapapeles
como causa de este caso concreto.

### De dónde salió el objeto plano: NO está reproducido

Hay que decirlo claro, porque es la parte honesta del diagnóstico.

Descartado por lectura: **ningún sitio de `src/` construye objetos con `$type` a
mano.** Todas las escrituras al modelo pasan escalares por `updateProperties` /
`updateModdleProperties`; `elements/documentMeta.ts` usa `moddle.create`; y el
binding de Yjs construye siempre con `bpmnFactory.create`
(`YjsBpmnBinding.ts:227-247, 282-287`).

El único mecanismo del proyecto que reintroduce objetos nacidos fuera de la
factoría es **el copiar/pegar por el portapapeles del sistema**
(`bpmn-js-native-copy-paste`, entonces en `bpmn/config.ts`). Pasa la selección a
**texto** y la vuelve a fabricar al pegar con un reviver que tenía dos fallos
silenciosos (`lib/PasteUtil.js:47-51`): descartaba sin avisar lo que no
reconocía, y **dejaba pasar tal cual cualquier objeto que no le pareciera una
pieza**.

Pero **la vuelta completa del portapapeles sobre un diagrama corriente sale
limpia**: medido con el motor real en `elements/nativeCopyPaste.test.ts`, los
nodos vuelven todos con su descriptor y `saveXML` sobrevive. Así que el
copiar/pegar es el sospechoso por mecanismo, no por reproducción, y el
disparador exacto sigue sin identificarse. Candidatos no descartados: contenido
de portapapeles producido por un despliegue anterior (el portapapeles del
sistema sobrevive a los despliegues), y alguna vía de la propia librería que
estas pruebas no cubren.

**Por eso el arreglo principal no depende de conocer el disparador.**

### Efecto colateral que sí quedó probado

`$attrs` **no sobrevive al portapapeles**. Los atributos que moddle no reconoce
como propiedad de un tipo se guardan en `$attrs`, que **no es enumerable**, así
que `JSON.stringify` lo ignora sin más.

Consecuencia real, no teórica: copiar un objeto de datos con imágenes vinculadas
**pierde el vínculo**, porque `flujo:linkedImages` cuelga de `bpmn:FlowNode` y un
`bpmn:DataObjectReference` no es un FlowNode — así que ahí vivía en `$attrs`.
Pasaba **siempre**, en silencio, desde que existe la biblioteca de imágenes.

## No había ninguna red debajo

La lección más grave del incidente no es el bug, es esto:
`persistence/index.ts:16-18` elige **un solo** repositorio, en exclusiva. Con
Supabase configurado —producción— el repositorio de IndexedDB **no se instancia
nunca**. No hay borrador local, ni cola offline, ni sincronización diferida;
`diagramStore.cacheXml` solo escribe en Zustand, que es RAM.

Entre "alguien dibuja algo" y "Postgres lo confirma" el trabajo **no existe en
ningún sitio salvo la memoria del navegador**. Y ese hueco no lo abre este bug:
lo abre igual quedarse sin internet, cerrar el portátil, un choque de CAS o que
el navegador se caiga. Este incidente solo lo hizo visible, durante tres horas.

## Lo que sí funcionaba, y sirvió de salvavidas

Solo `.bpmn` y `.bpm` llaman a `getXml()` (`useExport.ts:341,346`). **PNG, SVG y
PDF van por `saveSVG()`** (`useExport.ts:349-392`) y no tocan el serializer de
moddle: seguían funcionando con el árbol roto. Es el camino para congelar el
trabajo cuando el guardado está muerto.

El SVG, además, conserva el `data-element-id` de cada elemento
(`ElementRegistry.js:1,54`, y `saveSVG` copia el marcado tal cual en
`BaseViewer.js:470-494`), así que sirve de acta forense con ids, posiciones y
textos. **No sirve para reconstruir**: no lleva tipos BPMN, ni origen y destino
de las flechas, ni pertenencia a pool o carril.

## Arreglo

[PLAN-035](../plans/todo/035-copiar-pegar-y-guardado-resiliente.md), dos capas
implementadas el 2026-09-02:

**El guardado repara y sigue** (`bpmn/model/sanitizeModelTree.ts`, conectado en
`useBpmnModeler.exportXml`). Si `saveXML` falla, se recorre el árbol, se
reconstruyen como piezas reales las que tengan un `$type` conocido, se quitan
las que no, y se reintenta **una vez**. Es **genérico a propósito**: cubre
cualquier origen de piezas mal formadas, incluido el disparador que no se
reprodujo.

**El copiar/pegar deja de producirlas** (`bpmn/elements/NativeCopyPasteModule.ts`,
fork de las ~100 líneas de la dependencia). Avisa de lo que no reconoce en vez de
tragárselo, hace viajar `$attrs` explícitamente, y **barre el árbol pegado** para
que no salga de ahí ningún objeto sin descriptor.

## Por qué `mitigado` y no `resuelto`

Porque la causa raíz —qué produjo el objeto plano— **no está identificada**. El
arreglo hace que el síntoma no cueste trabajo y que la vía conocida se cierre,
pero eso es exactamente la diferencia que este proyecto se niega a difuminar.

Se cerrará cuando se cumpla una de dos: que se reproduzca el disparador, o que
pase suficiente tiempo con el registro de `save.model_repaired` a cero como para
afirmar que ninguna vía sigue viva. Lo segundo **necesita PLAN-013**: hoy
`reportIncident` solo escribe en la consola del navegador, así que ese contador
no llega a nadie.

## Prevención

- **No unificar el saneo con la guarda de coordenadas no finitas.** Son
  opuestas y las dos son correctas: aquella se **niega** a guardar porque el dato
  está mal y escribirlo hace daño (fue lo que corrompió un diagrama en EXP-008);
  esta **repara** porque el dato está bien y solo estaba mal envuelto. Quien las
  vea como duplicadas y las junte reintroduce uno de los dos incidentes.
- **La reparación nunca en silencio.** `save.model_repaired` se registra con
  severidad `error` aunque el guardado salga bien, y sale un aviso persistente.
  Un arreglo automático y mudo es cómo esto vuelve dentro de un año.
- **`nativeCopyPaste.test.ts` afirma el comportamiento ROTO de la dependencia**,
  igual que `moddle/extensionCasing.test.ts`. Si algún día la arreglan, esas
  pruebas fallan y obligan a volver aquí a comprobar si el fork sobra — en vez de
  quedarse desactualizadas sin que nadie lo note.
- **El guardado todo-o-nada sigue siendo la fragilidad de fondo.** Mientras
  `current_xml` sea un documento entero (DEC-001) y se escriba de una pieza,
  cualquier defecto local del árbol es un defecto global del guardado.
