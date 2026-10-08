# Insumos externos

Material que se **cita**, no que gobierna. Una decisión derivada de un addon vive en `context/decisiones.md` con la referencia. Orden alfabético.

| Archivo | Tipo | Procedencia | Fecha | Usado en |
|---|---|---|---|---|
| [arquitectura-c4-detalle.xml](arquitectura-c4-detalle.xml) | diagrama | draw.io — modelo C4 nivel detalle | 2026-07-19 | `context/patrones.md` |
| [arquitectura-c4.xml](arquitectura-c4.xml) | diagrama | draw.io — modelo C4 | 2026-07-19 | `context/patrones.md` |
| [arquitectura.xml](arquitectura.xml) | diagrama | draw.io — vista general | 2026-07-19 | `context/patrones.md` |
| [auditoria-calidad-codigo.md](auditoria-calidad-codigo.md) | auditoría | informe sobre el repo, procedencia por-determinar | 2026-07-19 | por-determinar |
| [auditoria-codigo-muerto.md](auditoria-codigo-muerto.md) | auditoría | informe sobre el repo, procedencia por-determinar | 2026-07-19 | por-determinar |
| [auditoria-decisiones.md](auditoria-decisiones.md) | auditoría | informe sobre el repo, procedencia por-determinar | 2026-07-19 | `context/decisiones.md` |
| [auditoria-seguridad-acceso.md](auditoria-seguridad-acceso.md) | auditoría | análisis estático asistido por Claude, solicitado por santiagojmg28; hallazgos **sin verificar** | 2026-10-08 | por-determinar (verificar en lab antes de abrir PLAN) |
| [auditoria-testing.md](auditoria-testing.md) | auditoría | informe sobre el repo, procedencia por-determinar | 2026-07-19 | por-determinar |
| [comentarios_collab.md](comentarios_collab.md) | investigación | diseño de comentarios en herramientas de colaboración | 2026-06-29 | PLAN-001 (§2a comentarios a tablas) |
| [comentariosGoogle.md](comentariosGoogle.md) | investigación | comportamiento de comentarios en Google Docs | 2026-06-29 | PLAN-001 (§2a) |
| [informe-mcp-fase-2.md](informe-mcp-fase-2.md) | informe | implementación y pruebas asistidas por Claude, solicitadas por santiagojmg28 (Fase 2 del MCP, solo laboratorio) | 2026-10-08 | MASTER-PLAN-038, PLAN-039 a PLAN-042 |
| [investigacion-colaboradores.md](investigacion-colaboradores.md) | investigación | modelos de colaboración y permisos de terceros | 2026-06-26 | DEC-001, DEC-002 |
| [investigacion-mcp.md](investigacion-mcp.md) | investigación | investigación asistida por Claude, solicitada por santiagojmg28 (Fase 0 del MCP, solo lectura) | 2026-10-08 | por-determinar (entrada de la Fase 1: DEC-013 y master plan) |
| [revision-arquitectura-colaboracion.md](revision-arquitectura-colaboracion.md) | investigación | revisión de ingeniería de software (venía de `fix_doc/software_ing/`) | 2026-07-07 | DEC-004 |

## Procedencia pendiente

Los cuatro `auditoria-*.md` y `patrones.md` estaban en el `docs/` plano, que no se versionaba. **No consta quién los produjo.** Se clasificaron aquí porque son informes que sustentan decisiones, no documentos que el equipo mantenga vivos — con la excepción de `arquitectura-patrones.md`, que sí se mantenía y por eso pasó a `context/patrones.md`.

Si alguno lo escribió el equipo, su sitio es `context/` y hay que moverlo. Si vino de fuera, falta anotar el origen concreto en la columna *Procedencia*: sin ella el insumo no es verificable.

`auditoria-seguridad-acceso.md` no entra en ese caso: su procedencia consta (análisis estático asistido, 2026-10-06, sin ejecución). Está aquí y no en `context/` porque sus hallazgos son hipótesis sin verificar; cuando se confirmen o descarten, lo confirmado debe migrar a un PLAN o EXP y lo descartado quedar anotado en el propio documento.

Los `.xml` son fuente de diagramas de draw.io, no markdown. Se conservan por ser la única fuente de los C4; son la excepción a la regla de "solo `.md`".
