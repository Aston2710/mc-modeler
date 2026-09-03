/**
 * Los avisos del saneo del guardado resuelven de verdad (PLAN-035).
 *
 * No es una prueba de cortesía: en todo el resto del proyecto los plurales se
 * llaman por su clave `_other` explícita, así que había que comprobar que la
 * pluralización por `count` funciona antes de confiar en ella. Si no resolviera,
 * el usuario vería la clave cruda —`errors.modelRepaired`— en el toast justo en
 * el momento en que su diagrama acaba de repararse: el peor momento posible
 * para enseñar algo ilegible.
 */
import { describe, it, expect } from 'vitest'
import i18n from './index'

describe('avisos de reparación del modelo', () => {
  it('el título existe en los dos idiomas', async () => {
    await i18n.changeLanguage('es')
    expect(i18n.t('errors.modelRepairedTitle')).not.toBe('errors.modelRepairedTitle')
    await i18n.changeLanguage('en')
    expect(i18n.t('errors.modelRepairedTitle')).not.toBe('errors.modelRepairedTitle')
    await i18n.changeLanguage('es')
  })

  it('la pluralización por count resuelve, en singular y en plural', () => {
    const uno = i18n.t('errors.modelRepaired', { count: 1 })
    const varios = i18n.t('errors.modelRepaired', { count: 3 })

    expect(uno).not.toContain('modelRepaired')
    expect(varios).not.toContain('modelRepaired')
    expect(uno).not.toBe(varios)
    expect(varios).toContain('3')
  })

  it('el aviso con pérdida interpola las dos cifras', () => {
    const msg = i18n.t('errors.modelRepairedWithLoss', { repaired: 2, removed: 1 })
    expect(msg).not.toContain('modelRepairedWithLoss')
    expect(msg).toContain('2')
    expect(msg).toContain('1')
  })
})
