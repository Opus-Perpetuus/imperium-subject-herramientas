# SUBJECT-herramientas

App de Imperium v13 con **herramientas misceláneas** que van creciendo con el
tiempo. No se instala por defecto; otras apps pueden **requerirla**
(`dependsOn: ["subject-herramientas"]`) y **usar sus capacidades** sin abrirla
(ver *Uso desde otras apps*).

| | |
|--|--|
| Catalog id | `SUBJECT-herramientas` |
| Technical id | `subject-herramientas` |
| Image | `ghcr.io/opus-perpetuus/subject-herramientas:<versión>` |
| SQL schema | `subject_herramientas` |
| Repo | `Opus-Perpetuus/imperium-subject-herramientas` |

```bash
bun install
bun test                # conformance + specs de cada herramienta
bun run local           # contra el núcleo v13 en :3100 (yarn dev:modular:stack)
bun run manifest:emit   # regenera manifest.json tras tocar módulos o menús
```

## Herramientas

| Herramienta | Qué hace | Módulos (`resource`) |
|---|---|---|
| **Tablas personalizadas** | Bases de datos a medida: campos tipados, constantes, resúmenes y fórmulas; plantillas; cierre que archiva las filas. | `herr-tablas`, `herr-registros`, `herr-cierres` |
| **Reparto a domicilio** | Jornadas de reparto con vehículo (el registro es la app **Vehículos**, dependencia; aquí solo los ajustes de reparto: tanque, medidor, calibración), pedidos con precio automático desde un catálogo, directorio de domicilios con enlaces a mapas, gastos, caja y liquidación, recargas de combustible con calibración del medidor, rutas GPS con detección de paradas. | `herr-jornadas`, `herr-pedidos`, `herr-gastos`, `herr-caja`, `herr-vehiculos`, `herr-domicilios`, `herr-etiquetas`, `herr-recargas`, `herr-rutas`, `herr-menu-categorias`, `herr-menu-tamanos`, `herr-menu-productos`, `herr-menu-extras`, `herr-menu-complementos`, `herr-menu-promos` |
| **Teléfono** | Reglas del contestador automático (a quién contestar, rechazar o silenciar; locución), registro de llamadas. La ejecución (filtrar y contestar llamadas) es **solo de la app Android**. | `herr-telefono` |
| **Asistente de voz** | Interpreta órdenes en español (intención + datos) y las ejecuta sobre Reparto. Escuchar y hablar es **solo de la app Android**; el intérprete sirve también para una caja de texto. | `herr-voz` |
| **Agenda** | Eventos con recordatorio o alarma y una nota Markdown. Las alarmas las programa la app Android. | `herr-agenda` |
| **Utilidades** | Servicios sin tabla para otras apps: evaluar fórmulas, Markdown → HTML, geodesia, análisis de rutas. | `herr-utilidades` |

## Contrato de nombres

Los nombres de recurso de Imperium son **globales** (`pedidos`, `vehicle`,
`ruta`, `sync`… ya existen en otras apps), así que todo lo de esta app lleva
prefijo `herr-`.

- Módulo = una tabla: `src/modules/herr-<nombre>/herr-<nombre>.{routes,tables,pages}.ts`
  (+ `.flow.ts` para rutas propias). Tabla SQL = recurso con `_`
  (`herr-menu-tamanos` → `herr_menu_tamanos`).
- Lógica pura (sin `ctx`, sin HTTP) en `src/lib/<tema>/` con su `.spec.ts`.
- Página feature-shell de cada CRUD: id `herramientas.<recurso>`, path
  `<recurso>`. Páginas propias (descriptor `nox.*`): `herramientas.herr-<nombre>`.
- Permisos: `subject.herramientas.<recurso>.read|write` (los deriva el kit).
- Dos menús distintos:
  - **Lanzador de Imperium** (lo que ve el usuario): lo arma el núcleo desde
    `modular/catalog.json` → `menus[]` del monorepo. Root `herramientas-menu-root`;
    carpetas `herramientas-nav-<herramienta>`; hojas `herramientas-<segmento>` con
    path `/<segmento>`, que el front resuelve por `LEAVES` de
    `frontend/.../subject-home/launcher-leaf.ts`.
  - **Menú del manifiesto** (`menu` de cada `define_module`): ids
    `herramientas.<segmento>`, `pageId` y `path` sin barra. Solo describe las
    páginas de la app; el lanzador no lo lee.
- Columnas base de toda tabla: `id, name, description, is_active, ref,
  search_field, created_by, custom_data, payload, created_at, updated_at`.
- Todo texto de UI, comentarios y nombres de dominio en **español**.
- Fechas y horas en la zona del negocio (`HERRAMIENTAS_ZONA`, por defecto
  `America/Mexico_City`): `fecha_hoy`, `hora_ahora`, `sello_ahora` y `solo_dia`
  de `src/lib/comun.ts`; nunca `toISOString()` para «hoy».
- Imágenes (papelito, ticket, fotos): el formulario manda data URL;
  `guardar_imagen` las sube como adjunto (`nox.files`) y en la fila queda la URL.

## Rutas propias (además del CRUD de cada módulo)

| Ruta | Para qué |
|---|---|
| `GET /herr-tablas/plantillas` · `POST /herr-tablas/desde-plantilla` | Plantillas de tabla listas para usar |
| `GET /herr-tablas/:id/resumen` | Agregados y resúmenes de la tabla |
| `POST /herr-tablas/:id/cerrar` | Cierre: archiva las filas en `herr-cierres` y vacía la tabla |
| `POST /herr-tablas/:id/buscar` `{q}` | Búsqueda por prefijos sobre los registros |
| `POST /herr-registros/captura` | Alta/edición de un registro con campos planos (lo usa el formulario dinámico) |
| `GET /herr-jornadas/activa` · `POST /herr-jornadas/iniciar` · `POST /herr-jornadas/:id/terminar` · `POST /herr-jornadas/:id/cambiar-vehiculo` | Ciclo de la jornada. `terminar` además entrega los cobros (sin devolver el fondo de cambio) y responde `{data, liquidacion}` |
| `GET /herr-jornadas/:id/liquidacion` · `POST /herr-jornadas/:id/liquidar` | Vista previa y confirmación de la entrega de cobros |
| `POST /herr-pedidos/cotizar` · `POST /herr-pedidos/:id/surtir` · `POST /herr-pedidos/:id/en-ruta` · `POST /herr-pedidos/:id/entregar` | Precio automático y estados del pedido |
| `POST /herr-domicilios/emparejar` `{lat, lon}` · `POST /herr-domicilios/aqui-mismo` · `GET /herr-domicilios/:id/mapa` · `POST /herr-domicilios/:id/entrega` | Domicilio más cercano (o candidatos si es ambiguo); alta o reutilización desde el GPS; enlaces a mapas; contar una entrega |
| `GET /herr-vehiculos/tanques` · `GET /herr-vehiculos/por-vehiculo/:vehiculo_id` · `GET /herr-vehiculos/:id/combustible` | Catálogo de tanques; ajustes de reparto de un vehículo de la app Vehículos; rendimiento y estimación de litros |
| `POST /herr-rutas/iniciar` · `POST /herr-rutas/:id/puntos` · `GET /herr-rutas/:id/informe` · `POST /herr-rutas/:id/terminar` | Ruta GPS: ingesta de puntos (desde Android), paradas en vivo e informe |
| `GET /herr-telefono/activa` · `POST /herr-telefono/decidir` · `POST /herr-telefono/llamadas` | Contrato con la app Android |
| `POST /herr-voz/interpretar` · `POST /herr-voz/ejecutar` | Texto → intención → acción |
| `GET /herr-agenda/rango?desde&hasta` · `GET /herr-agenda/recordatorios?desde&hasta` · `POST /herr-agenda/:id/hecho` | Agenda, recordatorios pendientes (para las alarmas de Android) y marcar hecho |
| `POST /herr-utilidades/formula` · `POST /herr-utilidades/markdown` · `POST /herr-utilidades/geo/distancia` · `POST /herr-utilidades/geo/enlaces` · `POST /herr-utilidades/rutas/analizar` · `GET /herr-utilidades/capacidades` | Servicios para otras apps. Sin estado: los puede usar cualquier usuario interno con sesión aunque no tenga el menú de Herramientas |

## Asistente de voz

- Escuchar y hablar lo hace la **app Android**. En el navegador la orden se
  escribe, y lo que escribe datos primero se pregunta: se revisa la respuesta,
  se marca la casilla **«Confirmo»** y se vuelve a enviar.
- «Entregado» solo guarda lo recibido si se dice («entregado, recibí 250»);
  sin cantidad marca la entrega y el cobro queda pendiente.
- Los gastos por voz (también el de una carga de gasolina) salen de los
  cobros: exigen dinero de cobros disponible.
- «Entregar el cobro» liquida conservando el fondo de cambio; «…y devuelvo el
  cambio» salda también el fondo de cambio.

## Dependencias

`dependsOn: ["subject-vehiculos"]`: `herr_jornadas.vehiculo_id`, `herr_recargas.vehiculo_id` y
`herr_vehiculos.vehiculo_id` son ids del `vehicle` de esa app; el nombre se resuelve con
`call_subject("subject-vehiculos", "GET /vehicle/:id")` y, si el núcleo aún no admite la
llamada, con el snapshot guardado.

## Uso desde otras apps

- **Requerirla:** `define_subject({ dependsOn: ["subject-herramientas"] })` +
  `depends_on` en el catálogo. El núcleo la instala en cascada.
- **Desde el navegador** (descriptores o Angular): `api://m/subject-herramientas/<ruta>`.
- **Desde el servidor de otra app:** `call_subject("subject-herramientas", "POST /herr-utilidades/formula", { body })`
  del kit. El núcleo verifica el secreto derivado de la app llamante y firma
  hacia Herramientas un principal de servicio (`subject:<app>`) con permiso
  sobre sus recursos. Solo realm interno; ambas apps deben estar instaladas.
