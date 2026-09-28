import { define_routes, new_id, now_iso, type DomainRow, type KirletCtx } from "@opus-perpetuus/imperium-core-kit";
import { campo_busqueda, falla, fila_o_404, texto } from "../../lib/comun.ts";
import { analizar, ordenar_por_tiempo, punto_gps_valido, type PuntoGps } from "../../lib/rutas/analizador.ts";
import { DetectorParadas } from "../../lib/rutas/paradas-en-vivo.ts";

/**
 * Ingesta de puntos GPS desde el teléfono y el informe de la ruta. El detector
 * en vivo no guarda estado entre peticiones: se repite sobre todos los puntos
 * (es determinista) y solo se reportan los eventos que disparan los recién
 * llegados.
 */

function puntos_de(ruta: DomainRow): PuntoGps[] {
  return Array.isArray(ruta.puntos) ? (ruta.puntos as PuntoGps[]) : [];
}

async function ruta_o_404(ctx: KirletCtx, id: string): Promise<DomainRow> {
  return fila_o_404(ctx, "herr_rutas", id, "La ruta");
}

async function guardar_informe(ctx: KirletCtx, ruta: DomainRow, extra: DomainRow = {}) {
  const informe = analizar(puntos_de(ruta));
  return ctx.data.update(
    "herr_rutas",
    { id: String(ruta.id) },
    { informe, distancia_m: informe.distancia_m, ...extra, updated_at: now_iso() },
  );
}

export const herr_rutas_flow = define_routes({
  "POST /herr-rutas/iniciar": async (ctx) => {
    const body = await ctx.body<{ jornada_id?: unknown; en?: unknown }>();
    const en = texto(body.en);
    const iniciada = Number.isFinite(Date.parse(en)) ? en : now_iso();
    const name = `Ruta ${iniciada.slice(0, 10)}`;
    const jornada_id = texto(body.jornada_id) || null;
    const ts = now_iso();
    const ruta = await ctx.data.insert("herr_rutas", {
      id: new_id("ruta"),
      name,
      description: "",
      is_active: true,
      created_by: ctx.actor,
      search_field: campo_busqueda(name, jornada_id),
      jornada_id,
      iniciada,
      terminada: null,
      puntos: [],
      distancia_m: 0,
      informe: null,
      created_at: ts,
      updated_at: ts,
    });
    return ctx.created(ruta);
  },

  /** Anexa puntos (idempotente por `t`), recalcula la distancia y avisa de paradas en vivo. */
  "POST /herr-rutas/:id/puntos": async (ctx) => {
    const body = await ctx.body<{ puntos?: unknown }>();
    if (!Array.isArray(body.puntos)) falla(400, "Se necesita un arreglo de puntos");
    const ruta = await ruta_o_404(ctx, ctx.params.id);

    const existentes = puntos_de(ruta);
    const vistos = new Set(existentes.map((p) => p.t));
    const nuevos: PuntoGps[] = [];
    for (const raw of body.puntos) {
      const p = punto_gps_valido(raw);
      if (!p) falla(400, "Cada punto necesita t (ISO), lat y lon válidos");
      if (vistos.has(p.t)) continue;
      vistos.add(p.t);
      nuevos.push(p);
    }
    const nuevos_t = new Set(nuevos.map((p) => p.t));
    const todos = ordenar_por_tiempo([...existentes, ...nuevos]).map(({ ms: _ms, ...p }) => p);

    const detector = new DetectorParadas();
    let parada_iniciada: { lat: number; lon: number; desde: string } | undefined;
    let parada_terminada: { en: string } | undefined;
    for (const p of todos) {
      const evento = detector.punto(p);
      if (!evento || !nuevos_t.has(p.t)) continue;
      if (evento.tipo === "iniciada") {
        parada_iniciada = { lat: evento.lat, lon: evento.lon, desde: evento.desde };
        parada_terminada = undefined;
      } else {
        parada_terminada = { en: p.t };
        parada_iniciada = undefined;
      }
    }

    const distancia_m = analizar(todos).distancia_m;
    await ctx.data.update(
      "herr_rutas",
      { id: String(ruta.id) },
      { puntos: todos, distancia_m, updated_at: now_iso() },
    );
    return {
      data: {
        distancia_m,
        puntos: todos.length,
        nuevos: nuevos.length,
        ...(parada_iniciada ? { parada_iniciada } : {}),
        ...(parada_terminada ? { parada_terminada } : {}),
      },
    };
  },

  "GET /herr-rutas/:id/informe": async (ctx) => {
    const ruta = await ruta_o_404(ctx, ctx.params.id);
    const actualizada = await guardar_informe(ctx, ruta);
    return { data: actualizada?.informe ?? analizar(puntos_de(ruta)) };
  },

  "POST /herr-rutas/:id/terminar": async (ctx) => {
    const body = await ctx.body<{ en?: unknown }>();
    const ruta = await ruta_o_404(ctx, ctx.params.id);
    if (texto(ruta.terminada)) falla(409, "La ruta ya terminó", "ya_terminada");
    const en = texto(body.en);
    const terminada = Number.isFinite(Date.parse(en)) ? en : now_iso();
    return { data: await guardar_informe(ctx, ruta, { terminada }) };
  },
});
