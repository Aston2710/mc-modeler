import { useEffect, useRef } from 'react'
import { useDiagramStore } from '@/store/diagramStore'

interface Props {
  diagramId: string
  src: string
  alt?: string
}

/**
 * El `<img>` de una miniatura, con recuperación ante URL caducada (PLAN-012).
 *
 * POR QUÉ EXISTE. Desde el paso 3, la miniatura no es un data URL sino una
 * **URL firmada con caducidad** (90 min). El store la resuelve una vez por
 * sesión y no la refresca, así que la lógica de re-firma del repositorio no
 * cubre a un diagrama ya hidratado. Con `loading="lazy"` el escenario es fácil:
 * abres la portada, las tarjetas de abajo no se descargan por estar fuera de
 * pantalla, pasan más de 90 minutos, bajas — y esas piden una URL vencida.
 *
 * Aquí eso deja de ser una imagen rota: el `onError` pide una firma nueva.
 *
 * **Un solo reintento.** Si la segunda también falla, no es la caducidad: el
 * objeto no existe, o Storage está caído, o el usuario perdió el acceso. Volver
 * a intentarlo sería un bucle contra Storage por cada tarjeta.
 *
 * `lazy` + `async` por lo de siempre: con la portada llena la mayoría de
 * tarjetas nace fuera de pantalla, y la decodificación sale del hilo principal.
 *
 * SIN `width`/`height` a propósito: las tres cajas donde se usa esto tienen
 * altura fija en CSS, así que no hay hueco que reservar y el CLS ya es cero. Y
 * como cada miniatura tiene su propia relación de aspecto, unos valores fijos
 * darían una pista de aspecto falsa y provocarían un salto al cargar.
 */
export default function ThumbnailImg({ diagramId, src, alt }: Props) {
  const refreshThumbnail = useDiagramStore((s) => s.refreshThumbnail)
  const reintentado = useRef(false)

  // Si llega una URL distinta (la firma nueva, o el diagrama se volvió a
  // guardar), se permite un reintento otra vez: el cupo es por URL, no por vida
  // del componente.
  useEffect(() => {
    reintentado.current = false
  }, [src])

  return (
    <img
      src={src}
      alt={alt ?? ''}
      loading="lazy"
      decoding="async"
      onError={() => {
        if (reintentado.current) return
        reintentado.current = true
        void refreshThumbnail(diagramId)
      }}
    />
  )
}
