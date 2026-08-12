---
id: PLAN-015
titulo: Servidor autoritativo de colaboracion (CRDT) — solucion estructural diferida
estado: descartado
creado: 2026-08-10
cerrado: 2026-08-11
aprobado_por:
relacionados: [MASTER-PLAN-019, EXP-011, PLAN-014, PLAN-013, DEC-004]
---

# Servidor autoritativo de colaboración (CRDT)

> **SUPERADO por [MASTER-PLAN-019](../todo/019-master-plan-servidor-autoritativo-de-colaboracion.md) el 2026-08-11.**
> Este documento planteaba el servidor como un plan unico de ocho pasos. El master plan lo
> descompone en siete fases con modo sombra, degradacion y corte reversible. Se conserva
> porque su analisis del problema y de las alternativas sigue siendo valido.
> **No ejecutar desde aqui.**

> **Diferido a propósito.** No arrancar sin los datos de PLAN-013. Este documento existe para que la decisión, cuando llegue, no parta de cero.

## Objetivo

Que la colaboración deje de depender de acuerdos entre clientes. Un documento autoritativo por diagrama, en un servidor, que sea la referencia real del estado en sesión y el único escritor de `current_xml`.

Es la decisión **#7 del ADR** (`context/arquitectura-persistencia.md` §4), diferida desde el 2026-07-02 y registrada como DEC-004.

## El problema que resuelve

Hoy no hay árbitro. Cada garantía de la colaboración es un acuerdo entre navegadores:

| Quién decide | Hoy | Con servidor |
|---|---|---|
| ¿El canvas está listo para vincularse? | el cliente | el cliente (sigue igual) |
| ¿Puedo emitir cambios? | el cliente — RLS protege la base, **no el canal de broadcast** | el servidor valida cada operación |
| ¿Quién repara un mensaje perdido? | los clientes, por gossip (anti-entropía) | el servidor tiene el estado real |
| ¿Qué recibe quien llega tarde? | lo que un peer *supone* que es el estado | la verdad |
| ¿Quién arbitra un conflicto de guardado? | el cliente, y al segundo choque cede | no hay conflicto: un solo escritor |

La última fila es la importante. **Con un solo escritor, la carrera de CAS desaparece por construcción** — no se mitiga, deja de existir. Eso cierra el mecanismo C de EXP-011 de raíz.

Cierra además el hueco de contenido que el ADR dejó abierto en §2: un servidor que valida operaciones puede rechazar las que no tienen sentido, cosa que RLS no puede hacer sobre un blob opaco.

## Alcance

**Entra:** servicio con estado que mantiene un `Y.Doc` por diagrama, autentica contra Supabase, autoriza por las mismas reglas que RLS, y persiste `current_xml` con validación.

**No entra:** cambiar el formato de persistencia (sigue siendo XML canónico, DEC-001), reintroducir `yjs_documents` (DEC-002), ni la edición offline con merge persistente.

## Precondiciones — ninguna es técnica

1. **Datos de PLAN-013.** Cuántas sesiones pierden colaboración de verdad y cuánto trabajo descarta el CAS. Si son dos incidentes al mes, este plan espera; si son diez al día, deja de ser opinable.
2. **PLAN-014 aplicado.** Sin él se está corriendo un riesgo de pérdida de datos mientras se decide.
3. **Decisión de infraestructura.** Ver abajo — es la parte cara.

## El coste real: hace falta un host con estado

Es la única pieza que Supabase no da, y hay que decirlo claro: **Vercel serverless no sostiene websockets con estado**. Un CRDT autoritativo necesita un proceso vivo con el documento en memoria.

Opciones: Fly.io, Railway, Render, o un contenedor propio. Implica un segundo proveedor, un segundo despliegue, un segundo sitio donde mirar cuando algo falla, y coste mensual fijo que hoy no existe.

**Ese coste es la razón real de que esté diferido**, no la dificultad técnica.

Alternativas evaluadas por encima:
- **Hocuspocus** — servidor Yjs con extensiones de autenticación y persistencia. Es el camino corto: su modelo de `onAuthenticate` + `onStoreDocument` encaja con lo que hace falta.
- **y-websocket** — más simple, menos batería incluida; habría que escribir la autenticación y la persistencia.
- **Edge function** — descartada de entrada: no mantiene estado entre invocaciones, que es justo lo que se necesita.

## Pasos

1. Leer los datos de PLAN-013 y decidir si se procede — **es un paso, no un trámite**
2. Elegir host y biblioteca; estimar coste mensual real
3. Servicio mínimo: un `Y.Doc` por diagrama, autenticación con el JWT de Supabase
4. Autorización equivalente a `can_edit_diagram` — reutilizar las funciones `private.can_*` vía RPC en vez de reimplementar el modelo de permisos
5. Persistencia: el servidor escribe `current_xml` con `looksLikeBpmn` y serialización canónica
6. Migrar `useCollab` de broadcast a conexión con el servidor, manteniendo presencia y cursores donde están
7. Retirar la anti-entropía cliente-a-cliente, que deja de tener sentido
8. Pruebas multiusuario reales — el pendiente 2d del ADR, nunca ejecutado

## Criterios de aceptación

- Quien llega tarde recibe el estado del servidor, no el de un peer
- Un cliente que pierde mensajes se recupera del servidor sin gossip
- Un viewer de solo lectura no puede alterar el documento aunque manipule su cliente — hoy esto lo garantiza solo el propio cliente
- El guardado no produce conflictos de CAS porque hay un único escritor
- El servicio caído degrada a edición local con aviso, no a pérdida de datos

## Riesgos

**Cambia el modo de fallo, no lo elimina.** Hoy un fallo es "no se propagan los cambios"; con servidor es "el servicio está caído y nadie edita". Hay que diseñar la degradación **antes** de migrar, o se cambia un problema intermitente por uno total.

**Reintroduce un punto único de fallo** que hoy no existe: la arquitectura actual es 100 % cliente y sobrevive a que todo lo demás esté caído mientras Supabase responda.

**Duplica el modelo de permisos** si se reimplementa en el servidor. Por eso el paso 4 insiste en reutilizar `private.can_*` en lugar de traducirlas.

**Coste fijo mensual** sin usuarios que lo justifiquen todavía.

## Registro de ejecución

No se ejecutó ningún paso: el plan fue superado antes de arrancar.

## Resultado

Descartado como plan ejecutable el 2026-08-11: reemplazado por MASTER-PLAN-019, que descompone el trabajo en siete fases (PLAN-020 a PLAN-026). El analisis de este documento —que resuelve, que cuesta, que alternativas se evaluaron— se conservo y se amplio alli.
