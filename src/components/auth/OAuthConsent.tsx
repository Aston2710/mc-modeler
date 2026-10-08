import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ShieldCheck } from 'lucide-react'
import { supabase, isSupabaseConfigured } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'
import { LoginView } from './LoginView'

/**
 * Pantalla de consentimiento del servidor OAuth de Supabase (MASTER-PLAN-038).
 *
 * Supabase Auth redirige aquí (`/oauth/consent?authorization_id=…`) cuando un
 * conector —Claude, por ejemplo— pide acceso a Flujo en nombre del usuario. La
 * app enseña quién lo pide y qué podrá hacer, y aprueba o deniega con la API
 * del servidor OAuth. No hay datos propios: todo lo decide Supabase Auth.
 *
 * Solo existe con Supabase configurado. En modo local no hay conector.
 */

type Detalles = {
  authorization_id: string
  redirect_uri: string
  client: { name?: string; client_name?: string; uri?: string; client_uri?: string }
  user: { email: string }
  scope: string
}

type Estado =
  | { fase: 'cargando' }
  | { fase: 'pedir'; detalles: Detalles }
  | { fase: 'redirigiendo' }
  | { fase: 'error'; mensaje: string }

export function OAuthConsent() {
  const { t } = useTranslation()
  const session = useAuthStore((s) => s.session)
  const initialized = useAuthStore((s) => s.initialized)
  const [estado, setEstado] = useState<Estado>({ fase: 'cargando' })
  const [enviando, setEnviando] = useState(false)
  const authorizationId = new URLSearchParams(window.location.search).get('authorization_id')

  useEffect(() => { useAuthStore.getState().init() }, [])

  useEffect(() => {
    if (!supabase || !session || !authorizationId) return
    let vivo = true
    void supabase.auth.oauth.getAuthorizationDetails(authorizationId).then(({ data, error }) => {
      if (!vivo) return
      if (error || !data) return setEstado({ fase: 'error', mensaje: t('oauthConsent.invalid') })
      if ('redirect_url' in data && !('authorization_id' in data)) {
        setEstado({ fase: 'redirigiendo' })
        window.location.assign(data.redirect_url)
        return
      }
      setEstado({ fase: 'pedir', detalles: data as unknown as Detalles })
    })
    return () => { vivo = false }
  }, [session, authorizationId, t])

  if (!isSupabaseConfigured) return <Tarjeta titulo={t('oauthConsent.title')}><p>{t('oauthConsent.unavailable')}</p></Tarjeta>
  if (!authorizationId) return <Tarjeta titulo={t('oauthConsent.title')}><p>{t('oauthConsent.invalid')}</p></Tarjeta>
  if (!initialized) return null
  if (!session) return <LoginView redirectTo={window.location.href} />

  const decidir = async (aprobar: boolean) => {
    if (!supabase || estado.fase !== 'pedir') return
    setEnviando(true)
    const api = supabase.auth.oauth
    const { error } = aprobar
      ? await api.approveAuthorization(estado.detalles.authorization_id)
      : await api.denyAuthorization(estado.detalles.authorization_id)
    if (error) {
      setEnviando(false)
      setEstado({ fase: 'error', mensaje: t('oauthConsent.failed') })
    } else {
      // approve/deny redirigen solos al cliente OAuth con el código o el error.
      setEstado({ fase: 'redirigiendo' })
    }
  }

  if (estado.fase === 'cargando' || estado.fase === 'redirigiendo') {
    return <Tarjeta titulo={t('oauthConsent.title')}><p>{t(estado.fase === 'cargando' ? 'oauthConsent.loading' : 'oauthConsent.redirecting')}</p></Tarjeta>
  }
  if (estado.fase === 'error') {
    return <Tarjeta titulo={t('oauthConsent.title')}><p style={{ color: 'var(--danger, #e5484d)' }}>{estado.mensaje}</p></Tarjeta>
  }

  const { detalles } = estado
  const cliente = detalles.client.name ?? detalles.client.client_name ?? t('oauthConsent.unknownClient')
  let destino = detalles.redirect_uri
  try { destino = new URL(detalles.redirect_uri).host } catch { /* se muestra tal cual */ }

  return (
    <Tarjeta titulo={t('oauthConsent.title')} sub={t('oauthConsent.asUser', { email: detalles.user.email })}>
      <p style={{ fontSize: 14 }}>{t('oauthConsent.request', { client: cliente })}</p>
      <div className="field">
        <div className="field-label">{t('oauthConsent.canTitle')}</div>
        <ul style={{ fontSize: 13, color: 'var(--text-2)', paddingLeft: 18, display: 'grid', gap: 4 }}>
          <li>{t('oauthConsent.canRead')}</li>
          <li>{t('oauthConsent.canCreate')}</li>
          <li>{t('oauthConsent.canEdit')}</li>
        </ul>
      </div>
      <div className="field">
        <div className="field-label">{t('oauthConsent.cannotTitle')}</div>
        <p style={{ fontSize: 13, color: 'var(--text-2)' }}>{t('oauthConsent.cannot')}</p>
      </div>
      <p style={{ fontSize: 12, color: 'var(--text-3)' }}>{t('oauthConsent.returnTo', { host: destino })}</p>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button type="button" className="btn-ghost" disabled={enviando} onClick={() => void decidir(false)}>
          {t('oauthConsent.deny')}
        </button>
        <button type="button" className="btn-primary" disabled={enviando} onClick={() => void decidir(true)}>
          <ShieldCheck size={16} style={{ marginRight: 8 }} />
          {t('oauthConsent.approve')}
        </button>
      </div>
    </Tarjeta>
  )
}

function Tarjeta({ titulo, sub, children }: { titulo: string; sub?: string; children: React.ReactNode }) {
  return (
    <div className="auth-screen">
      <div className="modal auth-card">
        <div className="modal-header">
          <div>
            <div className="modal-title">{titulo}</div>
            {sub && <div className="modal-sub">{sub}</div>}
          </div>
        </div>
        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>{children}</div>
      </div>
    </div>
  )
}

export default OAuthConsent
