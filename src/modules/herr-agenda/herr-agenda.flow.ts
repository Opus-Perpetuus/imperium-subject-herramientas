import { define_routes, now_iso, type DomainRow, type KirletCtx } from "@opus-perpetuus/imperium-core-kit";
import { LIMITE_FILAS, falla, fila_o_404, texto } from "../../lib/comun.ts";
import {
  evento_desde,
  fecha_valida,
  hoy_en_zona,
  inicio_fin,
  ordenar_eventos,
  zona_valida,
} from "../../lib/agenda/recordatorio.ts";

/** Zona del evento: `custom_data.tz` si la trae, si no la de por defecto. */
export function zona_de(fila: DomainRow): string {
  const custom = fila.custom_data;
  const tz = custom && typeof custom === "object" ? (custom as Record<string, unknown>).tz : undefined;
  return zona_valida(tz);
}

/** `?desde&hasta` como `AAAA-MM-DD`; sin ellos, hoy en la zona del usuario (`?tz=`). */
function rango_pedido(ctx: KirletCtx): { desde: string; hasta: string } {
  const desde = texto(ctx.query.get("desde")) || hoy_en_zona(zona_valida(ctx.query.get("tz")));
  const hasta = texto(ctx.query.get("hasta")) || desde;
  if (!fecha_valida(desde) || !fecha_valida(hasta)) falla(400, "desde y hasta deben ser fechas AAAA-MM-DD");
  if (hasta < desde) falla(400, "hasta debe ser igual o posterior a desde");
  return { desde, hasta };
}

export async function eventos_en_rango(ctx: KirletCtx, desde: string, hasta: string): Promise<DomainRow[]> {
  const filas = await ctx.data.findMany("herr_agenda", {
    where: { is_active: true, fecha: { gte: desde, lte: hasta } },
    limit: LIMITE_FILAS,
  });
  // El cliente en memoria del kit solo aplica el primer operador del objeto (`gte`); el tope se asegura aquí.
  return ordenar_eventos(filas.filter((e) => texto(e.fecha) <= hasta));
}

export const herr_agenda_flow = define_routes({
  "GET /herr-agenda/rango": async (ctx) => {
    const { desde, hasta } = rango_pedido(ctx);
    const data = await eventos_en_rango(ctx, desde, hasta);
    return { data, total_elementos: data.length };
  },

  /** Avisos pendientes de los eventos del rango, para que el teléfono programe sus alarmas. */
  "GET /herr-agenda/recordatorios": async (ctx) => {
    const { desde, hasta } = rango_pedido(ctx);
    const data = (await eventos_en_rango(ctx, desde, hasta))
      .filter((e) => e.hecho !== true && texto(e.recordatorio_en))
      .map((e) => ({
        evento_id: e.id,
        name: e.name,
        recordatorio_en: e.recordatorio_en,
        alarma: e.alarma === true,
        ...inicio_fin(evento_desde(e), zona_de(e)),
      }))
      .sort((a, b) => texto(a.recordatorio_en).localeCompare(texto(b.recordatorio_en)));
    return { data, total_elementos: data.length };
  },

  "POST /herr-agenda/:id/hecho": async (ctx) => {
    const evento = await fila_o_404(ctx, "herr_agenda", ctx.params.id, "El evento");
    const actualizado = await ctx.data.update(
      "herr_agenda",
      { id: String(evento.id) },
      { hecho: evento.hecho !== true, updated_at: now_iso() },
    );
    return { data: actualizado };
  },
});
