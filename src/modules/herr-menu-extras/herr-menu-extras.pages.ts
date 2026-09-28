import { build_feature_shell_page, type KirletPageDecl } from "@opus-perpetuus/imperium-core-kit";

const API = "api://m/subject-herramientas";

export const herr_menu_extras_pages: KirletPageDecl[] = [
  {
    id: "herramientas.herr-menu-extras",
    path: "herr-menu-extras",
    permission: "subject.herramientas.herr-menu-extras.read",
    build: () =>
      build_feature_shell_page({
        id: "herramientas.herr-menu-extras",
        owner: "subject-herramientas",
        title: "Extras",
        props: {
          basePath: "herr-menu-extras",
          idKey: "id",
          nameKey: "name",
          view: {
            title: "Extras",
            subtitle: "Añadidos a un producto, a precio único",
            pluralLabel: "extras",
            singularLabel: "extra",
            emptyTitle: "Sin extras",
            emptyDescription: "Crea el primero o carga el catálogo de ejemplo",
          },
          data: {
            list: `${API}/herr-menu-extras`,
            record: `${API}/herr-menu-extras/:id`,
            create: { method: "POST", action: `${API}/herr-menu-extras` },
            update: { method: "PATCH", action: `${API}/herr-menu-extras/:id` },
            delete: { method: "DELETE", action: `${API}/herr-menu-extras/:id` },
          },
          table: {
            columns: [
              { key: "name", label: "Nombre", sortable: true, priority: 1 },
              { key: "precio", label: "Precio", sortable: true, priority: 1 },
              { key: "activo", label: "Activo", sortable: true, priority: 2 },
            ],
            fillHeight: true,
            serverQuery: true,
          },
          form: {
            fields: [
              { name: "name", component: "input-text", label: "Nombre", required: true },
              { name: "precio", component: "input-money", label: "Precio", required: true },
              { name: "activo", component: "input-checkbox", label: "Activo" },
              { name: "description", component: "input-textarea", label: "Descripción", column_span: "full" },
            ],
          },
        },
      }),
  },
];
