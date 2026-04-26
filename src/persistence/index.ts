import { LocalRepository } from './LocalRepository'
import type { IDiagramRepository } from './IDiagramRepository'

// v2.0: change this one line to swap backend
// import { ApiRepository } from './ApiRepository'
// export const diagramRepository: IDiagramRepository = new ApiRepository()
export const diagramRepository: IDiagramRepository = new LocalRepository()
