import { usePreferencesStore } from '@/store/preferencesStore'

type Replacements = Record<string, string>

const ES: Record<string, string> = {
  'flow elements must be children of pools/participants':
    'Los elementos de flujo deben ser hijos de pools/participantes',
  'Data object must be placed within a pool/participant.':
    'Los objetos de datos deben colocarse dentro de un pool/participante.',
  'element {element} referenced by {referenced} not yet drawn':
    'El elemento {element} referenciado por {referenced} aún no ha sido dibujado',
  'unknown element <{type}>': 'Elemento desconocido <{type}>',
  'multiple process definitions not supported':
    'No se admiten múltiples definiciones de proceso',
  'missing {element}': 'Falta {element}',
  'unresolved reference {element}': 'Referencia no resuelta: {element}',
}

function applyReplacements(template: string, replacements?: Replacements): string {
  if (!replacements) return template
  return template.replace(/\{([^}]+)\}/g, (_, key: string) => replacements[key] ?? `{${key}}`)
}

const translateFn = (template: string, replacements?: Replacements): string => {
  const lang = usePreferencesStore.getState().language ?? 'es'
  const translated = lang === 'es' ? (ES[template] ?? template) : template
  return applyReplacements(translated, replacements)
}

const TranslateModule = {
  translate: ['value', translateFn],
}

export default TranslateModule
