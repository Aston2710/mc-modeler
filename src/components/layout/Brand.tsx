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
        <svg viewBox="0 0 24 24" fill="none">
          <circle cx="6" cy="6" r="3" stroke="white" strokeWidth="2" />
          <path d="M9 6h6M15 6l-3 3M15 6l-3-3" stroke="white" strokeWidth="2" strokeLinecap="round" />
          <rect x="14" y="9" width="6" height="6" rx="1" stroke="white" strokeWidth="2" />
        </svg>
      </div>
      <span className="brand-name">Modeler<span className="dot">.</span></span>
    </button>
  )
}
