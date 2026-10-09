# Investigación: servidor MCP remoto para Flujo — Fase 0

**Fecha:** 2026-10-08
**Solicitado por:** santiagojmg28
**Procedencia:** investigación asistida por Claude. Lectura del repo (`docs/`, `src/`, `supabase/migrations/`) y de documentación oficial externa, con las fuentes citadas en cada punto.
**Método:** solo lectura. **No se ejecutó nada** contra Supabase, ni contra producción ni contra el laboratorio, y no se instaló nada. No se escribió código de producto.

> **Estado:** 🔍 insumo para la Fase 1. Nada de aquí es una decisión: las decisiones irán a DEC-013 y al master plan cuando se aprueben.

---

## 0. Resumen

| # | Pregunta | Respuesta corta |
|---|---|---|
| 1 | Esquema y permisos | Roles `owner`/`editor`/`viewer` a dos niveles (diagrama y proyecto). Las funciones `private.can_*` son la autoridad. **`diagrams_insert` no comprueba el permiso sobre el proyecto**, así que el MCP debe comprobarlo él mismo antes de crear (§1.4). |
| 2 | CAS | El token es `updated_at`, que mueve el trigger. Es `UPDATE … WHERE id AND updated_at = esperado`, con `DiagramConflictError` si afecta 0 filas. **El cliente, ante el primer conflicto, reintenta con la versión fresca y gana** (§2.3). |
| 3 | **Riesgo principal** | **Hoy, una escritura externa sobre un diagrama abierto se pierde en silencio** en el siguiente autoguardado del cliente, sin aviso. La causa es la combinación de §2.3 con que ningún cliente escucha cambios de la fila `diagrams`. Recomendación: **compuerta de presencia en el MCP + un cambio pequeño en el reintento del CAS del cliente**, y `modificar_diagrama` no sale a producción sin ambos (§3). |
| 4 | `validation.ts` | Es puro y no tiene dependencias de UI, pero opera sobre el `elementRegistry` de bpmn-js, no sobre moddle. En Node basta un adaptador de unas 30 líneas. **Sus comprobaciones de inicio y fin no se ejecutan nunca en diagramas con pool** (§4). |
| 5 | Layout | **Medido el 2026-10-08:** `bpmn-auto-layout` 1.3.0 resuelve bien los procesos simples y con compuertas, pero **no dispone pools, carriles ni flujos de mensaje**, aunque la documentación de `main` diga otra cosa. Hace falta un layout propio (§5.1). |
| 6 | OAuth y Vercel | **Viable con matices.** Supabase Auth es servidor OAuth 2.1 (beta) con registro dinámico de clientes y tokens que son JWT del usuario, con RLS intacta. Las funciones de `api/` conviven con la SPA. **`mcp-handler` 2.x exige zod 4 y el repo usa zod 3** (§6). |

**Bloqueo de entorno, resuelto el 2026-10-08.** En la primera pasada no había `node`, `npm` ni `docker`. Con aprobación del usuario se instalaron Node 22.23.2 y Docker Desktop 4.94.0 con winget, se ejecutó `npm ci` y el laboratorio local arranca. Línea base: 427 pruebas en 39 ficheros en verde, lint limpio y build correcto (chunk principal de 1 514,82 kB, 439,62 kB gzip).

---

## 1. Esquema real de datos y permisos

Fuente: `supabase/migrations/20260813000000_baseline_produccion.sql`, más las dos migraciones posteriores, que no tocan nada de esto.

### 1.1 Tablas que importan al MCP

| Tabla | Columnas relevantes | Notas |
|---|---|---|
| `diagrams` | `id uuid` (**lo genera el cliente**), `owner_id`, `project_id`, `folder_id`, `name`, `current_xml text`, `element_count`, `schema_version`, `parent_diagram_id`, `sub_process_element_id`, `created_at`, `updated_at`, `deleted_at` | `diagrams_set_updated_at` (BEFORE UPDATE) mueve `updated_at = now()`. `diagrams_add_owner` (AFTER INSERT) da de alta al dueño como colaborador. |
| `projects` | `id`, `owner_id`, `name`, `created_at`, `updated_at`, `deleted_at`, `doc_template` | El UPDATE se concede columna a columna (EXP-015, migración `0028`). |
| `diagram_collaborators` | PK `(diagram_id, user_id)`, `role ∈ {owner, editor, viewer}` | |
| `project_collaborators` | PK `(project_id, user_id)`, `role ∈ {owner, editor, viewer}` | |

Volumen y tamaño, según `context/base-de-datos-inventario.md`: XML medio de **29 kB, p95 de 93 kB y máximo de 294 kB**. En el código existe `MAX_ELEMENTS = 500` (`src/domain/bpmnElements.ts:90`), pero **no lo usa nadie**: es una constante muerta.

### 1.2 Autorización

Hay cuatro funciones `SECURITY DEFINER`, `STABLE`, en el esquema `private`:

- `can_access_diagram(d)`: dueño del diagrama, o colaborador del diagrama, o colaborador del proyecto, o dueño del proyecto.
- `can_edit_diagram(d)`: lo mismo, pero con rol `owner` o `editor`.
- `can_access_project(p)` y `can_edit_project(p)`: equivalentes a nivel de proyecto.

Políticas de `diagrams`:

- `SELECT` con predicado conjuntista (DEC-005).
- `UPDATE` con `can_edit_diagram(id)` en `using` y en `with check`.
- `INSERT` solo con `owner_id = auth.uid()`.
- `DELETE` solo para el dueño.

**Consecuencia directa para el MCP:** si actúa con el JWT del usuario, RLS ya garantiza que solo ve lo que puede ver y solo actualiza lo que puede editar. Un `viewer` no puede escribir: el UPDATE afecta 0 filas.

### 1.3 Un detalle del CAS con RLS

Para un `viewer`, el UPDATE con CAS también afecta 0 filas, igual que un conflicto. **El MCP debe distinguir los dos casos** antes de devolver "conflicto", porque si no le diría a la IA que reintente algo que nunca va a poder hacer. Basta con un `SELECT` del rol efectivo, o con interpretar las 0 filas releyendo `updated_at`: si no cambió, el motivo es el permiso.

### 1.4 Hueco: crear un diagrama dentro de un proyecto ajeno 🔍

`diagrams_insert` solo exige `owner_id = auth.uid()` y **no valida `project_id`**. Según la política `diagrams_select`, que incluye `project_id IN (proyectos del usuario)`, un usuario podría crear un diagrama apuntando al proyecto de otro, y ese diagrama aparecería en la lista del dueño del proyecto.

- **Para el MCP:** `crear_diagrama` debe comprobar `can_edit_project` antes de insertar. Sin cambio de BD, se resuelve leyendo `projects` y `project_collaborators` con el JWT del usuario.
- **Como hallazgo de seguridad:** es de la misma familia que SEG-01 de `auditoria-seguridad-acceso.md`. **Por verificar en el laboratorio.** No se toca aquí.

---

## 2. Cómo funciona el CAS hoy

### 2.1 Servidor

No hay columna `version` ni RPC. El token de versión es `updated_at`, y es el servidor quien lo mueve con el trigger (DEC-001; `context/arquitectura-persistencia.md` §6).

### 2.2 Repositorio

`SupabaseRepository.save()`, en `src/persistence/SupabaseRepository.ts:227-281`:

1. Hace un `SELECT id` previo para distinguir INSERT de UPDATE. No usa *upsert*, para que un editor no pueda robar `owner_id`.
2. UPDATE de `folder_id, name, current_xml, element_count, schema_version` con `.eq('id').eq('updated_at', esperado)` y `.select('updated_at')`.
3. Si no devuelve fila, lanza `DiagramConflictError`. Si la devuelve, retorna el `updated_at` nuevo.

**El MCP puede reutilizar exactamente esta forma.** Es PostgREST plano y no depende del navegador.

### 2.3 Store: lo que importa para el MCP

`diagramStore.saveDiagram`, en `src/store/diagramStore.ts:329-405`:

| Paso | Comportamiento |
|---|---|
| 1.er conflicto | `getById` → si `fresh.xml === xml`, adopta. **Si difiere, reintenta con `fresh.updatedAt` y su escritura gana.** |
| 2.º conflicto | Mismo chequeo. Si diverge, adopta la versión del otro **y** dispara `flujo:save-conflict`, que muestra un toast con "recargar" o "guardar copia" (`App.tsx:290-325`). |

El reintento existe para el caso de diseño de `arquitectura-persistencia.md` §3.3: en una sesión en tiempo real todos guardan casi el mismo estado acordado, así que el último puede ganar sin riesgo. **Ese supuesto no vale para un escritor externo a la sesión, como el MCP.**

### 2.4 Autoguardado

`useAutoSave.ts`: solo guarda si hay cambios sin guardar, cada 20 s más un *jitter* de 0 a 5 s. No guarda si el usuario es `viewer` ni si el canvas no confirmó el diagrama.

---

## 3. El riesgo principal: escritura del MCP con el diagrama abierto

### 3.1 Cómo se enteraría hoy el cliente

**No se entera.**

- `diagrams` **no** está en la publicación de Realtime. Se sacó de ella a propósito, porque era el 73 % del CPU (comentario en el baseline y PLAN-016).
- Ningún `postgres_changes` escucha la fila; solo se escuchan comentarios, imágenes y notificaciones.
- `ensureXml` devuelve el XML cacheado en el store si existe (`diagramStore.ts:200-205`).
- Con `flujo:tabsCache` activado en producción (PLAN-005), las pestañas de fondo conservan una instancia viva de bpmn-js con el XML viejo.

El cliente solo descubre el cambio externo **cuando su propio guardado choca**.

### 3.2 Escenarios, con lo que pasa hoy

| | Escenario | Qué ocurre | Gravedad |
|---|---|---|---|
| E1 | Usuario solo, con el diagrama abierto y sin cambios pendientes. El MCP escribe. | El canvas sigue mostrando la versión vieja. Al editar algo, el autoguardado choca, reintenta con la versión fresca y **pisa el cambio del MCP sin aviso** (§2.3). | **Pérdida silenciosa** |
| E2 | Igual que E1, pero con cambios ya pendientes. | Lo mismo, en menos de 25 s. | **Pérdida silenciosa** |
| E3 | Dos usuarios en sesión y el MCP escribe. | El primero que guarda pisa al MCP. El segundo choca, ve que su XML coincide con el del primero y adopta. | **Pérdida silenciosa** |
| E4 | Un usuario tiene la versión vieja abierta y otro abre después de la escritura del MCP. | El recién llegado importa el XML nuevo. El veterano le envía su estado Yjs completo (`sendFullState`), que el binding aplica sobre el canvas nuevo. Se rompe el invariante "todos parten del mismo `current_xml`" (`YjsBpmnBinding.ts:59-62`): **dos lienzos divergentes con presencia activa**, el patrón de EXP-011. | **Divergencia más pérdida** |
| E5 | Pestaña de fondo con instancia cacheada (PLAN-005), o XML en el store, sin presencia en el canal. | Como E1, pero **invisible para cualquier comprobación de presencia**: el canal solo lo abre la pestaña activa (`useCollab.ts`). | **Pérdida silenciosa** |
| E6 | Nadie tiene el diagrama abierto. | El CAS del MCP basta. | Seguro |
| E7 | `crear_diagrama`, con un id nuevo. | Nadie puede tenerlo abierto. | Seguro |

**La asimetría que lo explica:** el CAS protege al MCP de pisar al cliente, porque el MCP no reintentará a ciegas. Pero **no protege al cliente de pisar al MCP**, porque el cliente sí reintenta a ciegas.

Esto viola la regla derivada de EXP-011: *"ninguna ruta que pueda descartar una edición del usuario debe hacerlo sin dejar registro"*.

### 3.3 Opciones

| Opción | Qué es | Cubre | No cubre | Coste |
|---|---|---|---|---|
| **A · Compuerta de presencia** (solo MCP) | Antes de escribir, el MCP se suscribe **sin `track()`** al canal `diagram:<id>`, como ya hace `useDiagramsPresence.ts`, sin aparecer como presente ni disparar `onJoin`. Si hay alguien, rechaza con un mensaje claro: "abierto por X; pide que lo cierre o crea una copia". | E1–E4 con la pestaña activa | **E5**, y la carrera de alguien que tenía el diagrama cargado de antes | 0,5–1,5 s por escritura, más una conexión WebSocket desde la función. **Cero cambios en el cliente.** Depende de que el canal siga accesible: si se corrige SEG-09, hace falta política sobre `realtime.messages`, que el JWT del usuario cumpliría. |
| **B · Aviso más recarga controlada** (cliente y MCP) | Tras escribir, el MCP emite un *broadcast* `external-write {updated_at}`. Un cliente sin cambios pendientes reimporta; uno con cambios muestra el toast de conflicto que ya existe. | E1–E4 si el cliente está suscrito | E5, mientras la pestaña esté en fondo | Reimportar a mitad de sesión obliga a **reiniciar el `Y.Doc` de todos los pares a la vez** o se reproduce E4. Es terreno de EXP-003, EXP-005 y EXP-007: **alto riesgo**. |
| **C · El primer conflicto no reintenta si el cliente está solo** (cliente) | En `saveDiagram`: si hay conflicto, el contenido diverge **y no hay pares en la sesión**, el cambio vino de fuera, así que se salta el reintento y se usa la UI de conflicto existente. Con pares, el comportamiento actual no cambia. | E1, E2, E5, y cualquier escritor externo futuro | E3–E4, porque con pares sigue reintentando | Unas 10 líneas más pruebas en `diagramStore.cas.test.ts`. **Toca el comportamiento de conflicto: necesita aprobación (DEC-009).** |
| **D · El MCP no modifica en sitio** | `modificar_diagrama` escribe siempre una copia nueva ("… (propuesta IA)") y nunca toca el original. | Todo | — | Peor experiencia: el usuario fusiona a mano. Cero riesgo. |
| E · El MCP como par Yjs | El MCP aplica sus cambios por el canal como si fuera un colaborador más. | — | — | **Descartada.** Los *snapshots* del binding son semántica de bpmn-js, lo que obligaría a ejecutar bpmn-js en el servidor. Reintroduce Yjs como camino de escritura, contra DEC-002 y DEC-011. |
| F · Esperar a MASTER-PLAN-019 | Con servidor autoritativo, el MCP es un cliente más del documento y deja de haber un segundo escritor. | Todo | — | Bloqueado por PLAN-013 y PLAN-020. Es la solución de fondo, no la de ahora. |

### 3.4 Recomendación

**A + C, con D como salida de la compuerta**, y despliegue por etapas:

1. **Etapa 1, sin tocar el cliente.** Se exponen `listar_*`, `obtener_diagrama`, `validar_diagrama` y `crear_diagrama`. Son seguras por E6 y E7.
2. **Etapa 2.** Se habilita `modificar_diagrama` **solo cuando C esté desplegado en el cliente**. Con eso:
   - la compuerta A rechaza cuando hay alguien en el canal;
   - C convierte E5 en un conflicto visible en vez de una pérdida silenciosa;
   - si la compuerta rechaza, la tool ofrece D (copia).

**Evidencia de por qué esta combinación y no otra:**

- **A sola es `mitigado`, no `resuelto`.** E5 es real con `flujo:tabsCache` activado (`modelerCache.ts:16`, "en producción").
- **C sola no cubre E3 ni E4,** porque con pares el reintento es deliberado.
- **B se descarta por ahora:** reimportar con el `Y.Doc` vivo es la zona de EXP-003 y EXP-005.
- **C es pequeña y además corrige un defecto que ya existe hoy** para cualquier escritor externo, no solo para el MCP: un script de respaldo o restauración, o una segunda cuenta. Encaja en la regla de EXP-011.

**Riesgo residual que no se oculta:** queda una ventana entre que la compuerta mira el canal y el MCP escribe. Si alguien abre el diagrama en ese intervalo, importa el XML **nuevo**, porque la escritura ya se hizo o está a punto, y se queda en E6. El caso malo exige que tuviera el diagrama cargado **de antes** sin estar en el canal, que es exactamente E5, y lo cubre C.

---

## 4. `src/domain/validation.ts`

- **Es puro.** Su única importación es un tipo (`ValidationResult`), y `t` llega inyectada. No toca DOM, React ni bpmn-js. `crypto.randomUUID` es global en Node 20 o superior.
- **Pero recibe un `elementRegistry`** (formas de diagram-js con `.businessObject` y `.children`), no el árbol de moddle. En Node se necesita un adaptador moddle → `{ id, businessObject, children }` de unas 30 líneas, sin ejecutar bpmn-js.
- **Observación sin corregir, porque la regla es avisar y no bloquear.** Las comprobaciones `MISSING_START_EVENT` y `MISSING_END_EVENT` buscan formas con `$type === 'bpmn:Process'`. En un diagrama con colaboración, la raíz es la `Collaboration` y los pools son formas `bpmn:Participant`, así que **nunca encuentra un `Process` y esas dos comprobaciones no se ejecutan nunca**. La plantilla vacía de la app (`EMPTY_BPMN`) ya crea un pool, de modo que afecta a casi todos los diagramas.
  - El adaptador del MCP puede recorrer `participant.processRef`, pero entonces **el MCP avisaría de cosas que la UI no avisa**.
  - Hay que decidir si se corrige en `validation.ts`, y con ello cambia la UI, o si el MCP replica el comportamiento actual. **Decisión para la Fase 1.**
- `MAX_ELEMENTS = 500` no se aplica en ningún sitio. El MCP puede adoptarlo como límite propio. El diagrama más grande de producción no consta en elementos, solo en bytes (294 kB).

---

## 5. Layout automático

### 5.1 Resultado medido (2026-10-08, tras instalar Node 22.23.2)

`scripts/mcp-layout-spike.mjs` con `bpmn-auto-layout` **1.3.0**, que es la versión publicada en npm:

| Caso | Formas | Aristas | Sin DI | Nodos fuera de su carril | Aristas diagonales | Veredicto |
|---|---:|---:|---|---|---|---|
| 1 · simple | 4 | 3 | ninguno | — | ninguna | ✅ correcto, horizontal |
| 2 · compuertas | 10 | 11 | ninguno | — | ninguna | ✅ correcto, horizontal, con las ramas en filas |
| 3 · pools y carriles | 12 | 11 | **los 2 pools, los 2 carriles, el 2.º participante entero y los 2 flujos de mensaje** | **los 8** | ninguna | ❌ **no sirve** |

**La hipótesis queda refutada.** El README del paquete publicado lo dice explícitamente, y contradice el `docs/LAYOUT.md` de la rama `main`, que describe trabajo no publicado:

> *Given a collaboration only the first participant's process will be laid out · Sub-processes will be laid out as collapsed sub-processes · Not laid out: groups, text annotations, associations, message flows.*

Dos lecciones operativas:

- **La documentación de `main` de un repositorio no describe la versión de npm.** Se midió la versión instalada, no la documentada.
- **`bpmn-auto-layout` necesita `incoming`/`outgoing` declarados en el XML.** Sin ellos no genera ninguna arista y dispone los nodos en vertical. La primera ejecución dio 0 aristas por eso.

**Decisión derivada (MASTER-PLAN-038, D8):** layout propio sobre el modelo semántico, con el `BizagiDirectionalRouter` del repo para las flechas, y **sin añadir `bpmn-auto-layout` como dependencia**.

### 5.1-bis Antes de medir

La prueba no pudo ejecutarse en la primera pasada porque no había Node (§0). Lo que sigue en §5.2 es lo que decía la documentación, y se conserva para que se vea por qué no bastaba con leerla.

### 5.2 Lo que dice la fuente

Fuente: `bpmn-auto-layout` 1.3.0, publicado el 2026-03-11, licencia MIT; dependencias `bpmn-moddle ^10` y `min-dash`. Lo siguiente es su `docs/LAYOUT.md`, **declarado, no comprobado**:

- **Colaboraciones:** los pools se dimensionan alrededor de su proceso y se ordenan verticalmente según los flujos de mensaje.
- **Lanes:** horizontales y anidables. Cada nodo va a su *lane* más profunda.
- **Subprocesos:** los expandidos se dimensionan alrededor de su contenido; los colapsados van en un plano propio.
- **Eventos de borde:** se anclan a su anfitrión.
- **Flujos de mensaje:** se enrutan por canales horizontales exclusivos.
- **Grupos y anotaciones:** se colocan con reglas propias.

La hipótesis de partida suponía que no soportaba pools ni lanes, y su documentación actual dice lo contrario. **No se comprobó en qué versión se añadió ese soporte**, ni si la calidad del resultado es aceptable: solo el *spike* lo dirá.

### 5.3 Coherencia con el *routing* estilo Bizagi

El cliente sustituye el `layouter` de diagram-js por `BizagiLayouter` (`context/patrones-routing.md`). ~~Por lo leído, el layouter solo actúa en operaciones de modelado.~~ **Corregido el 2026-10-08, durante la implementación:** `ConnectionImportNormalizer` (`BizagiLayouter.ts:628`) escucha `import.render.complete` y **vuelve a trazar al abrir toda conexión que no sea manual**. Las flechas que escriba cualquier generador se sustituyen por las del router de la app nada más abrir el diagrama. El error vino de buscar `import.done` en vez de `import.render.complete`. Se recalculan en cuanto el usuario mueve algo, así que lo que se ve al abrir y lo que se ve tras el primer arrastre pueden diferir.

**Hallazgo que abre una alternativa mejor:** `src/bpmn/connections/BizagiDirectionalRouter.ts` (544 líneas) y `orthogonal.ts` (310) **no tienen ninguna importación**. Son geometría pura y se pueden ejecutar en Node.

### 5.4 Opciones a comparar cuando se pueda medir

| | Posiciones de nodos | Flechas | Coherencia con la app |
|---|---|---|---|
| L1 | `bpmn-auto-layout` | `bpmn-auto-layout` | media: las flechas cambian al primer movimiento |
| **L2** | `bpmn-auto-layout` | **`BizagiDirectionalRouter` del repo** | **alta:** es el mismo router que usa el cliente |
| L3 | layout propio por capas sobre el modelo semántico | `BizagiDirectionalRouter` | alta, pero con más código propio que mantener |

**Recomendación provisional:** L2, a confirmar con el *spike*.

### 5.5 *Spike* preparado

`scripts/mcp-layout-spike.mjs` está en `.gitignore` como todo `scripts/` salvo `lab.mjs`. Se ejecuta en un directorio aparte, **sin tocar el `package.json` del repo**. Las instrucciones están en la cabecera del script.

Tres casos sin coordenadas:

1. simple;
2. con compuertas exclusivas y paralelas;
3. dos pools, dos lanes, flujo de mensaje, subproceso expandido y evento de borde con temporizador.

Comprobaciones mecánicas:

- que cada elemento tenga DI;
- que cada nodo quede dentro de su *lane*;
- que las aristas sean ortogonales;
- los *warnings* de `layoutProcess` y del parseo de moddle.

**La revisión visual sigue haciendo falta:** se importan las salidas en la app del laboratorio.

---

## 6. Autenticación, clientes y alojamiento

### 6.1 Requisitos de MCP

Especificación vigente: **2026-07-28**, sección *Authorization*.

- El servidor MCP es un *resource server* OAuth 2.1 y **debe** publicar *Protected Resource Metadata* (RFC 9728), devolver `401` con `WWW-Authenticate` y validar la audiencia del token (RFC 8707).
- **No puede aceptar ni reenviar tokens que no se emitieron para él** (*token passthrough*).
- Para registrar clientes se **prefiere** *Client ID Metadata Documents* (CIMD). El registro dinámico (DCR, RFC 7591) queda **deprecado**, pero se mantiene por compatibilidad.

### 6.2 Supabase Auth como servidor OAuth

| Aspecto | Hallazgo | Fuente |
|---|---|---|
| Existe | Sí: OAuth 2.1 y OIDC, **en beta**, en todos los planes sin coste extra (cuenta para MAU) | supabase.com/docs/guides/auth/oauth-server/getting-started |
| Descubrimiento | `https://<ref>.supabase.co/.well-known/oauth-authorization-server/auth/v1` | …/oauth-server/mcp-authentication |
| DCR | Sí, opcional; se activa en *Authentication → OAuth Server* | ídem |
| CIMD | **No consta** | — |
| Pantalla de consentimiento | **La aloja la app** en la ruta configurada (`/oauth/consent`) y llama a `supabase.auth.oauth.getAuthorizationDetails`, `approveAuthorization` y `denyAuthorization` | …/getting-started |
| Token | **JWT normal de Supabase** con `sub`, `role=authenticated`, `aud=authenticated` y `client_id`. **RLS se aplica igual** | …/oauth-server/token-security |
| *Scopes* | Solo `openid`, `email`, `profile` y `phone`. **No limitan el acceso a la base** | ídem |
| Restringir por cliente | Con `auth.jwt() ->> 'client_id'` en políticas RLS | ídem |
| Audiencia | `aud=authenticated` por defecto. Se puede personalizar con un *custom access token hook*. **No consta soporte del parámetro `resource` (RFC 8707)** | ídem |
| Firma | Los ID tokens de OIDC **exigen** claves asimétricas (RS256 o ES256) | …/getting-started |
| Laboratorio | `supabase/config.toml:368-374` ya trae `[auth.oauth_server]` con `enabled = false` y `allow_dynamic_registration = false` | repo |

**Consecuencias:**

1. **"Alcances mínimos" no se consigue con *scopes* OAuth.** Un token del conector tiene el mismo poder que la sesión del usuario en la app: puede llamar a PostgREST directamente, sin pasar por el MCP. El mínimo privilegio se impone en dos capas:
   - **la superficie de *tools*** del MCP, que no expone nada destructivo;
   - **opcionalmente, políticas RLS restrictivas por `client_id`**. Por ejemplo, negar `DELETE` y el UPDATE de `deleted_at`, `owner_id` y `project_id` cuando `client_id` sea el del conector. **Es un cambio de BD y requiere aprobación.**
2. **Audiencia (RFC 8707).** Como `aud=authenticated`, el MCP no puede validar la audiencia a la manera de la especificación. Alternativas, **por verificar en el laboratorio**:
   - validar que `client_id` pertenece a un cliente registrado para el conector;
   - o un *hook* que ponga `aud` en la URL del MCP, comprobando antes que PostgREST sigue aceptando el token.
3. **Reenvío del token.** El MCP reenviaría el token a PostgREST del mismo proyecto Supabase que lo emitió. No es el caso que la especificación prohíbe (tokens de terceros), pero **hay que dejarlo razonado en DEC-013**.
4. **Tokens personales (PAT) descartables.** Para que el MCP actúe como el usuario con un PAT, tendría que **fabricar** un JWT de usuario, y eso exige el secreto de firma o `service_role`: viola la regla dura. Además, Claude **no admite tokens pegados por el usuario**, solo OAuth con PKCE. Supabase OAuth es el único camino que respeta la regla.
5. **La pantalla de consentimiento es una ruta nueva de la SPA.** Es un cambio de cliente pequeño, solo activo con Supabase configurado, y no afecta al modo IndexedDB.

### 6.3 Clientes

| Cliente | Planes | Requisitos | Fuente | Confianza |
|---|---|---|---|---|
| **Claude** | Todos: Free con un conector como máximo, Pro, Max, Team y Enterprise. En Team y Enterprise lo añade un *Owner*, y cada miembro lo activa y se autentica. El administrador puede fijar por *tool* "permitir", "pedir aprobación" o "bloquear" | HTTP *streamable*; **OAuth con PKCE obligatorio**; DCR por defecto, CIMD admitido; **no admite *bearer* pegado** | Resultados de búsqueda que citan support.claude.com art. 11503834; la página directa devolvió 404 | media: **verificar en la fuente oficial** |
| **ChatGPT** | *Developer mode* en Plus, Pro, Business, Enterprise y Edu (web). **Las fuentes se contradicen** sobre si Plus y Pro admiten escritura o solo lectura | HTTPS público; *streamable* HTTP o SSE; OAuth 2.1 con PKCE; las escrituras piden confirmación | Fuentes secundarias; developers.openai.com y help.openai.com devolvieron 404/403 | **baja: verificar** |

**Implicación:** los 21 usuarios pueden usarlo desde Claude con cualquier plan, aunque con Free solo tienen un conector. ChatGPT queda como "si es viable" hasta confirmar los planes con escritura.

### 6.4 Vercel

| Hipótesis | Resultado | Fuente |
|---|---|---|
| Una función en `api/` convive con el *rewrite* `/(.*) → /index.html` | **Verificada.** *"precedence is given to the filesystem prior to rewrites being applied"*. `/api/mcp` se sirve sin tocar el *rewrite*. Las rutas `/.well-known/oauth-protected-resource` sí necesitan un *rewrite* explícito hacia la función, **antes** del comodín | vercel.com/docs/project-configuration/vercel-json |
| Límites | Duración de 300 s por defecto (Hobby y Pro). Memoria de 2 GB. **Cuerpo de petición o respuesta de 4,5 MB**, de sobra para XML de 294 kB. Paquete de 250 MB | vercel.com/docs/functions/limitations |
| SDK | `mcp-handler` 2.3.0 (2026-10-07) es *stateless* y sin Redis, y devuelve un manejador Web `(Request) => Response` que sirve fuera de Next.js. Incluye `withMcpAuth` y `protectedResourceHandler`, con soporte de CIMD. **Exige `@modelcontextprotocol/server` ^2, que exige `zod` ^4.2.** La rama 1.x usa `@modelcontextprotocol/sdk` 1.32 con zod 3 | registry.npmjs.org |
| Plan de Vercel | **Desconocido.** El plan Hobby no permite uso comercial; hay que confirmarlo antes de desplegar | — |

**Conflicto de dependencias.** El repo tiene `zod ^3.23` en `dependencies` y lo usa el cliente. Hay tres salidas:

| | Salida | Valoración |
|---|---|---|
| V1 | Paquete aislado `mcp/` con su propio `package.json`, desplegado como **otro proyecto de Vercel** con *Root Directory* en `mcp/` y dominio `mcp.<dominio>` | **Recomendada.** La SPA no hereda nada, el bundle no puede crecer, y zod 4 queda aislado. Contrapartida: un segundo proyecto. La pantalla de consentimiento sigue en la SPA. |
| V2 | Misma app, con `mcp-handler` 1.x y SDK 1.x (zod 3) | Funciona, pero se casa con la rama vieja justo cuando la especificación cambió. |
| V3 | Migrar toda la app a zod 4 | Toca el cliente por una razón del servidor. **No.** |

**Límite de peticiones en *serverless*.** Las instancias no comparten memoria, así que el límite necesita un almacén común. Hay dos opciones: una tabla en Postgres (cambio de BD) o Upstash/Vercel KV (proveedor nuevo). **Decisión para la Fase 1.**

---

## 7. Registro de hipótesis

| Hipótesis | Estado | Fuente |
|---|---|---|
| `api/` en Vercel convive con la SPA de Vite | ✅ verificada (documentación) · ⚠️ falta probarlo en un despliegue de vista previa | §6.4 |
| `bpmn-auto-layout` soporta pools y lanes | ❌ **refutada, medido** (1.3.0): solo el primer participante, sin carriles ni flujos de mensaje | §5.1 |
| Es coherente con el routing Bizagi | ⚠️ parcialmente: se respeta al abrir y se recalcula al mover; L2 lo resuelve | §5.3 |
| Supabase Auth sirve como proveedor OAuth para MCP | ✅ sí, en beta · ⚠️ con matices de *scopes* y audiencia | §6.2 |
| Claude: requisitos y planes | 🔍 fuentes secundarias coherentes; falta la página oficial | §6.3 |
| ChatGPT: requisitos y planes | 🔍 fuentes contradictorias | §6.3 |
| APIs actuales de `mcp-handler` y del SDK | ✅ `mcp-handler` 2.3.0 y `@modelcontextprotocol/server` 2.3.1, con zod 4 | §6.4 |
| Hay extensiones `bizagi:` que preservar | 🔍 **sin evidencia en el código**: la importación de `.bpm` convierte el formato y no deja `xmlns:bizagi`. Queda como lectura pendiente contra producción (abajo) | — |

**Lecturas de producción pendientes, permitidas por la Regla 2 pero no hechas** porque el conector `supabase` de esta sesión no está autorizado y no se tocó `.env.local`:

```sql
select count(*) filter (where current_xml like '%xmlns:bizagi%')  as con_bizagi,
       count(*) filter (where current_xml like '%xmlns:camunda%') as con_camunda,
       max(element_count) as max_elementos
from public.diagrams where deleted_at is null;
```

---

## 8. Incidentes de `docs/experience/` que aplican

| EXP | Por qué importa al MCP |
|---|---|
| **EXP-011** | E4 reproduce su patrón (presencia viva con lienzos divergentes), y E1, E2 y E5 violan su regla derivada. Es la razón de C. |
| EXP-003, EXP-005, EXP-007 | Por qué se descarta B (reimportar en sesión) y E (el MCP como par Yjs). |
| **EXP-018** | Serializar con la extensión `flujo` produce `<bpmn:SequenceFlow>`, `<bpmn:Group>` y `<bpmn:SubProcess>` no canónicos, y sigue **activo**. El XML que genere el MCP saldrá igual que el del cliente si usa el mismo moddle. Para no ser peor que la app, ni distinto, debe usar exactamente `flujo.json` y `normalizeBpmnXml`. |
| **EXP-022** | El guardado es todo o nada. El MCP debe validar el árbol (parseo con moddle **y** `importXML` en las pruebas) antes de escribir, no después. |
| EXP-008 | Diagnóstico de corrupción: las salvaguardas de `looksLikeBpmn` y la normalización se reutilizan, no se reescriben (como dice PLAN-024 paso 1). |
| EXP-015, EXP-016 | Cualquier SQL nuevo (auditoría, límite de peticiones, RLS por `client_id`) va como archivo, se prueba con `db:reset` y nunca se aplica por MCP sin archivo. **Y el propio MCP de Supabase de las sesiones de desarrollo no debe usar `apply_migration`.** |
| EXP-014 | Cualquier política nueva de `SELECT` va con predicado conjuntista (DEC-005). |

---

## 9. Decisiones que necesitan al usuario (entrada de la Fase 1)

1. **Opción de concurrencia:** A + C con D como salida (recomendada), o solo D, o esperar a MASTER-PLAN-019. **C cambia el comportamiento del conflicto en el cliente** (DEC-009).
2. **Despliegue por etapas:** primero lectura y `crear_diagrama`; `modificar_diagrama` cuando C esté en producción.
3. **Alojamiento:** proyecto de Vercel aparte en `mcp/` (V1, recomendada) frente a la misma app (V2). Y **qué plan de Vercel** tiene el proyecto.
4. **OAuth:** activar el servidor OAuth de Supabase (beta) y DCR en producción, después del laboratorio. Confirmar si el proyecto ya usa claves de firma asimétricas.
5. **RLS por `client_id`:** sí o no a políticas restrictivas para el conector (cambio de BD).
6. **Almacén del límite de peticiones y de la auditoría:** tabla en Postgres (cambio de BD) o proveedor externo.
7. **`validation.ts`:** corregir que no mire los procesos dentro de pools (cambia la UI) o replicar el comportamiento actual en el MCP.
8. **Hueco de §1.4** (crear un diagrama en un proyecto ajeno): ¿se añade a `auditoria-seguridad-acceso.md` como SEG-11?
9. **Entorno:** instalar Node 22 LTS y Docker Desktop en esta máquina, o hacer la Fase 2 en otra. **Sin eso no hay laboratorio.**

## 10. Pendiente de la Fase 0

- [x] Ejecutar `scripts/mcp-layout-spike.mjs` (2026-10-08): refuta la hipótesis, ver §5.1. La revisión visual ya no hace falta para decidir.
- [ ] Verificar en las fuentes oficiales los planes y requisitos de Claude y ChatGPT.
- [ ] Ejecutar las lecturas de producción de §7.
- [ ] Verificar en el laboratorio el comportamiento de `aud` y `client_id` con un token OAuth real.
