interface IconProps {
  type: string
  size?: number
}

// BPMN standard colors
const C = {
  startFill: 'var(--start-fill)',
  startStroke: 'var(--start-stroke)',
  endFill: 'var(--end-fill)',
  endStroke: 'var(--end-stroke)',
  taskFill: 'var(--task-fill)',
  taskStroke: 'var(--task-stroke)',
  intFill: 'var(--int-fill)',
  intStroke: 'var(--int-stroke)',
  gwFill: 'var(--gateway-fill)',
  gwStroke: 'var(--gateway-stroke)',
  poolStroke: 'var(--pool-stroke)',
  poolFill: 'var(--pool-fill)',
  text: 'var(--task-text)',
  text2: 'var(--text-2)',
}

export function BpmnElementIcon({ type, size = 26 }: IconProps) {
  const s = size
  const h = s * 0.5

  switch (type) {
    // ── Events ──────────────────────────────────────────
    case 'startEvent':
      return (
        <svg width={s} height={s} viewBox="0 0 30 30">
          <circle cx="15" cy="15" r="11" fill={C.startFill} stroke={C.startStroke} strokeWidth="2" />
        </svg>
      )
    case 'startTimerEvent':
      return (
        <svg width={s} height={s} viewBox="0 0 30 30">
          <circle cx="15" cy="15" r="11" fill={C.startFill} stroke={C.startStroke} strokeWidth="2" />
          <circle cx="15" cy="15" r="7" fill="none" stroke={C.startStroke} strokeWidth="1.5" />
          <line x1="15" y1="9" x2="15" y2="15" stroke={C.startStroke} strokeWidth="1.5" strokeLinecap="round" />
          <line x1="15" y1="15" x2="19" y2="18" stroke={C.startStroke} strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      )
    case 'startMessageEvent':
      return (
        <svg width={s} height={s} viewBox="0 0 30 30">
          <circle cx="15" cy="15" r="11" fill={C.startFill} stroke={C.startStroke} strokeWidth="2" />
          <rect x="9" y="11" width="12" height="8" rx="1" fill={C.startFill} stroke={C.startStroke} strokeWidth="1.3" />
          <path d="M9 12l6 5 6-5" fill="none" stroke={C.startStroke} strokeWidth="1.3" />
        </svg>
      )
    case 'startSignalEvent':
      return (
        <svg width={s} height={s} viewBox="0 0 30 30">
          <circle cx="15" cy="15" r="11" fill={C.startFill} stroke={C.startStroke} strokeWidth="2" />
          <polygon points="15,9 21,21 9,21" fill="none" stroke={C.startStroke} strokeWidth="1.5" />
        </svg>
      )
    case 'startConditionalEvent':
      return (
        <svg width={s} height={s} viewBox="0 0 30 30">
          <circle cx="15" cy="15" r="11" fill={C.startFill} stroke={C.startStroke} strokeWidth="2" />
          <rect x="10" y="10" width="10" height="10" rx="1" fill="none" stroke={C.startStroke} strokeWidth="1.3" />
          <line x1="12" y1="13" x2="18" y2="13" stroke={C.startStroke} strokeWidth="1.2" />
          <line x1="12" y1="15.5" x2="18" y2="15.5" stroke={C.startStroke} strokeWidth="1.2" />
          <line x1="12" y1="18" x2="18" y2="18" stroke={C.startStroke} strokeWidth="1.2" />
        </svg>
      )
    case 'intermediateEvent':
      return (
        <svg width={s} height={s} viewBox="0 0 30 30">
          <circle cx="15" cy="15" r="11" fill={C.intFill} stroke={C.intStroke} strokeWidth="2" />
          <circle cx="15" cy="15" r="8" fill="none" stroke={C.intStroke} strokeWidth="1.5" />
        </svg>
      )
    case 'intermediateMessageEvent':
      return (
        <svg width={s} height={s} viewBox="0 0 30 30">
          <circle cx="15" cy="15" r="11" fill={C.intFill} stroke={C.intStroke} strokeWidth="2" />
          <circle cx="15" cy="15" r="8" fill="none" stroke={C.intStroke} strokeWidth="1.5" />
          <rect x="10" y="12" width="10" height="6" rx="1" fill={C.intFill} stroke={C.intStroke} strokeWidth="1.2" />
          <path d="M10 12.5l5 3.5 5-3.5" fill="none" stroke={C.intStroke} strokeWidth="1.2" />
        </svg>
      )
    case 'intermediateTimerEvent':
      return (
        <svg width={s} height={s} viewBox="0 0 30 30">
          <circle cx="15" cy="15" r="11" fill={C.intFill} stroke={C.intStroke} strokeWidth="2" />
          <circle cx="15" cy="15" r="8" fill="none" stroke={C.intStroke} strokeWidth="1.5" />
          <line x1="15" y1="9" x2="15" y2="15" stroke={C.intStroke} strokeWidth="1.5" strokeLinecap="round" />
          <line x1="15" y1="15" x2="19" y2="18" stroke={C.intStroke} strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      )
    case 'endEvent':
      return (
        <svg width={s} height={s} viewBox="0 0 30 30">
          <circle cx="15" cy="15" r="11" fill={C.endFill} stroke={C.endStroke} strokeWidth="3" />
        </svg>
      )
    case 'endMessageEvent':
      return (
        <svg width={s} height={s} viewBox="0 0 30 30">
          <circle cx="15" cy="15" r="11" fill={C.endFill} stroke={C.endStroke} strokeWidth="3" />
          <rect x="9" y="11" width="12" height="8" rx="1" fill={C.endFill} stroke={C.endStroke} strokeWidth="1.3" />
          <path d="M9 12l6 5 6-5" fill="none" stroke={C.endStroke} strokeWidth="1.3" />
        </svg>
      )
    case 'endErrorEvent':
      return (
        <svg width={s} height={s} viewBox="0 0 30 30">
          <circle cx="15" cy="15" r="11" fill={C.endFill} stroke={C.endStroke} strokeWidth="3" />
          <path d="M12 20l4-5-2-1 4-4" fill="none" stroke={C.endStroke} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )
    case 'endTerminateEvent':
      return (
        <svg width={s} height={s} viewBox="0 0 30 30">
          <circle cx="15" cy="15" r="11" fill={C.endFill} stroke={C.endStroke} strokeWidth="3" />
          <circle cx="15" cy="15" r="6" fill={C.endStroke} />
        </svg>
      )

    // ── Activities ───────────────────────────────────────
    case 'task':
      return (
        <svg width={s} height={s} viewBox="0 0 30 30">
          <rect x="3" y="7" width="24" height="16" rx="3" fill={C.taskFill} stroke={C.taskStroke} strokeWidth="1.5" />
        </svg>
      )
    case 'userTask':
      return (
        <svg width={s} height={s} viewBox="0 0 30 30">
          <rect x="3" y="7" width="24" height="16" rx="3" fill={C.taskFill} stroke={C.taskStroke} strokeWidth="1.5" />
          <circle cx="11" cy="13" r="2.5" fill={C.taskStroke} />
          <path d="M6 21c0-3 2.5-5 5-5s5 2 5 5" fill="none" stroke={C.taskStroke} strokeWidth="1.3" />
        </svg>
      )
    case 'serviceTask':
      return (
        <svg width={s} height={s} viewBox="0 0 30 30">
          <rect x="3" y="7" width="24" height="16" rx="3" fill={C.taskFill} stroke={C.taskStroke} strokeWidth="1.5" />
          <circle cx="11" cy="15" r="3.5" fill="none" stroke={C.taskStroke} strokeWidth="1.5" />
          <circle cx="11" cy="15" r="1.2" fill={C.taskStroke} />
          <line x1="11" y1="10" x2="11" y2="11.5" stroke={C.taskStroke} strokeWidth="1.5" />
          <line x1="11" y1="18.5" x2="11" y2="20" stroke={C.taskStroke} strokeWidth="1.5" />
          <line x1="6.5" y1="15" x2="7.5" y2="15" stroke={C.taskStroke} strokeWidth="1.5" />
          <line x1="14.5" y1="15" x2="15.5" y2="15" stroke={C.taskStroke} strokeWidth="1.5" />
        </svg>
      )
    case 'scriptTask':
      return (
        <svg width={s} height={s} viewBox="0 0 30 30">
          <rect x="3" y="7" width="24" height="16" rx="3" fill={C.taskFill} stroke={C.taskStroke} strokeWidth="1.5" />
          <path d="M10 12h8M10 15h6M10 18h7" stroke={C.taskStroke} strokeWidth="1.3" strokeLinecap="round" />
        </svg>
      )
    case 'sendTask':
      return (
        <svg width={s} height={s} viewBox="0 0 30 30">
          <rect x="3" y="7" width="24" height="16" rx="3" fill={C.taskFill} stroke={C.taskStroke} strokeWidth="1.5" />
          <rect x="9" y="11" width="12" height="8" rx="1" fill={C.taskStroke} />
          <path d="M9 12l6 4 6-4" fill="none" stroke={C.taskFill} strokeWidth="1.3" />
        </svg>
      )
    case 'receiveTask':
      return (
        <svg width={s} height={s} viewBox="0 0 30 30">
          <rect x="3" y="7" width="24" height="16" rx="3" fill={C.taskFill} stroke={C.taskStroke} strokeWidth="1.5" />
          <rect x="9" y="11" width="12" height="8" rx="1" fill={C.taskFill} stroke={C.taskStroke} strokeWidth="1.3" />
          <path d="M9 12l6 4 6-4" fill="none" stroke={C.taskStroke} strokeWidth="1.3" />
        </svg>
      )
    case 'businessRuleTask':
      return (
        <svg width={s} height={s} viewBox="0 0 30 30">
          <rect x="3" y="7" width="24" height="16" rx="3" fill={C.taskFill} stroke={C.taskStroke} strokeWidth="1.5" />
          <rect x="8" y="10" width="14" height="4" rx="1" fill="none" stroke={C.taskStroke} strokeWidth="1.2" />
          <line x1="8" y1="18" x2="22" y2="18" stroke={C.taskStroke} strokeWidth="1.2" />
          <line x1="8" y1="21" x2="18" y2="21" stroke={C.taskStroke} strokeWidth="1.2" />
        </svg>
      )
    case 'subProcess':
      return (
        <svg width={s} height={s} viewBox="0 0 30 30">
          <rect x="3" y="7" width="24" height="16" rx="3" fill={C.taskFill} stroke={C.taskStroke} strokeWidth="1.5" />
          <rect x="12" y="19" width="6" height="5" rx="1" fill={C.taskFill} stroke={C.taskStroke} strokeWidth="1.2" />
          <line x1="15" y1="20.5" x2="15" y2="23" stroke={C.taskStroke} strokeWidth="1.2" />
          <line x1="13.5" y1="21.7" x2="16.5" y2="21.7" stroke={C.taskStroke} strokeWidth="1.2" />
        </svg>
      )
    case 'callActivity':
      return (
        <svg width={s} height={s} viewBox="0 0 30 30">
          <rect x="3" y="7" width="24" height="16" rx="3" fill={C.taskFill} stroke={C.taskStroke} strokeWidth="2.5" />
        </svg>
      )

    // ── Gateways ─────────────────────────────────────────
    case 'exclusiveGateway':
      return (
        <svg width={s} height={s} viewBox="0 0 30 30">
          <polygon points="15,4 26,15 15,26 4,15" fill={C.gwFill} stroke={C.gwStroke} strokeWidth="1.5" />
        </svg>
      )
    case 'parallelGateway':
      return (
        <svg width={s} height={s} viewBox="0 0 30 30">
          <polygon points="15,4 26,15 15,26 4,15" fill={C.gwFill} stroke={C.gwStroke} strokeWidth="1.5" />
          <line x1="15" y1="9" x2="15" y2="21" stroke={C.gwStroke} strokeWidth="2" strokeLinecap="round" />
          <line x1="9" y1="15" x2="21" y2="15" stroke={C.gwStroke} strokeWidth="2" strokeLinecap="round" />
        </svg>
      )
    case 'inclusiveGateway':
      return (
        <svg width={s} height={s} viewBox="0 0 30 30">
          <polygon points="15,4 26,15 15,26 4,15" fill={C.gwFill} stroke={C.gwStroke} strokeWidth="1.5" />
          <circle cx="15" cy="15" r="4.5" fill="none" stroke={C.gwStroke} strokeWidth="2" />
        </svg>
      )
    case 'eventBasedGateway':
      return (
        <svg width={s} height={s} viewBox="0 0 30 30">
          <polygon points="15,4 26,15 15,26 4,15" fill={C.gwFill} stroke={C.gwStroke} strokeWidth="1.5" />
          <circle cx="15" cy="15" r="6" fill="none" stroke={C.gwStroke} strokeWidth="1.2" />
          <polygon points="15,11 17.5,14.5 15,18 12.5,14.5" fill="none" stroke={C.gwStroke} strokeWidth="1.2" />
        </svg>
      )
    case 'complexGateway':
      return (
        <svg width={s} height={s} viewBox="0 0 30 30">
          <polygon points="15,4 26,15 15,26 4,15" fill={C.gwFill} stroke={C.gwStroke} strokeWidth="1.5" />
          <path d="M15 9v12M9 15h12M11 11l8 8M19 11l-8 8" stroke={C.gwStroke} strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      )

    // ── Connections ──────────────────────────────────────
    case 'sequenceFlow':
      return (
        <svg width={s} height={s} viewBox="0 0 30 30">
          <line x1="5" y1="15" x2="23" y2="15" stroke={C.text2} strokeWidth="2" />
          <polygon points="22,11 27,15 22,19" fill={C.text2} />
        </svg>
      )
    case 'messageFlow':
      return (
        <svg width={s} height={s} viewBox="0 0 30 30">
          <line x1="5" y1="15" x2="23" y2="15" stroke={C.text2} strokeWidth="2" strokeDasharray="4 3" />
          <polygon points="22,11 27,15 22,19" fill="none" stroke={C.text2} strokeWidth="1.5" />
        </svg>
      )
    case 'association':
      return (
        <svg width={s} height={s} viewBox="0 0 30 30">
          <line x1="5" y1="15" x2="23" y2="15" stroke={C.text2} strokeWidth="1.5" strokeDasharray="3 3" />
          <polygon points="22,11 27,15 22,19" fill="none" stroke={C.text2} strokeWidth="1.5" />
        </svg>
      )
    case 'dataAssociation':
      return (
        <svg width={s} height={s} viewBox="0 0 30 30">
          <line x1="5" y1="15" x2="23" y2="15" stroke={C.text2} strokeWidth="1.5" strokeDasharray="3 3" />
          <polygon points="22,11 27,15 22,19" fill={C.text2} />
        </svg>
      )

    // ── Containers ───────────────────────────────────────
    case 'pool':
      return (
        <svg width={s} height={s} viewBox="0 0 30 30">
          <rect x="2" y="6" width="26" height="18" rx="2" fill={C.poolFill} stroke={C.poolStroke} strokeWidth="1.5" />
          <line x1="8" y1="6" x2="8" y2="24" stroke={C.poolStroke} strokeWidth="1.2" />
        </svg>
      )
    case 'lane':
      return (
        <svg width={s} height={s} viewBox="0 0 30 30">
          <rect x="2" y="4" width="26" height="10" rx="0" fill={C.poolFill} stroke={C.poolStroke} strokeWidth="1.2" />
          <rect x="2" y="16" width="26" height="10" rx="0" fill={C.poolFill} stroke={C.poolStroke} strokeWidth="1.2" />
          <line x1="8" y1="4" x2="8" y2="26" stroke={C.poolStroke} strokeWidth="1.2" />
        </svg>
      )
    case 'group':
      return (
        <svg width={s} height={s} viewBox="0 0 30 30">
          <rect x="3" y="5" width="24" height="20" rx="3" fill="none" stroke={C.text2} strokeWidth="1.5" strokeDasharray="5 3" />
        </svg>
      )
    case 'textAnnotation':
      return (
        <svg width={s} height={s} viewBox="0 0 30 30">
          <path d="M12 7H7v16h5" fill="none" stroke={C.text2} strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      )
    case 'image':
      return (
        <svg width={s} height={s} viewBox="0 0 30 30">
          <image href="/image.png" x="2" y="2" width="26" height="26" preserveAspectRatio="xMidYMid meet" />
        </svg>
      )
    case 'dataObject':
      return (
        <svg width={s} height={s} viewBox="0 0 30 30">
          <path d="M9 5h8l5 5v16H9V5z" fill={C.poolFill} stroke={C.poolStroke} strokeWidth="1.5" />
          <path d="M17 5v5h5" fill="none" stroke={C.poolStroke} strokeWidth="1.2" />
        </svg>
      )

    default:
      return (
        <svg width={s} height={s} viewBox="0 0 30 30">
          <rect x="5" y="5" width="20" height="20" rx="3" fill={C.taskFill} stroke={C.taskStroke} strokeWidth="1.5" />
          <text x="15" y={h + 5} textAnchor="middle" fontSize="9" fill={C.text}>?</text>
        </svg>
      )
  }
}
