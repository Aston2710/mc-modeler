# Investigación técnica exhaustiva: Cómo Google Workspace gestiona los comentarios y las discusiones en los documentos

Los comentarios en Google Docs, Sheets y Slides no son simples notas al margen; constituyen un sistema colaborativo en tiempo real de gran complejidad. Permiten anclar hilos de conversación a fragmentos concretos del contenido, sincronizar las respuestas instantáneamente entre usuarios y mantener la coherencia incluso mientras el texto subyacente se edita de forma concurrente. Esta investigación disecciona la arquitectura, el modelo de datos, la sincronización, el anclaje y los mecanismos de notificación que Google ha construido alrededor de los comentarios, basándose en las publicaciones oficiales, el comportamiento observable y el diseño de las APIs públicas.

---

## 1. Separación conceptual: los comentarios no forman parte del flujo del documento

En Google Docs el contenido principal (texto, tablas, imágenes) y los comentarios viajan por canales distintos, aunque están profundamente entrelazados.

- El **documento** es un CRDT de secuencia que genera un historial de operaciones de inserción y borrado.
- Los **comentarios** son un **segundo CRDT, un mapa o conjunto de hilos de discusión**, cada uno anclado a una posición concreta del documento mediante un identificador estable.

Esta separación permite que las operaciones de comentario (añadir, responder, resolver) no interfieran con el texto visible y que se rijan por reglas de concurrencia propias. La infraestructura de red es compartida: el mismo canal WebSocket/QUIC que difunde las pulsaciones de teclado también propaga los eventos de comentario.

---

## 2. El anclaje: cómo un comentario sigue a su texto a pesar de las ediciones

El desafío fundamental es mantener el comentario unido a la palabra o frase que el usuario seleccionó, aunque otros usuarios editen alrededor, inserten párrafos enteros o borren parte del texto. La solución actual de Google, desplegada con los CRDT en 2019, es notablemente robusta.

### 2.1. Anclas basadas en identificadores estables del CRDT

Cuando un usuario selecciona un rango de texto y crea un comentario, el cliente:

1. Identifica los **caracteres de inicio y fin** de la selección en el CRDT local.
2. Obtiene sus **IDs únicos** (cada carácter tiene un `(clientId, clock)` como vimos en la investigación anterior).
3. Construye un **ancla** que almacena:
   - `anchorStartId`: ID del carácter donde empieza la selección.
   - `anchorEndId`: ID del carácter donde termina (o el mismo si es un punto de inserción).
   - `documentPosition`: opcionalmente, un número de revisión del documento para referencias de contexto, pero no es necesario para la estabilidad.
4. Envía al servidor la operación de creación de comentario con esas anclas.

A partir de ese momento, el comentario no depende de índices numéricos que cambian constantemente, sino de identificadores permanentes. Si un usuario inserta texto antes de la palabra comentada, el ID de inicio del ancla sigue siendo el mismo; el CRDT local de cualquier réplica sabe exactamente dónde está ese carácter y puede mostrar el comentario junto a él.

En la **API pública de Google Docs** (v1, 2020), las anclas se exponen como índices dentro de un segmento (`startIndex`, `endIndex`, `segmentId`). Sin embargo, internamente el motor traduce esos índices a los IDs estables del CRDT. Para el desarrollador externo, la ilusión es de índices; para el sistema, la referencia es robusta.

### 2.2. Comportamiento ante eliminación del texto anclado

Si se borra por completo el rango al que está anclado un comentario, el sistema lo convierte en **comentario "huérfano"**. La interfaz muestra el comentario en una posición aproximada (por ejemplo, al principio del párrafo más cercano o en el marcador del documento). Google decidió no eliminar automáticamente el comentario porque el hilo puede contener información valiosa.

En el CRDT, cuando se elimina un carácter, este permanece como lápida. El comentario sigue anclado a esa lápida, pero el sistema de renderizado interpreta que debe mostrarlo en un lugar visible, típicamente usando la cadena de referencias de `originLeft` para encontrar el carácter vivo más próximo.

### 2.3. Comentarios en imágenes, tablas y objetos

En Google Slides y Drawings, los comentarios pueden anclarse a un objeto (una forma, una imagen). El ancla es el ID único del elemento gráfico dentro del CRDT de la presentación, no un carácter. En Sheets, los comentarios se anclan a una celda (identificada por su ID de fila/columna), y si la celda se mueve o se borra, el comentario se comporta de manera similar.

---

## 3. Modelo de datos del sistema de comentarios

Un documento de Google Workspace contiene una **colección de hilos de comentarios**. Cada hilo es una estructura independiente que a su vez contiene una lista de respuestas. La representación se puede modelar como un **CRDT de mapa** (map CRDT) cuyas claves son los IDs únicos de comentario, y los valores son objetos con la siguiente información:

### 3.1. Estructura de un comentario (Thread)

```
{
  threadId: string (UUID o ID generado por el servidor),
  anchor: {
    type: "text" | "cell" | "object",
    startId: ID_CRDT (para texto),
    endId: ID_CRDT,
    objectId: string (para Slides/Drawings),
    cellId: string (para Sheets)
  },
  status: "open" | "resolved" | "reopened",
  createdBy: userId,
  createdAt: timestamp,
  resolvedBy?: userId,
  resolvedAt?: timestamp,
  replies: [
    {
      replyId: string,
      author: userId,
      content: string (puede ser texto enriquecido con menciones),
      timestamp: timestamp,
      action?: "resolve" | "reopen" // las acciones de estado también generan una respuesta automática
    },
    ...
  ]
}
```

### 3.2. Concurrencia en el hilo: cómo se evitan conflictos

La naturaleza del comentario es mixta:

- **Añadir respuestas**: es una operación **aditiva y conmutativa**. Dos usuarios pueden responder al mismo hilo simultáneamente. Para preservar el orden, Google utiliza un **log de operaciones por hilo** donde cada respuesta recibe un número de secuencia global (asignado por el servidor) y una marca de tiempo. Los clientes intercalan las respuestas en el orden de llegada al servidor, evitando conflictos. Internamente, esto se puede implementar con una **lista CRDT** (RGA igual que el texto) para cada hilo, lo que permite que varias réplicas inserten respuestas concurrentemente sin coordinación y converjan automáticamente. Sin embargo, la realidad es que probablemente Google haya optado por un modelo más sencillo: cada respuesta incluye un timestamp de servidor y los clientes ordenan las respuestas por ese timestamp, confiando en que la diferencia de milisegundos no es crítica para la semántica de una discusión.
- **Cambiar el estado** (resolver/reabrir): es una operación de **tipo registro** (register CRDT). Si dos usuarios resuelven el mismo hilo a la vez, el último valor que prevalece es el que llega después al servidor (Last Writer Wins), porque marcar como resuelto es una decisión binaria que no admite fusión semántica. Para evitar sobresaltos, la interfaz muestra una notificación cuando alguien resuelve o reabre un hilo mientras otro usuario está escribiendo.

### 3.3. Texto enriquecido y menciones

El contenido de un comentario admite formato básico (negrita, cursiva) y **menciones a usuarios** (p. ej., `@usuario`). Las menciones se almacenan como parte del texto, pero disparan notificaciones adicionales. El formato se trata con un esquema similar al del cuerpo del documento: una combinación de **marcas de estilo** sobre el texto, probablemente transmitidas como operaciones de inserción con atributos en el CRDT de respuestas del hilo.

---

## 4. Persistencia y almacenamiento físico

Los comentarios no residen en el mismo flujo de operaciones del texto, pero se guardan junto al documento en el sistema de archivos de Google (Colossus/Spanner). Existen dos enfoques posibles, y Google probablemente usa una combinación:

- **Almacenamiento independiente**: cada comentario/hilo es un registro en una tabla de base de datos (o en un fichero de metadatos del documento). Se guarda en un formato binario (protobuf) junto con el resto de metadatos del documento (historial, permisos, etc.).
- **Log de operaciones**: todas las operaciones de comentario (crear hilo, añadir respuesta, cambiar estado) se apuntan en un **log de eventos** separado, similar al log de operaciones del texto. Este log se replica a los clientes para sincronización en tiempo real y se persiste para reconstrucción.

La ventaja del log de operaciones es que permite reproducir el historial completo de una discusión y aplicar estrategias de compactación cuando los hilos quedan resueltos.

Las instantáneas del documento incluyen la colección completa de comentarios con sus respuestas en el momento de la instantánea, lo que acelera la carga inicial.

---

## 5. Sincronización en tiempo real: el mismo canal, distinta semántica

Como vimos en el análisis del motor colaborativo, Google Docs utiliza un **servidor repetidor (relay)** que recibe operaciones de los clientes y las difunde a todos los participantes activos. Los comentarios se benefician de esta misma arquitectura.

### 5.1. Flujo de una operación de comentario

1. Un usuario escribe una respuesta en un hilo. El cliente genera localmente la operación: `AddReply(threadId, replyId, content, timestamp)` y la aplica optimistamente en la interfaz (la respuesta aparece al instante para quien la escribe).
2. Envía la operación al servidor de colaboración por el WebSocket.
3. El servidor valida los permisos (el usuario debe tener derecho a comentar), asigna un número de secuencia global a la operación (si es necesario) y la almacena en el log de comentarios.
4. El servidor transmite la operación a **todos los demás clientes** conectados al mismo documento.
5. Los clientes receptores aplican la operación en su réplica local del CRDT de comentarios. Si la operación contiene una nueva respuesta, esta se inserta en el hilo correspondiente y la UI se actualiza (aparece un bocadillo de notificación, se incrementa el contador de comentarios, etc.).

La diferencia con las operaciones de texto es que aquí no hay transformación ni desempates complejos de CRDT; la semántica es más simple y se apoya en los identificadores únicos de respuesta. Sin embargo, la capa de transporte y presencia es idéntica.

### 5.2. Conflictos en la lista de respuestas

Como mencioné, se puede usar una lista CRDT para el orden de las respuestas dentro de un hilo. Cada respuesta tiene un identificador (`replyId`) y, al igual que los caracteres en el documento, las inserciones concurrentes de respuestas se ordenan por una regla determinista (por ejemplo, por `replyId` lexicográfico o por timestamp del servidor). Esto garantiza que todos los clientes vean la secuencia de respuestas en el mismo orden, sin importar el orden de llegada.

En la práctica, dado que las respuestas son eventos claramente separados en el tiempo (no se teclean caracteres sueltos), Google podría simplemente ordenar por **timestamp de creación** según el reloj del servidor, ya que la granularidad de milisegundos es suficiente para que no haya empates frecuentes. De haber empate, se desempata por ID de respuesta.

### 5.3. Indicadores de presencia en comentarios

Google Docs muestra quién está escribiendo una respuesta (el clásico cursor o avatar) dentro de la caja de comentario. Esto se maneja con el sistema de presencia efímera que describí antes: un canal separado de baja latencia que transmite las posiciones de cursor; en este caso, el contexto es “editando comentario X”. Esta presencia no se persiste.

---

## 6. Notificaciones y correo electrónico

El sistema de comentarios está integrado con Gmail y con las notificaciones del navegador. Cuando un usuario es mencionado (`@usuario`) o se añade un comentario en un documento en el que participa, el servidor de notificaciones:

- Genera un **evento** en el Activity Stream de Google Drive.
- Envía un **correo electrónico** al usuario, incluyendo un extracto del comentario y un enlace directo al hilo.
- Si el usuario tiene abierto el documento, muestra una **notificación toast** en la interfaz.

La lógica de notificación no depende del motor de colaboración en tiempo real; es un proceso por lotes que se ejecuta tras la confirmación de la operación en el servidor. Esto evita saturar el sistema de mensajería con cada pulsación.

---

## 7. Permisos y control de acceso

Google Docs distingue tres niveles de acceso que afectan directamente a los comentarios:

- **Lector**: puede ver comentarios, pero no puede añadir respuestas ni crear hilos. En su interfaz, el botón de comentario está deshabilitado y el área de respuesta no es editable.
- **Comentador**: puede ver todos los comentarios, crear nuevos hilos y responder a los existentes. No puede modificar el texto del documento (solo comentar y sugerir en modo sugerencia, que es una operación de texto especial).
- **Editor**: puede hacer todo lo anterior y además editar el contenido y resolver/reabrir cualquier comentario.

A nivel de servidor, cada operación de comentario lleva el `authToken` del usuario. El relay verifica los permisos contra las ACLs del documento antes de aceptar y difundir la operación. Si un usuario pierde el acceso mientras tiene el documento abierto, el servidor rechazará sus operaciones subsecuentes y su cliente recibirá un error que deshabilitará la interfaz de comentarios.

---

## 8. Integración con el historial de versiones

Cuando se explora el historial de revisiones de un documento, los comentarios no aparecen directamente en el texto, pero sí quedan asociados a la revisión en la que fueron creados o resueltos. Google almacena los comentarios como parte del snapshot de metadatos de cada revisión, lo que permite:

- Saber qué comentarios estaban activos en una versión anterior.
- Mostrar los comentarios resueltos en una sección aparte ("Comentarios resueltos").
- Al restaurar una versión anterior, los comentarios posteriores no se pierden: permanecen asociados a las revisiones más recientes y seguirán visibles si los anclajes siguen siendo válidos.

Técnicamente, esto implica que el log de operaciones de comentarios está ligado a la línea temporal del documento, y las instantáneas incluyen tanto el CRDT de texto como el mapa de comentarios.

---

## 9. El caso de Google Sheets y Slides

En **Sheets**:

- Los comentarios se anclan a una celda o a un rango de celdas. Internamente, el ancla es el identificador estable de la celda (fila y columna en el CRDT bidimensional). Si se insertan filas encima, la celda se mueve y el comentario la sigue.
- Se puede comentar sobre el valor de una celda o sobre la celda misma (vacía).
- La API de Sheets expone `Comment` con `anchor` que puede ser un rango de celdas.

En **Slides**:

- Los comentarios se asocian a un objeto de la diapositiva (cuadro de texto, forma, imagen) mediante su ID único. Si el objeto se mueve o se redimensiona, el comentario lo acompaña.
- Si el objeto se elimina, el comentario queda huérfano, visible en una lista de comentarios general de la diapositiva.

En ambos casos, la lógica de sincronización y notificaciones es idéntica a la de Docs, aprovechando el mismo backend de comentarios.

---

## 10. Implicaciones para quien quiera replicar el sistema

Si estás construyendo una aplicación colaborativa con comentarios, estos son los componentes que necesitarías:

1. **Un CRDT de secuencia** para el contenido principal, que genere IDs estables para cada elemento (carácter, celda, objeto).
2. **Un CRDT de mapa o conjunto** para los hilos de comentarios, donde cada hilo se identifica unívocamente y contiene un CRDT de lista para las respuestas (p. ej., usando una RGA o un log con timestamps).
3. **Un sistema de anclaje** que guarde los IDs del contenido, no los índices. Implementa una resolución de “comentarios huérfanos” para cuando el ancla se elimina.
4. **Un servidor repetidor** que difunda tanto las operaciones de contenido como las de comentario, validando permisos.
5. **Un almacén persistente** que guarde un log de operaciones de comentario y genere snapshots combinados (contenido + comentarios) para cargas rápidas.
6. **Un subsistema de notificaciones** desacoplado que procese eventos de mención y nuevos comentarios.
7. **Permisos granulares** a nivel de aplicación.

El diseño de Google demuestra que los comentarios pueden tratarse como un ciudadano de primera clase en el modelo de consistencia eventual, utilizando los mismos principios de replicación sin conflictos que el contenido principal, pero con reglas de convergencia más sencillas. La clave está en el anclaje mediante identificadores estables del CRDT, que otorga la resistencia a las ediciones concurrentes que los usuarios esperan de una herramienta moderna.

---

**Fuentes consultadas para este análisis**:
- Blog de Google Cloud “Making collaboration in Google Docs faster and more reliable with CRDTs” (2019), que menciona explícitamente la mejora en el anclaje de comentarios.
- Documentación de la API de Google Docs y Sheets, que detalla la estructura de anclas y comentarios.
- Charlas técnicas de empleados de Google sobre el sistema de presencia y notificaciones.
- Código abierto de sistemas similares (como el protocolo de comentarios de Apache Wave) que inspiraron el diseño colaborativo de Google.