---
id: MASTER-PLAN-019
titulo: Servidor autoritativo de colaboracion — infraestructura
tipo: master-plan
estado: todo
creado: 2026-08-11
cerrado:
aprobado_por:
progreso: 0/7
agrupa: [PLAN-020, PLAN-021, PLAN-022, PLAN-023, PLAN-024, PLAN-025, PLAN-026]
relacionados: [EXP-011, EXP-003, EXP-005, EXP-007, EXP-008, DEC-004, DEC-011, PLAN-013, MASTER-PLAN-018]
---

# MASTER-PLAN-019 · Servidor autoritativo de colaboración

> Cambio de infraestructura. Separado de [MASTER-PLAN-018](018-master-plan-auditoria-y-frentes-abiertos.md) a propósito: aquel corrige lo que existe, este cambia dónde vive la verdad durante una sesión de edición.

## Sobre "cero errores"

No se puede prometer. Lo que sí se diseña es que **ningún error llegue al usuario**, y eso se consigue con cuatro propiedades presentes en cada fase:

| Propiedad | Cómo se materializa |
|---|---|
| **Modo sombra** | el servidor corre y sincroniza sin que nadie dependa de él |
| **Flag de corte** | `flujo:collabServer` — se apaga y se vuelve al transporte actual sin desplegar |
| **Degradación diseñada** | el servicio caído degrada a edición local con aviso, nunca a bloqueo |
| **Reversibilidad** | ninguna fase destruye el camino anterior hasta la última |

La regla que ordena el plan: **cada fase debe poder abortarse dejando el sistema como estaba.**

## Restricción no negociable

> La usabilidad, la experiencia y la funcionalidad deben quedar **igual o mejor**. Ninguna fase se cierra si algo que hoy funciona pasa a funcionar peor.

En concreto, esto no puede empeorar: el arrastre a 60 fps (el renderizado sigue en el cliente, ver DEC-011), la apertura de un diagrama, el trabajo sin conexión momentánea, y el modo local sin Supabase.

## Qué resuelve

Hoy no hay árbitro: cada garantía de la colaboración es un acuerdo entre navegadores.

| | Hoy | Con servidor |
|---|---|---|
| Granularidad del conflicto | **documento entero** (CAS sobre la fila) | **una propiedad de un elemento** |
| Dos personas en pools distintos | chocan al guardar: misma fila | nunca se tocan |
| Escritores de `current_xml` | N compitiendo | uno → la carrera de CAS desaparece |
| Quien llega tarde | lo que un peer *supone* | la verdad |
| Mensaje perdido | gossip entre clientes | el servidor lo tiene |
| Integridad referencial | 5 parches en el cliente | una regla central |
| Historial | no existe | el log de operaciones lo es |

La fila de la granularidad es la importante: el radio de impacto de un conflicto pasa de *todo el diagrama* a *una propiedad*.

## El precedente que lo justifica

Cinco incidentes graves del proyecto son fallos de **integridad referencial bajo concurrencia**, y los cinco se arreglaron con parches en el cliente:

| | Incidente | Parche actual |
|---|---|---|
| [EXP-003](../../experience/003-contaminacion-de-pools-entre-diagramas.md) | elementos de un diagrama dentro del pool de otro | fencing token en `canvasSession` |
| [EXP-005](../../experience/005-veneno-de-overlay-de-pool-en-el-doc-yjs.md) | overlay corrupto persistido | candado en `createShape` |
| [EXP-007](../../experience/007-flechas-duplicadas-por-divergencia-de-id-de-conexion.md) | flechas duplicadas | guards en el binding |
| [EXP-008](../../experience/008-diagrama-corrupto-diagnostico-y-mejora-continua.md) | diagrama corrupto en producción | saneamiento |
| [EXP-011](../../experience/011-perdida-silenciosa-de-cambios-entre-colaboradores.md) | cambios que no se propagan | — sin resolver |

Cada navegador tiene que acordarse de aplicar cada defensa. **El servidor convierte cinco defensas dispersas en una regla que se impone una vez.**

## Tablero

| | Plan | Fase | Estado | Reversible |
|:-:|---|---|---|:-:|
| ☐ | [PLAN-020](020-decision-y-eleccion-de-infraestructura.md) | 0 · Decisión | todo — **bloquea todo lo demás** | n/a |
| ☐ | [PLAN-021](021-servicio-minimo-en-modo-sombra.md) | 1 · Servicio mínimo | todo | sí |
| ☐ | [PLAN-022](022-degradacion-y-reconexion.md) | 2 · Degradación | todo | sí |
| ☐ | [PLAN-023](023-validacion-de-integridad-referencial.md) | 3 · Validación | todo | sí |
| ☐ | [PLAN-024](024-persistencia-autoritativa.md) | 4 · Persistencia | todo | sí |
| ☐ | [PLAN-025](025-corte-progresivo-y-retirada-del-transporte-antiguo.md) | 5 · Corte | todo | **último punto de retorno** |
| ☐ | [PLAN-026](026-historial-de-operaciones.md) | 6 · Historial | todo — opcional | sí |

**Progreso: 0/7.**

## Orden y por qué

**Fase 0 — Decisión.** No es trámite. Se decide con los datos de PLAN-013, no con intuiciones: si la colaboración falla dos veces al mes, este master plan espera; si falla diez veces al día, deja de ser opinable. También se elige host y se estima el coste real.

**Fase 1 — Servicio mínimo en modo sombra.** El servidor corre, autentica y sincroniza, pero **nadie depende de él**: el transporte actual sigue siendo el que manda. Permite medir convergencia y latencia reales sin arriesgar nada.

**Fase 2 — Degradación, antes de que nadie dependa del servidor.** Va deliberadamente pronto. Es el error clásico de estas migraciones: construir el camino feliz, cortar, y descubrir el comportamiento ante caída en producción. Un servidor introduce un punto único de fallo que hoy no existe — la arquitectura actual sobrevive a que todo esté caído mientras Supabase responda.

**Fase 3 — Validación de integridad referencial.** Solo nivel referencial: que todo `sourceRef`/`targetRef` apunte a algo que existe. **Nunca reglas semánticas de BPMN** — el usuario dibuja lo que quiera (DEC-011).

**Fase 4 — Persistencia autoritativa.** El servidor pasa a ser el único escritor de `current_xml`. Aquí muere la carrera de CAS. Se hace después de la validación para no persistir estados que el servidor aún no sabe rechazar.

**Fase 5 — Corte progresivo.** Flag por diagrama → por proyecto → global. Solo al final se retira el transporte antiguo: broadcast, anti-entropía, coalescer, y la lógica de reintento de CAS del cliente. **Es el último punto de retorno.**

**Fase 6 — Historial.** Subproducto: con el log de operaciones ordenado, "quién cambió qué" y "volver a ayer" pasan de imposibles a casi gratis. Opcional y separable.

## Dependencias

```
PLAN-013 ──> PLAN-020 ──> PLAN-021 ──> PLAN-022 ──> PLAN-025
                              │            │           ▲
                              └─> PLAN-023 ┴> PLAN-024 ┘
                                                       └──> PLAN-026
```

PLAN-022 (degradación) y PLAN-023 (validación) pueden ir en paralelo tras la fase 1. PLAN-024 exige ambas. PLAN-025 no arranca sin las cuatro anteriores cerradas.

## Criterios de cierre

- Las siete casillas marcadas y sus planes en `done`
- EXP-011 en estado `resuelto`, no `mitigado`
- El transporte antiguo retirado del código, no solo desactivado
- `context/arquitectura-persistencia.md` actualizado: el ADR describe el estado nuevo
- **Ninguna métrica de experiencia peor que antes** — la comparación se define en PLAN-020 y se mide en cada corte

## Riesgos del conjunto

**Punto único de fallo nuevo.** Es el riesgo estructural: hoy la app es 100 % cliente. Mitigación: PLAN-022 va antes que cualquier dependencia real.

**Cambiar un fallo intermitente por uno total.** Hoy falla "a veces no se propagan los cambios"; mal hecho, pasaría a "nadie puede editar". Mitigación: la degradación debe permitir edición local, no solo mostrar un error.

**Coste fijo mensual sin usuarios que lo justifiquen.** Mitigación: la fase 0 es una puerta real, con opción de no pasar.

**Reescribir lo que ya funciona.** `YjsBpmnBinding.ts` es el resultado de EXP-001, EXP-005 y EXP-007: meses de casos límite resueltos. Ninguna fase lo reescribe — el servidor hospeda el mismo `Y.Doc` (DEC-011).

**Que la fase 0 se salte.** Empezar a construir porque es interesante técnicamente, sin el dato que dice si hace falta. Es el riesgo más probable de todos.

## Fuera de alcance

- **Canvas en el servidor.** El renderizado sigue en el cliente. Ver DEC-011.
- **Reglas semánticas de BPMN.** El usuario dibuja lo que quiera.
- **Edición offline con merge persistente.** Sigue descartada (DEC-002); la degradación de PLAN-022 cubre desconexiones cortas, no trabajo offline prolongado.
- **Modo local sin Supabase.** No se toca: sigue funcionando sin servidor ni auth.

## Registro de ejecución

(se rellena durante la ejecución)

## Resultado

(se rellena al cerrar)
