/* global React */
const { useState: useStateH } = React;

// ============ Home / Diagrams List ============
function HomeView({ onOpen, onClose, lang, theme, onToggleTheme, onToggleLang }) {
  const T = (es, en) => lang === 'es' ? es : en;
  const [filter, setFilter] = useStateH('all');
  const [query, setQuery] = useStateH('');
  const I = window.UIIcons;

  const diagrams = [
    { id: 'd1', name: T('Aprobación de Orden de Compra', 'Purchase Order Approval'), folder: 'Compras', author: 'M. Rodríguez', updated: T('hace 2 horas', '2h ago'), status: 'published', elements: 14, version: '2.3', favorite: true },
    { id: 'd2', name: T('Onboarding de Empleado', 'Employee Onboarding'), folder: 'RRHH', author: 'C. Vega', updated: T('ayer', 'yesterday'), status: 'draft', elements: 22, version: '0.8' },
    { id: 'd3', name: T('Atención de Ticket de Soporte', 'Support Ticket Handling'), folder: 'IT', author: 'J. Peña', updated: T('hace 3 días', '3d ago'), status: 'published', elements: 18, version: '1.4' },
    { id: 'd4', name: T('Reclamo de Seguro Médico', 'Health Insurance Claim'), folder: 'Operaciones', author: 'L. Soto', updated: T('hace 1 semana', '1w ago'), status: 'review', elements: 31, version: '3.0' },
    { id: 'd5', name: T('Facturación Recurrente', 'Recurring Billing'), folder: 'Finanzas', author: 'A. Mora', updated: T('hace 2 semanas', '2w ago'), status: 'published', elements: 9, version: '1.1' },
    { id: 'd6', name: T('Devolución de Producto', 'Product Return'), folder: 'E-commerce', author: 'D. Cruz', updated: T('hace 1 mes', '1mo ago'), status: 'draft', elements: 16, version: '0.4' },
    { id: 'd7', name: T('Onboarding de Cliente B2B', 'B2B Customer Onboarding'), folder: 'Ventas', author: 'P. Ríos', updated: T('hace 1 mes', '1mo ago'), status: 'published', elements: 27, version: '2.0' },
    { id: 'd8', name: T('Cierre Contable Mensual', 'Monthly Accounting Close'), folder: 'Finanzas', author: 'R. Núñez', updated: T('hace 2 meses', '2mo ago'), status: 'published', elements: 24, version: '4.2' },
  ];

  const filtered = diagrams.filter(d => {
    if (query && !d.name.toLowerCase().includes(query.toLowerCase())) return false;
    if (filter === 'all') return true;
    if (filter === 'mine') return d.author.includes('Rodríguez');
    if (filter === 'fav') return d.favorite;
    return d.status === filter;
  });

  const counts = {
    all: diagrams.length,
    mine: diagrams.filter(d => d.author.includes('Rodríguez')).length,
    published: diagrams.filter(d => d.status === 'published').length,
    draft: diagrams.filter(d => d.status === 'draft').length,
    review: diagrams.filter(d => d.status === 'review').length,
  };

  return (
    <div className="home">
      <div className="toolbar">
        <div className="brand">
          <div className="brand-mark">
            <svg viewBox="0 0 24 24" fill="none">
              <circle cx="6" cy="6" r="3" stroke="white" strokeWidth="2"/>
              <path d="M9 6h6M15 6l-3 3M15 6l-3-3" stroke="white" strokeWidth="2" strokeLinecap="round"/>
              <rect x="14" y="9" width="6" height="6" rx="1" stroke="white" strokeWidth="2"/>
            </svg>
          </div>
          <div className="brand-name">Flujo<span className="dot">.</span></div>
        </div>
        <div style={{fontSize:12, color:'var(--text-3)'}}>/ {T('Mis diagramas', 'My diagrams')}</div>
        <div className="tb-spacer"/>
        <div className="lang-toggle">
          <button className={lang==='es'?'active':''} onClick={onToggleLang}>ES</button>
          <button className={lang==='en'?'active':''} onClick={onToggleLang}>EN</button>
        </div>
        <button className="icon-btn" onClick={onToggleTheme} title="Theme">
          {theme === 'dark' ? <I.Sun/> : <I.Moon/>}
        </button>
        <div className="avatar">MR</div>
      </div>

      <div className="home-content">
        <div className="home-hero">
          <div>
            <h1>{T('Diagramas', 'Diagrams')}</h1>
            <p>{T('8 diagramas BPMN en 6 carpetas', '8 BPMN diagrams across 6 folders')}</p>
          </div>
          <div style={{display:'flex', gap:10, alignItems:'center'}}>
            <div className="home-search">
              <I.Search/>
              <input placeholder={T('Buscar diagramas...', 'Search diagrams...')} value={query} onChange={e => setQuery(e.target.value)}/>
            </div>
            <button className="btn-ghost"><I.FolderUp/> {T('Importar', 'Import')}</button>
            <button className="btn-primary" onClick={() => onOpen('d1')}><I.Plus/> {T('Nuevo diagrama', 'New diagram')}</button>
          </div>
        </div>

        <div className="home-filter-bar">
          <div className={`filter-pill ${filter==='all'?'active':''}`} onClick={()=>setFilter('all')}>{T('Todos', 'All')}<span className="count">{counts.all}</span></div>
          <div className={`filter-pill ${filter==='mine'?'active':''}`} onClick={()=>setFilter('mine')}>{T('Míos', 'Mine')}<span className="count">{counts.mine}</span></div>
          <div className={`filter-pill ${filter==='published'?'active':''}`} onClick={()=>setFilter('published')}>{T('Publicados', 'Published')}<span className="count">{counts.published}</span></div>
          <div className={`filter-pill ${filter==='draft'?'active':''}`} onClick={()=>setFilter('draft')}>{T('Borradores', 'Drafts')}<span className="count">{counts.draft}</span></div>
          <div className={`filter-pill ${filter==='review'?'active':''}`} onClick={()=>setFilter('review')}>{T('En revisión', 'In review')}<span className="count">{counts.review}</span></div>
          <div style={{flex:1}}/>
          <button className="filter-pill"><I.Filter/> {T('Filtros', 'Filters')}</button>
          <button className="filter-pill">{T('Recientes', 'Recent')} <I.ChevDown/></button>
        </div>

        <div className="diagrams-grid">
          <div className="diagram-card create-card" onClick={() => onOpen('d1')}>
            <div className="create-card-inner">
              <div className="ic"><I.Plus/></div>
              <div className="lb">{T('Crear diagrama', 'Create diagram')}</div>
              <div className="sb">{T('Comienza desde cero o una plantilla', 'Start from scratch or template')}</div>
            </div>
          </div>
          {filtered.map(d => (
            <div key={d.id} className="diagram-card" onClick={() => onOpen(d.id)}>
              <div className="diagram-thumb">
                <DiagramThumb seed={d.id}/>
              </div>
              <div className="diagram-meta">
                <div className="nm">
                  {d.favorite && <I.Star/>}
                  <span style={{flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>{d.name}</span>
                </div>
                <div className="sub">
                  <span>{d.folder}</span><span className="sep">·</span>
                  <span>{d.author}</span><span className="sep">·</span>
                  <span>{d.updated}</span>
                </div>
                <div className="tags">
                  <span className={`tag ${d.status === 'published' ? 'ok' : d.status === 'review' ? 'warn' : 'draft'}`}>
                    {d.status === 'published' ? T('publicado', 'published') : d.status === 'review' ? T('revisión', 'review') : T('borrador', 'draft')}
                  </span>
                  <span className="tag mono">v{d.version}</span>
                  <span className="tag">{d.elements} {T('elem.', 'elem.')}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// Generate a varied BPMN-style thumbnail per seed
function DiagramThumb({ seed }) {
  const variants = {
    d1: <ThumbA/>, d2: <ThumbB/>, d3: <ThumbC/>, d4: <ThumbD/>,
    d5: <ThumbA flip/>, d6: <ThumbB/>, d7: <ThumbD/>, d8: <ThumbC/>,
  };
  return variants[seed] || <ThumbA/>;
}

const thumbCircleStart = { fill: 'var(--start-fill)', stroke: 'var(--start-stroke)', strokeWidth: 1.5 };
const thumbCircleEnd = { fill: 'var(--end-fill)', stroke: 'var(--end-stroke)', strokeWidth: 2 };
const thumbTask = { fill: 'var(--task-fill)', stroke: 'var(--task-stroke)', strokeWidth: 1.2 };
const thumbGw = { fill: 'var(--gateway-fill)', stroke: 'var(--gateway-stroke)', strokeWidth: 1.2 };
const thumbLine = { stroke: 'var(--text-2)', strokeWidth: 1, fill: 'none' };

function ThumbA() {
  return (
    <svg viewBox="0 0 260 140" style={{position:'relative', zIndex:1}}>
      <rect x="6" y="10" width="248" height="120" fill="none" stroke="var(--pool-stroke)" strokeWidth="1"/>
      <line x1="6" y1="70" x2="254" y2="70" stroke="var(--pool-stroke)" strokeWidth="1"/>
      <circle cx="22" cy="40" r="7" {...thumbCircleStart}/>
      <rect x="40" y="32" width="38" height="16" rx="2" {...thumbTask}/>
      <rect x="92" y="32" width="38" height="16" rx="2" {...thumbTask}/>
      <path d="M150 40 l10 -10 l10 10 l-10 10 z" {...thumbGw}/>
      <rect x="184" y="32" width="38" height="16" rx="2" {...thumbTask}/>
      <circle cx="240" cy="40" r="7" {...thumbCircleEnd}/>
      <path d="M29 40 H40 M78 40 H92 M130 40 H150 M170 40 H184 M222 40 H233" {...thumbLine}/>
      <path d="M160 50 V100 H100" {...thumbLine}/>
      <rect x="62" y="92" width="38" height="16" rx="2" {...thumbTask}/>
      <circle cx="40" cy="100" r="6" fill="none" stroke="var(--text-2)" strokeWidth="1"/>
    </svg>
  );
}
function ThumbB() {
  return (
    <svg viewBox="0 0 260 140" style={{position:'relative', zIndex:1}}>
      <rect x="6" y="10" width="248" height="120" fill="none" stroke="var(--pool-stroke)" strokeWidth="1"/>
      <line x1="6" y1="50" x2="254" y2="50" stroke="var(--pool-stroke)" strokeWidth="1"/>
      <line x1="6" y1="90" x2="254" y2="90" stroke="var(--pool-stroke)" strokeWidth="1"/>
      <circle cx="22" cy="30" r="7" {...thumbCircleStart}/>
      <rect x="40" y="22" width="36" height="16" rx="2" {...thumbTask}/>
      <path d="M90 30 l8 -8 l8 8 l-8 8 z" {...thumbGw}/>
      <rect x="120" y="22" width="36" height="16" rx="2" {...thumbTask}/>
      <rect x="60" y="62" width="36" height="16" rx="2" {...thumbTask}/>
      <rect x="120" y="62" width="36" height="16" rx="2" {...thumbTask}/>
      <rect x="180" y="62" width="36" height="16" rx="2" {...thumbTask}/>
      <rect x="80" y="105" width="36" height="16" rx="2" {...thumbTask}/>
      <rect x="140" y="105" width="36" height="16" rx="2" {...thumbTask}/>
      <circle cx="220" cy="113" r="7" {...thumbCircleEnd}/>
      <path d="M30 30 H40 M76 30 H90 M106 30 H120 M156 30 V70 H180 M138 78 V105 M96 70 H120 M156 70 H180 M176 113 H213" {...thumbLine}/>
    </svg>
  );
}
function ThumbC() {
  return (
    <svg viewBox="0 0 260 140" style={{position:'relative', zIndex:1}}>
      <rect x="6" y="10" width="248" height="120" fill="none" stroke="var(--pool-stroke)" strokeWidth="1"/>
      <circle cx="22" cy="70" r="7" {...thumbCircleStart}/>
      <rect x="42" y="62" width="40" height="16" rx="2" {...thumbTask}/>
      <path d="M100 70 l10 -10 l10 10 l-10 10 z" {...thumbGw}/>
      <rect x="138" y="32" width="40" height="16" rx="2" {...thumbTask}/>
      <rect x="138" y="62" width="40" height="16" rx="2" {...thumbTask}/>
      <rect x="138" y="92" width="40" height="16" rx="2" {...thumbTask}/>
      <path d="M196 70 l10 -10 l10 10 l-10 10 z" {...thumbGw}/>
      <circle cx="240" cy="70" r="7" {...thumbCircleEnd}/>
      <path d="M29 70 H42 M82 70 H100 M120 70 H138 M178 40 L196 60 M178 70 H196 M178 100 L196 80 M216 70 H233" {...thumbLine}/>
    </svg>
  );
}
function ThumbD() {
  return (
    <svg viewBox="0 0 260 140" style={{position:'relative', zIndex:1}}>
      <rect x="6" y="10" width="248" height="120" fill="none" stroke="var(--pool-stroke)" strokeWidth="1"/>
      <line x1="6" y1="50" x2="254" y2="50" stroke="var(--pool-stroke)" strokeWidth="1"/>
      <circle cx="22" cy="30" r="7" {...thumbCircleStart}/>
      <rect x="42" y="22" width="42" height="16" rx="2" {...thumbTask}/>
      <rect x="100" y="22" width="42" height="16" rx="2" {...thumbTask}/>
      <rect x="158" y="22" width="42" height="16" rx="2" {...thumbTask}/>
      <circle cx="222" cy="30" r="7" {...thumbCircleEnd}/>
      <path d="M29 30 H42 M84 30 H100 M142 30 H158 M200 30 H215" {...thumbLine}/>
      <rect x="60" y="80" width="42" height="16" rx="2" {...thumbTask}/>
      <path d="M120 88 l8 -8 l8 8 l-8 8 z" {...thumbGw}/>
      <rect x="158" y="80" width="42" height="16" rx="2" {...thumbTask}/>
      <rect x="158" y="108" width="42" height="14" rx="2" {...thumbTask} fill="var(--bg-2)" stroke="var(--text-3)"/>
      <path d="M102 88 H120 M136 88 H158 M128 96 V115 H158" {...thumbLine}/>
    </svg>
  );
}

window.HomeView = HomeView;
