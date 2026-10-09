# Servidor MCP de Flujo

Conector remoto para que una IA (Claude; ChatGPT si es compatible) cree y modifique diagramas BPMN en el espacio de trabajo del usuario. Diseño y decisiones en [MASTER-PLAN-038](../docs/plans/todo/038-master-plan-conector-mcp.md) y [DEC-013](../docs/context/decisiones.md). Informes: [Fase 2, laboratorio](../docs/addons/informe-mcp-fase-2.md) · [Fase 3, entorno alojado](../docs/addons/informe-mcp-fase-3.md).

Paquete **aislado** de la SPA: dependencias propias (zod 4, SDK de MCP v2) y despliegue propio. Comparte el núcleo de dominio `../src/domain/bpmn-model/`.

**Nunca usa `service_role`:** actúa con el JWT del usuario, emitido por el servidor OAuth de Supabase.

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
| XML de más de 1 MB o más de 500 elementos | rechazado por la base (PT413) |
| Más de 20 escrituras o de 60 llamadas por minuto y usuario | rechazado (PT429), "espera un minuto" |
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

El orden importa: la SPA tiene que estar desplegada **antes** de activar OAuth (si no, la pantalla de consentimiento da 404) y **antes** de encender `modificar_diagrama` (si no, la app pisaría en silencio lo que escriba el conector; PLAN-042).

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

Lo que verán los usuarios está en el [informe de la Fase 3, §7](../docs/addons/informe-mcp-fase-3.md#7-qué-cambia-en-producción-al-fusionar-el-pr). Lo más visible: la portada genera las miniaturas que faltan y esos diagramas suben una vez en "Última modificación".

### 3. Supabase Auth (panel de producción)

1. **Project Settings → JWT Keys:** confirmar que la clave en uso es **ES256**. Producción ya lo era el 2026-10-08. Si fuera HS256, crear una ES256 y rotar.
2. **Authentication → OAuth Server:**
   - activar el servidor OAuth (beta, incluido en el plan Free);
   - **activar el registro dinámico de clientes**. Es un interruptor aparte y viene apagado: sin él ningún cliente MCP puede darse de alta;
   - ruta de autorización: `/oauth/consent`.
3. **Authentication → URL Configuration:** añadir `https://mc-modeler.vercel.app/oauth/consent**` a las Redirect URLs, para que el enlace mágico vuelva a la pantalla de consentimiento.

Comprobación:

```bash
curl -s https://<ref>.supabase.co/.well-known/oauth-authorization-server/auth/v1 | grep registration_endpoint
```

Tiene que salir `"registration_endpoint":"https://<ref>.supabase.co/auth/v1/oauth/clients/register"`.

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

*Settings → Connectors → Add custom connector* → `https://<proyecto-mcp>.vercel.app/mcp`. Autenticación: **Iniciar sesión ahora**. Cliente OAuth: **Registrar automáticamente (DCR)**. Sin encabezados.

### Vigilar

```sql
-- Escrituras del conector (quién, qué diagrama, versiones encadenadas)
select creado, operacion, user_id, diagram_id, elementos from private.mcp_auditoria order by id desc limit 50;
-- Clientes OAuth: cada reconexión de Claude registra uno nuevo
select client_name, count(*) from auth.oauth_clients group by 1;
```

### Apagar

| Qué | Cómo | Efecto |
|---|---|---|
| Solo la escritura en diagramas existentes | quitar `MCP_HABILITAR_MODIFICAR` y redesplegar | `modificar_diagrama` deja de existir |
| Todo el conector | pausar o borrar el proyecto de Vercel `mcp/` | la app no se entera |
| Los tokens | desactivar el servidor OAuth en el panel | ningún cliente puede autenticarse |
| La guardia de la base | bloque REVERTIR de la migración | solo si se retira el conector |

## Entorno de ensayo alojado (opcional)

Para repetir las pruebas fuera de producción: un proyecto Supabase vacío con las migraciones de `supabase/migrations/` aplicadas en orden, y dos proyectos de Vercel (app y `mcp/`) con sus variables apuntando a él. Detalle y trampas de la CLI de Vercel en el [informe de la Fase 3, §2](../docs/addons/informe-mcp-fase-3.md#2-el-entorno-de-ensayo). Dejar `private.notification_config` vacía, para que no salgan correos.
