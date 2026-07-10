import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Bell, UserPlus, FolderPlus, AtSign, CheckCheck, Settings } from 'lucide-react'
import {
  useNotificationStore,
  type AppNotification,
  type NotificationKind,
  type NotificationPrefs,
} from '@/store/notificationStore'
import { openNotificationTarget } from '@/lib/notificationNav'

function relativeTime(ts: number): string {
  const diff = Date.now() - ts
  if (diff < 60_000) return 'ahora'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h`
  return new Date(ts).toLocaleDateString('es', { day: 'numeric', month: 'short' })
}

function iconFor(kind: NotificationKind) {
  if (kind === 'invite_redeemed_diagram') return <UserPlus size={15} />
  if (kind === 'invite_redeemed_project') return <FolderPlus size={15} />
  return <AtSign size={15} />
}

function textFor(n: AppNotification): { title: string; body: string } {
  const p = n.payload
  if (n.kind === 'invite_redeemed_diagram') {
    return { title: `${p.actorName} se unió a «${p.diagramName}»`, body: p.actorEmail ?? '' }
  }
  if (n.kind === 'invite_redeemed_project') {
    return { title: `${p.actorName} se unió al proyecto «${p.projectName}»`, body: p.actorEmail ?? '' }
  }
  return {
    title: `${p.actorName} te mencionó en «${p.diagramName}»`,
    body: p.excerpt ?? '',
  }
}

export function NotificationBell() {
  const { t } = useTranslation()
  const items = useNotificationStore((s) => s.items)
  const open = useNotificationStore((s) => s.open)
  const setOpen = useNotificationStore((s) => s.toggle)
  const close = useNotificationStore((s) => s.setOpen)
  const markRead = useNotificationStore((s) => s.markRead)
  const markAllRead = useNotificationStore((s) => s.markAllRead)
  const prefs = useNotificationStore((s) => s.prefs)
  const setPref = useNotificationStore((s) => s.setPref)
  const unread = items.filter((n) => !n.readAt).length
  const wrapRef = useRef<HTMLDivElement>(null)
  const [showPrefs, setShowPrefs] = useState(false)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) close(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open, close])

  const handleClick = (n: AppNotification) => {
    markRead(n.id)
    const diagramId = n.payload?.diagramId as string | undefined
    if (diagramId) {
      const ok = openNotificationTarget(diagramId, n.payload?.threadId as string | undefined)
      if (ok) close(false)
    } else {
      // Notificación de proyecto: sin diagrama concreto que abrir en v1.
      close(false)
    }
  }

  return (
    <div className="notif-wrap" ref={wrapRef}>
      <button
        className={`icon-btn ${open ? 'active' : ''}`}
        onClick={() => setOpen()}
        title={t('notifications.title')}
      >
        <Bell size={16} />
        {unread > 0 && <span className="notif-badge">{unread > 9 ? '9+' : unread}</span>}
      </button>

      {open && (
        <div className="notif-dropdown">
          <div className="notif-head">
            <span className="notif-title">{t('notifications.title')}</span>
            <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              {unread > 0 && (
                <button className="notif-markall" onClick={markAllRead}>
                  <CheckCheck size={12} /> {t('notifications.markAllRead')}
                </button>
              )}
              <button
                className={`notif-gear${showPrefs ? ' active' : ''}`}
                onClick={() => setShowPrefs((v) => !v)}
                title={t('notifications.prefsTitle')}
              >
                <Settings size={13} />
              </button>
            </span>
          </div>

          {showPrefs && (
            <div className="notif-prefs">
              <p className="notif-prefs-hd">{t('notifications.emailPrefs')}</p>
              {([
                ['emailEnabled', t('notifications.prefEmail')],
                ['inviteEvents', t('notifications.prefInvites')],
                ['mentionEvents', t('notifications.prefMentions')],
              ] as [keyof NotificationPrefs, string][]).map(([key, label]) => (
                <label key={key} className="notif-pref-row">
                  <input
                    type="checkbox"
                    checked={prefs[key]}
                    disabled={key !== 'emailEnabled' && !prefs.emailEnabled}
                    onChange={(e) => setPref(key, e.target.checked)}
                  />
                  <span>{label}</span>
                </label>
              ))}
            </div>
          )}

          <div className="notif-list">
            {items.length === 0 ? (
              <div className="notif-empty">
                <Bell size={22} style={{ opacity: 0.2 }} />
                <span>{t('notifications.empty')}</span>
              </div>
            ) : (
              items.map((n) => {
                const { title, body } = textFor(n)
                return (
                  <button
                    key={n.id}
                    className={`notif-item${n.readAt ? '' : ' unread'}`}
                    onClick={() => handleClick(n)}
                  >
                    <span className="notif-item-icon">{iconFor(n.kind)}</span>
                    <span className="notif-item-main">
                      <span className="notif-item-title">{title}</span>
                      {body && <span className="notif-item-body">{body}</span>}
                      <span className="notif-item-time">{relativeTime(n.createdAt)}</span>
                    </span>
                    {!n.readAt && <span className="notif-dot" />}
                  </button>
                )
              })
            )}
          </div>
        </div>
      )}
    </div>
  )
}
