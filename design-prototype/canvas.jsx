/* global React */
const { useState: useStateC, useEffect: useEffectC } = React;

// ============ Diagram models ============
function getDiagramModel(diagramId, lang, expandedSubprocesses) {
  const t = (es, en) => lang === 'es' ? es : en;
  const isExpanded = (id) => expandedSubprocesses[id];

  if (diagramId === 'd1') {
    // Approval of Purchase Order with expandable subprocess
    const elements = [
      { id: 'pool1', kind: 'pool', x: 60, y: 60, w: 1480, h: 760, label: t('Empresa — Aprobación de Orden de Compra', 'Company — Purchase Order Approval') },
      { id: 'lane1', kind: 'lane', x: 100, y: 60, w: 1440, h: 240, label: t('Solicitante', 'Requester') },
      { id: 'lane2', kind: 'lane', x: 100, y: 300, w: 1440, h: 260, label: t('Aprobador', 'Approver') },
      { id: 'lane3', kind: 'lane', x: 100, y: 560, w: 1440, h: 260, label: t('Compras', 'Procurement') },

      { id: 'start1', kind: 'startEvent', x: 170, y: 162, label: t('Necesidad detectada', 'Need identified') },
      { id: 'task1', kind: 'userTask', x: 270, y: 145, w: 130, h: 76, label: t('Crear orden\nde compra', 'Create purchase\norder') },
      { id: 'task2', kind: 'serviceTask', x: 440, y: 145, w: 130, h: 76, label: t('Validar datos\ndel proveedor', 'Validate vendor\ndata') },
      { id: 'gw1', kind: 'gatewayX', x: 614, y: 158, label: t('¿Monto > $5,000?', 'Amount > $5,000?') },
      { id: 'task3', kind: 'userTask', x: 740, y: 385, w: 140, h: 76, label: t('Revisar solicitud', 'Review request') },
      { id: 'gw2', kind: 'gatewayX', x: 935, y: 398, label: t('Decisión', 'Decision') },
      { id: 'task4', kind: 'sendTask', x: 1060, y: 385, w: 140, h: 76, label: t('Notificar\nrechazo', 'Notify\nrejection') },
      { id: 'end2', kind: 'endEvent', x: 1260, y: 402, label: t('Rechazada', 'Rejected') },

      // Subprocess "Procesar compra" — expandable
      ...(isExpanded('sub1') ? [
        { id: 'sub1', kind: 'subprocessExpanded', x: 720, y: 615, w: 540, h: 180, label: t('Procesar compra', 'Process purchase') },
        // Inner elements
        { id: 'sub1.start', kind: 'startEvent', innerOf: 'sub1', x: 740, y: 685, label: '' },
        { id: 'sub1.t1', kind: 'serviceTask', innerOf: 'sub1', x: 790, y: 670, w: 110, h: 60, label: t('Emitir orden', 'Issue order') },
        { id: 'sub1.t2', kind: 'serviceTask', innerOf: 'sub1', x: 920, y: 670, w: 110, h: 60, label: t('Registrar ERP', 'Register ERP') },
        { id: 'sub1.t3', kind: 'sendTask', innerOf: 'sub1', x: 1050, y: 670, w: 110, h: 60, label: t('Confirmar', 'Confirm') },
        { id: 'sub1.end', kind: 'endEvent', innerOf: 'sub1', x: 1180, y: 685, label: '' },
      ] : [
        { id: 'sub1', kind: 'subprocessCollapsed', x: 740, y: 645, w: 140, h: 76, label: t('Procesar compra', 'Process purchase') },
      ]),

      // After subprocess
      { id: 'end1', kind: 'endEvent', x: isExpanded('sub1') ? 1310 : 920, y: isExpanded('sub1') ? 700 : 662, label: t('Orden emitida', 'Order issued') },
      { id: 'task8', kind: 'serviceTask', x: 740, y: 145, w: 130, h: 76, label: t('Aprobación\nautomática', 'Auto\napproval') },
      { id: 'data1', kind: 'dataObject', x: 305, y: 50, label: 'OC.json' },
    ];

    const flows = [
      { id: 'f1', from: 'start1', to: 'task1', path: 'M204 178 L270 178' },
      { id: 'f2', from: 'task1', to: 'task2', path: 'M400 183 L440 183' },
      { id: 'f3', from: 'task2', to: 'gw1', path: 'M570 183 L614 183' },
      { id: 'f4', from: 'gw1', to: 'task3', path: 'M650 218 L650 350 L810 350 L810 385', label: t('Sí', 'Yes') },
      { id: 'f5', from: 'gw1', to: 'task8', path: 'M686 183 L740 183', label: t('No', 'No') },
      { id: 'f6', from: 'task8', to: 'sub1', path: 'M805 221 L805 645' },
      { id: 'f7', from: 'task3', to: 'gw2', path: 'M880 423 L935 423' },
      { id: 'f8', from: 'gw2', to: 'task4', path: 'M1007 423 L1060 423', label: t('Rechazar', 'Reject') },
      { id: 'f9', from: 'task4', to: 'end2', path: 'M1200 423 L1260 423' },
      { id: 'f10', from: 'gw2', to: 'sub1', path: `M971 459 L971 590 L810 590 L810 ${isExpanded('sub1') ? 615 : 645}`, label: t('Aprobar', 'Approve') },
      { id: 'f13', from: 'sub1', to: 'end1', path: isExpanded('sub1') ? 'M1260 705 L1310 717' : 'M880 683 L920 678' },
      { id: 'a1', from: 'task1', to: 'data1', path: 'M335 145 L335 90', dashed: true },
    ];

    if (isExpanded('sub1')) {
      flows.push(
        { id: 'sf1', from: 'sub1.start', to: 'sub1.t1', path: 'M756 701 L790 700' },
        { id: 'sf2', from: 'sub1.t1', to: 'sub1.t2', path: 'M900 700 L920 700' },
        { id: 'sf3', from: 'sub1.t2', to: 'sub1.t3', path: 'M1030 700 L1050 700' },
        { id: 'sf4', from: 'sub1.t3', to: 'sub1.end', path: 'M1160 700 L1180 701' },
      );
    }

    return { elements, flows, name: t('Aprobación de Orden de Compra', 'Purchase Order Approval') };
  }

  if (diagramId === 'd2') {
    // Onboarding de empleado
    const elements = [
      { id: 'pool1', kind: 'pool', x: 60, y: 60, w: 1480, h: 600, label: t('Onboarding de Empleado', 'Employee Onboarding') },
      { id: 'lane1', kind: 'lane', x: 100, y: 60, w: 1440, h: 200, label: 'RRHH' },
      { id: 'lane2', kind: 'lane', x: 100, y: 260, w: 1440, h: 200, label: 'IT' },
      { id: 'lane3', kind: 'lane', x: 100, y: 460, w: 1440, h: 200, label: t('Manager', 'Manager') },

      { id: 'start1', kind: 'startEvent', x: 170, y: 142, label: t('Contratación firmada', 'Hire signed') },
      { id: 'task1', kind: 'userTask', x: 260, y: 125, w: 130, h: 70, label: t('Crear expediente', 'Create file') },
      { id: 'task2', kind: 'serviceTask', x: 420, y: 125, w: 130, h: 70, label: t('Generar contrato', 'Generate contract') },
      { id: 'gwp1', kind: 'gatewayPlus', x: 590, y: 138, label: '' },
      { id: 'task3', kind: 'serviceTask', x: 720, y: 325, w: 130, h: 70, label: t('Crear cuentas', 'Create accounts') },
      { id: 'task4', kind: 'serviceTask', x: 880, y: 325, w: 130, h: 70, label: t('Asignar equipo', 'Assign device') },
      { id: 'task5', kind: 'userTask', x: 720, y: 525, w: 130, h: 70, label: t('Plan 30/60/90', '30/60/90 plan') },
      { id: 'task6', kind: 'userTask', x: 880, y: 525, w: 130, h: 70, label: t('Reunión 1:1', '1:1 meeting') },
      { id: 'gwp2', kind: 'gatewayPlus', x: 1060, y: 318, label: '' },
      { id: 'end1', kind: 'endEvent', x: 1180, y: 322, label: t('Onboarding listo', 'Onboarding done') },
    ];

    const flows = [
      { id: 'f1', from: 'start1', to: 'task1', path: 'M204 158 L260 158' },
      { id: 'f2', from: 'task1', to: 'task2', path: 'M390 160 L420 160' },
      { id: 'f3', from: 'task2', to: 'gwp1', path: 'M550 160 L590 160' },
      { id: 'f4', from: 'gwp1', to: 'task3', path: 'M626 198 L626 360 L720 360' },
      { id: 'f5', from: 'task3', to: 'task4', path: 'M850 360 L880 360' },
      { id: 'f6', from: 'gwp1', to: 'task5', path: 'M626 198 L626 560 L720 560' },
      { id: 'f7', from: 'task5', to: 'task6', path: 'M850 560 L880 560' },
      { id: 'f8', from: 'task4', to: 'gwp2', path: 'M1010 360 L1060 354' },
      { id: 'f9', from: 'task6', to: 'gwp2', path: 'M1010 560 L1096 560 L1096 390' },
      { id: 'f10', from: 'gwp2', to: 'end1', path: 'M1132 354 L1180 339' },
    ];

    return { elements, flows, name: t('Onboarding de Empleado', 'Employee Onboarding') };
  }

  // Empty diagram for new tabs
  const elements = [
    { id: 'pool1', kind: 'pool', x: 80, y: 80, w: 1400, h: 400, label: t('Nuevo proceso', 'New process') },
    { id: 'lane1', kind: 'lane', x: 120, y: 80, w: 1360, h: 400, label: t('Lane principal', 'Main lane') },
    { id: 'start1', kind: 'startEvent', x: 200, y: 262, label: '' },
  ];
  return { elements, flows: [], name: t('Sin título', 'Untitled') };
}

// ============ BPMN Canvas ============
function BpmnCanvas({ selectedId, onSelect, zoom, theme, lang, validation, diagramId, expandedSubprocesses, onToggleSubprocess }) {
  const t = (es, en) => lang === 'es' ? es : en;
  const { elements, flows } = getDiagramModel(diagramId, lang, expandedSubprocesses);

  return (
    <svg className="canvas-svg" viewBox="0 0 1600 1100" preserveAspectRatio="xMidYMid meet"
         style={{ transform: `scale(${zoom/100})`, transformOrigin: 'center center' }}>
      <defs>
        <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="9" markerHeight="9" orient="auto-start-reverse">
          <path d="M0 0 L10 5 L0 10 z" fill={theme === 'dark' ? '#cbd5e1' : '#334155'}/>
        </marker>
        <marker id="arrow-dashed" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
          <path d="M0 2 L10 5 L0 8 z" fill="none" stroke={theme === 'dark' ? '#94a3b8' : '#64748b'} strokeWidth="1.2"/>
        </marker>
      </defs>

      {/* Pool */}
      {elements.filter(e => e.kind === 'pool').map(p => (
        <g key={p.id} onClick={(e) => { e.stopPropagation(); onSelect(p.id); }} style={{cursor:'pointer'}}>
          <rect x={p.x} y={p.y} width={p.w} height={p.h} fill="var(--pool-fill)" stroke="var(--pool-stroke)" strokeWidth="1.5"/>
          <rect x={p.x} y={p.y} width="40" height={p.h} fill="var(--bg-2)" stroke="var(--pool-stroke)" strokeWidth="1.5"/>
          <text x={p.x + 20} y={p.y + p.h/2} className="lane-title" textAnchor="middle" transform={`rotate(-90 ${p.x+20} ${p.y + p.h/2})`}>{p.label}</text>
        </g>
      ))}

      {/* Lanes */}
      {elements.filter(e => e.kind === 'lane').map(l => (
        <g key={l.id} onClick={(e) => { e.stopPropagation(); onSelect(l.id); }} style={{cursor:'pointer'}}>
          <rect x={l.x} y={l.y} width={l.w} height={l.h} fill="var(--lane-fill)" stroke="var(--pool-stroke)" strokeWidth="1"/>
          <rect x={l.x} y={l.y} width="36" height={l.h} fill="transparent" stroke="var(--pool-stroke)" strokeWidth="1"/>
          <text x={l.x + 18} y={l.y + l.h/2} className="lane-title" textAnchor="middle" transform={`rotate(-90 ${l.x+18} ${l.y + l.h/2})`}>{l.label}</text>
        </g>
      ))}

      {/* Expanded subprocess containers (behind their inner elements) */}
      {elements.filter(e => e.kind === 'subprocessExpanded').map(sp => {
        const isSel = sp.id === selectedId;
        return (
          <g key={sp.id}>
            <rect x={sp.x} y={sp.y} width={sp.w} height={sp.h} rx="10" ry="10"
                  fill="var(--task-fill)" stroke="var(--task-stroke)" strokeWidth={isSel ? 2.5 : 2}
                  onClick={(e) => { e.stopPropagation(); onSelect(sp.id); }} style={{cursor:'pointer'}}/>
            <text x={sp.x + 10} y={sp.y + 18} fontSize="11.5" fontWeight="600" fill="var(--task-text)">{sp.label}</text>
            {/* collapse marker [-] */}
            <g className="subprocess-marker"
               onClick={(e) => { e.stopPropagation(); onToggleSubprocess(sp.id); }}
               transform={`translate(${sp.x + sp.w/2 - 9}, ${sp.y + sp.h - 22})`}>
              <rect width="18" height="14" rx="2" strokeWidth="1.3"/>
              <path d={`M4 7 L14 7`} stroke="var(--task-stroke)" strokeWidth="1.6" strokeLinecap="round"/>
            </g>
            {isSel && (
              <rect x={sp.x - 6} y={sp.y - 6} width={sp.w + 12} height={sp.h + 12} rx="12" className="sel-outline"/>
            )}
          </g>
        );
      })}

      {/* Flows */}
      {flows.map(f => (
        <g key={f.id}>
          <path d={f.path} className={`flow-line ${f.dashed ? 'dashed' : ''}`} markerEnd={f.dashed ? 'url(#arrow-dashed)' : 'url(#arrow)'}/>
          {f.label && (() => {
            const m = f.path.match(/M([\d.]+) ([\d.]+) L([\d.]+) ([\d.]+)/);
            if (!m) return null;
            const [_, x1, y1, x2, y2] = m.map(parseFloat);
            const cx = (x1+x2)/2, cy = (y1+y2)/2;
            return (
              <g>
                <rect x={cx - 18} y={cy - 18} width="36" height="14" rx="2" fill="var(--bg-1)" stroke="var(--border)"/>
                <text x={cx} y={cy - 8} className="bpmn-label-sm" textAnchor="middle">{f.label}</text>
              </g>
            );
          })()}
        </g>
      ))}

      {/* Tasks */}
      {elements.filter(e => ['userTask','serviceTask','sendTask','scriptTask','task'].includes(e.kind)).map(el => {
        const isSel = el.id === selectedId;
        const v = validation[el.id];
        return (
          <g key={el.id} onClick={(e) => { e.stopPropagation(); onSelect(el.id); }} style={{cursor:'pointer'}}>
            <rect x={el.x} y={el.y} width={el.w} height={el.h} rx="8" ry="8"
                  fill="var(--task-fill)" stroke="var(--task-stroke)" strokeWidth={isSel ? 2.5 : 1.5}/>
            <g transform={`translate(${el.x + 6}, ${el.y + 6})`}>
              {el.kind === 'userTask' && <g><circle cx="8" cy="6" r="2.2" fill="none" stroke="var(--task-stroke)" strokeWidth="1.2"/><path d="M4 14 Q8 10 12 14" fill="none" stroke="var(--task-stroke)" strokeWidth="1.2"/></g>}
              {el.kind === 'serviceTask' && <g><path d="M3 8 L13 8 M8 3 L8 13 M4 4 L12 12 M4 12 L12 4" stroke="var(--task-stroke)" strokeWidth="1.1"/><circle cx="8" cy="8" r="2" fill="var(--task-fill)" stroke="var(--task-stroke)" strokeWidth="1.1"/></g>}
              {el.kind === 'sendTask' && <g><rect x="2" y="4" width="12" height="8" rx="1" fill="var(--task-stroke)"/><path d="M2 4 L8 9 L14 4" fill="none" stroke="white" strokeWidth="1.2"/></g>}
            </g>
            {el.label && el.label.split('\n').map((line, i) => (
              <text key={i} x={el.x + el.w/2} y={el.y + el.h/2 - (el.label.split('\n').length-1)*7 + i*14}
                    className="bpmn-label" textAnchor="middle" dominantBaseline="middle">{line}</text>
            ))}
            {isSel && (
              <g>
                <rect x={el.x - 6} y={el.y - 6} width={el.w + 12} height={el.h + 12} rx="10" className="sel-outline"/>
                {[[el.x-6,el.y-6],[el.x+el.w+6,el.y-6],[el.x-6,el.y+el.h+6],[el.x+el.w+6,el.y+el.h+6]].map(([cx,cy],i)=>(
                  <rect key={i} x={cx-3} y={cy-3} width="6" height="6" className="sel-handle"/>
                ))}
              </g>
            )}
            {v && (
              <g transform={`translate(${el.x + el.w - 8}, ${el.y - 8})`}>
                <circle r="9" className={`val-marker ${v.severity}`}/>
                <text x="0" y="3.5" textAnchor="middle" fontSize="11" fontWeight="700"
                      fill={v.severity === 'err' ? 'var(--error)' : 'var(--warning)'}>!</text>
              </g>
            )}
          </g>
        );
      })}

      {/* Collapsed subprocess */}
      {elements.filter(e => e.kind === 'subprocessCollapsed').map(el => {
        const isSel = el.id === selectedId;
        return (
          <g key={el.id} onClick={(e) => { e.stopPropagation(); onSelect(el.id); }} style={{cursor:'pointer'}}>
            <rect x={el.x} y={el.y} width={el.w} height={el.h} rx="8" ry="8"
                  fill="var(--task-fill)" stroke="var(--task-stroke)" strokeWidth={isSel ? 2.5 : 1.8}/>
            {el.label && el.label.split('\n').map((line, i) => (
              <text key={i} x={el.x + el.w/2} y={el.y + el.h/2 - 8 + i*14}
                    className="bpmn-label" textAnchor="middle" dominantBaseline="middle">{line}</text>
            ))}
            {/* expand marker [+] */}
            <g className="subprocess-marker"
               onClick={(e) => { e.stopPropagation(); onToggleSubprocess(el.id); }}
               transform={`translate(${el.x + el.w/2 - 9}, ${el.y + el.h - 20})`}>
              <rect width="18" height="14" rx="2" strokeWidth="1.3"/>
              <path d="M9 4 L9 11 M5.5 7.5 L12.5 7.5" stroke="var(--task-stroke)" strokeWidth="1.6" strokeLinecap="round"/>
            </g>
            {isSel && (
              <rect x={el.x - 6} y={el.y - 6} width={el.w + 12} height={el.h + 12} rx="10" className="sel-outline"/>
            )}
          </g>
        );
      })}

      {/* Events */}
      {elements.filter(e => ['startEvent','endEvent','intermediateEvent'].includes(e.kind)).map(el => {
        const isSel = el.id === selectedId;
        const isStart = el.kind === 'startEvent';
        const isEnd = el.kind === 'endEvent';
        const r = el.innerOf ? 13 : 17;
        return (
          <g key={el.id} onClick={(e) => { e.stopPropagation(); onSelect(el.id); }} style={{cursor:'pointer'}}>
            <circle cx={el.x + r} cy={el.y + r} r={r}
                    fill={isStart ? 'var(--start-fill)' : isEnd ? 'var(--end-fill)' : 'var(--bg)'}
                    stroke={isStart ? 'var(--start-stroke)' : isEnd ? 'var(--end-stroke)' : 'var(--text-2)'}
                    strokeWidth={isEnd ? 3 : 2}/>
            {el.label && (
              <text x={el.x + r} y={el.y + r*2 + 16} className="bpmn-label-sm" textAnchor="middle">{el.label}</text>
            )}
            {isSel && <circle cx={el.x + r} cy={el.y + r} r={r + 5} className="sel-outline"/>}
          </g>
        );
      })}

      {/* Gateways */}
      {elements.filter(e => e.kind.startsWith('gateway')).map(el => {
        const isSel = el.id === selectedId;
        const cx = el.x + 36, cy = el.y + 36;
        const isPlus = el.kind === 'gatewayPlus';
        return (
          <g key={el.id} onClick={(e) => { e.stopPropagation(); onSelect(el.id); }} style={{cursor:'pointer'}}>
            <path d={`M${cx} ${cy-36} L${cx+36} ${cy} L${cx} ${cy+36} L${cx-36} ${cy} Z`}
                  fill="var(--gateway-fill)" stroke="var(--gateway-stroke)" strokeWidth={isSel ? 2.5 : 1.8}/>
            {isPlus
              ? <path d={`M${cx} ${cy-14} L${cx} ${cy+14} M${cx-14} ${cy} L${cx+14} ${cy}`} stroke="var(--gateway-stroke)" strokeWidth="2.4" strokeLinecap="round"/>
              : <path d={`M${cx-12} ${cy-12} L${cx+12} ${cy+12} M${cx+12} ${cy-12} L${cx-12} ${cy+12}`} stroke="var(--gateway-stroke)" strokeWidth="2" strokeLinecap="round"/>
            }
            {el.label && <text x={cx} y={cy + 56} className="bpmn-label-sm" textAnchor="middle">{el.label}</text>}
            {isSel && <path d={`M${cx} ${cy-44} L${cx+44} ${cy} L${cx} ${cy+44} L${cx-44} ${cy} Z`} className="sel-outline"/>}
          </g>
        );
      })}

      {/* Data objects */}
      {elements.filter(e => e.kind === 'dataObject').map(el => (
        <g key={el.id} onClick={(e) => { e.stopPropagation(); onSelect(el.id); }} style={{cursor:'pointer'}}>
          <path d={`M${el.x} ${el.y} L${el.x+22} ${el.y} L${el.x+30} ${el.y+8} L${el.x+30} ${el.y+38} L${el.x} ${el.y+38} Z`}
                fill="var(--bg)" stroke="var(--text-2)" strokeWidth="1.3"/>
          <path d={`M${el.x+22} ${el.y} L${el.x+22} ${el.y+8} L${el.x+30} ${el.y+8}`} fill="none" stroke="var(--text-2)" strokeWidth="1.3"/>
          <text x={el.x + 15} y={el.y + 56} className="bpmn-label-sm" textAnchor="middle">{el.label}</text>
        </g>
      ))}
    </svg>
  );
}

window.BpmnCanvas = BpmnCanvas;
window.getDiagramModel = getDiagramModel;
