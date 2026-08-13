-- ============================================================================
-- Sube el techo del bucket `thumbnails` de 2 MB a 5 MB.
--
-- POR QUE
-- La migracion 0026 puso un limite de 2 MB donde antes no habia ninguno. Fue
-- correcto — un bucket sin tope es un vector de abuso — pero el valor quedo
-- ajustado: el mayor thumbnail observado en produccion era de 433 kB, o sea
-- 4.7x de margen, y un diagrama grande con muchas etiquetas puede acercarse.
--
-- Cuando un thumbnail supera el techo, Storage rechaza la subida. El fallo
-- esta capturado como no critico y el XML se guarda igual, asi que no se
-- pierde trabajo: lo que se pierde es la miniatura de la portada, en silencio.
--
-- Es el punto pendiente de la fase 0 de MASTER-PLAN-018.
--
-- RIESGO
-- Bajo y en una sola direccion: sube un techo, no lo baja. Nada que hoy
-- funcione deja de funcionar. La contrapartida es que un objeto puede ocupar
-- hasta 5 MB en vez de 2 MB; con el margen actual nadie deberia rozarlo.
--
-- Los tipos MIME permitidos NO cambian. PLAN-012 convertira estos SVG a WebP
-- y entonces el limite dejara de importar.
--
-- REVERSIBLE
--   update storage.buckets set file_size_limit = 2 * 1024 * 1024
--    where id = 'thumbnails';
-- Volver atras solo impide subidas nuevas mayores de 2 MB; no toca lo ya
-- almacenado.
-- ============================================================================

update storage.buckets
   set file_size_limit = 5 * 1024 * 1024
 where id = 'thumbnails';
