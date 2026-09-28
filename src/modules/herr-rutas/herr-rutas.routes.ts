import { define_crud, define_module, type DomainRow } from "@opus-perpetuus/imperium-core-kit";
import { campo_busqueda, falla } from "../../lib/comun.ts";
import { punto_gps_valido } from "../../lib/rutas/analizador.ts";
import { herr_rutas_flow } from "./herr-rutas.flow.ts";
import { herr_rutas_pages } from "./herr-rutas.pages.ts";
import { herr_rutas_tables } from "./herr-rutas.tables.ts";

function preparar(row: DomainRow, existing: DomainRow = {}): DomainRow {
  if (row.puntos != null && !(Array.isArray(row.puntos) && row.puntos.every((p) => punto_gps_valido(p)))) {
    falla(400, "Cada punto necesita t (ISO), lat y lon válidos");
  }
  const m = { ...existing, ...row };
  row.search_field = campo_busqueda(m.name, m.jornada_id, m.iniciada);
  return row;
}

export const herr_rutas_module = define_module({
  resource: "herr-rutas",
  labels: {
    singular: "Ruta GPS",
    plural: "Rutas GPS",
    read: "Ver rutas",
    write: "Editar rutas",
  },
  routes: [
    ...herr_rutas_flow,
    ...define_crud({
      resource: "herr-rutas",
      table: "herr_rutas",
      soft_delete: true,
      soft_delete_field: "is_active",
      history: true,
      // La traza entera dos veces por cada PATCH no cabe en el historial.
      redact_history: ({ puntos: _puntos, ...r }) => r,
      default_sort: "iniciada:desc",
      id_prefix: "ruta",
      fields: {
        name: { type: "string", required: true, search: true },
        description: { type: "string", search: true },
        is_active: { type: "boolean" },
        ref: { type: "string" },
        search_field: { type: "string", search: true },
        created_by: { type: "string" },
        custom_data: { type: "json" },
        payload: { type: "json" },
        jornada_id: { type: "string", search: true },
        iniciada: { type: "string" },
        terminada: { type: "string" },
        puntos: { type: "json" },
        distancia_m: { type: "number" },
        informe: { type: "json" },
      },
      options_map: { value: "id", label: "name" },
      hooks: {
        before_create: (ctx, row) =>
          preparar({ ...row, created_by: ctx.actor, puntos: row.puntos ?? [], distancia_m: row.distancia_m ?? 0 }),
        before_update: (_ctx, _id, patch, existing) => {
          delete patch.created_by;
          return preparar(patch, existing);
        },
      },
    }),
  ],
  tables: herr_rutas_tables,
  pages: herr_rutas_pages,
  menu: [
    {
      id: "herramientas.herr-rutas",
      label: "Rutas GPS",
      order: 54,
      pageId: "herramientas.herr-rutas",
      path: "herr-rutas",
      permission: "subject.herramientas.herr-rutas.read",
      icon: "fa-route",
    },
  ],
});
