---
documento: flags-operacion
vigencia: vigente
actualizado: 2026-08-21
deriva_de: [PLAN-005, PLAN-012]
---

# Flags de operación

Los tres flags que existen hoy. Todos viven en `localStorage`, con el prefijo
`flujo:`, y **se cambian por navegador sin desplegar**.

| Flag | Qué controla | Default | Definido en |
|---|---|---|---|
| `flujo:tabsCache` | cache de instancias bpmn-js por pestaña (el multicanva) | **ON** | `src/bpmn/modelerCache.ts` → `isTabsCacheEnabled()` |
| `flujo:perf` | instrumentación de rendimiento en `window.__flujoPerf` | OFF en producción, **ON en dev** | `src/utils/perf.ts` |
| `flujo:noBgSave` | fuerza el guardado esperado en el cambio de pestaña (solo para medir A/B) | OFF | `src/App.tsx` |

> El prefijo `flujo:` se usa **también** para las claves de datos de
> `LocalRepository` (`flujo:diagrams`, `flujo:projects`…), para las de traspaso
> entre vistas (`flujo:pendingInvite`, `flujo:pendingOpenDiagram`…) y para los
> atributos de extensión del XML (`flujo:phaseColor`, `flujo:linkedImages`…).
> **Solo los tres de la tabla son flags de operación.** Buscar `flujo:` en el
> código devuelve muchas más cosas que flags.

---

## `flujo:tabsCache` — encender/apagar el multicanva

- **ON** (default actual): 1 modeler vivo por diagrama, cambio de pestaña con
  `detach`/`attachTo` (sin re-importar, ~100× más rápido).
- **OFF** (killswitch): canvas único, `importXML` en cada cambio (comportamiento
  previo, probado).

Se lee al **montar el editor** → cualquier cambio requiere **recargar la página**.

### 1. Cambiarlo para MÍ (mi navegador) — sin deploy

Consola del navegador (F12 → Console), estando en la app:

```js
// Apagar (killswitch personal → canvas único):
localStorage.setItem('flujo:tabsCache','0'); location.reload()

// Volver al default (ON):
localStorage.removeItem('flujo:tabsCache'); location.reload()

// Forzar ON explícito:
localStorage.setItem('flujo:tabsCache','1'); location.reload()
```

- Alcance: **solo ese navegador/perfil**. No afecta a nadie más.
- Uso: si a un usuario se le buguea, apaga al instante sin esperar redeploy.

### 2. Cambiar el DEFAULT de todos — editar código + redeploy

En `src/bpmn/modelerCache.ts`:

```ts
export function isTabsCacheEnabled(): boolean {
  if (typeof localStorage === 'undefined') return false
  return localStorage.getItem('flujo:tabsCache') !== '0'   // default ON (actual)
  // return localStorage.getItem('flujo:tabsCache') === '1' // default OFF
}
```

- Default **ON** (hoy): `!== '0'` → todos ON salvo quien puso `'0'`.
- Default **OFF**: `=== '1'` → todos OFF salvo quien puso `'1'`.
- Requiere **commit + push + redeploy**. Afecta a todos.

### Notas

- Precedencia: si un navegador tiene la clave `flujo:tabsCache` seteada a mano,
  **ignora el default global** hasta borrarla (`localStorage.removeItem('flujo:tabsCache')`).
- El fix de corrupción NaN (guardas de import/export/reglas de conexión) es
  **independiente del flag** y aplica siempre, ON u OFF.
- Diseño, fases y auditoría: [`plans/todo/005-cambio-de-pestanas-con-instancia-viva.md`](../plans/todo/005-cambio-de-pestanas-con-instancia-viva.md).
- Checkpoint pendiente: verificación de colaboración multiusuario en nube con el
  flag ON (co-edición + comentarios al cambiar de pestaña).

---

## `flujo:perf` — instrumentación de rendimiento

Mide los caminos calientes: apertura de diagrama, cambio de pestaña,
`importXML`, guardado (export + thumbnail + persistencia) y conexión de
colaboración. Los resultados se acumulan en memoria y se exponen en
`window.__flujoPerf`.

```js
localStorage.setItem('flujo:perf','1'); location.reload()
// ...usar la app...
window.__flujoPerf        // entradas y estadísticas (count, min, max, avg, p50, p95)
```

Activo automáticamente en dev (`import.meta.env.DEV`). **En producción sin el
flag el coste es cero**: `perfStart` devuelve un no-op.

Es la herramienta con la que se mide antes de optimizar — la regla de
[`rendimiento-base-de-datos.md`](rendimiento-base-de-datos.md) y de la parte B
de [PLAN-012](../plans/todo/012-thumbnails-webp-y-entrega-segura.md): baseline
primero, cambio después.

---

## `flujo:noBgSave` — comparar guardado en background contra guardado esperado

Solo para **medición A/B en la misma build**. Con el flag ausente (uso normal),
el cambio de pestaña captura XML + thumbnail y devuelve, dejando la escritura al
repositorio fuera del camino crítico. Con `'1'` se vuelve al comportamiento
previo, esperando el guardado completo.

```js
localStorage.setItem('flujo:noBgSave','1'); location.reload()   // comportamiento previo
localStorage.removeItem('flujo:noBgSave');   location.reload()   // background (normal)
```

No es un killswitch de producto: existe para poder medir la diferencia sin
cambiar de build. Si algún día deja de usarse para medir, se borra.
