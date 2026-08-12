---
id: PLAN-025
titulo: Corte progresivo y retirada del transporte antiguo
estado: todo
creado: 2026-08-11
cerrado:
aprobado_por:
relacionados: [MASTER-PLAN-019, PLAN-021, PLAN-022, PLAN-023, PLAN-024, EXP-011, PLAN-016]
---

# Fase 5 · Corte progresivo y retirada del transporte antiguo

> **Último punto de retorno.** Hasta aquí todo es reversible apagando un flag. A partir del paso 4 de este plan, volver atrás exige revertir código.

## Objetivo

Pasar todo el tráfico al servidor de forma gradual y verificable, y solo entonces retirar el transporte anterior del código.

## Alcance

**Entra:** el corte por etapas, la verificación en cada una, y la retirada del broadcast, la anti-entropía, el coalescer y la cadena de CAS del cliente.

**No entra:** dejar código muerto "por si acaso". Un camino que no se ejecuta no se mantiene y deja de funcionar en silencio; si hay que volver, se revierte por git.

## Precondiciones

Las cuatro fases anteriores cerradas. En concreto: degradación probada con fallo inyectado real (PLAN-022) y validación sin falsos rechazos (PLAN-023).

## Pasos

### 1 · Corte por diagrama

Flag `flujo:collabServer` en `on` para un puñado de diagramas de prueba, con usuarios reales del equipo. Una semana.

Verificar contra la línea base de PLAN-020: apertura, cambio de pestaña, tiempo hasta colaboración lista, fluidez del arrastre, latencia de propagación.

### 2 · Corte por proyecto

Ampliar a un proyecto entero. Aquí aparecen los patrones que un diagrama suelto no muestra: muchas pestañas abiertas, subprocesos, sesiones largas.

### 3 · Corte global

Flag en `on` por defecto. **El código antiguo sigue presente**: apagar el flag revierte sin desplegar. Mantener así al menos dos semanas de uso normal.

### 4 · Retirada del código — punto sin retorno

Con el corte estable, retirar:

| Qué | Dónde |
|---|---|
| Broadcast de actualizaciones Yjs | `useCollab.ts`, `SupabaseProvider` |
| Anti-entropía y vectores de estado | `syncProtocol.ts` |
| Coalescer de difusión | `syncProtocol.ts` |
| Cadena de reintento de CAS | `diagramStore.saveDiagram` |
| Toast de conflicto y su evento | `App.tsx`, `flujo:save-conflict` |
| El flag `flujo:collabServer` | ya no hay dos caminos |

**Lo que NO se retira:** `YjsBpmnBinding.ts` sigue igual — el servidor hospeda el mismo `Y.Doc` y el binding canvas↔documento no cambia (DEC-011). Tampoco la presencia ni los cursores, que van por su canal.

### 5 · Cerrar los incidentes y actualizar el contexto

- **EXP-011** pasa a `resuelto`, no a `mitigado`: la causa desaparece
- `context/arquitectura-persistencia.md` describe el estado nuevo. El ADR de julio queda superado en su decisión #7
- Registrar en `context/decisiones.md` que DEC-004 (servidor diferido) queda ejecutada

### 6 · Revisar la publicación de Realtime

Con el transporte de colaboración fuera de Supabase Realtime, la publicación tiene menos motivos para existir. Puede acelerar o simplificar [PLAN-016](016-podar-la-publicacion-de-realtime.md), que ataca el 73 % del CPU de la base. **Los comentarios siguen necesitándola** — solo cambia el transporte del diagrama.

## Criterios de aceptación

- Corte global estable dos semanas sin incidentes de colaboración
- Ninguna métrica de experiencia peor que la línea base de PLAN-020
- El código del transporte antiguo retirado, no solo desactivado
- EXP-011 en `resuelto`
- `context/` refleja la arquitectura nueva
- Los cinco incidentes de integridad referencial (EXP-003, 005, 007, 008) siguen sin reaparecer

## Riesgos

**Cortar antes de tiempo por impaciencia.** Los pasos 1 a 3 parecen lentos cuando todo va bien. Mitigación: los plazos son parte de los criterios, no sugerencias.

**Retirar el código antiguo demasiado pronto.** Mitigación: el paso 4 va después de dos semanas de corte global estable, no antes.

**Descubrir en el paso 2 algo que el paso 1 no mostró.** Es el propósito del paso 2, no un fallo del plan. Si aparece, se vuelve a la fase correspondiente — el flag lo permite sin desplegar.

**Que quede código muerto.** Mantener el camino antiguo "por si acaso" garantiza que se pudra. Mitigación: se retira entero o no se retira.

## Registro de ejecución

(se rellena durante la ejecución)

## Resultado

(se rellena al cerrar)
