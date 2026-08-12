---
id: PLAN-013
titulo: Cola de incidentes auditable para los fallos silenciosos de colaboracion
estado: todo
creado: 2026-08-10
cerrado:
aprobado_por:
relacionados: [DEC-007, DEC-004, context/arquitectura-persistencia.md]
---

# Cola de incidentes auditable para los fallos silenciosos de colaboración

## Objetivo

Que todo fallo que hoy ocurre en silencio quede registrado en un histórico consultable y rastreable, sin mostrar errores en la UI de producción. Al terminar, se podrá responder con datos —no con intuiciones— a: *¿cuántas sesiones pierden colaboración, y cuánto trabajo se descarta por conflicto de guardado?*

Esa respuesta es la que decide si el servidor autoritativo de CRDT (DEC-004) deja de estar diferido.

## Alcance

**Entra:** tabla append-only en el propio Postgres, módulo cliente de registro, instrumentación de los siete puntos del catálogo, consultas de lectura y política de retención.

**No entra:** UI de administración (se lee con `service_role` desde el dashboard), sistema de roles de admin, indicador visual de estado de colaboración en la app, y la corrección de los propios fallos —esto solo los hace visibles.

## Precondiciones

Decisiones cerradas antes de empezar. Cinco están abiertas:

1. **¿"Auditable" es append-only o a prueba de manipulación?** Append-only con `REVOKE` es directo. Tamper-evident real (cadena de hashes entre filas) es otro esfuerzo y solo se justifica si el log puede acabar en una discusión formal.
2. **Retención.** `pg_cron` **no está instalado** en el proyecto. Para podar automáticamente hay que habilitarlo o hacerlo desde el Apps Script que ya corre para notificaciones. ¿90 días? ¿Un año?
3. **Quién lee.** No existe rol de admin: `profiles` no tiene columna de rol. Lo propuesto es que nadie lea por la API.
4. **¿Crashes de JS en la misma tabla?** Excepciones no capturadas y errores de React son un problema distinto de los incidentes de dominio. Propuesto: misma tabla con `severity='error'` y stack recortado a nombres de función sin argumentos.
5. **El indicador de estado.** ¿Se deja detrás de un flag apagado o se descarta del todo?

## Catálogo de eventos

Dos naturalezas. Mezclarlas es el error clásico: durante un arrastre salen ~25 updates/s, y una fila por evento convierte la tabla de diagnóstico en el siguiente problema de rendimiento.

**Incidentes discretos** — una fila cada uno:

| Código | Cuándo | Por qué importa |
|---|---|---|
| `collab.bind_timeout` | expiran los 10 s de `useCollab.ts:148` | colaboración muerta en silencio; presencia y cursores siguen funcionando, así que ambos usuarios creen que están sincronizados |
| `collab.cas_double_conflict` | segundo choque de CAS → se acepta el estado del otro | **aquí se pierde trabajo** |
| `collab.edit_dropped_no_role` | `canEdit` falso al emitir (`useCollab.ts:103`) | carrera con `loadRoles()` |
| `collab.channel_error` | el canal de Realtime falla o se cae | |
| `save.invalid_xml` | `looksLikeBpmn` rechaza el XML | se evitó pisar datos buenos |
| `save.conflict_retry` | primer choque de CAS, reintento correcto | precursor del anterior |
| `storage.thumb_missing` | la BD dice que hay thumbnail y Storage no | ya hay limpieza best-effort en `SupabaseRepository.ts:348` |

**Contadores agregados** — una fila por sesión al vaciar, nunca una por evento:
`broadcast.dropped` · `collab.resync` · `collab.antientropy_diff_sent` · `save.retry`

## Regla dura de contenido

> El contenido de la tabla debe poder enseñarse a alguien que no tiene derecho a ver ningún proceso de la empresa.

**Nunca:** `current_xml`, etiquetas de elementos, nombres de diagrama, contenido de comentarios, emails, stack traces con closures.

**Siempre:** ids, códigos, contadores, milisegundos, tamaños en bytes, números de generación.

Incidente bien formado:

```
code=collab.bind_timeout  diagram_id=<uuid>  waited_ms=10032
generation=7  ready_generation=5  tab_switches_since_mount=3
```

El tipo `Record<string, string | number | boolean>` de `utils/perf.ts` ya fuerza esta disciplina. Mantenerlo.

## Forma de la tabla

```
incident_log
  id            uuid pk
  occurred_at   timestamptz   -- reloj del cliente
  received_at   timestamptz   -- default now(), reloj del servidor (detecta desfase)
  session_id    uuid          -- por pestaña, permite reconstruir la línea temporal
  user_id       uuid          -- default auth.uid(), forzado por WITH CHECK
  diagram_id    uuid          -- nullable, SIN FK
  code          text          -- CHECK contra catálogo cerrado
  severity      text          -- 'info' | 'warn' | 'error'
  app_version   text          -- sha del build de Vercel
  detail        jsonb         -- solo escalares; CHECK length < 4096
```

`diagram_id` **sin FK a propósito**: con `ON DELETE CASCADE` borrar un diagrama borraría su historial de incidentes, justo cuando más se quiere. Un log de auditoría no puede depender de que exista lo auditado.

## Garantías

- **Append-only real.** `GRANT INSERT` a `authenticated`; sin `SELECT`, sin `UPDATE`, sin `DELETE`. Desde el cliente es una tabla de solo escritura: no se leen los fallos de otro ni se borran los propios. Ojo con la trampa aprendida en la migración `0023`: `REVOKE UPDATE (columna)` es un no-op si existe `GRANT UPDATE` de tabla.
- **Nunca puede romper la app.** Fire-and-forget, sin `await` en el camino crítico, sin `throw`. Mismo patrón que `private.deliver_notification`, que envuelve el `net.http_post` en `EXCEPTION WHEN OTHERS THEN NULL`.
- **Fuera de la publicación de realtime**, explícitamente. Es append-heavy; publicarla repetiría el error del 73 % de CPU diagnosticado en la auditoría de BD.
- **Techos de tamaño.** `CHECK` sobre `detail` y catálogo cerrado de `code`. Una tabla donde `authenticated` inserta necesita límites o es un vector de abuso.

## Entrega desde el cliente

La ironía del asunto: si la red está caída, el reporte de que la red está caída tampoco sale.

- Buffer en memoria, envío por lotes cada N segundos
- Flush también en `pagehide` / `visibilitychange` — el caso más común es que el usuario cierre la pestaña
- Lo que no salió, a IndexedDB (ya se usa localforage); reintento en la siguiente sesión
- Cola acotada: si crece sin poder enviar, descarta lo más viejo y cuenta cuántos descartó

## Pasos

1. Cerrar las cinco decisiones de **Precondiciones** y congelar el catálogo de `code`
2. Migración: tabla, RLS, grants por columna, `CHECK`s, exclusión de la publicación — depende de 1
3. `src/utils/incidents.ts`, hermano de `utils/perf.ts`: buffer, lotes, flush, cola en IndexedDB — depende de 2
4. Instrumentar los siete puntos del catálogo — depende de 3
5. Consultas de lectura guardadas y política de retención — depende de datos reales
6. Leer una semana de producción y decidir sobre DEC-004 — depende de 5

## Criterios de aceptación

- Los siete códigos se registran, verificado provocando cada fallo en un entorno controlado
- Ninguna ruta de la app queda bloqueada ni lanza excepción si la tabla es inaccesible
- Un `SELECT` como `authenticated` sobre la tabla falla; un `INSERT` funciona
- La tabla no aparece en `pg_publication_tables`
- Revisión manual de 20 filas reales: ninguna contiene texto del dominio
- Existe una consulta que responde "cuántas sesiones perdieron colaboración esta semana, por versión de app"

## Riesgos

- **Que la tabla crezca sin control** si los contadores se registran por evento en vez de agregados. Mitigación: los agregados salen una vez por sesión, y se vigila el tamaño en la primera semana.
- **Que el flush en `pagehide` no llegue** en cierres abruptos. Mitigación: la cola en IndexedDB se reintenta en la sesión siguiente; se acepta perder algún evento.
- **Que se filtre contenido sensible** por un `detail` mal construido. Mitigación: el tipo solo admite escalares, y el criterio de aceptación incluye revisión manual.

## Registro de ejecución

(se rellena durante la ejecución)

## Resultado

(se rellena al cerrar)
