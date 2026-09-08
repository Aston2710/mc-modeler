---
id: EXP-024
titulo: La raya del hueco del título salía como «â€”» — index.css tiene tramos con doble codificación
estado: resuelto
severidad: baja
fecha_deteccion: 2026-09-07
fecha_cierre: 2026-09-07
componentes: [src/index.css]
relacionados: [EXP-023, PLAN-034]
---

# La raya del hueco salía como mojibake

## Síntoma

Con la cabecera ya visible en el lienzo (EXP-023), un documento **sin datos**
enseñaba en la celda del título `â€”` en vez de la raya `—`. Las filas de la
derecha —Código, Fecha, Revisión— sí mostraban su raya bien.

## Causa

La diferencia entre las dos rayas es de dónde salen:

- Las de las filas las escribe JavaScript (`DocumentFrameModule._rowsCell`,
  `val.textContent = dato || '—'`), y el `.ts` está bien codificado.
- La del título la pone **CSS**: `.doc-frame__cell--title.is-empty::after
  { content: '…' }`. Y ahí el fichero tenía los bytes mal.

`â€”` es la firma exacta de una **doble codificación**: los tres bytes UTF-8 de
`—` (`E2 80 94`) leídos como Windows-1252 dan `â`, `€`, `”`, y eso se volvió a
guardar como UTF-8. Alguna herramienta reescribió el fichero decidiendo la
codificación por su cuenta — el sospechoso natural en este entorno es un
`Set-Content`/`Out-File` de PowerShell sin `-Encoding utf8`.

**No es un carácter suelto: son 2 845 secuencias en `src/index.css`.** Casi todas
están en comentarios —incluidas las cenefas `═══` de las secciones, que se ven
como `â•â•â•`— y por eso nadie lo había notado: un comentario mal codificado no
se pinta en ninguna pantalla. La única cadena de todo el fichero que el usuario
llega a **ver** es esta, y por eso es la única que dio la cara.

## Arreglo

```css
.doc-frame__cell--title.is-empty::after { content: '\2014'; font-weight: 400; }
```

Escape CSS en vez de carácter literal. Es **ASCII puro**, así que ninguna
herramienta que reescriba el fichero con la codificación equivocada lo puede
volver a romper. Verificado en el bundle de `npm run build`: la regla sale con
la raya correcta.

## Lo que NO se hizo, y por qué

**Arreglar los 2 845 de golpe no es seguro, y está medido.** La conversión
mecánica sería `original = UTF8.GetString(CP1252.GetBytes(texto))`, pero al
probarla en seco falla: el byte `E1` de la posición 138 776 no es UTF-8 válido
después de la vuelta. Es decir, **el fichero tiene tramos bien codificados
mezclados con tramos mal codificados**, y una conversión a ciegas rompería los
buenos para arreglar los malos.

Queda como limpieza pendiente, tramo a tramo, sin urgencia: lo que sobra son
comentarios. Lo que importaba —la única cadena visible— está cerrado y además
blindado.

## Prevención

**En CSS, cualquier `content:` con algo fuera de ASCII se escribe como escape.**
Es la única forma de que el texto que ve el usuario no dependa de con qué
codificación se guardó el fichero. Comprobación de un vistazo:

```powershell
Select-String -Path src/index.css -Pattern 'content\s*:' | Where-Object { $_.Line -match '[^\x00-\x7F]' }
```

Hoy no devuelve nada, y ese es el estado que hay que mantener.

**Y una regla de operación, porque esto lo produjo una herramienta y no una
persona:** en Windows, reescribir un fichero del repositorio con PowerShell
exige `-Encoding utf8` explícito. Los ficheros del proyecto son UTF-8; el valor
por defecto de PowerShell 5 no lo es.
