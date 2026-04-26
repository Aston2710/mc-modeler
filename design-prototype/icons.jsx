/* global React */
const { useState, useEffect, useRef, useMemo } = React;

// ============ BPMN Element Icons (SVG) ============
const BpmnIcons = {
  StartEvent: ({size=26, color="var(--start-stroke)", fill="var(--start-fill)"}) => (
    <svg viewBox="0 0 32 32" width={size} height={size}>
      <circle cx="16" cy="16" r="11" fill={fill} stroke={color} strokeWidth="2"/>
    </svg>
  ),
  StartTimer: ({size=26}) => (
    <svg viewBox="0 0 32 32" width={size} height={size}>
      <circle cx="16" cy="16" r="11" fill="var(--start-fill)" stroke="var(--start-stroke)" strokeWidth="2"/>
      <circle cx="16" cy="16" r="6" fill="none" stroke="var(--start-stroke)" strokeWidth="1.2"/>
      <path d="M16 11 L16 16 L19 18" stroke="var(--start-stroke)" strokeWidth="1.4" fill="none" strokeLinecap="round"/>
    </svg>
  ),
  StartMessage: ({size=26}) => (
    <svg viewBox="0 0 32 32" width={size} height={size}>
      <circle cx="16" cy="16" r="11" fill="var(--start-fill)" stroke="var(--start-stroke)" strokeWidth="2"/>
      <rect x="10" y="12" width="12" height="8" rx="1" fill="none" stroke="var(--start-stroke)" strokeWidth="1.2"/>
      <path d="M10 12 L16 17 L22 12" fill="none" stroke="var(--start-stroke)" strokeWidth="1.2"/>
    </svg>
  ),
  EndEvent: ({size=26}) => (
    <svg viewBox="0 0 32 32" width={size} height={size}>
      <circle cx="16" cy="16" r="11" fill="var(--end-fill)" stroke="var(--end-stroke)" strokeWidth="3"/>
    </svg>
  ),
  EndMessage: ({size=26}) => (
    <svg viewBox="0 0 32 32" width={size} height={size}>
      <circle cx="16" cy="16" r="11" fill="var(--end-fill)" stroke="var(--end-stroke)" strokeWidth="3"/>
      <rect x="10" y="12" width="12" height="8" rx="1" fill="var(--end-stroke)" stroke="var(--end-stroke)" strokeWidth="1"/>
      <path d="M10 12 L16 17 L22 12" fill="none" stroke="white" strokeWidth="1.2"/>
    </svg>
  ),
  Intermediate: ({size=26}) => (
    <svg viewBox="0 0 32 32" width={size} height={size}>
      <circle cx="16" cy="16" r="11" fill="var(--bg)" stroke="var(--text-2)" strokeWidth="1.5"/>
      <circle cx="16" cy="16" r="8" fill="none" stroke="var(--text-2)" strokeWidth="1.5"/>
    </svg>
  ),
  Task: ({size=26}) => (
    <svg viewBox="0 0 32 24" width={size} height={size*0.75}>
      <rect x="2" y="2" width="28" height="20" rx="3" fill="var(--task-fill)" stroke="var(--task-stroke)" strokeWidth="1.5"/>
    </svg>
  ),
  UserTask: ({size=26}) => (
    <svg viewBox="0 0 32 24" width={size} height={size*0.75}>
      <rect x="2" y="2" width="28" height="20" rx="3" fill="var(--task-fill)" stroke="var(--task-stroke)" strokeWidth="1.5"/>
      <circle cx="8" cy="9" r="1.8" fill="var(--task-stroke)"/>
      <path d="M5 14 Q8 11 11 14" fill="none" stroke="var(--task-stroke)" strokeWidth="1.2"/>
    </svg>
  ),
  ServiceTask: ({size=26}) => (
    <svg viewBox="0 0 32 24" width={size} height={size*0.75}>
      <rect x="2" y="2" width="28" height="20" rx="3" fill="var(--task-fill)" stroke="var(--task-stroke)" strokeWidth="1.5"/>
      <path d="M8 9 L8 13 M6 11 L10 11 M5.5 8.5 L10.5 13.5 M5.5 13.5 L10.5 8.5" stroke="var(--task-stroke)" strokeWidth="1.2" fill="none"/>
      <circle cx="8" cy="11" r="1.5" fill="var(--task-fill)" stroke="var(--task-stroke)" strokeWidth="1"/>
    </svg>
  ),
  ScriptTask: ({size=26}) => (
    <svg viewBox="0 0 32 24" width={size} height={size*0.75}>
      <rect x="2" y="2" width="28" height="20" rx="3" fill="var(--task-fill)" stroke="var(--task-stroke)" strokeWidth="1.5"/>
      <path d="M5 7 L11 7 M5 10 L11 10 M5 13 L9 13" stroke="var(--task-stroke)" strokeWidth="1" strokeLinecap="round"/>
    </svg>
  ),
  SendTask: ({size=26}) => (
    <svg viewBox="0 0 32 24" width={size} height={size*0.75}>
      <rect x="2" y="2" width="28" height="20" rx="3" fill="var(--task-fill)" stroke="var(--task-stroke)" strokeWidth="1.5"/>
      <rect x="4" y="7" width="9" height="7" rx="0.5" fill="var(--task-stroke)" stroke="var(--task-stroke)"/>
      <path d="M4 7 L8.5 11 L13 7" fill="none" stroke="white" strokeWidth="1"/>
    </svg>
  ),
  Subprocess: ({size=26}) => (
    <svg viewBox="0 0 32 24" width={size} height={size*0.75}>
      <rect x="2" y="2" width="28" height="20" rx="3" fill="var(--task-fill)" stroke="var(--task-stroke)" strokeWidth="1.5"/>
      <rect x="13" y="16" width="6" height="6" fill="var(--task-fill)" stroke="var(--task-stroke)" strokeWidth="1"/>
      <path d="M14.5 19 L17.5 19 M16 17.5 L16 20.5" stroke="var(--task-stroke)" strokeWidth="1"/>
    </svg>
  ),
  Gateway: ({size=26}) => (
    <svg viewBox="0 0 32 32" width={size} height={size}>
      <path d="M16 4 L28 16 L16 28 L4 16 Z" fill="var(--gateway-fill)" stroke="var(--gateway-stroke)" strokeWidth="1.8"/>
    </svg>
  ),
  GatewayX: ({size=26}) => (
    <svg viewBox="0 0 32 32" width={size} height={size}>
      <path d="M16 4 L28 16 L16 28 L4 16 Z" fill="var(--gateway-fill)" stroke="var(--gateway-stroke)" strokeWidth="1.8"/>
      <path d="M11 11 L21 21 M21 11 L11 21" stroke="var(--gateway-stroke)" strokeWidth="1.8" strokeLinecap="round"/>
    </svg>
  ),
  GatewayPlus: ({size=26}) => (
    <svg viewBox="0 0 32 32" width={size} height={size}>
      <path d="M16 4 L28 16 L16 28 L4 16 Z" fill="var(--gateway-fill)" stroke="var(--gateway-stroke)" strokeWidth="1.8"/>
      <path d="M16 10 L16 22 M10 16 L22 16" stroke="var(--gateway-stroke)" strokeWidth="2" strokeLinecap="round"/>
    </svg>
  ),
  GatewayCircle: ({size=26}) => (
    <svg viewBox="0 0 32 32" width={size} height={size}>
      <path d="M16 4 L28 16 L16 28 L4 16 Z" fill="var(--gateway-fill)" stroke="var(--gateway-stroke)" strokeWidth="1.8"/>
      <circle cx="16" cy="16" r="5.5" fill="none" stroke="var(--gateway-stroke)" strokeWidth="1.5"/>
    </svg>
  ),
  GatewayEvent: ({size=26}) => (
    <svg viewBox="0 0 32 32" width={size} height={size}>
      <path d="M16 4 L28 16 L16 28 L4 16 Z" fill="var(--gateway-fill)" stroke="var(--gateway-stroke)" strokeWidth="1.8"/>
      <polygon points="16,9 22,14 19.5,21 12.5,21 10,14" fill="none" stroke="var(--gateway-stroke)" strokeWidth="1.4"/>
    </svg>
  ),
  Pool: ({size=26}) => (
    <svg viewBox="0 0 32 24" width={size} height={size*0.75}>
      <rect x="2" y="2" width="28" height="20" fill="var(--pool-fill)" stroke="var(--pool-stroke)" strokeWidth="1.5"/>
      <line x1="8" y1="2" x2="8" y2="22" stroke="var(--pool-stroke)" strokeWidth="1"/>
      <line x1="2" y1="12" x2="30" y2="12" stroke="var(--pool-stroke)" strokeWidth="1"/>
    </svg>
  ),
  Lane: ({size=26}) => (
    <svg viewBox="0 0 32 24" width={size} height={size*0.75}>
      <rect x="2" y="6" width="28" height="12" fill="var(--lane-fill)" stroke="var(--pool-stroke)" strokeWidth="1.5"/>
      <line x1="8" y1="6" x2="8" y2="18" stroke="var(--pool-stroke)" strokeWidth="1"/>
    </svg>
  ),
  DataObject: ({size=26}) => (
    <svg viewBox="0 0 32 32" width={size} height={size}>
      <path d="M8 4 L20 4 L24 8 L24 28 L8 28 Z" fill="var(--bg)" stroke="var(--text-2)" strokeWidth="1.5"/>
      <path d="M20 4 L20 8 L24 8" fill="none" stroke="var(--text-2)" strokeWidth="1.2"/>
    </svg>
  ),
  DataStore: ({size=26}) => (
    <svg viewBox="0 0 32 32" width={size} height={size}>
      <path d="M6 8 L26 8 L26 24 L6 24 Z" fill="var(--bg)" stroke="var(--text-2)" strokeWidth="1.5"/>
      <ellipse cx="16" cy="8" rx="10" ry="3" fill="var(--bg)" stroke="var(--text-2)" strokeWidth="1.5"/>
      <path d="M6 12 Q16 15 26 12 M6 16 Q16 19 26 16" fill="none" stroke="var(--text-2)" strokeWidth="1"/>
    </svg>
  ),
  SeqFlow: ({size=26}) => (
    <svg viewBox="0 0 32 32" width={size} height={size}>
      <path d="M5 16 L23 16" stroke="var(--text)" strokeWidth="1.8"/>
      <path d="M20 12 L26 16 L20 20 Z" fill="var(--text)" stroke="var(--text)"/>
    </svg>
  ),
  MsgFlow: ({size=26}) => (
    <svg viewBox="0 0 32 32" width={size} height={size}>
      <path d="M5 16 L23 16" stroke="var(--text)" strokeWidth="1.5" strokeDasharray="3 2"/>
      <circle cx="6" cy="16" r="2" fill="var(--bg)" stroke="var(--text)" strokeWidth="1.2"/>
      <path d="M20 12 L26 16 L20 20 Z" fill="var(--bg)" stroke="var(--text)" strokeWidth="1.2"/>
    </svg>
  ),
  Association: ({size=26}) => (
    <svg viewBox="0 0 32 32" width={size} height={size}>
      <path d="M5 16 L27 16" stroke="var(--text-2)" strokeWidth="1.3" strokeDasharray="2 2"/>
    </svg>
  ),
  TextAnnotation: ({size=26}) => (
    <svg viewBox="0 0 32 32" width={size} height={size}>
      <path d="M12 4 L8 4 L8 28 L12 28" fill="none" stroke="var(--text-2)" strokeWidth="1.5"/>
      <path d="M14 10 L26 10 M14 16 L26 16 M14 22 L22 22" stroke="var(--text-2)" strokeWidth="1" strokeLinecap="round"/>
    </svg>
  ),
};

// ============ Toolbar Icons ============
const I = {
  Plus: () => <svg viewBox="0 0 16 16" fill="none"><path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg>,
  FolderUp: () => <svg viewBox="0 0 16 16" fill="none"><path d="M2 4.5a1 1 0 0 1 1-1h3l1.5 1.5H13a1 1 0 0 1 1 1V12a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V4.5z" stroke="currentColor" strokeWidth="1.4"/><path d="M8 11V7M6 9l2-2 2 2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  Download: () => <svg viewBox="0 0 16 16" fill="none"><path d="M8 2v8M5 7l3 3 3-3M3 13h10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  Check: () => <svg viewBox="0 0 16 16" fill="none"><path d="M3 8.5l3 3 7-7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  Undo: () => <svg viewBox="0 0 16 16" fill="none"><path d="M5 9H10a3 3 0 0 1 0 6H7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/><path d="M7 6L4 9l3 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  Redo: () => <svg viewBox="0 0 16 16" fill="none"><path d="M11 9H6a3 3 0 0 0 0 6h3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/><path d="M9 6l3 3-3 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  Sun: () => <svg viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="3" stroke="currentColor" strokeWidth="1.4"/><path d="M8 1v2M8 13v2M1 8h2M13 8h2M3 3l1.5 1.5M11.5 11.5L13 13M3 13l1.5-1.5M11.5 4.5L13 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>,
  Moon: () => <svg viewBox="0 0 16 16" fill="none"><path d="M13 9.5A5.5 5.5 0 1 1 6.5 3a4.5 4.5 0 0 0 6.5 6.5z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/></svg>,
  Search: () => <svg viewBox="0 0 16 16" fill="none"><circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.4"/><path d="M10.5 10.5L14 14" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>,
  ChevDown: () => <svg viewBox="0 0 12 12" fill="none"><path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  ChevLeft: () => <svg viewBox="0 0 16 16" fill="none"><path d="M10 3L5 8l5 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  ChevRight: () => <svg viewBox="0 0 16 16" fill="none"><path d="M6 3l5 5-5 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  X: () => <svg viewBox="0 0 16 16" fill="none"><path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>,
  Trash: () => <svg viewBox="0 0 16 16" fill="none"><path d="M3 4.5h10M6 4V2.5h4V4M5 4.5l.7 8.2a1 1 0 0 0 1 .8h2.6a1 1 0 0 0 1-.8L11 4.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  Home: () => <svg viewBox="0 0 16 16" fill="none"><path d="M2 7l6-5 6 5v6a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V7z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/></svg>,
  Doc: () => <svg viewBox="0 0 16 16" fill="none"><path d="M4 2h6l3 3v9H4V2z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/><path d="M10 2v3h3" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/></svg>,
  Settings: () => <svg viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="2" stroke="currentColor" strokeWidth="1.4"/><path d="M8 1v2M8 13v2M3.5 3.5L5 5M11 11l1.5 1.5M1 8h2M13 8h2M3.5 12.5L5 11M11 5l1.5-1.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>,
  Layers: () => <svg viewBox="0 0 16 16" fill="none"><path d="M8 1L1 5l7 4 7-4-7-4z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/><path d="M1 11l7 4 7-4M1 8l7 4 7-4" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/></svg>,
  Hand: () => <svg viewBox="0 0 16 16" fill="none"><path d="M5 8V3.5a1 1 0 0 1 2 0V8M7 7V2.5a1 1 0 0 1 2 0V8M9 7.5V3a1 1 0 0 1 2 0V9M11 6.5a1 1 0 0 1 2 0v4a4 4 0 0 1-4 4H7l-3-3-1.5-1.5a1 1 0 0 1 1.5-1.5L5 8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  Cursor: () => <svg viewBox="0 0 16 16" fill="none"><path d="M3 2l3 11 2-4 4-2L3 2z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" fill="currentColor" fillOpacity=".15"/></svg>,
  Map: () => <svg viewBox="0 0 16 16" fill="none"><path d="M1 3l4-1 6 2 4-1v11l-4 1-6-2-4 1V3z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/><path d="M5 2v12M11 4v12" stroke="currentColor" strokeWidth="1.3"/></svg>,
  Keyboard: () => <svg viewBox="0 0 16 16" fill="none"><rect x="1" y="4" width="14" height="9" rx="1" stroke="currentColor" strokeWidth="1.3"/><path d="M4 7h.5M7 7h.5M10 7h.5M4 10h8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>,
  Plus2: () => <svg viewBox="0 0 16 16" fill="none"><path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>,
  Minus: () => <svg viewBox="0 0 16 16" fill="none"><path d="M3 8h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>,
  Fit: () => <svg viewBox="0 0 16 16" fill="none"><path d="M3 6V3h3M13 6V3h-3M3 10v3h3M13 10v3h-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  Info: () => <svg viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.3"/><path d="M8 7v4M8 5v.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>,
  Warn: () => <svg viewBox="0 0 16 16" fill="none"><path d="M8 2L1 14h14L8 2z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/><path d="M8 7v3M8 12v.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>,
  Save: () => <svg viewBox="0 0 16 16" fill="none"><path d="M3 2h8l3 3v9H3V2z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/><rect x="5" y="9" width="6" height="4" stroke="currentColor" strokeWidth="1.3"/><path d="M5 2v3h5" stroke="currentColor" strokeWidth="1.3"/></svg>,
  More: () => <svg viewBox="0 0 16 16" fill="none"><circle cx="3.5" cy="8" r="1.2" fill="currentColor"/><circle cx="8" cy="8" r="1.2" fill="currentColor"/><circle cx="12.5" cy="8" r="1.2" fill="currentColor"/></svg>,
  Star: () => <svg viewBox="0 0 16 16" fill="none"><path d="M8 1.5l2 4.5 5 .5-3.7 3.4 1 5L8 12l-4.3 2.9 1-5L1 6.5l5-.5L8 1.5z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/></svg>,
  Comment: () => <svg viewBox="0 0 16 16" fill="none"><path d="M2 3h12v8H6l-3 3v-3H2V3z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/></svg>,
  Filter: () => <svg viewBox="0 0 16 16" fill="none"><path d="M2 3h12L9 9v5l-2-1V9L2 3z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/></svg>,
};

window.BpmnIcons = BpmnIcons;
window.UIIcons = I;
