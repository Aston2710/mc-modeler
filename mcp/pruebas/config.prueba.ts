import { describe, expect, it } from 'vitest'
import { leerConfig } from '../src/config'

const BASE = { SUPABASE_URL: 'https://x.supabase.co/', SUPABASE_ANON_KEY: 'anon' }

describe('leerConfig', () => {
  it('en local MCP_PUBLIC_URL puede faltar', () => {
    expect(leerConfig(BASE).publicUrl).toBeUndefined()
  })

  it('desplegado exige MCP_PUBLIC_URL (revisión del PR #1, R6)', () => {
    expect(() => leerConfig({ ...BASE, VERCEL: '1' })).toThrow(/MCP_PUBLIC_URL/)
    expect(() => leerConfig({ ...BASE, NODE_ENV: 'production' })).toThrow(/MCP_PUBLIC_URL/)
  })

  it('desplegado exige https', () => {
    expect(() => leerConfig({ ...BASE, VERCEL: '1', MCP_PUBLIC_URL: 'http://mcp.example.com' })).toThrow(/https/)
  })

  it('desplegado con la URL, la normaliza', () => {
    const c = leerConfig({ ...BASE, VERCEL: '1', MCP_PUBLIC_URL: 'https://mcp.example.com/' })
    expect(c.publicUrl).toBe('https://mcp.example.com')
    expect(c.supabaseUrl).toBe('https://x.supabase.co')
    expect(c.habilitarModificar).toBe(false)
  })
})
