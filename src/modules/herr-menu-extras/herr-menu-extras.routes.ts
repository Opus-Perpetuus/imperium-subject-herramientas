import { define_crud, define_module } from "@opus-perpetuus/imperium-core-kit";
import { campo_busqueda } from "../../lib/comun.ts";
import { herr_menu_extras_pages } from "./herr-menu-extras.pages.ts";
import { herr_menu_extras_tables } from "./herr-menu-extras.tables.ts";

export const herr_menu_extras_module = define_module({
  resource: "herr-menu-extras",
  labels: {
    singular: "Extra",
    plural: "Extras",
    read: "Ver extras",
    write: "Editar extras",
  },
  routes: define_crud({
    resource: "herr-menu-extras",
    table: "herr_menu_extras",
    soft_delete: true,
    soft_delete_field: "is_active",
    history: true,
    default_sort: "name:asc",
    id_prefix: "mext",
    fields: {
      name: { type: "string", required: true, search: true },
      description: { type: "string", search: true },
      is_active: { type: "boolean" },
      ref: { type: "string" },
      search_field: { type: "string", search: true },
      created_by: { type: "string" },
      custom_data: { type: "json" },
      payload: { type: "json" },
      precio: { type: "number", required: true },
      activo: { type: "boolean" },
    },
    options_map: { value: "id", label: "name" },
    hooks: {
      before_create: (ctx, row) => ({ ...row, created_by: ctx.actor, activo: row.activo ?? true, search_field: campo_busqueda(row.name) }),
      before_update: (_ctx, _id, patch, existing) => {
        const { created_by: _autor, ...resto } = patch;
        return {
          ...resto,
          search_field: campo_busqueda(resto.name ?? existing.name),
        };
      },
    },
  }),
  tables: herr_menu_extras_tables,
  pages: herr_menu_extras_pages,
  menu: [
    {
      id: "herramientas.herr-menu-extras",
      label: "Extras",
      order: 53,
      pageId: "herramientas.herr-menu-extras",
      path: "herr-menu-extras",
      permission: "subject.herramientas.herr-menu-extras.read",
      icon: "fa-plus-circle",
    },
  ],
});
