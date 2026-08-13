/**
 * Barra del modo laboratorio.
 *
 * SOLO existe en `npm run lab`. main.tsx la carga detras de
 * `import.meta.env.MODE === 'lab'`, que Vite sustituye por una constante al
 * compilar: en el build de produccion la rama es inalcanzable y rollup
 * descarta este modulo entero. Ni el codigo ni las credenciales de abajo
 * llegan al bundle real.
 *
 * Hace dos cosas:
 *  1. Inicia sesion sola al arrancar, para no pasar por el enlace magico.
 *  2. Permite saltar entre los dos usuarios sembrados con un clic, que es lo
 *     que hace falta para probar compartir, roles y colaboracion.
 *
 * Los usuarios y la contrasena son los de supabase/seed.sql y solo existen en
 * la base local.
 */
import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'

const LAB_PASSWORD = 'lab'

const LAB_USERS = [
  { email: 'dev@local.test', name: 'Dev Local' },
  { email: 'dev2@local.test', name: 'Dev Segundo' },
] as const

export default function LabBar() {
  const session = useAuthStore((s) => s.session)
  const initialized = useAuthStore((s) => s.initialized)
  const user = useAuthStore((s) => s.user)

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const autoTried = useRef(false)

  const signInAs = async (email: string) => {
    if (!supabase) return
    setBusy(true)
    setError(null)
    // signOut primero: cambiar de usuario sin cerrar deja el token viejo en
    // vuelo y los canales de Realtime suscritos como el anterior.
    if (useAuthStore.getState().session) {
      await supabase.auth.signOut()
    }
    const { error } = await supabase.auth.signInWithPassword({ email, password: LAB_PASSWORD })
    if (error) setError(error.message)
    setBusy(false)
    setOpen(false)
  }

  // Sesion automatica al arrancar. Una sola vez: si falla, se muestra el
  // motivo y se deja la pantalla de acceso normal, sin reintentos en bucle.
  useEffect(() => {
    if (!initialized || session || autoTried.current) return
    autoTried.current = true
    void signInAs(LAB_USERS[0].email)
  }, [initialized, session])

  const current = LAB_USERS.find((u) => u.email === user?.email)
  const label = busy ? 'entrando…' : (current?.name ?? user?.email ?? 'sin sesión')

  return (
    <div style={wrap}>
      {error && <div style={errorBox}>lab: {error}</div>}

      <div style={bar}>
        <span style={dot} />
        <span style={tag}>LAB</span>
        <button type="button" style={nameBtn} onClick={() => setOpen((v) => !v)} disabled={busy}>
          {label}
          <span style={{ opacity: 0.6, marginLeft: 6 }}>▾</span>
        </button>
      </div>

      {open && (
        <div style={menu}>
          {LAB_USERS.map((u) => (
            <button
              key={u.email}
              type="button"
              style={{
                ...menuItem,
                fontWeight: u.email === user?.email ? 600 : 400,
              }}
              onClick={() => void signInAs(u.email)}
            >
              {u.name}
              <span style={menuEmail}>{u.email}</span>
            </button>
          ))}
          <a style={{ ...menuItem, ...menuLink }} href="http://127.0.0.1:54323" target="_blank" rel="noreferrer">
            Studio
            <span style={menuEmail}>ver y editar la base</span>
          </a>
          <a style={{ ...menuItem, ...menuLink }} href="http://127.0.0.1:54324" target="_blank" rel="noreferrer">
            Mailpit
            <span style={menuEmail}>correos capturados</span>
          </a>
        </div>
      )}
    </div>
  )
}

// Estilos en linea a proposito: este componente no debe dejar rastro en
// index.css, que es codigo de produccion.
const wrap: React.CSSProperties = {
  position: 'fixed',
  bottom: 12,
  left: 12,
  zIndex: 99999,
  fontFamily: 'system-ui, sans-serif',
  fontSize: 12,
}

const bar: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '6px 10px',
  borderRadius: 999,
  background: 'rgba(20, 20, 24, 0.92)',
  border: '1px solid rgba(255, 255, 255, 0.14)',
  color: '#f2f2f5',
  boxShadow: '0 4px 16px rgba(0, 0, 0, 0.32)',
  backdropFilter: 'blur(6px)',
}

const dot: React.CSSProperties = {
  width: 7,
  height: 7,
  borderRadius: '50%',
  background: '#f5a524',
  boxShadow: '0 0 8px #f5a524',
}

const tag: React.CSSProperties = {
  letterSpacing: 1.2,
  fontWeight: 700,
  fontSize: 10,
  color: '#f5a524',
}

const nameBtn: React.CSSProperties = {
  background: 'transparent',
  border: 'none',
  color: 'inherit',
  font: 'inherit',
  cursor: 'pointer',
  padding: 0,
}

const menu: React.CSSProperties = {
  marginTop: 6,
  minWidth: 210,
  borderRadius: 10,
  overflow: 'hidden',
  background: 'rgba(20, 20, 24, 0.97)',
  border: '1px solid rgba(255, 255, 255, 0.14)',
  boxShadow: '0 8px 24px rgba(0, 0, 0, 0.4)',
}

const menuItem: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'flex-start',
  gap: 1,
  width: '100%',
  padding: '8px 12px',
  background: 'transparent',
  border: 'none',
  borderBottom: '1px solid rgba(255, 255, 255, 0.07)',
  color: '#f2f2f5',
  font: 'inherit',
  textAlign: 'left',
  cursor: 'pointer',
}

const menuLink: React.CSSProperties = { textDecoration: 'none' }

const menuEmail: React.CSSProperties = { opacity: 0.5, fontSize: 11 }

const errorBox: React.CSSProperties = {
  marginBottom: 6,
  maxWidth: 280,
  padding: '6px 10px',
  borderRadius: 8,
  background: 'rgba(180, 35, 35, 0.95)',
  color: '#fff',
}
