# Servidor MCP de Flujo

Conector remoto para que una IA (Claude; ChatGPT si es compatible) cree y modifique diagramas BPMN en el espacio de trabajo del usuario. Diseño y decisiones en [MASTER-PLAN-049](../docs/plans/todo/049-master-plan-conector-mcp.md) y [DEC-014](../docs/context/decisiones.md). Informes: [Fase 2, laboratorio](../docs/addons/informe-mcp-fase-2.md) · [Fase 3, entorno alojado](../docs/addons/informe-mcp-fase-3.md).

Paquete **aislado** de la SPA: dependencias propias (zod 4, SDK de MCP v2) y despliegue propio. Comparte el núcleo de dominio `../src/domain/bpmn-model/`.

**Nunca usa `service_role`:** actúa con el JWT del usuario, emitido por el servidor OAuth de Supabase.

## Conectar Claude (guía para usuarios)

Para cualquier persona con cuenta en Flujo. No hace falta tocar Supabase ni nada técnico: el administrador ya dejó dado de alta a Claude una sola vez, y te pasa dos datos.

| Dato | Valor | Quién lo da |
|---|---|---|
| URL del conector | `<URL del conector>`, termina en `/mcp` | el administrador de Flujo |
| Client ID | `<Client ID>`, el mismo para todos | el administrador de Flujo |

El Client ID **no es secreto**: no da acceso a nada por sí solo. Lo que protege tu cuenta es que inicias sesión tú y apruebas el acceso.

### Añadir el conector

**Plan Free, Pro o Max** (lo haces tú, una vez):

1. En [claude.ai](https://claude.ai), menú de tu cuenta → **Customize → Connectors** → **Add custom connector**.
2. **Name:** `Flujo`. **URL:** la URL del conector.
3. **OAuth client → Use your own OAuth client** (si el diálogo es de una sola pantalla, está en **Advanced settings**). **Client ID:** el que te dieron. **Client secret:** déjalo **vacío**.
4. **Add**.

**Plan Team o Enterprise:** un administrador de tu organización de Claude lo añade una vez en **Organization settings → Connectors → Add → Custom**, con la misma URL y Client ID. Tú solo lo verás en **Customize → Connectors** con la etiqueta *Custom*.

### Conectarlo con tu cuenta de Flujo

1. En **Customize → Connectors**, junto a *Flujo*, pulsa **Connect**.
2. Se abre la pantalla **«Conectar un asistente a Flujo»**. Si no tienes sesión abierta, inicia sesión con tu cuenta de Flujo.
3. Antes de aprobar, comprueba el recuadro **«Volverás a»**: tiene que decir **`claude.ai`**. Si dice otra cosa o aparece un **aviso en rojo**, pulsa **Rechazar**: alguien está intentando hacerse pasar por Claude.
4. Pulsa **Permitir**. Vuelves a Claude y el conector queda conectado.

Cada persona conecta **su propia** cuenta: Claude solo ve y edita lo que tú puedes ver y editar en Flujo.

### Usarlo

En un chat, botón **+ → Connectors**, activa *Flujo* y pide cosas en lenguaje normal:

- «Lista mis proyectos de Flujo».
- «Crea un diagrama del proceso de compras en el proyecto X, con los carriles Solicitante y Aprobador».
- «En el diagrama Y, añade una tarea «Registrar en contabilidad» después de la aprobación y conéctala».
- «Revisa el diagrama Y y dime si le falta algún inicio o fin».

Claude te pedirá permiso antes de usar cada herramienta. Te devuelve el enlace al diagrama para abrirlo en Flujo.

**Lo que puede hacer:** ver tus proyectos y diagramas, crear diagramas y modificar los que puedes editar. **Lo que no puede:** borrar ni mover diagramas o proyectos, cambiar colaboradores, ni tocar comentarios, imágenes o notificaciones. Un diagrama que alguien tiene abierto en Flujo no se modifica en sitio: Claude crea una copia «(propuesta IA)».

Todo lo que Claude lee de tus diagramas se envía a Claude para responderte. Si un proceso no debe salir de la empresa, no se lo pidas.

### Problemas frecuentes

| Síntoma | Qué hacer |
|---|---|
| Claude no ve una herramienta nueva | Quita el conector y vuelve a añadirlo y conectarlo: Claude guarda la lista de herramientas de cuando conectaste |
| Te equivocaste de Client ID | Los datos del conector no se pueden editar: quítalo y añádelo de nuevo |
| Claude dice que el diagrama está abierto en Flujo | Ciérralo en Flujo (todas las pestañas) o pide a Claude que haga una copia |
| Claude dice que se alcanzó el límite de escrituras | Espera un minuto y repite |
| La pantalla de consentimiento dice que la solicitud caducó | Vuelve a pulsar **Connect** en Claude |

### Desconectarlo

En **Customize → Connectors**, *Flujo* → **Remove** (o **Disconnect**). Si crees que alguien conectó tu cuenta sin permiso, avisa al administrador de Flujo: puede revocar el acceso al momento (ver [Apagar](#apagar)).

## Tools

Seis tools. Las de lectura no escriben nada. **Ninguna borra ni mueve diagramas o proyectos**, y la base lo impide también para el token del conector aunque alguien lo use sin pasar por aquí (migración `20261008120000_mcp_conector.sql`).

| Tool | Tipo | Parámetros | Devuelve |
|---|---|---|---|
| `listar_proyectos` | lectura | `limite` (1–50, 20) · `desplazamiento` | proyectos con el rol del usuario y `puedo_crear_diagramas` |
| `listar_diagramas` | lectura | `proyecto_id?` · `buscar?` (texto del nombre) · `limite` · `desplazamiento` | id, nombre, versión y `url`; nunca el XML |
| `obtener_diagrama` | lectura | `diagrama_id` | `estructura` (pools, carriles, nodos, flujos, mensajes y `otros`), **`version`** para el CAS, `mi_rol`, `puedo_editar`, `url` |
| `validar_diagrama` | lectura | `diagrama_id` **o** `modelo` | los avisos del botón Validar de la app; avisa, no bloquea |
| `crear_diagrama` | escritura | `nombre` · `modelo` · `proyecto_id?` (sin él, va a los diagramas sueltos) · `clave_idempotencia?` | id, `version`, `url`, `elementos`, `avisos`, `ya_existia`. **Idempotente:** repetir con los mismos datos devuelve el mismo diagrama |
| `modificar_diagrama` | escritura | `diagrama_id` · `version_esperada` · `operaciones` (1–50) · `si_esta_abierto` (`fallar` \| `copiar`) | id, nueva `version`, `cambios`, `avisos`; o la copia, si estaba abierto y se pidió `copiar`. **Solo existe con `MCP_HABILITAR_MODIFICAR=1`** |

### El `modelo` de `crear_diagrama`

Sin coordenadas: el servidor calcula el layout y traza las flechas con el mismo `BizagiLayouter` que la app.

```json
{
  "pools": [{
    "id": "compras", "nombre": "Compras",
    "carriles": [{ "id": "solicitante", "nombre": "Solicitante" }, { "id": "aprobador", "nombre": "Aprobador" }],
    "nodos": [
      { "id": "inicio", "tipo": "inicio", "carril": "solicitante" },
      { "id": "pedir", "tipo": "tarea_usuario", "nombre": "Crear solicitud", "carril": "solicitante" },
      { "id": "ok", "tipo": "compuerta_exclusiva", "nombre": "¿Aprobada?", "carril": "aprobador" },
      { "id": "fin", "tipo": "fin", "carril": "aprobador" }
    ]
  }],
  "flujos": [{ "desde": "inicio", "hasta": "pedir" }, { "desde": "pedir", "hasta": "ok" }, { "desde": "ok", "hasta": "fin", "nombre": "Sí" }],
  "mensajes": []
}
```

- **Tipos de nodo:** `inicio`, `fin`, `intermedio_captura`, `intermedio_lanzamiento`, `evento_borde` (con `adjunto_a` e `interrumpe`), `tarea`, `tarea_usuario`, `tarea_servicio`, `tarea_manual`, `tarea_script`, `tarea_envio`, `tarea_recepcion`, `tarea_regla_negocio`, `subproceso` (con `nodos` dentro, se dibuja expandido), `compuerta_exclusiva`, `compuerta_paralela`, `compuerta_inclusiva`, `compuerta_eventos`, `compuerta_compleja`.
- **`evento`** (solo eventos): `mensaje`, `temporizador`, `error`, `senal`, `terminacion`, `condicional`, `escalamiento`, `compensacion`.
- **Reglas:** ids únicos; un `flujo` une nodos del mismo pool y nivel; entre pools van `mensajes`; si un pool tiene carriles, cada nodo de primer nivel indica el suyo.
- **Tamaño de las tareas:** 90×60 como la paleta, salvo que el nombre no quepa sin chocar con el icono del tipo; entonces crece hasta 180×100 (`src/domain/bpmn-model/tamanoActividad.ts`).

### Operaciones de `modificar_diagrama`

Se aplican **en orden** y **todas o ninguna**. Lo que no se nombra —ids, coordenadas, flechas manuales, extensiones `flujo:` y `bizagi:`— sale igual que entró.

| `op` | Campos | Qué hace |
|---|---|---|
| `agregar_nodo` | `id`, `tipo`, `nombre?`, `pool?`, `carril?`, `despues_de?`, `dentro_de?`, `evento?`, `adjunto_a?`, `interrumpe?` | Nodo nuevo. Con `despues_de`, a la derecha de ese nodo y en su carril; si no cabe, el carril o el pool crecen |
| `agregar_pool` | `id`, `nombre`, `carriles?` | Pool vacío, con su proceso, **debajo de todo**, alineado con el primer pool y tan ancho como el más ancho. No mueve nada |
| `agregar_carril` | `id`, `nombre`, `pool`, `despues_de?` | Carril de 120 px debajo de `despues_de` (o al final). Lo de debajo baja y el pool crece. En un pool sin carriles, lo que había pasa a un primer carril sin nombre |
| `conectar` | `desde`, `hasta`, `nombre?`, `id?` | Mismo pool y nivel → flujo de secuencia; pools distintos → flujo de mensaje |
| `renombrar` | `id`, `nombre` | Cualquier elemento con nombre: nodo, flujo, **pool o carril**. `""` lo deja sin nombre |
| `eliminar` | `id` | Un nodo o un flujo, con sus flujos y eventos de borde dependientes. **Nunca** pools, carriles ni el diagrama |

Ejemplo: añadir un pool y conectarlo con el existente en una sola llamada.

```json
{
  "diagrama_id": "…", "version_esperada": "<version de obtener_diagrama>",
  "operaciones": [
    { "op": "agregar_pool", "id": "portero", "nombre": "Portero" },
    { "op": "agregar_nodo", "id": "recibir", "tipo": "tarea_recepcion", "nombre": "Recibir identificación", "pool": "portero" },
    { "op": "agregar_nodo", "id": "autorizar", "tipo": "tarea_envio", "nombre": "Enviar autorización", "despues_de": "recibir" },
    { "op": "conectar", "desde": "recibir", "hasta": "autorizar" },
    { "op": "conectar", "desde": "identificarse", "hasta": "recibir", "nombre": "Identificación" }
  ]
}
```

### Errores y límites

| Situación | Respuesta |
|---|---|
| Sin token, o token sin `client_id` (una sesión normal de la app) | HTTP 401 con `WWW-Authenticate` y `resource_metadata` |
| `version_esperada` distinta de la actual | conflicto, nada escrito, con la estructura actual para reintentar |
| Diagrama abierto por alguien en Flujo, con `si_esta_abierto: "fallar"` | rechazo nombrando a quien lo tiene abierto, nada escrito |
| Petición de más de 512 kB | HTTP 413 |
| XML de más de 1 MB | rechazado por la base (PT413) |
| Un modelo, o una edición, que deje más de 500 elementos | rechazado por el servidor, antes de escribir. **No** lo comprueba la base: `element_count` lo manda el cliente (revisión del PR #1, R7) |
| Más de 20 escrituras o de 60 llamadas por minuto y usuario | rechazado (PT429), "espera un minuto". Es **aproximado**: se cuenta sin bloqueo y, con escrituras simultáneas del mismo usuario, pasan algunas de más (R8) |
| Una tool tarda más de 25 s | se abandona con error |
| Un `viewer` intenta escribir | rechazado por RLS |

## En el laboratorio

```powershell
npm run lab                         # en la raíz: Supabase en Docker + app en :7654
cd mcp; npm ci
# mcp/.env.lab (en .gitignore): SUPABASE_URL=http://127.0.0.1:54321,
# SUPABASE_ANON_KEY=<la de vite.config.ts>, APP_URL=http://localhost:5175,
# MCP_PUBLIC_URL=http://localhost:7655, MCP_HABILITAR_MODIFICAR=1
npm run local                       # servidor en http://localhost:7655/mcp
```

El servidor OAuth del laboratorio está activado en `supabase/config.toml`. Su pantalla de consentimiento es `http://localhost:5175/oauth/consent`: la app con `npm run dev` y las variables `VITE_SUPABASE_*` del laboratorio por shell (ver `docs/context/desarrollo-local.md`).

## Pruebas

```powershell
npm test                                       # integración contra el laboratorio (se salta si no está)
$env:MCP_E2E='1'; npm test -- pruebas/e2e.prueba.ts
```

La prueba e2e necesita tres apps en marcha:

- `:7654` → `vite --mode lab`
- `:5175` → `vite` con `VITE_SUPABASE_*` del laboratorio
- `:5176` → `vite --port 5176` **sin** `VITE_SUPABASE_*` (modo local)

Las capturas quedan en `pruebas/capturas/`, que está en `.gitignore`.

## Prueba manual con el Inspector de MCP

1. Con el laboratorio y `npm run local` en marcha, ejecuta `npx @modelcontextprotocol/inspector`.
2. Transporte **Streamable HTTP**, URL `http://localhost:7655/mcp`.
3. Pulsa **Connect**. El Inspector descubre los metadatos (`/.well-known/oauth-protected-resource`), se registra por DCR y abre `http://localhost:5175/oauth/consent?...`.
4. Inicia sesión con `dev@local.test`; el enlace mágico llega a Mailpit, `http://127.0.0.1:54324`.
5. Pulsa **Permitir**.
6. En **Tools**, ejecuta en orden:
   1. `listar_proyectos`;
   2. `crear_diagrama`, con un modelo como los de `src/domain/bpmn-model/fixtures.ts`;
   3. `obtener_diagrama`;
   4. `modificar_diagrama`, con la `version` que devolvió `obtener_diagrama`.
7. Abre la URL que devuelve `crear_diagrama`: el diagrama está ahí.

## Puesta en producción

Para el desarrollador principal. **Cada paso que toca producción requiere aprobación explícita** (CLAUDE.md, reglas 2 y 3). Todo esto ya se ensayó en un entorno alojado aparte ([informe de la Fase 3](../docs/addons/informe-mcp-fase-3.md)). Ningún paso necesita `service_role` ni secretos nuevos: las únicas claves son la URL y la anon key, que ya son públicas en el bundle de la app.

El orden importa: la SPA tiene que estar desplegada **antes** de activar OAuth (si no, la pantalla de consentimiento da 404) y **antes** de encender `modificar_diagrama` (si no, la app pisaría en silencio lo que escriba el conector; PLAN-053).

### 0. Backup

Ejecutar el backup de [`docs/context/operacion-scripts.md`](../docs/context/operacion-scripts.md) antes de la migración.

### 1. Migración del conector

`supabase/migrations/20261008120000_mcp_conector.sql`, aplicada **con su archivo** (no con `apply_migration` suelto, para no repetir EXP-016). Es inerte para la app: todas sus comprobaciones empiezan por `if not private.es_conector() then return`. Es reversible: el bloque REVERTIR está al final del archivo.

Comprobación, solo lectura:

```sql
select count(*) from pg_trigger where tgname like 'conector_%';      -- 15
select to_regclass('private.mcp_auditoria'), to_regclass('private.mcp_ventanas');
```

### 2. Fusionar el PR (despliega la SPA)

Lo que verán los usuarios: la ruta `/oauth/consent` (inerte hasta activar el servidor OAuth) y el botón **Validar**, que ahora también revisa los procesos dentro de pools. Las miniaturas que faltan y `element_count` salieron de este PR a uno propio (rama `portada-miniaturas`, revisión del PR #1, I6); el backfill de miniaturas va **apagado** hasta que `verifyBpmn` (MASTER-PLAN-044) esté en `main` (R3). Sin ese PR, un diagrama creado por el conector enseña el icono genérico en la portada hasta que alguien lo abra y guarde.

### 3. Supabase Auth (panel de producción)

1. **Project Settings → JWT Keys:** confirmar que la clave en uso es **ES256**. Producción ya lo era el 2026-10-08. Si fuera HS256, crear una ES256 y rotar.
2. **Authentication → OAuth Server:**
   - activar el servidor OAuth (beta, incluido en el plan Free);
   - **dejar APAGADO el registro dinámico de clientes (DCR)** y dar de alta a mano un único cliente para Claude: nombre `Claude`, `redirect_uri` exactamente `https://claude.ai/api/mcp/auth_callback`, tipo **público** (método de autenticación en el token `none`, sin secreto). Claude usa PKCE S256 siempre. Guardar el Client ID para el paso 6. Si se quiere permitir Claude Code, añadir también `http://localhost/callback` y `http://127.0.0.1/callback` (Claude Code usa un puerto variable).

     Por qué (revisión del PR #1, R1): con DCR activo cualquiera puede registrar un cliente llamado «Claude» con `redirect_uri` a un dominio suyo y mandar el enlace de autorización a un usuario. Si el usuario aprueba, el atacante recibe un token que **lee todo lo que ese usuario puede leer** directamente contra PostgREST; la guardia de la base solo limita escrituras. La pantalla de consentimiento enseña destacado el host de retorno y avisa en rojo si no es `claude.ai`, `claude.com` o `localhost` (`src/lib/oauthRetorno.ts`), pero eso es la segunda barrera, no la primera.

     Comprobado el 2026-10-15: la documentación de Claude ofrece *Use your own OAuth client* («enter a client ID you registered with the server. Leave the secret blank unless your authorization server requires one»; sin secreto, Claude lo usa como cliente público). En el laboratorio, con `allow_dynamic_registration = false`: los metadatos dejan de anunciar `registration_endpoint`, `POST /oauth/clients/register` responde 403 `oauth_dynamic_client_registration_disabled`, y un cliente público dado de alta con la API de administración completa consentimiento → código → token **sin secreto** → `listar_proyectos` → refresh;
   - ruta de autorización: `/oauth/consent`.
3. **Authentication → URL Configuration:** añadir `https://mc-modeler.vercel.app/oauth/consent**` a las Redirect URLs, para que el enlace mágico vuelva a la pantalla de consentimiento.

Comprobación:

```bash
curl -s https://<ref>.supabase.co/.well-known/oauth-authorization-server/auth/v1 | grep registration_endpoint
```

Con el DCR apagado **no** tiene que salir `registration_endpoint`. Si sale, el registro dinámico sigue activo.

### 4. Proyecto de Vercel para `mcp/`, etapa 1

Proyecto **aparte**, plan Hobby, conectado al mismo repositorio:

| Ajuste | Valor |
|---|---|
| Root Directory | `mcp` |
| Framework Preset | Other |
| Build Command | `npm run build` (genera `.vercel/output` con la Build Output API; no hay Output Directory) |
| **Include files outside the Root Directory** | **activado**: el núcleo vive en `../src/domain/bpmn-model/` |
| Node | 22 (`engines` en `package.json`) |

Variables de entorno, en *Production*:

| Variable | Valor |
|---|---|
| `SUPABASE_URL` | `https://<ref>.supabase.co`, la misma que `VITE_SUPABASE_URL` de la app |
| `SUPABASE_ANON_KEY` | la misma anon key que `VITE_SUPABASE_ANON_KEY` de la app. **Nunca la `service_role`** |
| `APP_URL` | `https://mc-modeler.vercel.app` |
| `MCP_PUBLIC_URL` | la URL de este proyecto, sin barra final |
| `MCP_HABILITAR_MODIFICAR` | **sin definir** en la etapa 1 |

Si se crea con la CLI, `vercel env add SUPABASE_ANON_KEY` puede ofrecer renombrarla: **mantener el nombre**. Alternativa sin Git: `npm run build` y `npx vercel deploy --prebuilt --prod` desde `mcp/`, que solo sube `.vercel/output`.

Comprobación:

```bash
curl -s https://<proyecto-mcp>.vercel.app/.well-known/oauth-protected-resource   # 200, apunta a <ref>.supabase.co/auth/v1
curl -s -i -X POST https://<proyecto-mcp>.vercel.app/mcp -d '{}' | grep -i www-authenticate   # 401 con resource_metadata
```

Después, la prueba con el Inspector de la sección anterior, contra la URL desplegada y con una cuenta propia: `listar_proyectos`, `crear_diagrama` y abrir la `url` que devuelve.

### 5. Etapa 2: `modificar_diagrama`

Solo con el paso 2 en producción. Poner `MCP_HABILITAR_MODIFICAR=1` y volver a desplegar el proyecto del conector. Los clientes ya conectados tienen que **reconectar** para ver la tool nueva (Claude guarda la lista de tools de cuando se conectó).

### 6. Conectar Claude

*Customize → Connectors → Add custom connector* → `https://<proyecto-mcp>.vercel.app/mcp`. Autenticación: **Sign in now**. Cliente OAuth: **Use your own OAuth client** (en el diálogo de una sola pantalla está bajo **Advanced settings**) con el Client ID del paso 3 y el **secreto en blanco**. Sin encabezados. Las credenciales no se pueden cambiar después: para cambiarlas hay que quitar el conector y volver a añadirlo.

Para los usuarios: rellenar la URL del conector y el Client ID en la tabla de [Conectar Claude (guía para usuarios)](#conectar-claude-guía-para-usuarios) y repartirla. El Client ID es el mismo para todos y no es secreto (cliente público); no hay que dar de alta nada en Supabase por usuario.

En la pantalla de consentimiento, el recuadro «Volverás a» tiene que decir `claude.ai`, sin aviso rojo.

(En el laboratorio y con el Inspector se sigue usando DCR: está activado en `supabase/config.toml`, que no afecta a producción.)

### Vigilar

```sql
-- Escrituras del conector (quién, qué diagrama, versiones encadenadas)
select creado, operacion, user_id, diagram_id, elementos from private.mcp_auditoria order by id desc limit 50;
-- Clientes OAuth: con el DCR apagado tiene que haber UNO (el de Claude). Uno más es una alarma
select client_name, count(*) from auth.oauth_clients group by 1;
```

### Apagar

**Pausar el servidor MCP no corta los tokens ya emitidos** (revisión del PR #1, R2). Un token del conector es un JWT de Supabase: vale contra PostgREST, sin pasar por `mcp/`, hasta su `exp` (1 h, el `jwt_expiry` del proyecto), y su refresh token sigue dando tokens nuevos mientras la sesión exista. Ante un token filtrado hay que **revocar**, no solo apagar.

| Qué | Cómo | Efecto | Lo que NO hace |
|---|---|---|---|
| Solo la escritura en diagramas existentes | quitar `MCP_HABILITAR_MODIFICAR` y redesplegar | `modificar_diagrama` deja de existir | un token puede seguir escribiendo por PostgREST, con la guardia y la auditoría de la base |
| El servidor MCP | pausar o borrar el proyecto de Vercel `mcp/` | Claude deja de ver las tools. La app no se entera | los tokens emitidos siguen valiendo contra PostgREST |
| Altas y renovaciones | desactivar el servidor OAuth en el panel | nadie puede autorizar un cliente nuevo | no invalida sesiones ni tokens existentes |
| **Las sesiones del conector** | SQL de abajo, en el editor SQL del panel | los refresh tokens mueren: en ≤ 1 h no queda ningún token válido | el access token ya emitido vale hasta su `exp` |
| Todo token, ya | rotar la clave de firma JWT (*JWT Keys*) y revocar la anterior | ningún JWT anterior vale | **cierra también la sesión de todos los usuarios de la app**: solo ante una filtración grave |
| La guardia de la base | bloque REVERTIR de la migración | quita los límites | solo si se retira el conector |

Revocar todas las sesiones del conector (requiere aprobación, es una escritura en producción):

```sql
begin;
-- Consentimientos: el usuario tendrá que volver a aprobar.
update auth.oauth_consents set revoked_at = now() where revoked_at is null;
-- Sesiones emitidas por el servidor OAuth (las de la app no tienen oauth_client_id).
-- Sus refresh tokens caen en cascada.
delete from auth.sessions where oauth_client_id is not null;
commit;
```

Para un solo usuario o un solo cliente, añadir `and user_id = '…'` o `and client_id = '…'` / `and oauth_client_id = '…'`. Un usuario puede revocar su propio acceso con `supabase.auth.oauth.revokeGrant({ clientId })`, que hace lo mismo para su cuenta. **Pendiente** (a medio plazo): una lista de «aplicaciones conectadas» en Ajustes con ese botón, sobre `listGrants()` / `revokeGrant()`.

## Entorno de ensayo alojado (opcional)

Para repetir las pruebas fuera de producción: un proyecto Supabase vacío con las migraciones de `supabase/migrations/` aplicadas en orden, y dos proyectos de Vercel (app y `mcp/`) con sus variables apuntando a él. Detalle y trampas de la CLI de Vercel en el [informe de la Fase 3, §2](../docs/addons/informe-mcp-fase-3.md#2-el-entorno-de-ensayo). Dejar `private.notification_config` vacía, para que no salgan correos.
