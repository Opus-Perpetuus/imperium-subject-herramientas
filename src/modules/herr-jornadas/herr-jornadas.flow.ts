import { define_routes } from "@opus-perpetuus/imperium-core-kit";
import { falla } from "../../lib/comun.ts";
import {
  cambiar_vehiculo,
  iniciar_jornada,
  jornada_activa,
  liquidar,
  terminar_jornada,
  vista_liquidacion,
  type CierreJornada,
  type InicioJornada,
} from "../../lib/reparto/servicios.ts";

export const herr_jornadas_flow = define_routes({
  "GET /herr-jornadas/activa": async (ctx) => {
    const activa = await jornada_activa(ctx);
    if (!activa) falla(404, "No hay una jornada abierta", "not_found");
    return { data: activa };
  },

  "POST /herr-jornadas/iniciar": async (ctx) => ctx.created(await iniciar_jornada(ctx, (await ctx.body<InicioJornada>()) ?? {})),

  /** Cierra la jornada y entrega el cobro: `liquidacion` trae el resumen y el sello. */
  "POST /herr-jornadas/:id/terminar": async (ctx) => {
    const r = await terminar_jornada(ctx, ctx.params.id!, (await ctx.body<CierreJornada>()) ?? {});
    return { data: r.jornada, liquidacion: r.liquidacion };
  },

  "POST /herr-jornadas/:id/cambiar-vehiculo": async (ctx) => {
    const body = (await ctx.body<{ vehiculo_id?: unknown; vehiculo_nombre?: unknown; km_inicial?: unknown; km_final?: unknown }>()) ?? {};
    return {
      data: await cambiar_vehiculo(ctx, ctx.params.id!, {
        vehiculo_id: body.vehiculo_id,
        vehiculo_nombre: body.vehiculo_nombre,
        km_final_tramo: body.km_final,
        km_inicial: body.km_inicial,
      }),
    };
  },

  "GET /herr-jornadas/:id/liquidacion": async (ctx) => ({ data: await vista_liquidacion(ctx, ctx.params.id!) }),

  "POST /herr-jornadas/:id/liquidar": async (ctx) => {
    const body = (await ctx.body<{ devolver_cambio?: unknown }>()) ?? {};
    return { data: await liquidar(ctx, ctx.params.id!, body) };
  },
});
