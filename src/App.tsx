import { useEffect, useRef, useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useDiagramStore } from '@/store/diagramStore'
import { useUIStore } from '@/store/uiStore'
import { usePreferencesStore } from '@/store/preferencesStore'
import { useAutoSave } from '@/hooks/useAutoSave'
import { useKeyboard } from '@/hooks/useKeyboard'
import { useExport, type ExportFormat, type PngScale, type PdfOrientation, type ExportTheme } from '@/hooks/useExport'
import { validateDiagram } from '@/domain/validation'

import { Toolbar } from '@/components/layout/Toolbar'
import { TabsBar } from '@/components/layout/TabsBar'
import { StatusBar } from '@/components/layout/StatusBar'
import { PalettePanel } from '@/components/palette/PalettePanel'
import { PropertiesPanel } from '@/components/properties/PropertiesPanel'
import { BpmnCanvas, type BpmnCanvasHandle } from '@/components/canvas/BpmnCanvas'
import { DiagramList } from '@/components/diagrams/DiagramList'
import { NewDiagramModal } from '@/components/modals/NewDiagramModal'
import { ExportModal } from '@/components/modals/ExportModal'
import { ImportModal } from '@/components/modals/ImportModal'
import { ValidationModal } from '@/components/modals/ValidationModal'
import { ShortcutsModal } from '@/components/modals/ShortcutsModal'
import { ToastContainer } from '@/components/ui/ToastContainer'

export default function App() {
  const { t } = useTranslation()

  // Stores
  const {
    activeTabId, tabs, loadAll,
    createDiagram, openDiagram, importDiagram,
    saveDiagram, activeDiagram,
  } = useDiagramStore()
  const {
    propertiesPanelOpen, palettePanelOpen,
    setPropertiesPanelOpen, setPalettePanelOpen,
    openModal, closeModal, activeModal,
    setUnsavedChanges,
    setValidationResults,
    addToast, isExporting,
  } = useUIStore()
  const { loaded: prefsLoaded, load: loadPrefs } = usePreferencesStore()

  // Canvas ref
  const canvasRef = useRef<BpmnCanvasHandle>(null)

  // View state
  const [view, setView] = useState<'home' | 'editor'>('home')
  const [canUndo, setCanUndo] = useState(false)
  const [canRedo, setCanRedo] = useState(false)

  // Track whether the bpmn-js modeler has finished initializing
  const isCanvasReadyRef = useRef(false)

  // ── Init ──────────────────────────────────────────────
  useEffect(() => {
    void loadPrefs()
    void loadAll()
  }, [loadPrefs, loadAll])

  // When tabs become available, switch to editor
  useEffect(() => {
    if (tabs.length > 0 && activeTabId) setView('editor')
  }, [tabs.length, activeTabId])

  // Import current diagram XML — called both from onReady (first mount) and tab switches
  const importActiveDiagram = useCallback(() => {
    const { activeTabId: id, diagrams: all } = useDiagramStore.getState()
    const diagram = all.find((d) => d.id === id)
    if (diagram && canvasRef.current) {
      canvasRef.current.importXml(diagram.xml).catch((err: unknown) => {
        console.error('[Flujo] importXml failed:', err)
        addToast({ type: 'error', title: t('errors.loadFailed') })
      })
    }
  }, [addToast, t])

  // Fires once bpmn-js modeler is initialized and safe to call importXml
  const handleCanvasReady = useCallback(() => {
    isCanvasReadyRef.current = true
    importActiveDiagram()
  }, [importActiveDiagram])

  // Load diagram XML when user switches tabs (canvas already ready)
  useEffect(() => {
    if (!activeTabId || view !== 'editor' || !isCanvasReadyRef.current) return
    importActiveDiagram()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTabId])

  // ── Handlers ────────────────────────────────────────────
  const getXml = useCallback(async () => {
    if (!canvasRef.current) throw new Error('Canvas not ready')
    return canvasRef.current.exportXml()
  }, [])

  const getSvg = useCallback(async () => {
    if (!canvasRef.current) throw new Error('Canvas not ready')
    return canvasRef.current.exportSvg()
  }, [])

  const handleChanged = useCallback(() => {
    setUnsavedChanges(true)
    setCanUndo(canvasRef.current?.canUndo() ?? false)
    setCanRedo(canvasRef.current?.canRedo() ?? false)
  }, [setUnsavedChanges])

  const handleSave = useCallback(async () => {
    if (!activeTabId) return
    try {
      const xml = await getXml()
      await saveDiagram(activeTabId, xml)
      setUnsavedChanges(false)
      addToast({ type: 'success', title: t('statusbar.saved'), duration: 2000 })
    } catch {
      addToast({ type: 'error', title: t('errors.saveFailed') })
    }
  }, [activeTabId, getXml, saveDiagram, setUnsavedChanges, addToast, t])

  const handleGoHome = useCallback(() => {
    isCanvasReadyRef.current = false
    setView('home')
  }, [])

  const handleNew = useCallback(() => {
    openModal('newDiagram')
  }, [openModal])

  const handleNewConfirm = useCallback(async (name: string) => {
    closeModal()
    await createDiagram(name)
    setView('editor')
  }, [closeModal, createDiagram, setView])

  const handleOpenDiagram = useCallback((id: string) => {
    openDiagram(id)
    setView('editor')
  }, [openDiagram])

  const handleImportFile = useCallback(async (xml: string, name: string) => {
    closeModal()
    try {
      const id = await importDiagram(xml, name)
      setView('editor')
      openDiagram(id)
    } catch {
      addToast({ type: 'error', title: t('errors.importFailed') })
    }
  }, [closeModal, importDiagram, setView, openDiagram, addToast, t])

  const handleValidate = useCallback(async () => {
    const registry = canvasRef.current?.getElementRegistry()
    if (!registry) return
    const results = validateDiagram(registry as { getAll(): unknown[] }, t)
    setValidationResults(results)
    openModal('validation')
  }, [setValidationResults, openModal, t])

  const handleJumpToElement = useCallback((elementId: string) => {
    closeModal()
    canvasRef.current?.scrollToElement(elementId)
  }, [closeModal])

  const { run: runExport } = useExport()
  const handleExportConfirm = useCallback(async (
    format: ExportFormat,
    scale?: PngScale,
    orientation?: PdfOrientation,
    theme?: ExportTheme,
  ) => {
    closeModal()
    const diagram = activeDiagram()
    if (!diagram) return
    await runExport({ format, scale, orientation, theme, diagramName: diagram.name, getXml, getSvg })
  }, [closeModal, activeDiagram, runExport, getXml, getSvg])

  const handleStartCreate = useCallback((bpmnType: string, event: MouseEvent) => {
    canvasRef.current?.startCreate(bpmnType, event)
  }, [])

  // Auto-save
  const { save: autoSave } = useAutoSave(getXml)
  void autoSave

  // Keyboard shortcuts
  useKeyboard({
    onSave: handleSave,
    onUndo: () => canvasRef.current?.undo(),
    onRedo: () => canvasRef.current?.redo(),
    onNew: handleNew,
    onValidate: handleValidate,
  })

  if (!prefsLoaded) return null

  return (
    <>
      {view === 'home' ? (
        <DiagramList
          onOpen={handleOpenDiagram}
          onNew={handleNew}
          onImport={() => openModal('import')}
        />
      ) : (
        <div className="app">
          <Toolbar
            onNew={handleNew}
            onImport={() => openModal('import')}
            onExport={() => openModal('export')}
            onValidate={handleValidate}
            onUndo={() => canvasRef.current?.undo()}
            onRedo={() => canvasRef.current?.redo()}
            onZoomIn={() => canvasRef.current?.zoom(useUIStore.getState().zoom + 0.1)}
            onZoomOut={() => canvasRef.current?.zoom(Math.max(0.25, useUIStore.getState().zoom - 0.1))}
            onFitToScreen={() => canvasRef.current?.fitToScreen()}
            onSave={handleSave}
            onGoHome={handleGoHome}
            canUndo={canUndo}
            canRedo={canRedo}
          />

          <TabsBar onNew={handleNew} />

          <div
            className={[
              'app-body',
              !palettePanelOpen ? 'left-collapsed' : '',
              !propertiesPanelOpen ? 'right-collapsed' : '',
            ].join(' ')}
          >
            <PalettePanel
              collapsed={!palettePanelOpen}
              onToggle={() => setPalettePanelOpen(!palettePanelOpen)}
              onStartCreate={handleStartCreate}
            />

            <div style={{ minHeight: 0, minWidth: 0, overflow: 'hidden', position: 'relative', height: '100%' }}>
              <BpmnCanvas
                ref={canvasRef}
                onReady={handleCanvasReady}
                onChanged={handleChanged}
              />
            </div>

            <PropertiesPanel
              collapsed={!propertiesPanelOpen}
              onToggle={() => setPropertiesPanelOpen(!propertiesPanelOpen)}
              getSelectedElements={() => canvasRef.current?.getSelectedElements() ?? []}
              onUpdateProperty={(id, prop, val) => canvasRef.current?.updateElementProperty(id, prop, val)}
            />
          </div>

          <StatusBar
            onOpenValidation={() => openModal('validation')}
            onOpenShortcuts={() => openModal('shortcuts')}
          />
        </div>
      )}

      {/* Modals */}
      {activeModal === 'newDiagram' && (
        <NewDiagramModal onConfirm={handleNewConfirm} onCancel={closeModal} />
      )}
      {activeModal === 'export' && activeDiagram() && (
        <ExportModal
          diagramName={activeDiagram()!.name}
          getSvg={getSvg}
          onExport={handleExportConfirm}
          onCancel={closeModal}
          isExporting={isExporting}
        />
      )}
      {activeModal === 'import' && (
        <ImportModal onImport={handleImportFile} onCancel={closeModal} />
      )}
      {activeModal === 'validation' && (
        <ValidationModal
          onClose={closeModal}
          onJumpToElement={handleJumpToElement}
        />
      )}
      {activeModal === 'shortcuts' && (
        <ShortcutsModal onClose={closeModal} />
      )}

      <ToastContainer />
    </>
  )
}
