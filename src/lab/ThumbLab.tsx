/**
 * Banco de pruebas de thumbnails — comparar ajustes de definicion a ojo.
 *
 * SOLO existe en `npm run lab`, detras de la misma puerta de MODE que LabBar y
 * thumbForge: en el build de produccion rollup descarta el modulo entero.
 *
 * POR QUE EXISTE. Los ajustes de nitidez (densidad, calidad, supermuestreo) no
 * se pueden decidir con numeros: 14 kB no dice si el texto se lee. El script
 * `backfill-thumbs.mjs --comparar` guarda variantes en disco, pero obliga a
 * salir de la app, abrir ficheros y compararlos por separado. Esto las pone una
 * al lado de otra, **al tamaño real de la tarjeta**, que es donde hay que
 * juzgarlas.
 *
 * Renderiza con `window.__thumbForge`, el mismo camino que usara el backfill —
 * no una ruta paralela que pueda verse mejor aqui que en el resultado real.
 */
import { useEffect, useMemo, useState } from 'react'
import { useDiagramStore } from '@/store/diagramStore'
import { THUMB_BOX } from '@/utils/thumbnailUtils'
import type { ForgeOverrides } from './thumbForge'

interface Variante {
  etiqueta: string
  nota: string
  ov: ForgeOverrides
}

/** Las mismas seis que usa `scripts/backfill-thumbs.mjs --comparar`. */
const VARIANTES: Variante[] = [
  { etiqueta: 'actual', nota: 'dpr 3 · q .92 · ss 2', ov: { dpr: 3, quality: 0.92, supersample: 2 } },
  { etiqueta: 'sin supermuestreo', nota: 'dpr 3 · q .92 · ss 1', ov: { dpr: 3, quality: 0.92, supersample: 1 } },
  { etiqueta: 'mas supermuestreo', nota: 'dpr 3 · q .92 · ss 3', ov: { dpr: 3, quality: 0.92, supersample: 3 } },
  { etiqueta: 'mas calidad', nota: 'dpr 3 · q .98 · ss 2', ov: { dpr: 3, quality: 0.98, supersample: 2 } },
  { etiqueta: 'mas denso', nota: 'dpr 4 · q .92 · ss 2', ov: { dpr: 4, quality: 0.92, supersample: 2 } },
  { etiqueta: 'menos denso', nota: 'dpr 2 · q .92 · ss 2', ov: { dpr: 2, quality: 0.92, supersample: 2 } },
]

interface Render {
  etiqueta: string
  nota: string
  url: string
  bytes: number
  ancho: number
  alto: number
}

export default function ThumbLab() {
  const [abierto, setAbierto] = useState(false)
  const diagrams = useDiagramStore((s) => s.diagrams)
  const activeTabId = useDiagramStore((s) => s.activeTabId)
  const ensureXml = useDiagramStore((s) => s.ensureXml)

  // Los grandes primero: la definicion se juzga en un diagrama denso, no en uno
  // de tres cajas. `element_count` es el proxy que ya trae la lista.
  const ordenados = useMemo(
    () => [...diagrams].sort((a, b) => (b.elementCount ?? 0) - (a.elementCount ?? 0)),
    [diagrams]
  )

  const [sel, setSel] = useState<string>('')
  const [renders, setRenders] = useState<Render[]>([])
  const [estado, setEstado] = useState<'listo' | 'trabajando' | string>('listo')
  const [escala, setEscala] = useState<'tarjeta' | 'real'>('tarjeta')

  useEffect(() => {
    if (!sel) setSel(activeTabId || ordenados[0]?.id || '')
  }, [sel, activeTabId, ordenados])

  async function comparar() {
    const forge = window.__thumbForge
    if (!forge) {
      setEstado('window.__thumbForge no esta cargado')
      return
    }
    if (!sel) return
    setEstado('trabajando')
    setRenders([])
    try {
      const xml = await ensureXml(sel)
      const out: Render[] = []
      for (const v of VARIANTES) {
        const r = await forge.render(xml, v.ov)
        out.push({
          etiqueta: v.etiqueta,
          nota: v.nota,
          url: r.dataUrl,
          bytes: r.bytes,
          ancho: r.ajustes.width,
          alto: r.ajustes.height,
        })
        // Se pinta cada una en cuanto sale: con un diagrama grande, seis
        // renders seguidos tardan lo suyo y ver la primera enseguida ayuda.
        setRenders([...out])
      }
      setEstado('listo')
    } catch (e) {
      setEstado(String((e as Error).message || e))
    }
  }

  if (!abierto) {
    return (
      <button style={{ ...botonFlotante, ...bar }} onClick={() => setAbierto(true)}>
        <span style={tag}>THUMBS</span> comparar definicion
      </button>
    )
  }

  return (
    <div style={panel}>
      <div style={cabecera}>
        <span style={tag}>THUMBS</span>
        <select value={sel} onChange={(e) => setSel(e.target.value)} style={select}>
          {ordenados.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name} · {d.elementCount ?? 0} elementos
            </option>
          ))}
        </select>
        <button style={boton} onClick={comparar} disabled={estado === 'trabajando'}>
          {estado === 'trabajando' ? 'renderizando…' : 'comparar'}
        </button>
        <button
          style={boton}
          onClick={() => setEscala(escala === 'tarjeta' ? 'real' : 'tarjeta')}
          title="La tarjeta de la portada mide 300×140 CSS. Juzga ahi, no al 100 %."
        >
          {escala === 'tarjeta' ? 'ver 1:1' : 'ver como tarjeta'}
        </button>
        <button style={{ ...boton, marginLeft: 'auto' }} onClick={() => setAbierto(false)}>
          cerrar
        </button>
      </div>

      {estado !== 'listo' && estado !== 'trabajando' && <div style={error}>{estado}</div>}

      <div style={rejilla}>
        {renders.map((r) => (
          <div key={r.etiqueta} style={celda}>
            <div style={celdaTitulo}>
              {r.etiqueta}
              <span style={celdaNota}>
                {r.nota} — {r.ancho}×{r.alto} · {(r.bytes / 1024).toFixed(1)} kB
              </span>
            </div>
            <div
              style={
                escala === 'tarjeta'
                  ? { ...marco, width: THUMB_BOX.width, height: THUMB_BOX.height }
                  : { ...marco, width: 'auto', height: 'auto', maxWidth: '100%' }
              }
            >
              <img
                src={r.url}
                alt={r.etiqueta}
                style={
                  escala === 'tarjeta'
                    ? { maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }
                    : { display: 'block' }
                }
              />
            </div>
          </div>
        ))}
      </div>

      {renders.length === 0 && estado === 'listo' && (
        <div style={pista}>
          Elige un diagrama y pulsa <b>comparar</b>. Se juzgan a tamaño de tarjeta:
          si una variante no se distingue de <i>actual</i>, no compensa pagarla.
        </div>
      )}
    </div>
  )
}

// Estilos en linea a proposito: este componente no debe dejar rastro en
// index.css, que es codigo de produccion.
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
  cursor: 'pointer',
  font: '12px system-ui, sans-serif',
}

const botonFlotante: React.CSSProperties = { position: 'fixed', bottom: 12, right: 12, zIndex: 99999 }

const panel: React.CSSProperties = {
  position: 'fixed',
  inset: '5% 4%',
  zIndex: 99999,
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
  padding: 12,
  borderRadius: 12,
  background: 'rgba(16, 16, 20, 0.97)',
  border: '1px solid rgba(255, 255, 255, 0.14)',
  boxShadow: '0 12px 40px rgba(0, 0, 0, 0.5)',
  color: '#f2f2f5',
  font: '12px system-ui, sans-serif',
  overflow: 'auto',
}

const cabecera: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 8 }

const tag: React.CSSProperties = { letterSpacing: 1.2, fontWeight: 700, fontSize: 10, color: '#f5a524' }

const select: React.CSSProperties = {
  font: 'inherit',
  padding: '4px 6px',
  borderRadius: 6,
  background: '#1f1f26',
  color: '#f2f2f5',
  border: '1px solid rgba(255,255,255,0.16)',
  maxWidth: 380,
}

const boton: React.CSSProperties = {
  font: 'inherit',
  padding: '4px 10px',
  borderRadius: 6,
  background: '#2a2a33',
  color: '#f2f2f5',
  border: '1px solid rgba(255,255,255,0.16)',
  cursor: 'pointer',
}

const rejilla: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 14,
  alignItems: 'flex-start',
}

const celda: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 4 }

const celdaTitulo: React.CSSProperties = { display: 'flex', flexDirection: 'column', fontWeight: 600 }

const celdaNota: React.CSSProperties = { fontWeight: 400, fontSize: 10.5, color: '#a8a8b3' }

// Mismo fondo y encuadre que `.diagram-thumb` de la portada, para que la
// comparacion sea contra lo que se vera de verdad.
const marco: React.CSSProperties = {
  display: 'grid',
  placeItems: 'center',
  overflow: 'hidden',
  background: '#0f0f13',
  border: '1px solid rgba(255,255,255,0.12)',
  borderRadius: 8,
}

const error: React.CSSProperties = { color: '#ff8f8f' }

const pista: React.CSSProperties = { color: '#a8a8b3', maxWidth: 560, lineHeight: 1.5 }
