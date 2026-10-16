import { describe, expect, it } from 'vitest'
import { construirXml } from './construirXml'
import type { ModeloSemantico } from './modelo'
import { bloqueSugerencias, formaDesaconsejada, sugerenciasGuia } from './sugerenciasGuia'

const LIMPIO: ModeloSemantico = {
  pools: [{
    id: 'Compras', nombre: 'Compras',
    carriles: [{ id: 'sol', nombre: 'Solicitante' }, { id: 'fin_c', nombre: 'Finanzas' }],
    nodos: [
      { id: 'ini', tipo: 'inicio', nombre: 'Necesidad detectada', carril: 'sol' },
      { id: 'pide', tipo: 'tarea_usuario', nombre: 'Registra la solicitud', carril: 'sol' },
      { id: 'aprueba', tipo: 'tarea', nombre: 'Revisa presupuesto', carril: 'fin_c' },
      { id: 'ok', tipo: 'compuerta_exclusiva', nombre: '¿Aprobada?', carril: 'fin_c' },
      { id: 'emite', tipo: 'tarea', nombre: 'Emite la orden', carril: 'fin_c' },
      { id: 'rechaza', tipo: 'tarea', nombre: 'Notifica el rechazo', carril: 'fin_c' },
      { id: 'f1', tipo: 'fin', nombre: 'Orden emitida', carril: 'fin_c' },
      { id: 'f2', tipo: 'fin', nombre: 'Solicitud rechazada', carril: 'fin_c' },
    ],
  }],
  flujos: [
    { desde: 'ini', hasta: 'pide' },
    { desde: 'pide', hasta: 'aprueba' },
    { desde: 'aprueba', hasta: 'ok' },
    { desde: 'ok', hasta: 'emite', nombre: 'Sí' },
    { desde: 'ok', hasta: 'rechaza', nombre: 'No' },
    { desde: 'emite', hasta: 'f1' },
    { desde: 'rechaza', hasta: 'f2' },
  ],
}

const CON_FALTAS: ModeloSemantico = {
  pools: [{
    id: 'P', nombre: 'Proceso',
    nodos: [
      { id: 'ini', tipo: 'inicio', nombre: 'Inicio' },
      { id: 'validar', tipo: 'tarea', nombre: 'Validar factura' },
      { id: 'registrando', tipo: 'tarea_servicio', nombre: 'Registrando el pago' },
      { id: 'largo', tipo: 'tarea', nombre: 'Revisa la factura y comprueba que el proveedor esté dado de alta' },
      { id: 'g', tipo: 'compuerta_exclusiva', nombre: '¿Correcta?' },
      { id: 'fin', tipo: 'fin', nombre: 'Fin' },
    ],
  }],
  flujos: [
    { desde: 'ini', hasta: 'validar' },
    { desde: 'validar', hasta: 'registrando' },
    { desde: 'registrando', hasta: 'largo' },
    { desde: 'largo', hasta: 'g' },
    { desde: 'g', hasta: 'fin', nombre: 'No' },
  ],
}

describe('formaDesaconsejada', () => {
  it('acepta verbos en 3.ª persona', () => {
    for (const n of ['Valida factura', 'Registra el pago', 'Envía notificación', 'Realiza autenticación', 'Emite la orden']) {
      expect(formaDesaconsejada(n), n).toBeNull()
    }
  })

  it('detecta las formas que la guía desaconseja', () => {
    expect(formaDesaconsejada('Consumir API')).toBe('infinitivo')
    expect(formaDesaconsejada('Revisar solicitud')).toBe('infinitivo')
    expect(formaDesaconsejada('Registrando el pago')).toBe('gerundio')
    expect(formaDesaconsejada('Validación de factura')).toBe('sustantivo')
    expect(formaDesaconsejada('Se autentica')).toContain('reflexivo')
  })
})

describe('sugerenciasGuia', () => {
  it('un diagrama que sigue la guía no produce sugerencias', async () => {
    const { xml } = await construirXml(LIMPIO)
    expect(await sugerenciasGuia(xml)).toEqual([])
    expect(bloqueSugerencias([], true)).toBeUndefined()
  })

  it('señala nombres de tarea, tareas largas y compuertas que van al fin', async () => {
    const { xml } = await construirXml(CON_FALTAS)
    const s = await sugerenciasGuia(xml)
    const por = (regla: string) => s.filter((x) => x.regla === regla).map((x) => x.elemento_id)
    expect(por('nombre_tarea_forma').sort()).toEqual(['registrando', 'validar'])
    expect(por('nombre_tarea_largo')).toEqual(['largo'])
    expect(por('compuerta_a_fin')).toHaveLength(1)
  })

  it('el bloque deja claro que no son errores y que manda el usuario', async () => {
    const { xml } = await construirXml(CON_FALTAS)
    const bloque = bloqueSugerencias(await sugerenciasGuia(xml), true)!
    expect(bloque.nota).toMatch(/no son errores/)
    expect(bloque.nota).toMatch(/si el usuario no pidió expresamente otra cosa/)
    expect(bloque.items.length).toBeGreaterThan(0)
  })
})
