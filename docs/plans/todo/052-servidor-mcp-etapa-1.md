---
id: PLAN-052
titulo: Servidor MCP, etapa 1 — lectura, validación, creación y consentimiento OAuth
estado: en-progreso
creado: 2026-10-08
cerrado:
aprobado_por:
relacionados: [MASTER-PLAN-049, PLAN-050, PLAN-051, DEC-014]
---

# Servidor MCP, etapa 1

Fase 2 de [MASTER-PLAN-049](049-master-plan-conector-mcp.md). Paquete aislado `mcp/`, con su procedimiento en `mcp/README.md`.

- **Tools de la etapa 1:** `listar_proyectos`, `listar_diagramas`, `obtener_diagrama`, `validar_diagrama` y `crear_diagrama` (idempotente).
- **Autenticación:**
  - `withMcpAuth` de `mcp-handler` 2.3, con 401 y RFC 9728;
  - verificación con `getClaims` (JWKS ES256 en producción);
  - **exige la claim `client_id`**, así que las sesiones normales de la app se rechazan.
- **Límites:**
  - 512 kB por petición (413);
  - 60 llamadas por minuto (RPC en la base);
  - 25 s por tool.
- **Empaquetado:** esbuild → Build Output API de Vercel, con una sola función para todas las rutas.
- **Cliente:**
  - página `/oauth/consent` (`src/components/auth/OAuthConsent.tsx`, en un *chunk* aparte);
  - `LoginView` y `authStore` aceptan una URL de retorno opcional.

## Estado de ejecución — 2026-10-08

- ✅ 24/24 de integración, con tokens OAuth reales del laboratorio.
- ✅ Pantalla de consentimiento probada en el navegador: muestra el cliente y los permisos, y el código que devuelve "Permitir" se canjea y funciona contra el MCP.
- ✅ Lo creado se abre, se edita, se exporta en los cuatro formatos y se guarda desde la UI. El modo local sigue intacto.
- ☐ Despliegue de **vista previa** en Vercel (lanzador Node y enrutado `_r`, sin probar en Vercel).
- ☐ Configurar Auth en producción (PLAN-050), desplegar la SPA y crear el proyecto de Vercel. Todo requiere aprobación.
- ☐ Conectar Claude de verdad y probar con el Inspector.

## Estado de ejecución — 2026-10-09 (entorno alojado de ensayo)

- ✅ **Desplegado en Vercel** con `npm run build` + `vercel deploy --prebuilt`: el lanzador Node y el enrutado `_r` funcionan. `/.well-known/oauth-protected-resource` → 200; `POST /mcp` sin token → 401 con `resource_metadata`.
- ✅ **Inspector**: registro dinámico, consentimiento en la SPA desplegada, y las tools de lectura y `crear_diagrama`.
- ✅ **Claude** como conector personalizado (DCR, "Iniciar sesión ahora"): crea diagramas desde lenguaje natural y los valida.
- ✅ La portada genera las miniaturas de lo creado por el conector (MASTER-PLAN-049, D10); `crear_diagrama` ya no dice que haga falta editarlo.
  - *2026-10-15:* revertido en esta rama. Va en su propio PR y apagado hasta MASTER-PLAN-044 (revisión del PR #1, R3 e I6); `crear_diagrama` vuelve a avisar del icono genérico.
- ⚠️ Cada reconexión de Claude registra un cliente OAuth nuevo (7 en una hora de pruebas). A vigilar en producción.
- ⚠️ Claude guarda la lista de tools de cuando se conectó: tras desplegar una versión nueva, hay que reconectar.
- ☐ Producción: pasos en `mcp/README.md` → Puesta en producción.

## Estado de ejecución — 2026-10-15 (revisión del PR #1)

- ✅ **R1:** el consentimiento destaca el host de retorno y avisa en rojo si no es `claude.ai`, `claude.com` o local (`src/lib/oauthRetorno.ts`, 5 pruebas unitarias y un caso e2e con un cliente «Claude» que vuelve a otro dominio). La guía de producción pasa a **cliente pre-registrado sin DCR**. ✅ Comprobado: Claude admite *Use your own OAuth client* con secreto en blanco, y el flujo sin DCR con cliente público funciona en el laboratorio (registro → 403, consentimiento, token, MCP y refresh).
- ✅ **R2:** tabla *Apagar* corregida y revocación documentada (`auth.oauth_consents`, `auth.sessions.oauth_client_id`, rotación de clave). ☐ Lista de «aplicaciones conectadas» en Ajustes, a medio plazo.
- ✅ **R4:** las tools que devuelven texto de usuarios y las `instructions` dicen que es dato, nunca instrucción.
- ✅ **R5:** el consentimiento dice que lo que lea el asistente se envía a ese servicio.
- ✅ **R6:** `MCP_PUBLIC_URL` obligatoria y `https://` en Vercel o con `NODE_ENV=production` (4 pruebas).
- ✅ Laboratorio: integración 28/28, e2e 13/13 (con el caso de dominio ajeno y la ida y vuelta Bizagi), base 32/32.
