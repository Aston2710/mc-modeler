// Empaqueta el servidor MCP.
//
//   node scripts/build.mjs          → .vercel/output (Build Output API de Vercel)
//   node scripts/build.mjs --local  → dist/local.mjs (servidor para el laboratorio)
//
// Se empaqueta con esbuild y no con el compilador de funciones de Vercel porque
// el servidor importa el núcleo de dominio de la app (../src/domain/bpmn-model),
// que usa el alias `@/` y JSON. Así lo que corre desplegado es exactamente lo
// que se probó en local.
//
// En Vercel: proyecto aparte con Root Directory = mcp/, Build Command =
// `npm run build`, y "Include files outside the Root Directory" ACTIVADO (el
// núcleo vive en ../src). No requiere ninguna clave secreta.

import { build } from 'esbuild'
import { mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const local = process.argv.includes('--local')

const comun = {
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  sourcemap: false,
  legalComments: 'none',
  // El núcleo de la app usa `@/` (normalizeBpmnXml) y resuelve dependencias
  // desde mcp/node_modules aunque el archivo esté en ../src.
  alias: { '@': resolve(raiz, '../src') },
  nodePaths: [join(raiz, 'node_modules')],
  // `import.meta.env` es de Vite; en el servidor no existe.
  define: { 'import.meta.env': '{}' },
  banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
  logLevel: 'warning',
}

if (local) {
  await build({ ...comun, entryPoints: [join(raiz, 'src/local.ts')], outfile: join(raiz, 'dist/local.mjs') })
  console.log('dist/local.mjs listo')
} else {
  const salida = join(raiz, '.vercel/output')
  rmSync(salida, { recursive: true, force: true })
  const func = join(salida, 'functions/mcp.func')
  mkdirSync(func, { recursive: true })
  await build({ ...comun, entryPoints: [join(raiz, 'src/vercel.ts')], outfile: join(func, 'index.mjs') })
  writeFileSync(join(func, '.vc-config.json'), JSON.stringify({
    runtime: 'nodejs22.x',
    handler: 'index.mjs',
    launcherType: 'Nodejs',
    shouldAddHelpers: false,
    maxDuration: 60,
    memory: 1024,
  }, null, 2))
  // Una sola función atiende todas las rutas. Cada ruta lleva además `_r`,
  // porque no está garantizado que la función vea la ruta original tras el
  // rewrite; app.ts despacha por cualquiera de las dos.
  writeFileSync(join(salida, 'config.json'), JSON.stringify({
    version: 3,
    routes: [
      { src: '^/\\.well-known/oauth-protected-resource(?:/.*)?$', dest: '/mcp?_r=prm' },
      { src: '^/mcp/?$', dest: '/mcp' },
      { src: '^/$', dest: '/mcp?_r=raiz' },
      { src: '^/(.*)$', dest: '/mcp?_r=404' },
    ],
  }, null, 2))
  console.log('.vercel/output listo')
}
