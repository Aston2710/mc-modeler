---
titulo: Entorno local de base de datos (Supabase en Docker)
tipo: context
creado: 2026-08-13
actualizado: 2026-08-13
relacionados: [operacion-scripts.md, base-de-datos.md, arquitectura-persistencia.md]
---

# Entorno local de base de datos

> Existe para que **ningun cambio de esquema se pruebe por primera vez en produccion**. La base Supabase del proyecto es produccion viva: no hay staging, y una migracion aplicada no se deshace. El stack local es donde se puede equivocar uno gratis.

## Que se levanta

`supabase start` arranca en Docker un stack completo en localhost — no un simulacro, los mismos servicios que en la nube:

| Servicio | Puerto | Para que |
|---|---|---|
| Postgres 17 | 54322 | la base, con todas las migraciones aplicadas |
| API (PostgREST + Auth + Storage) | 54321 | lo que consume la app |
| Studio | 54323 | ver y editar tablas en el navegador |
| Mailpit | 54324 | captura los correos; de ahi se recogen los enlaces magicos |
| Realtime | via 54321 | incluido: presencia, cursores y comentarios funcionan |

`config.toml` fija `major_version = 17` para igualar produccion (verificado: PG 17.6).

## El esquema: una foto, no una pelicula

`supabase/migrations/20260813000000_baseline_produccion.sql` describe el esquema **tal como esta en produccion**, obtenido por introspeccion de solo lectura. Es lo que construye el local. Las 29 migraciones historicas viven en `supabase/migrations_legacy/`: explican *por que* la base es como es, pero ya no se ejecutan (ver [EXP-016](../experience/016-el-historial-de-migraciones-no-reproduce-la-base.md)).

Verificado el 2026-08-13: huella md5 de 13 categorias del catalogo — tablas, columnas, restricciones, indices, funciones, triggers, politicas, RLS, permisos de tabla y de columna, realtime, replica identity y buckets — **identica en local y en produccion**. Los hashes cubren el texto completo de cada definicion, no solo los nombres.

El ciclo de trabajo es:

```
1. escribir la migracion nueva en supabase/migrations/
2. npm run db:reset      ← borra el local y reproduce TODO el historial + seed
3. revisar en Studio, correr la app contra localhost, romper lo que haga falta
4. solo cuando funciona: pedir aprobacion para aplicarla a produccion
```

`db reset` es destructivo **solo en local**. Ese es el punto.

## Comandos

| Comando | Que hace |
|---|---|
| `npm run db:start` | levanta el stack (la primera vez descarga ~3 GB de imagenes) |
| `npm run db:stop` | lo apaga; los datos sobreviven al siguiente arranque |
| `npm run db:status` | puertos y claves del stack local |
| `npm run db:reset` | **borra** el local, reproduce migraciones y aplica `seed.sql` |
| `npm run db:diff` | diferencia entre el esquema local y las migraciones |

## Apuntar la app al local

Por variables de shell, **sin tocar `.env.local`** — asi cerrar la terminal devuelve la app a produccion y no queda nada que revertir:

```powershell
$env:VITE_SUPABASE_URL = "http://127.0.0.1:54321"
$env:VITE_SUPABASE_ANON_KEY = "<la que imprime npm run db:status>"
npm run dev
```

## Usuarios de prueba

`supabase/seed.sql` siembra dos usuarios y contenido de ejemplo (un proyecto, una carpeta, cuatro diagramas — uno de ellos en la papelera — un diagrama compartido como editor y otro como viewer, y un hilo de comentarios).

Para entrar: pedir enlace magico para **`dev@local.test`** y recogerlo en **Mailpit** (http://127.0.0.1:54324). GoTrue reconoce el correo ya sembrado y firma como ese usuario, asi que el contenido de ejemplo aparece nada mas entrar. El segundo usuario, **`dev2@local.test`**, sirve para probar compartir, roles, presencia y comentarios con dos navegadores.

## El modo lab tambien es un renderizador headless

Con `MODE=lab` la app carga dos modulos que **no existen en produccion** (`main.tsx` los mete detras de `import.meta.env.MODE === 'lab'`, que Vite sustituye por una constante, asi que rollup descarta el modulo entero — comprobado con `npm run build`):

| Modulo | Que hace |
|---|---|
| `src/lab/LabBar.tsx` | inicia sesion sola y permite saltar entre los dos usuarios sembrados |
| `src/lab/thumbForge.ts` | expone `window.__thumbForge` para renderizar un XML a thumbnail WebP, con `overrides` opcionales para comparar ajustes |
| `src/lab/ThumbLab.tsx` | boton **THUMBS** abajo a la derecha: compara las seis variantes de definicion del diagrama que elijas, **a tamaño de tarjeta**, sin salir de la app |

El forge existe porque los scripts de administracion necesitan **renderizar** BPMN, y renderizar BPMN necesita un DOM. Se penso usar el UMD de `bpmn-navigated-viewer` en una pagina en blanco y es una via equivocada: el SVG de esta app lo produce un Modeler con los 26 modulos de `MODELER_CONFIG` mas la extension de moddle `flujo`, y `getThemedSvg` lee los tokens del CSSOM vivo. Un viewer pelado devuelve diagramas sin colores de fase ni de grupo.

Lo usa `scripts/backfill-thumbs.mjs` ([PLAN-012](../plans/todo/012-thumbnails-webp-y-entrega-segura.md)):

```
npm i -D playwright-core          # una vez. NO descarga ningun navegador:
                                  # usa el Chrome o Edge ya instalado
npm run lab                       # otra terminal, deja Vite en :7654
node scripts/backfill-thumbs.mjs --muestras=8   # en seco, contra el laboratorio
node scripts/backfill-thumbs.mjs --comparar=3   # 6 variantes de ajustes, para elegir
```

`--comparar` genera el mismo diagrama con varias combinaciones de densidad, calidad y supermuestreo y las guarda juntas en `muestras-thumbs/`. **Nunca escribe en el bucket**, ni con `--apply`. Elige entre **todos** los diagramas, no solo los pendientes —los que ya son WebP son justo los que interesa comparar—, ordenados por tamaño de XML descendente.

Para decidir los ajustes normalmente es mas comodo el boton **THUMBS** de la propia app (`src/lab/ThumbLab.tsx`): pone las seis variantes una al lado de otra al tamaño real de la tarjeta, que es donde hay que juzgarlas. El script sirve cuando quieres los ficheros en disco o comparar contra produccion (`--db=prod --comparar=3`, que lee produccion y no escribe nada).

Sin `overrides`, el forge llama al camino real de `buildThumbnail`: el pase de verdad produce exactamente lo mismo que produce la app al guardar.

La service_role del laboratorio **no hay que pasarla**: el script se la pregunta a `supabase status -o env`. Es deliberado — evita pegar mal la clave y, peor, pegar la de produccion creyendo que apuntas al laboratorio.

**El renderizador y la base de datos son independientes.** El script trae el XML de la base que le digas (`--db=lab` por defecto, `--db=prod` explicito) y usa el navegador solo para convertir. Es decir: se puede reconvertir produccion renderizando con la app del laboratorio, que es justamente como debe hacerse — el pase completo se prueba aqui antes de tocar nada real.

## Lo que NO hay que hacer

`supabase link` y `supabase db push` son los comandos que **si** tocan produccion. El flujo local no los necesita nunca. Si algun dia hace falta enlazar, es un paso consciente y con aprobacion explicita — ver la regla en la auditoria de base de datos.

## Deuda descubierta al montarlo

[EXP-016](../experience/016-el-historial-de-migraciones-no-reproduce-la-base.md): produccion tiene 35 migraciones registradas y el repositorio solo 29 archivos. Los seis que faltan se aplicaron con la herramienta MCP, que ejecuta y registra pero no escribe el `.sql`. Entre ellos, el que creaba las tablas de comentarios — por eso `0008` fallaba en un Postgres virgen.

Es exactamente el tipo de problema que solo aparece cuando alguien intenta reconstruir desde cero, y la razon por la que este entorno vale la pena aunque nadie mas lo use.

**La regla que lo evita:** toda migracion nueva se escribe primero como archivo, se prueba con `npm run db:reset`, y solo entonces se aprueba para produccion. Si `db reset` funciona, el repositorio reproduce la base.
