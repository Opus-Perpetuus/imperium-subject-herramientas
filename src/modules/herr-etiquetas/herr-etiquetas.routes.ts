import { define_crud, define_module, type DomainRow } from "@opus-perpetuus/imperium-core-kit";
import { campo_busqueda } from "../../lib/comun.ts";
import { herr_etiquetas_pages } from "./herr-etiquetas.pages.ts";
import { herr_etiquetas_tables } from "./herr-etiquetas.tables.ts";

export const COLORES_ETIQUETA = ["primario", "ok", "aviso", "peligro", "info", "neutro"] as const;

function preparar(row: DomainRow, existing: DomainRow = {}): DomainRow {
  const m = { ...existing, ...row };
  row.search_field = campo_busqueda(m.name, m.notas);
  return row;
}

export const herr_etiquetas_module = define_module({
  resource: "herr-etiquetas",
  labels: {
    singular: "Etiqueta",
    plural: "Etiquetas",
    read: "Ver etiquetas",
    write: "Editar etiquetas",
  },
  routes: define_crud({
    resource: "herr-etiquetas",
    table: "herr_etiquetas",
    soft_delete: true,
    soft_delete_field: "is_active",
    history: true,
    default_sort: "name:asc",
    id_prefix: "etiq",
    fields: {
      name: { type: "string", required: true, search: true },
      description: { type: "string", search: true },
      is_active: { type: "boolean" },
      ref: { type: "string" },
      search_field: { type: "string", search: true },
      created_by: { type: "string" },
      custom_data: { type: "json" },
      payload: { type: "json" },
      color: {
        type: "string",
        validate: (v) =>
          v == null || v === "" || COLORES_ETIQUETA.includes(v as never) ? null : `Color: ${COLORES_ETIQUETA.join(", ")}`,
      },
      notas: { type: "string", search: true },
    },
    options_map: { value: "id", label: "name" },
    hooks: {
      before_create: (ctx, row) => preparar({ ...row, created_by: ctx.actor, color: row.color || "neutro" }),
      before_update: (_ctx, _id, patch, existing) => {
        delete patch.created_by;
        return preparar(patch, existing);
      },
    },
  }),
  tables: herr_etiquetas_tables,
  pages: herr_etiquetas_pages,
  menu: [
    {
      id: "herramientas.herr-etiquetas",
      label: "Etiquetas",
      order: 52,
      pageId: "herramientas.herr-etiquetas",
      path: "herr-etiquetas",
      permission: "subject.herramientas.herr-etiquetas.read",
      icon: "fa-tags",
    },
  ],
});
