import { define_crud, define_module, type DomainRow, type KirletCtx } from "@opus-perpetuus/imperium-core-kit";
import { campo_busqueda, falla, texto } from "../../lib/comun.ts";
import { nombre_vehiculo } from "../../lib/vehiculos/externo.ts";
import { herr_vehiculos_flow } from "./herr-vehiculos.flow.ts";
import { herr_vehiculos_pages } from "./herr-vehiculos.pages.ts";
import { herr_vehiculos_tables } from "./herr-vehiculos.tables.ts";

export const MEDIDORES = ["ninguno", "barras", "aguja"] as const;

function preparar(row: DomainRow, existing: DomainRow = {}): DomainRow {
  const m = { ...existing, ...row };
  row.search_field = campo_busqueda(m.name, m.vehiculo_id, m.placa, m.medidor);
  return row;
}

/**
 * Sin `name`, el snapshot se resuelve contra subject-vehiculos; sin gateway, queda el id.
 * Unos ajustes borrados del mismo vehículo se reutilizan (mismo id y calibración):
 * `vehiculo_id` es UNIQUE y la fila inactiva sigue en la tabla.
 */
async function preparar_alta(ctx: KirletCtx, row: DomainRow): Promise<DomainRow> {
  const vehiculo_id = texto(row.vehiculo_id);
  const previa = await ctx.data.findOne("herr_vehiculos", { vehiculo_id });
  if (previa && previa.is_active !== false) {
    falla(409, "Ese vehículo ya tiene ajustes de reparto", "conflict");
  }
  const name = texto(row.name) || (await nombre_vehiculo(ctx, vehiculo_id));
  if (!previa) return preparar({ ...row, name, created_by: ctx.actor });
  await ctx.data.delete("herr_vehiculos", { id: String(previa.id) });
  return preparar({ ...previa, ...row, id: previa.id, created_at: previa.created_at, is_active: true, name, created_by: ctx.actor });
}

export const herr_vehiculos_module = define_module({
  resource: "herr-vehiculos",
  labels: {
    singular: "Ajustes de reparto por vehículo",
    plural: "Ajustes de reparto por vehículo",
    read: "Ver ajustes de vehículos",
    write: "Editar ajustes de vehículos",
  },
  routes: [
    ...herr_vehiculos_flow,
    ...define_crud({
      resource: "herr-vehiculos",
      table: "herr_vehiculos",
      soft_delete: true,
      soft_delete_field: "is_active",
      history: true,
      default_sort: "name:asc",
      id_prefix: "vehic",
      fields: {
        // Snapshot del nombre del vehículo externo; se resuelve solo si no viene.
        name: { type: "string", search: true },
        description: { type: "string", search: true },
        is_active: { type: "boolean" },
        ref: { type: "string" },
        search_field: { type: "string", search: true },
        created_by: { type: "string" },
        custom_data: { type: "json" },
        payload: { type: "json" },
        vehiculo_id: { type: "string", required: true, search: true },
        placa: { type: "string", search: true },
        tanque_litros: { type: "number" },
        velocimetro: { type: "boolean" },
        medidor: {
          type: "string",
          validate: (v) =>
            v == null || v === "" || MEDIDORES.includes(v as never) ? null : "Medidor: ninguno, barras o aguja",
        },
        marcas: { type: "number" },
        divisiones: { type: "number" },
        aguja_fuera: { type: "boolean" },
        solo_gps: { type: "boolean" },
        catalogo_tanque_id: { type: "string" },
        litros_por_paso: { type: "json" },
        notas: { type: "string", search: true },
      },
      options_map: { value: "id", label: "name" },
      hooks: {
        before_create: preparar_alta,
        before_update: (_ctx, _id, patch, existing) => {
          delete patch.created_by;
          // La clave no se cambia: en PG chocaría con el UNIQUE y saldría un 500.
          if ("vehiculo_id" in patch) {
            if (texto(patch.vehiculo_id) !== texto(existing.vehiculo_id)) {
              falla(409, "Los ajustes no se pueden mover a otro vehículo", "conflict");
            }
            delete patch.vehiculo_id;
          }
          return preparar(patch, existing);
        },
      },
    }),
  ],
  tables: herr_vehiculos_tables,
  pages: herr_vehiculos_pages,
  menu: [
    {
      id: "herramientas.herr-vehiculos",
      label: "Vehículos (reparto)",
      order: 50,
      pageId: "herramientas.herr-vehiculos",
      path: "herr-vehiculos",
      permission: "subject.herramientas.herr-vehiculos.read",
      icon: "fa-motorcycle",
    },
  ],
});
