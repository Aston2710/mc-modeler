// Pruebas del servidor MCP. Se ejecutan con el vitest del repo raíz
// (`npm test` dentro de mcp/), pero con esta configuración: el sufijo
// `.prueba.ts` las deja fuera del `npm run test` de la SPA, que así no depende
// de que mcp/ tenga sus dependencias instaladas.
import { fileURLToPath } from 'node:url'

export default {
  resolve: { alias: { '@': fileURLToPath(new URL('../src', import.meta.url)) } },
  test: {
    include: ['pruebas/**/*.prueba.ts'],
    environment: 'node',
    testTimeout: 60_000,
    hookTimeout: 120_000,
    fileParallelism: false,
  },
}
