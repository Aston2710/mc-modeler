# Servidor MCP de Flujo

Conector remoto para que una IA (Claude; ChatGPT si es compatible) cree y modifique diagramas BPMN en el espacio de trabajo del usuario. Diseño y decisiones en [MASTER-PLAN-038](../docs/plans/todo/038-master-plan-conector-mcp.md) y [DEC-013](../docs/context/decisiones.md). Informe: [`docs/addons/informe-mcp-fase-2.md`](../docs/addons/informe-mcp-fase-2.md).

Paquete **aislado** de la SPA: dependencias propias (zod 4, SDK de MCP v2) y despliegue propio. Comparte el núcleo de dominio `../src/domain/bpmn-model/`.

**Nunca usa `service_role`:** actúa con el JWT del usuario, emitido por el servidor OAuth de Supabase.

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

## Despliegue (requiere aprobación; ver el informe, §5)

Proyecto de Vercel **aparte**, plan Hobby:

- *Root Directory*: `mcp/`;
- *Build Command*: `npm run build`, que genera `.vercel/output` con la Build Output API;
- **"Include files outside the Root Directory" activado**;
- variables: `SUPABASE_URL`, `SUPABASE_ANON_KEY` (públicas), `APP_URL`, `MCP_PUBLIC_URL`;
- `MCP_HABILITAR_MODIFICAR` **solo** cuando el cliente con la opción C esté en producción (PLAN-042).

En Claude: *Settings → Connectors → Add custom connector* → `https://<proyecto>.vercel.app/mcp`.
