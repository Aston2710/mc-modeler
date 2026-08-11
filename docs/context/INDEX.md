# Contexto vigente

Documentos vivos. Se editan en sitio y describen el sistema **como es hoy**, no cómo llegó a serlo. Orden alfabético.

| Documento | Qué gobierna | Vigencia | Actualizado |
|---|---|---|---|
| [arquitectura-persistencia.md](arquitectura-persistencia.md) | Quién es la fuente de verdad de un diagrama: XML canónico en Postgres. Yjs solo transporte. Concurrencia por CAS. | vigente | 2026-07-19 |
| [base-de-datos.md](base-de-datos.md) | Estado de la base Supabase: resumen de la auditoría y hallazgos vigentes | vigente | 2026-08-10 |
| [base-de-datos-inventario.md](base-de-datos-inventario.md) | Inventario del esquema: 14 tablas, 23 FKs, 36 índices, 42 políticas RLS, triggers, buckets | vigente | 2026-08-09 |
| [decisiones.md](decisiones.md) | Registro append-only de decisiones con sus alternativas descartadas | vigente | 2026-08-10 |
| [normalizacion.md](normalizacion.md) | Forma normal objetivo (3NF) y las desnormalizaciones deliberadas, tabla por tabla | vigente | 2026-08-09 |
| [rendimiento-base-de-datos.md](rendimiento-base-de-datos.md) | Cómo medir rendimiento en esta base y dónde está el tiempo realmente | vigente | 2026-08-09 |
| [flags-operacion.md](flags-operacion.md) | Flags de operación y sus killswitches (`flujo:tabsCache`, `flujo:perf`) | vigente | 2026-07-15 |
| [operacion-scripts.md](operacion-scripts.md) | Scripts de diagnóstico, backup y restauración (`scripts/*.mjs`, fuera del repo) | vigente | 2026-07-03 |
| [patrones.md](patrones.md) | Patrones de arquitectura del cliente | vigente | 2026-07-19 |
| [patrones-routing.md](patrones-routing.md) | Invariante ortogonal, semántica Bizagi y no-invasión de shapes en la capa de routing | vigente | 2026-08-09 |
| [patrones-ui-sticky-lane.md](patrones-ui-sticky-lane.md) | Overlay de etiquetas de pool/carril ancladas al viewport | vigente | por-determinar |
