import { define_crud, define_module } from "@opus-perpetuus/imperium-core-kit";
import { con_filtro_por_tabla, herr_registros_flow, preparar_registro } from "./herr-registros.flow.ts";
import { herr_registros_pages } from "./herr-registros.pages.ts";
import { herr_registros_tables } from "./herr-registros.tables.ts";

export const herr_registros_module = define_module({
  resource: "herr-registros",
  labels: {
    singular: "Registro",
    plural: "Registros",
    read: "Ver registros",
    write: "Editar registros",
  },
  routes: [
    ...herr_registros_flow,
    ...con_filtro_por_tabla(
      define_crud({
        resource: "herr-registros",
        table: "herr_registros",
        soft_delete: true,
        soft_delete_field: "is_active",
        history: true,
        default_sort: "updated_at:desc",
        id_prefix: "registro",
        fields: {
          // `name` lo deriva el hook del primer campo `en_resumen`; por eso no es requerido.
          name: { type: "string", search: true },
          description: { type: "string", search: true },
          is_active: { type: "boolean" },
          ref: { type: "string" },
          search_field: { type: "string", search: true },
          created_by: { type: "string" },
          custom_data: { type: "json" },
          payload: { type: "json" },
          tabla_id: { type: "string", required: true, search: true },
          valores: { type: "json" },
          calculados: { type: "json" },
        },
        options_map: { value: "id", label: "name" },
        hooks: {
          before_create: (ctx, row) => preparar_registro(ctx, row, null),
          before_update: (ctx, _id, patch, existing) => preparar_registro(ctx, patch, existing),
        },
      }),
    ),
  ],
  tables: herr_registros_tables,
  pages: herr_registros_pages,
  menu: [
    {
      id: "herramientas.herr-registros",
      label: "Registros",
      order: 20,
      pageId: "herramientas.herr-registros",
      path: "herr-registros",
      permission: "subject.herramientas.herr-registros.read",
      icon: "fa-list-ol",
    },
    {
      id: "herramientas.herr-registro",
      label: "Capturar registro",
      order: 21,
      pageId: "herramientas.herr-registro",
      path: "herr-registro",
      permission: "subject.herramientas.herr-registros.write",
      icon: "fa-pen-to-square",
    },
  ],
});
