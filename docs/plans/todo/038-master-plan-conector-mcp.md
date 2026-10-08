---
id: MASTER-PLAN-038
titulo: Conector MCP — que una IA cree y modifique diagramas en el espacio del usuario
tipo: master-plan
estado: todo
creado: 2026-10-08
cerrado:
aprobado_por: santiagojmg28 — el plan, 2026-10-08 (el cierre requiere otra aprobación)
progreso: 0/4
agrupa: [PLAN-039, PLAN-040, PLAN-041, PLAN-042]
relacionados: [DEC-001, DEC-002, DEC-005, DEC-007, DEC-009, DEC-012, DEC-013, EXP-011, EXP-016, EXP-018, EXP-022, MASTER-PLAN-019]
---

# MASTER-PLAN-038 · Conector MCP

> Expansión de producto. Un servidor MCP remoto para que Claude —y ChatGPT si resulta compatible— cree, lea y modifique diagramas **en el espacio de trabajo del usuario**, sin manejar el navegador. Cuando el usuario abre Flujo, el diagrama ya está ahí.

La investigación que lo sostiene está en [`addons/investigacion-mcp.md`](../../addons/investigacion-mcp.md). La decisión de arquitectura es [DEC-013](../../context/decisiones.md), vigente desde la aprobación de este plan (2026-10-08).

Los cuatro sub-planes se redactaron al arrancar cada fase, el 2026-10-08. Este documento fija el alcance, las decisiones y el orden. El informe de la implementación en el laboratorio está en [`addons/informe-mcp-fase-2.md`](../../addons/informe-mcp-fase-2.md).

## Restricciones no negociables

| Restricción | Cómo se cumple |
|---|---|
| **Cero `service_role`** | El MCP actúa siempre con el JWT del usuario. RLS sigue decidiendo qué ve y qué edita. Comprobación explícita con `grep` en el código del MCP, el repo y el bundle. |
| **Nunca un UPDATE ciego** | Toda escritura del MCP lleva `updated_at` esperado (CAS), con la misma forma que `SupabaseRepository.save`. |
| **Ninguna pérdida silenciosa** | `modificar_diagrama` no se habilita hasta que el cliente deje de pisar en silencio a los escritores externos (PLAN-042). |
| **El modo IndexedDB no se rompe** | El MCP solo opera sobre la nube. Los cambios de cliente (consentimiento OAuth, conflicto externo, validación) solo actúan con Supabase configurado, salvo la corrección de `validation.ts`, que es pura. |
| **No se imponen reglas de BPMN** | La validación del MCP avisa y no bloquea (DEC-011 §3). |
| **El bundle de la SPA no crece por el servidor** | El servidor es un paquete aparte (`mcp/`) con su propio `package.json`. Se compara contra la línea base del 2026-10-08: chunk principal de 1 514,82 kB (439,62 kB gzip). |
| **Planes gratuitos** | Vercel Hobby, Supabase Free. Nada de pago ni proveedores nuevos. |

## Decisiones (de la conversación del 2026-10-08)

| # | Decisión | Origen |
|---|---|---|
| D1 | Concurrencia: **compuerta de presencia en el MCP + el cliente no reintenta a ciegas cuando está solo + copia como salida** (opciones A + C + D de la investigación §3) | aprobado por el usuario |
| D2 | Despliegue **por etapas**: primero lectura, validación y creación; `modificar_diagrama` cuando D1 esté completo en producción | aprobado por el usuario |
| D3 | Alojamiento: **proyecto Vercel Hobby aparte**, raíz `mcp/`, en `*.vercel.app` | decisión técnica: Hobby es gratuito, admite varios proyectos, y separarlo aísla zod 4 y el bundle (investigación §6.4, V1) |
| D4 | Autenticación: **servidor OAuth 2.1 de Supabase** (beta, incluido en el plan Free) con registro dinámico de clientes. Consentimiento en la SPA, en `/oauth/consent` | aprobado por el usuario. Los tokens personales se descartan (investigación §6.2, punto 4) |
| D5 | **Mínimo privilegio en la base, no solo en el MCP**: con token de conector (claim `client_id`) solo se crea y modifica el contenido de diagramas; todo lo demás es de solo lectura | aprobado por el usuario ("crear, modificar y ayudar a desarrollar diagramas, nada más") |
| D6 | Límite de ritmo y auditoría en **tablas de Postgres**, escritas por trigger o por RPC `SECURITY DEFINER`, nunca con `service_role` | aprobado por el usuario |
| D7 | Corregir `validation.ts` para que compruebe los procesos dentro de pools | aprobado por el usuario |
| D8 | Layout **propio** sobre el modelo semántico, con las flechas trazadas por el `BizagiDirectionalRouter` del repo. **Sin `bpmn-auto-layout`** | medido el 2026-10-08: la versión publicada no dispone pools, carriles, subprocesos expandidos ni flujos de mensaje (investigación §5) |
| D9 | **Claude es el cliente de referencia.** ChatGPT se intenta por estándar, sin compromiso | sus planes con escritura no están verificados (investigación §6.3) |

## Tablero

| | Plan | Qué | Toca BD | Toca cliente | Estado |
|:-:|---|---|:-:|:-:|---|
| ☐ | [PLAN-039](039-base-de-datos-del-conector.md) | **Base de datos del conector**: guardia, auditoría, límites, y servidor OAuth activado en el laboratorio | **sí** | no | en-progreso — probado en el laboratorio (32/32); **producción pendiente de aprobación** |
| ☐ | [PLAN-040](040-nucleo-de-dominio-bpmn-model.md) | **Núcleo de dominio** en `src/domain/bpmn-model/`: modelo semántico, generación de XML, layout, edición, simplificación para `obtener_diagrama`, validación (con la corrección de D7) | no | solo `validation.ts` | en-progreso — implementado y probado; falta la ida y vuelta con diagramas reales |
| ☐ | [PLAN-041](041-servidor-mcp-etapa-1.md) | **Servidor MCP, etapa 1**: `listar_proyectos`, `listar_diagramas`, `obtener_diagrama`, `validar_diagrama`, `crear_diagrama`; OAuth, límites, idempotencia, y la página de consentimiento en la SPA | no | página `/oauth/consent` | en-progreso — 24/24 de integración y e2e; falta el despliegue de vista previa |
| ☐ | [PLAN-042](042-escritor-externo-y-modificar-diagrama.md) | **Etapa 2**: el cliente distingue un escritor externo (opción C), se añade la compuerta de presencia, y se habilita `modificar_diagrama` | no | `diagramStore.saveDiagram` | en-progreso — probado en la app real; falta desplegar el cliente antes de encender la etapa 2 |

**Progreso: 0/4.**

## Orden y por qué

```
PLAN-039 ──┐
           ├──> PLAN-041 ──> PLAN-042
PLAN-040 ──┘
```

**PLAN-039 y PLAN-040 en paralelo.** No comparten archivos. PLAN-040 no necesita la base: es lógica pura probada con Vitest y con `importXML` de bpmn-js en jsdom, como ya hace `routing.integration.test.ts`.

**PLAN-041 necesita los dos.** Sin la guardia de la base, un token del conector tendría el poder entero de la sesión del usuario; sin el núcleo, no hay nada que exponer.

**PLAN-042 va el último y es la puerta de `modificar_diagrama`.** Requiere desplegar a `main` el cambio de cliente. Hasta entonces la tool **no existe** en el servidor, no está solo deshabilitada. Las tools de la etapa 1 son seguras sin él: nadie puede tener abierto un diagrama recién creado, y leer no escribe.

## Qué no se hace

- **Tools destructivas**: borrar diagramas o proyectos, papelera, mover de proyecto. Ni en el MCP ni con el token directamente contra PostgREST (D5).
- **Comentarios, colaboradores, invitaciones, imágenes**. Fuera por decisión del usuario.
- **Thumbnail del diagrama creado.** Renderizar exige un navegador. La portada muestra el marcador de posición hasta que alguien edite el diagrama en la app y el autoguardado lo genere. Es una limitación conocida, no un defecto.
- **Subprocesos enlazados** (`flujo:linkedDiagram`, diagramas hijo). Los expandidos dentro del diagrama sí entran.
- **El MCP como par de Yjs** y **reimportar en caliente** (opciones E y B de la investigación): son la zona de EXP-003, EXP-005 y EXP-007.
- **Esperar a MASTER-PLAN-019.** Cuando exista el servidor autoritativo, el MCP pasará a ser cliente de él y la compuerta de presencia se retirará. No bloquea este plan.

## Riesgos

**Pérdida silenciosa en una pestaña de fondo** (escenario E5 de la investigación). Es el riesgo que da forma al plan. Mitigación: PLAN-042 antes de `modificar_diagrama`. **Con solo la compuerta de presencia el riesgo quedaría `mitigado`, no `resuelto`.**

**El servidor OAuth de Supabase está en beta.** Puede cambiar su API o su comportamiento. Mitigación: el MCP depende solo del estándar (descubrimiento, JWKS o `getClaims`, claim `client_id`), no de detalles internos; y el conector se puede desactivar sin tocar la app.

**La audiencia del token no es la del MCP** (`aud=authenticated`, investigación §6.2). Mitigación: el MCP rechaza tokens sin `client_id`, es decir, sesiones normales de la app, y la guardia de la base limita lo que puede hacer un token filtrado. Se documenta en DEC-013 como desviación consciente de la especificación.

**Términos de Vercel Hobby.** Hobby es para uso personal no comercial. El usuario declara uso interno no comercial; si el uso pasa a ser comercial, el proyecto `mcp/` debe pasar a Pro.

**Claves de firma.** Si el proyecto firma con HS256, un cliente que pida el scope `openid` haría fallar la emisión del ID token. Mitigación: el MCP no anuncia `openid` en `scopes_supported`. Se comprueba con el JWKS público al recibir la URL del proyecto.

**El layout propio es código propio que mantener.** Mitigación: reutiliza el router que ya mantiene el cliente; el posicionamiento por capas es acotado y lleva pruebas de geometría (todo nodo dentro de su carril, ninguna arista diagonal).

**El XML generado hereda EXP-018** (`<bpmn:SequenceFlow>` no canónico). Es deliberado: el MCP usa el mismo moddle y la misma normalización que el cliente, para no producir un tercer dialecto. Cuando EXP-018 se arregle, el MCP lo hereda gratis.

## Criterios de cierre

Además de los criterios de cada sub-plan, la lista de verificación del encargo original:

- Toda escritura del MCP lleva CAS; prueba de conflicto con dos escrituras sobre la misma versión base.
- Prueba con sesión colaborativa abierta (dos navegadores en el laboratorio) mientras el MCP modifica: ninguna corrupción, ninguna pérdida silenciosa, y el comportamiento es el de D1.
- Todo XML generado o modificado pasa `bpmn-moddle` e `importXML` sin errores, con los *warnings* revisados.
- *Round-trip* sobre un diagrama real: el resto del diagrama queda intacto (ids, coordenadas, extensiones).
- Un diagrama creado por el MCP se abre, se edita, se exporta (.bpmn, PNG, SVG, PDF) y se guarda desde la UI.
- Layout revisado a ojo en: proceso simple, con compuertas, con pools y carriles, con subproceso expandido.
- Entradas inválidas y reintentos: error claro, nada escrito, ningún duplicado.
- Dos usuarios: A no ve ni toca lo de B; un `viewer` no escribe. Token ausente, inválido o caducado → 401 sin filtrar información.
- `npm run test`, `npm run lint` y `npm run build` en verde; el bundle no crece; el modo IndexedDB y la colaboración funcionan igual.
- Ningún SQL aplicado en producción sin aprobación explícita; todo probado antes con `lab:reset`.
- DEC-013 pasa de propuesta a vigente.

## Registro de ejecución

| Fecha | Qué |
|---|---|
| 2026-10-08 | Fase 0 (investigación) y Fase 1 (este plan, DEC-013 propuesta, prototipo SQL). Instalados Node 22.23.2 y Docker Desktop 4.94.0; laboratorio levantado. Línea base: 427 pruebas en 39 ficheros, lint limpio, build correcto. |
| 2026-10-08 | **Fase 2 implementada y probada en el laboratorio**, sin commit ni despliegue:<br>· SPA: 479 pruebas (+52), lint y build limpios, bundle +3,2 kB solo de textos y código propio.<br>· Base: 32/32 casos.<br>· Integración: 24/24 con tokens OAuth reales.<br>· e2e: 11/11 en la app real (apertura, exportación en 4 formatos y guardado, dos navegadores, opción C, colaboración en vivo, modo local, consentimiento).<br>· `bpmn-auto-layout` descartado por medición (D8).<br>· Defecto de layout de compuertas encontrado y corregido.<br>Informe: [`addons/informe-mcp-fase-2.md`](../../addons/informe-mcp-fase-2.md). **Ningún plan se cierra: pendiente de aprobación y de las acciones de producción del informe §5.** |
| 2026-10-08 | **Plan aprobado por el usuario**; DEC-013 pasa a vigente. JWKS público de producción: firma **ES256** (asimétrica), no hace falta cambiar claves. El servidor OAuth aún no está activo en producción (metadatos en 404). La lectura de extensiones `bizagi:`/`camunda:` en producción queda pendiente de acceso; el MCP las preserva por diseño y lo cubre una prueba. |

## Resultado

(se rellena al cerrar)
