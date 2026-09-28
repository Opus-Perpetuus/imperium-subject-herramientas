import { define_module } from "@opus-perpetuus/imperium-core-kit";
import { herr_utilidades_flow } from "./herr-utilidades.flow.ts";
import { herr_utilidades_pages } from "./herr-utilidades.pages.ts";

/** Utilidades: servicios para otras apps. Sin tablas ni CRUD. */
export const herr_utilidades_module = define_module({
  resource: "herr-utilidades",
  labels: {
    singular: "Utilidades",
    plural: "Utilidades",
    read: "Usar utilidades",
    write: "Usar utilidades",
  },
  routes: [...herr_utilidades_flow],
  pages: herr_utilidades_pages,
  menu: [
    {
      id: "herramientas.herr-utilidades",
      label: "Utilidades",
      order: 90,
      pageId: "herramientas.herr-utilidades",
      path: "herr-utilidades",
      permission: "subject.herramientas.herr-utilidades.read",
      icon: "fa-screwdriver-wrench",
    },
  ],
});
