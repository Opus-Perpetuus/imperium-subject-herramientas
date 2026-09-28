import type { KirletPageDecl } from "@opus-perpetuus/imperium-core-kit";
import { CAPACIDADES } from "./herr-utilidades.flow.ts";

const GUIA = `# Utilidades

Servicios **sin tabla** que Herramientas ofrece a otras apps. La tabla de abajo
es la misma lista que devuelve \`GET /herr-utilidades/capacidades\`.

## Cómo llamarlas

- **Requerir la app:** \`define_subject({ dependsOn: ["subject-herramientas"] })\`
  y \`depends_on\` en el catálogo; el núcleo la instala en cascada.
- **Desde el navegador** (descriptores \`nox.*\` o Angular):
  \`api://m/subject-herramientas/herr-utilidades/markdown\`.
- **Desde el servidor de otra app:**
  \`call_subject("subject-herramientas", "POST /herr-utilidades/markdown", { body: { texto } })\`
  del kit. Solo realm interno; ambas apps deben estar instaladas.

## Markdown

\`POST /herr-utilidades/markdown\` con \`{ texto, sanear?: true }\` devuelve
\`{ html, ast, encabezados, etiquetas }\`. Reconoce encabezados, citas, código
cercado, viñetas, numeradas, tareas \`- [ ]\`, tablas, reglas, metadatos YAML,
**negrita**, *cursiva*, ~~tachado~~, ==resaltado==, \`código\`, enlaces,
imágenes, \`[[wiki|alias]]\` y \`#etiquetas\`.

Con \`sanear: true\` (por defecto) el HTML pasa por el saneador del kit: las
casillas de tarea, el \`data-wiki\`, la clase \`etiqueta\` y los \`id\` de los
encabezados se pierden (el texto se conserva). Con \`sanear: false\` se entrega
el HTML tal cual se genera; el texto ya va escapado, pero las URL de los
enlaces no se filtran. El \`ast\` nunca se sanea: lleva el texto original como
dato, así que quien lo pinte por su cuenta debe escaparlo.
`;

export const herr_utilidades_pages: KirletPageDecl[] = [
  {
    id: "herramientas.herr-utilidades",
    path: "herr-utilidades",
    permission: "subject.herramientas.herr-utilidades.read",
    build: () => ({
      id: "herramientas.herr-utilidades",
      owner: "subject-herramientas",
      title: "Utilidades",
      page: {
        component: "nox.page",
        props: {},
        children: [
          { component: "nox.markdown-view", props: { content: GUIA } },
          {
            component: "nox.table",
            props: {
              columns: [
                { key: "herramienta", label: "Herramienta" },
                { key: "metodo", label: "Método" },
                { key: "ruta", label: "Ruta" },
                { key: "entrada", label: "Entrada" },
                { key: "salida", label: "Salida" },
                { key: "descripcion", label: "Descripción" },
              ],
              rows: CAPACIDADES,
            },
          },
        ],
      },
    }),
  },
];
