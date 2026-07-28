// Logo solo-ícono; el nombre lo pone <span className="brand-name"> (color del tema).
// Import por URL → Vite le pone hash y lo sirve desde /assets.
import logoUrl from '@/assets/Modeler Logo.svg'

interface BrandProps {
  /** Click en el logo (p. ej. ir a home). Opcional. */
  onClick?: () => void
}

/**
 * Logo/wordmark de la app (marca + nombre). Único punto donde vive el nombre,
 * usado por el header del editor (Toolbar) y por la vista de inicio (DiagramList).
 */
export function Brand({ onClick }: BrandProps) {
  return (
    <button className="brand" onClick={onClick}>
      <div className="brand-mark">
        {/* alt vacío: el nombre accesible del botón lo da el <span> de al lado. */}
        <img src={logoUrl} alt="" width={44} height={44} draggable={false} />
      </div>
      <span className="brand-name">Modeler</span>
    </button>
  )
}
