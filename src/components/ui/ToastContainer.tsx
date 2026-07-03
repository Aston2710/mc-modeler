import { useEffect } from 'react'
import { CheckCircle, AlertCircle, AlertTriangle, Info, X } from 'lucide-react'
import { useUIStore } from '@/store/uiStore'
import type { Toast } from '@/domain/types'

const ICONS = {
  success: CheckCircle,
  error: AlertCircle,
  warning: AlertTriangle,
  info: Info,
}

function ToastItem({ toast }: { toast: Toast }) {
  const removeToast = useUIStore((s) => s.removeToast)
  const Icon = ICONS[toast.type]

  useEffect(() => {
    const duration = toast.duration ?? 4000
    if (duration === 0) return // persistente: solo se cierra manualmente o por acción
    const t = setTimeout(() => removeToast(toast.id), duration)
    return () => clearTimeout(t)
  }, [toast.id, toast.duration, removeToast])

  return (
    <div className={`toast ${toast.type}`}>
      <div className="toast-icon">
        <Icon size={16} />
      </div>
      <div style={{ flex: 1 }}>
        <div className="toast-title">{toast.title}</div>
        {toast.message && <div className="toast-msg">{toast.message}</div>}
        {toast.actions && toast.actions.length > 0 && (
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            {toast.actions.map((a) => (
              <button
                key={a.label}
                className="btn-ghost"
                style={{ fontSize: 12, padding: '4px 10px' }}
                onClick={() => { a.onClick(); removeToast(toast.id) }}
              >
                {a.label}
              </button>
            ))}
          </div>
        )}
      </div>
      <button className="icon-btn" style={{ flexShrink: 0, marginLeft: 4 }} onClick={() => removeToast(toast.id)}>
        <X size={14} />
      </button>
    </div>
  )
}

export function ToastContainer() {
  const toasts = useUIStore((s) => s.toasts)
  if (!toasts.length) return null
  return (
    <div className="toast-container">
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} />
      ))}
    </div>
  )
}
