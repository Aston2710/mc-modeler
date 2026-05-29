import { LocalRepository } from './LocalRepository'
import { SupabaseRepository } from './SupabaseRepository'

/**
 * Sube los diagramas/carpetas/thumbnails guardados localmente (IndexedDB) a la nube.
 * Pensado para ejecutarse una vez tras el primer login. Idempotente: no sobreescribe
 * diagramas que ya existan en la nube con el mismo id.
 *
 * Devuelve cuántos diagramas se migraron.
 */
export async function migrateLocalToCloud(): Promise<number> {
  const local = new LocalRepository()
  const cloud = new SupabaseRepository()

  const [localDiagrams, cloudDiagrams, localFolders] = await Promise.all([
    local.getAll(),
    cloud.getAll(),
    local.getFolders(),
  ])

  const cloudIds = new Set(cloudDiagrams.map((d) => d.id))

  // Carpetas primero (los diagramas pueden referenciarlas).
  for (const folder of localFolders) {
    try {
      await cloud.saveFolder(folder)
    } catch {
      // ignorar duplicados / fallos individuales
    }
  }

  let migrated = 0
  for (const diagram of localDiagrams) {
    if (cloudIds.has(diagram.id)) continue
    try {
      await cloud.save(diagram)
      const thumb = await local.getThumbnail(diagram.id)
      if (thumb) await cloud.saveThumbnail(diagram.id, thumb)
      migrated++
    } catch {
      // continuar con el resto
    }
  }

  return migrated
}
