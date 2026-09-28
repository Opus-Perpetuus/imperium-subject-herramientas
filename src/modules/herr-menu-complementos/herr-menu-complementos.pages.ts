import { build_feature_shell_page, type KirletPageDecl } from "@opus-perpetuus/imperium-core-kit";

const API = "api://m/subject-herramientas";

export const herr_menu_complementos_pages: KirletPageDecl[] = [
  {
    id: "herramientas.herr-menu-complementos",
    path: "herr-menu-complementos",
    permission: "subject.herramientas.herr-menu-complementos.read",
    build: () =>
      build_feature_shell_page({
        id: "herramientas.herr-menu-complementos",
        owner: "subject-herramientas",
        title: "Complementos",
        props: {
          basePath: "herr-menu-complementos",
          idKey: "id",
          nameKey: "name",
          view: {
            title: "Complementos",
            subtitle: "Productos sueltos con sus variantes: una variante es otra fila del mismo grupo",
            pluralLabel: "complementos",
            singularLabel: "complemento",
            emptyTitle: "Sin complementos",
            emptyDescription: "Crea el primero o carga el catálogo de ejemplo",
          },
          data: {
            list: `${API}/herr-menu-complementos`,
            record: `${API}/herr-menu-complementos/:id`,
            create: { method: "POST", action: `${API}/herr-menu-complementos` },
            update: { method: "PATCH", action: `${API}/herr-menu-complementos/:id` },
            delete: { method: "DELETE", action: `${API}/herr-menu-complementos/:id` },
          },
          table: {
            columns: [
              { key: "name", label: "Producto", sortable: true, priority: 1 },
              { key: "variante", label: "Variante", sortable: true, priority: 1 },
              { key: "precio", label: "Precio", sortable: true, priority: 1 },
              { key: "activo", label: "Activo", sortable: true, priority: 2 },
            ],
            fillHeight: true,
            serverQuery: true,
          },
          form: {
            fields: [
              { name: "name", component: "input-text", label: "Producto", required: true },
              { name: "variante", component: "input-text", label: "Variante", placeholder: "6 pzas, 2 L…" },
              { name: "precio", component: "input-money", label: "Precio", required: true },
              { name: "activo", component: "input-checkbox", label: "Activo" },
              { name: "description", component: "input-textarea", label: "Descripción", column_span: "full" },
            ],
          },
        },
      }),
  },
];
