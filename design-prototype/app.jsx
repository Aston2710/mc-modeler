/* global React */
const { useState: useStateA, useEffect: useEffectA, useRef: useRefA } = React;

function App() {
  const I = window.UIIcons;
  const BPI = window.BpmnIcons;

  // ===== State =====
  const [theme, setTheme] = useStateA('light');
  const [lang, setLang] = useStateA('es');
  const [view, setView] = useStateA('editor');
  const [zoom, setZoom] = useStateA(85);
  const [selectedId, setSelectedId] = useStateA('task1');
  const [leftCollapsed, setLeftCollapsed] = useStateA(false);
  const [rightCollapsed, setRightCollapsed] = useStateA(false);
  const [showExport, setShowExport] = useStateA(false);
  const [showShortcuts, setShowShortcuts] = useStateA(false);
  const [exportFormat, setExportFormat] = useStateA('bpmn');
  const [collapsedCats, setCollapsedCats] = useStateA({});
  const [paletteSearch, setPaletteSearch] = useStateA('');
  const [expandedSubprocesses, setExpandedSubprocesses] = useStateA({});
  const [editingTabId, setEditingTabId] = useStateA(null);

  // Multi-tab diagrams
  const [tabs, setTabs] = useStateA([
    { id: 'd1', name: 'Aprobación de Orden de Compra', folder: 'Compras', dirty: true },
    { id: 'd2', name: 'Onboarding de Empleado', folder: 'RRHH', dirty: false },
  ]);
  const [activeTabId, setActiveTabId] = useStateA('d1');

  const T = (es, en) => lang === 'es' ? es : en;

  useEffectA(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  const validation = {
    'task4': { severity: 'err', msg: T('Falta destinatario en mensaje', 'Missing message recipient') },
    'gw1':   { severity: 'warn', msg: T('Condición sin etiqueta', 'Unlabeled condition') },
  };

  const activeTab = tabs.find(t => t.id === activeTabId) || tabs[0];

  const addTab = () => {
    const newId = 'd' + Date.now();
    const n = tabs.length + 1;
    setTabs([...tabs, { id: newId, name: T(`Diagrama ${n}`, `Diagram ${n}`), folder: '', dirty: false }]);
    setActiveTabId(newId);
    setSelectedId(null);
    setExpandedSubprocesses({});
  };

  const closeTab = (id, e) => {
    e.stopPropagation();
    if (tabs.length === 1) return;
    const idx = tabs.findIndex(t => t.id === id);
    const newTabs = tabs.filter(t => t.id !== id);
    setTabs(newTabs);
    if (activeTabId === id) {
      setActiveTabId(newTabs[Math.max(0, idx - 1)].id);
    }
  };

  const renameTab = (id, name) => {
    setTabs(tabs.map(t => t.id === id ? { ...t, name } : t));
  };

  const toggleSubprocess = (id) => {
    setExpandedSubprocesses(prev => ({ ...prev, [id]: !prev[id] }));
    setSelectedId(id);
  };

  const categories = [
    { id: 'events', label: T('Eventos', 'Events'), items: [
      { id: 'startEvent', label: T('Inicio', 'Start'), icon: <BPI.StartEvent/> },
      { id: 'startTimer', label: T('Inicio temporizador', 'Start timer'), icon: <BPI.StartTimer/> },
      { id: 'startMessage', label: T('Inicio mensaje', 'Start message'), icon: <BPI.StartMessage/> },
      { id: 'intermediate', label: T('Intermedio', 'Intermediate'), icon: <BPI.Intermediate/> },
      { id: 'endEvent', label: T('Fin', 'End'), icon: <BPI.EndEvent/> },
      { id: 'endMessage', label: T('Fin mensaje', 'End message'), icon: <BPI.EndMessage/> },
    ]},
    { id: 'activities', label: T('Actividades', 'Activities'), items: [
      { id: 'task', label: T('Tarea', 'Task'), icon: <BPI.Task/> },
      { id: 'userTask', label: T('Tarea usuario', 'User task'), icon: <BPI.UserTask/> },
      { id: 'serviceTask', label: T('Servicio', 'Service'), icon: <BPI.ServiceTask/> },
      { id: 'scriptTask', label: T('Script', 'Script'), icon: <BPI.ScriptTask/> },
      { id: 'sendTask', label: T('Envío', 'Send'), icon: <BPI.SendTask/> },
      { id: 'subprocess', label: T('Subproceso', 'Subprocess'), icon: <BPI.Subprocess/> },
    ]},
    { id: 'gateways', label: T('Compuertas', 'Gateways'), items: [
      { id: 'gatewayX', label: T('Exclusiva (XOR)', 'Exclusive (XOR)'), icon: <BPI.GatewayX/> },
      { id: 'gatewayPlus', label: T('Paralela (AND)', 'Parallel (AND)'), icon: <BPI.GatewayPlus/> },
      { id: 'gatewayCircle', label: T('Inclusiva (OR)', 'Inclusive (OR)'), icon: <BPI.GatewayCircle/> },
      { id: 'gatewayEvent', label: T('Basada en evento', 'Event-based'), icon: <BPI.GatewayEvent/> },
    ]},
    { id: 'flows', label: T('Conexiones', 'Connections'), items: [
      { id: 'seqFlow', label: T('Flujo secuencial', 'Sequence flow'), icon: <BPI.SeqFlow/> },
      { id: 'msgFlow', label: T('Flujo de mensaje', 'Message flow'), icon: <BPI.MsgFlow/> },
      { id: 'association', label: T('Asociación', 'Association'), icon: <BPI.Association/> },
      { id: 'textAnnotation', label: T('Anotación', 'Annotation'), icon: <BPI.TextAnnotation/> },
    ]},
    { id: 'containers', label: T('Contenedores', 'Containers'), items: [
      { id: 'pool', label: 'Pool', icon: <BPI.Pool/> },
      { id: 'lane', label: 'Lane', icon: <BPI.Lane/> },
      { id: 'dataObject', label: T('Objeto datos', 'Data object'), icon: <BPI.DataObject/> },
      { id: 'dataStore', label: T('Almacén', 'Data store'), icon: <BPI.DataStore/> },
    ]},
  ];

  if (view === 'home') {
    return (
      <window.HomeView
        onOpen={(id) => {
          if (id && !tabs.find(t => t.id === id)) {
            const sample = { d1: 'Aprobación de Orden de Compra', d2: 'Onboarding de Empleado',
                             d3: 'Atención de Ticket', d4: 'Reclamo de Seguro', d5: 'Facturación Recurrente',
                             d6: 'Devolución', d7: 'Onboarding B2B', d8: 'Cierre Contable' };
            setTabs([...tabs, { id, name: sample[id] || 'Diagrama', folder: '', dirty: false }]);
          }
          if (id) setActiveTabId(id);
          setView('editor');
        }}
        lang={lang}
        theme={theme}
        onToggleTheme={() => setTheme(t => t === 'light' ? 'dark' : 'light')}
        onToggleLang={() => setLang(l => l === 'es' ? 'en' : 'es')}
      />
    );
  }

  return (
    <div className="app">
      {/* TOOLBAR */}
      <div className="toolbar">
        <div className="brand" onClick={() => setView('home')} style={{cursor:'pointer'}}>
          <div className="brand-mark">
            <svg viewBox="0 0 24 24" fill="none">
              <circle cx="6" cy="6" r="3" stroke="white" strokeWidth="2"/>
              <path d="M9 6h6M15 6l-3 3M15 6l-3-3" stroke="white" strokeWidth="2" strokeLinecap="round"/>
              <rect x="14" y="9" width="6" height="6" rx="1" stroke="white" strokeWidth="2"/>
            </svg>
          </div>
          <div className="brand-name">Flujo<span className="dot">.</span></div>
        </div>

        <button className="icon-btn" onClick={() => setView('home')} title={T('Inicio','Home')}><I.Home/></button>

        <div className="diagram-name">
          {activeTab.folder && <span className="diagram-path mono">{activeTab.folder} /</span>}
          <input value={activeTab.name} onChange={e => renameTab(activeTab.id, e.target.value)}/>
          <span className="diagram-badge mono">v2.3</span>
        </div>

        <div className="tb-spacer"/>

        <div className="tb-group">
          <button className="icon-btn" title={T('Nuevo (⌘N)', 'New (⌘N)')} onClick={addTab}><I.Plus/></button>
          <button className="icon-btn" title={T('Importar', 'Import')}><I.FolderUp/></button>
          <button className="icon-btn" onClick={() => setShowExport(true)} title={T('Exportar', 'Export')}><I.Download/></button>
        </div>

        <div className="tb-group tb-hide-sm">
          <button className="icon-btn" title={T('Validar', 'Validate')}>
            <I.Check/> <span className="label">{T('Validar','Validate')}</span>
          </button>
        </div>

        <div className="tb-group tb-hide-md">
          <button className="icon-btn" title={T('Deshacer', 'Undo')}><I.Undo/></button>
          <button className="icon-btn" title={T('Rehacer', 'Redo')} disabled><I.Redo/></button>
        </div>

        <div className="tb-group">
          <div className="zoom-pill">
            <button onClick={() => setZoom(z => Math.max(25, z - 10))} title="Zoom out"><I.Minus/></button>
            <div className="zoom-val">{zoom}%</div>
            <button onClick={() => setZoom(z => Math.min(200, z + 10))} title="Zoom in"><I.Plus2/></button>
            <button onClick={() => setZoom(85)} title="Fit"><I.Fit/></button>
          </div>
        </div>

        <div className="tb-group">
          <div className="lang-toggle">
            <button className={lang==='es'?'active':''} onClick={() => setLang('es')}>ES</button>
            <button className={lang==='en'?'active':''} onClick={() => setLang('en')}>EN</button>
          </div>
          <button className="icon-btn" onClick={() => setTheme(t => t === 'light' ? 'dark' : 'light')} title={T('Modo','Theme')}>
            {theme === 'dark' ? <I.Sun/> : <I.Moon/>}
          </button>
          <button className="icon-btn tb-hide-md" onClick={() => setShowShortcuts(true)} title={T('Atajos (?)', 'Shortcuts (?)')}><I.Keyboard/></button>
        </div>

        <button className="btn-primary"><I.Save/> <span className="tb-hide-sm">{T('Guardar', 'Save')}</span></button>

        <div style={{display:'flex', marginLeft:6}} className="tb-hide-md">
          <div className="avatar" style={{background: 'linear-gradient(135deg, #4f46e5, #8b5cf6)'}}>MR</div>
          <div className="avatar" style={{background: 'linear-gradient(135deg, #06b6d4, #3b82f6)', marginLeft:-8}}>JP</div>
        </div>
      </div>

      {/* TABS BAR */}
      <div className="tabs-bar">
        <div className="tabs-scroll">
          {tabs.map(tab => (
            <div key={tab.id}
                 className={`dtab ${tab.id === activeTabId ? 'active' : ''}`}
                 onClick={() => { setActiveTabId(tab.id); setSelectedId(null); }}
                 onDoubleClick={() => setEditingTabId(tab.id)}>
              <span className="dt-icon">
                <svg viewBox="0 0 14 14" width="13" height="13" fill="none">
                  <rect x="1.5" y="2" width="11" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.3"/>
                  <circle cx="4" cy="6.5" r="1.2" fill="currentColor"/>
                  <rect x="6.5" y="5.5" width="3" height="2" rx=".4" fill="currentColor"/>
                </svg>
              </span>
              <span className="dt-name">
                {editingTabId === tab.id ? (
                  <input autoFocus
                    value={tab.name}
                    onChange={e => renameTab(tab.id, e.target.value)}
                    onBlur={() => setEditingTabId(null)}
                    onKeyDown={e => { if (e.key === 'Enter' || e.key === 'Escape') setEditingTabId(null); }}
                    onClick={e => e.stopPropagation()}/>
                ) : tab.name}
              </span>
              {tab.dirty && <span className="dt-dirty"/>}
              {tabs.length > 1 && (
                <button className="dt-close" onClick={(e) => closeTab(tab.id, e)} title={T('Cerrar','Close')}>
                  <I.X/>
                </button>
              )}
            </div>
          ))}
        </div>
        <button className="tab-add" onClick={addTab} title={T('Nuevo diagrama','New diagram')}><I.Plus/></button>
        <div className="breadcrumb">
          <span className="crumb" onClick={() => setView('home')}>{T('Proyecto','Project')}</span>
          <span className="sep">/</span>
          <span className="crumb current">{activeTab.name}</span>
          {Object.keys(expandedSubprocesses).filter(k => expandedSubprocesses[k]).map(spId => (
            <React.Fragment key={spId}>
              <span className="sep">/</span>
              <span className="crumb current">{T('Subproceso','Subprocess')}</span>
            </React.Fragment>
          ))}
        </div>
      </div>

      {/* BODY */}
      <div className={`body ${leftCollapsed?'left-collapsed':''} ${rightCollapsed?'right-collapsed':''}`}>
        {leftCollapsed ? (
          <div className="collapsed-rail">
            <button className="icon-btn" onClick={() => setLeftCollapsed(false)} title={T('Expandir','Expand')}><I.ChevRight/></button>
            <div style={{height:1, background:'var(--border)', width:24, margin:'4px 0'}}/>
            <button className="icon-btn"><BPI.Task size={18}/></button>
            <button className="icon-btn"><BPI.GatewayX size={18}/></button>
            <button className="icon-btn"><BPI.StartEvent size={18}/></button>
          </div>
        ) : (
          <div className="sidebar-l">
            <div className="sb-header">
              <div className="sb-title">{T('Paleta', 'Palette')}</div>
              <button className="sb-collapse-btn" onClick={() => setLeftCollapsed(true)} title={T('Colapsar','Collapse')}><I.ChevLeft/></button>
            </div>
            <div className="palette-search">
              <I.Search/>
              <input placeholder={T('Buscar...', 'Search...')} value={paletteSearch} onChange={e => setPaletteSearch(e.target.value)}/>
            </div>
            <div className="palette">
              {categories.map(cat => {
                const filtered = paletteSearch ? cat.items.filter(i => i.label.toLowerCase().includes(paletteSearch.toLowerCase())) : cat.items;
                if (filtered.length === 0) return null;
                const collapsed = collapsedCats[cat.id];
                return (
                  <div key={cat.id} className="cat">
                    <div className={`cat-header ${collapsed ? 'collapsed' : ''}`}
                         onClick={() => setCollapsedCats(c => ({...c, [cat.id]: !c[cat.id]}))}>
                      <svg className="chev" viewBox="0 0 12 12"><path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round"/></svg>
                      <span>{cat.label}</span>
                      <span style={{marginLeft:'auto', fontSize:10, color:'var(--text-3)'}}>{filtered.length}</span>
                    </div>
                    <div className={`cat-items ${collapsed ? 'collapsed' : ''}`}>
                      {filtered.map(item => (
                        <div key={item.id} className="pal-item" draggable>
                          {item.icon}
                          <div className="tt">{item.label}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* CANVAS */}
        <div className="canvas-wrap" onClick={() => setSelectedId(null)}>
          <div className="canvas-bg"/>
          <window.BpmnCanvas
            selectedId={selectedId}
            onSelect={(id) => setSelectedId(id)}
            zoom={zoom}
            theme={theme}
            lang={lang}
            validation={validation}
            diagramId={activeTabId}
            expandedSubprocesses={expandedSubprocesses}
            onToggleSubprocess={toggleSubprocess}
          />

          <div className="canvas-overlay-tl" onClick={e => e.stopPropagation()}>
            <div style={{display:'flex', gap:6}}>
              {activeTabId === 'd1' && (
                <div className="canvas-chip warn">
                  <span className="pill-dot"/>
                  <span>1 {T('error', 'error')}, 1 {T('advertencia', 'warning')}</span>
                </div>
              )}
              <div className="canvas-chip"><I.Layers/> {activeTabId === 'd1' ? 14 : activeTabId === 'd2' ? 13 : 3} {T('elementos', 'elements')}</div>
            </div>
          </div>

          <div className="canvas-overlay-tr" onClick={e => e.stopPropagation()}>
            <div className="floating-tools">
              <button className="icon-btn active" title={T('Seleccionar', 'Select')}><I.Cursor/></button>
              <button className="icon-btn" title={T('Mover', 'Pan')}><I.Hand/></button>
              <button className="icon-btn" title={T('Comentar', 'Comment')}><I.Comment/></button>
            </div>
          </div>

          <div className="canvas-overlay-br" onClick={e => e.stopPropagation()}>
            <div className="minimap">
              <div className="minimap-header">
                <span><I.Map/> {T('Vista general', 'Overview')}</span>
                <span className="mono">{zoom}%</span>
              </div>
              <div className="minimap-body">
                <svg viewBox="0 0 200 100" style={{width:'100%', height:'100%'}}>
                  <rect x="6" y="6" width="188" height="88" fill="none" stroke="var(--pool-stroke)" strokeWidth=".8"/>
                  <line x1="6" y1="34" x2="194" y2="34" stroke="var(--pool-stroke)" strokeWidth=".5"/>
                  <line x1="6" y1="64" x2="194" y2="64" stroke="var(--pool-stroke)" strokeWidth=".5"/>
                  <circle cx="18" cy="20" r="3" fill="var(--start-fill)" stroke="var(--start-stroke)"/>
                  <rect x="28" y="16" width="14" height="8" rx="1" fill="var(--task-fill)" stroke="var(--task-stroke)" strokeWidth=".6"/>
                  <rect x="48" y="16" width="14" height="8" rx="1" fill="var(--task-fill)" stroke="var(--task-stroke)" strokeWidth=".6"/>
                  <path d="M70 20 l4 -4 l4 4 l-4 4 z" fill="var(--gateway-fill)" stroke="var(--gateway-stroke)" strokeWidth=".6"/>
                  <rect x="84" y="46" width="14" height="8" rx="1" fill="var(--task-fill)" stroke="var(--task-stroke)" strokeWidth=".6"/>
                  <circle cx="142" cy="80" r="3" fill="var(--end-fill)" stroke="var(--end-stroke)" strokeWidth="1"/>
                  <rect x="20" y="10" width="120" height="60" fill="rgba(79,70,229,.08)" stroke="var(--primary)" strokeWidth="1.5"/>
                </svg>
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT */}
        {rightCollapsed ? (
          <div className="collapsed-rail right">
            <button className="icon-btn" onClick={() => setRightCollapsed(false)} title={T('Expandir', 'Expand')}><I.ChevLeft/></button>
            <div style={{height:1, background:'var(--border)', width:24, margin:'4px 0'}}/>
            <button className="icon-btn"><I.Settings/></button>
            <button className="icon-btn"><I.Doc/></button>
          </div>
        ) : (
          <div className="sidebar-r">
            <div className="sb-header">
              <div className="sb-title">{T('Propiedades', 'Properties')}</div>
              <button className="sb-collapse-btn" onClick={() => setRightCollapsed(true)} title={T('Colapsar', 'Collapse')}><I.ChevRight/></button>
            </div>
            <window.PropertiesPanel selectedId={selectedId} lang={lang} theme={theme}/>
          </div>
        )}
      </div>

      {/* STATUS BAR */}
      <div className="statusbar">
        <div className="sb-item"><span className="dot"/><span>{T('Guardado hace 12 s', 'Saved 12s ago')}</span></div>
        <div className="sb-item"><span className="mono">{zoom}%</span><span style={{color:'var(--text-3)'}} className="sb-hide-sm">· {T('zoom', 'zoom')}</span></div>
        <div className="sb-item"><span><b>{tabs.length}</b> {T('pestañas', 'tabs')}</span></div>
        <div className="sb-item warn"><span className="dot"/><span>1 {T('error', 'error')} · 1 {T('advert.', 'warn.')}</span></div>
        <div className="sb-spacer"/>
        <div className="sb-item sb-hide-sm">
          <button onClick={() => setShowShortcuts(true)}>{T('Atajos', 'Shortcuts')} <span className="mono" style={{color:'var(--text-3)'}}>?</span></button>
        </div>
        <div className="sb-item sb-hide-xs"><span className="mono" style={{color:'var(--text-3)'}}>BPMN 2.0</span></div>
      </div>

      {/* EXPORT MODAL */}
      {showExport && (
        <div className="modal-backdrop" onClick={() => setShowExport(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <div className="modal-title">{T('Exportar diagrama', 'Export diagram')}</div>
                <div className="modal-sub">{activeTab.name} · {T('Elige el formato y opciones', 'Pick format and options')}</div>
              </div>
              <button className="icon-btn" onClick={() => setShowExport(false)}><I.X/></button>
            </div>
            <div className="modal-body">
              <div className="fmt-grid">
                {[
                  {id:'bpmn', icon:'XML', name:'BPMN 2.0 XML', desc:T('Formato estándar interoperable.','Interoperable standard.')},
                  {id:'png', icon:'PNG', name:'Imagen PNG', desc:T('Bitmap a alta resolución.','High-res bitmap.')},
                  {id:'svg', icon:'SVG', name:T('Vectorial SVG','Vector SVG'), desc:T('Editable y escalable.','Scalable and editable.')},
                  {id:'pdf', icon:'PDF', name:T('Documento PDF','PDF document'), desc:T('Listo para imprimir.','Print-ready.')},
                ].map(f => (
                  <div key={f.id} className={`fmt-card ${exportFormat===f.id?'selected':''}`} onClick={() => setExportFormat(f.id)}>
                    <div className="fmt-icon">{f.icon}</div>
                    <div><div className="fmt-name">{f.name}</div><div className="fmt-desc">{f.desc}</div></div>
                  </div>
                ))}
              </div>
              <div className="section-title" style={{marginBottom:8}}>{T('Opciones', 'Options')}<div className="line"/></div>
              <div className="opt-row">
                <div><div className="opt-name">{T('Incluir documentación', 'Include documentation')}</div><div className="opt-desc">{T('Embebe descripciones de cada elemento.','Embed each element\u2019s description.')}</div></div>
                <div className="toggle on"><div className="switch"/></div>
              </div>
              <div className="opt-row">
                <div><div className="opt-name">{T('Incluir todas las pestañas','Include all tabs')}</div><div className="opt-desc">{T(`Exportar las ${tabs.length} pestañas en un solo archivo.`, `Export all ${tabs.length} tabs in one file.`)}</div></div>
                <div className="toggle"><div className="switch"/></div>
              </div>
              <div className="opt-row">
                <div><div className="opt-name">{T('Resolución', 'Resolution')}</div><div className="opt-desc">{T('Aplica a PNG y PDF.','Applies to PNG and PDF.')}</div></div>
                <select className="select" style={{width:140}}>
                  <option>1x</option><option>2x</option><option>3x</option>
                </select>
              </div>
            </div>
            <div className="modal-footer">
              <div style={{fontSize:11.5, color:'var(--text-3)'}}>1 {T('error pendiente', 'error pending')}</div>
              <div style={{display:'flex', gap:8}}>
                <button className="btn-ghost" onClick={() => setShowExport(false)}>{T('Cancelar', 'Cancel')}</button>
                <button className="btn-primary" onClick={() => setShowExport(false)}><I.Download/> {T('Exportar', 'Export')} {exportFormat.toUpperCase()}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SHORTCUTS MODAL */}
      {showShortcuts && (
        <div className="modal-backdrop" onClick={() => setShowShortcuts(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{width:'min(720px,92vw)'}}>
            <div className="modal-header">
              <div><div className="modal-title">{T('Atajos de teclado', 'Keyboard shortcuts')}</div></div>
              <button className="icon-btn" onClick={() => setShowShortcuts(false)}><I.X/></button>
            </div>
            <div className="modal-body">
              <div className="shortcuts-grid">
                {[
                  [T('Nuevo diagrama','New diagram'),['⌘','N']],[T('Guardar','Save'),['⌘','S']],
                  [T('Deshacer','Undo'),['⌘','Z']],[T('Rehacer','Redo'),['⌘','⇧','Z']],
                  [T('Copiar','Copy'),['⌘','C']],[T('Pegar','Paste'),['⌘','V']],
                  [T('Eliminar','Delete'),['⌫']],[T('Seleccionar todo','Select all'),['⌘','A']],
                  [T('Zoom in','Zoom in'),['⌘','+']],[T('Zoom out','Zoom out'),['⌘','-']],
                  [T('Cerrar pestaña','Close tab'),['⌘','W']],[T('Siguiente pestaña','Next tab'),['⌘','⇥']],
                  [T('Validar','Validate'),['⌘','⇧','V']],[T('Exportar','Export'),['⌘','E']],
                  [T('Buscar','Find'),['⌘','F']],[T('Atajos','Shortcuts'),['?']],
                ].map(([lbl,keys],i) => (
                  <div key={i} className="kbd-row">
                    <span className="lbl">{lbl}</span>
                    <span className="kbd">{keys.map((k,j)=><kbd key={j}>{k}</kbd>)}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="modal-footer">
              <div style={{fontSize:11.5, color:'var(--text-3)'}}>{T('En Windows usa Ctrl en lugar de ⌘','On Windows use Ctrl instead of ⌘')}</div>
              <button className="btn-primary" onClick={() => setShowShortcuts(false)}>{T('Entendido', 'Got it')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App/>);
