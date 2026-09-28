import { build_feature_shell_page, type KirletPageDecl } from "@opus-perpetuus/imperium-core-kit";

const API = "api://m/subject-herramientas";

export const herr_menu_promos_pages: KirletPageDecl[] = [
  {
    id: "herramientas.herr-menu-promos",
    path: "herr-menu-promos",
    permission: "subject.herramientas.herr-menu-promos.read",
    build: () =>
      build_feature_shell_page({
        id: "herramientas.herr-menu-promos",
        owner: "subject-herramientas",
        title: "Promociones",
        props: {
          basePath: "herr-menu-promos",
          idKey: "id",
          nameKey: "name",
          view: {
            title: "Promociones",
            subtitle: "Descuentos que se pueden aplicar a un pedido",
            pluralLabel: "promociones",
            singularLabel: "promoción",
            emptyTitle: "Sin promociones",
            emptyDescription: "Crea la primera",
          },
          data: {
            list: `${API}/herr-menu-promos`,
            record: `${API}/herr-menu-promos/:id`,
            create: { method: "POST", action: `${API}/herr-menu-promos` },
            update: { method: "PATCH", action: `${API}/herr-menu-promos/:id` },
            delete: { method: "DELETE", action: `${API}/herr-menu-promos/:id` },
          },
          table: {
            columns: [
              { key: "name", label: "Nombre", sortable: true, priority: 1 },
              { key: "descuento_pesos", label: "Descuento $", sortable: true, priority: 1 },
              { key: "descuento_pct", label: "Descuento %", sortable: true, priority: 1 },
              { key: "activa", label: "Activa", sortable: true, priority: 2 },
            ],
            fillHeight: true,
            serverQuery: true,
          },
          form: {
            fields: [
              { name: "name", component: "input-text", label: "Nombre", required: true },
              { name: "activa", component: "input-checkbox", label: "Activa" },
              { name: "descuento_pesos", component: "input-money", label: "Descuento en pesos" },
              { name: "descuento_pct", component: "input-number", label: "Descuento en %", min: 0, max: 100, step: 0.5 },
              { name: "description", component: "input-textarea", label: "Notas", column_span: "full" },
            ],
          },
        },
      }),
  },
];
