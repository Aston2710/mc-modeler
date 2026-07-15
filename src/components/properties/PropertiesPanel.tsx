import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { MousePointerClick } from 'lucide-react'
import { useUIStore } from '@/store/uiStore'
import { BpmnElementIcon } from '@/components/palette/BpmnElementIcon'
import { isPhase, getPhaseName, getPhaseColor, DEFAULT_PHASE_COLOR } from '@/bpmn/elements/phaseUtil'

interface Element {
  id: string
  businessObject: {
    $type: string
    name?: string
    documentation?: { text: string }[]
    assignee?: string
    candidateGroups?: string
    implementation?: string
    scriptFormat?: string
    script?: string
    calledElement?: string
  }
}

// Contenido del modo "Propiedades" del RightPanel (que aporta el shell de la
// barra: pestañas de modo, colapso y contenedor .sidebar-r).
interface PropertiesPanelProps {
  getSelectedElements: () => Element[]
  // Called when user edits a property — triggers bpmn-js update
  onUpdateProperty?: (elementId: string, property: string, value: string) => void
  /** true = viewer: campos deshabilitados (solo lectura). */
  readOnly?: boolean
}

function getBpmnIconType(bpmnType: string): string {
  const map: Record<string, string> = {
    'bpmn:StartEvent': 'startEvent',
    'bpmn:EndEvent': 'endEvent',
    'bpmn:IntermediateCatchEvent': 'intermediateEvent',
    'bpmn:IntermediateThrowEvent': 'intermediateEvent',
    'bpmn:Task': 'task',
    'bpmn:UserTask': 'userTask',
    'bpmn:ServiceTask': 'serviceTask',
    'bpmn:ScriptTask': 'scriptTask',
    'bpmn:SendTask': 'sendTask',
    'bpmn:ReceiveTask': 'receiveTask',
    'bpmn:BusinessRuleTask': 'businessRuleTask',
    'bpmn:SubProcess': 'subProcess',
    'bpmn:CallActivity': 'callActivity',
    'bpmn:ExclusiveGateway': 'exclusiveGateway',
    'bpmn:ParallelGateway': 'parallelGateway',
    'bpmn:InclusiveGateway': 'inclusiveGateway',
    'bpmn:EventBasedGateway': 'eventBasedGateway',
    'bpmn:ComplexGateway': 'complexGateway',
    'bpmn:SequenceFlow': 'sequenceFlow',
    'bpmn:MessageFlow': 'messageFlow',
    'bpmn:Participant': 'pool',
    'bpmn:Lane': 'lane',
    'bpmn:Group': 'group',
    'bpmn:TextAnnotation': 'textAnnotation',
    'bpmn:DataObjectReference': 'dataObject',
  }
  return map[bpmnType] ?? 'task'
}

export function PropertiesPanel({
  getSelectedElements,
  onUpdateProperty,
  readOnly = false,
}: PropertiesPanelProps) {
  const { t } = useTranslation()
  const selectedIds = useUIStore((s) => s.selectedElementIds)
  const [activeTab, setActiveTab] = useState<'general' | 'documentation'>('general')

  const elements = getSelectedElements()
  const el = elements[0] as Element | undefined
  const bo = el?.businessObject

  // Reset to general tab when selection changes
  useEffect(() => {
    setActiveTab('general')
  }, [selectedIds])

  if (!el || !bo) {
    return (
      <div className="props-content">
        <div className="props-empty">
          <MousePointerClick />
          <div className="empty-title">{t('properties.noSelection')}</div>
          <div className="empty-sub">{t('properties.noSelectionSub')}</div>
        </div>
      </div>
    )
  }

  const rawType = bo.$type.replace('bpmn:', '')
  const typeKey = rawType.charAt(0).toLowerCase() + rawType.slice(1)
  const typeLabel = t(`properties.elementTypes.${typeKey}`, rawType)
  const iconType = getBpmnIconType(bo.$type)

  const update = (prop: string, value: string) => {
    onUpdateProperty?.(el.id, prop, value)
  }

  return (
    <div className="props-content">
      <div className="selected-card">
        <div className="selected-icon">
          <BpmnElementIcon type={iconType} size={20} />
        </div>
        <div className="selected-info">
          <div className="selected-type">{typeLabel}</div>
          <div className="selected-title">{(isPhase(el) ? getPhaseName(el) : bo.name) || `(${typeLabel})`}</div>
          <div className="selected-id mono">{el.id}</div>
        </div>
      </div>

      <div className="props-tabs">
        <button
          className={`props-tab ${activeTab === 'general' ? 'active' : ''}`}
          onClick={() => setActiveTab('general')}
        >
          {t('properties.tabs.general')}
        </button>
        <button
          className={`props-tab ${activeTab === 'documentation' ? 'active' : ''}`}
          onClick={() => setActiveTab('documentation')}
        >
          {t('properties.tabs.documentation')}
        </button>
      </div>

      <fieldset className="props-body" disabled={readOnly} style={{ border: 0, padding: 0, paddingBottom: 12, margin: 0, minInlineSize: 'auto' }}>
        {activeTab === 'general' && (
          <>
            <div className="section">
              <div className="section-title">
                {t('properties.sections.identity')}
                <span className="line" />
              </div>
              <div className="field">
                <label className="field-label">{t('properties.fields.id')}</label>
                <input className="f-input mono" value={el.id} readOnly />
              </div>
              <div className="field">
                <label className="field-label">
                  {isPhase(el) ? t('properties.fields.phaseName', 'Nombre de la fase') : t('properties.fields.name')}
                </label>
                <input
                  className="f-input"
                  value={isPhase(el) ? getPhaseName(el) : (bo.name ?? '')}
                  onChange={(e) => update('name', e.target.value)}
                  placeholder={`(${typeLabel})`}
                />
              </div>
              {isPhase(el) && (
                <div className="field">
                  <label className="field-label">
                    {t('properties.fields.phaseColor', 'Color de la fase')}
                  </label>
                  <input
                    type="color"
                    className="f-input f-color"
                    value={getPhaseColor(el) || DEFAULT_PHASE_COLOR}
                    onChange={(e) => update('phaseColor', e.target.value)}
                  />
                </div>
              )}
            </div>

            {/* Task-specific fields */}
            {['bpmn:UserTask'].includes(bo.$type) && (
              <div className="section">
                <div className="section-title">
                  {t('properties.sections.assignment')}
                  <span className="line" />
                </div>
                <div className="field">
                  <label className="field-label">{t('properties.fields.assignee')}</label>
                  <input
                    className="f-input"
                    value={bo.assignee ?? ''}
                    onChange={(e) => update('assignee', e.target.value)}
                    placeholder="username"
                  />
                </div>
                <div className="field">
                  <label className="field-label">{t('properties.fields.candidateGroups')}</label>
                  <input
                    className="f-input"
                    value={bo.candidateGroups ?? ''}
                    onChange={(e) => update('candidateGroups', e.target.value)}
                    placeholder="group1, group2"
                  />
                </div>
              </div>
            )}

            {['bpmn:ServiceTask'].includes(bo.$type) && (
              <div className="section">
                <div className="section-title">
                  {t('properties.sections.configuration')}
                  <span className="line" />
                </div>
                <div className="field">
                  <label className="field-label">{t('properties.fields.implementation')}</label>
                  <input
                    className="f-input"
                    value={bo.implementation ?? ''}
                    onChange={(e) => update('implementation', e.target.value)}
                    placeholder="##WebService"
                  />
                </div>
              </div>
            )}

            {['bpmn:ScriptTask'].includes(bo.$type) && (
              <div className="section">
                <div className="section-title">
                  {t('properties.sections.configuration')}
                  <span className="line" />
                </div>
                <div className="field">
                  <label className="field-label">{t('properties.fields.scriptFormat')}</label>
                  <input
                    className="f-input"
                    value={bo.scriptFormat ?? ''}
                    onChange={(e) => update('scriptFormat', e.target.value)}
                    placeholder="javascript"
                  />
                </div>
                <div className="field">
                  <label className="field-label">{t('properties.fields.script')}</label>
                  <textarea
                    className="f-textarea mono"
                    value={bo.script ?? ''}
                    onChange={(e) => update('script', e.target.value)}
                    rows={4}
                  />
                </div>
              </div>
            )}

            {['bpmn:CallActivity'].includes(bo.$type) && (
              <div className="section">
                <div className="section-title">
                  {t('properties.sections.configuration')}
                  <span className="line" />
                </div>
                <div className="field">
                  <label className="field-label">{t('properties.fields.calledElement')}</label>
                  <input
                    className="f-input"
                    value={bo.calledElement ?? ''}
                    onChange={(e) => update('calledElement', e.target.value)}
                    placeholder="ProcessId"
                  />
                </div>
              </div>
            )}
          </>
        )}

        {activeTab === 'documentation' && (
          <div className="section">
            <div className="section-title">
              {t('properties.sections.documentation')}
              <span className="line" />
            </div>
            <div className="field">
              <label className="field-label">{t('properties.fields.documentation')}</label>
              <textarea
                className="f-textarea"
                value={bo.documentation?.[0]?.text ?? ''}
                onChange={(e) => update('documentation', e.target.value)}
                rows={6}
                placeholder="Describe this element..."
              />
            </div>
          </div>
        )}
      </fieldset>
    </div>
  )
}
