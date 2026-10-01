import type { KirletPageDecl } from "@opus-perpetuus/imperium-core-kit";
import { CAPACIDADES } from "./herr-utilidades.flow.ts";

const GUIA = `Servicios **sin tabla** que Herramientas ofrece a otras apps. Las rutas de
abajo son la misma lista que devuelve \`GET /herr-utilidades/capacidades\`.

## Cómo llamarlas

- **Requerir la app:** \`define_subject({ dependsOn: ["subject-herramientas"] })\`
  y \`depends_on\` en el catálogo; el núcleo la instala en cascada.
- **Desde el navegador** (descriptores \`nox.*\` o Angular):
  \`api://m/subject-herramientas/herr-utilidades/markdown\`.
- **Desde el servidor de otra app:**
  \`call_subject("subject-herramientas", "POST /herr-utilidades/markdown", { body: { texto } })\`
  del kit. Solo realm interno; ambas apps deben estar instaladas.
- **Quién:** las rutas \`/herr-utilidades/*\` las puede llamar cualquier usuario
  interno con sesión, aunque no tenga el menú de Herramientas (sin sesión
  interna, 401). Las demás exigen el permiso de su herramienta.
`;

const MARKDOWN = `\`POST /herr-utilidades/markdown\` con \`{ texto, sanear?: true }\` devuelve
\`{ html, ast, encabezados, etiquetas }\`. Reconoce encabezados, citas, código
cercado, viñetas, numeradas, tareas \`- [ ]\`, tablas, reglas, metadatos YAML,
**negrita**, *cursiva*, ~~tachado~~, ==resaltado==, \`código\`, enlaces,
imágenes, \`[[wiki|alias]]\` y \`#etiquetas\`.

Con \`sanear: true\` (por defecto) el HTML pasa por el saneador del kit: las
casillas de tarea, el \`data-wiki\`, la clase \`etiqueta\` y los \`id\` de los
encabezados se pierden (el texto se conserva). Con \`sanear: false\` se entrega
el HTML tal cual se genera: el texto ya va escapado y las URL con esquema
ejecutable (\`javascript:\`, \`vbscript:\`, \`data:\` salvo imágenes) se omiten. El
\`ast\` nunca se sanea: lleva el texto original como dato, así que quien lo
pinte por su cuenta debe escaparlo.
`;

/** Un grupo plegable por herramienta: en el teléfono, seis columnas por ruta no cabían. */
function rutas_por_herramienta(): Array<{ id: string; title: string; body: string }> {
  const grupos = Map.groupBy(CAPACIDADES, (c) => c.herramienta);
  return [...grupos].map(([herramienta, rutas]) => ({
    id: herramienta,
    title: `${herramienta} · ${rutas.length} ${rutas.length === 1 ? "ruta" : "rutas"}`,
    body: rutas
      .map((c) => `**${c.metodo}** \`${c.ruta}\`  \n${c.descripcion}  \nEntrada: \`${c.entrada}\` · Salida: \`${c.salida}\``)
      .join("\n\n"),
  }));
}

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
            component: "nox.collapsible",
            text: "Rutas por herramienta",
            props: {
              items: [
                ...rutas_por_herramienta(),
                { id: "markdown", title: "Markdown: qué reconoce y cómo se sanea", body: MARKDOWN },
              ],
            },
          },
        ],
      },
    }),
  },
];
