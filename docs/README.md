# Documentación de mc-modeler

Un solo árbol. Cada pieza de información tiene un destino determinado por la primera pregunta que dé "sí":

| # | Pregunta | Destino |
|---|---|---|
| 1 | ¿Se originó fuera del proyecto y solo se cita como fuente? | `addons/` |
| 2 | ¿Ocurrió, se diagnosticó, y alguien podría volver a caer en ello? | `experience/` |
| 3 | ¿Es trabajo aún no ejecutado, o el registro de trabajo ya ejecutado? | `plans/todo` o `plans/done` |
| 4 | ¿Sigue siendo verdad ahora y condiciona el código futuro? | `context/` |

```
docs/
├── addons/       insumos externos — se citan, no gobiernan
├── context/      la verdad vigente — gobierna el código futuro
├── experience/   incidentes ocurridos y cómo se abordaron
└── plans/
    ├── todo/     trabajo planificado no ejecutado
    └── done/     planes ejecutados y aprobados como cerrados
```

## La numeración es orden de descubrimiento, no de ejecución

`PLAN-017` no va después de `PLAN-016`. El número solo dice **cuándo se escribió el documento**, y existe para poder citarlo sin ambigüedad (`ver PLAN-014`) y para que no haya dos archivos con el mismo nombre.

**El orden de ejecución vive en el master plan, nunca en los números.**

Reglas del contador:

- `experience/` y `plans/` tienen contadores independientes
- el contador de `plans/` es **único para `todo` y `done` juntos** — calcularlo sobre una sola subcarpeta produce colisiones
- **los master plans comparten contador con los planes normales**: no hay `MASTER-PLAN-001` y `PLAN-001` a la vez
- al cerrar un plan **no se renombra**: el `NNN` y el slug se conservan para no romper enlaces

## <a id="master-plans"></a>Master plans

Un **master plan** agrupa varios planes que comparten origen o tema. Puede nacer de una auditoría —donde aparecen varias cosas a la vez— o de un tema que abarca varios frentes.

**Un master plan no ejecuta nada.** Ordena, secuencia y lleva la cuenta.

### Cómo se distingue

| | Plan normal | Master plan |
|---|---|---|
| `id` | `PLAN-014` | `MASTER-PLAN-018` |
| `tipo` | (ausente) | `master-plan` |
| Nombre de archivo | `014-slug.md` | `018-master-plan-slug.md` |
| Campos propios | — | `agrupa:`, `progreso:` |
| Contiene | pasos ejecutables | un tablero y un orden |

El número va primero en el nombre del archivo para que la carpeta siga ordenada, y `master-plan` justo después para que se vea de un vistazo.

### Front-matter

```yaml
---
id: MASTER-PLAN-018
titulo: <tema o auditoría que lo origina>
tipo: master-plan
estado: todo | en-progreso | bloqueado | done | descartado
creado: YYYY-MM-DD
cerrado:
aprobado_por:
progreso: 1/8
agrupa: [PLAN-010, PLAN-011, PLAN-014]
relacionados: [EXP-011, DEC-009]
---
```

`estado` usa **el mismo vocabulario cerrado que los planes normales** — no se inventan valores nuevos, porque eso rompería `grep 'estado: todo' docs/plans/todo/*.md`. La diferencia es que en un master plan `en-progreso` significa *algunas fases cerradas, no todas*.

### Ciclo de vida

```
todo  ──(se cierra el primer plan agrupado)──>  en-progreso
      ──(se cierran todos)──>  done  ──>  plans/done/
```

**Cuando un plan agrupado se mueve a `done`, en el mismo turno:**

1. se marca su casilla en el tablero del master plan (`☐` → `☑`)
2. se actualiza `progreso: N/M`
3. si era el primero, `estado` pasa de `todo` a `en-progreso`
4. se añade una fila al `Registro de ejecución` del master plan
5. se actualizan los dos `INDEX.md` implicados (`todo` y `done`)

**Cuando se marca la última casilla**, el master plan pasa a `done`, se rellena su `Resultado` y se mueve a `plans/done/` — con la misma regla de siempre: el cierre requiere aprobación explícita del usuario.

Un plan agrupado que se **descarta** también marca su casilla; el motivo va en el `Resultado` del master plan. Un master plan esperando indefinidamente a un plan que ya nadie hará es ruido.

## Reglas que sostienen el esquema

- **Cada carpeta tiene su `INDEX.md`.** Se actualiza en la misma escritura que el documento. Un índice desactualizado es peor que ninguno: se confía en él y miente.
- **`context/` son documentos vivos.** Se editan en sitio; no se crea `arquitectura-v2.md`. No acumulan historial — la historia vive en `experience/` y `plans/done/`.
- **Solo `.md`** (y los `.xml` de draw.io en `addons/`, que son fuente de diagramas). Nada de binarios ni archivos de datos: los `.bpm` de muestra se eliminaron el 2026-08-10.
- **Cerrar un plan requiere aprobación explícita.** Pasos completados ≠ plan cerrado.
- **`mitigado` no es `resuelto`.** Un incidente cuyo síntoma se ocultó pero cuya causa sigue viva es `mitigado`. Confundirlos es cómo un problema vuelve en un año sin que nadie entienda por qué.

## Qué merece documentarse

`experience/` — si el diagnóstico costó más de un intento, si hubo pérdida o corrupción de datos, si el fallo era intermitente o dependiente de timing, o si la solución es contraintuitiva y alguien la revertiría por parecer innecesaria. **No** por typos ni por errores cuyo mensaje ya dice qué hacer.

`context/` — si la decisión cierra una alternativa real, si condiciona cómo escribir código de aquí en adelante, o si es una regla de negocio que no se infiere leyendo el código.

`plans/` — si el trabajo abarca más de una sesión, tiene pasos con dependencias, o toca más de un componente.

`addons/` — siempre que un insumo externo vaya a sustentar una decisión. La procedencia es el punto.

## Historial

Esta estructura reemplazó a `fix_doc/` y al `docs/` plano el **2026-08-10** (ver `DEC-008`). Los movimientos se hicieron con `git mv`, así que `git log --follow <archivo>` sigue funcionando sobre los documentos que venían de `fix_doc/`.

La convención de master plans se añadió el mismo día (`DEC-010`).
