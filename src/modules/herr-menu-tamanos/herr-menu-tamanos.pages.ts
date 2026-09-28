import { build_feature_shell_page, type KirletPageDecl } from "@opus-perpetuus/imperium-core-kit";

const API = "api://m/subject-herramientas";

export const herr_menu_tamanos_pages: KirletPageDecl[] = [
  {
    id: "herramientas.herr-menu-tamanos",
    path: "herr-menu-tamanos",
    permission: "subject.herramientas.herr-menu-tamanos.read",
    build: () =>
      build_feature_shell_page({
        id: "herramientas.herr-menu-tamanos",
        owner: "subject-herramientas",
        title: "Tamaños",
        props: {
          basePath: "herr-menu-tamanos",
          idKey: "id",
          nameKey: "name",
          view: {
            title: "Tamaños",
            subtitle: "Cada tamaño con su precio por categoría y en cuántas partes se divide",
            pluralLabel: "tamaños",
            singularLabel: "tamaño",
            emptyTitle: "Sin tamaños",
            emptyDescription: "Crea el primero o carga el catálogo de ejemplo",
          },
          data: {
            list: `${API}/herr-menu-tamanos`,
            record: `${API}/herr-menu-tamanos/:id`,
            create: { method: "POST", action: `${API}/herr-menu-tamanos` },
            update: { method: "PATCH", action: `${API}/herr-menu-tamanos/:id` },
            delete: { method: "DELETE", action: `${API}/herr-menu-tamanos/:id` },
          },
          table: {
            columns: [
              { key: "name", label: "Nombre", sortable: true, priority: 1 },
              { key: "precio_1", label: "Precio 1", sortable: true, priority: 1 },
              { key: "precio_2", label: "Precio 2", sortable: true, priority: 2 },
              { key: "precio_3", label: "Precio 3", sortable: true, priority: 2 },
              { key: "divisible", label: "Se divide en", priority: 3 },
              { key: "orden", label: "Orden", sortable: true, priority: 3 },
            ],
            fillHeight: true,
            serverQuery: true,
          },
          form: {
            fields: [
              { name: "name", component: "input-text", label: "Nombre", required: true },
              { name: "orden", component: "input-number", label: "Orden", min: 0, step: 1 },
              { name: "precio_1", component: "input-money", label: "Precio categoría 1", help: "Vacío = no se vende en este tamaño" },
              { name: "precio_2", component: "input-money", label: "Precio categoría 2" },
              { name: "precio_3", component: "input-money", label: "Precio categoría 3" },
              { name: "divisible", component: "input-text", label: "Se divide en", placeholder: "1,2,4", help: "1 = entero, 2 = mitades, 4 = cuartos" },
              { name: "description", component: "input-textarea", label: "Descripción", column_span: "full" },
            ],
          },
        },
      }),
  },
];
