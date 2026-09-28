import {
  define_routes,
  sanitize_nox_html,
  type NoxHtmlPurifier,
} from "@opus-perpetuus/imperium-core-kit";
import pkg from "../../../package.json" with { type: "json" };
import { falla, numero } from "../../lib/comun.ts";
import { a_texto, ambito_de, evaluar, type Valor } from "../../lib/formulas/motor.ts";
import { distancia_m, enlace_como_llegar, enlace_ver, geo_uri, punto_valido } from "../../lib/geo/geo.ts";
import { AJUSTES, analizar as analizar_ruta, punto_gps_valido } from "../../lib/rutas/analizador.ts";
import { a_html } from "../../lib/markdown/html.ts";
import { encabezados, etiquetas } from "../../lib/markdown/indice.ts";
import { analizar } from "../../lib/markdown/parser.ts";

/**
 * Servicios sin tabla para otras apps. Lo que aquí se ofrece se declara en
 * `CAPACIDADES` (también lo pinta la página `herramientas.herr-utilidades`).
 */

export type Capacidad = {
  id: string;
  herramienta: string;
  metodo: "GET" | "POST";
  ruta: string;
  entrada: string;
  salida: string;
  descripcion: string;
};

/** Lo que la app ofrece a otras apps: las rutas propias del README, por herramienta. */
export const CAPACIDADES: Capacidad[] = [
  { id: "utilidades.markdown", herramienta: "Utilidades", metodo: "POST", ruta: "/herr-utilidades/markdown", entrada: "{texto, sanear?: boolean = true}", salida: "{html, ast, encabezados: [{nivel, texto, ancla}], etiquetas: string[]}", descripcion: "Markdown → HTML saneado, árbol, índice de encabezados y etiquetas." },
  { id: "utilidades.formula", herramienta: "Utilidades", metodo: "POST", ruta: "/herr-utilidades/formula", entrada: "{formula, valores?: {clave: valor}, filas?: [{clave: valor}]}", salida: "{ok, valor, texto} | {ok: false, error}", descripcion: "Evaluar una fórmula del motor de Tablas ({clave}, funciones, sumasi/cuentasi… sobre `filas`)." },
  { id: "utilidades.geo.distancia", herramienta: "Utilidades", metodo: "POST", ruta: "/herr-utilidades/geo/distancia", entrada: "{desde: {lat, lon}, hasta: {lat, lon}}", salida: "{metros}", descripcion: "Distancia geodésica (haversine) entre dos puntos." },
  { id: "utilidades.geo.enlaces", herramienta: "Utilidades", metodo: "POST", ruta: "/herr-utilidades/geo/enlaces", entrada: "{lat, lon, etiqueta?}", salida: "{ver, como_llegar, geo}", descripcion: "Enlaces a mapas (ver, cómo llegar en moto, geo:) para un punto, sin clave de API." },
  { id: "utilidades.rutas.analizar", herramienta: "Utilidades", metodo: "POST", ruta: "/herr-utilidades/rutas/analizar", entrada: "{puntos: [{t, lat, lon, acc?, spd?}], ajustes?}", salida: "informe {distancia_m, paradas, …}", descripcion: "Analizar una traza GPS: distancia en movimiento, paradas y velocidades." },
  { id: "utilidades.capacidades", herramienta: "Utilidades", metodo: "GET", ruta: "/herr-utilidades/capacidades", entrada: "—", salida: "Capacidad[]", descripcion: "Esta lista." },
  { id: "utilidades.salud", herramienta: "Utilidades", metodo: "GET", ruta: "/herr-utilidades/salud", entrada: "—", salida: "{ok, version}", descripcion: "Comprobar que la app responde y con qué versión." },
  { id: "tablas.plantillas", herramienta: "Tablas personalizadas", metodo: "GET", ruta: "/herr-tablas/plantillas", entrada: "—", salida: "plantillas", descripcion: "Plantillas de tabla listas para usar." },
  { id: "tablas.desde-plantilla", herramienta: "Tablas personalizadas", metodo: "POST", ruta: "/herr-tablas/desde-plantilla", entrada: "{plantilla}", salida: "tabla creada", descripcion: "Crear una tabla a partir de una plantilla." },
  { id: "tablas.resumen", herramienta: "Tablas personalizadas", metodo: "GET", ruta: "/herr-tablas/:id/resumen", entrada: "—", salida: "agregados", descripcion: "Agregados y resúmenes de la tabla." },
  { id: "tablas.cerrar", herramienta: "Tablas personalizadas", metodo: "POST", ruta: "/herr-tablas/:id/cerrar", entrada: "—", salida: "cierre", descripcion: "Cierre: archiva las filas en herr-cierres y vacía la tabla." },
  { id: "tablas.buscar", herramienta: "Tablas personalizadas", metodo: "POST", ruta: "/herr-tablas/:id/buscar", entrada: "{q}", salida: "registros", descripcion: "Búsqueda por prefijos sobre los registros." },
  { id: "reparto.jornada-activa", herramienta: "Reparto a domicilio", metodo: "GET", ruta: "/herr-jornadas/activa", entrada: "—", salida: "jornada | null", descripcion: "Jornada de reparto en curso." },
  { id: "reparto.jornada-iniciar", herramienta: "Reparto a domicilio", metodo: "POST", ruta: "/herr-jornadas/iniciar", entrada: "{vehiculo_id}", salida: "jornada", descripcion: "Iniciar una jornada de reparto." },
  { id: "reparto.jornada-terminar", herramienta: "Reparto a domicilio", metodo: "POST", ruta: "/herr-jornadas/:id/terminar", entrada: "—", salida: "jornada", descripcion: "Terminar la jornada." },
  { id: "reparto.jornada-cambiar-vehiculo", herramienta: "Reparto a domicilio", metodo: "POST", ruta: "/herr-jornadas/:id/cambiar-vehiculo", entrada: "{vehiculo_id}", salida: "jornada", descripcion: "Cambiar el vehículo de la jornada." },
  { id: "reparto.liquidacion", herramienta: "Reparto a domicilio", metodo: "GET", ruta: "/herr-jornadas/:id/liquidacion", entrada: "—", salida: "vista previa", descripcion: "Vista previa de la entrega de cobros." },
  { id: "reparto.liquidar", herramienta: "Reparto a domicilio", metodo: "POST", ruta: "/herr-jornadas/:id/liquidar", entrada: "—", salida: "liquidación", descripcion: "Confirmar la entrega de cobros." },
  { id: "reparto.cotizar", herramienta: "Reparto a domicilio", metodo: "POST", ruta: "/herr-pedidos/cotizar", entrada: "{productos}", salida: "{total}", descripcion: "Precio automático de un pedido desde el catálogo." },
  { id: "reparto.surtir", herramienta: "Reparto a domicilio", metodo: "POST", ruta: "/herr-pedidos/:id/surtir", entrada: "—", salida: "pedido", descripcion: "Marcar el pedido como surtido." },
  { id: "reparto.en-ruta", herramienta: "Reparto a domicilio", metodo: "POST", ruta: "/herr-pedidos/:id/en-ruta", entrada: "—", salida: "pedido", descripcion: "Marcar el pedido en ruta." },
  { id: "reparto.entregar", herramienta: "Reparto a domicilio", metodo: "POST", ruta: "/herr-pedidos/:id/entregar", entrada: "—", salida: "pedido", descripcion: "Marcar el pedido como entregado." },
  { id: "reparto.emparejar-domicilio", herramienta: "Reparto a domicilio", metodo: "POST", ruta: "/herr-domicilios/emparejar", entrada: "{lat, lon}", salida: "domicilio | candidatos", descripcion: "Domicilio más cercano (o candidatos si es ambiguo)." },
  { id: "reparto.tanques", herramienta: "Reparto a domicilio", metodo: "GET", ruta: "/herr-vehiculos/tanques", entrada: "—", salida: "tanques por modelo", descripcion: "Catálogo de tanques por modelo de vehículo." },
  { id: "reparto.ruta-puntos", herramienta: "Reparto a domicilio", metodo: "POST", ruta: "/herr-rutas/:id/puntos", entrada: "{puntos: [{lat, lon, hora}]}", salida: "—", descripcion: "Ingesta de puntos GPS (desde Android)." },
  { id: "reparto.ruta-informe", herramienta: "Reparto a domicilio", metodo: "GET", ruta: "/herr-rutas/:id/informe", entrada: "—", salida: "informe de paradas", descripcion: "Informe de paradas de una ruta." },
  { id: "telefono.activa", herramienta: "Teléfono", metodo: "GET", ruta: "/herr-telefono/activa", entrada: "—", salida: "configuración activa", descripcion: "Reglas vigentes del contestador." },
  { id: "telefono.decidir", herramienta: "Teléfono", metodo: "POST", ruta: "/herr-telefono/decidir", entrada: "{numero}", salida: "{accion}", descripcion: "Qué hacer con una llamada entrante (contestar, rechazar, silenciar)." },
  { id: "telefono.llamadas", herramienta: "Teléfono", metodo: "POST", ruta: "/herr-telefono/llamadas", entrada: "{llamada}", salida: "registro", descripcion: "Registrar una llamada." },
  { id: "voz.interpretar", herramienta: "Asistente de voz", metodo: "POST", ruta: "/herr-voz/interpretar", entrada: "{texto}", salida: "{intencion, datos}", descripcion: "Texto en español → intención + datos." },
  { id: "voz.ejecutar", herramienta: "Asistente de voz", metodo: "POST", ruta: "/herr-voz/ejecutar", entrada: "{intencion, datos}", salida: "resultado", descripcion: "Ejecutar una intención sobre Reparto." },
  { id: "agenda.rango", herramienta: "Agenda", metodo: "GET", ruta: "/herr-agenda/rango", entrada: "?desde&hasta", salida: "eventos", descripcion: "Eventos entre dos fechas." },
  { id: "agenda.recordatorios", herramienta: "Agenda", metodo: "GET", ruta: "/herr-agenda/recordatorios", entrada: "?desde&hasta", salida: "recordatorios", descripcion: "Recordatorios pendientes entre dos fechas." },
];

/**
 * El saneador del kit exige un DOMPurify inyectado; `isomorphic-dompurify` se
 * carga bajo demanda para que su ausencia solo afecte al saneado, no al arranque.
 */
let saneador_cargado: Promise<NoxHtmlPurifier> | null = null;
function saneador(): Promise<NoxHtmlPurifier> {
  saneador_cargado ??= import("isomorphic-dompurify")
    .then((m) => m.default as unknown as NoxHtmlPurifier)
    .catch(() => {
      saneador_cargado = null;
      return falla(503, "El saneador HTML no está instalado", "saneador_no_disponible");
    });
  return saneador_cargado;
}

/** Valores de una fórmula tal como llegan por JSON: número, texto o booleano (1/0). */
function mapa_valores(raw: unknown): Record<string, Valor> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, Valor> = {};
  for (const [clave, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof v === "boolean") out[clave] = v ? 1 : 0;
    else if (typeof v === "number" || typeof v === "string") out[clave] = v;
    else if (v == null) out[clave] = null;
  }
  return out;
}

/** Solo los umbrales numéricos del analizador que vengan; el resto, por defecto. */
function ajustes_de(raw: unknown): Partial<typeof AJUSTES> {
  if (!raw || typeof raw !== "object") return {};
  const out: Record<string, number> = {};
  for (const clave of Object.keys(AJUSTES)) {
    const n = numero((raw as Record<string, unknown>)[clave]);
    if (n !== null) out[clave] = n;
  }
  return out as Partial<typeof AJUSTES>;
}

export const herr_utilidades_flow = define_routes({
  "POST /herr-utilidades/markdown": async (ctx) => {
    const body = await ctx.body<{ texto?: unknown; sanear?: unknown }>();
    if (typeof body.texto !== "string") falla(400, "Falta `texto`", "texto_requerido");
    const ast = analizar(body.texto);
    let html = a_html(ast);
    if (body.sanear !== false) html = sanitize_nox_html(html, await saneador());
    return { data: { html, ast, encabezados: encabezados(ast), etiquetas: etiquetas(ast) } };
  },

  "POST /herr-utilidades/formula": async (ctx) => {
    const body = await ctx.body<{ formula?: unknown; valores?: unknown; filas?: unknown }>();
    if (typeof body.formula !== "string" || !body.formula.trim()) {
      falla(400, "Falta `formula`", "formula_requerida");
    }
    const filas = Array.isArray(body.filas)
      ? body.filas.map((fila) => ambito_de(mapa_valores(fila)))
      : [];
    const resultado = evaluar(body.formula, ambito_de(mapa_valores(body.valores), filas));
    if (!resultado.ok) return { data: { ok: false, error: resultado.error } };
    return { data: { ok: true, valor: resultado.valor, texto: a_texto(resultado.valor) } };
  },

  "POST /herr-utilidades/geo/distancia": async (ctx) => {
    const body = await ctx.body<{ desde?: { lat?: unknown; lon?: unknown }; hasta?: { lat?: unknown; lon?: unknown } }>();
    const desde = punto_valido(body.desde?.lat, body.desde?.lon);
    const hasta = punto_valido(body.hasta?.lat, body.hasta?.lon);
    if (!desde || !hasta) falla(400, "Faltan `desde` y `hasta` con lat/lon válidos", "puntos_invalidos");
    return { data: { metros: distancia_m(desde, hasta) } };
  },

  "POST /herr-utilidades/geo/enlaces": async (ctx) => {
    const body = await ctx.body<{ lat?: unknown; lon?: unknown; etiqueta?: unknown }>();
    const punto = punto_valido(body.lat, body.lon);
    if (!punto) falla(400, "Faltan `lat` y `lon` válidos", "punto_invalido");
    const etiqueta = typeof body.etiqueta === "string" ? body.etiqueta : null;
    return {
      data: {
        ver: enlace_ver(punto),
        como_llegar: enlace_como_llegar(punto),
        geo: geo_uri(punto, etiqueta),
      },
    };
  },

  "POST /herr-utilidades/rutas/analizar": async (ctx) => {
    const body = await ctx.body<{ puntos?: unknown; ajustes?: unknown }>();
    const puntos = Array.isArray(body.puntos)
      ? body.puntos.map(punto_gps_valido).filter((p) => p !== null)
      : [];
    if (!puntos.length) falla(400, "Faltan `puntos` GPS válidos ({t, lat, lon})", "puntos_invalidos");
    const ajustes = { ...AJUSTES, ...ajustes_de(body.ajustes) };
    return { data: analizar_ruta(puntos, ajustes) };
  },

  "GET /herr-utilidades/capacidades": () => ({ data: CAPACIDADES }),

  "GET /herr-utilidades/salud": () => ({ data: { ok: true, version: pkg.version } }),
});
