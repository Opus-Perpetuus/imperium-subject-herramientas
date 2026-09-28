import { define_crud, define_module } from "@opus-perpetuus/imperium-core-kit";
import { campo_busqueda } from "../../lib/comun.ts";
import { herr_menu_tamanos_pages } from "./herr-menu-tamanos.pages.ts";
import { herr_menu_tamanos_tables } from "./herr-menu-tamanos.tables.ts";

/** Un precio en blanco es «no se vende», no cero: el formulario manda "". */
const vacio_a_null = (v: unknown) => (v === "" ? null : v);

export const herr_menu_tamanos_module = define_module({
  resource: "herr-menu-tamanos",
  labels: {
    singular: "Tamaño",
    plural: "Tamaños",
    read: "Ver tamaños",
    write: "Editar tamaños",
  },
  routes: define_crud({
    resource: "herr-menu-tamanos",
    table: "herr_menu_tamanos",
    soft_delete: true,
    soft_delete_field: "is_active",
    history: true,
    default_sort: "orden:asc",
    id_prefix: "mtam",
    fields: {
      name: { type: "string", required: true, search: true },
      description: { type: "string", search: true },
      is_active: { type: "boolean" },
      ref: { type: "string" },
      search_field: { type: "string", search: true },
      created_by: { type: "string" },
      custom_data: { type: "json" },
      payload: { type: "json" },
      precio_1: { type: "number", normalize: vacio_a_null },
      precio_2: { type: "number", normalize: vacio_a_null },
      precio_3: { type: "number", normalize: vacio_a_null },
      divisible: { type: "string" },
      orden: { type: "number", normalize: vacio_a_null },
    },
    options_map: { value: "id", label: "name" },
    hooks: {
      before_create: (ctx, row) => ({
        ...row,
        created_by: ctx.actor,
        divisible: row.divisible ?? "1,2,4",
        search_field: campo_busqueda(row.name),
      }),
      before_update: (_ctx, _id, patch, existing) => {
        const { created_by: _autor, ...resto } = patch;
        return {
          ...resto,
          search_field: campo_busqueda(resto.name ?? existing.name),
        };
      },
    },
  }),
  tables: herr_menu_tamanos_tables,
  pages: herr_menu_tamanos_pages,
  menu: [
    {
      id: "herramientas.herr-menu-tamanos",
      label: "Tamaños",
      order: 51,
      pageId: "herramientas.herr-menu-tamanos",
      path: "herr-menu-tamanos",
      permission: "subject.herramientas.herr-menu-tamanos.read",
      icon: "fa-ruler",
    },
  ],
});
