import { useEffect, useRef, useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useDiagramStore } from '@/store/diagramStore'
import { useUIStore } from '@/store/uiStore'
import { usePreferencesStore } from '@/store/preferencesStore'
import { useAuthStore } from '@/store/authStore'
import { useCollabStore } from '@/store/collabStore'
import { useNotificationStore } from '@/store/notificationStore'
import { isSupabaseConfigured } from '@/lib/supabase'
import { activateThreadWhenReady } from '@/lib/notificationNav'
import { redeemInvite, redeemProjectInvite } from '@/lib/sharing'
import { LoginView } from '@/components/auth/LoginView'
import { ShareModal } from '@/components/modals/ShareModal'
import { NewProjectModal } from '@/components/modals/NewProjectModal'
import { LinkDiagramModal } from '@/components/modals/LinkDiagramModal'
import { useAutoSave } from '@/hooks/useAutoSave'
import { useKeyboard } from '@/hooks/useKeyboard'
//import { useExport, type ExportFormat, type PngScale, type PdfOrientation, type ExportTheme } from '@/hooks/useExport'
import { useExport, type ExportFormat, type PngScale, type PdfOrientation, type ExportTheme } from '@/hooks/useExport'
import { buildThumbnail, topPoolCrop } from '@/utils/thumbnailUtils'
import { isCanvasReadyFor } from '@/collab/canvasSession'
import { setBpmnReadOnly } from '@/bpmn/readOnlyState'

import { validateDiagram } from '@/domain/validation'

import { Toolbar } from '@/components/layout/Toolbar'
import { TabsBar } from '@/components/layout/TabsBar'
import { StatusBar } from '@/components/layout/StatusBar'
import { PalettePanel } from '@/components/palette/PalettePanel'
import { RightPanel } from '@/components/layout/RightPanel'
import { BpmnCanvas, type BpmnCanvasHandle } from '@/components/canvas/BpmnCanvas'
import { DiagramList } from '@/components/diagrams/DiagramList'
import { NewDiagramModal } from '@/components/modals/NewDiagramModal'
import { ExportModal } from '@/components/modals/ExportModal'
import { ImportModal } from '@/components/modals/ImportModal'
import { ValidationModal } from '@/components/modals/ValidationModal'
import { ShortcutsModal } from '@/components/modals/ShortcutsModal'
import { ImageUploadModal } from '@/components/modals/ImageUploadModal'
import { ToastContainer } from '@/components/ui/ToastContainer'
import { ProjectView } from '@/components/diagrams/ProjectView'

export default function App() {
  const { t } = useTranslation()

  // Stores
  const {
    activeTabId, tabs, loadAll,
    createDiagram, openDiagram, importDiagram,
    saveDiagram, activeDiagram,
    loadProjects, createProject,
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
  const authInitialized = useAuthStore((s) => s.initialized)
  const session = useAuthStore((s) => s.session)
  const canEditActive = useCollabStore((s) => s.canEdit(activeTabId))

  // Modo solo-lectura del canvas: viewer no puede editar. Se recalcula al
  // cambiar de pestaña o cuando cargan los roles (canEditActive). En modo local
  // canEdit siempre es true → nunca solo-lectura.
  useEffect(() => {
    setBpmnReadOnly(!canEditActive)
  }, [canEditActive])

  // Canvas ref
  const canvasRef = useRef<BpmnCanvasHandle>(null)

  // View state
  const [view, setView] = useState<'home' | 'editor'>('home')
  const [canUndo, setCanUndo] = useState(false)
  const [canRedo, setCanRedo] = useState(false)
  const [projectViewOpen, setProjectViewOpen] = useState(false)

  // Track whether the bpmn-js modeler has finished initializing
  const isCanvasReadyRef = useRef(false)
  // Pestaña cuyo contenido está actualmente en el canvas (para guardarla antes
  // de cargar otra — el canvas es único para todas las pestañas).
  const currentCanvasTabRef = useRef<string | null>(null)

  // ── Init ──────────────────────────────────────────────
  useEffect(() => {
    useAuthStore.getState().init()
  }, [])

  // Preferencias: siempre (se resuelven localmente).
  useEffect(() => {
    void loadPrefs()
  }, [loadPrefs])

  // Lista de diagramas + roles: solo cuando hay acceso real —
  // modo local, o modo nube con sesión iniciada. Nunca como anónimo.
  // Dep en el id de usuario (no en el objeto session completo): Supabase emite
  // un session nuevo en cada refresh de token / focus de pestaña; si dependiéramos
  // de `session` re-cargaríamos todo (y parpadearían los thumbnails) sin necesidad.
  const sessionUserId = session?.user?.id ?? null
  useEffect(() => {
    if (!isSupabaseConfigured || sessionUserId) {
      void loadAll()
      void loadProjects()
      void useCollabStore.getState().loadRoles()
    }
  }, [sessionUserId, loadAll, loadProjects])

  // Centro de notificaciones in-app: carga + suscripción Realtime mientras hay sesión.
  useEffect(() => {
    if (!isSupabaseConfigured || !sessionUserId) return
    void useNotificationStore.getState().start(sessionUserId)
    return () => useNotificationStore.getState().stop()
  }, [sessionUserId])

  // Estado del proyecto que se está compartiendo (modal shareProject).
  const [shareProjectInfo, setShareProjectInfo] = useState<{ id: string; name: string } | null>(null)

  // Capturar tokens de invitación (?invite= / ?projectInvite=) y deep links a
  // diagrama (?d=, usados por los correos de notificación) antes del redirect de login.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const token = params.get('invite')
    const projectToken = params.get('projectInvite')
    const deepLink = params.get('d')
    const thread = params.get('thread')
    if (token) localStorage.setItem('flujo:pendingInvite', token)
    if (projectToken) localStorage.setItem('flujo:pendingProjectInvite', projectToken)
    if (deepLink) localStorage.setItem('flujo:pendingOpenDiagram', deepLink)
    if (thread) localStorage.setItem('flujo:pendingThread', thread)
    if (token || projectToken || deepLink || thread) {
      params.delete('invite')
      params.delete('projectInvite')
      params.delete('d')
      params.delete('thread')
      const qs = params.toString()
      window.history.replaceState({}, '', window.location.pathname + (qs ? `?${qs}` : ''))
    }
  }, [])

  // Abrir diagrama de un deep link (?d=) una vez hay sesión y datos cargados.
  useEffect(() => {
    if (!isSupabaseConfigured || !session) return
    const pending = localStorage.getItem('flujo:pendingOpenDiagram')
    if (!pending) return
    localStorage.removeItem('flujo:pendingOpenDiagram')
    void (async () => {
      try {
        await loadAll()
        if (useDiagramStore.getState().diagrams.some((d) => d.id === pending)) {
          openDiagram(pending)
          setView('editor')
        } else {
          // Sin acceso o diagrama inexistente: el thread pendiente ya no aplica.
          localStorage.removeItem('flujo:pendingThread')
          addToast({ type: 'error', title: t('notifications.noAccess') })
        }
      } catch { /* noop */ }
    })()
  }, [session, loadAll, openDiagram, addToast, t])

  // Activar el hilo de comentario de un deep link (?thread=) cuando el binding
  // de comentarios lo cargue en el store.
  useEffect(() => {
    if (!isSupabaseConfigured || !session) return
    const threadId = localStorage.getItem('flujo:pendingThread')
    if (!threadId) return
    localStorage.removeItem('flujo:pendingThread')
    return activateThreadWhenReady(threadId)
  }, [session])

  // Canjear invitación pendiente (diagrama o proyecto) una vez hay sesión.
  useEffect(() => {
    if (!isSupabaseConfigured || !session) return
    const token = localStorage.getItem('flujo:pendingInvite')
    const projectToken = localStorage.getItem('flujo:pendingProjectInvite')
    if (!token && !projectToken) return
    localStorage.removeItem('flujo:pendingInvite')
    localStorage.removeItem('flujo:pendingProjectInvite')
    void (async () => {
      try {
        if (projectToken) {
          await redeemProjectInvite(projectToken)
          await loadProjects()
          await loadAll()
          await useCollabStore.getState().loadRoles()
          addToast({ type: 'success', title: t('share.projectInviteAccepted') })
        }
        if (token) {
          const diagramId = await redeemInvite(token)
          await loadAll()
          await useCollabStore.getState().loadRoles()
          openDiagram(diagramId)
          setView('editor')
          addToast({ type: 'success', title: t('share.inviteAccepted') })
        }
      } catch (err) {
        // El RPC lanza 'Invitación expirada' cuando expires_at ya pasó.
        const expired = err instanceof Error && err.message.includes('expirada')
        addToast({ type: 'error', title: expired ? t('share.inviteExpired') : t('share.inviteError') })
      }
    })()
  }, [session, loadAll, loadProjects, openDiagram, addToast, t])

  // When tabs become available, switch to editor
  useEffect(() => {
    if (tabs.length > 0 && activeTabId) setView('editor')
  }, [tabs.length, activeTabId])

  // Import current diagram XML — called both from onReady (first mount) and tab switches
  const importActiveDiagram = useCallback(() => {
    const { activeTabId: id } = useDiagramStore.getState()
    const canvas = canvasRef.current
    if (!id || !canvas) return
    // Resetear antes: evita que el evento commandStack.changed de importXML
    // marque el diagrama como "con cambios" al simplemente abrirlo.
    useUIStore.getState().setUnsavedChanges(false)
    // La lista no trae el XML (carga liviana); se pide bajo demanda al abrir.
    void useDiagramStore.getState().ensureXml(id)
      .then((xml) => {
        if (!xml) return
        // Si el usuario cambió de pestaña mientras cargaba el XML, no importar el obsoleto.
        if (useDiagramStore.getState().activeTabId !== id) return
        return canvas.importXml(xml, id).then(() => {
          // Resetear después también: bpmn-js puede disparar commandStack.changed
          // de forma asíncrona al terminar de procesar el XML.
          useUIStore.getState().setUnsavedChanges(false)
          currentCanvasTabRef.current = id
        })
      })
      .catch((err: unknown) => {
        console.error('[Flujo] importXml failed:', err)
        addToast({ type: 'error', title: t('errors.loadFailed') })
      })
  }, [addToast, t])

  // Fires once bpmn-js modeler is initialized and safe to call importXml
  const handleCanvasReady = useCallback(() => {
    isCanvasReadyRef.current = true
    importActiveDiagram()
  }, [importActiveDiagram])

  // Conflicto de guardado persistente (vista stale / offline largo — mal uso):
  // diagramStore ya aceptó el estado del servidor; aquí se notifica y se ofrece
  // recargar o preservar la copia local como duplicado. Nunca sobreescritura forzada.
  useEffect(() => {
    const handler = (e: Event) => {
      const { id } = (e as CustomEvent<{ id: string }>).detail
      const name = useDiagramStore.getState().diagrams.find((d) => d.id === id)?.name ?? ''
      addToast({
        type: 'warning',
        title: t('conflict.title'),
        message: t('conflict.message', { name }),
        duration: 0, // persistente: decisión del usuario
        actions: [
          {
            label: t('conflict.reload'),
            onClick: () => {
              void useDiagramStore.getState().refreshXml(id).then((xml) => {
                if (!xml || useDiagramStore.getState().activeTabId !== id) return
                void canvasRef.current?.importXml(xml, id).then(() => {
                  useUIStore.getState().setUnsavedChanges(false)
                })
              })
            },
          },
          {
            label: t('conflict.saveCopy'),
            onClick: () => {
              void (async () => {
                try {
                  const xml = await canvasRef.current?.exportXml()
                  if (!xml) return
                  const copyId = await useDiagramStore.getState().importDiagram(
                    xml, t('conflict.copyName', { name }),
                    useDiagramStore.getState().diagrams.find((d) => d.id === id)?.projectId ?? null
                  )
                  openDiagram(copyId)
                } catch {
                  addToast({ type: 'error', title: t('errors.saveFailed') })
                }
              })()
            },
          },
        ],
      })
    }
    document.addEventListener('flujo:save-conflict', handler)
    return () => document.removeEventListener('flujo:save-conflict', handler)
  }, [addToast, t, openDiagram])

  // Load diagram XML when user switches tabs (canvas already ready).
  // Antes de cargar la nueva pestaña, persistir la que estaba en el canvas.
  useEffect(() => {
    if (!activeTabId || view !== 'editor' || !isCanvasReadyRef.current) return
    const leaving = currentCanvasTabRef.current
    if (leaving && leaving !== activeTabId) {
      void persistCanvasTab().then(() => importActiveDiagram())
    } else {
      importActiveDiagram()
    }
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

  // Recorte del thumbnail: con 2+ pools, solo el pool superior.
  const getThumbCrop = useCallback(
    () => topPoolCrop(canvasRef.current?.getElementRegistry()),
    []
  )

  // Persiste la pestaña que está actualmente en el canvas (antes de cargar otra).
  // El canvas es único; sin esto, cambiar de pestaña descarta los cambios no guardados.
  const persistCanvasTab = useCallback(async () => {
    const tabId = currentCanvasTabRef.current
    if (!tabId || !canvasRef.current) return
    if (!useUIStore.getState().unsavedChanges) return
    if (!useCollabStore.getState().canEdit(tabId)) return
    // Identidad confirmada: si el canvas está a medio importar otro diagrama
    // (o algo dejó currentCanvasTabRef desincronizado), no exportar/guardar —
    // se guardaría contenido que no pertenece a `tabId`.
    if (!isCanvasReadyFor(tabId)) return
    try {
      const xml = await canvasRef.current.exportXml()
      const thumbnail = await buildThumbnail(getSvg, getThumbCrop).catch(() => undefined)
      await saveDiagram(tabId, xml, undefined, thumbnail)
      setUnsavedChanges(false)
    } catch (e) {
      // no bloquear el cambio de pestaña si falla el guardado
      console.warn('[Flujo] guardado al cambiar de pestaña falló:', e)
    }
  }, [getSvg, getThumbCrop, saveDiagram, setUnsavedChanges])

  const handleChanged = useCallback(() => {
    // Viewer: los cambios remotos aplicados a su canvas disparan
    // commandStack.changed, pero NO son ediciones suyas → no marcar "sin
    // guardar" (evita el punto de no-guardado y que el autosave se active).
    const tabId = useDiagramStore.getState().activeTabId
    if (useCollabStore.getState().canEdit(tabId)) setUnsavedChanges(true)
    setCanUndo(canvasRef.current?.canUndo() ?? false)
    setCanRedo(canvasRef.current?.canRedo() ?? false)
  }, [setUnsavedChanges])

  const handleSave = useCallback(async () => {
    if (!activeTabId || !canEditActive) return
    // Igual que en persistCanvasTab: no exportar un canvas que todavía
    // muestra el diagrama anterior porque la importación del activo no terminó.
    if (!isCanvasReadyFor(activeTabId)) return
    try {
      // XML y SVG se exportan del mismo estado del canvas, en el mismo tick,
      // antes de que el usuario pueda hacer otro cambio. Esto garantiza que
      // el thumbnail siempre refleja exactamente lo que está guardado.
      const [xml, thumbnail] = await Promise.all([
        getXml(),
        buildThumbnail(getSvg, getThumbCrop).catch(() => null),
      ])
      await saveDiagram(activeTabId, xml, undefined, thumbnail)
      setUnsavedChanges(false)
      addToast({ type: 'success', title: t('statusbar.saved'), duration: 2000 })
    } catch (e) {
      console.error('[Flujo] guardado falló:', e)
      addToast({ type: 'error', title: t('errors.saveFailed') })
    }
  }, [activeTabId, canEditActive, getXml, getSvg, getThumbCrop, saveDiagram, setUnsavedChanges, addToast, t])

  const handleGoHome = useCallback(async () => {
    await persistCanvasTab() // guardar lo que esté en el canvas antes de salir
    isCanvasReadyRef.current = false
    currentCanvasTabRef.current = null
    setView('home')
  }, [persistCanvasTab])

  // Proyecto destino para el próximo diagrama nuevo (null = suelto).
  const [newDiagramProjectId, setNewDiagramProjectId] = useState<string | null>(null)
  const [importProjectId, setImportProjectId] = useState<string | null>(null)

  const handleNew = useCallback(() => {
    setNewDiagramProjectId(null)
    openModal('newDiagram')
  }, [openModal])

  const handleNewInProject = useCallback((projectId: string) => {
    setNewDiagramProjectId(projectId)
    openModal('newDiagram')
  }, [openModal])

  const handleNewConfirm = useCallback(async (name: string) => {
    closeModal()
    await createDiagram(name, newDiagramProjectId)
    if (isSupabaseConfigured) await useCollabStore.getState().loadRoles()
    setView('editor')
  }, [closeModal, createDiagram, newDiagramProjectId, setView])

  const handleNewProject = useCallback(() => {
    openModal('newProject')
  }, [openModal])

  const handleNewProjectConfirm = useCallback(async (name: string) => {
    closeModal()
    await createProject(name)
    await useCollabStore.getState().loadRoles()
  }, [closeModal, createProject])

  const handleShareProject = useCallback((projectId: string, projectName: string) => {
    setShareProjectInfo({ id: projectId, name: projectName })
    openModal('shareProject')
  }, [openModal])

  const handleOpenDiagram = useCallback((id: string) => {
    openDiagram(id)
    setView('editor')
  }, [openDiagram])

  const handleImport = useCallback((projectId?: string | null) => {
    setImportProjectId(projectId ?? null)
    openModal('import')
  }, [openModal])

  const handleImportFile = useCallback(async (xml: string, name: string) => {
    closeModal()
    try {
      const id = await importDiagram(xml, name, importProjectId)
      if (isSupabaseConfigured) await useCollabStore.getState().loadRoles()
      setView('editor')
      openDiagram(id)
    } catch {
      addToast({ type: 'error', title: t('errors.importFailed') })
    }
  }, [closeModal, importDiagram, importProjectId, setView, openDiagram, addToast, t])

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
    if (!canEditActive) return
    canvasRef.current?.startCreate(bpmnType, event)
  }, [canEditActive])

  const handleSignOut = useCallback(async () => {
    await useAuthStore.getState().signOut()
    setView('home')
  }, [])
  
  // Estado para el modal de enlazar: qué subproceso lo abrió.
  const [linkingElementId, setLinkingElementId] = useState<string | null>(null)

  const handleSubProcessOpen = useCallback((elementId: string) => {
    if (!canEditActive && !canvasRef.current?.getLinkedDiagram(elementId)) return
    const linked = canvasRef.current?.getLinkedDiagram(elementId)
    if (linked) {
      const exists = useDiagramStore.getState().diagrams.some((d) => d.id === linked)
      if (exists) {
        openDiagram(linked)
        setView('editor')
        return
      }
    }
    // No enlazado (o destino borrado) → abrir selector
    setLinkingElementId(elementId)
    openModal('linkDiagram')
  }, [canEditActive, openDiagram, openModal])

  const finishLink = useCallback(async (diagramId: string) => {
    if (linkingElementId) {
      canvasRef.current?.setLinkedDiagram(linkingElementId, diagramId)
      // Nombre inicial del subproceso = nombre del diagrama enlazado, solo si el
      // shape no tiene nombre propio (o conserva el placeholder legado "Sin
      // enlazar"/"Unlinked" que versiones anteriores persistían en el XML).
      // Después el nombre es 100% del usuario: renombrar diagrama o shape no
      // afecta al otro.
      const registry = canvasRef.current?.getElementRegistry() as
        { get(id: string): { businessObject?: { name?: string } } | undefined } | undefined
      const currentName = registry?.get(linkingElementId)?.businessObject?.name?.trim()
      if (!currentName || currentName === 'Sin enlazar' || currentName === 'Unlinked') {
        const targetName = useDiagramStore.getState().diagrams.find((d) => d.id === diagramId)?.name
        if (targetName) canvasRef.current?.updateElementProperty(linkingElementId, 'name', targetName)
      }
      // Persistir el padre (el enlace vive en su XML) antes de abrir el destino.
      await persistCanvasTab()
    }
    closeModal()
    setLinkingElementId(null)
    openDiagram(diagramId)
    setView('editor')
  }, [linkingElementId, persistCanvasTab, closeModal, openDiagram])

  const handleLinkPick = useCallback((diagramId: string) => { void finishLink(diagramId) }, [finishLink])

  const handleLinkCreate = useCallback(async (name: string) => {
    const projectId = activeDiagram()?.projectId ?? null
    const newId = await createDiagram(name, projectId)
    if (isSupabaseConfigured) await useCollabStore.getState().loadRoles()
    await finishLink(newId)
  }, [activeDiagram, createDiagram, finishLink])



  // Auto-save
  const { save: autoSave } = useAutoSave(getXml, getSvg, getThumbCrop)
  void autoSave

  // Keyboard shortcuts
  useKeyboard({
    onSave: handleSave,
    onUndo: () => canvasRef.current?.undo(),
    onRedo: () => canvasRef.current?.redo(),
    onNew: handleNew,
    onValidate: handleValidate,
  })

  if (!prefsLoaded || !authInitialized) return null

  // Modo nube: exige sesión antes de entrar a la app.
  if (isSupabaseConfigured && !session) return <LoginView />

  return (
    <>
      {view === 'home' ? (
        <DiagramList
          onOpen={handleOpenDiagram}
          onNew={handleNew}
          onImport={handleImport}
          onNewProject={handleNewProject}
          onShareProject={handleShareProject}
          onNewInProject={handleNewInProject}
          onSignOut={handleSignOut}
        />
      ) : (
        <div className="app">
          <Toolbar
            onNew={handleNew}
            onImport={() => handleImport(activeDiagram()?.projectId ?? null)}
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
            cloudMode={isSupabaseConfigured}
            canEdit={canEditActive}
            onShare={() => openModal('share')}
            onSignOut={handleSignOut}
          />

          <TabsBar onNew={handleNew} onProjectView={() => setProjectViewOpen(true)} />

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
              canEdit={canEditActive}
            />

            <div style={{ minHeight: 0, minWidth: 0, overflow: 'hidden', position: 'relative', height: '100%' }}>
              <BpmnCanvas
                ref={canvasRef}
                onReady={handleCanvasReady}
                onChanged={handleChanged}
                onSubProcessOpen={handleSubProcessOpen}
              />
            </div>

            <RightPanel
              collapsed={!propertiesPanelOpen}
              onToggle={() => setPropertiesPanelOpen(!propertiesPanelOpen)}
              getSelectedElements={() => canvasRef.current?.getSelectedElements() ?? []}
              readOnly={!canEditActive}
              onUpdateProperty={(id, prop, val) => {
                if (!canEditActive) return
                canvasRef.current?.updateElementProperty(id, prop, val)
              }}
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
      {activeModal === 'imageUpload' && (
        <ImageUploadModal />
      )}
      {activeModal === 'share' && activeDiagram() && (
        <ShareModal
          diagramId={activeDiagram()!.id}
          diagramName={activeDiagram()!.name}
          onClose={closeModal}
        />
      )}
      {activeModal === 'newProject' && (
        <NewProjectModal onConfirm={handleNewProjectConfirm} onCancel={closeModal} />
      )}
      {activeModal === 'linkDiagram' && (
        <LinkDiagramModal
          projectId={activeDiagram()?.projectId ?? null}
          currentDiagramId={activeTabId}
          onPick={handleLinkPick}
          onCreateAndLink={handleLinkCreate}
          onCancel={() => { setLinkingElementId(null); closeModal() }}
        />
      )}
      {activeModal === 'shareProject' && shareProjectInfo && (
        <ShareModal
          kind="project"
          diagramId={shareProjectInfo.id}
          diagramName={shareProjectInfo.name}
          onClose={() => { setShareProjectInfo(null); closeModal() }}
        />
      )}

      {projectViewOpen && view === 'editor' && (
        <ProjectView
          onOpen={handleOpenDiagram}
          onNew={() => { setProjectViewOpen(false); handleNew() }}
          onClose={() => setProjectViewOpen(false)}
        />
      )}
      
      <ToastContainer />
    </>
  )
}
