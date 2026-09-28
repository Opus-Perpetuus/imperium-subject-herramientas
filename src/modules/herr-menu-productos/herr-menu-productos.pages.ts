import { build_feature_shell_page, type KirletPageDecl } from "@opus-perpetuus/imperium-core-kit";

const API = "api://m/subject-herramientas";

export const herr_menu_productos_pages: KirletPageDecl[] = [
  {
    id: "herramientas.herr-menu-productos",
    path: "herr-menu-productos",
    permission: "subject.herramientas.herr-menu-productos.read",
    build: () =>
      build_feature_shell_page({
        id: "herramientas.herr-menu-productos",
        owner: "subject-herramientas",
        title: "Productos",
        props: {
          basePath: "herr-menu-productos",
          idKey: "id",
          nameKey: "name",
          view: {
            title: "Productos",
            subtitle: "Cada producto y a qué categoría de precio pertenece",
            pluralLabel: "productos",
            singularLabel: "producto",
            emptyTitle: "Sin productos",
            emptyDescription: "Crea el primero o carga el catálogo de ejemplo",
          },
          data: {
            list: `${API}/herr-menu-productos`,
            record: `${API}/herr-menu-productos/:id`,
            create: { method: "POST", action: `${API}/herr-menu-productos` },
            update: { method: "PATCH", action: `${API}/herr-menu-productos/:id` },
            delete: { method: "DELETE", action: `${API}/herr-menu-productos/:id` },
          },
          table: {
            columns: [
              { key: "name", label: "Nombre", sortable: true, priority: 1 },
              { key: "categoria_id", label: "Categoría", sortable: true, priority: 2 },
              { key: "ingredientes", label: "Ingredientes", priority: 3 },
              { key: "activo", label: "Activo", sortable: true, priority: 2 },
            ],
            fillHeight: true,
            serverQuery: true,
          },
          form: {
            fields: [
              { name: "name", component: "input-text", label: "Nombre", required: true },
              {
                name: "categoria_id",
                component: "input-datalist",
                label: "Categoría de precio",
                required: true,
                optionsSource: `${API}/herr-menu-categorias?as=options&limite=1000`,
              },
              { name: "ingredientes", component: "input-text", label: "Ingredientes", help: "Describen qué lleva; no cobran", column_span: "full" },
              { name: "activo", component: "input-checkbox", label: "Activo" },
              { name: "description", component: "input-textarea", label: "Descripción", column_span: "full" },
            ],
          },
        },
      }),
  },
];
