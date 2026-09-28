import { define_routes, new_id, now_iso, type DomainRow, type KirletCtx } from "@opus-perpetuus/imperium-core-kit";
import { campo_busqueda, falla, fila_o_404, filas_de, numero, texto } from "../../lib/comun.ts";
import { enlace_como_llegar, enlace_ver, formato_geo, geo_uri, punto_valido, type Punto } from "../../lib/geo/geo.ts";
import { emparejar } from "../../lib/geo/emparejar.ts";
import { mapear_direccion, rellenar_huecos, type DireccionCruda } from "../../lib/geo/direccion.ts";

/**
 * El directorio por cercanía. El geocodificador inverso no vive aquí: el
 * cliente manda la dirección ya resuelta en `direccion` y esta capa solo
 * rellena huecos sin pisar lo tecleado.
 */

function punto_del_cuerpo(body: { lat?: unknown; lon?: unknown }): Punto {
  const p = punto_valido(numero(body.lat), numero(body.lon));
  if (!p) falla(400, "Se necesitan lat y lon válidas");
  return p;
}

async function directorio(ctx: KirletCtx): Promise<DomainRow[]> {
  return filas_de(ctx, "herr_domicilios", { is_active: true });
}

export const herr_domicilios_flow = define_routes({
  "POST /herr-domicilios/emparejar": async (ctx) => {
    const body = await ctx.body<{ lat?: unknown; lon?: unknown; radio_m?: unknown }>();
    const aqui = punto_del_cuerpo(body);
    const radio = numero(body.radio_m);
    const r = emparejar(aqui, await directorio(ctx), radio != null && radio > 0 ? radio : undefined);
    return { data: { mejor: r.mejor?.fila ?? null, candidatos: r.candidatos, ambiguo: r.ambiguo } };
  },

  /** Mejor coincidencia, o alta nueva con la ubicación y lo que el cliente ya resolvió. */
  "POST /herr-domicilios/aqui-mismo": async (ctx) => {
    const body = await ctx.body<{ lat?: unknown; lon?: unknown; alias?: unknown; direccion?: DireccionCruda | null }>();
    const aqui = punto_del_cuerpo(body);
    const r = emparejar(aqui, await directorio(ctx));
    if (r.mejor) return { data: { fila: r.mejor.fila, creada: false } };

    const relleno = rellenar_huecos(
      { alias: texto(body.alias), calle: "", numero: "", colonia: "" },
      mapear_direccion(body.direccion),
    );
    const name = relleno.alias || formato_geo(aqui);
    const ts = now_iso();
    const fila = await ctx.data.insert("herr_domicilios", {
      id: new_id("domic"),
      name,
      description: "",
      is_active: true,
      created_by: ctx.actor,
      search_field: campo_busqueda(name, relleno.calle, relleno.numero, relleno.colonia),
      lat: aqui.lat,
      lon: aqui.lon,
      calle: relleno.calle,
      numero: relleno.numero,
      colonia: relleno.colonia,
      etiquetas: [],
      veces: 0,
      created_at: ts,
      updated_at: ts,
    });
    return ctx.created({ fila, creada: true });
  },

  "GET /herr-domicilios/:id/mapa": async (ctx) => {
    const fila = await fila_o_404(ctx, "herr_domicilios", ctx.params.id, "El domicilio");
    const p = punto_valido(fila.lat, fila.lon);
    if (!p) falla(409, "El domicilio no tiene coordenadas", "sin_coordenadas");
    return { data: { ver: enlace_ver(p), como_llegar: enlace_como_llegar(p), geo: geo_uri(p, texto(fila.name)) } };
  },

  /** Anota una entrega: sube el contador y sella la fecha. */
  "POST /herr-domicilios/:id/entrega": async (ctx) => {
    const body = await ctx.body<{ en?: unknown }>();
    const fila = await fila_o_404(ctx, "herr_domicilios", ctx.params.id, "El domicilio");
    const en = texto(body.en);
    const ultima_entrega = Number.isFinite(Date.parse(en)) ? en : now_iso();
    const actualizada = await ctx.data.update(
      "herr_domicilios",
      { id: String(fila.id) },
      { veces: (numero(fila.veces) ?? 0) + 1, ultima_entrega, updated_at: now_iso() },
    );
    return { data: actualizada };
  },
});
