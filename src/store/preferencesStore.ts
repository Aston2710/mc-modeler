import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import type { UserPreferences } from '@/domain/types'
import { diagramRepository } from '@/persistence'
import i18n from '@/i18n'

interface PreferencesState extends UserPreferences {
  loaded: boolean
  load: () => Promise<void>
  setLanguage: (lang: 'es' | 'en') => Promise<void>
  setTheme: (theme: 'light' | 'dark' | 'system') => Promise<void>
  setGridEnabled: (v: boolean) => Promise<void>
  setGridSize: (v: 5 | 10 | 20) => Promise<void>
  setSnapToGrid: (v: boolean) => Promise<void>
  setLastOpened: (id: string | null) => Promise<void>
  setPaletteMode: (v: 'grid' | 'dropdown' | 'bizagi') => Promise<void>
  setShowComments: (v: boolean) => Promise<void>
}

// Extraer SOLO los campos de datos: el estado de Zustand incluye las acciones
// (funciones) y IndexedDB no puede clonarlas → DataCloneError y prefs nunca
// persistidas. Nunca pasar get() completo a savePreferences.
const save = async (s: PreferencesState) => {
  const prefs: UserPreferences = {
    language: s.language,
    theme: s.theme,
    gridEnabled: s.gridEnabled,
    gridSize: s.gridSize,
    snapToGrid: s.snapToGrid,
    autoSaveInterval: s.autoSaveInterval,
    lastOpenedDiagramId: s.lastOpenedDiagramId,
    paletteMode: s.paletteMode,
    showComments: s.showComments,
  }
  await diagramRepository.savePreferences(prefs)
}

export const usePreferencesStore = create<PreferencesState>()(
  immer((set, get) => ({
    language: 'es',
    theme: 'light',
    gridEnabled: true,
    gridSize: 10,
    snapToGrid: true,
    autoSaveInterval: 30,
    lastOpenedDiagramId: null,
    paletteMode: 'grid',
    showComments: true,
    loaded: false,

    load: async () => {
      const prefs = await diagramRepository.getPreferences()
      set((s) => {
        Object.assign(s, prefs)
        s.loaded = true
      })
      await i18n.changeLanguage(prefs.language)
      applyTheme(prefs.theme)
    },

    setLanguage: async (lang) => {
      set((s) => { s.language = lang })
      await i18n.changeLanguage(lang)
      await save(get())
    },

    setTheme: async (theme) => {
      set((s) => { s.theme = theme })
      applyTheme(theme)
      await save(get())
    },

    setGridEnabled: async (v) => {
      set((s) => { s.gridEnabled = v })
      await save(get())
    },

    setGridSize: async (v) => {
      set((s) => { s.gridSize = v })
      await save(get())
    },

    setSnapToGrid: async (v) => {
      set((s) => { s.snapToGrid = v })
      await save(get())
    },

    setLastOpened: async (id) => {
      set((s) => { s.lastOpenedDiagramId = id })
      await save(get())
    },

    setPaletteMode: async (v) => {
      set((s) => { s.paletteMode = v })
      await save(get())
    },

    setShowComments: async (v) => {
      set((s) => { s.showComments = v })
      await save(get())
    },
  }))
)

function applyTheme(theme: 'light' | 'dark' | 'system') {
  const isDark =
    theme === 'dark' ||
    (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
  document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light')
}
