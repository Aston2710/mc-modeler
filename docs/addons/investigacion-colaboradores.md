# Replicando el motor colaborativo de Google Workspace: arquitectura interna, CRDT y detalles de implementación

Para construir un sistema de edición colaborativa en tiempo real como Google Docs, necesitas dominar tres pilares técnicos: el **modelo de datos replicado y libre de conflictos**, la **arquitectura de comunicación cliente‑servidor** y la **gestión del ciclo de vida de los documentos** (snapshots, lápidas, sin conexión). Aquí desgloso cada capa al nivel de detalle suficiente para que puedas replicarla, basándome en las publicaciones oficiales de Google y en el estado del arte de los CRDT.

---

## 1. El corazón: un CRDT de secuencia (tipo RGA)

Google abandonó la Transformación Operacional (OT) en 2019 y pasó a un **CRDT de operaciones conmutativas** para la secuencia de caracteres. El algoritmo concreto es una variante del **RGA (Replicated Growable Array)**, a veces llamado **RGA/Logoot**. A continuación te explico cómo funciona exactamente y cómo se implementa.

### 1.1. Identificador único por carácter

Cada operación de inserción genera un **identificador globalmente único y ordenable** para el carácter. Una implementación típica usa:

```
{
  clientId: string (UUID de la sesión),
  clock: number (contador monótono local)
}
```

- `clientId`: identifica de forma única la réplica (navegador). Puede ser un UUID v4 generado al abrir el documento, o un identificador de sesión asignado por el servidor.
- `clock`: un entero que se incrementa con cada operación local (empezando por 0 o 1). De esta forma, todas las operaciones de una misma sesión tienen un orden total local.

El par `(clientId, clock)` constituye un identificador único global porque ningún cliente reutiliza números de reloj. Además, estos identificadores **son comparables** (orden lexicográfico de cliente + reloj) y se usan para romper empates en inserciones concurrentes (ver más abajo).

En Google Docs probablemente el `clientId` es un identificador de "sesión de edición" asignado por el servidor cuando el usuario se une, y el `clock` es un número secuencial. La charla de 2011 sobre OT mencionaba el uso de identificadores de sesión para el desempate; el salto a CRDT mantiene ese esquema.

### 1.2. Representación del documento como un conjunto de nodos

El documento **no es un array de caracteres**, sino un grafo acíclico dirigido o un árbol de nodos que mantiene el orden:

Cada carácter es un nodo con:
- `id`: el identificador único (clientId, clock).
- `value`: el carácter (string de longitud 1, o " " para espacios, etc.).
- `originLeft`: el ID del carácter que estará inmediatamente a la izquierda cuando se inserte. Puede ser un ID especial como `ROOT` o `BEGIN` para el principio del documento.
- `originRight`: el ID del carácter que estará inmediatamente a la derecha. En el algoritmo RGA original solo se usa `originLeft` y luego se ordena, pero algunas variantes almacenan ambos. Google probablemente solo guarda `originLeft` porque al recibir la operación se conoce el vecino izquierdo en ese momento.

Eliminación no borra nodos, sino que añade una **marca de lápida** (`deleted: true`). Esto preserva las referencias de `originLeft` para futuras inserciones.

### 1.3. Operaciones locales y aplicación inmediata

Cuando un usuario pulsa una tecla, el cliente:

1. Determina la posición de inserción: identifica el carácter a la izquierda del cursor. Si el cursor está al principio, el vecino izquierdo es `BEGIN`.
2. Crea un nuevo ID incrementando su `clock` local.
3. Construye la operación: `insert(value, leftOrigin = vecinoIzquierdo.id, id = nuevoId)`.
4. Inserta el nuevo nodo en su estructura local: se añade a una lista enlazada o árbol ordenado.
5. Reordena localmente según las reglas de orden (detalladas después).
6. La operación se **aplica inmediatamente en la UI** (optimista) y se encola para enviar al servidor.

Para borrar: el cliente crea `delete(idDelCarácter)` y marca el nodo como borrado en local.

### 1.4. Reglas de ordenación determinista (la clave de la convergencia)

Todos los clientes mantienen el documento ordenado según el siguiente criterio, que **no depende del orden de llegada de las operaciones**:

Dados dos nodos `A` y `B`:
1. Si uno es ancestro del otro en la cadena de `originLeft` (por ejemplo, `B.originLeft == A.id`), entonces `A` va antes que `B`. Esto es la relación "sucede a".
2. Si ambos tienen el mismo `originLeft` (inserciones concurrentes en el mismo punto), se comparan sus IDs: el orden lexicográfico de `(clientId, clock)` decide cuál va primero. Como `clientId` es una cadena fija, el resultado es determinista en todas las réplicas.
3. En caso de que tengan distintos `originLeft` pero no haya una relación de ancestro directa, se recorre la cadena hacia atrás hasta encontrar un ancestro común y se aplica la misma lógica.

Esta ordenación produce un **orden total consistente** que no requiere coordinación adicional. Cualquier cliente que reciba las mismas inserciones, sin importar el orden, puede reconstruir la secuencia ordenada.

En implementaciones reales se suele usar una **estructura de árbol balanceado** (p. ej., un árbol rojinegro o un AVL) que mantiene los nodos según esta función de comparación. Cada inserción local y remota provoca una inserción en el árbol, con complejidad logarítmica. El texto renderizado se obtiene recorriendo el árbol en in‑orden y omitiendo los nodos marcados como eliminados.

### 1.5. Cómo se integran formatos de texto (negritas, cursivas, etc.)

En Google Docs, cada operación de inserción puede incluir **atributos de formato** (llamados "runs"). En lugar de insertar caracteres de uno en uno con formato, el sistema agrupa escrituras contiguas con el mismo estilo. Internamente, el documento se modela como una secuencia de **"segmentos" (spans)**, no solo caracteres. Cada segmento tiene un `id` y un `length`.

Una inserción de la palabra "Hola" en negrita podría generar:
- Operación `insertSpan(text: "Hola", format: {bold: true}, leftOrigin: ... )`.
El CRDT convierte eso en múltiples caracteres con el mismo `originLeft` inicial y atributos heredados, o bien utiliza un `originLeft` por cada carácter, generando varios IDs consecutivos. Google probablemente genera un ID por cada carácter (o por cada punto de código Unicode) para permitir ediciones posteriores a nivel de carácter sin dividir segmentos complicados.

Las eliminaciones de formato (quitar negrita) se tratan como **inserciones de texto sin formato y eliminación del texto con formato**, o como operaciones de "cambio de formato". En la práctica, el formato se maneja con un **CRDT de registro (register CRDT)** asociado a cada rango, pero Google ha confirmado que para propiedades como negrita y color **sigue usando Last Writer Wins** en el motor CRDT, porque fusionar estilos concurrentes es muy complejo y rara vez tiene una intención clara. Así, si dos usuarios cambian el color al mismo tiempo, el último que el servidor recibe prevalece, igual que antes. La diferencia es que ahora el "último" se determina con marcas de tiempo de servidor o con un reloj híbrido.

### 1.6. Manejo de listas, tablas e imágenes

Las estructuras complejas se descomponen en operaciones de CRDT sobre un **árbol del documento**:

- **Listas**: cada elemento de lista es un párrafo con un nivel de sangría y un tipo de viñeta. Las operaciones de "aumentar/disminuir sangría" modifican atributos de párrafo (LWW).
- **Tablas**: se representan como una secuencia de filas, cada fila con una secuencia de celdas. Insertar una columna concurrentemente se traduce en insertar una celda en cada fila. El orden de las columnas se determina con los mismos identificadores CRDT.
- **Imágenes y dibujos**: se tratan como caracteres especiales con su propio `id`. En el CRDT, una imagen es un carácter `OBJECT` con un atributo de URL. Insertar una imagen equivale a insertar un carácter especial. La selección y el redimensionado se sincronizan con LWW o operaciones de propiedad.

---

## 2. Arquitectura de red: servidor como repetidor y almacén

Con CRDT, el servidor de colaboración se simplifica drásticamente. No ejecuta lógica de convergencia; solo **recibe, almacena y retransmite operaciones**. Su papel es comparable a un pub/sub inteligente con persistencia.

### 2.1. Flujo de comunicación

1. **Establecimiento de sesión**:
   - El cliente se conecta por WebSocket (o QUIC) a un frontend de Google (GFE) que enruta al servidor de colaboración adecuado.
   - El servidor carga el estado del documento: entrega un **snapshot reciente** (estado completo + versión) y las operaciones posteriores a ese snapshot desde el log.
   - El cliente reconstruye el CRDT local aplicando las operaciones en orden (cualquier orden funciona, pero para eficiencia aplica según orden de llegada lógico).
   - Se une a un "room" de presencia.

2. **Envío de operaciones locales**:
   - El cliente envía un mensaje `Op(insert/delete, ...)` al servidor, incluyendo el ID de la operación y posiblemente la versión del documento que conocía (el último número de secuencia global, aunque con CRDT esto no es necesario para transformación, sí es útil para garantizar orden de difusión).
   - El servidor valida la operación (control de acceso, que el documento existe, etc.), la escribe en un **log de operaciones distribuido** y la difunde a todos los demás clientes activos en la sala, incluyendo al remitente como confirmación (aunque el remitente ya la aplicó localmente, la confirmación del servidor puede usarse para marcar la operación como "reconocida").

3. **Recepción de operaciones remotas**:
   - Cada cliente recibe mensajes `RemoteOp` y los aplica directamente en su CRDT local. La aplicación es instantánea: inserta/quita nodos según la operación, reordena si es necesario, y actualiza la UI.

### 2.2. Persistencia y log de operaciones

Google almacena el log de operaciones en un sistema de ficheros distribuido de baja latencia, probablemente **Colossus** (sistema de archivos) o **Spanner** (base de datos global). Cada operación se guarda con un **número de secuencia global** (global sequence number) que asigna el servidor al recibirla. Este número es solo para ordenar en el log y facilitar snapshots incrementales; la convergencia no depende de él.

El servidor genera periódicamente **snapshots completos** del documento aplicando todas las operaciones hasta un cierto número de secuencia. El snapshot consiste en el CRDT completo serializado (lista de nodos vivos y sus relaciones) y el valor de la secuencia global. Así, un cliente que se conecte puede descargar el snapshot más reciente y luego solo las operaciones posteriores.

### 2.3. Arquitectura de salas y escalado

Una misma "sala de edición" (documento) puede tener cientos de usuarios concurrentes. Para escalar, Google utiliza una arquitectura de **transmisión por repetidores en árbol (fan‑out)**. Un servidor "primario" recibe todas las operaciones y las distribuye a varios nodos repetidores, que a su vez las envían a los clientes. Esto reduce la carga de transmisión.

La lógica del CRDT permite que estas retransmisiones sean **sin orden garantizado**; las operaciones pueden llegar desordenadas a diferentes clientes, pero todos terminarán con el mismo estado. Esto simplifica la implementación del fan‑out porque no hace falta un orden total en la entrega.

---

## 3. Edición sin conexión y fusión automática

El offline es una de las grandes ventajas del CRDT frente a OT. La mecánica es directa:

- El cliente mantiene una **cola de operaciones locales no confirmadas**. Cuando se detecta falta de conexión, las operaciones se siguen generando y aplicando en local (con IDs que usan el reloj local que sigue avanzando).
- Al reconectarse, el cliente envía la cola entera de operaciones al servidor, en orden de reloj local.
- El servidor las recibe, las almacena en el log y las difunde a los demás. No necesita transformar nada porque las operaciones pendientes son válidas tal cual: sus `originLeft` referencian IDs que el servidor ya conoce (aunque mientras tanto otros hayan insertado caracteres con esos IDs). La regla de ordenación CRDT garantiza que las inserciones offline se colocarán correctamente aunque los vecinos de referencia hayan cambiado de posición relativa debido a ediciones remotas.
- Simultáneamente, el servidor envía al cliente que se reconectó las operaciones remotas generadas durante su ausencia. El cliente las aplica y el estado converge sin intervención.

No hay riesgo de conflicto: si dos usuarios insertan "Hola" y "Mundo" en el mismo lugar, ambos fragmentos aparecerán, en un orden determinista (p. ej., "MundoHola" basado en IDs). El usuario no pierde datos.

---

## 4. Presencia en tiempo real: cursores y selecciones

La presencia no usa CRDT porque es efímera y de alta frecuencia. Google la maneja como un canal separado y ligero:

- Cada pocos milisegundos (throttled a ~100 ms o similar), el cliente envía un mensaje de presencia: `{ userId, cursorPosition, selectionRange, color }`.
- El servidor de presencia mantiene un mapa `userId → estado de presencia` y difunde los cambios a los participantes de la sala.
- La `cursorPosition` se expresa como el ID del carácter a la izquierda del cursor (el mismo `originLeft`). Así, cuando el texto se mueve por ediciones concurrentes, el cursor sigue al carácter de anclaje.
- Si un cliente se desconecta, su entrada en el mapa expira (TTL de unos segundos) y se envía una baja automática.

La presencia no se persiste; es un sistema de alta velocidad, baja latencia, que probablemente usa **QUIC / WebRTC data channels** o WebSockets dedicados.

---

## 5. Sugerencias, comentarios y control de cambios

Las sugerencias (Suggesting mode) y los comentarios son **tipos de operación adicionales sobre el CRDT**, no metadatos separados.

- **Sugerir inserción**: operación `suggestInsert(text, leftOrigin, id, suggestionId)`. Se comporta como un insert normal pero con una bandera "es sugerencia" y un `suggestionId`. Visualmente se muestra resaltado.
- **Sugerir borrado**: `suggestDelete(targetId, suggestionId)`, que marca el carácter con una lápida de sugerencia en lugar de una lápida real, indicando que debería eliminarse si se acepta.
- **Aceptar sugerencia**: convierte la sugerencia en operación real (inserta el texto de verdad o elimina el carácter) y limpia el `suggestionId`.
- **Comentarios anclados**: un comentario es un objeto separado con su propio ID, que contiene el ID del carácter o rango al que se ancla (usando el ID del carácter inicial y final). Se almacena en un CRDT de mapa (Map CRDT) por documento, donde cada entrada es un hilo de comentarios. Añadir una respuesta a un hilo es otra operación de inserción en una secuencia CRDT por hilo. Así se mantiene la concurrencia sin conflictos.

---

## 6. Recuperación de basura (tombstone GC)

Los caracteres borrados permanecen para siempre como lápidas si no se limpian, lo que degrada el rendimiento. La solución es una **recolección de basura coordinada** basada en vectores de versión:

1. Cada cliente y el servidor mantienen un **reloj vectorial** con el contador máximo de operaciones visto de cada réplica.
2. Periódicamente, el servidor calcula el "mínimo común" de los relojes de todos los clientes activos (el punto hasta el cual todos han confirmado que han procesado todo lo anterior).
3. Cualquier lápida que fuera marcada antes de ese punto global puede ser eliminada de la historia porque ningún cliente va a referenciarla en futuras inserciones (pues su `originLeft` ya no sería usado como destino de nuevas operaciones, ya que el cliente que inserte después de ese carácter tendrá un reloj mayor y habrá visto la eliminación).
4. La eliminación real implica reescribir las referencias: todos los caracteres que tenían como `originLeft` la lápida se actualizan para apuntar al `originLeft` de la lápida, propagando el cambio (esto es delicado pero manejable si se hace en el snapshot). Google probablemente realiza esta compactación al generar snapshots: solo se incluyen los nodos vivos y se reencadenan los `originLeft` para saltar las lápidas.

---

## 7. Lecciones para construir tu propio sistema

Si quieres replicar Google Docs, estos son los pasos concretos y los desafíos técnicos:

- **Elige un CRDT de secuencia**: implementa RGA o Logoot. Yo recomendaría una variante con `(clientId, clock, siteId)` y `originLeft`. Existen bibliotecas (p. ej., Yjs, Automerge) que hacen exactamente esto; Yjs en particular usa un CRDT basado en RGA que ha sido probado a escala.
- **Define operaciones atómicas**: insertar un carácter, borrar un carácter, formatear un rango (esto último puede ser un dolor; puedes optar por LWW para atributos como Google). Para objetos estructurados, modela el documento como un árbol donde cada nodo tiene un ID y el CRDT maneja la secuencia de hijos.
- **Servidor ligero**: implementa un relay sobre WebSockets que persista operaciones en una base de datos tipo Kafka o en un log como Apache Pulsar. Asigna un número de secuencia global solo para ordenar el log, no para la convergencia.
- **Snapshots periódicos**: guarda el estado completo del CRDT serializado (puedes usar JSON o Protobuf) cada N operaciones o cada cierto tiempo. Para servir un documento, manda el último snapshot y luego las operaciones con número de secuencia mayor.
- **Cola offline en el cliente**: las operaciones locales se encolan y se envían cuando hay conexión. Usa la estrategia de "intento hasta confirmación del servidor".
- **Presencia**: un canal separado con actualizaciones throttleadas.
- **Pruebas de convergencia**: genera secuencias aleatorias de operaciones concurrentes y verifica que los estados finales sean idénticos. Esta fue la clave del éxito de Google con OT y sigue siendo imprescindible con CRDT.

En resumen, el secreto de la colaboración en Google Workspace descansa en un CRDT de secuencia que elimina la coordinación central para la convergencia, un servidor que hace de mero repetidor persistente, y una combinación de LWW para atributos efímeros. Entender estos tres bloques te permitirá construir un sistema colaborativo robusto y escalable, tal como lo hace Google hoy.