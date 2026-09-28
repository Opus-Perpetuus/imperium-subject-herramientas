import { define_crud, define_module } from "@opus-perpetuus/imperium-core-kit";
import { campo_busqueda } from "../../lib/comun.ts";
import { herr_menu_complementos_pages } from "./herr-menu-complementos.pages.ts";
import { herr_menu_complementos_tables } from "./herr-menu-complementos.tables.ts";

export const herr_menu_complementos_module = define_module({
  resource: "herr-menu-complementos",
  labels: {
    singular: "Complemento",
    plural: "Complementos",
    read: "Ver complementos",
    write: "Editar complementos",
  },
  routes: define_crud({
    resource: "herr-menu-complementos",
    table: "herr_menu_complementos",
    soft_delete: true,
    soft_delete_field: "is_active",
    history: true,
    default_sort: "name:asc",
    id_prefix: "mcomp",
    fields: {
      name: { type: "string", required: true, search: true },
      description: { type: "string", search: true },
      is_active: { type: "boolean" },
      ref: { type: "string" },
      search_field: { type: "string", search: true },
      created_by: { type: "string" },
      custom_data: { type: "json" },
      payload: { type: "json" },
      variante: { type: "string", search: true },
      precio: { type: "number", required: true },
      activo: { type: "boolean" },
    },
    options_map: { value: "id", label: "name" },
    hooks: {
      before_create: (ctx, row) => ({
        ...row,
        created_by: ctx.actor,
        activo: row.activo ?? true,
        search_field: campo_busqueda(row.name, row.variante),
      }),
      before_update: (_ctx, _id, patch, existing) => {
        const { created_by: _autor, ...resto } = patch;
        return {
          ...resto,
          search_field: campo_busqueda(resto.name ?? existing.name, resto.variante ?? existing.variante),
        };
      },
    },
  }),
  tables: herr_menu_complementos_tables,
  pages: herr_menu_complementos_pages,
  menu: [
    {
      id: "herramientas.herr-menu-complementos",
      label: "Complementos",
      order: 54,
      pageId: "herramientas.herr-menu-complementos",
      path: "herr-menu-complementos",
      permission: "subject.herramientas.herr-menu-complementos.read",
      icon: "fa-drumstick-bite",
    },
  ],
});
