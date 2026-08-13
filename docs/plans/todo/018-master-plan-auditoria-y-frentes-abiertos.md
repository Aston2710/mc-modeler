---
id: MASTER-PLAN-018
titulo: Auditoria 2026-08 — base de datos, rendimiento y colaboracion
tipo: master-plan
estado: en-progreso
creado: 2026-08-10
cerrado:
aprobado_por:
progreso: 1/7
agrupa: [PLAN-010, PLAN-011, PLAN-012, PLAN-013, PLAN-014, PLAN-016, PLAN-017]
relacionados: [EXP-011, EXP-012, DEC-005, DEC-006, DEC-007, DEC-009]
---

# MASTER-PLAN-018 · Auditoría 2026-08 — base de datos, rendimiento y colaboración

> **Este es el documento que se abre para saber qué toca ahora.** No contiene trabajo propio: agrupa, ordena y lleva la cuenta de ocho planes en tres frentes.

## Qué es un master plan

Un master plan **no ejecuta nada**. Agrupa planes que comparten origen o tema, define en qué orden atacarlos, y sirve de tablero: cada plan que se cierra queda marcado aquí. Cuando las ocho casillas están marcadas, este documento se cierra y pasa a `done`.

Convención completa en [`docs/README.md`](../../README.md#master-plans).

## Origen

Auditoría de la base de datos Supabase del 2026-08-09/10. Empezó como revisión de esquema y rendimiento; al leer el código para entender el modelo de datos aparecieron dos problemas vivos no documentados (EXP-011, EXP-012), uno de ellos con pérdida de datos.

**Restricción que ordena todo:** hay una presentación en producción próxima. La prioridad no es el mayor beneficio técnico, es **que nada pierda datos y que la demostración no falle**.

## Tablero

| | Plan | Frente | Estado | Bloqueado por |
|:-:|---|---|---|---|
| ☑ | [PLAN-010](../done/010-auditoria-y-remediacion-de-base-de-datos.md) | base de datos | **done** 2026-08-10 | — |
| ☐ | [PLAN-014](014-mitigacion-perdida-de-trabajo-en-colaboracion.md) | colaborativo | todo — **prioridad máxima** | nada |
| ☐ | [PLAN-013](013-cola-de-incidentes-auditable.md) | observabilidad | todo | **5 decisiones** |
| ☐ | [PLAN-012](012-thumbnails-webp-y-entrega-segura.md) | rendimiento | todo | nada |
| ☐ | [PLAN-017](017-higiene-de-datos-y-retencion.md) | base de datos | todo | 3 decisiones de producto |
| ☐ | [PLAN-016](016-podar-la-publicacion-de-realtime.md) | rendimiento | todo | migrar cliente a Broadcast |
| ☐ | [PLAN-011](011-remediacion-de-base-de-datos-pendiente.md) | base de datos | todo | va con PLAN-012 |

**Progreso: 1/7.**

> El servidor autoritativo salió a [MASTER-PLAN-019](019-master-plan-servidor-autoritativo-de-colaboracion.md) el 2026-08-11: es infraestructura, no corrección de lo existente.
>
> `PLAN-005` (cambio de pestañas con instancia viva) **tampoco forma parte de este master plan**: es anterior a la auditoría. Pero tiene un vínculo que hay que mirar antes de retomarlo — ver *Fuera de alcance* al final.

## Orden de ejecución

### Fase 0 — antes de la presentación · ✅ COMPLETA (2026-08-13)

**Solo dos cosas, y una es de cinco minutos.**

1. ☑ **Subir el límite del bucket `thumbnails` a 5 MB.** Elimina un techo que introdujo la migración `0026` y que hoy tiene 4.7× de margen. No es grave —el fallo está capturado como no crítico y el XML se guarda igual— pero quitarlo es gratis. SQL puro, sin despliegue.
   → Aplicado el **2026-08-13**, migración `20260813225135_bucket_thumbnails_5mb`. Probado antes en el entorno local ([`desarrollo-local.md`](../../context/desarrollo-local.md)): 3 MB entra donde antes se rechazaba, 6 MB sigue devolviendo `EntityTooLarge`.
2. ☑ **PLAN-014 paso 2** — que el doble conflicto de CAS pregunte en vez de decidir. Es lo único que hoy puede destruir trabajo del usuario, y su escenario —dos pestañas, mismo diagrama— es el primero que alguien probará.
   → Ya estaba implementado; se descubrió el 2026-08-11 (`diagramStore.ts:349-355`, `App.tsx:271-315`).

Nada más de esta lista mejora la presentación lo suficiente como para justificar el riesgo de tocarlo antes.

### Fase 1 — inmediatamente después

3. **PLAN-014 completo** (pasos 1 y 3: encolar en vez de descartar, y que el plazo agotado sea un evento).
4. **PLAN-013.** Sin él se sigue decidiendo con intuiciones. Sus cinco decisiones abiertas son el cuello real, no la implementación.

### Fase 2 — lo que el usuario nota

5. **PLAN-012.** Lo único que el usuario *siente*: la portada baja de ~4 MB y 78 peticiones a ~800 kB y 1 petición. Cierra además un riesgo de exposición — un thumbnail SVG lleva el texto completo del proceso, y rasterizar a WebP lo convierte en píxeles ilegibles.
6. **PLAN-017.** Los 76 huérfanos son 3 854 kB de procesos que alguien creyó haber borrado. Independiente de todo lo demás; puede adelantarse si preocupa la retención.

### Fase 3 — infraestructura

7. **PLAN-016.** La mayor ganancia de CPU disponible, pero exige migrar el cliente a Broadcast primero o produce una regresión funcional silenciosa. No urge con la concurrencia actual.
8. **PLAN-011.** Deuda de esquema sin impacto operativo. Lo último.


## Dependencias reales

```
PLAN-014 ──> (protege la presentación)
PLAN-013 ──> MASTER-PLAN-019 decidir la infraestructura con datos
PLAN-012 ──> PLAN-011        has_thumbnail depende de migrar los thumbnails
cliente  ──> PLAN-016        Broadcast antes de podar la publicación
PLAN-017 ─── independiente
```

Nada más está acoplado. PLAN-017 y PLAN-012 pueden ir en paralelo con lo demás.

## Criterios de cierre

Este master plan se cierra cuando:

- las ocho casillas del tablero están marcadas y sus planes están en `plans/done/`
- EXP-011 y EXP-012 no siguen en estado `activo`
- `context/base-de-datos.md` refleja el estado final, no el de la auditoría

Si algún plan se descarta en vez de ejecutarse, se marca igualmente y el motivo queda en *Resultado*. Un master plan que espera para siempre a un plan que ya nadie va a hacer es ruido.

## Riesgos

**Que la fase 0 crezca.** ~~La tentación de "ya que estamos" antes de una presentación es exactamente cómo se rompe una demostración. Dos elementos, y ninguno más.~~ — Cerrada el 2026-08-13 con exactamente esos dos elementos.

**Que PLAN-013 se quede en las precondiciones.** Sus cinco decisiones llevan abiertas desde que se escribió. Sin ellas, MASTER-PLAN-019 (la infraestructura) nunca podrá decidirse con datos y volverá a discutirse con opiniones.

**Que el tablero se quede sin actualizar.** Un master plan con casillas obsoletas es peor que ninguno: se confía en él. La regla es marcar la casilla en el mismo turno en que el plan se mueve a `done`.

## Fuera de alcance

**PLAN-005** (cambio de pestañas con instancia viva, 2026-07-15) es anterior a la auditoría y no se evaluó aquí. Pero el mecanismo A de EXP-011 se dispara precisamente al **cambiar rápido entre pestañas**, y PLAN-005 reescribe justo ese camino: puede aliviar el problema o empeorarlo, pero no es neutro.

Si se retoma, hacerlo **después** de PLAN-014, cuando el fallo ya sea observable. De otro modo no habrá forma de saber en qué dirección lo movió.

## Registro de ejecución

| Fecha | Qué | Resultado |
|---|---|---|
| 2026-08-10 | PLAN-010 cerrado | 9 migraciones aplicadas (`0021`–`0029`). Lista de diagramas 31.2 → 1.33 ms. Fuga P0 cerrada. Lo que requiere cliente se derivó a PLAN-011, PLAN-012 y PLAN-016 |
| 2026-08-13 | **Fase 0 cerrada** | Bucket `thumbnails` 2 MB → 5 MB (migración `20260813225135`). El fallo de subida deja de ser un `console.warn` genérico: `describeThumbUploadError` reporta el tamaño y si el techo fue la causa, con 5 pruebas que fijan el mensaje literal de Storage. El paso 2 de PLAN-014 ya estaba hecho |
| 2026-08-13 | Entorno local montado | Stack de Supabase en Docker + `npm run lab` en el puerto 7654. Al montarlo salió [EXP-016](../../experience/016-el-historial-de-migraciones-no-reproduce-la-base.md): el historial no reproducía la base porque faltaban 6 de las 35 migraciones registradas. Resuelto con un baseline por introspección, verificado con huella md5 de 13 categorías del catálogo. **A partir de ahora ninguna migración se estrena en producción** |

## Resultado

(se rellena al cerrar)
