import { define_crud, define_module } from "@opus-perpetuus/imperium-core-kit";
import { campo_busqueda } from "../../lib/comun.ts";
import { herr_menu_productos_pages } from "./herr-menu-productos.pages.ts";
import { herr_menu_productos_tables } from "./herr-menu-productos.tables.ts";

export const herr_menu_productos_module = define_module({
  resource: "herr-menu-productos",
  labels: {
    singular: "Producto",
    plural: "Productos",
    read: "Ver productos",
    write: "Editar productos",
  },
  routes: define_crud({
    resource: "herr-menu-productos",
    table: "herr_menu_productos",
    soft_delete: true,
    soft_delete_field: "is_active",
    history: true,
    default_sort: "name:asc",
    id_prefix: "mprod",
    fields: {
      name: { type: "string", required: true, search: true },
      description: { type: "string", search: true },
      is_active: { type: "boolean" },
      ref: { type: "string" },
      search_field: { type: "string", search: true },
      created_by: { type: "string" },
      custom_data: { type: "json" },
      payload: { type: "json" },
      categoria_id: { type: "string", required: true },
      ingredientes: { type: "string", search: true },
      activo: { type: "boolean" },
    },
    options_map: { value: "id", label: "name" },
    hooks: {
      before_create: (ctx, row) => ({
        ...row,
        created_by: ctx.actor,
        activo: row.activo ?? true,
        search_field: campo_busqueda(row.name, row.ingredientes),
      }),
      before_update: (_ctx, _id, patch, existing) => {
        const { created_by: _autor, ...resto } = patch;
        return {
          ...resto,
          search_field: campo_busqueda(resto.name ?? existing.name, resto.ingredientes ?? existing.ingredientes),
        };
      },
    },
  }),
  tables: herr_menu_productos_tables,
  pages: herr_menu_productos_pages,
  menu: [
    {
      id: "herramientas.herr-menu-productos",
      label: "Productos",
      order: 52,
      pageId: "herramientas.herr-menu-productos",
      path: "herr-menu-productos",
      permission: "subject.herramientas.herr-menu-productos.read",
      icon: "fa-utensils",
    },
  ],
});
