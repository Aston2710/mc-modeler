# Flag `flujo:tabsCache` — operación (encender/apagar el multicanva)

**Qué controla:** el cache de instancias bpmn-js por pestaña (Fase 2, "canvas B").
- **ON** (default actual): 1 modeler vivo por diagrama, cambio de pestaña con
  `detach`/`attachTo` (sin re-importar, ~100× más rápido).
- **OFF** (killswitch): canvas único, `importXML` en cada cambio (comportamiento
  previo, probado).

Definido en `src/bpmn/modelerCache.ts` → `isTabsCacheEnabled()`.
Se lee al **montar el editor** → cualquier cambio requiere **recargar la página**.

---

## 1. Cambiarlo para MÍ (mi navegador) — sin deploy

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

## 2. Cambiar el DEFAULT de todos — editar código + redeploy

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

---

## Notas
- Precedencia: si un navegador tiene la clave `flujo:tabsCache` seteada a mano,
  **ignora el default global** hasta borrarla (`localStorage.removeItem('flujo:tabsCache')`).
- El fix de corrupción NaN (guardas de import/export/reglas de conexión) es
  **independiente del flag** y aplica siempre, ON u OFF.
- Diseño y fases: ver `fix_doc/tab-switching-instancia-viva.md`.
- Checkpoint pendiente: verificación de colaboración multiusuario en nube con el
  flag ON (co-edición + comentarios al cambiar de pestaña).
