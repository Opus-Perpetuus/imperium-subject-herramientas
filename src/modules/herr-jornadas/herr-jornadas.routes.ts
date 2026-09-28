import { define_crud, define_module, type DomainRow, type KirletCtx } from "@opus-perpetuus/imperium-core-kit";
import { campo_busqueda, fecha_hoy, numero, texto } from "../../lib/comun.ts";
import { ajustes_vehiculo, calcular } from "../../lib/jornadas/jornada.ts";
import { herr_jornadas_flow } from "./herr-jornadas.flow.ts";
import { herr_jornadas_pages } from "./herr-jornadas.pages.ts";
import { herr_jornadas_tables } from "./herr-jornadas.tables.ts";

const vacio_a_null = (v: unknown) => (v === "" ? null : v);

/** Nombre, búsqueda y campos calculados a partir de la fila completa. */
async function derivados(ctx: KirletCtx, fila: DomainRow): Promise<DomainRow> {
  const ajustes = await ajustes_vehiculo(ctx, fila.vehiculo_id);
  const name = `Jornada ${texto(fila.fecha)}`;
  return {
    name,
    search_field: campo_busqueda(name, fila.vehiculo_nombre, fila.estado, fila.notas),
    ...calcular(fila, numero(ajustes?.tanque_litros)),
  };
}

export const herr_jornadas_module = define_module({
  resource: "herr-jornadas",
  labels: {
    singular: "Jornada",
    plural: "Jornadas",
    read: "Ver jornadas",
    write: "Editar jornadas",
  },
  routes: [
    ...herr_jornadas_flow,
    ...define_crud({
      resource: "herr-jornadas",
      table: "herr_jornadas",
      soft_delete: true,
      soft_delete_field: "is_active",
      history: true,
      default_sort: "created_at:desc",
      id_prefix: "jornada",
      fields: {
        name: { type: "string", search: true },
        description: { type: "string", search: true },
        is_active: { type: "boolean" },
        ref: { type: "string" },
        search_field: { type: "string", search: true },
        created_by: { type: "string" },
        custom_data: { type: "json" },
        payload: { type: "json" },
        fecha: { type: "string", search: true },
        hora_inicio: { type: "string" },
        hora_fin: { type: "string" },
        vehiculo_id: { type: "string" },
        vehiculo_nombre: { type: "string", search: true },
        estado: { type: "string" },
        km_inicial: { type: "number", normalize: vacio_a_null },
        km_final: { type: "number", normalize: vacio_a_null },
        km_gps: { type: "number", normalize: vacio_a_null },
        gasolina_inicial: { type: "string" },
        gasolina_final: { type: "string" },
        km_recorridos: { type: "number", normalize: vacio_a_null },
        gasolina_usada: { type: "number", normalize: vacio_a_null },
        rendimiento: { type: "number", normalize: vacio_a_null },
        entregas: { type: "number", normalize: vacio_a_null },
        ingreso: { type: "number", normalize: vacio_a_null },
        gasto_gasolina: { type: "number", normalize: vacio_a_null },
        ganancia_neta: { type: "number", normalize: vacio_a_null },
        por_entrega: { type: "number", normalize: vacio_a_null },
        ruta_id: { type: "string" },
        solo_gps: { type: "boolean" },
        fin_programado: { type: "string" },
        tramos: { type: "json" },
        notas: { type: "string", search: true },
      },
      options_map: { value: "id", label: "name" },
      hooks: {
        before_create: async (ctx: KirletCtx, row: DomainRow) => {
          const fila: DomainRow = {
            ...row,
            fecha: texto(row.fecha) || fecha_hoy(),
            estado: texto(row.estado) || "abierta",
            tramos: row.tramos ?? [],
          };
          return { ...fila, ...(await derivados(ctx, fila)) };
        },
        before_update: async (ctx: KirletCtx, _id: string, patch: DomainRow, existing: DomainRow) => ({
          ...patch,
          ...(await derivados(ctx, { ...existing, ...patch })),
        }),
      },
    }),
  ],
  tables: herr_jornadas_tables,
  pages: herr_jornadas_pages,
  menu: [
    {
      id: "herramientas.herr-jornadas",
      label: "Jornadas",
      order: 10,
      pageId: "herramientas.herr-jornadas",
      path: "herr-jornadas",
      permission: "subject.herramientas.herr-jornadas.read",
      icon: "fa-calendar-day",
    },
    {
      id: "herramientas.herr-jornada",
      label: "Jornada de hoy",
      order: 11,
      pageId: "herramientas.herr-jornada",
      path: "herr-jornada",
      permission: "subject.herramientas.herr-jornadas.read",
      icon: "fa-motorcycle",
    },
    {
      id: "herramientas.herr-liquidacion",
      label: "Liquidación",
      order: 12,
      pageId: "herramientas.herr-liquidacion",
      path: "herr-liquidacion",
      permission: "subject.herramientas.herr-jornadas.read",
      icon: "fa-hand-holding-dollar",
    },
  ],
});
