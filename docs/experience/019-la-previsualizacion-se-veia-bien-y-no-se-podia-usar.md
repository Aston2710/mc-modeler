---
id: EXP-019
titulo: La previsualización se veía bien y no se podía usar
estado: resuelto
severidad: media
fecha_deteccion: 2026-08-23
fecha_cierre: 2026-08-23
componentes: [src/components/modals/DocumentSheet.tsx, src/index.css, scripts/capturar-ui.mjs]
relacionados: [PLAN-034]
---

# La previsualización se veía bien y no se podía usar

## Síntoma

La Vista Documento de PLAN-034 salía perfecta en las capturas: la hoja acotada, el
cabecera con sus tres celdas, el diagrama encajado. Y no se podía editar nada.

Dos defectos distintos, los dos invisibles en una imagen fija:

1. **Los clics no llegaban a las celdas.** Playwright, al intentar pulsar una:

   ```
   <img alt="" class="sheet__diagram" src="blob:…"/> intercepts pointer events
     - retrying click action
   ```

2. **Solo se podía escribir una letra.** Al segundo carácter:

   ```
   elementHandle.press: Element is not attached to the DOM
   ```

## Causa

**El primero, orden de pintado.** La imagen del diagrama es un hermano posterior a
la banda de la cabecera dentro de la hoja, sin `z-index` ni `pointer-events`, así que
se quedaba los clics de cualquier celda que su caja cubriera. Con el diagrama
girado 90° su caja de maquetación tapa la banda entera y la edición era imposible
en toda la fila.

**El segundo, un componente declarado dentro de otro.** La celda editable vivía
como función dentro del cuerpo de `DocumentSheet`:

```tsx
export function DocumentSheet(...) {
  const [draft, setDraft] = useState('')
  const Editable = ({ field, value }) => { ... }   // ← una función NUEVA por render
  return <Editable … />
}
```

Cada pulsación cambia `draft`, `DocumentSheet` se vuelve a renderizar y `Editable`
es **una identidad de función distinta**. React compara tipos por identidad: al no
coincidir, no reconcilia el árbol — lo desmonta y monta otro. El `<input>` se
destruye y se crea de cero en cada tecla, y con él se va el foco. El
`useEffect(..., [editing])` que pedía el foco no volvía a dispararse, porque
`editing` no había cambiado.

Es un defecto de los que no fallan en ninguna prueba de render: el DOM final es
correcto en cada instante. Lo que está roto es la *continuidad* entre instantes.

## Fix

`pointer-events: none` en la imagen —es decoración— y `z-index: 1` en la banda,
para que el marco mande sobre el dibujo.

La celda editable sale al ámbito del módulo como `SheetField`, con el estado
entrando por props. El tipo pasa a ser estable y el `<input>` sobrevive a los
renders. El foco lo pide la propia celda al pasar a editarse, así que no hay una
referencia compartida entre celdas que haya que acertar a mover.

## Prevención

**Una captura de pantalla prueba que se ve, no que funciona.** Los dos defectos
sobrevivieron a una revisión de capturas y cayeron en cuanto un script *condujo*
la interfaz: pulsar, escribir, leer el resultado. Para cualquier función cuyo
valor sea la interacción —y una previsualización editable lo es por definición—,
la verificación tiene que incluir el gesto, no solo el pixel.

**Un componente nunca se declara dentro de otro** si va a usarse como etiqueta
(`<Componente />`). Si necesita cerrar sobre el estado del padre, o recibe ese
estado por props desde fuera, o se escribe como llamada a función que devuelve
JSX. La señal de alarma es un `useState` en el padre y un `<input>` controlado en
el hijo interno.

## Nota de método: un corte por marcadores necesita una guardia

Podando CSS huérfano con un script de la forma «borra desde el marcador A hasta
el marcador B», el `indexOf` de B encontró un bloque que se había añadido **al
final del fichero**, y se llevó por delante todo lo que había en medio: 1 100
líneas, 51 603 caracteres, la mayoría CSS preexistente que no tenía nada que ver.
El script informó alegremente de tres cortes correctos.

Se reconstruyó empalmando la cabeza del fichero con la cola del baseline
commiteado y volviendo a añadir lo nuevo, y se comprobó con un comparador que
**ninguna regla del baseline faltaba** y que toda clase usada en el código estaba
definida.

La regla que queda: **todo corte declara cuántas líneas espera llevarse y aborta
si se pasa.** Un marcador de cierre que no se encuentra donde se esperaba es
indistinguible de uno que aparece mil líneas más abajo, y sin cota superior el
script no puede notar la diferencia.

## Nota de método: las capturas no se escriben dentro del proyecto

`scripts/capturar-ui.mjs` guardaba los PNG en `capturas/`, dentro del repositorio.
El watcher de Vite veía aparecer cada fichero y **recargaba la página a media
sesión**: el modal se cerraba solo y los pasos siguientes fallaban sin explicar
por qué —una captura salió en blanco, otra en la pantalla equivocada, y el fallo
no era reproducible—. Ahora van al directorio temporal del sistema.

**Y volvió a pasar**, con la nota ya escrita: bastó editar un `.md` de `docs/`
mientras corría una sesión de capturas para perder cuatro pasos. Tener cuidado no
es una solución, así que la trampa se cerró en el sitio donde vive —
`vite.config.ts` ahora excluye del watcher `docs/` y las salidas de los scripts,
que nunca forman parte del grafo de módulos y por tanto no tienen ningún motivo
para provocar una recarga.

La regla general que queda: **cualquier herramienta que escriba en el árbol del
proyecto mientras el servidor de desarrollo está en marcha puede recargar la
página**. O escribe fuera, o su carpeta está en `server.watch.ignored`.
