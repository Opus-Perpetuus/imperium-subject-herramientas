import { define_crud, define_module } from "@opus-perpetuus/imperium-core-kit";
import { herr_tablas_disenio, preparar_tabla } from "./herr-tablas.disenio.ts";
import { herr_tablas_flow } from "./herr-tablas.flow.ts";
import { herr_tablas_pages } from "./herr-tablas.pages.ts";
import { herr_tablas_tables } from "./herr-tablas.tables.ts";

export const herr_tablas_module = define_module({
  resource: "herr-tablas",
  labels: {
    singular: "Tabla personalizada",
    plural: "Tablas personalizadas",
    read: "Ver tablas personalizadas",
    write: "Editar tablas personalizadas",
  },
  routes: [
    ...herr_tablas_flow,
    ...herr_tablas_disenio,
    ...define_crud({
      resource: "herr-tablas",
      table: "herr_tablas",
      soft_delete: true,
      soft_delete_field: "is_active",
      history: true,
      default_sort: "updated_at:desc",
      id_prefix: "tabla",
      fields: {
        name: { type: "string", required: true, search: true },
        description: { type: "string", search: true },
        is_active: { type: "boolean" },
        ref: { type: "string" },
        search_field: { type: "string", search: true },
        created_by: { type: "string" },
        custom_data: { type: "json" },
        payload: { type: "json" },
        icono: { type: "string" },
        campos: { type: "json" },
        constantes: { type: "json" },
        resumenes: { type: "json" },
        plantilla_id: { type: "string" },
        orden_campo: { type: "string" },
        orden_desc: { type: "boolean" },
        cerrable: { type: "boolean" },
        version_esquema: { type: "number" },
      },
      options_map: { value: "id", label: "name" },
      hooks: {
        before_create: (ctx, row) => preparar_tabla(ctx, row, null),
        before_update: (ctx, _id, patch, existing) => preparar_tabla(ctx, patch, existing),
      },
    }),
  ],
  tables: herr_tablas_tables,
  pages: herr_tablas_pages,
  menu: [
    {
      id: "herramientas.herr-tablas",
      label: "Tablas personalizadas",
      order: 10,
      pageId: "herramientas.herr-tablas",
      path: "herr-tablas",
      permission: "subject.herramientas.herr-tablas.read",
      icon: "fa-table-list",
    },
    {
      id: "herramientas.herr-tabla",
      label: "Ver tabla",
      order: 11,
      pageId: "herramientas.herr-tabla",
      path: "herr-tabla",
      permission: "subject.herramientas.herr-tablas.read",
      icon: "fa-table",
    },
  ],
});
