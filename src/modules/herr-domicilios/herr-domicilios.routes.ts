import { define_crud, define_module, type DomainRow } from "@opus-perpetuus/imperium-core-kit";
import { campo_busqueda } from "../../lib/comun.ts";
import { herr_domicilios_flow } from "./herr-domicilios.flow.ts";
import { herr_domicilios_pages } from "./herr-domicilios.pages.ts";
import { herr_domicilios_tables } from "./herr-domicilios.tables.ts";

function preparar(row: DomainRow, existing: DomainRow = {}): DomainRow {
  const m = { ...existing, ...row };
  row.search_field = campo_busqueda(
    m.name, m.calle, m.numero, m.colonia, m.referencia, m.contacto_nombre, m.telefono,
  );
  return row;
}

export const herr_domicilios_module = define_module({
  resource: "herr-domicilios",
  labels: {
    singular: "Domicilio",
    plural: "Domicilios",
    read: "Ver domicilios",
    write: "Editar domicilios",
  },
  routes: [
    ...herr_domicilios_flow,
    ...define_crud({
      resource: "herr-domicilios",
      table: "herr_domicilios",
      soft_delete: true,
      soft_delete_field: "is_active",
      history: true,
      default_sort: "updated_at:desc",
      id_prefix: "domic",
      fields: {
        name: { type: "string", required: true, search: true },
        description: { type: "string", search: true },
        is_active: { type: "boolean" },
        ref: { type: "string" },
        search_field: { type: "string", search: true },
        created_by: { type: "string" },
        custom_data: { type: "json" },
        payload: { type: "json" },
        lat: { type: "number" },
        lon: { type: "number" },
        calle: { type: "string", search: true },
        numero: { type: "string", search: true },
        colonia: { type: "string", search: true },
        referencia: { type: "string", search: true },
        contacto_nombre: { type: "string", search: true },
        telefono: { type: "string", search: true },
        etiquetas: { type: "json" },
        veces: { type: "number" },
        ultima_entrega: { type: "string" },
        notas: { type: "string", search: true },
      },
      options_map: { value: "id", label: "name" },
      hooks: {
        before_create: (ctx, row) =>
          preparar({ ...row, created_by: ctx.actor, veces: row.veces ?? 0, etiquetas: row.etiquetas ?? [] }),
        before_update: (_ctx, _id, patch, existing) => {
          delete patch.created_by;
          return preparar(patch, existing);
        },
      },
    }),
  ],
  tables: herr_domicilios_tables,
  pages: herr_domicilios_pages,
  menu: [
    {
      id: "herramientas.herr-domicilios",
      label: "Domicilios",
      order: 51,
      pageId: "herramientas.herr-domicilios",
      path: "herr-domicilios",
      permission: "subject.herramientas.herr-domicilios.read",
      icon: "fa-location-dot",
    },
  ],
});
