import { define_routes, type DomainRow, type KirletCtx } from "@opus-perpetuus/imperium-core-kit";
import { falla, fila_o_404, filas_de, numero } from "../../lib/comun.ts";
import { calibracion_de, leer_lectura, litros, litros_efectivos, rendimiento_exacto } from "../../lib/combustible/litros.ts";
import { secciones } from "../../lib/combustible/escala.ts";
import { TANQUES, nombre_tanque } from "../../lib/combustible/tanques.ts";

/**
 * Estado de combustible del vehículo a partir de sus recargas (en orden de
 * fecha): rendimiento exacto entre los dos últimos llenados y litros que
 * quedaron tras la última recarga.
 */
export function resumen_combustible(ajustes: DomainRow, recargas: DomainRow[]) {
  const ultima = recargas[recargas.length - 1] ?? null;
  const llenas = recargas.filter((r) => r.tanque_lleno === true && numero(r.km) != null);
  const [previa, actual] = llenas.slice(-2);
  const rendimiento =
    previa && actual
      ? rendimiento_exacto(numero(previa.km)!, numero(actual.km)!, numero(actual.litros_efectivos) ?? litros_efectivos(actual) ?? 0)
      : null;

  const tanque = numero(ajustes.tanque_litros);
  let estimados = null;
  if (ultima) {
    const lectura = leer_lectura(ultima.nivel_despues);
    if (ultima.tanque_lleno === true && tanque != null) estimados = { litros: tanque, aproximado: false };
    else if (lectura) estimados = litros(lectura, ajustes);
  }

  const marcas = numero(ajustes.marcas) ?? 0;
  const forma = { marcas, divisiones: numero(ajustes.divisiones) ?? 1, aguja_fuera: ajustes.aguja_fuera === true };
  const litros_por_paso = calibracion_de(ajustes);
  return {
    ajustes_id: ajustes.id,
    vehiculo_id: ajustes.vehiculo_id,
    tanque_litros: tanque,
    recargas: recargas.length,
    ultima_recarga: ultima,
    /** km/L entre los dos últimos llenados con odómetro; null si no los hay. */
    rendimiento_exacto: rendimiento,
    /** Litros tras la última recarga (lleno → tanque; si no, lo que marcó el medidor). */
    litros_estimados: estimados,
    calibracion: {
      litros_por_paso,
      secciones: marcas > 0 ? secciones(forma) : 0,
      completa: marcas > 0 && litros_por_paso.length >= secciones(forma),
    },
  };
}

/** Ajustes de reparto de un vehículo externo (id del `vehicle` de subject-vehiculos). */
export async function ajustes_por_vehiculo(ctx: Pick<KirletCtx, "data">, vehiculo_id: string): Promise<DomainRow | null> {
  const fila = await ctx.data.findOne("herr_vehiculos", { vehiculo_id });
  return fila && fila.is_active !== false ? fila : null;
}

export const herr_vehiculos_flow = define_routes({
  "GET /herr-vehiculos/tanques": () => ({
    data: TANQUES.map((m) => ({ ...m, nombre: nombre_tanque(m) })),
    total_elementos: TANQUES.length,
  }),

  "GET /herr-vehiculos/por-vehiculo/:vehiculo_id": async (ctx) => {
    const ajustes = await ajustes_por_vehiculo(ctx, ctx.params.vehiculo_id);
    if (!ajustes) falla(404, "Ese vehículo no tiene ajustes de reparto", "not_found");
    return { data: ajustes };
  },

  "GET /herr-vehiculos/:id/combustible": async (ctx) => {
    const ajustes = await fila_o_404(ctx, "herr_vehiculos", ctx.params.id, "Los ajustes del vehículo");
    const recargas = (await filas_de(ctx, "herr_recargas", { vehiculo_id: String(ajustes.vehiculo_id), is_active: true }))
      .sort((a, b) => Date.parse(String(a.fecha_hora)) - Date.parse(String(b.fecha_hora)));
    return { data: resumen_combustible(ajustes, recargas) };
  },
});
