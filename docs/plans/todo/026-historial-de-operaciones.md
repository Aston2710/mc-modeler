---
id: PLAN-026
titulo: Historial de operaciones — auditoria y versiones
estado: todo
creado: 2026-08-11
cerrado:
aprobado_por:
relacionados: [MASTER-PLAN-019, PLAN-024, DEC-011]
---

# Fase 6 · Historial de operaciones

> **Opcional y separable.** No es necesario para que la migración tenga éxito; es lo que la migración vuelve barato.

## Objetivo

Aprovechar que el servidor ordena las operaciones para ofrecer *"quién cambió qué y cuándo"* y *"volver a la versión de ayer"* — hoy imposibles, después casi gratis.

## Por qué aparece aquí y no antes

Con N clientes difundiendo sin árbitro **no existe un orden total**: no hay forma de decir qué pasó antes. Un servidor que serializa lo produce como subproducto.

Es la ganancia con valor comercial más claro de todo el master plan: el resto son correcciones que el usuario no ve.

## Alcance

**Entra:** persistir el log de operaciones con autor y momento, y la capacidad de reconstruir el documento en un punto del tiempo.

**No entra:** la interfaz de exploración del historial y la comparación visual entre versiones. Son producto, no infraestructura, y merecen su propio plan si se deciden.

## Precondiciones

PLAN-024 cerrado: hay un servidor que ordena y persiste.

## Pasos

### 1 · Decidir qué se guarda y cuánto

Tres opciones, de menos a más:

| Opción | Qué guarda | Reconstruye |
|---|---|---|
| Instantáneas periódicas | `current_xml` cada N horas | versiones gruesas |
| Log de operaciones | cada op con autor y momento | cualquier punto |
| Ambas | instantáneas + log entre ellas | cualquier punto, rápido |

La tercera es la habitual: reconstruir desde el origen se vuelve lento con el tiempo.

**Decisión de producto pendiente:** ¿cuánto historial se conserva? Sin respuesta, la tabla crece sin límite — es el mismo problema que PLAN-017 encontró en `notification_outbox` y en la papelera.

### 2 · Esquema, con la lección de la auditoría aplicada

Al diseñar la tabla, tres reglas ya aprendidas:

- **Fuera de la publicación de Realtime.** Es append-heavy; publicarla repetiría el error del 73 % de CPU
- **RLS con predicado conjuntista**, no llamada a función por fila (DEC-005)
- **Índice parcial** para el patrón real de consulta, y `ANALYZE` después de la migración

### 3 · Escritura desde el servidor

En el mismo punto que la persistencia (PLAN-024), con la misma clave `service_role` y las mismas cautelas.

Contener el volumen: un arrastre genera decenas de operaciones por segundo. Agrupar por ventana temporal y por autor antes de persistir, igual que hace el coalescer con la difusión.

### 4 · Reconstrucción verificable

Dado un momento, devolver el `current_xml` de entonces. **Verificación honesta:** reconstruir un punto del pasado y comparar con la instantánea real de ese momento. Si no coinciden, el historial miente y es peor que no tenerlo.

## Criterios de aceptación

- Reconstruir un punto del pasado coincide con la instantánea real de ese momento
- La tabla no está en `supabase_realtime`
- Su política RLS no llama a funciones por fila
- Un arrastre sostenido no genera miles de filas
- Existe una política de retención escrita, con plazo decidido

## Riesgos

**Crecimiento sin límite.** El riesgo principal, y ya conocido: la auditoría encontró tres acumulaciones sin política de poda. Mitigación: la retención se decide en el paso 1, antes de escribir código.

**Que el historial mienta.** Un historial que reconstruye mal es peor que ninguno, porque se confía en él — el mismo argumento del tablero del master plan. Mitigación: paso 4.

**Volumen de escritura.** Mitigación: agrupación por ventana en el paso 3.

**Alcance que se desborda hacia producto.** "Ya que tenemos historial, hagamos la interfaz de versiones." Mitigación: está explícitamente fuera de alcance.

## Registro de ejecución

(se rellena durante la ejecución)

## Resultado

(se rellena al cerrar)
