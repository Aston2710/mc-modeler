/* global React */
const { useState: useStateP, useEffect: useEffectP } = React;

// ============ Properties Panel ============
function PropertiesPanel({ selectedId, lang, theme }) {
  const [tab, setTab] = useStateP('general');
  const [task, setTask] = useStateP({
    id: 'Activity_0xj4lp2',
    name: lang === 'es' ? 'Crear orden de compra' : 'Create purchase order',
    type: 'userTask',
    docVersion: '1.0',
    assignee: 'requester_role',
    candidateGroups: ['solicitantes', 'oficina'],
    priority: 'normal',
    dueDate: 'PT24H',
    formKey: 'oc-form-v2',
    multiInstance: false,
    asyncBefore: true,
    documentation: lang === 'es'
      ? 'El solicitante debe completar el formulario de OC con los datos del proveedor, ítems requeridos, cantidades, centro de costo y justificación. El sistema validará automáticamente el monto contra el presupuesto disponible antes de continuar al flujo de aprobación.'
      : 'The requester must fill the PO form with vendor info, required items, quantities, cost center and justification. The system will automatically validate the amount against available budget before continuing to the approval flow.',
  });
  const T = (es, en) => lang === 'es' ? es : en;
  const I = window.UIIcons;

  if (!selectedId) {
    return (
      <div className="props-empty">
        <svg viewBox="0 0 32 32" fill="none">
          <rect x="4" y="6" width="24" height="20" rx="2" stroke="currentColor" strokeWidth="1.5"/>
          <path d="M4 12h24M9 6v20" stroke="currentColor" strokeWidth="1.5"/>
        </svg>
        <div>
          <div style={{fontSize:13, fontWeight:500, color:'var(--text-2)', marginBottom:4}}>
            {T('Sin selección', 'No selection')}
          </div>
          <div style={{fontSize:11.5, lineHeight:1.5}}>
            {T('Selecciona un elemento del canvas para ver y editar sus propiedades.',
                'Select an element on the canvas to see and edit its properties.')}
          </div>
        </div>
      </div>
    );
  }

  return (
    <React.Fragment>
      <div className="selected-card">
        <div className="selected-icon">
          <svg viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="9" r="3" stroke="currentColor" strokeWidth="1.6"/>
            <path d="M5 19c1.5-3 4-4.5 7-4.5s5.5 1.5 7 4.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
          </svg>
        </div>
        <div className="selected-info">
          <div className="selected-type">{T('Tarea de usuario', 'User Task')}</div>
          <div className="selected-title">{task.name}</div>
          <div className="selected-id mono">{task.id}</div>
        </div>
      </div>

      <div className="tabs">
        <div className={`tab ${tab==='general'?'active':''}`} onClick={() => setTab('general')}>
          {T('General', 'General')}
        </div>
        <div className={`tab ${tab==='doc'?'active':''}`} onClick={() => setTab('doc')}>
          {T('Documentación', 'Documentation')}
        </div>
      </div>

      <div className="props-body">
        {tab === 'general' && (
          <React.Fragment>
            <div className="section">
              <div className="section-title">{T('Identidad', 'Identity')}<div className="line"/></div>
              <div className="field">
                <label className="field-label">{T('Nombre', 'Name')}<span className="req">*</span></label>
                <input className="input" value={task.name} onChange={e => setTask({...task, name: e.target.value})}/>
              </div>
              <div className="field">
                <label className="field-label">ID</label>
                <input className="input mono" value={task.id} onChange={e => setTask({...task, id: e.target.value})}/>
                <div className="field-help">{T('Identificador único usado en BPMN XML.', 'Unique identifier used in BPMN XML.')}</div>
              </div>
              <div className="field-row">
                <div className="field" style={{marginBottom:0}}>
                  <label className="field-label">{T('Tipo de tarea', 'Task type')}</label>
                  <select className="select" value={task.type} onChange={e => setTask({...task, type: e.target.value})}>
                    <option value="userTask">{T('Usuario', 'User')}</option>
                    <option value="serviceTask">{T('Servicio', 'Service')}</option>
                    <option value="scriptTask">{T('Script', 'Script')}</option>
                    <option value="sendTask">{T('Envío', 'Send')}</option>
                    <option value="receiveTask">{T('Recepción', 'Receive')}</option>
                    <option value="manualTask">{T('Manual', 'Manual')}</option>
                  </select>
                </div>
                <div className="field" style={{marginBottom:0}}>
                  <label className="field-label">{T('Prioridad', 'Priority')}</label>
                  <select className="select" value={task.priority} onChange={e => setTask({...task, priority: e.target.value})}>
                    <option value="low">{T('Baja', 'Low')}</option>
                    <option value="normal">{T('Normal', 'Normal')}</option>
                    <option value="high">{T('Alta', 'High')}</option>
                    <option value="urgent">{T('Urgente', 'Urgent')}</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="section">
              <div className="section-title">{T('Asignación', 'Assignment')}<div className="line"/></div>
              <div className="field">
                <label className="field-label">{T('Responsable', 'Assignee')}</label>
                <div className="assignee">
                  <div className="av">MR</div>
                  <div style={{flex:1, minWidth:0}}>
                    <div className="nm">María Rodríguez</div>
                    <div className="role">{T('Rol: Solicitante', 'Role: Requester')}</div>
                  </div>
                  <I.ChevDown/>
                </div>
              </div>
              <div className="field">
                <label className="field-label">{T('Grupos candidatos', 'Candidate groups')}</label>
                <div className="chip-set">
                  {task.candidateGroups.map(g => (
                    <span key={g} className="chip">{g}<span className="x" onClick={() => setTask({...task, candidateGroups: task.candidateGroups.filter(x => x !== g)})}>×</span></span>
                  ))}
                  <span className="chip chip-add">+ {T('agregar', 'add')}</span>
                </div>
              </div>
            </div>

            <div className="section">
              <div className="section-title">{T('Formulario', 'Form')}<div className="line"/></div>
              <div className="field">
                <label className="field-label">Form key</label>
                <input className="input mono" value={task.formKey} onChange={e => setTask({...task, formKey: e.target.value})}/>
              </div>
              <div className="field">
                <label className="field-label">{T('Vencimiento (ISO 8601)', 'Due date (ISO 8601)')}</label>
                <input className="input mono" value={task.dueDate} onChange={e => setTask({...task, dueDate: e.target.value})}/>
                <div className="field-help">{T('PT24H = 24 horas desde la creación.', 'PT24H = 24 hours from creation.')}</div>
              </div>
            </div>

            <div className="section">
              <div className="section-title">{T('Comportamiento', 'Behavior')}<div className="line"/></div>
              <div className="field" style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}>
                <div>
                  <div style={{fontSize:12.5, fontWeight:500}}>{T('Multi-instancia', 'Multi-instance')}</div>
                  <div style={{fontSize:11, color:'var(--text-3)', marginTop:2}}>{T('Ejecutar en paralelo por cada item', 'Run in parallel per item')}</div>
                </div>
                <div className={`toggle ${task.multiInstance ? 'on' : ''}`} onClick={() => setTask({...task, multiInstance: !task.multiInstance})}>
                  <div className="switch"/>
                </div>
              </div>
              <div className="field" style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}>
                <div>
                  <div style={{fontSize:12.5, fontWeight:500}}>{T('Async antes', 'Async before')}</div>
                  <div style={{fontSize:11, color:'var(--text-3)', marginTop:2}}>{T('Punto de persistencia previo', 'Persistence checkpoint before')}</div>
                </div>
                <div className={`toggle ${task.asyncBefore ? 'on' : ''}`} onClick={() => setTask({...task, asyncBefore: !task.asyncBefore})}>
                  <div className="switch"/>
                </div>
              </div>
            </div>

            <div className="section">
              <div className="section-title">{T('Variables de entrada', 'Input variables')}<div className="line"/></div>
              <div className="kvp">
                <input className="input mono" defaultValue="orderId" placeholder="key"/>
                <input className="input mono" defaultValue="${execution.orderId}" placeholder="value"/>
                <div className="del"><I.Trash/></div>
              </div>
              <div className="kvp">
                <input className="input mono" defaultValue="vendor" placeholder="key"/>
                <input className="input mono" defaultValue="${vendor.name}" placeholder="value"/>
                <div className="del"><I.Trash/></div>
              </div>
              <div className="add-btn"><I.Plus2/> {T('Agregar variable', 'Add variable')}</div>
            </div>
          </React.Fragment>
        )}

        {tab === 'doc' && (
          <React.Fragment>
            <div className="section">
              <div className="section-title">{T('Descripción', 'Description')}<div className="line"/></div>
              <textarea className="textarea" rows="8" value={task.documentation}
                        onChange={e => setTask({...task, documentation: e.target.value})}/>
              <div className="field-help" style={{marginTop:6}}>
                {T('Soporta Markdown. Visible en el ejecutor durante runtime.',
                   'Supports Markdown. Visible in the runtime executor.')}
              </div>
            </div>
            <div className="section">
              <div className="section-title">{T('Versión', 'Version')}<div className="line"/></div>
              <div className="field-row">
                <div className="field" style={{marginBottom:0}}>
                  <label className="field-label">{T('Versión doc.', 'Doc version')}</label>
                  <input className="input mono" value={task.docVersion} onChange={e => setTask({...task, docVersion: e.target.value})}/>
                </div>
                <div className="field" style={{marginBottom:0}}>
                  <label className="field-label">{T('Última edición', 'Last edited')}</label>
                  <input className="input" value="hace 2 horas" disabled/>
                </div>
              </div>
            </div>
            <div className="section">
              <div className="section-title">{T('Enlaces', 'Links')}<div className="line"/></div>
              <div className="chip-set">
                <span className="chip">📎 SOP-COMPRAS-v3.pdf</span>
                <span className="chip">📎 PoliticaProveedores.docx</span>
                <span className="chip chip-add">+ {T('adjuntar', 'attach')}</span>
              </div>
            </div>
          </React.Fragment>
        )}
      </div>
    </React.Fragment>
  );
}

window.PropertiesPanel = PropertiesPanel;
