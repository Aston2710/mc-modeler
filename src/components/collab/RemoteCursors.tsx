import { useEffect, useReducer } from 'react'
import { usePresenceStore } from '@/store/presenceStore'
import { useAuthStore } from '@/store/authStore'

interface RemoteCursorsProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  modelerRef: React.RefObject<any>
}

/**
 * Dibuja los cursores de los demás participantes sobre el canvas.
 * Las coordenadas llegan en espacio de diagrama y se convierten a pantalla
 * usando el viewbox local (así se alinean aunque cada quien tenga otro zoom).
 */
export function RemoteCursors({ modelerRef }: RemoteCursorsProps) {
  const participants = usePresenceStore((s) => s.participants)
  const myId = useAuthStore((s) => s.user?.id)
  const [, tick] = useReducer((x: number) => x + 1, 0)

  // Re-render al cambiar el viewbox (zoom/scroll) para reposicionar.
  useEffect(() => {
    const modeler = modelerRef.current
    if (!modeler) return
    let eventBus: { on: (e: string, cb: () => void) => void; off: (e: string, cb: () => void) => void }
    try {
      eventBus = modeler.get('eventBus')
    } catch {
      return
    }
    eventBus.on('canvas.viewbox.changed', tick)
    return () => eventBus.off('canvas.viewbox.changed', tick)
  }, [modelerRef])

  const modeler = modelerRef.current
  let vb: { x: number; y: number; scale: number } | null = null
  try {
    vb = modeler?.get('canvas').viewbox()
  } catch {
    vb = null
  }
  if (!vb) return null

  const others = Object.values(participants).filter((p) => p.userId !== myId && p.cursor)

  return (
    <div className="remote-cursors-layer">
      {others.map((p) => {
        const sx = (p.cursor!.x - vb!.x) * vb!.scale
        const sy = (p.cursor!.y - vb!.y) * vb!.scale
        return (
          <div key={p.userId} className="remote-cursor" style={{ transform: `translate(${sx}px, ${sy}px)` }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill={p.color} stroke="white" strokeWidth="1.5">
              <path d="M5 3l6 14 2-5 5-2z" />
            </svg>
            <span className="remote-cursor-label" style={{ background: p.color }}>
              {p.name}
            </span>
          </div>
        )
      })}
    </div>
  )
}
