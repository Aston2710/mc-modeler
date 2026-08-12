/**
 * colorPalette.ts — paleta de muestras del selector de color.
 *
 * Hex literales, no variables CSS: un color elegido por el usuario es una
 * decisión suya y debe verse igual en tema claro y oscuro, y exportarse tal cual
 * (ver la nota de `RENDERER_VARS` en `useExport.ts`).
 *
 * 12 columnas × 6 filas = 72 muestras. La rejilla es densa a propósito, estilo
 * draw.io: se elige con un clic sobre un color que se ve, sin rueda HSV ni
 * campos de matiz.
 */

/**
 * Fila destacada: los cinco colores de referencia de Bizagi. Se muestran aparte
 * porque son los que dan continuidad visual con los diagramas importados.
 *
 * **No tienen semántica.** Quien los use les da el significado que quiera.
 */
export const FEATURED_COLORS = [
  '#4CA22F', // verde
  '#2E86C8', // azul
  '#9130C4', // morado
  '#C81E1E', // rojo
  '#A89A16', // oliva
] as const

/** Primera fila: neutros, de blanco a negro. */
const GRAYS = [
  '#FFFFFF', '#F3F4F6', '#E5E7EB', '#D1D5DB', '#9CA3AF', '#6B7280',
  '#4B5563', '#374151', '#1F2937', '#111827', '#030712', '#000000',
]

/**
 * 12 matices × 5 niveles de luminosidad, de claro a oscuro. Las filas claras
 * sirven para rellenos; las oscuras, para bordes sobre fondo claro.
 */
const HUES = [
  // rojo      naranja    ámbar      amarillo   verde      esmeralda
  // teal      cian       azul       índigo     violeta    rosa
  ['#F87171', '#FB923C', '#FBBF24', '#FACC15', '#4ADE80', '#34D399',
   '#2DD4BF', '#22D3EE', '#60A5FA', '#818CF8', '#A78BFA', '#F472B6'],
  ['#EF4444', '#F97316', '#F59E0B', '#EAB308', '#22C55E', '#10B981',
   '#14B8A6', '#06B6D4', '#3B82F6', '#6366F1', '#8B5CF6', '#EC4899'],
  ['#DC2626', '#EA580C', '#D97706', '#CA8A04', '#16A34A', '#059669',
   '#0D9488', '#0891B2', '#2563EB', '#4F46E5', '#7C3AED', '#DB2777'],
  ['#B91C1C', '#C2410C', '#B45309', '#A16207', '#15803D', '#047857',
   '#0F766E', '#0E7490', '#1D4ED8', '#4338CA', '#6D28D9', '#BE185D'],
  ['#7F1D1D', '#7C2D12', '#78350F', '#713F12', '#14532D', '#064E3B',
   '#134E4A', '#164E63', '#1E3A8A', '#312E81', '#4C1D95', '#831843'],
]

/** Filas de la rejilla, en orden de presentación. */
export const PALETTE_ROWS: string[][] = [GRAYS, ...HUES]

/** Todos los hex de la rejilla, en minúsculas, para validar. */
export const PALETTE_HEXES: string[] = PALETTE_ROWS.flat().map((h) => h.toLowerCase())
