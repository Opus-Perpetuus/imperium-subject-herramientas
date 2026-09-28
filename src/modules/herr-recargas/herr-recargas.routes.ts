import {
  define_crud,
  define_module,
  now_iso,
  type DomainRow,
  type KirletCtx,
} from "@opus-perpetuus/imperium-core-kit";
import { campo_busqueda, fecha_hoy, numero, texto } from "../../lib/comun.ts";
import {
  actualizar_litros_por_paso,
  leer_lectura,
  litros_efectivos,
  motivo_gasto,
} from "../../lib/combustible/litros.ts";
import { nombre_vehiculo } from "../../lib/vehiculos/externo.ts";
import { ajustes_por_vehiculo } from "../herr-vehiculos/herr-vehiculos.flow.ts";
import { herr_recargas_pages } from "./herr-recargas.pages.ts";
import { herr_recargas_tables } from "./herr-recargas.tables.ts";

/**
 * Una carga de gasolina de un vehículo externo (`vehiculo_id` = id del
 * `vehicle` de subject-vehiculos). Con importe, es además un gasto de la
 * jornada (fila en `herr_gastos` con id derivado, para corregir en vez de
 * duplicar); con lectura del medidor antes y después, enseña la calibración
 * de los ajustes de reparto del vehículo, si los hay.
 */

const id_gasto = (recarga_id: unknown) => `gasto_recarga_${recarga_id}`;

/** Campos derivados: litros efectivos, `aproximado`, nombre y búsqueda. */
async function preparar(ctx: KirletCtx, row: DomainRow, existing: DomainRow = {}): Promise<DomainRow> {
  const m = { ...existing, ...row };
  const vehiculo_id = texto(m.vehiculo_id);
  const ajustes = vehiculo_id ? await ajustes_por_vehiculo(ctx, vehiculo_id) : null;
  const vehiculo = texto(ajustes?.name) || vehiculo_id;
  const efectivos = litros_efectivos(m);
  row.litros_efectivos = efectivos;
  row.aproximado = efectivos != null && !(numero(m.litros)! > 0);
  const fecha = texto(m.fecha_hora).slice(0, 10) || fecha_hoy();
  if (!texto(m.name)) {
    // Solo aquí se va al gateway: un PATCH con nombre no paga la llamada.
    const nombre = vehiculo_id ? await nombre_vehiculo(ctx, vehiculo_id, ajustes?.name) : "sin vehículo";
    row.name = `Recarga ${fecha} · ${nombre}`;
  }
  row.search_field = campo_busqueda(row.name ?? m.name, vehiculo, vehiculo_id, m.jornada_id, fecha);
  return row;
}

async function crear_gasto(ctx: KirletCtx, recarga: DomainRow): Promise<void> {
  const pesos = numero(recarga.pesos);
  if (pesos == null || pesos <= 0) return;
  const motivo = motivo_gasto(numero(recarga.litros_efectivos));
  const fecha_hora = texto(recarga.fecha_hora);
  const ts = now_iso();
  await ctx.data.insert("herr_gastos", {
    id: id_gasto(recarga.id),
    name: motivo,
    description: "",
    is_active: true,
    created_by: ctx.actor,
    search_field: campo_busqueda(motivo),
    motivo,
    cantidad: pesos,
    fuente: "cobros",
    fecha: fecha_hora.slice(0, 10) || ts.slice(0, 10),
    hora: fecha_hora.slice(11, 16) || ts.slice(11, 16),
    jornada_id: texto(recarga.jornada_id) || null,
    descontado: false,
    recarga_id: recarga.id,
    created_at: ts,
    updated_at: ts,
  });
}

/** Sin ajustes de reparto para el vehículo no hay nada que calibrar: la recarga queda igual. */
async function calibrar(ctx: KirletCtx, recarga: DomainRow): Promise<void> {
  const antes = leer_lectura(recarga.nivel_antes);
  const despues = leer_lectura(recarga.nivel_despues);
  const cargados = numero(recarga.litros_efectivos);
  if (antes?.tipo !== "medidor" || despues?.tipo !== "medidor" || cargados == null) return;
  const ajustes = await ajustes_por_vehiculo(ctx, texto(recarga.vehiculo_id));
  if (!ajustes) return;
  const nueva = actualizar_litros_por_paso(ajustes, antes, despues, cargados);
  if (!nueva) return;
  await ctx.data.update("herr_vehiculos", { id: String(ajustes.id) }, { litros_por_paso: nueva, updated_at: now_iso() });
}

export const herr_recargas_module = define_module({
  resource: "herr-recargas",
  labels: {
    singular: "Recarga de combustible",
    plural: "Recargas de combustible",
    read: "Ver recargas",
    write: "Editar recargas",
  },
  routes: define_crud({
    resource: "herr-recargas",
    table: "herr_recargas",
    soft_delete: true,
    soft_delete_field: "is_active",
    history: true,
    default_sort: "fecha_hora:desc",
    id_prefix: "recarga",
    fields: {
      // Sin `required`: el nombre se rellena solo («Recarga <fecha> · <vehículo>»).
      name: { type: "string", search: true },
      description: { type: "string", search: true },
      is_active: { type: "boolean" },
      ref: { type: "string" },
      search_field: { type: "string", search: true },
      created_by: { type: "string" },
      custom_data: { type: "json" },
      payload: { type: "json" },
      /** Id del `vehicle` de subject-vehiculos. */
      vehiculo_id: { type: "string", search: true },
      fecha_hora: { type: "string" },
      km: { type: "number" },
      pesos: { type: "number" },
      precio_litro: { type: "number" },
      litros: { type: "number" },
      nivel_antes: { type: "string" },
      nivel_despues: { type: "string" },
      tanque_lleno: { type: "boolean" },
      jornada_id: { type: "string", search: true },
      litros_efectivos: { type: "number" },
      aproximado: { type: "boolean" },
    },
    options_map: { value: "id", label: "name" },
    hooks: {
      before_create: (ctx, row) =>
        preparar(ctx, { created_by: ctx.actor, ...row, fecha_hora: row.fecha_hora || now_iso() }),
      before_update: (ctx, _id, patch, existing) => preparar(ctx, patch, existing),
      after_create: async (ctx, row) => {
        await crear_gasto(ctx, row);
        await calibrar(ctx, row);
      },
      after_delete: async (ctx, row) => {
        await ctx.data.delete("herr_gastos", { id: id_gasto(row.id) });
      },
    },
  }),
  tables: herr_recargas_tables,
  pages: herr_recargas_pages,
  menu: [
    {
      id: "herramientas.herr-recargas",
      label: "Recargas",
      order: 53,
      pageId: "herramientas.herr-recargas",
      path: "herr-recargas",
      permission: "subject.herramientas.herr-recargas.read",
      icon: "fa-gas-pump",
    },
  ],
});
