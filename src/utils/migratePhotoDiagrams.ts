import type { Diagram, LibraryImage } from '@/domain/types'

/**
 * migratePhotoDiagrams — convierte los "diagramas-foto" (diagramas que solo
 * contienen una imagen, usados como truco para adjuntar fotos a un subproceso)
 * en imágenes de la biblioteca vinculadas directamente al elemento.
 *
 * Los helpers de detección/reescritura son puros (operan sobre strings XML) para
 * poder testearlos sin bpmn-js ni stores.
 */

const IMAGE_TOKEN_RE = /\[IMAGE:([^\]]+)\]/

/** Extrae la primera referencia de imagen (`storage://…`, `data:…` o URL) del XML. */
export function extractFirstImageRef(xml: string): string | null {
  return IMAGE_TOKEN_RE.exec(xml)?.[1] ?? null
}

// Elementos de "proceso real": si el diagrama tiene alguno, NO es solo-foto.
const FLOW_ELEMENT_RE =
  /<(?:\w+:)?(?:task|userTask|serviceTask|scriptTask|sendTask|receiveTask|manualTask|businessRuleTask|callActivity|subProcess|exclusiveGateway|parallelGateway|inclusiveGateway|complexGateway|eventBasedGateway|intermediateCatchEvent|intermediateThrowEvent|boundaryEvent|endEvent|dataObjectReference|dataStoreReference)\b/i

/**
 * ¿El XML corresponde a un diagrama-foto? = tiene un token de imagen y NINGÚN
 * elemento de proceso real (solo el andamiaje vacío: pool + startEvent + la
 * TextAnnotation con la imagen).
 */
export function isPhotoDiagramXml(xml: string): boolean {
  if (!xml || !IMAGE_TOKEN_RE.test(xml)) return false
  return !FLOW_ELEMENT_RE.test(xml)
}

/** Id del subproceso que enlaza a `diagramId` dentro de `parentXml`, o null. */
export function findLinkingElementId(parentXml: string, diagramId: string): string | null {
  // Busca el <...subProcess ... flujo:linkedDiagram="diagramId" ... id="X"> en
  // cualquier orden de atributos.
  const re = new RegExp(
    `<(?:\\w+:)?subProcess\\b[^>]*flujo:linkedDiagram="${diagramId}"[^>]*>`,
    'i'
  )
  const tag = re.exec(parentXml)?.[0]
  if (!tag) {
    // Orden inverso: id antes que linkedDiagram.
    const re2 = new RegExp(
      `<(?:\\w+:)?subProcess\\b[^>]*id="([^"]+)"[^>]*flujo:linkedDiagram="${diagramId}"`,
      'i'
    )
    return re2.exec(parentXml)?.[1] ?? null
  }
  return /\bid="([^"]+)"/.exec(tag)?.[1] ?? null
}

/**
 * Reescribe el subproceso `elementId` del `parentXml`: quita
 * `flujo:linkedDiagram="…"` y le pone `flujo:linkedImages="imageId"`.
 */
export function rewriteLinkToImage(parentXml: string, elementId: string, imageId: string): string {
  const tagRe = new RegExp(`(<(?:\\w+:)?subProcess\\b[^>]*\\bid="${elementId}"[^>]*>)`, 'i')
  return parentXml.replace(tagRe, (tag) => {
    let out = tag.replace(/\s*flujo:linkedDiagram="[^"]*"/i, '')
    if (/flujo:linkedImages="/.test(out)) {
      out = out.replace(/flujo:linkedImages="([^"]*)"/i, (_m, cur: string) => {
        const ids = cur.split(',').map((s) => s.trim()).filter(Boolean)
        if (!ids.includes(imageId)) ids.push(imageId)
        return `flujo:linkedImages="${ids.join(',')}"`
      })
    } else {
      // Insertar antes del cierre del tag (respeta '/>' y '>').
      out = out.replace(/(\s*\/?>)$/, ` flujo:linkedImages="${imageId}"$1`)
    }
    return out
  })
}

export interface PhotoDiagramCandidate {
  photo: Diagram
  parentId: string
  elementId: string
  imageRef: string
}

export interface MigrationDeps {
  ensureXml: (id: string) => Promise<string>
  resolveImageData: (ref: string) => Promise<string | null>
  uploadImage: (params: { dataUrl: string; name: string; projectId: string | null }) => Promise<LibraryImage>
  saveDiagram: (id: string, xml: string) => Promise<void>
  deleteDiagram: (id: string) => Promise<void>
}

/**
 * Detecta candidatos: diagramas-foto que además son destino de un
 * flujo:linkedDiagram desde algún subproceso.
 */
export async function findPhotoDiagramCandidates(
  diagrams: Diagram[],
  deps: Pick<MigrationDeps, 'ensureXml'>
): Promise<PhotoDiagramCandidate[]> {
  const xmls = new Map<string, string>()
  for (const d of diagrams) {
    try { xmls.set(d.id, await deps.ensureXml(d.id)) } catch { /* omitir el que no cargue */ }
  }
  const candidates: PhotoDiagramCandidate[] = []
  for (const photo of diagrams) {
    const xml = xmls.get(photo.id)
    if (!xml || !isPhotoDiagramXml(xml)) continue
    const imageRef = extractFirstImageRef(xml)
    if (!imageRef) continue
    // ¿Alguien lo enlaza?
    for (const other of diagrams) {
      if (other.id === photo.id) continue
      const parentXml = xmls.get(other.id)
      if (!parentXml || !parentXml.includes(`flujo:linkedDiagram="${photo.id}"`)) continue
      const elementId = findLinkingElementId(parentXml, photo.id)
      if (elementId) {
        candidates.push({ photo, parentId: other.id, elementId, imageRef })
        break
      }
    }
  }
  return candidates
}

/**
 * Migra un candidato: sube la imagen a la biblioteca, reescribe el enlace del
 * padre a flujo:linkedImages y (si deletePhoto) borra el diagrama-foto.
 * Devuelve la imagen creada.
 */
export async function migrateCandidate(
  candidate: PhotoDiagramCandidate,
  deps: MigrationDeps,
  deletePhoto: boolean
): Promise<LibraryImage> {
  const dataUrl = await deps.resolveImageData(candidate.imageRef)
  if (!dataUrl) throw new Error('No se pudo resolver la imagen del diagrama-foto')
  const image = await deps.uploadImage({
    dataUrl,
    name: candidate.photo.name,
    projectId: candidate.photo.projectId,
  })
  const parentXml = await deps.ensureXml(candidate.parentId)
  const newXml = rewriteLinkToImage(parentXml, candidate.elementId, image.id)
  await deps.saveDiagram(candidate.parentId, newXml)
  if (deletePhoto) await deps.deleteDiagram(candidate.photo.id)
  return image
}
