# Herramientas · Utilidades

Una persona o una app con sesión interna consulta qué servicios ofrece
Herramientas y comprueba que la app responde con su versión. Queda probado
que las rutas de servicio de `herr-utilidades` contestan con sesión interna
y niegan sin ella.

## Sub-features

La app hace la acción de `capacidades`. Escribe: no.
La app hace la acción de `salud`. Escribe: no.
Esta ficha no lleva línea `Subject:` con imagen: el catálogo no da un tag
para rellenarla. El hueco está en `despliegue.md`.

- `capacidades` responde 200 con `data`, una lista cuyas entradas traen
  `id`, `herramienta`, `metodo`, `ruta`, `entrada`, `salida` y `descripcion`.
- `salud` responde 200 con `data.ok: true` y `data.version` igual a la de
  `package.json`.

### Archivos y contratos

- `src/subject.ts` — `define_subject` de `SUBJECT-herramientas`
  (`subject-herramientas`), `dependsOn: ["subject-vehiculos"]`.
- `src/modules/herr-utilidades/herr-utilidades.flow.ts` —
  `GET /herr-utilidades/capacidades` y `GET /herr-utilidades/salud`; sin
  sesión interna, 401.
- `src/modules/herr-utilidades/herr-utilidades.pages.ts` — página
  `herramientas.herr-utilidades`, path `herr-utilidades`, permiso
  `subject.herramientas.herr-utilidades.read`.
- `src/modules/herr-utilidades/herr-utilidades.spec.ts` — specs de ambas
  rutas.

### Mapa

| id | ruta | rol semilla | pasos | esperado | muta | receta |
| --- | --- | --- | --- | --- | --- | --- |
| `subject-herramientas.capacidades` | `GET /herr-utilidades/capacidades` | usuario interno con sesión | GET con la sesión | 200 y `data` con las 7 claves por entrada | no | `arnes capacidades` |
| `subject-herramientas.salud` | `GET /herr-utilidades/salud` | usuario interno con sesión | GET con la sesión | 200, `data.ok: true`, `data.version` | no | `arnes salud` |

## How to get to it (user POV)

- Página «Utilidades» (`herramientas.herr-utilidades`, path
  `herr-utilidades`) en el lanzador; la hoja la arma `modular/catalog.json`
  del monorepo.
- Desde el navegador del núcleo:
  `api://m/subject-herramientas/herr-utilidades/capacidades`.

## Driving it with arnes

Preconditions:

- Doctor en 0. Si falta `subject-herramientas`, la receta sale `omitida`.
- Sesión de usuario interno. Sin ella las rutas dan 401.

- **Abrir.** `GET /herr-utilidades/capacidades` y
  `GET /herr-utilidades/salud`; se juzga por status HTTP y cuerpo.
- **Proof.** `evidence/herramientas/`.

## Gotchas

- Una receta de lectura que escribe sale en fallo aunque la pantalla se vea bien.
- Base QA sin definir: ninguna receta que mute corre hasta que se nombre.
- `omitida` no cuenta como probada.
