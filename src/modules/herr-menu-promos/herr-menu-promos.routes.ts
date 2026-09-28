import { define_crud, define_module } from "@opus-perpetuus/imperium-core-kit";
import { campo_busqueda } from "../../lib/comun.ts";
import { herr_menu_promos_pages } from "./herr-menu-promos.pages.ts";
import { herr_menu_promos_tables } from "./herr-menu-promos.tables.ts";

const vacio_a_null = (v: unknown) => (v === "" ? null : v);

export const herr_menu_promos_module = define_module({
  resource: "herr-menu-promos",
  labels: {
    singular: "Promoción",
    plural: "Promociones",
    read: "Ver promociones",
    write: "Editar promociones",
  },
  routes: define_crud({
    resource: "herr-menu-promos",
    table: "herr_menu_promos",
    soft_delete: true,
    soft_delete_field: "is_active",
    history: true,
    default_sort: "name:asc",
    id_prefix: "mpromo",
    fields: {
      name: { type: "string", required: true, search: true },
      description: { type: "string", search: true },
      is_active: { type: "boolean" },
      ref: { type: "string" },
      search_field: { type: "string", search: true },
      created_by: { type: "string" },
      custom_data: { type: "json" },
      payload: { type: "json" },
      descuento_pesos: { type: "number", normalize: vacio_a_null },
      descuento_pct: { type: "number", normalize: vacio_a_null },
      activa: { type: "boolean" },
    },
    options_map: { value: "id", label: "name" },
    hooks: {
      before_create: (_ctx, row) => ({ ...row, activa: row.activa ?? true, search_field: campo_busqueda(row.name) }),
      before_update: (_ctx, _id, patch, existing) => ({
        ...patch,
        search_field: campo_busqueda(patch.name ?? existing.name),
      }),
    },
  }),
  tables: herr_menu_promos_tables,
  pages: herr_menu_promos_pages,
  menu: [
    {
      id: "herramientas.herr-menu-promos",
      label: "Promociones",
      order: 55,
      pageId: "herramientas.herr-menu-promos",
      path: "herr-menu-promos",
      permission: "subject.herramientas.herr-menu-promos.read",
      icon: "fa-tags",
    },
  ],
});
