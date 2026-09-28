import { define_routes, now_iso, type DomainRow, type KirletCtx } from "@opus-perpetuus/imperium-core-kit";
import { falla, fila_o_404, hora_ahora, numero, texto } from "../../lib/comun.ts";
import { estado_de, type Estado } from "../../lib/pedidos/estado.ts";
import { catalogo_de } from "../../lib/precios/catalogo.ts";
import { cotizar, lineas_desde } from "../../lib/precios/motor.ts";

/** Un pedido ya cobrado no vuelve al mostrador: el dinero ya se liquidó. */
async function pedido_abierto(ctx: KirletCtx, id: string): Promise<DomainRow> {
  const pedido = await fila_o_404(ctx, "herr_pedidos", id, "El pedido");
  if (estado_de(pedido) === "cobrado") falla(409, "El pedido ya está cobrado", "conflict");
  return pedido;
}

async function avanzar(ctx: KirletCtx, id: string, estado: Estado, extra: DomainRow = {}): Promise<DomainRow> {
  await pedido_abierto(ctx, id);
  const actualizado = await ctx.data.update("herr_pedidos", { id }, { estado, ...extra, updated_at: now_iso() });
  return actualizado!;
}

export const herr_pedidos_flow = define_routes({
  /** Cotiza sin guardar: lo que la hoja de pedido enseña mientras se arma. */
  "POST /herr-pedidos/cotizar": async (ctx) => {
    const body = await ctx.body<{ lineas?: unknown; promo_id?: unknown }>();
    const { lineas, promo_id } = lineas_desde({ lineas: body.lineas, promo_id: body.promo_id });
    const catalogo = await catalogo_de(ctx);
    return { data: { ...cotizar(lineas, catalogo, promo_id), problemas_catalogo: catalogo.problemas_de_captura } };
  },

  "POST /herr-pedidos/:id/surtir": async (ctx) => ({
    data: await avanzar(ctx, ctx.params.id!, "surtido", { hora_surtido: hora_ahora() }),
  }),

  "POST /herr-pedidos/:id/en-ruta": async (ctx) => ({
    data: await avanzar(ctx, ctx.params.id!, "en_ruta"),
  }),

  /**
   * Entregado, con hora. `recibido` es opcional: entregar y cobrar son dos
   * cosas, y la liquidación mira el efectivo, no el estado. El domicilio
   * recuerda la visita: es lo que hace útil al directorio con el tiempo.
   */
  "POST /herr-pedidos/:id/entregar": async (ctx) => {
    const body = await ctx.body<{ recibido?: unknown }>();
    const pedido = await pedido_abierto(ctx, ctx.params.id!);
    const extra: DomainRow = { hora_entrega: hora_ahora() };
    const recibido = numero(body.recibido);
    if (recibido != null) {
      if (recibido < 0) falla(400, "Lo recibido no puede ser negativo", "validation_error");
      extra.recibido = recibido;
      extra.propina = Math.max(0, recibido - (numero(pedido.cobrar) ?? 0));
    }
    const actualizado = await avanzar(ctx, ctx.params.id!, "entregado", extra);

    const domicilio_id = texto(pedido.domicilio_id);
    if (domicilio_id) {
      const domicilio = await ctx.data.findOne("herr_domicilios", { id: domicilio_id });
      if (domicilio) {
        await ctx.data.update(
          "herr_domicilios",
          { id: domicilio_id },
          { veces: (numero(domicilio.veces) ?? 0) + 1, ultima_entrega: now_iso(), updated_at: now_iso() },
        );
      }
    }
    return { data: actualizado };
  },
});
