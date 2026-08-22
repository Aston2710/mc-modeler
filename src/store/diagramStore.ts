import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import type { Diagram, DiagramTab, Project } from '@/domain/types'
import { diagramRepository } from '@/persistence'
import { DiagramConflictError } from '@/persistence/IDiagramRepository'
import { generateDiagramId } from '@/utils/idGenerator'
import { normalizeBpmnXml } from '@/utils/normalizeBpmnXml'
import { externalizeImages, rehomeImages, deleteDiagramImages } from '@/utils/imageStorage'
import { perfStart } from '@/utils/perf'
import { dispose as disposeModelerInstance } from '@/bpmn/modelerCache'

/**
 * Validación mínima antes de persistir: no guardar XML vacío o que no parezca
 * BPMN (evita pisar datos buenos con un canvas roto/vacío). No pretende validar
 * el modelo completo, solo descartar basura evidente. Además del regex, verifica
 * que el XML esté bien formado (DOMParser) — barato y ataja truncados/corruptos.
 */
function looksLikeBpmn(xml: string): boolean {
  if (!xml || xml.length <= 50 || !/<(?:\w+:)?definitions[\s>]/.test(xml)) return false
  if (typeof DOMParser !== 'undefined') {
    try {
      const doc = new DOMParser().parseFromString(xml, 'text/xml')
      if (doc.getElementsByTagName('parsererror').length > 0) return false
    } catch { /* entorno sin XML parser: caer al regex */ }
  }
  return true
}

const EMPTY_BPMN = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
  xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"
  xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"
  id="Definitions_1"
  targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:collaboration id="Collaboration_1">
    <bpmn:participant id="Participant_1" name="Proceso 1" processRef="Process_1" />
  </bpmn:collaboration>
  <bpmn:process id="Process_1" isExecutable="false">
    <bpmn:startEvent id="StartEvent_1" />
  </bpmn:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_1">
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="Collaboration_1">
      <bpmndi:BPMNShape id="Participant_1_di" bpmnElement="Participant_1" isHorizontal="true">
        <dc:Bounds x="100" y="50" width="600" height="250" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="StartEvent_1_di" bpmnElement="StartEvent_1">
        <dc:Bounds x="152" y="157" width="36" height="36" />
      </bpmndi:BPMNShape>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>`

const EMPTY_SUBPROCESS_BPMN = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
  xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"
  xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"
  id="Definitions_sub"
  targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:collaboration id="Collaboration_sub">
    <bpmn:participant id="Participant_sub" name="Sub proceso" processRef="Process_sub" />
  </bpmn:collaboration>
  <bpmn:process id="Process_sub" isExecutable="false">
    <bpmn:startEvent id="StartEvent_sub" />
  </bpmn:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_sub">
    <bpmndi:BPMNPlane id="BPMNPlane_sub" bpmnElement="Collaboration_sub">
      <bpmndi:BPMNShape id="Participant_sub_di" bpmnElement="Participant_sub" isHorizontal="true">
        <dc:Bounds x="100" y="50" width="600" height="250" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="StartEvent_sub_di" bpmnElement="StartEvent_sub">
        <dc:Bounds x="152" y="157" width="36" height="36" />
      </bpmndi:BPMNShape>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>`

interface DiagramState {
  diagrams: Diagram[]
  tabs: DiagramTab[]
  activeTabId: string | null
  isLoading: boolean
  lastSavedAt: string | null
  // Actions
  loadAll: () => Promise<void>
  createDiagram: (name: string, projectId?: string | null) => Promise<string>
  createSubDiagram: (name: string, parentDiagramId: string, subProcessElementId: string) => Promise<string>
  openDiagram: (id: string) => void
  /** Trae el XML del diagrama bajo demanda (la lista no lo carga). Cachea en memoria. */
  /**
   * Vuelve a resolver el thumbnail de un diagrama. La llama el `onError` del
   * `<img>`: las URLs firmadas caducan y esta acción es la única vía por la que
   * una tarjeta con la URL vencida se recupera. Ver `refreshThumbnailUrl`.
   */
  refreshThumbnail: (id: string) => Promise<void>
  ensureXml: (id: string) => Promise<string>
  /** Fuerza re-fetch del XML desde el servidor (ignora el caché) y actualiza el store. */
  refreshXml: (id: string) => Promise<string>
  /**
   * Actualiza SOLO el XML en memoria (sin escribir al repositorio). Se usa al
   * ceder una pestaña con guardado en background: deja el XML fresco en el
   * caché al instante para que, si el usuario vuelve a la pestaña antes de que
   * termine el guardado, ensureXml devuelva lo último y no una versión vieja.
   */
  cacheXml: (id: string, xml: string) => void
  closeTab: (id: string) => void
  setActiveTab: (id: string) => void
  saveDiagram: (id: string, xml: string, elementCount?: number, thumbnail?: string | null) => Promise<void>
  saveThumbnailOnly: (id: string, thumbnail: string) => Promise<void>
  renameDiagram: (id: string, name: string) => Promise<void>
  duplicateDiagram: (id: string) => Promise<string>
  deleteDiagram: (id: string) => Promise<void>
  deleteWithChildren: (id: string) => Promise<void>
  importDiagram: (xml: string, name: string, projectId?: string | null) => Promise<string>
  markTabDirty: (id: string, dirty: boolean) => void
  renameTab: (id: string, name: string) => void
  activeDiagram: () => Diagram | null
  getChildren: (parentId: string) => Diagram[]
  getChildByElement: (parentId: string, subProcessElementId: string) => Diagram | null
  // Proyectos
  projects: Project[]
  loadProjects: () => Promise<void>
  createProject: (name: string) => Promise<string>
  renameProject: (id: string, name: string) => Promise<void>
  deleteProject: (id: string) => Promise<void>
  moveDiagramToProject: (diagramId: string, projectId: string | null) => Promise<void>
  // Papelera (soft delete)
  trash: { diagrams: Diagram[]; projects: Project[] }
  loadTrash: () => Promise<void>
  restoreDiagram: (id: string) => Promise<void>
  purgeDiagram: (id: string) => Promise<void>
  restoreProject: (id: string) => Promise<void>
  purgeProject: (id: string) => Promise<void>
  emptyTrash: () => Promise<void>
}

// Serializa los guardados: autosave y guardado manual pueden solaparse; dos
// escrituras CAS en vuelo del MISMO cliente se auto-conflictúan (la segunda
// arranca con el updated_at previo) y pueden escalar al toast de conflicto.
// Complementa a adoptPersisted: la cadena ordena los guardados del mismo
// cliente; el atajo de idempotencia resuelve las carreras entre clientes.
let saveChain: Promise<unknown> = Promise.resolve()

export const useDiagramStore = create<DiagramState>()(
  immer((set, get) => ({
    diagrams: [],
    tabs: [],
    activeTabId: null,
    isLoading: false,
    lastSavedAt: null,
    trash: { diagrams: [], projects: [] },
    projects: [],

    loadAll: async () => {
      set((s) => { s.isLoading = true })
      // getAll trae SOLO metadata (sin current_xml) → carga liviana y rápida.
      const diagrams = await diagramRepository.getAll()
      // Mostrar las tarjetas de inmediato; NO bloquear la lista esperando thumbnails.
      // Conservar los thumbnails ya cargados: si loadAll se re-ejecuta (p. ej. al
      // refrescarse la sesión), NO blanquear lo que ya se mostraba → sin parpadeo.
      set((s) => {
        const prevThumbs = new Map(s.diagrams.map((d) => [d.id, d.thumbnail]))
        s.diagrams = diagrams.map((d) => ({ ...d, thumbnail: prevThumbs.get(d.id) ?? null }))
        s.isLoading = false
      })
      // Hidratar en segundo plano SOLO los thumbnails que aún no tenemos.
      // En UNA llamada, no una por tarjeta (PLAN-012): antes eran N descargas
      // autenticadas más N conversiones a base64 —~4 MB por el hilo principal
      // con la portada llena—; ahora se piden todas las URLs de golpe y el
      // navegador descarga las imágenes en paralelo, con su propia caché.
      const missing = diagrams
        .filter((d) => !get().diagrams.find((z) => z.id === d.id)?.thumbnail)
        .map((d) => d.id)
      if (missing.length > 0) {
        void diagramRepository
          .getThumbnailUrls(missing)
          .then((urls) => {
            if (urls.size === 0) return
            set((s) => {
              for (const [id, url] of urls) {
                const x = s.diagrams.find((z) => z.id === id)
                if (x && !x.thumbnail) x.thumbnail = url
              }
            })
          })
          .catch(() => { /* sin thumbnails: la portada se ve igual, sin imagen */ })
      }
    },

    refreshThumbnail: async (id) => {
      const url = await diagramRepository.refreshThumbnailUrl(id).catch(() => null)
      if (!url) return
      set((s) => {
        const d = s.diagrams.find((z) => z.id === id)
        // Se compara antes de escribir: si la URL no cambió, tocar el estado
        // volvería a montar el <img> y dispararía otro onError en bucle.
        if (d && d.thumbnail !== url) d.thumbnail = url
      })
    },

    ensureXml: async (id) => {
      const existing = get().diagrams.find((d) => d.id === id)
      if (existing && existing.xml) {
        perfStart('diagram:ensureXml:cacheHit', { diagramId: id })()
        return existing.xml
      }
      // La lista no trae el XML; se pide el diagrama completo la primera vez y se cachea.
      const endFetch = perfStart('diagram:ensureXml:fetch', { diagramId: id })
      const full = await diagramRepository.getById(id)
      endFetch({ bytes: full?.xml?.length ?? 0 })
      const xml = full?.xml ?? ''
      if (xml) {
        set((s) => {
          const d = s.diagrams.find((d) => d.id === id)
          if (d) d.xml = xml
        })
      }
      return xml
    },

    cacheXml: (id, xml) => {
      set((s) => {
        const d = s.diagrams.find((d) => d.id === id)
        if (d) d.xml = xml
      })
    },

    refreshXml: async (id) => {
      const full = await diagramRepository.getById(id)
      if (!full) return ''
      set((s) => {
        const d = s.diagrams.find((d) => d.id === id)
        if (d) {
          d.xml = full.xml
          d.updatedAt = full.updatedAt
        }
      })
      return full.xml
    },

    createDiagram: async (name, projectId = null) => {
      const id = generateDiagramId()
      const now = new Date().toISOString()
      const diagram: Diagram = {
        id,
        name,
        xml: EMPTY_BPMN,
        thumbnail: null,
        folderId: null,
        projectId,
        elementCount: 0,
        schemaVersion: 1,
        createdAt: now,
        updatedAt: now,
        parentDiagramId: null,
        subProcessElementId: null,
      }
      await diagramRepository.save(diagram)
      set((s) => {
        s.diagrams.push(diagram)
        s.tabs.push({ id, name, dirty: false })
        s.activeTabId = id
      })
      return id
    },

    createSubDiagram: async (name, parentDiagramId, subProcessElementId) => {
      const id = generateDiagramId()
      const now = new Date().toISOString()
      // El subproceso hereda el proyecto del diagrama padre.
      const parent = get().diagrams.find((d) => d.id === parentDiagramId)
      const diagram: Diagram = {
        id,
        name,
        xml: EMPTY_SUBPROCESS_BPMN,
        thumbnail: null,
        folderId: null,
        projectId: parent?.projectId ?? null,
        elementCount: 0,
        schemaVersion: 1,
        createdAt: now,
        updatedAt: now,
        parentDiagramId,
        subProcessElementId,
      }
      await diagramRepository.save(diagram)
      set((s) => {
        s.diagrams.push(diagram)
        s.tabs.push({ id, name, dirty: false })
        s.activeTabId = id
      })
      return id
    },

    openDiagram: (id) => {
      set((s) => {
        const diagram = s.diagrams.find((d) => d.id === id)
        if (!diagram) return
        const exists = s.tabs.some((t) => t.id === id)
        if (!exists) {
          s.tabs.push({ id, name: diagram.name, dirty: false })
        }
        s.activeTabId = id
      })
    },

    closeTab: (id) => {
      set((s) => {
        const idx = s.tabs.findIndex((t) => t.id === id)
        s.tabs.splice(idx, 1)
        if (s.activeTabId === id) {
          s.activeTabId = s.tabs[Math.max(0, idx - 1)]?.id ?? null
        }
      })
      // Liberar la instancia viva de bpmn-js de esta pestaña (PLAN-005 paso 6).
      // Sin esto, cerrar una pestaña dejaba su instancia en el cache —con su
      // SVG, su element registry y su pila de undo— hasta que el LRU la
      // desalojara (tope 6) o se volviera al inicio. Fuga acotada pero real:
      // abrir y cerrar 6 diagramas grandes mantenía los 6 en memoria.
      //
      // Va después del `set`: para entonces `activeTabId` ya apunta a la
      // pestaña vecina, así que destruir esta no deja al canvas sin destino.
      disposeModelerInstance(id)
    },

    setActiveTab: (id) => {
      set((s) => { s.activeTabId = id })
    },

    saveDiagram: (id, xml, elementCount = 0, thumbnail) => {
      // Todo el cuerpo corre DENTRO de la cadena (saveChain): los guardados del
      // mismo cliente se ejecutan en serie, y cada uno lee el updated_at fresco
      // que dejó el anterior (get() se evalúa al ejecutar run, no al encolar).
      const run = async () => {
      const now = new Date().toISOString()
      const diagram = get().diagrams.find((d) => d.id === id)
      if (!diagram) return
      // Validación: no persistir XML vacío/roto → no pisar datos buenos con basura.
      if (!looksLikeBpmn(xml)) {
        console.warn('[Flujo] guardado omitido: XML inválido/vacío para', id)
        return
      }
      const updated: Diagram = { ...diagram, xml, elementCount, updatedAt: now }

      // Adopta el estado ya persistido por otro escritor (idempotencia, ADR §3.4):
      // en tiempo real todos guardan el MISMO estado acordado — si el servidor ya
      // tiene exactamente este XML, no hay nada que escribir ni que avisar.
      const adoptPersisted = (freshUpdatedAt: string) => {
        set((s) => {
          const d = s.diagrams.find((d) => d.id === id)
          if (d) { d.updatedAt = freshUpdatedAt; d.xml = xml; d.elementCount = elementCount }
          const tab = s.tabs.find((t) => t.id === id)
          if (tab) tab.dirty = false
          s.lastSavedAt = freshUpdatedAt
        })
      }

      // Control optimista (CAS): esperado = el updated_at que teníamos en memoria.
      // Si otro escritor guardó antes, DiagramConflictError. Resolución:
      //   1. re-sync; si el server ya tiene ESTE contenido → adoptar, listo.
      //   2. si difiere → reintentar UNA vez con la versión fresca (último-gana
      //      seguro, sin torn-write).
      //   3. si vuelve a chocar → mismo chequeo de contenido; solo si REALMENTE
      //      diverge se acepta el estado del otro y se notifica a la UI.
      let persistedUpdatedAt: string
      try {
        persistedUpdatedAt = await diagramRepository.save(updated, diagram.updatedAt)
      } catch (e) {
        if (!(e instanceof DiagramConflictError)) throw e
        const fresh = await diagramRepository.getById(id)
        if (!fresh) return // borrado por otro → nada que guardar
        if (fresh.xml === xml) { adoptPersisted(fresh.updatedAt); return }
        try {
          persistedUpdatedAt = await diagramRepository.save(updated, fresh.updatedAt)
        } catch (e2) {
          if (!(e2 instanceof DiagramConflictError)) throw e2
          const fresh2 = await diagramRepository.getById(id)
          if (!fresh2) return
          if (fresh2.xml === xml) { adoptPersisted(fresh2.updatedAt); return }
          console.warn('[Flujo] conflicto de guardado persistente; se acepta el estado del otro escritor para', id)
          set((s) => {
            const d = s.diagrams.find((d) => d.id === id)
            if (d) d.updatedAt = fresh2.updatedAt
            const tab = s.tabs.find((t) => t.id === id)
            if (tab) tab.dirty = false
          })
          // Caso mal-uso (vista muy stale / edición offline larga) CON divergencia
          // real de contenido: notificar explícitamente — nunca clobber ni
          // descarte silencioso. La UI (App) ofrece recargar la versión del
          // servidor o guardar la copia local como duplicado.
          if (typeof document !== 'undefined') {
            document.dispatchEvent(new CustomEvent('flujo:save-conflict', { detail: { id } }))
          }
          return
        }
      }

      // El thumbnail es best-effort: si falla su subida (p. ej. Storage), NO debe
      // hacer fallar el guardado del diagrama. Si tocó la fila (primera vez que
      // el diagrama tiene thumbnail), el trigger movió updated_at → adoptar esa
      // versión como la nuestra o quedaríamos stale tras nuestro propio guardado.
      try {
        if (thumbnail !== undefined) {
          const bumped = await diagramRepository.saveThumbnail(id, thumbnail ?? '')
          if (bumped) persistedUpdatedAt = bumped
        }
      } catch (err) {
        console.warn('[Flujo] thumbnail no se pudo guardar (no crítico):', err)
      }

      set((s) => {
        const idx = s.diagrams.findIndex((d) => d.id === id)
        if (idx >= 0) {
          // Guardar el updated_at persistido (server-authoritative) para el próximo CAS.
          s.diagrams[idx] = { ...updated, updatedAt: persistedUpdatedAt }
          if (thumbnail !== undefined) s.diagrams[idx].thumbnail = thumbnail ?? null
        }
        const tab = s.tabs.find((t) => t.id === id)
        if (tab) tab.dirty = false
        s.lastSavedAt = persistedUpdatedAt
      })
      }
      const task = saveChain.then(run, run)
      saveChain = task.catch(() => { /* el error lo maneja el caller de task */ })
      return task
    },

    saveThumbnailOnly: async (id, thumbnail) => {
      const bumped = await diagramRepository.saveThumbnail(id, thumbnail)
      set((s) => {
        const d = s.diagrams.find((d) => d.id === id)
        if (d) {
          d.thumbnail = thumbnail
          if (bumped) d.updatedAt = bumped
        }
      })
    },

    renameDiagram: async (id, name) => {
      // Update dirigido (solo name): NUNCA save() con el diagrama completo —
      // escribiría el current_xml en memoria (posiblemente stale) sin CAS,
      // pisando el trabajo de otro colaborador. El trigger mueve updated_at →
      // adoptar la versión nueva para no quedar stale.
      const bumped = await diagramRepository.setDiagramName(id, name)
      set((s) => {
        const d = s.diagrams.find((d) => d.id === id)
        if (d) {
          d.name = name
          if (bumped) d.updatedAt = bumped
        }
        const t = s.tabs.find((t) => t.id === id)
        if (t) t.name = name
      })
    },

    duplicateDiagram: async (id) => {
      const source = get().diagrams.find((d) => d.id === id)
      if (!source) throw new Error('Diagram not found')
      // El XML puede no estar en memoria (la lista no lo carga) → traerlo.
      let xml = source.xml || (await get().ensureXml(id))
      const newId = generateDiagramId()
      // Copiar las imágenes de Storage a la carpeta del duplicado (sin esto,
      // la copia apuntaría a objetos del original — se romperían al borrarlo).
      xml = await rehomeImages(xml, newId)
      const now = new Date().toISOString()
      const copy: Diagram = {
        ...source,
        xml,
        id: newId,
        name: `${source.name} (copia)`,
        thumbnail: null,
        parentDiagramId: null,
        subProcessElementId: null,
        createdAt: now,
        updatedAt: now,
      }
      await diagramRepository.save(copy)
      set((s) => { s.diagrams.push(copy) })
      return newId
    },

    deleteDiagram: async (id) => {
      // Soft delete: a la papelera. NO se borran imágenes (se conservan para restaurar).
      await diagramRepository.delete(id)
      const now = new Date().toISOString()
      set((s) => {
        const d = s.diagrams.find((x) => x.id === id)
        s.diagrams = s.diagrams.filter((x) => x.id !== id)
        if (d) s.trash.diagrams.unshift({ ...d, deletedAt: now })
        const idx = s.tabs.findIndex((t) => t.id === id)
        if (idx >= 0) {
          s.tabs.splice(idx, 1)
          if (s.activeTabId === id) {
            s.activeTabId = s.tabs[Math.max(0, idx - 1)]?.id ?? null
          }
        }
      })
    },

    importDiagram: async (xml, name, projectId = null) => {
      // Serialización canónica (ADR §6.4): nunca persistir el XML crudo del
      // archivo — re-serializar con el mismo serializer que usa el autosave
      // (un solo dialecto). Si no parsea, lanza y el import se rechaza.
      let canonicalXml = await normalizeBpmnXml(xml)
      const id = generateDiagramId()
      // Imágenes embebidas del archivo → Storage (ADR Etapa 4): el XML
      // persistido guarda referencias ligeras, nunca base64 de MBs.
      canonicalXml = await externalizeImages(canonicalXml, id)
      const now = new Date().toISOString()
      const diagram: Diagram = {
        id,
        name,
        xml: canonicalXml,
        thumbnail: null,
        folderId: null,
        projectId,
        elementCount: 0,
        schemaVersion: 1,
        createdAt: now,
        updatedAt: now,
        parentDiagramId: null,
        subProcessElementId: null,
      }
      await diagramRepository.save(diagram)
      set((s) => {
        s.diagrams.push(diagram)
        s.tabs.push({ id, name, dirty: false })
        s.activeTabId = id
      })
      return id
    },

    markTabDirty: (id, dirty) => {
      set((s) => {
        const tab = s.tabs.find((t) => t.id === id)
        if (tab) tab.dirty = dirty
      })
    },

    renameTab: (id, name) => {
      set((s) => {
        const tab = s.tabs.find((t) => t.id === id)
        if (tab) tab.name = name
      })
    },

    activeDiagram: () => {
      const { diagrams, activeTabId } = get()
      return diagrams.find((d) => d.id === activeTabId) ?? null
    },
    
    deleteWithChildren: async (id) => {
      const allDiagrams = get().diagrams
      const collectIds = (parentId: string): string[] => {
        const result: string[] = [parentId]
        const children = allDiagrams.filter((d) => d.parentDiagramId === parentId)
        for (const child of children) result.push(...collectIds(child.id))
        return result
      }
      const idsToDelete = collectIds(id)
      await diagramRepository.deleteWithChildren(id)
      for (const did of idsToDelete) void deleteDiagramImages(did) // best-effort
      set((s) => {
        s.diagrams = s.diagrams.filter((d) => !idsToDelete.includes(d.id))
        for (const did of idsToDelete) {
          const idx = s.tabs.findIndex((t) => t.id === did)
          if (idx >= 0) {
            s.tabs.splice(idx, 1)
            if (s.activeTabId === did) {
              s.activeTabId = s.tabs[Math.max(0, idx - 1)]?.id ?? null
            }
          }
        }
      })
    },

    getChildren: (parentId) => {
      return get().diagrams.filter((d) => d.parentDiagramId === parentId)
    },

    getChildByElement: (parentId, subProcessElementId) => {
      return get().diagrams.find(
        (d) => d.parentDiagramId === parentId && d.subProcessElementId === subProcessElementId
      ) ?? null
    },

    // ── Proyectos ──────────────────────────────────────────────
    loadProjects: async () => {
      const projects = await diagramRepository.getProjects()
      set((s) => { s.projects = projects })
    },

    createProject: async (name) => {
      const id = generateDiagramId()
      const now = new Date().toISOString()
      const project: Project = { id, name, ownerId: '', createdAt: now, updatedAt: now }
      await diagramRepository.saveProject(project)
      set((s) => { s.projects.push(project) })
      return id
    },

    renameProject: async (id, name) => {
      const project = get().projects.find((p) => p.id === id)
      if (!project) return
      const updated: Project = { ...project, name, updatedAt: new Date().toISOString() }
      await diagramRepository.saveProject(updated)
      set((s) => {
        const p = s.projects.find((p) => p.id === id)
        if (p) p.name = name
      })
    },

    deleteProject: async (id) => {
      // Soft delete: proyecto + sus diagramas a la papelera juntos.
      await diagramRepository.deleteProject(id)
      const now = new Date().toISOString()
      set((s) => {
        const p = s.projects.find((x) => x.id === id)
        s.projects = s.projects.filter((x) => x.id !== id)
        if (p) s.trash.projects.unshift({ ...p, deletedAt: now })
        const moved = s.diagrams.filter((d) => d.projectId === id)
        s.diagrams = s.diagrams.filter((d) => d.projectId !== id)
        moved.forEach((d) => s.trash.diagrams.unshift({ ...d, deletedAt: now }))
      })
    },

    // ── Papelera ──────────────────────────────────────────────────
    loadTrash: async () => {
      const trash = await diagramRepository.getTrash()
      set((s) => { s.trash = trash })
    },

    restoreDiagram: async (id) => {
      await diagramRepository.restore(id)
      set((s) => {
        const d = s.trash.diagrams.find((x) => x.id === id)
        s.trash.diagrams = s.trash.diagrams.filter((x) => x.id !== id)
        if (d) s.diagrams.push({ ...d, deletedAt: null })
      })
    },

    purgeDiagram: async (id) => {
      await diagramRepository.purge(id)
      void deleteDiagramImages(id) // ahora sí: borrado definitivo
      set((s) => { s.trash.diagrams = s.trash.diagrams.filter((x) => x.id !== id) })
    },

    restoreProject: async (id) => {
      await diagramRepository.restoreProject(id)
      set((s) => {
        const p = s.trash.projects.find((x) => x.id === id)
        s.trash.projects = s.trash.projects.filter((x) => x.id !== id)
        if (p) s.projects.push({ ...p, deletedAt: null })
        // Devolver sus diagramas de la papelera a la lista activa.
        const restored = s.trash.diagrams.filter((d) => d.projectId === id)
        s.trash.diagrams = s.trash.diagrams.filter((d) => d.projectId !== id)
        restored.forEach((d) => s.diagrams.push({ ...d, deletedAt: null }))
      })
    },

    purgeProject: async (id) => {
      const ids = get().trash.diagrams.filter((d) => d.projectId === id).map((d) => d.id)
      await diagramRepository.purgeProject(id)
      ids.forEach((did) => void deleteDiagramImages(did))
      set((s) => {
        s.trash.projects = s.trash.projects.filter((x) => x.id !== id)
        s.trash.diagrams = s.trash.diagrams.filter((d) => d.projectId !== id)
      })
    },

    emptyTrash: async () => {
      const ids = get().trash.diagrams.map((d) => d.id)
      await diagramRepository.purgeAll()
      ids.forEach((id) => void deleteDiagramImages(id))
      set((s) => { s.trash = { diagrams: [], projects: [] } })
    },

    moveDiagramToProject: async (diagramId, projectId) => {
      const bumped = await diagramRepository.setDiagramProject(diagramId, projectId)
      set((s) => {
        const d = s.diagrams.find((d) => d.id === diagramId)
        if (d) {
          d.projectId = projectId
          if (bumped) d.updatedAt = bumped // el trigger movió la versión
        }
      })
    },

  }))
)

// Solo dev: expone el store para instrumentación de rendimiento (Fase 0).
// Permite manejar apertura/cambio de pestañas desde un driver externo igual
// que lo hace la UI. Sin efecto en producción.
if (import.meta.env.DEV && typeof window !== 'undefined') {
  ;(window as unknown as { __diagStore?: typeof useDiagramStore }).__diagStore = useDiagramStore
}
