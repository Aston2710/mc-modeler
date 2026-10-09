# Informe: conector MCP de Flujo — Fase 3 (ensayo en un entorno alojado)

**Fecha:** 2026-10-08 / 2026-10-09 · **Solicitado por:** santiagojmg28
**Procedencia:** pruebas e implementación asistidas por Claude, sobre el plan aprobado ([MASTER-PLAN-038](../plans/todo/038-master-plan-conector-mcp.md), [DEC-013](../context/decisiones.md)). Continúa el [informe de la Fase 2](informe-mcp-fase-2.md).
**Ámbito:** un **entorno de ensayo propio**: una copia del esquema en un proyecto Supabase aparte y dos proyectos de Vercel en una cuenta personal. **Nada se ha aplicado a producción:** ni migraciones, ni configuración de Auth, ni despliegues.

> **Para el desarrollador principal.** Lo que hay que hacer para que esto funcione en producción está en [`mcp/README.md` → Puesta en producción](../../mcp/README.md#puesta-en-producción), paso a paso. Este informe explica qué cambió, cómo se probó y qué se encontró.

---

## 1. Resumen

La Fase 2 dejó el conector probado **solo en el laboratorio local**. Esta fase lo llevó a un entorno alojado real (Supabase en la nube con su servidor OAuth, Vercel, Claude como cliente) y, con lo que se vio usándolo, añadió cinco mejoras.

| # | Qué | Dónde | Toca BD |
|---|---|---|:-:|
| 1 | Las tareas crecen según su nombre: el icono ya no tapa la primera letra | `src/domain/bpmn-model/tamanoActividad.ts` | no |
| 2 | `renombrar` documentado para pools y carriles; nombres de tarea cortos | `mcp/src/herramientas.ts`, `mcp/src/esquemas.ts` | no |
| 3 | `modificar_diagrama` gana `agregar_pool` y `agregar_carril` | `src/domain/bpmn-model/editar.ts` | no |
| 4 | La portada genera las miniaturas que faltan (las de los diagramas del conector) | `src/utils/thumbnailBackfill.ts`, `src/bpmn/headlessModeler.ts` | no |
| 5 | La app guarda `element_count` (lo guardaba siempre a 0) | `src/domain/contarElementosXml.ts`, `src/store/diagramStore.ts` | no |

Además se fusionó `main` en la rama (correo al invitado y campanita en la portada), sin conflictos.

**Ninguno de los cinco cambia el esquema.** La única migración nueva respecto a la Fase 2 es la del compañero (`20261008163549_correo_al_invitar_por_email.sql`), que ya está en producción.

---

## 2. El entorno de ensayo

Sirve para repetir estas pruebas sin tocar producción. No hace falta para desplegar.

| Pieza | Cómo se montó |
|---|---|
| Base | Proyecto Supabase vacío. Se aplicaron, en orden, `20260813000000_baseline_produccion.sql`, `20260813225135_bucket_thumbnails_5mb.sql`, `20260823000000_projects_doc_template.sql`, `20261008120000_mcp_conector.sql` y `20261008163549_correo_al_invitar_por_email.sql`. `private.notification_config` **vacía**: así no sale ningún correo |
| Auth | Site URL y Redirect URLs apuntando a la app de ensayo. JWT con clave **ES256**. Servidor OAuth activado, **registro dinámico activado** y ruta de autorización `/oauth/consent` |
| App | Proyecto de Vercel desplegado con la CLI (`vercel --prod`), con `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` de la copia |
| Servidor MCP | Otro proyecto de Vercel, desplegado con `npm run build` + `vercel deploy --prebuilt --prod` desde `mcp/`, con las variables de `mcp/README.md` y `MCP_HABILITAR_MODIFICAR=1` |

Comprobación del esquema tras aplicarlo: 14 tablas en `public` (todas con RLS) y 3 en `private`, 44 políticas en `public` y 12 en `storage.objects`, 8 triggers, los dos buckets con sus límites (5 MB y 10 MB) y 5 tablas en `supabase_realtime`.

**Dos trampas de la CLI de Vercel**, encontradas al montarlo (ver también §6):

- `vercel link` crea un `.env.local` con `VERCEL_OIDC_TOKEN`. Y `vercel env pull`, **por defecto, sobrescribe `.env.local`**: en una copia del repo que guarde ahí secretos de producción, los borra. No usar `env pull` sin nombre de archivo.
- La CLI **no lee `.gitignore`**: sube todo lo que hay en la carpeta. Para desplegar la app con la CLI hace falta un `.vercelignore` de lista blanca. Se usó uno **solo en local**, sin commitear, porque en `main` también afectaría a los despliegues por Git.

---

## 3. Cambios de código

### 3.1 Tamaño de las tareas según el nombre

**Problema.** La paleta crea las tareas a 90×60. La IA escribe nombres de cuatro o cinco palabras: a ese tamaño la etiqueta ocupa tres líneas, sube hasta arriba y el icono del tipo de tarea le tapa la primera letra. Visto en la copia: "Identificarse en el control de acceso" se leía "dentificarse".

**Arreglo.** `tamanoActividad(tipo, nombre)` estima el ancho del texto con las métricas de Arial (la fuente del renderer, 12 px), lo reparte en líneas como diagram-js y prueba tamaños de menor a mayor (90×60, 120×60, 90×80, 120×80, 150×80, 180×80, 180×100) hasta que la primera línea queda debajo o a la derecha del icono (x≈30, y≈25, medido en `BpmnRenderer` de bpmn-js 18). Solo crece: con nombre corto o sin icono (`tarea`) sigue a 90×60.

Lo usan `crear_diagrama` (`layout.ts`) y `agregar_nodo` (`editar.ts`). **No cambia nada de los diagramas existentes**: el conector no redimensiona lo que ya está.

### 3.2 Renombrar pools y carriles

`renombrar` ya aceptaba cualquier elemento con nombre, pero la descripción de `modificar_diagrama` decía "nunca pools, carriles…" refiriéndose a `eliminar`, y Claude entendía que tampoco se podían renombrar. La descripción ahora separa las dos cosas. Se añade una prueba que lo fija.

La descripción del campo `nombre` pide ahora "verbo + objeto en 2 a 4 palabras".

### 3.3 `agregar_pool` y `agregar_carril`

Se pidió a Claude añadir un pool a un diagrama y conectarlo al existente, y no pudo: la tool no sabía crear pools. Lo resolvía creando **otro** diagrama.

- **`agregar_pool`** crea un pool vacío, con carriles opcionales, **debajo de todo lo dibujado**: alineado a la izquierda con el primer pool, tan ancho como el más ancho, a 60 px (las medidas de `layout.ts`). No mueve nada de lo existente.
- **`agregar_carril`** inserta un carril (120 px) debajo de `despues_de` o al final. Lo que queda por debajo baja y el pool crece; las etiquetas viajan con su forma. Si el pool no tenía carriles, hace lo que la app al dividirlo: lo que ya había pasa a un primer carril sin nombre y el nuevo va debajo.
- Rechazan pools verticales con un error claro. Eliminar pools o carriles sigue fuera del conector.

Como las operaciones se aplican en orden, una sola llamada puede crear el pool, llenarlo con `agregar_nodo` y conectarlo con `conectar`, que entre pools distintos crea un flujo de mensaje.

### 3.4 Miniaturas que faltan, generadas por la portada

**Problema.** La miniatura se hace al guardar desde el editor. El servidor MCP no tiene DOM y no puede dibujar, así que lo creado por Claude salía sin vista previa en la portada. La Fase 2 lo había dado por limitación conocida (DEC-013, consecuencias).

**Arreglo.** Al cargar la portada, `diagramStore.loadAll` ya sabía qué diagramas no tienen miniatura en Storage. Ahora los pasa a una cola (`thumbnailBackfill.ts`) que:

- espera 1,5 s para no competir con la carga y procesa **de uno en uno**, con una pausa de 300 ms;
- dibuja con un Modeler oculto (`headlessModeler.ts`) con el **mismo `MODELER_CONFIG`** que el editor y el mismo `buildThumbnail`, así que la miniatura sale idéntica a la del guardado;
- sube con el `saveThumbnailOnly` que ya existía, que también actualiza la tarjeta;
- tiene tope de **20 por sesión**, intenta **cada diagrama una vez por sesión** (un lector sin permiso de escritura falla una vez y no se reintenta en bucle), y **salta los abiertos en una pestaña**, donde ya actúa el autosave;
- se desactiva en las pruebas (`MODE === 'test'`).

Revisado que el Modeler oculto no interfiere con la página: `bpmn-js-native-copy-paste` solo escucha el bus de su propia instancia, el teclado no se engancha a un contenedor que nunca recibe el foco, y los `window.addEventListener` de `GroupMoveModule` y `ScrollPanModule` solo cambian estado de esa instancia. Queda en un chunk de 0,69 kB, porque reutiliza lo que el editor ya carga. La forja del laboratorio (`src/lab/thumbForge.ts`) usa ahora este mismo Modeler oculto en vez de su copia.

**Efecto aceptado:** la primera miniatura escribe `thumbnail_path` en la fila y el trigger mueve `updated_at`, como pasa al guardar por primera vez desde el editor. Ese diagrama sube una vez en "Última modificación" y su versión CAS cambia.

### 3.5 `element_count`

**Problema.** La portada enseña "N elementos" por tarjeta. La app guardaba siempre 0: `saveDiagram` tenía `elementCount = 0` por defecto y ninguno de sus cuatro llamadores lo pasaba. Importar un archivo también guardaba 0. Solo los diagramas del conector traían el número.

**Arreglo.** `contarElementosXml(xml)` cuenta sobre el texto del XML lo mismo que `contarElementos` del conector sobre el árbol de moddle: pools, flujos de mensaje, carriles (también anidados) y los 30 tipos concretos de `FlowElement` de bpmn-moddle, también dentro de subprocesos. Deja fuera anotaciones, asociaciones y grupos. Cuenta sobre el texto porque se ejecuta en cada autosave, e ignora mayúsculas (`bpmn:SequenceFlow` y `bpmn:sequenceFlow`, EXP-018). `saveDiagram` lo calcula si no se le pasa; crear, crear subproceso e importar cuentan su XML inicial.

**Las filas que ya tienen 0 se corrigen en su próximo guardado.** Corregirlas todas de una vez es un `UPDATE` sobre producción: no está incluido y requiere aprobación (ver §7).

---

## 4. Las tools del conector

Referencia completa, con parámetros y operaciones, en [`mcp/README.md` → Tools](../../mcp/README.md#tools).

| Tool | Tipo | Para qué |
|---|---|---|
| `listar_proyectos` | lectura | Proyectos accesibles, con el rol y `puedo_crear_diagramas` |
| `listar_diagramas` | lectura | Diagramas accesibles; filtra por proyecto o por nombre |
| `obtener_diagrama` | lectura | Estructura (pools, carriles, nodos, flujos, mensajes) y `version` para el CAS |
| `validar_diagrama` | lectura | La validación del botón Validar; avisa, no bloquea |
| `crear_diagrama` | escritura | Diagrama nuevo desde un modelo sin coordenadas; idempotente |
| `modificar_diagrama` | escritura | `agregar_nodo`, **`agregar_pool`**, **`agregar_carril`**, `conectar`, `renombrar`, `eliminar`; todo o nada; CAS; solo con `MCP_HABILITAR_MODIFICAR=1` |

---

## 5. Casos de prueba

### 5.1 Automáticas

| Batería | Resultado |
|---|---|
| `npm run test` | **505/505** en 45 ficheros. Respecto a la Fase 2 (479): +7 tamaño y renombrar, +8 pools y carriles, +5 miniaturas, +6 contador |
| `npm run lint` · `npm run build` · `tsc -b` | limpios. Chunk principal 1 520,72 kB (441,91 kB gzip) frente a la línea base de 1 514,82 kB, sumando lo del compañero |
| `mcp/`: `npm run typecheck` · `npm run build` | limpios |
| `mcp/`: `npm test` (integración) y e2e | **no se repitieron**: necesitan el laboratorio. No dependen de los textos ni de las medidas cambiados (comprobado con `grep`). Conviene pasarlos antes de fusionar |

Pruebas nuevas, por fichero:

| Fichero | Qué fija |
|---|---|
| `tamanoActividad.test.ts` | sin nombre o con nombre corto, tamaño de la paleta; con icono, la primera línea queda libre (regresión del caso real); techo y suelo; un diagrama generado con nombres largos no se solapa |
| `editar.test.ts` | renombrar pool y carriles, también a `""`; pool nuevo con nodos y mensajes en una llamada **sin mover nada** de lo anterior y con `bizagi:` intacto; pool nuevo con carriles exige carril; carril en medio baja lo de debajo 120 px y agranda el pool; carril en pool sin carriles; cuatro errores |
| `thumbnailBackfill.test.ts` | genera y guarda en orden; salta abiertos; no reintenta; un fallo no detiene la cola; tope de 20; XML vacío no se dibuja |
| `contarElementosXml.test.ts` | coincide con el contador del conector en tres modelos y tras editar; ignora anotaciones, DI, `LaneSet`, cierres y extensiones |

### 5.2 Manuales en el entorno de ensayo

| # | Escenario | Esperado | Resultado |
|---|---|---|---|
| E1 | Aplicar las migraciones a un proyecto vacío | el esquema de producción, sin errores | ✓ (cifras en §2) |
| E2 | App de ensayo: registro por enlace mágico, crear y guardar un diagrama | usuario, perfil por trigger, diagrama, colaborador `owner` y miniatura en Storage | ✓ |
| E3 | `private.es_conector()` con claims simulados, en transacción con `rollback` | `false` sin `client_id`, `true` con él | ✓ |
| E4 | Servidor MCP desplegado | `/.well-known/oauth-protected-resource` → 200; `POST /mcp` sin token → 401 con `WWW-Authenticate` y `resource_metadata` | ✓ |
| E5 | Metadatos OAuth de Supabase | JWKS con ES256; `registration_endpoint` presente | ✓, **tras activar el registro dinámico**: venía apagado |
| E6 | MCP Inspector: conectar y consentir | cliente registrado por DCR, pantalla `/oauth/consent`, conexión | ✓ |
| E7 | Inspector: `listar_*`, `crear_diagrama`, `obtener_diagrama`, `modificar_diagrama` | un solo diagrama; 2 entradas en `private.mcp_auditoria` con versiones encadenadas | ✓ |
| E8 | Repetir `modificar_diagrama` con la versión vieja | conflicto, nada escrito | ✓ (sin tercera escritura) |
| E9 | Claude, lenguaje natural: crear un proceso con carriles | Claude elige las tools sin JSON y valida | ✓ |
| E10 | Claude modifica un diagrama **abierto** en la app | primer intento rechazado; con `si_esta_abierto="copiar"`, copia; el original intacto | ✓ |
| E11 | Tareas con nombre largo tras el cambio 3.1 | 120×80 / 150×80, texto libre del icono | ✓, revisado a ojo |
| E12 | Claude renombra un carril y un pool | nombres nuevos, coordenadas iguales | ✓ |
| E13 | Claude añade un pool conectado por mensajes **al mismo diagrama** | pool alineado debajo; lo anterior en las mismas coordenadas; 2 mensajes bien trazados | ✓, revisado a ojo |
| E14 | Portada con diagramas sin miniatura | se rellenan solos, uno a uno | ✓ 5 de 6. El sexto, probablemente abierto en una pestaña (lo salta a propósito), **sin confirmar** |
| E15 | Autosave de un diagrama dibujado a mano | `element_count` = elementos del XML | ✓ (8 = 8). Y sobre 8 diagramas del conector, el patrón da exactamente su número guardado |
| E16 | Fusionar `main` | sin conflictos; suite verde; la migración del compañero se aplica en la copia | ✓ |

---

## 6. Hallazgos

| # | Hallazgo | Consecuencia |
|---|---|---|
| H1 | **Cada conexión de Claude registra un cliente OAuth nuevo** (registro dinámico). En una hora de pruebas se acumularon 7 | En producción, `auth.oauth_clients` crecerá con cada reconexión. Vigilar y decidir una limpieza periódica (toca el esquema `auth`: requiere aprobación) |
| H2 | **Claude guarda la lista de tools** de cuando se conectó | Tras desplegar una versión nueva del servidor, hay que reconectar el conector y abrir una conversación nueva; si no, sigue con las descripciones viejas |
| H3 | El registro dinámico **viene apagado** aunque se active el servidor OAuth | Sin él, `registration_endpoint` sale vacío y ningún cliente puede darse de alta. Es un ajuste aparte en el panel |
| H4 | El Inspector marca `resources/list` y `prompts/list` como error | Esperado: el servidor solo ofrece tools |
| H5 | Las consultas SQL ad hoc que busquen `<bpmn:sequenceFlow` no encuentran nada | El XML guardado usa `SequenceFlow` (EXP-018). Contar sin distinguir mayúsculas |
| H6 | `vercel link` escribe `.env.local`; `vercel env pull` lo **sobrescribe** | Riesgo real para un `.env.local` con secretos. Ver §2 |
| H7 | La CLI de Vercel ignora `.gitignore` | Desplegar la app con la CLI exige un `.vercelignore` de lista blanca. No se commitea |
| H8 | El conector no redimensiona tareas existentes | Las creadas antes del cambio 3.1 conservan el icono encima de la letra hasta que se agranden a mano |

---

## 7. Qué cambia en producción al fusionar el PR

La fusión **despliega la SPA**. El conector **no** queda activo hasta los pasos de `mcp/README.md`. Lo que verán los usuarios:

| Cambio | Visible | Nota |
|---|---|---|
| Pantalla `/oauth/consent` | no | Inerte hasta activar el servidor OAuth |
| Opción C (cambio externo estando solo → se pregunta) | solo si hay escritores externos | Ninguno hasta encender el conector |
| Validar avisa de pools sin inicio o fin | sí | Cambio de la Fase 2 (D7) |
| **Miniaturas generadas en la portada** | **sí** | Al abrir la portada, cada usuario genera hasta 20 de sus diagramas sin miniatura. Esos diagramas **suben una vez** en "Última modificación" y su versión CAS cambia. Cuántos hay sin miniatura en producción no se midió (sin acceso) |
| `element_count` | sí, poco a poco | Cada diagrama enseña su número desde su próximo guardado. Las filas antiguas siguen a 0 hasta entonces; corregirlas de golpe requiere un `UPDATE` aprobado, no incluido |
| Correo al invitado y campanita | sí | Del compañero, ya en `main` |

---

## 8. Pendiente

**Requiere aprobación** (procedimiento en `mcp/README.md`):

1. Migración `20261008120000_mcp_conector.sql` en producción.
2. Servidor OAuth en el panel de producción: activarlo, **activar el registro dinámico** y poner la ruta `/oauth/consent`.
3. Fusionar el PR (despliega la SPA; §7).
4. Proyecto de Vercel para `mcp/`, primero sin `MCP_HABILITAR_MODIFICAR`.
5. `MCP_HABILITAR_MODIFICAR=1`, solo después del punto 3.
6. Opcional: `UPDATE` único de `element_count` para las filas a 0.
7. Cerrar PLAN-039 a PLAN-042 y MASTER-PLAN-038.

**Sin probar:**

- **Ida y vuelta con un diagrama real de Bizagi.** El diagrama usado en el ensayo no tenía extensiones `bizagi:`. La preservación la cubre una prueba con un XML que imita producción, no un diagrama real.
- Integración y e2e de `mcp/` tras los cambios de hoy (necesitan `npm run lab`).
- ChatGPT (D9).
- El sexto caso de E14.

**Riesgos residuales** de la Fase 2, sin cambios: pestaña de fondo desactualizada con otra persona presente, servidor OAuth en beta, `aud=authenticated`.
