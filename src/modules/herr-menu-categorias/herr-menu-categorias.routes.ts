import { define_crud, define_module } from "@opus-perpetuus/imperium-core-kit";
import { campo_busqueda, numero } from "../../lib/comun.ts";
import { COLUMNAS_DE_PRECIO } from "../../lib/precios/catalogo.ts";
import { herr_menu_categorias_flow } from "./herr-menu-categorias.flow.ts";
import { herr_menu_categorias_pages } from "./herr-menu-categorias.pages.ts";
import { herr_menu_categorias_tables } from "./herr-menu-categorias.tables.ts";

export const herr_menu_categorias_module = define_module({
  resource: "herr-menu-categorias",
  labels: {
    singular: "Categoría de precio",
    plural: "Categorías de precio",
    read: "Ver categorías de precio",
    write: "Editar categorías de precio",
  },
  routes: [
    ...herr_menu_categorias_flow,
    ...define_crud({
      resource: "herr-menu-categorias",
      table: "herr_menu_categorias",
      soft_delete: true,
      soft_delete_field: "is_active",
      history: true,
      default_sort: "name:asc",
      id_prefix: "mcat",
      fields: {
        name: { type: "string", required: true, search: true },
        description: { type: "string", search: true },
        is_active: { type: "boolean" },
        ref: { type: "string" },
        search_field: { type: "string", search: true },
        created_by: { type: "string" },
        custom_data: { type: "json" },
        payload: { type: "json" },
        columna_precio: {
          type: "number",
          required: true,
          validate: (v) =>
            (COLUMNAS_DE_PRECIO as readonly number[]).includes(numero(v) ?? -1)
              ? null
              : "La columna de precio debe ser 1, 2 o 3",
        },
      },
      options_map: { value: "id", label: "name" },
      hooks: {
        before_create: (ctx, row) => ({ ...row, created_by: ctx.actor, search_field: campo_busqueda(row.name) }),
        before_update: (_ctx, _id, patch, existing) => {
          const { created_by: _autor, ...resto } = patch;
          return {
            ...resto,
            search_field: campo_busqueda(resto.name ?? existing.name),
          };
        },
      },
    }),
  ],
  tables: herr_menu_categorias_tables,
  pages: herr_menu_categorias_pages,
  menu: [
    {
      id: "herramientas.herr-menu-categorias",
      label: "Categorías de precio",
      order: 50,
      pageId: "herramientas.herr-menu-categorias",
      path: "herr-menu-categorias",
      permission: "subject.herramientas.herr-menu-categorias.read",
      icon: "fa-layer-group",
    },
  ],
});
