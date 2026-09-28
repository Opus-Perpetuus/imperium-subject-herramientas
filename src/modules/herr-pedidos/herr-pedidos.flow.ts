import { define_routes } from "@opus-perpetuus/imperium-core-kit";
import { catalogo_de } from "../../lib/precios/catalogo.ts";
import { cotizar, lineas_desde } from "../../lib/precios/motor.ts";
import { avanzar_pedido } from "../../lib/reparto/servicios.ts";

export const herr_pedidos_flow = define_routes({
  /** Cotiza sin guardar: lo que la hoja de pedido enseña mientras se arma. */
  "POST /herr-pedidos/cotizar": async (ctx) => {
    const body = await ctx.body<{ lineas?: unknown; promo_id?: unknown }>();
    const { lineas, promo_id } = lineas_desde({ lineas: body.lineas, promo_id: body.promo_id });
    const catalogo = await catalogo_de(ctx);
    return { data: { ...cotizar(lineas, catalogo, promo_id), problemas_catalogo: catalogo.problemas_de_captura } };
  },

  "POST /herr-pedidos/:id/surtir": async (ctx) => ({
    data: await avanzar_pedido(ctx, ctx.params.id!, "surtido"),
  }),

  "POST /herr-pedidos/:id/en-ruta": async (ctx) => ({
    data: await avanzar_pedido(ctx, ctx.params.id!, "en_ruta"),
  }),

  /** Entregado, con hora y `recibido` opcional; el domicilio recuerda la visita. */
  "POST /herr-pedidos/:id/entregar": async (ctx) => {
    const body = (await ctx.body<{ recibido?: unknown }>()) ?? {};
    return { data: await avanzar_pedido(ctx, ctx.params.id!, "entregado", body) };
  },
});
