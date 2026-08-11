---
id: EXP-009
titulo: Las imagenes de la biblioteca no eran visibles para otros usuarios
estado: resuelto
severidad: media
fecha_deteccion: 2026-08-04
fecha_cierre: 2026-08-09
componentes: [images RLS, SupabaseImageRepository.ts, migracion 0020]
relacionados: []
---

# Visibilidad de imágenes: diagnóstico y plan de corrección

**Estado:** identificado, NO aplicado.
**Fecha:** 2026-08-04
**Síntoma:** solo el dueño / los colaboradores del proyecto ven las imágenes de la
biblioteca y las vinculadas a elementos del diagrama. Un viewer (o un colaborador
invitado al diagrama pero no al proyecto) ve el badge 📷 pero el lightbox queda en
blanco / spinner infinito, y la galería sale vacía.

---

## 1. Causa raíz

El ámbito de acceso de las imágenes se ancló al **proyecto** (`can_access_project`),
mientras el acceso a los **diagramas** se ancla al diagrama (`can_access_diagram`,
que además hereda del proyecto). Los dos modelos no coinciden → hay diagramas
accesibles cuyas imágenes no lo son.

Verificado contra la BD real (`pg_policies`): las políticas vivas coinciden con la
migración `0016_image_library.sql` (aplicada, versión `20260716164606`). No es un
problema de migración pendiente.

### Capa A — filas de metadatos (`public.images`, `public.image_folders`)

`supabase/migrations/0016_image_library.sql:73-77` (y `48-52` para carpetas):

```sql
create policy images_select on public.images
  for select using (
    owner_id = auth.uid()
    or (project_id is not null and private.can_access_project(project_id))
  );
```

Casos que fallan:

| Caso | Resultado |
|---|---|
| Imagen con `project_id = null` (subida trabajando sobre un diagrama **sin** proyecto) | solo la ve su dueño. Nadie más, nunca. |
| Diagrama compartido 1-a-1 (`diagram_collaborators`) que pertenece a un proyecto donde el invitado NO es colaborador | no ve la fila |
| Viewer de proyecto | sí la ve (esta parte funciona) |

Sin la fila, `useImageStore.images` no contiene la imagen →
`ImageLightbox` (`src/components/images/ImageLightbox.tsx:23,29`) hace
`getById(id)` → `undefined`, `resolve(id)` → `null` (corta en
`src/store/imageStore.ts:76` porque `images.find` no la encuentra) → spinner
permanente, sin mensaje de error.

### Capa B — objeto de Storage (bucket privado `diagram-images`, prefijo `imglib`)

`0016_image_library.sql:109-117`:

```sql
create policy diagram_images_lib_select on storage.objects
  for select using (
    bucket_id = 'diagram-images'
    and (storage.foldername(name))[2] = 'imglib'
    and (
      (storage.foldername(name))[1]::uuid = auth.uid()
      or private.can_access_project((storage.foldername(name))[1]::uuid)
    )
  );
```

El primer segmento del path es `scopeId = projectId ?? ownerId`
(`src/persistence/SupabaseImageRepository.ts:65`, `src/utils/imageStorage.ts:34`).
Si la imagen se subió sin proyecto, el `scopeId` es el **uid del dueño** → ningún
otro usuario pasa la política → `download()` 403 aunque la fila fuera visible.
Mismos huecos que la capa A. **Hay que arreglar A y B: son puertas independientes.**

### Capa C — filtro del cliente (no es permiso, pero oculta imágenes)

`src/components/images/ImageGallery.tsx:60`:

```ts
.filter((i) => (projectId ? i.projectId === projectId : !i.projectId))
```

La galería/selector solo muestra imágenes del ámbito exacto del diagrama activo
(`App.tsx:794,800` pasa `activeDiagram()?.projectId ?? null`). Aunque RLS se abra,
una imagen del proyecto A no aparece al trabajar en un diagrama sin proyecto, y
viceversa.

### Lo que NO está roto

Imágenes **embebidas por diagrama** (`[IMAGE:storage://diagram-images/<diagramId>/<uuid>.webp]`)
usan `diagram_images_select` con `private.can_access_diagram(...)` → cualquiera con
acceso al diagrama (incluido viewer) las descarga bien. Igual el bucket `thumbnails`.
Si el reporte incluye imágenes embebidas antiguas que no cargan, esa parte NO es RLS
y hay que mirar aparte.

---

## 2. Decisión de diseño requerida

El vínculo imagen↔elemento vive en el XML (`flujo:linkedImages`), **no en la BD**.
Postgres no puede evaluar "esta imagen está vinculada a un diagrama que el usuario
puede ver". Dos salidas:

**Opción 1 — lectura abierta a todo usuario autenticado (recomendada).**
Coincide con el requisito literal ("todos, de lectura a edición, deben ver todas las
imágenes"), es 2 políticas y cero cambios de esquema. Precio explícito: cualquier
usuario **con cuenta** puede leer toda la biblioteca de imágenes de la instancia y
enumerar nombres en `public.images`. La escritura (insert/update/delete) NO se toca.
No se hace el bucket público ni se concede a `anon`: sigue todo detrás de login.

**Opción 2 — tabla de vínculo `diagram_images(diagram_id, image_id)`.**
Permiso exacto ("ves la imagen si ves algún diagrama que la usa"), pero exige tabla
nueva, mantenerla sincronizada desde el cliente en cada link/unlink (y en
import/duplicado/Yjs remoto), y las políticas de Storage tendrían que resolver
`storage_path → image_id` con un join. Semanas de superficie de bug para un caso de
uso interno. No recomendada ahora.

El resto del plan asume la **Opción 1**.

---

## 3. Cómo editarlo

### 3.1 Migración nueva `supabase/migrations/0020_image_visibility.sql`

```sql
-- Lectura de la biblioteca de imágenes para cualquier usuario autenticado.
-- Motivo: el ámbito estaba atado al proyecto (can_access_project), pero el acceso
-- a diagramas se ancla al diagrama; un viewer o un invitado a un diagrama suelto
-- no podía ver las imágenes vinculadas. La escritura NO cambia.

drop policy if exists images_select on public.images;
create policy images_select on public.images
  for select to authenticated using (true);

drop policy if exists image_folders_select on public.image_folders;
create policy image_folders_select on public.image_folders
  for select to authenticated using (true);

drop policy if exists diagram_images_lib_select on storage.objects;
create policy diagram_images_lib_select on storage.objects
  for select to authenticated using (
    bucket_id = 'diagram-images'
    and (storage.foldername(name))[2] = 'imglib'
  );
```

Notas:
- `to authenticated` es obligatorio; sin él la política también aplica a `anon`.
- No tocar `public` del bucket (`storage.buckets.public = false`): un bucket público
  serviría los objetos por URL sin token.
- Insert/update/delete siguen exigiendo dueño o `can_edit_project` → un viewer
  puede ver pero no subir ni borrar. La galería debería además ocultarle los botones
  de subir/renombrar/borrar (hoy los muestra y fallarán con error de RLS: ver 3.3).

Aplicar con `mcp__supabase__apply_migration` o `supabase db push`.

### 3.2 `src/components/images/ImageGallery.tsx` — quitar el filtro duro de ámbito

Reemplazar el filtro de la línea 60 por orden en vez de exclusión: primero las del
proyecto activo, luego el resto. Mismo trato para `scopeFolders` (línea 54) — o
dejar las carpetas por ámbito y añadir una pseudo-carpeta "Todas".

```ts
const scopeImages = useMemo(() => {
  const inScope = (i: LibraryImage) => (projectId ? i.projectId === projectId : !i.projectId)
  return images
    .filter((i) => (activeFolder ? i.folderId === activeFolder : true))
    .filter((i) => !search || i.name.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => Number(inScope(b)) - Number(inScope(a)))
}, [images, projectId, activeFolder, search])
```

La subida sigue usando `projectId` del diagrama activo (línea 73): correcto, el
ámbito de creación no cambia.

### 3.3 `ImageGallery` en modo viewer (opcional, mismo PR)

Pasar `canEdit` desde `App.tsx` (ya existe `canEditActive`) y con `canEdit === false`
ocultar: botón Subir, `ig-card-actions` (renombrar/mover/borrar), Nueva carpeta y
Migrar. Evita errores de RLS visibles al usuario de solo lectura.

### 3.4 `src/store/imageStore.ts` — resolver por id aunque no esté en el catálogo

Blindaje contra el spinner infinito: si `images.find` falla, buscar la fila suelta
antes de rendirse.

```ts
resolve: async (id) => {
  const cached = get().resolved[id]
  if (cached) return cached
  let image = get().images.find((x) => x.id === id)
  if (!image) {
    image = await imageRepository.getById?.(id) ?? undefined   // método nuevo
    if (image) set((s) => { s.images.push(image!) })
  }
  if (!image) return null
  const data = await imageRepository.getImageData(image)
  if (data) set((s) => { s.resolved[id] = data })
  return data
},
```

Requiere añadir `getById(id): Promise<LibraryImage | null>` a
`src/persistence/IImageRepository.ts` + `SupabaseImageRepository`
(`.from('images').select('*').eq('id', id).maybeSingle()`) + `LocalImageRepository`.

### 3.5 `src/components/images/ImageLightbox.tsx` — estado de error real

Líneas 59-65: hoy `loading || !src` muestra siempre el mismo icono. Separar
"cargando" de "no disponible" y mostrar un texto (`images.unavailable`) cuando
`resolve` devuelva `null`, con las claves en `src/i18n/es.json` y `en.json`.

---

## 4. Verificación

1. Usuario A (dueño): subir imagen con un diagrama **sin proyecto** abierto,
   vincularla a una tarea, guardar.
2. Compartir ese diagrama con B como **viewer**.
3. B abre el diagrama → badge 📷 → lightbox muestra la imagen.
4. B abre la galería → ve la imagen; no ve botones de subir/borrar.
5. B intenta borrar por consola → RLS lo rechaza (`images_delete` intacto).
6. Repetir con un diagrama de un proyecto donde B NO es colaborador de proyecto.
7. SQL de control: como B, `select count(*) from images;` > 0 y
   `storage.download('<uidA>/imglib/<uuid>.webp')` devuelve bytes.
