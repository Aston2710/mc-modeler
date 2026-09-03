---
id: PLAN-036
titulo: Borrador local del trabajo no guardado — que un cierre o un cuelgue no cuesten horas
estado: todo
creado: 2026-09-03
cerrado:
aprobado_por:
relacionados: [PLAN-035, EXP-022, EXP-011, PLAN-014, DEC-001, DEC-002]
---

# Borrador local del trabajo no guardado

Es la **capa D** de [PLAN-035](035-copiar-pegar-y-guardado-resiliente.md), separada
en su propio plan porque toca el flujo de abrir un diagrama —territorio del CAS y
de [EXP-011](../../experience/011-perdida-silenciosa-de-cambios-entre-colaboradores.md)—
y porque tiene decisiones de producto que no se deducen del código.

## El hueco

`persistence/index.ts:16-18` elige **un solo** repositorio, en exclusiva. Con
Supabase configurado —producción— el repositorio de IndexedDB **no se instancia
nunca**. `diagramStore.cacheXml` solo escribe en Zustand, que es RAM.

Entre que alguien dibuja algo y que Postgres lo confirma, el trabajo **no existe
en ningún sitio salvo la memoria del navegador**. La ventana es de 20 s + jitter
0–5 s (`useAutoSave.ts:12,51-53`), y se ensancha sin límite si el guardado falla:
en [EXP-022](../../experience/022-una-pieza-mal-formada-cancela-el-guardado-entero.md)
fueron **tres horas**.

Y ese hueco no lo abre ningún bug. Lo abre igual quedarse sin red, cerrar el
portátil, un choque de CAS o que el navegador se caiga.

**Postgres sigue siendo la fuente de la verdad (DEC-001).** El borrador no
compite con eso: es una **sala de espera**, no una segunda verdad.

## Lo que ya está decidido

Decidido por el usuario en la sesión del 2026-09-03:

**D1 · Sin preguntar nada.** Si el navegador tiene una versión más reciente que
la nube y nadie más escribió, se sube en silencio. No hay diálogo, no hay
decisión que tomar. Menos UI y menos formas de equivocarse.

**D2 · El borrador se descarta al sincronizar.** Una vez la nube confirma, la
copia local ya no sirve y se borra. No acumula.

**D3 · Vive en disco, no en RAM.** Es el punto entero del plan.

## Lo que se corrigió durante el diseño

**"El más reciente gana" no se puede aplicar entre personas.** Era la propuesta
inicial y se descartó con motivo: `current_xml` es el documento entero, así que
"el más reciente" no fusiona, **descarta** — si Ana toca arriba y Beto abajo, el
último borra el trabajo del otro completo. Es el mecanismo de EXP-011.

**El criterio correcto no es el tiempo, es el ancestro.** El borrador guarda el
`updated_at` **sobre el que se hizo**. Al recuperar:

| Situación | Qué se hace |
|---|---|
| el ancestro del borrador == `updated_at` de la nube | nadie más escribió → subir en silencio (D1) |
| la nube tiene el mismo contenido que el borrador | ya está sincronizado → borrar el borrador, callar |
| la nube avanzó desde ese ancestro | el borrador es una **bifurcación**, no una versión nueva |

**El tercer caso ya tiene UI.** El CAS de `diagramStore.saveDiagram:390-392`
emite `flujo:save-conflict`, y `App.tsx:304-310` ofrece recargar la versión del
servidor o guardar la copia local como duplicado. Los textos existen en
`es.json` (`conflict.title`, `conflict.saveCopy`, `conflict.copyName`).
**Cero UI nueva: se reutiliza.**

**"El borrador se guarda en el computador de todos" no es posible.** IndexedDB es
por navegador y por equipo; no hay canal para propagarlo. Eso es Yjs, que es
transporte de sesión y no persistencia (DEC-002).

## El hallazgo que cambia el diseño

`diagramStore.saveDiagram:372-373` — ante un conflicto de CAS, el código
**reintenta con la versión fresca**, lo que sobrescribe el contenido del otro
escritor. El comentario lo llama *"último-gana seguro, sin torn-write"*: es
seguro en cuanto a integridad del XML, pero **no** en cuanto a conservar el
trabajo ajeno. Solo si ese segundo intento vuelve a chocar se avisa.

Para un guardado normal es una decisión existente y no la toca este plan.

**Para recuperar un borrador es inaceptable.** Un borrador recuperado es, por
definición, viejo: se escribió antes de un cierre o un cuelgue, y la nube pudo
avanzar mucho desde entonces. Si la recuperación pasara por ese reintento,
**machacaría el trabajo de un colaborador con contenido de hace horas**.

Regla dura: **la recuperación de un borrador nunca usa el reintento
último-gana.** Un choque va directo a la UI de conflicto.

Consecuencia técnica concreta: `saveDiagram` toma hoy la versión esperada de
`diagram.updatedAt` del store. Tras recargar la página, ese valor viene de la
nube (fresco), así que el CAS pasaría y machacaría. **La recuperación necesita
pasar la versión esperada explícitamente** — el `baseUpdatedAt` del borrador. Es
un parámetro nuevo, opcional, en el camino de guardado.

## Cuándo se escribe — tres carriles

Se descartó "escribir solo al cerrar la aplicación", que era la idea inicial por
analogía con Word. Motivos, en orden de gravedad:

1. **El cuelgue no dispara ningún evento.** Navegador que se cae, pestaña matada
   por memoria, corte de luz: no hay `beforeunload` ni `pagehide`. Es exactamente
   el caso que se quiere cubrir.
2. **IndexedDB es asíncrono y el unload mata la transacción pendiente.** Un `put`
   lanzado al cerrar muy a menudo no llega a commitear.
3. **Word tampoco lo hace al cerrar.** Sobrevive al cuelgue porque escribe
   periódicamente, todo el tiempo.

Por eso, tres carriles, y el primero es el que aguanta el peso:

| Carril | Cuándo | Papel |
|---|---|---|
| **Periódico** | enganchado al autoguardado que ya existe | **el que de verdad protege.** Es el equivalente al autorecovery de Word |
| **Volcado a oculto** | `visibilitychange` → `hidden` | cierre limpio y cambio de pestaña. Best-effort, no se confía en él |
| **Aviso al cerrar** | `beforeunload` | **solo avisa**, no escribe |

Hoy **no existe ningún `beforeunload` en todo `src/`**: se puede cerrar la
pestaña con cambios sin guardar y la app no dice nada. Es la victoria más barata
del plan y es independiente del resto.

Para el último aliento hay un detalle útil: **`localStorage` es sincrónico**, así
que sí completa durante el unload. Cuota ~5 MB y los XML de producción miden
**3,8 a 22,7 kB** (medido sobre los 189 diagramas), así que el diagrama activo
cabe de sobra. Propuesta: IndexedDB como almacén durable, `localStorage` como
carril de emergencia solo del diagrama activo.

## Rendimiento

La preocupación era la latencia. El coste es casi nulo, y por un motivo
concreto: **el XML ya está serializado.** `exportXml` ya corrió para el guardado
normal —`saveXML` es la parte cara y ya pasó— así que el borrador solo añade un
`put` de un string que ya está en la mano. **Cero serialización nueva.**

Frecuencia acotada: el autoguardado corre cada 20 s + jitter y **solo si está
sucio**. Máximo ~1 escritura cada 20-25 s. No es por pulsación.

Cuatro reglas:

- **Nunca bloquear el guardado.** El borrador es efecto secundario, no camino
  crítico: se lanza y se olvida, con su `catch`.
- **Escribir ANTES de intentar la nube**, no después. Contraintuitivo, y es el
  punto: si la pestaña muere *durante* el guardado, el borrador ya existe.
- **Borrar al confirmar.** Un delete por guardado bueno.
- **Nada nuevo en el camino de abrir.** La lectura del borrador va en paralelo
  con el fetch de red, que es órdenes de magnitud más lento.

**Se mide, no se supone** (regla 5 de CLAUDE.md): marca nueva de `perfStart` para
la escritura y para la lectura, y medición en el laboratorio antes de dar el
coste por bueno. Sin números, este apartado es una opinión.

## Decisiones abiertas

No se implementa nada hasta resolverlas.

**A · Retención.** ¿Cuánto vive un borrador que nunca se recupera? Si alguien
deja de abrir ese diagrama, la copia se queda para siempre. Propuesta: caducidad
por tiempo (¿30 días?) y barrido al arrancar. Sin esto IndexedDB crece sin techo.

**B · Dos pestañas del mismo diagrama.** Ambas escribirían la misma clave. Con
el cache de instancias de PLAN-005 es un escenario real. ¿La última gana, o se
escribe por pestaña?

**C · Modo local (sin Supabase).** Ahí el repositorio **ya es** IndexedDB y el
borrador sería una copia redundante. Propuesta: el borrador solo existe en modo
nube.

**D · Cuota agotada.** ¿Qué se hace si IndexedDB rechaza la escritura? Hay
precedente de mensaje: `errors.storageFull`.

**E · Solo lectura.** Un viewer **nunca** debe escribir borradores. El
autoguardado ya tiene ese guard (`useAutoSave.ts:24-27`); hay que replicarlo, no
heredarlo por accidente.

## Criterios de aceptación

1. Con cambios sin guardar, cerrar la pestaña avisa.
2. Matar el proceso del navegador y reabrir el diagrama recupera el trabajo
   **sin preguntar nada**, si nadie más escribió.
3. Si la nube avanzó desde el ancestro del borrador, sale la UI de conflicto
   existente y **nunca** se sobrescribe en silencio.
4. Tras un guardado bueno, el borrador ya no está.
5. Un viewer no deja ningún borrador.
6. La escritura del borrador no aparece en el camino crítico del guardado —
   medido, no argumentado.
7. Modo local (sin `VITE_SUPABASE_*`) sigue funcionando igual. **Ese modo no se
   rompe.**

## Riesgos

**Que el borrador machaque trabajo ajeno.** Es el riesgo grave, y es lo que hace
que la comprobación de ancestro no sea opcional. Un borrador de hace horas
subido sin comprobar es EXP-011 con más pasos.

**Que la recuperación silenciosa desconcierte.** D1 dice no preguntar, y es
razonable cuando es tu propio trabajo en tu propio navegador. Pero si alguien ve
aparecer contenido que no esperaba, no tiene forma de saber de dónde salió.
Mitigación mínima: dejarlo en el registro de incidentes, aunque no se enseñe.

**Confundir la sala de espera con un respaldo.** Es **por navegador y por
equipo**. Abrir desde otro ordenador no lo encuentra; limpiar los datos del
navegador se lo lleva. Hay que decirlo donde se documente, porque en cuanto algo
"guarda solo" la gente asume que hay copia de seguridad.

## Sin cambios de base de datos

Todo es cliente. No hay migración, así que no aplica la regla 3 — pero sí la
verificación manual en el laboratorio, que es la única forma de probar el cuelgue
del navegador de verdad.
