import { useEffect, useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { X, Copy, UserPlus, Trash2 } from 'lucide-react'
import { useUIStore } from '@/store/uiStore'
import { useAuthStore } from '@/store/authStore'
import { useCollabStore } from '@/store/collabStore'
import {
  listCollaborators,
  addCollaboratorByEmail,
  createInviteLink,
  removeCollaborator,
  listProjectCollaborators,
  addProjectCollaboratorByEmail,
  createProjectInviteLink,
  removeProjectCollaborator,
} from '@/lib/sharing'
import type { Collaborator, CollaboratorRole } from '@/domain/types'

interface ShareModalProps {
  /** 'diagram' (por defecto) comparte un diagrama; 'project' comparte un proyecto entero. */
  kind?: 'diagram' | 'project'
  diagramId: string
  diagramName: string
  onClose: () => void
}

export function ShareModal({ kind = 'diagram', diagramId, diagramName, onClose }: ShareModalProps) {
  const { t } = useTranslation()
  const addToast = useUIStore((s) => s.addToast)
  const currentUserId = useAuthStore((s) => s.user?.id ?? null)
  const isProject = kind === 'project'
  // Para proyecto, isOwner se resuelve con los roles de proyecto cargados.
  const isOwner = useCollabStore((s) =>
    isProject ? (s.rolesByProject[diagramId] === 'owner') : s.isOwner(diagramId)
  )

  // API según el tipo de recurso.
  const api = isProject
    ? {
        list: listProjectCollaborators,
        add: addProjectCollaboratorByEmail,
        link: createProjectInviteLink,
        remove: removeProjectCollaborator,
      }
    : {
        list: listCollaborators,
        add: addCollaboratorByEmail,
        link: createInviteLink,
        remove: removeCollaborator,
      }

  const [collaborators, setCollaborators] = useState<Collaborator[]>([])
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<Exclude<CollaboratorRole, 'owner'>>('editor')
  // Expiración del enlace en días; 'never' = sin expiración.
  const [expiry, setExpiry] = useState<'3' | '7' | '30' | 'never'>('7')
  const expiresInDays = expiry === 'never' ? null : Number(expiry)
  const [busy, setBusy] = useState(false)

  const refresh = useCallback(async () => {
    try {
      setCollaborators(await api.list(diagramId))
    } catch {
      /* noop */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [diagramId, isProject])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const handleInvite = async () => {
    const value = email.trim()
    if (!value) return
    setBusy(true)
    try {
      const added = await api.add(diagramId, value, role)
      if (added) {
        addToast({ type: 'success', title: t('share.added') })
        setEmail('')
        await refresh()
      } else {
        // No tiene cuenta → generar enlace de invitación
        const link = await api.link(diagramId, role, expiresInDays)
        await navigator.clipboard.writeText(link)
        addToast({ type: 'info', title: t('share.notRegistered'), message: t('share.linkCopied') })
      }
    } catch {
      addToast({ type: 'error', title: t('share.inviteError') })
    } finally {
      setBusy(false)
    }
  }

  const handleCopyLink = async () => {
    setBusy(true)
    try {
      const link = await api.link(diagramId, role, expiresInDays)
      await navigator.clipboard.writeText(link)
      addToast({ type: 'success', title: t('share.linkCopied') })
    } catch {
      addToast({ type: 'error', title: t('share.inviteError') })
    } finally {
      setBusy(false)
    }
  }

  const handleRemove = async (userId: string) => {
    try {
      await api.remove(diagramId, userId)
      await refresh()
    } catch {
      addToast({ type: 'error', title: t('share.inviteError') })
    }
  }

  const roleLabel = (r: CollaboratorRole) =>
    r === 'owner' ? t('share.roleOwner') : r === 'editor' ? t('share.roleEditor') : t('share.roleViewer')

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" style={{ width: 'min(480px, 92vw)' }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <div className="modal-title">{isProject ? t('share.titleProject') : t('share.title')}</div>
            <div className="modal-sub">{diagramName}</div>
          </div>
          <button className="icon-btn" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {!isOwner ? (
            <p style={{ fontSize: 13, color: 'var(--text-2)', margin: 0 }}>
              {t('share.onlyOwnerCanShare')}
            </p>
          ) : (
            <>
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                <div className="field" style={{ flex: 1 }}>
                  <input
                    type="email"
                    className="f-input"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder={t('share.emailPlaceholder')}
                  />
                </div>
                <select
                  className="f-input"
                  style={{ width: 130 }}
                  value={role}
                  onChange={(e) => setRole(e.target.value as Exclude<CollaboratorRole, 'owner'>)}
                >
                  <option value="editor">{t('share.roleEditor')}</option>
                  <option value="viewer">{t('share.roleViewer')}</option>
                </select>
                <button className="btn-primary" onClick={handleInvite} disabled={busy || !email.trim()}>
                  <UserPlus size={14} style={{ marginRight: 6 }} />
                  {t('share.invite')}
                </button>
              </div>

              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <button className="btn-ghost" onClick={handleCopyLink} disabled={busy} style={{ justifyContent: 'center', flex: 1 }}>
                  <Copy size={14} style={{ marginRight: 6 }} />
                  {t('share.copyLink')}
                </button>
                <select
                  className="f-input"
                  style={{ width: 130 }}
                  value={expiry}
                  onChange={(e) => setExpiry(e.target.value as typeof expiry)}
                  title={t('share.expiryLabel')}
                >
                  <option value="3">{t('share.expiry3d')}</option>
                  <option value="7">{t('share.expiry7d')}</option>
                  <option value="30">{t('share.expiry30d')}</option>
                  <option value="never">{t('share.expiryNever')}</option>
                </select>
              </div>
            </>
          )}

          <div>
            <div style={{ fontSize: 12, textTransform: 'uppercase', color: 'var(--text-3)', marginBottom: 8, letterSpacing: '.04em' }}>
              {t('share.collaborators')}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {collaborators.map((c) => (
                <div key={c.userId} className="collab-row">
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {c.displayName || c.email || c.userId}
                      {c.userId === currentUserId && <span style={{ color: 'var(--text-3)' }}> {t('share.you')}</span>}
                    </div>
                    {c.email && c.displayName && (
                      <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{c.email}</div>
                    )}
                  </div>
                  <span style={{ fontSize: 11, color: 'var(--text-2)' }}>{roleLabel(c.role)}</span>
                  {isOwner && c.role !== 'owner' && (
                    <button className="icon-btn" title={t('share.remove')} onClick={() => handleRemove(c.userId)}>
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
