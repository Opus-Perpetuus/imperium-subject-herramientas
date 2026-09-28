import { build_feature_shell_page, type KirletPageDecl } from "@opus-perpetuus/imperium-core-kit";

const API = "api://m/subject-herramientas";

export const herr_menu_categorias_pages: KirletPageDecl[] = [
  {
    id: "herramientas.herr-menu-categorias",
    path: "herr-menu-categorias",
    permission: "subject.herramientas.herr-menu-categorias.read",
    build: () =>
      build_feature_shell_page({
        id: "herramientas.herr-menu-categorias",
        owner: "subject-herramientas",
        title: "Categorías de precio",
        props: {
          basePath: "herr-menu-categorias",
          idKey: "id",
          nameKey: "name",
          view: {
            title: "Categorías de precio",
            subtitle: "Los escalones de precio del catálogo (sencilla, especial, premium)",
            pluralLabel: "categorías",
            singularLabel: "categoría",
            emptyTitle: "Sin categorías",
            emptyDescription: "Crea la primera o carga el catálogo de ejemplo",
          },
          data: {
            list: `${API}/herr-menu-categorias`,
            record: `${API}/herr-menu-categorias/:id`,
            create: { method: "POST", action: `${API}/herr-menu-categorias` },
            update: { method: "PATCH", action: `${API}/herr-menu-categorias/:id` },
            delete: { method: "DELETE", action: `${API}/herr-menu-categorias/:id` },
          },
          table: {
            columns: [
              { key: "name", label: "Nombre", sortable: true, priority: 1 },
              { key: "columna_precio", label: "Columna de precio", sortable: true, priority: 1 },
              { key: "is_active", label: "Activo", sortable: true, priority: 3 },
            ],
            fillHeight: true,
            serverQuery: true,
          },
          form: {
            fields: [
              { name: "name", component: "input-text", label: "Nombre", required: true },
              {
                name: "columna_precio",
                component: "input-menu",
                label: "Columna de precio",
                required: true,
                help: "De qué columna del tamaño sale el precio de esta categoría",
                options: [
                  { value: 1, label: "Precio 1" },
                  { value: 2, label: "Precio 2" },
                  { value: 3, label: "Precio 3" },
                ],
              },
              { name: "description", component: "input-textarea", label: "Descripción", column_span: "full" },
            ],
          },
        },
      }),
  },
];
