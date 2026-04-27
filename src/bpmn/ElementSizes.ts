/**
 * ElementSizes.ts — tamaños por defecto al crear elementos BPMN.
 *
 * Edita estos valores para cambiar el tamaño inicial de cada tipo.
 * El módulo CustomElementSizesModule los inyecta en elementFactory.getDefaultSize().
 */

export interface Size { width: number; height: number }

export const ELEMENT_SIZES = {
  task:                { width: 120, height: 60  },
  gateway:             { width: 50,  height: 50  },
  event:               { width: 36,  height: 36  },

  subProcessExpanded:  { width: 350, height: 200 },
  subProcessCollapsed: { width: 120, height: 60  },

  participantExpanded:           { width: 600, height: 250 },
  participantExpandedVertical:   { width: 250, height: 600 },
  participantCollapsed:          { width: 400, height: 60  },
  participantCollapsedVertical:  { width: 60,  height: 400 },

  lane:            { width: 400, height: 100 },
  dataObject:      { width: 36,  height: 50  },
  dataStore:       { width: 50,  height: 50  },
  textAnnotation:  { width: 100, height: 30  },
  group:           { width: 300, height: 300 },
} satisfies Record<string, Size>
