---
id: PLAN-020
titulo: Decision de proceder y eleccion de infraestructura
estado: todo
creado: 2026-08-11
cerrado:
aprobado_por:
relacionados: [MASTER-PLAN-019, PLAN-013, DEC-004, DEC-011]
---

# Fase 0 · Decisión de proceder y elección de infraestructura

> **Puerta real, no trámite.** Su resultado legítimo incluye *"no procede todavía"*.

## Objetivo

Decidir, con datos, si el servidor autoritativo se construye ahora. Si la respuesta es sí, elegir host, estimar coste y fijar la línea base de experiencia contra la que se medirán todas las fases.

## Alcance

**Entra:** lectura de los datos de PLAN-013, elección de host y biblioteca, estimación de coste, definición de las métricas de experiencia.

**No entra:** escribir código.

## Precondiciones

**PLAN-013 operativo y con al menos dos semanas de datos reales.** Sin eso esta fase no puede ejecutarse: se estaría decidiendo con intuiciones, que es exactamente lo que DEC-004 lleva difiriendo desde julio.

## Pasos

### 1 · Leer los datos y decidir

Preguntas concretas que los datos deben responder:

- ¿cuántas sesiones registran `collab.bind_timeout`, y sobre qué total de sesiones?
- ¿cuántos `collab.cas_double_conflict` a la semana? Son los casos en que el usuario ve el toast y tiene que decidir
- ¿cuántos `collab.edit_dropped_no_role`?
- ¿se concentran en pocos usuarios y diagramas, o están repartidos?

**Umbral de decisión, acordado antes de mirar los datos** para no racionalizar después. Propuesta: si los tres códigos suman menos de ~5 incidentes semanales sobre el conjunto de usuarios, no procede — se atacan los mecanismos A y B desde el cliente y se revisa en un trimestre.

### 2 · Elegir host

Requisito: proceso con estado y websockets. **Vercel serverless queda descartado** — no sostiene conexiones con estado.

Candidatos: Fly.io, Railway, Render. Criterios: coste mensual real, región cercana a la base de Supabase (la latencia servidor↔BD entra en cada persistencia), facilidad de despliegue, y qué pasa cuando el proceso se reinicia.

### 3 · Elegir biblioteca

Decidido en DEC-011: **Hocuspocus** sobre y-websocket, porque trae autenticación y ganchos de persistencia, y conserva `YjsBpmnBinding.ts`. Esta fase lo confirma o lo revisa con información nueva, no lo reabre por gusto.

### 4 · Fijar la línea base de experiencia

**Lo que hace verificable la restricción "igual o mejor".** Medir *hoy*, antes de tocar nada:

| Métrica | Cómo se mide |
|---|---|
| Apertura de un diagrama | `perf: diagram:open` (ya instrumentado) |
| Cambio de pestaña | `perf: tab:switch` |
| Tiempo hasta colaboración lista | `perf: collab:bindReady` |
| Fluidez del arrastre | fps durante un arrastre sostenido |
| Latencia de propagación | de acción local a reflejo en el otro cliente |

Sin estos números guardados, "igual o mejor" no es verificable y el criterio de cierre del master plan es papel mojado.

### 5 · Estimar el coste total

Host + tráfico + tiempo de construcción. Y el coste recurrente que no se ve: un segundo sitio donde mirar cuando algo falla.

## Criterios de aceptación

- Existe una decisión escrita, con los datos que la sustentan, en `context/decisiones.md`
- Si es "sí": host elegido con coste mensual estimado
- La línea base de experiencia está medida y guardada
- Si es "no": queda fijada la condición que lo reabriría

## Riesgos

**Racionalizar los datos para justificar construir.** Es un cambio técnicamente atractivo. Mitigación: el umbral se acuerda en el paso 1 **antes** de mirar los números.

**Que PLAN-013 no llegue nunca.** Sus cinco decisiones llevan abiertas desde que se escribió. Mitigación: si en un plazo razonable no hay datos, la decisión honesta es "no procede por falta de información", no construir a ciegas.

## Registro de ejecución

(se rellena durante la ejecución)

## Resultado

(se rellena al cerrar)
