import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Mail } from 'lucide-react'
import { useAuthStore } from '@/store/authStore'

function GoogleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 18 18" aria-hidden="true">
      <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18z" />
      <path fill="#FBBC05" d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33z" />
      <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z" />
    </svg>
  )
}

export function LoginView() {
  const { t } = useTranslation()
  const signInWithEmail = useAuthStore((s) => s.signInWithEmail)
  const signInWithGoogle = useAuthStore((s) => s.signInWithGoogle)

  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent'>('idle')
  const [error, setError] = useState<string | null>(null)

  const isValidEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!isValidEmail) {
      setError(t('auth.invalidEmail'))
      return
    }
    setStatus('sending')
    const { error } = await signInWithEmail(email.trim())
    if (error) {
      setStatus('idle')
      setError(t('auth.genericError'))
    } else {
      setStatus('sent')
    }
  }

  const handleGoogle = async () => {
    setError(null)
    const { error } = await signInWithGoogle()
    if (error) setError(t('auth.genericError'))
  }

  return (
    <div className="auth-screen">
      <div className="modal auth-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <div className="modal-title">{t('auth.title')}</div>
            <div className="modal-sub">{t('auth.subtitle')}</div>
          </div>
        </div>

        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {status === 'sent' ? (
            <p style={{ fontSize: 14, color: 'var(--text-2)', textAlign: 'center', padding: '8px 0' }}>
              {t('auth.magicLinkSent')}
            </p>
          ) : (
            <form onSubmit={handleEmailSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div className="field">
                <label className="field-label">{t('auth.emailLabel')}</label>
                <input
                  type="email"
                  className="f-input"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={t('auth.emailPlaceholder')}
                  autoFocus
                />
              </div>
              <button
                type="submit"
                className="btn-primary"
                disabled={status === 'sending' || !isValidEmail}
                style={{ width: '100%', justifyContent: 'center' }}
              >
                <Mail size={16} style={{ marginRight: 8 }} />
                {status === 'sending' ? t('auth.sending') : t('auth.sendMagicLink')}
              </button>
            </form>
          )}

          {error && (
            <p style={{ fontSize: 13, color: 'var(--danger, #e5484d)', textAlign: 'center' }}>{error}</p>
          )}

          <div className="auth-divider">
            <span>{t('auth.orContinueWith')}</span>
          </div>

          <button
            type="button"
            className="btn-ghost"
            onClick={handleGoogle}
            style={{ width: '100%', justifyContent: 'center' }}
          >
            <GoogleIcon />
            <span style={{ marginLeft: 8 }}>{t('auth.google')}</span>
          </button>
        </div>
      </div>
    </div>
  )
}
