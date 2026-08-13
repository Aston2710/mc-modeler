#!/usr/bin/env node
/**
 * Arranca el laboratorio: stack de Supabase en Docker + la app en el puerto
 * 7654 apuntando a esa base local.
 *
 * Existe en vez de un `&&` en package.json por una sola razon: si el
 * laboratorio YA esta corriendo, `vite` moria con "Port 7654 is already in
 * use" y un volcado de pila, que se lee como si algo se hubiera roto cuando en
 * realidad todo esta bien. Aqui se detecta antes y se dice lo que pasa.
 *
 * `strictPort` se mantiene a proposito: preferimos fallar a arrancar en un
 * puerto aleatorio, porque el sitio del laboratorio tiene que ser siempre el
 * mismo.
 */
import { spawn } from 'node:child_process'
import { createConnection } from 'node:net'

const PORT = 7654
const URL = `http://localhost:${PORT}`

/** ¿Hay algo escuchando ya en el puerto? */
function portInUse(port) {
  return new Promise((resolve) => {
    const socket = createConnection({ port, host: '127.0.0.1' })
    const done = (inUse) => {
      socket.destroy()
      resolve(inUse)
    }
    socket.setTimeout(1000)
    socket.once('connect', () => done(true))
    socket.once('timeout', () => done(false))
    socket.once('error', () => done(false))
  })
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'inherit', shell: true })
    child.on('error', reject)
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`${command} salió con código ${code}`))))
  })
}

const busy = await portInUse(PORT)
if (busy) {
  console.log('')
  console.log(`  El laboratorio ya está corriendo en ${URL}`)
  console.log('')
  console.log('  Ábrelo en el navegador. Para reiniciarlo, cierra antes la terminal')
  console.log('  donde lo lanzaste (o Ctrl+C en ella).')
  console.log('')
  process.exit(0)
}

await run('npx', ['supabase', 'start'])
await run('npx', ['vite', '--mode', 'lab'])
