import { describe, it, expect } from 'vitest'
import {
  extractFirstImageRef, isPhotoDiagramXml, findLinkingElementId, rewriteLinkToImage,
  findPhotoDiagramCandidates, migrateCandidate,
} from './migratePhotoDiagrams'
import type { Diagram, LibraryImage } from '@/domain/types'

const PHOTO_XML = `<?xml version="1.0"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:flujo="http://flujo.app/schema/bpmn">
  <bpmn:process id="P">
    <bpmn:startEvent id="S" />
    <bpmn:textAnnotation id="T"><bpmn:text>[IMAGE:storage://diagram-images/x/imglib/u.webp]</bpmn:text></bpmn:textAnnotation>
  </bpmn:process>
</bpmn:definitions>`

const REAL_XML = `<?xml version="1.0"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL">
  <bpmn:process id="P">
    <bpmn:startEvent id="S" />
    <bpmn:userTask id="U" name="hacer algo" />
  </bpmn:process>
</bpmn:definitions>`

const PARENT_XML = `<?xml version="1.0"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:flujo="http://flujo.app/schema/bpmn">
  <bpmn:process id="P">
    <bpmn:subProcess id="Sub_1" name="foto" flujo:linkedDiagram="photo-1" />
  </bpmn:process>
</bpmn:definitions>`

describe('migratePhotoDiagrams — helpers puros', () => {
  it('extractFirstImageRef saca la referencia', () => {
    expect(extractFirstImageRef(PHOTO_XML)).toBe('storage://diagram-images/x/imglib/u.webp')
    expect(extractFirstImageRef(REAL_XML)).toBeNull()
  })

  it('isPhotoDiagramXml: foto sí, proceso real no', () => {
    expect(isPhotoDiagramXml(PHOTO_XML)).toBe(true)
    expect(isPhotoDiagramXml(REAL_XML)).toBe(false)
    expect(isPhotoDiagramXml('<x/>')).toBe(false)
  })

  it('findLinkingElementId encuentra el subproceso que enlaza', () => {
    expect(findLinkingElementId(PARENT_XML, 'photo-1')).toBe('Sub_1')
    expect(findLinkingElementId(PARENT_XML, 'otro')).toBeNull()
  })

  it('rewriteLinkToImage cambia linkedDiagram por linkedImages', () => {
    const out = rewriteLinkToImage(PARENT_XML, 'Sub_1', 'img-9')
    expect(out).not.toContain('flujo:linkedDiagram')
    expect(out).toContain('flujo:linkedImages="img-9"')
  })

  it('rewriteLinkToImage acumula si ya hay imágenes', () => {
    const withImg = PARENT_XML.replace('flujo:linkedDiagram="photo-1"', 'flujo:linkedImages="a"')
    const out = rewriteLinkToImage(withImg, 'Sub_1', 'b')
    expect(out).toContain('flujo:linkedImages="a,b"')
  })
})

describe('migratePhotoDiagrams — orquestación', () => {
  const photo: Diagram = {
    id: 'photo-1', name: 'Captura', xml: '', thumbnail: null, folderId: null, projectId: 'proj-1',
    elementCount: 0, schemaVersion: 1, createdAt: '', updatedAt: '', parentDiagramId: null, subProcessElementId: null,
  }
  const parent: Diagram = { ...photo, id: 'parent-1', name: 'Proceso', projectId: 'proj-1' }

  const makeDeps = (saved: Record<string, string>, deleted: string[], uploaded: LibraryImage[]) => ({
    ensureXml: async (id: string) => (id === 'photo-1' ? PHOTO_XML : PARENT_XML),
    resolveImageData: async () => 'data:image/webp;base64,AAAA',
    uploadImage: async ({ name, projectId }: { dataUrl: string; name: string; projectId: string | null }) => {
      const img: LibraryImage = {
        id: 'img-new', name, projectId, folderId: null, mime: 'image/webp', size: 3,
        ref: 'local://img-new', createdAt: '', updatedAt: '',
      }
      uploaded.push(img)
      return img
    },
    saveDiagram: async (id: string, xml: string) => { saved[id] = xml },
    deleteDiagram: async (id: string) => { deleted.push(id) },
  })

  it('detecta el candidato foto enlazado', async () => {
    const cands = await findPhotoDiagramCandidates([photo, parent], {
      ensureXml: async (id) => (id === 'photo-1' ? PHOTO_XML : PARENT_XML),
    })
    expect(cands).toHaveLength(1)
    expect(cands[0]).toMatchObject({ parentId: 'parent-1', elementId: 'Sub_1' })
  })

  it('migra: sube imagen, reescribe padre, borra foto', async () => {
    const saved: Record<string, string> = {}
    const deleted: string[] = []
    const uploaded: LibraryImage[] = []
    const deps = makeDeps(saved, deleted, uploaded)
    const cand = { photo, parentId: 'parent-1', elementId: 'Sub_1', imageRef: 'storage://diagram-images/x/imglib/u.webp' }
    const img = await migrateCandidate(cand, deps, true)
    expect(img.name).toBe('Captura')
    expect(saved['parent-1']).toContain('flujo:linkedImages="img-new"')
    expect(saved['parent-1']).not.toContain('flujo:linkedDiagram')
    expect(deleted).toEqual(['photo-1'])
  })
})
