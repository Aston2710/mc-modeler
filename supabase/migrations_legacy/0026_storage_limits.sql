-- 0026_storage_limits
-- Ambos buckets tenian file_size_limit = null: sin tope, un cliente
-- comprometido o un bug de generacion podia subir un archivo de cualquier
-- tamano. Verificado antes de aplicar:
--   thumbnails      194 objetos, max 433 kB, mime UNICO image/svg+xml
--   diagram-images   52 objetos, max 503 kB, mime UNICO image/webp
-- Los limites elegidos dejan ~4x de margen sobre el maximo actual.
--
-- NOTA: image/svg+xml esta permitido en `thumbnails` porque hoy los thumbnails
-- SON SVG. Si se migra a WebP rasterizado (ver fix_doc/DB/08), quitar svg+xml
-- de la lista: un SVG servido como imagen puede contener script y el bucket
-- almacena procesos internos.

update storage.buckets
   set file_size_limit    = 2 * 1024 * 1024,
       allowed_mime_types = array['image/svg+xml','image/webp','image/png']
 where id = 'thumbnails';

update storage.buckets
   set file_size_limit    = 10 * 1024 * 1024,
       allowed_mime_types = array['image/webp','image/png','image/jpeg','image/svg+xml']
 where id = 'diagram-images';
