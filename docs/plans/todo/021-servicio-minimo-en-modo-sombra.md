---
id: PLAN-021
titulo: Servicio minimo de colaboracion en modo sombra
estado: todo
creado: 2026-08-11
cerrado:
aprobado_por:
relacionados: [MASTER-PLAN-019, PLAN-020, DEC-011]
---

# Fase 1 · Servicio mínimo en modo sombra

## Objetivo

Un servicio que hospeda un `Y.Doc` por diagrama, autentica contra Supabase y autoriza con las mismas reglas que RLS — **corriendo en paralelo al transporte actual, sin que nadie dependa de él**.

Al terminar, hay datos reales de convergencia y latencia sin haber arriesgado nada.

## Alcance

**Entra:** el servicio, autenticación, autorización, y la conexión del cliente en modo observador.

**No entra:** persistencia (fase 4), validación (fase 3), y retirar nada del transporte actual (fase 5).

## Precondiciones

PLAN-020 cerrado con decisión afirmativa, host elegido y línea base medida.

## Pasos

### 1 · Servicio Hocuspocus, un documento por diagrama

El identificador del documento es el `diagram_id`. El servidor no interpreta el contenido todavía: solo hospeda y difunde.

### 2 · Autenticación con el JWT de Supabase

El cliente envía su token en el `onAuthenticate` de Hocuspocus. El servidor lo valida contra el JWKS del proyecto.

**Rechazar la conexión sin token válido**, no degradar a anónimo.

### 3 · Autorización reutilizando las funciones existentes

`private.can_edit_diagram(d_id)` y `private.can_access_diagram(d_id)` vía RPC.

**No reimplementar el modelo de permisos.** Es la lección de DEC-005: tener el predicado en dos sitios ya cuesta mantenimiento; un tercero en otro lenguaje y otro proceso es la receta para que diverjan y se abra un hueco.

Distinguir lector de editor: quien solo puede acceder se conecta en modo recibir-solo. Es la propiedad que hoy garantiza el cliente y que el servidor debe imponer.

### 4 · El cliente conecta en modo sombra

Detrás del flag `flujo:collabServer`, con tres estados: `off` (por defecto), `shadow`, `on`.

En `shadow` el cliente se conecta al servidor **y** mantiene el broadcast actual. El transporte que manda sigue siendo el actual; el servidor solo observa y sincroniza en paralelo.

### 5 · Instrumentar la comparación

Registrar divergencias entre lo que dice el servidor y lo que dice el broadcast, con el mismo formato escalar de `utils/perf.ts` y la cola de PLAN-013. Ninguna etiqueta de elemento ni contenido del diagrama — misma regla dura.

## Criterios de aceptación

- Con el flag en `off`, el comportamiento es idéntico al actual — verificable apagándolo
- Un cliente sin token válido no puede conectarse
- Un usuario con acceso de solo lectura no puede alterar el documento del servidor **aunque manipule su cliente**
- En `shadow`, dos clientes convergen al mismo estado por ambos caminos
- La línea base de experiencia de PLAN-020 no empeora con el flag en `shadow`

## Riesgos

**Que el modo sombra duplique el tráfico y afecte al rendimiento.** Mitigación: es exactamente lo que mide el último criterio de aceptación. Si empeora, el modo sombra se activa solo para diagramas concretos.

**Divergencia del modelo de permisos.** Mitigación: paso 3, RPC en vez de reimplementación.

**Que el proceso se reinicie y pierda el documento en memoria.** En esta fase no importa —nadie depende de él—, pero es justo el escenario que la fase 2 tiene que resolver antes de que importe.

## Registro de ejecución

(se rellena durante la ejecución)

## Resultado

(se rellena al cerrar)
