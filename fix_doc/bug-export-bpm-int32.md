# Bug: error Int32 en Bizagi al abrir `.bpm` exportado

**Estado:** corregido (rama `import/export-bpm`)
**Fecha:** 2026-07-07
**Archivo afectado:** `src/utils/bpmExport.ts`
**Bizagi Modeler afectado:** 4.3.x (probado en 4.3.0.008), en Windows con configuración regional española

---

## Síntoma

Al abrir en Bizagi Modeler un `.bpm` exportado desde mc modeler, Bizagi mostraba:

> **Error guardando Modelo:**
> Valor demasiado grande o demasiado pequeño para Int32.

El diagrama podía llegar a renderizarse, pero Bizagi fallaba al guardar/re-serializar el modelo, dejando el archivo inutilizable dentro de Bizagi.

En cambio, exportar el mismo diagrama como `.bpmn` e importarlo desde el menú *Exportar/Importar → BPMN* de Bizagi funcionaba sin problema (ruta de código distinta en Bizagi, parseo estándar BPMN insensible a cultura).

## Causa

Nuestro export `.bpm` genera el `Diagram.xml` (XPDL 2.2) copiando las coordenadas del DI de bpmn-js **sin redondear**. bpmn-js produce con frecuencia valores fraccionarios — medición de texto, auto-layout, resize — como `272.5` o `242.16666666666666`, y esos valores se escribían tal cual en los atributos del XML.

El problema está en cómo Bizagi lee ciertos atributos:

| Atributo del `Diagram.xml` | Cómo lo lee Bizagi | ¿Decimales seguros? |
|---|---|---|
| `XCoordinate`, `YCoordinate`, `Width`, `Height` | como `double`, parseo insensible a cultura | ✅ |
| `TextX`, `TextY`, `TextWidth`, `TextHeight` | como texto, parseo **con la cultura regional del usuario** | ❌ |
| Colores ARGB (`BorderColor`, `FillColor`, …) | entero | ✅ (ya se emitían enteros) |

Los atributos `Text*` (posición y tamaño de las etiquetas de texto) se parsean con la configuración regional de Windows. En regional español el punto `.` es **separador de miles**, no decimal. Consecuencia:

```
"242.16666666666666"  →  Bizagi lo lee como 24 216 666 666 666 666  (≈ 2.4e16)
"242.5"               →  Bizagi lo lee como 2425
```

La carga no crashea (el valor inflado cabe en `float`), pero al **guardar**, Bizagi convierte esas posiciones de texto a `Int32` — y `2.4e16` desborda el rango de Int32 (máx ±2.147e9) → `OverflowException` → el diálogo de error.

Dos modos de fallo según el valor:

- **Decimal largo** (`242.1666…`) → valor gigante → crash al guardar.
- **Decimal corto** (`242.5`) → no crashea, pero la etiqueta queda desplazada (posición 2425 en vez de 242.5) — corrupción silenciosa.

Bizagi mismo siempre escribe estos atributos como enteros; el formato `.bpm` de facto **no admite decimales en `Text*`**.

## Solución

Redondear a entero **todos** los valores numéricos de geometría en el punto de entrada del parser, de modo que todo lo derivado (offsets de etiqueta, coordenadas relativas al pool, waypoints) quede entero automáticamente.

En `src/utils/bpmExport.ts`:

```ts
// Redondeo a entero de coordenadas/tamaños del DI. Bizagi parsea TextX/TextY/
// TextWidth/TextHeight con Convert.ToSingle en CULTURA ACTUAL (regional español:
// "." = separador de miles → "242.16" se lee como 24216… → OverflowException en
// Convert.ToInt32 al guardar: "Valor demasiado grande o demasiado pequeño para
// Int32"). Bizagi mismo siempre escribe estos atributos como enteros. Ver
// .syntesis/Export bpm - Int32 overflow/findings.md
const num = (v: string | null): number => Math.round(parseFloat(v ?? '0'))
```

Aplicado en los tres puntos donde `parseBpmnXml` lee el DI del BPMN de origen:

1. **Bounds de shapes** (`dc:Bounds` de cada `BPMNShape`) — x, y, width, height.
2. **Bounds de labels** (`bpmndi:BPMNLabel > dc:Bounds`).
3. **Waypoints de edges** (`di:waypoint` de cada `BPMNEdge`).

Con los inputs enteros, todos los valores emitidos al `Diagram.xml` son enteros: los `Text*` que crasheaban, y también coordenadas/tamaños (que toleraban decimales, pero redondearlos no daña y simplifica el invariante: *todo número de geometría en `Diagram.xml` es entero*).

### Por qué redondear y no "formatear mejor"

- No existe formato decimal que sobreviva a la vez regional español e inglés en el parser de `Text*` de Bizagi — la cultura la decide la máquina del usuario, no el archivo.
- El modelo interno de Bizagi almacena posiciones de texto como `Int32`; los decimales no son representables.
- Pérdida máxima: ±0.5 px por elemento — invisible. Las fracciones de bpmn-js son ruido de medición, sin valor semántico.

## Alcance

- Solo afecta al export `.bpm` (`exportToBpm`). El export `.bpmn` no cambia y conserva sus decimales (el estándar BPMN los admite).
- Sin cambios de API ni de UI.

## Verificación

- `npx tsc --noEmit` limpio.
- `npx vitest run`: 53/53 tests pasan.
- Grep de emisiones: ningún valor fraccionario restante llega al XML (la única división `/2` que queda es una comparación interna de centros para milestones, no se serializa).
- Prueba manual pendiente de confirmar por el equipo: exportar diagrama con labels reposicionadas → abrir `.bpm` en Bizagi (regional español) → guardar sin error.

## Referencias

- Análisis técnico completo del comportamiento de Bizagi (con trazabilidad): `.syntesis/Export bpm - Int32 overflow/findings.md`
