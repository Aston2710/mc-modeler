# Informe: conector MCP de Flujo — Fase 2 (implementación en el laboratorio)

**Fecha:** 2026-10-08 · **Solicitado por:** santiagojmg28
**Procedencia:** implementación y pruebas asistidas por Claude, sobre el plan aprobado ([MASTER-PLAN-038](../plans/todo/038-master-plan-conector-mcp.md), [DEC-013](../context/decisiones.md)). Investigación previa: [`investigacion-mcp.md`](investigacion-mcp.md).
**Ámbito:** **solo laboratorio.** Sin commits, sin push y sin despliegue. **Nada se ha aplicado a producción:** ni la migración, ni la configuración de Auth, ni el servidor.

---

## 1. Qué hay

| Pieza | Dónde | Qué hace |
|---|---|---|
| Núcleo de dominio | `src/domain/bpmn-model/` | Modelo semántico; validación de integridad; **layout propio** (columnas, filas por carril, pools apilados, subprocesos expandidos, eventos de borde); generación de XML con el moddle `flujo` de la app; trazado de flechas con **el mismo `BizagiLayouter` del cliente**; edición de alto nivel sobre XML existente; simplificación para leer; validación con la función de la app |
| Servidor MCP | `mcp/` (paquete aislado, Vercel aparte) | 6 tools; OAuth como *resource server*; límites; compuerta de presencia; CAS |
| Base de datos | `supabase/migrations/20261008120000_mcp_conector.sql` | Guardia del conector por `client_id`: solo crear y modificar contenido; auditoría por trigger; límites; contador de llamadas. **Probada solo en el laboratorio** |
| Cliente (SPA) | `src/` | Pantalla `/oauth/consent`; **opción C** en `diagramStore.saveDiagram`; corrección de `validation.ts` en pools; texto del aviso de conflicto externo |

### Tools

| Tool | Tipo | Notas |
|---|---|---|
| `listar_proyectos` | lectura | Con tu rol y `puedo_crear_diagramas` |
| `listar_diagramas` | lectura | Paginado; filtra por proyecto o texto; nunca trae `current_xml` |
| `obtener_diagrama` | lectura | Estructura simplificada (no el XML), `version` para el CAS, `mi_rol` |
| `validar_diagrama` | lectura | La misma validación que el botón Validar; **avisa, no bloquea** |
| `crear_diagrama` | escritura | Modelo sin coordenadas → layout, XML, validación; **idempotente** (id UUIDv5 del usuario + clave o contenido) |
| `modificar_diagrama` | escritura | **Solo con `MCP_HABILITAR_MODIFICAR=1` (etapa 2)**. Operaciones `agregar_nodo`, `conectar`, `renombrar` y `eliminar` (de nodo o flujo); todo o nada; CAS; compuerta de presencia; con `si_esta_abierto="copiar"` guarda una copia. Lleva `destructiveHint: true` para que el cliente pida confirmación |

**Ninguna tool borra ni mueve diagramas o proyectos.** Además, la base lo impide para el token del conector aunque alguien lo use sin pasar por el MCP.

---

## 2. Qué se probó y cómo

| Batería | Dónde | Resultado |
|---|---|---|
| Suite de la SPA (`npm run test`) | raíz | **479/479** (427 de la línea base + 52 nuevas). Las aserciones existentes no se tocaron; las de reintento declaran ahora su supuesto (hay un par en la sesión) |
| `npm run lint` · `npm run build` | raíz | limpios |
| `tsc` del servidor | `mcp/` | limpio |
| Base del conector | `supabase/pruebas/mcp_conector.sql` | **32/32** casos, como `authenticated` con claims reales |
| Integración del conector | `mcp/pruebas/conector.prueba.ts` | **24/24**, con tokens OAuth **reales** del servidor OAuth del laboratorio (registro dinámico + PKCE + consentimiento) |
| Extremo a extremo con la app | `mcp/pruebas/e2e.prueba.ts` | **11/11**, en Edge con la app real del laboratorio |

### Lista de verificación del encargo

**Integridad de datos**

| | Comprobación | Estado | Evidencia |
|:-:|---|---|---|
| ✅ | Toda escritura usa CAS, sin `UPDATE` ciego | hecho | `mcp/src/datos.ts` `actualizarConCas` (`eq('updated_at', esperada)`); `insertarDiagrama` es INSERT |
| ✅ | Dos escrituras sobre la misma versión: una gana y la otra recibe conflicto con el estado actual | probado | integración "dos escrituras…"; el ganador es el que queda en la base |
| ✅ | Sesión colaborativa abierta (dos navegadores) mientras el MCP intenta modificar | probado | e2e: rechaza nombrando a quien lo tiene abierto y no cambia `updated_at`; con los navegadores cerrados modifica, y al reabrir se ve el cambio sin errores |
| ✅ | XML generado o modificado pasa moddle e `importXML` sin errores | probado | `construirXml.test.ts` y `editar.test.ts` con bpmn-js real en jsdom (`warnings == []`); además, moddle relee cada XML antes de devolverlo |
| ⚠️ | Ida y vuelta con un diagrama **real de producción** | **parcial** | Probado con un XML que imita producción: atributo y `extensionElements` `bizagi:`, ruta manual `flujo:manualRoute` y anotación. Ids, coordenadas y extensiones quedan intactos. **No** se probó con un diagrama de producción porque no hay acceso. Ver §5 |
| ✅ | Lo creado por el MCP se abre, se edita, se exporta (.bpmn, PNG, SVG, PDF) y se guarda desde la UI | probado | e2e: descargas reales de los cuatro formatos y guardado con el botón |
| ✅ | Layout revisado a ojo en simple, compuertas, pools y carriles, subproceso expandido | revisado | Capturas en `mcp/pruebas/capturas/`. El caso de compuertas tenía un defecto, ya corregido (§4) |
| ✅ | Entradas inválidas (ids duplicados, flujo a inexistente, payload gigante) → error claro y nada escrito | probado | integración; HTTP 413 a partir de 512 kB; la base rechaza XML de más de 1 MB y más de 500 elementos |
| ✅ | Los reintentos no duplican | probado | mismo id, `ya_existia: true`, un solo registro |
| ⚠️ | Backup previo antes de probar con datos reales | **no aplica todavía** | No se tocó ningún dato real: todo es laboratorio. Antes de la primera escritura en producción, ejecutar el backup de `operacion-scripts.md` |

**Seguridad y permisos**

| | Comprobación | Estado | Evidencia |
|:-:|---|---|---|
| ✅ | Cero `service_role` en el código del MCP, el repo y el bundle | verificado | `grep`: solo comentarios que dicen que no se usa y la documentación interna de `supabase-js`. No hay ninguna clave. `config.ts` no lee esa variable |
| ✅ | Dos usuarios: A no ve ni toca lo de B; un viewer no escribe | probado | integración (proyectos, diagramas, creación en proyecto ajeno, viewer) y base (casos 4–5) |
| ✅ | Token inválido, caducado, manipulado o ausente → 401 sin información | probado | integración. **Y una sesión normal de la app también da 401**: solo se aceptan tokens del servidor OAuth |
| ✅ | Límite de ritmo y de tamaño | probado | 60 llamadas por minuto (RPC); 20 escrituras por minuto, 1 MB y 500 elementos (trigger); 512 kB por petición |
| ✅ | Ninguna tool destructiva expuesta | probado | `tools/list`. La base, además, rechaza DELETE, papelera, mover, colaboradores, comentarios, imágenes y storage con token del conector |
| ✅ | Sin tokens ni contenido sensible en logs | revisado | El servidor no registra nada salvo la URL al arrancar en local; `verboseLogs: false`; los errores de herramienta no incluyen detalles internos |
| ⚠️ | `.env.local` intacto | **no existe en esta copia de trabajo** | `git status` no lo muestra y `ls` no lo encuentra. No se creó, movió ni editó. Si existe en otra copia, no se ha tocado |

**Compatibilidad y regresión**

| | Comprobación | Estado |
|:-:|---|---|
| ✅ | `npm run test` completo | 479/479 |
| ✅ | `npm run lint --max-warnings 0` | limpio |
| ✅ | `npm run build` | correcto |
| ✅ | Modo IndexedDB sin `VITE_SUPABASE_*` | e2e: crea, guarda y recarga; `/oauth/consent` dice que no hay conector |
| ✅ | Colaboración Yjs sin regresiones | e2e: una edición en un navegador llega al otro; las pruebas unitarias de colaboración pasan |
| ✅ | El bundle de la SPA no creció por dependencias del servidor | 1 514,82 → 1 517,98 kB (+3,2 kB de textos i18n y código propio); ninguna dependencia de `mcp/` en el bundle; la pantalla de consentimiento va en un *chunk* aparte de 4 kB que solo se carga en `/oauth/consent` |
| ✅ | SQL solo prototipado, probado con `db:reset`, sin tocar producción | sí |

**Proceso y documentación**

| | Comprobación | Estado |
|:-:|---|---|
| ✅ | `docs/` consultado y EXP citados | investigación §8; DEC-013 |
| ✅ | DEC-013 y master plan redactados; el cierre es del usuario | DEC-013 vigente por aprobación; MASTER-PLAN-038 **sin cerrar** |
| ✅ | `docs/` actualizado | índices; `context/arquitectura-persistencia.md` §6; `context/desarrollo-local.md`; PLAN-039 a PLAN-042; auditoría de seguridad (SEG-11 confirmado) |
| ✅ | Hipótesis registradas con su fuente | investigación §7 y §5.1 (layout refutado por medición) |
| ✅ | Sin commits, push ni despliegue | sí |

---

## 3. Lo que la implementación descubrió

| Hallazgo | Consecuencia |
|---|---|
| **El cliente re-traza todas las flechas no manuales al abrir** (`ConnectionImportNormalizer`). La investigación suponía lo contrario | Las flechas que escribe el MCP solo tienen que ser válidas; al abrir quedan como las de la app. Corregido en la investigación §5.3 |
| `BizagiLayouter` se puede ejecutar **fuera de bpmn-js** con formas simuladas | El servidor traza con exactamente el mismo router que el cliente (`trazado.ts`) |
| **La app escribe `element_count = 0` en cada autoguardado** (`useAutoSave` llama a `saveDiagram(id, xml, undefined, …)`). Confirmado en producción: `max(element_count) = 0` | El MCP escribe el recuento real, pero el siguiente guardado de la app lo pone a 0. **No se ha corregido**: fuera de alcance |
| **SEG-11 confirmado en el laboratorio**: una sesión normal puede crear un diagrama en un proyecto ajeno | Cerrado para el conector; el arreglo general sigue pendiente (ver la auditoría) |
| En la app, un subproceso **expandido** se trata como obstáculo para sus propias flechas (`isRoutingContainer` no lo incluye) y lleva el marcador ⊞ de "enlazar diagrama" | Se dibuja bien, pero el router avisa en desarrollo. La app está pensada para subprocesos enlazados |
| `signOut()` de la barra del laboratorio es **global** y revoca las otras sesiones del mismo usuario | Solo afecta a pruebas con dos navegadores; está anotado en la prueba |
| zod 4 `.uuid()` es RFC estricto y rechaza ids válidos en Postgres (los del *seed*) | Se usa `z.guid()` |

---

## 4. Revisión visual del layout

Las capturas están en `mcp/pruebas/capturas/`, en `.gitignore`, y se regeneran con la prueba e2e.

| Caso | Resultado |
|---|---|
| Simple | Correcto, de izquierda a derecha |
| Compuertas | **Primer intento defectuoso:** la rama "No" caía junto a "Preparar envío" y sus flechas se confundían. **Corregido**: las filas se asignan en profundidad reservando el recorrido de las flechas largas. Hay prueba de regresión |
| Pools y carriles | Correcto: pools apilados, nodos en su carril, flujos de mensaje discontinuos y temporizador montado. Un flujo de mensaje cruza el carril de Operaciones, por decisión del router de la app |
| Subproceso expandido | Correcto: el contenido queda dentro y el evento de error en el borde. Tiene el marcador ⊞ de la app (ver §3) |

---

## 5. Pendiente

### Requiere tu aprobación

1. **Migración de base de datos en producción:** `supabase/migrations/20261008120000_mcp_conector.sql`. Probada en el laboratorio con `db:reset` y 32/32 casos. Es reversible: el bloque REVERTIR está al final del archivo.
2. **Configuración de Supabase Auth en producción** (panel, Authentication → OAuth Server):
   - activar el servidor OAuth (beta, plan Free) y el registro dinámico;
   - ruta de autorización `/oauth/consent`;
   - añadir `https://mc-modeler.vercel.app/oauth/consent**` a las URLs de redirección permitidas, para que el enlace mágico vuelva a la pantalla de consentimiento.

   Producción ya firma con **ES256**, así que no hay que cambiar claves.
3. **Desplegar la SPA** (merge a `main`): pantalla de consentimiento, opción C, corrección de `validation.ts` y textos. **Cambia lo que ve el usuario en dos sitios:**
   - el botón Validar ahora avisa de pools sin inicio o fin;
   - un conflicto con un escritor externo estando solo pregunta en vez de reintentar.
4. **Crear el proyecto de Vercel `mcp/`** (Hobby):
   - *Root Directory* `mcp/`, *Build Command* `npm run build`;
   - **activar "Include files outside the Root Directory"**;
   - variables `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `APP_URL` y `MCP_PUBLIC_URL`;
   - **`MCP_HABILITAR_MODIFICAR` sin definir** en la etapa 1.
5. **Etapa 2:** poner `MCP_HABILITAR_MODIFICAR=1` **solo después** del punto 3 en producción.
6. **Cerrar** PLAN-039 a PLAN-042 y MASTER-PLAN-038.

### Sin probar todavía

- **El despliegue en Vercel:** el lanzador Node con el adaptador propio y el enrutado `_r` de la Build Output API. Se probó el mismo manejador en local, no en Vercel. Primer paso recomendado: un despliegue de **vista previa** contra producción en solo lectura.
- **Conectar Claude de verdad**, con la UI de conectores y el Inspector. Procedimiento en `mcp/README.md`. El flujo OAuth sí se probó con un cliente simulado que hace lo mismo: registro dinámico, PKCE y consentimiento.
- **ChatGPT:** no se probó (D9).
- **Ida y vuelta con un diagrama real de producción** con `bizagi:`. Hace falta una copia de 1 o 2 diagramas (por ejemplo, de un backup) para cargarla en el laboratorio. Manejar datos reales requiere tu visto bueno.

### Riesgo residual (mitigado, no resuelto)

- **Pestaña de fondo desactualizada con otra persona presente:**
  1. A tiene el diagrama en una pestaña de fondo, sin presencia en el canal.
  2. El MCP escribe.
  3. B abre el diagrama, ya con el cambio.
  4. A vuelve a la pestaña y edita.

  Como A ya no está solo, el reintento entre pares puede pisar el cambio. Es improbable (exige las cuatro cosas), pero no imposible. **Arreglo propuesto, sin hacer:** revalidar `updated_at` al reactivar una pestaña cacheada.
- **Ventana entre la compuerta de presencia y la escritura:** solo cuenta si quien abre tenía el diagrama cargado de antes (el caso anterior).
- **Supabase OAuth está en beta.**
- **`aud=authenticated`:** desviación consciente de RFC 8707, compensada como explica DEC-013.
- **Sin miniatura** hasta que alguien edite el diagrama en la app.
