---
id: PLAN-024
titulo: El servidor pasa a ser el unico escritor de current_xml
estado: todo
creado: 2026-08-11
cerrado:
aprobado_por:
relacionados: [MASTER-PLAN-019, PLAN-022, PLAN-023, EXP-011, EXP-014, DEC-001]
---

# Fase 4 · Persistencia autoritativa

> Aquí muere la carrera de CAS. No se mitiga: deja de existir, porque deja de haber dos escritores.

## Objetivo

Que el servidor sea el **único** que escribe `current_xml`, con validación y con debounce. El cliente deja de guardar y deja de resolver conflictos.

## Qué elimina

| | Antes | Después |
|---|---|---|
| Escritores de la fila | N clientes | uno |
| Conflicto de CAS | posible, con toast | **imposible** |
| Reintento y comparación de contenido en `diagramStore` | necesarios | se retiran |
| `SELECT id` previo al guardado | 9 313 consultas en la ventana medida | desaparece |
| Escrituras a `diagrams` | una por autoguardado por cliente | una por documento con debounce |

La última fila importa por lo medido en la auditoría: `diagrams` acumulaba 15 905 UPDATEs contra 277 INSERTs, y cada uno reescribe el TOAST completo del XML. Un solo escritor con debounce reduce eso de forma directa.

## Alcance

**Entra:** persistencia desde el servidor, retirada de la escritura del cliente, y la coherencia con el modo local.

**No entra:** cambiar el formato — sigue siendo XML canónico en `diagrams.current_xml` (DEC-001 intacta). No se reintroduce `yjs_documents` (DEC-002).

## Precondiciones

PLAN-022 y PLAN-023 cerrados. La persistencia va **después** de la validación para no persistir estados que el servidor todavía no sabe rechazar.

## Pasos

### 1 · El servidor serializa y escribe

En el `onStoreDocument` de Hocuspocus: del `Y.Doc` al XML canónico, con `looksLikeBpmn` y la normalización de prefijos que ya existe en el cliente — **reutilizar esa lógica**, no reescribirla.

Debounce: no escribir en cada operación. Un intervalo del orden de segundos, más una escritura al quedarse el documento sin clientes.

### 2 · El servidor usa `service_role`, con cuidado

Escribe saltándose RLS, porque ya autorizó en la conexión (PLAN-021 paso 3).

**Esto concentra riesgo:** una clave con acceso total vive ahora en un segundo sitio. Debe estar solo en el entorno del servicio, nunca en un repositorio ni en el bundle, y el servicio no debe exponer ningún endpoint que permita escribir un diagrama arbitrario.

### 3 · El cliente deja de guardar

Con el flag en `on`, `useAutoSave` y `diagramStore.saveDiagram` dejan de escribir en `diagrams`. Se retira la cadena de CAS: reintento, comparación de contenido, y el evento `flujo:save-conflict`.

**El toast de conflicto deja de poder aparecer.** No se borra su código todavía — eso es la fase 5, tras el corte definitivo.

### 4 · Mantener coherente el modo local

Sin Supabase configurado no hay servidor ni auth: `LocalRepository` sigue guardando en IndexedDB igual que hoy. El flag no debe alterar ese camino.

### 5 · Verificar que no se pierde el último cambio

El escenario a probar: un usuario edita y cierra la pestaña inmediatamente. Con debounce, ese cambio puede estar sin escribir. El servidor debe persistir al detectar la desconexión del último cliente.

## Criterios de aceptación

- `current_xml` solo lo escribe el servidor cuando el flag está en `on`
- Dos clientes editando el mismo diagrama nunca producen un conflicto de CAS
- Editar y cerrar la pestaña de inmediato no pierde el cambio
- Matar el servidor con cambios sin persistir: al volver, convergen y se persisten (junto con PLAN-022)
- El modo local sin Supabase sigue funcionando igual
- Las escrituras a `diagrams` bajan de forma medible frente a la línea base

## Riesgos

**Perder el último cambio por el debounce.** Es el riesgo más probable de esta fase. Mitigación: paso 5, más persistencia forzada al desconectarse el último cliente.

**La clave `service_role` en un segundo sistema.** Mitigación: solo en el entorno del servicio; ningún endpoint que acepte un diagrama arbitrario; rotación documentada.

**Que el servidor escriba un XML peor que el del cliente.** La serialización canónica vive hoy en el cliente y está afinada por incidentes pasados. Mitigación: paso 1, reutilizar esa lógica; y comparar la salida del servidor con la del cliente sobre los mismos diagramas antes de cortar.

**Escritura silenciosamente fallida.** Si el servidor no puede escribir en Supabase, los clientes siguen colaborando felices sobre algo que no se está guardando. Mitigación: registrar el fallo de persistencia como incidente y reflejarlo en el estado de conexión.

## Registro de ejecución

(se rellena durante la ejecución)

## Resultado

(se rellena al cerrar)
