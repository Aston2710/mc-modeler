import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronRight, MessageSquare } from 'lucide-react'
import { useCommentStore } from '@/store/commentStore'
import { PropertiesPanel } from '@/components/properties/PropertiesPanel'

interface Element {
  id: string
  businessObject: { $type: string; name?: string }
}

interface RightPanelProps {
  collapsed: boolean
  onToggle: () => void
  getSelectedElements: () => Element[]
  onUpdateProperty?: (elementId: string, property: string, value: string) => void
  /** true = viewer: propiedades en solo lectura. */
  readOnly?: boolean
}

/**
 * Única barra lateral derecha del editor: zona de contexto con dos modos,
 * Propiedades | Comentarios. El modo lo gobierna commentStore.panelOpen
 * (los pins del canvas y Ctrl+Shift+C ya lo activan), así que abrir un
 * comentario cambia de pestaña en vez de apilar una segunda barra.
 *
 * El contenido de comentarios lo porta CommentsPanel (montado en BpmnCanvas,
 * que es quien tiene el modelerRef) vía createPortal hacia el slot
 * #comments-panel-slot que se renderiza aquí.
 */
export function RightPanel({ collapsed, onToggle, getSelectedElements, onUpdateProperty, readOnly }: RightPanelProps) {
  const { t } = useTranslation()
  const panelOpen = useCommentStore((s) => s.panelOpen)
  const setPanelOpen = useCommentStore((s) => s.setPanelOpen)
  const openCount = useCommentStore((s) => s.threads.filter((th) => th.status === 'open').length)

  // Un pin del canvas (o el atajo) abre comentarios con la barra colapsada →
  // expandirla; si no, el cambio de modo sería invisible.
  useEffect(() => {
    if (panelOpen && collapsed) onToggle()
  }, [panelOpen, collapsed, onToggle])

  // Colapsar estando en comentarios debe además cerrarlos: si panelOpen
  // quedara true, el effect de arriba re-expandiría la barra al instante.
  const collapse = () => {
    if (panelOpen) setPanelOpen(false)
    onToggle()
  }

  if (collapsed) {
    return (
      <div className="collapsed-rail right">
        <button className="icon-btn" onClick={onToggle} title={t('rightPanel.properties')}>
          <ChevronRight size={14} style={{ transform: 'rotate(180deg)' }} />
        </button>
        <button
          className="icon-btn rail-comments-btn"
          onClick={() => setPanelOpen(true)}
          title={`${t('rightPanel.comments')} (Ctrl+Shift+C)`}
        >
          <MessageSquare size={14} />
          {openCount > 0 && <span className="rail-badge">{openCount > 9 ? '9+' : openCount}</span>}
        </button>
      </div>
    )
  }

  return (
    <div className="sidebar-r">
      <div className="rp-tabs">
        <button
          className={`rp-tab${!panelOpen ? ' active' : ''}`}
          onClick={() => setPanelOpen(false)}
        >
          {t('rightPanel.properties')}
        </button>
        <button
          className={`rp-tab${panelOpen ? ' active' : ''}`}
          onClick={() => setPanelOpen(true)}
        >
          {t('rightPanel.comments')}
          {openCount > 0 && (
            <span className="comments-open-count">{openCount > 9 ? '9+' : openCount}</span>
          )}
        </button>
        <button className="sb-collapse-btn" onClick={collapse} style={{ marginLeft: 'auto' }}>
          <ChevronRight size={14} />
        </button>
      </div>

      {panelOpen ? (
        <div id="comments-panel-slot" className="rp-comments-slot" />
      ) : (
        <PropertiesPanel
          getSelectedElements={getSelectedElements}
          onUpdateProperty={onUpdateProperty}
          readOnly={readOnly}
        />
      )}
    </div>
  )
}
