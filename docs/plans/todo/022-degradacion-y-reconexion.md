---
id: PLAN-022
titulo: Degradacion y reconexion cuando el servidor no esta disponible
estado: todo
creado: 2026-08-11
cerrado:
aprobado_por:
relacionados: [MASTER-PLAN-019, PLAN-021, EXP-011]
---

# Fase 2 · Degradación y reconexión

> **Va deliberadamente pronto**, antes de que nadie dependa del servidor. Es el error clásico de estas migraciones: construir el camino feliz, cortar, y descubrir el comportamiento ante caída ya en producción.

## Objetivo

Que la caída del servidor **nunca bloquee al usuario**. Que pueda seguir editando en local, con aviso honesto, y que al reconectar su trabajo converja sin pérdida ni intervención.

## El riesgo que ataca

Hoy la aplicación es 100 % cliente y **sobrevive a que todo esté caído** mientras Supabase responda. El servidor introduce un punto único de fallo que hoy no existe.

Mal hecho, se cambia un fallo intermitente ("a veces no se propagan los cambios") por uno total ("nadie puede editar"). Eso violaría la restricción del master plan: *igual o mejor*.

## Alcance

**Entra:** comportamiento ante caída, reconexión, cola local de operaciones pendientes, y la señal de estado al usuario.

**No entra:** trabajo offline prolongado — sigue descartado por DEC-002. Esto cubre desconexiones de segundos o minutos, no de días.

## Precondiciones

PLAN-021 cerrado: hay servicio al que desconectarse.

## Pasos

### 1 · Definir los estados de conexión

Cuatro, y el usuario debe poder distinguirlos:

| Estado | Qué significa | Qué puede hacer |
|---|---|---|
| `conectado` | sincronizando con el servidor | todo |
| `reconectando` | caída transitoria, hay cola local | editar; se sincroniza al volver |
| `local` | sin servidor, edición local | editar; **sin colaboración en vivo** |
| `solo-lectura` | sin permiso de edición | ver |

`local` **no es un error**: es un modo degradado legítimo. La señal debe leerse como estado, no como fallo — el precedente es "Trabajando sin conexión" de Google Docs, no un diálogo de error.

Esto respeta la decisión de no mostrar errores en producción: no es un error, es información de estado.

### 2 · Cola local de operaciones

Al perder conexión, las operaciones locales se acumulan en el `Y.Doc` del cliente (ya ocurre: es un CRDT). Al reconectar, Yjs sincroniza por diferencia de vectores de estado y **converge sin intervención**.

Aquí es donde el CRDT paga: aplicar operaciones tarde converge igual, porque son conmutativas.

Acotar la cola: si crece más allá de un umbral sin poder enviar, avisar de que la sesión lleva mucho desconectada.

### 3 · Reconexión con retroceso exponencial

Con tope y con jitter, para que N clientes no golpeen a la vez al reiniciarse el servicio.

### 4 · Reinicio del servidor sin pérdida

Si el proceso se reinicia, el `Y.Doc` en memoria se pierde. Al reconectar, el primer cliente siembra el estado desde su propia copia y el servidor lo rehidrata.

Caso límite a resolver explícitamente: si **ningún** cliente está conectado al reiniciarse, el documento se reconstruye desde `current_xml` de la base — que sigue siendo la fuente de verdad duradera (DEC-001).

### 5 · Verificación por inyección de fallo

Probar contra el servicio caído de verdad, no simulado: matar el proceso mientras dos clientes editan y comprobar convergencia al volver.

## Criterios de aceptación

- Con el servidor caído, el usuario **puede seguir editando** y ve el estado `local`
- Al volver el servidor, el trabajo local converge sin intervención ni pérdida
- Matar el proceso con dos clientes editando: ambos convergen al reconectar
- Reiniciar sin clientes conectados: el documento se rehidrata desde `current_xml`
- El estado se presenta como información, nunca como diálogo de error
- El modo local sin Supabase (sin servidor ni auth) sigue intacto

## Riesgos

**Que la señal de estado se lea como un fallo del producto.** Aparecer "sin conexión" en una demostración es peor que no mostrarlo, si está mal redactado. Mitigación: texto de estado, no de error; y solo visible cuando el estado no es `conectado`.

**Convergencia incorrecta tras reconexión larga.** Mitigación: es el escenario del paso 5, con fallo inyectado real.

**Que el rehidratado desde `current_xml` pise trabajo en vuelo.** Si un cliente reconecta con cambios locales justo cuando el servidor rehidrata desde la base, hay dos orígenes. Mitigación: el servidor rehidrata **solo si no hay ningún cliente**; con clientes presentes, la fuente es la copia del cliente.

## Registro de ejecución

(se rellena durante la ejecución)

## Resultado

(se rellena al cerrar)
