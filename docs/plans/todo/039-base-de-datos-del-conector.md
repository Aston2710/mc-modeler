---
id: PLAN-039
titulo: Base de datos del conector MCP — guardia por client_id, auditoría y límites
estado: en-progreso
creado: 2026-10-08
cerrado:
aprobado_por:
relacionados: [MASTER-PLAN-038, DEC-013, DEC-007, DEC-012, EXP-015, EXP-016, SEG-11]
---

# Base de datos del conector MCP

Fase 0 de [MASTER-PLAN-038](038-master-plan-conector-mcp.md). Cambio de BD: **requiere aprobación explícita para producción.**

## Qué hace

`supabase/migrations/20261008120000_mcp_conector.sql`. El prototipo idéntico está en `supabase/prototipos/`.

Un token emitido por el servidor OAuth de Supabase lleva la claim `client_id`; las sesiones de la app no la llevan. Con ese token:

- **`diagrams`:** INSERT y UPDATE solo de nombre y contenido. No se puede borrar, mandar a la papelera, mover de proyecto ni de carpeta, ni tocar la jerarquía o la miniatura. Tampoco crear en un proyecto sin permiso de edición (cierra SEG-11 para el conector). Límites: 1 MB de XML, 500 elementos y 20 escrituras por minuto.
- **Resto de tablas:** solo lectura, con un trigger en las 13 tablas. Única excepción: el alta automática del dueño al crear un diagrama.
- **Storage:** sin subidas, cambios ni borrados (políticas restrictivas).
- **Auditoría:** `private.mcp_auditoria`, escrita por trigger; solo escalares (DEC-007); invisible para `authenticated`.
- **Límite de llamadas:** RPC `public.mcp_registrar_llamada`, con ventanas por minuto en `private.mcp_ventanas`, podadas en línea porque no hay `pg_cron`.

Los triggers se disparan también dentro de las funciones `SECURITY DEFINER` (`redeem_invite`…), que las políticas no cubren.

## Estado de ejecución — 2026-10-08

- ✅ Aplicada en el laboratorio con `npm run db:reset`.
- ✅ **32/32** casos de `supabase/pruebas/mcp_conector.sql`: la sesión de la app no cambia nada, el conector solo crea y modifica, y todo lo demás da 403. También cubre los límites (413/429), la RLS bajo el conector y que lo privado sea ilegible.
- ✅ Encontrado y corregido un defecto propio: plpgsql no cortocircuita el `AND`, y leer `new.role` en otras tablas daba 42703 en vez de 403.
- ✅ SEG-11 confirmado en el laboratorio para sesiones normales (caso 4a).
- ✅ Servidor OAuth activado en el laboratorio (`config.toml`).
- ☐ **Aplicar en producción** (aprobación).
- ☐ **Activar el servidor OAuth en producción** (panel; aprobación). Producción ya firma con ES256.

## Criterios de cierre

Migración aplicada en producción con la huella del esquema comprobada (DEC-012), y los casos 1–8 repetidos contra producción **solo en las partes de lectura de catálogo** (`has_table_privilege`, triggers presentes). Ninguna escritura de prueba en producción.
