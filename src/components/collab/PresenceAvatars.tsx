import { usePresenceStore } from '@/store/presenceStore'
import { useAuthStore } from '@/store/authStore'
import { initialsOf } from '@/collab/presence'

/** Avatares de los participantes presentes en el diagrama actual. */
export function PresenceAvatars() {
  const participants = usePresenceStore((s) => s.participants)
  const myId = useAuthStore((s) => s.user?.id)

  const list = Object.values(participants)
  // Solo tiene sentido mostrar presencia si hay más de uno.
  if (list.length <= 1) return null

  const shown = list.slice(0, 5)
  const extra = list.length - shown.length

  return (
    <div className="presence-avatars" title={`${list.length} en línea`}>
      {shown.map((p) => (
        <div
          key={p.userId}
          className="presence-avatar"
          style={{ background: p.color }}
          title={p.userId === myId ? `${p.name} (tú)` : p.name}
        >
          {initialsOf(p.name)}
        </div>
      ))}
      {extra > 0 && <div className="presence-avatar presence-avatar--more">+{extra}</div>}
    </div>
  )
}
