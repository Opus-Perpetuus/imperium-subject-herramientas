import { define_module, define_routes } from "@opus-perpetuus/imperium-core-kit";
import { HERRAMIENTAS, herr_inicio_pages } from "./herr-inicio.pages.ts";

/** Portada de la app: la lista de herramientas y a dónde lleva cada una. */
export const herr_inicio_module = define_module({
  resource: "herr-inicio",
  labels: {
    singular: "Inicio",
    plural: "Inicio",
    read: "Ver la portada de Herramientas",
    write: "Ver la portada de Herramientas",
  },
  routes: define_routes({
    "GET /herr-inicio": (ctx) => ctx.json({ data: HERRAMIENTAS }),
  }),
  pages: herr_inicio_pages,
  menu: [
    {
      id: "herramientas.herr-inicio",
      label: "Inicio",
      order: 0,
      pageId: "herramientas.herr-inicio",
      path: "herr-inicio",
      permission: "subject.herramientas.herr-inicio.read",
      icon: "fa-toolbox",
    },
  ],
});
