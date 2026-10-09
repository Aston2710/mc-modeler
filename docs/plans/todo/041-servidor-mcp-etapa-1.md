---
id: PLAN-041
titulo: Servidor MCP, etapa 1 — lectura, validación, creación y consentimiento OAuth
estado: en-progreso
creado: 2026-10-08
cerrado:
aprobado_por:
relacionados: [MASTER-PLAN-038, PLAN-039, PLAN-040, DEC-013]
---

# Servidor MCP, etapa 1

Fase 2 de [MASTER-PLAN-038](038-master-plan-conector-mcp.md). Paquete aislado `mcp/`, con su procedimiento en `mcp/README.md`.

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
- ☐ Configurar Auth en producción (PLAN-039), desplegar la SPA y crear el proyecto de Vercel. Todo requiere aprobación.
- ☐ Conectar Claude de verdad y probar con el Inspector.

## Estado de ejecución — 2026-10-09 (entorno alojado de ensayo)

- ✅ **Desplegado en Vercel** con `npm run build` + `vercel deploy --prebuilt`: el lanzador Node y el enrutado `_r` funcionan. `/.well-known/oauth-protected-resource` → 200; `POST /mcp` sin token → 401 con `resource_metadata`.
- ✅ **Inspector**: registro dinámico, consentimiento en la SPA desplegada, y las tools de lectura y `crear_diagrama`.
- ✅ **Claude** como conector personalizado (DCR, "Iniciar sesión ahora"): crea diagramas desde lenguaje natural y los valida.
- ✅ La portada genera las miniaturas de lo creado por el conector (MASTER-PLAN-038, D10); `crear_diagrama` ya no dice que haga falta editarlo.
- ⚠️ Cada reconexión de Claude registra un cliente OAuth nuevo (7 en una hora de pruebas). A vigilar en producción.
- ⚠️ Claude guarda la lista de tools de cuando se conectó: tras desplegar una versión nueva, hay que reconectar.
- ☐ Producción: pasos en `mcp/README.md` → Puesta en producción.
