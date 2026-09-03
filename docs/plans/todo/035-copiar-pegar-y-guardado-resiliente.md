---
id: PLAN-035
titulo: El guardado no pierde trabajo — saneo del árbol, copiar/pegar robusto y borrador local
estado: en-progreso
creado: 2026-09-02
cerrado:
aprobado_por:
relacionados: [EXP-022, EXP-011, EXP-018, PLAN-013, PLAN-014, DEC-001]
---

# El guardado no pierde trabajo

Nace de [EXP-022](../../experience/022-una-pieza-mal-formada-cancela-el-guardado-entero.md):
una sola pieza mal formada en el árbol del modelo canceló el guardado completo de
un diagrama durante tres horas, con todo el trabajo vivo únicamente en la memoria
de una pestaña.

Cuatro capas, ordenadas por valor. **A y C están implementadas**; B y D no.

| Capa | Qué hace | Estado |
|:-:|---|---|
| **A** | El guardado repara la pieza mal formada y sigue, en vez de detenerse | **implementada** |
| **B** | Detectar la pieza al pegarla, no tres horas después al guardar | no implementada |
| **C** | El copiar/pegar deja de producir piezas mal formadas | **implementada y probada, desplegada DORMIDA** |
| **D** | Borrador local: si no se puede llevar a Postgres, no se pierde | no implementada — **plan propio** |

Se eligió A + C en la primera tanda por un motivo concreto: **el disparador del
incidente no está reproducido** (ver EXP-022), así que un arreglo que dependiera
de conocerlo no serviría. A es genérica y protege de lo que no sabemos; C cierra
la única vía que sí conocemos.

## Capa A — el guardado repara y sigue · implementada

`src/bpmn/model/sanitizeModelTree.ts`, conectada en `useBpmnModeler.exportXml`.

Si `saveXML` lanza, se recorre el árbol por las propiedades **contenidas** (las
referencias se escriben por id y no se recorren) y por cada nodo sin descriptor:

1. si su `$type` lo conoce el moddle → se **reconstruye** con `moddle.create`,
   trasladando los valores simples que la pieza aún lleva;
2. si no → se **quita**, porque lo que no se puede fabricar no se puede escribir;
3. en los dos casos se **cuenta y se devuelve el parte**.

Con el árbol saneado se reintenta **una sola vez**. Un solo reintento a
propósito: si tras sanear sigue fallando, la causa es otra y no la arregla
insistir.

Decisiones que no se deben deshacer:

- **No se unifica con la guarda de coordenadas no finitas**, que sigue
  negándose a guardar. Son opuestas y las dos correctas — el razonamiento está
  en EXP-022 § Prevención y en el encabezado del propio archivo.
- **Nunca en silencio.** `save.model_repaired` se registra con severidad `error`
  aunque el guardado salga bien, más un aviso persistente (`duration: 0`) a quien
  está trabajando. Si se repara todos los días, hay que enterarse.
- **El parte no lleva contenido del dominio**: solo tipos e ids, que es la regla
  de `utils/incidents.ts`. Hay una prueba que lo afirma.
- Se añadió `activeDiagramIdRef` en el hook para que el incidente diga **de qué
  diagrama** es. Sin eso el registro no sirve para investigar.

Límite honesto, escrito también en el código: la reconstrucción conserva lo que
el objeto plano todavía llevaba. **Rescata el diagrama, no resucita el dato.**

## Capa C — el copiar/pegar deja de producirlas · implementada

`src/bpmn/elements/NativeCopyPasteModule.ts` — fork de las ~100 líneas de
`bpmn-js-native-copy-paste`, ya en uso desde `bpmn/config.ts`.

El portapapeles del sistema solo guarda **texto**, así que lo que viaja es una
descripción y al pegar hay que volver a fabricar cada pieza. Los tres agujeros
del traductor original, cerrados:

| Agujero | Antes | Ahora |
|---|---|---|
| tipo desconocido | descartado en silencio | se descarta **avisando** (`unknown-type`) |
| objeto sin descriptor | **pasaba tal cual al modelo** | barrido final lo quita (`unlabeled-dropped`) |
| `$attrs` | se perdía siempre (no es enumerable) | viaja explícito y se restaura |

El invariante que sostiene: **del pegado no sale nunca un objeto sin
descriptor**, por dos vías redundantes a propósito —el traductor fabrica bien, y
después una pasada barre lo que quede—. La segunda no debería encontrar nada;
existe porque el coste de que encuentre algo y no lo barra es un diagrama entero.

La dependencia original **se mantiene instalada**: `nativeCopyPaste.test.ts` la
importa para **afirmar su comportamiento roto**, igual que hace
`moddle/extensionCasing.test.ts`. Si algún día la arreglan, esas pruebas fallan
y obligan a revisar si el fork sobra.

### Se desplegó DORMIDA — decisión del usuario, 2026-09-03

En el despliegue a producción del 2026-09-03, `bpmn/config.ts` **sigue
importando la dependencia original**. El módulo nuevo va en el código, probado,
pero sin cablear.

El motivo es una asimetría de riesgo real: la capa A solo corre cuando `saveXML`
ya falló, así que no puede romper el camino feliz; la capa C corre en **cada
copiar y pegar de todos los usuarios**, y su **cableado** —`navigator.clipboard`,
prioridades de evento, `hints.clip`— **no está cubierto por las pruebas**, porque
jsdom no tiene portapapeles asíncrono y el módulo se autodesactiva ahí. Lo
probado es la lógica de ida y vuelta, no el enganche.

Consecuencia mientras esté dormida: un objeto sin descriptor **todavía puede
colarse al pegar**, y `$attrs` se sigue perdiendo al copiar. Pero ya no cuesta el
diagrama — la capa A lo repara al guardar. Se cambia riesgo de pérdida total por
un defecto conocido y acotado.

**Activarla es una línea** en `config.ts`. El paso está en *Pendiente*.

## Capa B — detectar al pegar · no implementada

La misma reparación de la capa A, llamada al entrar los elementos al diagrama en
vez de al guardar. Barata, porque solo mira lo que acaba de entrar.

Aporta lo que A no puede: si algo se pierde en el arreglo, quien trabaja lo ve
**cuando todavía recuerda qué acababa de pegar**. Con A sola el aviso llega
horas más tarde, cuando ya nadie sabe a qué elemento se refería.

Es un añadido, no un sustituto: A hay que tenerla igual porque protege de
orígenes que no conocemos. Con C implementada, B cubre un caso cada vez más
estrecho — conviene decidir si merece la pena antes de escribirla.

## Capa D — borrador local · movida a [PLAN-036](036-borrador-local-de-trabajo-no-guardado.md)

Se separó el 2026-09-03 con su diseño ya cerrado. Lo que sigue es el resumen; el
detalle, las tres vías de escritura, la comprobación de ancestro y las cinco
decisiones abiertas viven en PLAN-036.

**Postgres sigue siendo la fuente de la verdad (DEC-001).** El borrador no
compite con eso: es una **sala de espera**.

Hoy el hueco es total: con Supabase configurado, `persistence/index.ts:16-18` no
instancia el repositorio de IndexedDB **en absoluto**. Entre dibujar algo y que
Postgres lo confirme, el trabajo no existe fuera de la RAM del navegador.

Forma acordada, en corto:

- copia local **periódica**, enganchada al autoguardado y reusando el XML que ya
  serializó — no al cerrar, porque un cuelgue no dispara ningún evento y el
  `unload` mata las escrituras asíncronas pendientes;
- se descarta cuando la nube confirma — no acumula;
- al reabrir se recupera **en silencio y sin preguntar**, si nadie más escribió;
- si la nube avanzó desde el ancestro del borrador, va a la **UI de conflicto que
  ya existe** — nunca sobrescribe. Ahí está el enganche con
  [EXP-011](../../experience/011-perdida-silenciosa-de-cambios-entre-colaboradores.md)
  y [PLAN-014](../done/014-mitigacion-perdida-de-trabajo-en-colaboracion.md).

Cuesta cero en infraestructura (vive en el navegador), lo que encaja con
mantener Supabase en plan gratuito.

Su límite hay que decirlo de frente: es **por navegador y por equipo**. Abrir
desde otro ordenador no lo encuentra, y limpiar los datos del navegador se lo
lleva. Es una red contra perder trabajo, **no un sistema de respaldo**.

Le quedan **cinco decisiones abiertas**, listadas en PLAN-036.

## Verificación

Sin laboratorio: **no hay cambios de base de datos ni migraciones**. Todo es
cliente.

| Comprobación | Resultado |
|---|---|
| `npm run test` | **414 pruebas en 37 ficheros, todas pasan** (antes 393 en 35) |
| `npm run lint` | limpio, `--max-warnings 0` |
| `npx tsc -b` | sin errores |
| pruebas nuevas | 21 — 12 del saneo, 9 del copiar/pegar |

Las nuevas usan un **bpmn-js real en jsdom**, no dobles: lo que se afirma es el
comportamiento del serializer de moddle-xml y de la factoría, y con dobles no se
probaría nada. Los shims de jsdom que eso necesita se extrajeron de
`connections/routing.integration.test.ts` a `bpmn/testing/jsdomSvgShims.ts` para
no volver a redescubrirlos; **ese test sigue con su copia en línea** y no se
tocó, para no mover una suite que ya pasaba.

## Pendiente

- [ ] **Activar la capa C.** Está desplegada dormida. Dos pasos, en orden:
      1. verificar en un navegador real —copiar y pegar un objeto de datos con
         imagen vinculada y comprobar a ojo que el globo morado sobrevive, y que
         copiar/pegar normal sigue funcionando entre pestañas—;
      2. cambiar la importación de `bpmn/config.ts` al módulo propio. Una línea.
      **No activar sin el paso 1**: es la única parte del módulo que ninguna
      prueba puede afirmar, porque jsdom no tiene `navigator.clipboard`.
- [ ] Decidir si la capa B merece escribirse ahora que C está.
- [x] Redactar el plan de la capa D → [PLAN-036](036-borrador-local-de-trabajo-no-guardado.md), 2026-09-03.
- [ ] Cerrar EXP-022 requiere el registro de PLAN-013: hoy
      `save.model_repaired` solo llega a la consola del navegador, así que no
      hay forma de saber si sigue ocurriendo.
- [ ] Aprobación de cierre del usuario.
