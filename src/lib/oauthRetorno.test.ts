import { describe, expect, it } from 'vitest'
import { evaluarRetorno } from './oauthRetorno'

describe('evaluarRetorno', () => {
  it('reconoce el callback de Claude', () => {
    expect(evaluarRetorno('https://claude.ai/api/mcp/auth_callback')).toEqual({ host: 'claude.ai', conocido: true })
    expect(evaluarRetorno('https://claude.com/api/mcp/auth_callback').conocido).toBe(true)
  })

  it('acepta localhost solo en laboratorio o desarrollo', () => {
    expect(evaluarRetorno('http://localhost:6274/oauth/callback', true)).toEqual({ host: 'localhost:6274', conocido: true })
    expect(evaluarRetorno('http://127.0.0.1:6274/cb', true).conocido).toBe(true)
    expect(evaluarRetorno('http://[::1]:6274/cb', true).conocido).toBe(true)
  })

  it('en producción localhost no es un asistente conocido', () => {
    for (const uri of ['http://localhost:6274/cb', 'http://127.0.0.1:6274/cb', 'http://[::1]:6274/cb']) {
      expect(evaluarRetorno(uri, false).conocido, uri).toBe(false)
    }
  })

  it('avisa con un dominio ajeno aunque se parezca', () => {
    for (const uri of [
      'https://claude.ai.atacante.com/cb',
      'https://atacante.com/claude.ai',
      'https://evil-claude.ai/cb',
      'https://sub.claude.ai/cb',
    ]) {
      expect(evaluarRetorno(uri).conocido, uri).toBe(false)
    }
  })

  it('exige HTTPS fuera de local', () => {
    expect(evaluarRetorno('http://claude.ai/api/mcp/auth_callback').conocido).toBe(false)
  })

  it('una URI que no se puede analizar se enseña tal cual y no es conocida', () => {
    expect(evaluarRetorno('no es una url')).toEqual({ host: 'no es una url', conocido: false })
  })
})
