---
id: PLAN-012
titulo: Thumbnails a WebP con entrega segura, y metodo de trabajo para rendimiento
estado: todo
creado: 2026-08-09
cerrado: 
aprobado_por: 
relacionados: [PLAN-010, PLAN-011]
---

# 07 — Thumbnails rápidos y método de trabajo para rendimiento

Dos preguntas: cómo gestionar el rendimiento de forma sostenible, y cómo hacer que los thumbnails carguen más rápido.

---

# Parte A — Thumbnails

## Diagnóstico: qué pasa hoy realmente

Seguimiento del camino completo, de la generación al píxel en pantalla.

### 1. Generación (`thumbnailUtils.ts:47-68`)

```ts
const themedSvg = await getThemedSvg('light', getSvg)   // SVG COMPLETO del diagrama
let svg = ensureViewBox(themedSvg)
if (crop) svg = applyCrop(svg, crop)
svg = anchorBackgroundRect(svg)
return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg)
```

El thumbnail **es el diagrama BPMN entero en vectorial**. Cada forma, cada etiqueta, cada `<path>` de cada flujo de secuencia. Recortar al pool superior cambia el `viewBox`, pero **no elimina un solo nodo del SVG** — sigue viajando el diagrama completo, solo que se muestra una porción.

### 2. Almacenamiento

Verificado en `storage.objects`:

```
bucket thumbnails: 194 objetos, mime ÚNICO image/svg+xml
mediana 36 kB · p90 103 kB · máximo 433 kB · total 10 212 kB
```

### 3. Descarga (`SupabaseRepository.ts:333-361`)

```ts
const { data } = await this.sb.storage.from(THUMB_BUCKET).download(thumbPath(id))
const url = await blobToDataUrl(data)     // Blob → base64 data URL
this.thumbCache.set(id, url)
```

### 4. Coste real de abrir la portada con 78 diagramas visibles

| Concepto | Coste |
|---|---|
| Peticiones HTTP a la API de Storage | **78**, autenticadas, bucket privado → **sin CDN, sin caché HTTP del navegador** |
| Consultas a `storage.objects` que generan | 78 × **7.64 ms de media** (medido en `pg_stat_statements`) |
| Bytes transferidos | **~4 106 kB** |
| Conversiones `FileReader` a base64 | 78, cada una asíncrona |
| Memoria retenida en `thumbCache` | ~5.5 MB de strings base64 (base64 infla **+33%**), **para siempre** |
| Trabajo del navegador por tarjeta | decodificar base64 → parsear XML → construir DOM SVG → **rasterizar un diagrama vectorial completo**, en el hilo principal |

El último punto es el más caro y el menos visible. Un `<img src="data:image/svg+xml;base64,...">` de un BPMN con cientos de nodos obliga al navegador a construir un árbol SVG completo y rasterizarlo. Multiplicado por 78 tarjetas.

El caché en memoria (`thumbCache`, `thumbPaths`) con identidad estable del dataURL está muy bien resuelto y es lo que hoy evita el desastre en navegaciones posteriores. Pero **no ayuda en la primera carga**, que es exactamente donde se percibe la lentitud.

---

## Las cinco correcciones, por orden de impacto

### 1 · Rasterizar el thumbnail a WebP en el guardado — **el cambio grande**

Un BPMN vectorial es el peor formato posible para una miniatura de 320 px: se transmite y se rasteriza el detalle completo para mostrar un sello de correos.

**Ya tienes el código hecho.** `useExport.ts:213` define:

```ts
export function svgToDataUrl(svg: string, scale: number, bg: string, padding = 20): Promise<string>
```

Rasteriza SVG → PNG por canvas offscreen. Se usa para exportar PNG. Basta reutilizarlo en `buildThumbnail` con una escala pequeña y `toBlob(..., 'image/webp', 0.8)` en vez de `toDataURL('image/png')`:

```ts
// thumbnailUtils.ts — en vez de devolver el data URL del SVG
const svg = anchorBackgroundRect(...)          // igual que hoy
return svgToWebp(svg, { maxWidth: 640, quality: 0.8 })   // rasterizado a tamaño fijo
```

| | SVG hoy | WebP 640 px propuesto |
|---|---:|---:|
| Peso mediano | 36 kB | **~8-12 kB** |
| Peso p90 | 103 kB | **~15 kB** (el peso deja de depender de la complejidad del diagrama) |
| Peso máximo | 433 kB | **~20 kB** |
| Portada de 78 tarjetas | ~4 106 kB | **~800 kB** |
| Decodificación | parseo XML + rasterizado vectorial, hilo principal | decodificación de imagen, **hilo aparte** |
| Coste del rasterizado | en **cada** render de **cada** tarjeta | **una vez**, al guardar |

**~5× menos bytes y el rasterizado se mueve de tiempo-de-lectura a tiempo-de-escritura.** Esa reubicación importa más que los bytes: hoy se paga en cada carga de portada de cada usuario; pasaría a pagarse una vez por guardado.

Efecto secundario: elimina el `p90 = 103 kB`. El peso de un WebP a resolución fija es casi constante, no crece con la complejidad del diagrama. Los diagramas grandes dejan de ser los lentos.

### 2 · Dejar de convertir a data URL

`blobToDataUrl` cuesta triple: un `FileReader` asíncrono por imagen, **+33% de tamaño** por base64, y el string queda retenido en el `Map` del heap de JS mientras viva la sesión.

Con las tarjetas apuntando a una URL real, `<img>` descarga en paralelo con el resto, usa la caché HTTP del navegador y libera la memoria cuando quiere. Cero base64, cero `FileReader`, cero retención.

### 3 · Que el `<img>` apunte a una URL, no a un blob descargado a mano

Aquí hay una decisión que te corresponde:

**Opción A — bucket `thumbnails` público.** Cada thumbnail pasa a ser un `GET` plano servido por el CDN de Supabase, con cabeceras de caché a largo plazo. La segunda visita no toca la red. Es la opción más rápida con diferencia.

> Contrapartida de seguridad: la URL contiene el UUID del diagrama y sería accesible sin sesión para quien la conozca. Es el patrón de "URL capacidad" — un UUIDv4 no es adivinable, pero deja de haber control de acceso sobre la miniatura. Los thumbnails muestran la estructura del proceso. **Es tu decisión, no la tomo por ti.**

**Opción B — bucket privado con `createSignedUrls()` en lote.** El método plural acepta N rutas y devuelve N URLs firmadas en **una sola llamada**:

```ts
const { data } = await sb.storage.from('thumbnails')
  .createSignedUrls(ids.map(thumbPath), 3600)
```

Sustituye 78 llamadas secuenciales a `download()` + 78 conversiones a base64 por **1 llamada**, y luego el navegador descarga las 78 imágenes en paralelo con su propio caché. Conserva el control de acceso. Casi todo el beneficio de A sin la contrapartida.

**Recomendación: opción B.** Mantiene la propiedad de seguridad y captura la mayor parte de la ganancia. Solo pasar a A si tras medir la firma sigue siendo el cuello.

### 4 · Transformación de imagen del lado del servidor

Solo funciona sobre raster — otra razón para el punto 1. Con WebP almacenado, Supabase puede servir exactamente el tamaño de visualización:

```
/storage/v1/render/image/sign/thumbnails/<id>/thumb?width=320&quality=70
```

Sirve para pedir 320 px en la rejilla y 640 px en la vista de detalle, sin guardar dos archivos.

### 5 · Atributos del `<img>` en la tarjeta

```html
<img src={url} width={320} height={200} loading="lazy" decoding="async" alt="" />
```

- `loading="lazy"` — con 78 tarjetas, la mayoría nace fuera de pantalla. El navegador no descarga lo que no se ve.
- `decoding="async"` — saca la decodificación del hilo principal.
- `width`/`height` explícitos — reservan el hueco y evitan reflow (además de mejorar el CLS).

Tres atributos, coste cero, efecto inmediato en la percepción de velocidad.

---

## Limpieza pendiente: 78 objetos huérfanos

```
thumbnails válidos (diagrama vivo)      116
thumbnails huérfanos                     78    ← 3 896 kB, 38% del bucket
```

Restos de diagramas purgados. **Cuidado antes de borrar:** hay 3 diagramas en la papelera (`deleted_at` no nulo) cuyos thumbnails siguen siendo necesarios, y los thumbnails de subprocesos usan otra convención de ruta (`subProcPath(parentId, elementId)`). El criterio de barrido tiene que contemplar ambos casos.

Consulta de inspección — **solo lista, no borra**:

```sql
select o.name, pg_size_pretty((o.metadata->>'size')::bigint) as peso
from storage.objects o
where o.bucket_id = 'thumbnails'
  and split_part(o.name, '/', 1) not in (select id::text from diagrams)  -- incluye papelera
order by (o.metadata->>'size')::bigint desc;
```

---

## Resumen de la parte A

| Paso | Esfuerzo | Efecto |
|---|---|---|
| 1. SVG → WebP rasterizado al guardar | medio (reutiliza `svgToDataUrl`) | **~5× menos bytes** + rasterizado fuera del render |
| 2. Eliminar la conversión a data URL | bajo | −33% de bytes, −memoria, −`FileReader` |
| 3. `createSignedUrls()` en lote | bajo | **78 llamadas → 1**, descarga paralela, caché HTTP |
| 4. Transformación de imagen del servidor | bajo (requiere 1) | tamaño exacto de visualización |
| 5. `lazy` + `async` + dimensiones | trivial | no descarga lo que no se ve |
| 6. Barrido de huérfanos | bajo, con cuidado | −3 896 kB |

Los pasos 1+2+3 juntos deberían llevar la primera carga de portada de ~4.1 MB y 78 peticiones secuenciales a **~800 kB y 1 petición + 78 descargas paralelas cacheables**.

---

# Parte B — Cómo gestionar el rendimiento de aquí en adelante

Lo que esta auditoría enseña sobre este sistema en concreto, convertido en método.

## 1. Medir con `EXPLAIN (ANALYZE, BUFFERS)` bajo el rol real, siempre

Es la regla número uno **en este proyecto específicamente**, porque con RLS la consulta que ejecuta el usuario no se parece a la que ejecutas tú:

```sql
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"<uuid-real>","role":"authenticated"}';
  explain (analyze, buffers) <la consulta>;
rollback;
```

Sin `set local role`, tu conexión es superusuario, RLS no se aplica y verás 0.04 ms donde el usuario ve 31 ms. **Factor 700 de diferencia entre lo que mides y lo que pasa.** Todos los números de esta auditoría se tomaron así.

## 2. Fiarse de `Buffers`, no de los milisegundos

Los ms varían con la temperatura de la caché, la carga del vecino en la instancia compartida y el ruido. `Buffers: shared hit=N` es **trabajo determinista**: cuántas páginas de 8 kB tocó la consulta.

La señal que delató el problema de RLS no fue el tiempo, fue la aritmética: **1 344 buffers para una tabla cuyo heap son 12 páginas**. Eso es imposible sin trabajo oculto por fila. Después: 121 buffers.

Regla práctica: divide buffers entre filas devueltas. Si sale más de ~5 en una consulta indexada, hay algo escondido.

## 3. En RLS, nunca una llamada a función por fila

Es la lección central. Comparativa medida sobre la misma tabla de 132 filas:

```
sin RLS                       0.0449 ms
predicado conjuntista         0.262  ms      ← se materializa una vez
función SECURITY DEFINER      8.733  ms      ← se ejecuta por fila
```

Centralizar la autorización en funciones `private.can_*` es **arquitectura correcta** — evita recursión de RLS y duplicar lógica entre 42 políticas. El error no es la función, es **dónde se usa**:

- Políticas **`SELECT` sobre tablas que se escanean** → predicado conjuntista. El planificador materializa las subconsultas en hashes y comprueba O(1) por fila.
- Políticas **`UPDATE`/`DELETE`/`INSERT`**, que se evalúan sobre una fila concreta → la función está perfecta. No la cambies.

Esa distinción es exactamente lo que hace `0025`: cambia dos políticas `SELECT` y deja intactas las otras 40.

## 4. `ANALYZE` después de cada migración

El índice `diagrams_updated_at_live_idx` existía y **el planificador lo ignoraba** hasta que corrió `ANALYZE`. Con `reltuples = -1` el planificador adivina, y adivinando prefiere el `Seq Scan`.

Índice sin estadísticas = índice que pagas mantener y no usas. Añade `analyze` al final de cada migración que toque índices o volumen de datos.

## 5. Mover trabajo de lectura a escritura

Vale para toda la aplicación, y aquí hay dos ejemplos vivos:

- `element_count` es un caché derivado: se calcula una vez al guardar en vez de parsear 3.7 MB de XML en cada carga de lista. Decisión correcta, ya tomada.
- El rasterizado del thumbnail es el mismo patrón sin aplicar: hoy se paga en cada render de cada tarjeta de cada usuario. Debería pagarse una vez por guardado.

Pregunta a hacerse ante cualquier cosa lenta: *¿cuántas veces se lee esto frente a cuántas veces se escribe?* En `diagrams` la proporción es **15 905 UPDATEs contra 1.24 M de lecturas indexadas**. Todo lo que se pueda precalcular al escribir, sale rentable.

## 6. No traer lo que no se muestra

La mayor victoria de rendimiento del proyecto ya estaba hecha antes de esta auditoría, y no fue un índice: fue `LIST_COLUMNS` en `SupabaseRepository.ts:123`. Excluir `current_xml` de la lista quitó **3 764 kB por carga de portada**. El registro histórico lo confirma: esa consulta promediaba **17.62 ms** y tocaba 3 530 900 buffers.

`select('*')` sobre una tabla con una columna TOAST grande es la trampa más cara y más fácil de caer en PostgREST.

## 7. Distinguir el tiempo de la aplicación del tiempo de la plataforma

En la ventana medida, la aplicación consume **menos del 6%** del tiempo de CPU de la base. El resto: 73% Realtime, 7.6% `pg_timezone_names` (recargas de esquema de PostgREST), 3% introspección del panel.

Antes de optimizar una consulta, comprobar qué porcentaje del total representa. Optimizar 10× algo que es el 0.3% del tiempo no se nota. Podar la publicación de realtime sí.

## 8. Reiniciar el contador al medir un cambio

`pg_stat_statements` acumula desde el 2026-05-29. Dos de las diez consultas más caras del ranking **son de código que ya no existe** (`yjs_documents`, el `SELECT diagrams.*`). Las medias históricas mienten sobre el presente.

Antes de evaluar un cambio: `select extensions.pg_stat_statements_reset();`, dejar correr una semana de tráfico real, comparar.

## 9. Cuatro consultas de vigilancia

Para revisar cada mes o antes de cada release:

```sql
-- 1. Reparto del tiempo: ¿dónde se va realmente?
select left(regexp_replace(query,'\s+',' ','g'),90) as q, calls,
       round(total_exec_time::numeric,1) as tot_ms,
       round(mean_exec_time::numeric,2) as media_ms,
       round((100*total_exec_time/sum(total_exec_time) over ())::numeric,2) as pct
from extensions.pg_stat_statements order by total_exec_time desc limit 20;

-- 2. Buffers por fila: delata trabajo oculto por fila (RLS, funciones, TOAST)
select left(regexp_replace(query,'\s+',' ','g'),90) as q, calls, rows,
       round((shared_blks_hit + shared_blks_read)::numeric / nullif(calls,0), 1) as buffers_por_llamada
from extensions.pg_stat_statements
where calls > 100 order by 4 desc limit 20;

-- 3. Tablas que se escanean secuencialmente teniendo índices
select relname, seq_scan, idx_scan, n_live_tup,
       round(100.0*seq_scan/nullif(seq_scan+idx_scan,0),1) as pct_seq
from pg_stat_user_tables
where schemaname='public' and n_live_tup > 1000
order by seq_scan desc;

-- 4. Índices que pagas y no usas
select relname, indexrelname, idx_scan, pg_size_pretty(pg_relation_size(indexrelid))
from pg_stat_user_indexes where schemaname='public' and idx_scan = 0
order by pg_relation_size(indexrelid) desc;
```

Y los linters de Supabase, que son gratis y detectaron correctamente tanto la fuga P0 como las 22 políticas con `auth.uid()` sin envolver:

```
mcp__supabase__get_advisors  type=security | type=performance
```

## 10. Verificar equivalencia antes de tocar seguridad

Cualquier cambio en RLS se valida comparando el conjunto exacto de filas visibles, usuario por usuario, antes y después. No "parece que funciona": un hash del listado ordenado de ids, para todos los usuarios reales.

Es lo que se hizo antes de aplicar `0025` — 23 usuarios, 23 hashes idénticos, 497 filas en ambos lados, 0 divergencias. Sin esa prueba, un cambio de RLS es una apuesta con datos de otros.

---

## Lo siguiente, por retorno

| # | Acción | Ganancia |
|---|---|---|
| 1 | Thumbnails a WebP + `createSignedUrls` en lote + `lazy` | portada: ~4.1 MB / 78 peticiones → ~800 kB / 1 petición |
| 2 | Podar la publicación de realtime | hasta 73% del CPU de la base |
| 3 | `upsert` en `save()` sin el `SELECT id` previo (ya es seguro tras `0028`) | −9 313 consultas por ventana |
| 4 | `thumbnail_path` → `has_thumbnail` | limpieza 3NF, −40 B/fila |
| 5 | Barrido de 78 huérfanos en Storage | −3 896 kB |
