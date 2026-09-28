import { define_routes, new_id, now_iso, type DomainRow, type KirletCtx } from "@opus-perpetuus/imperium-core-kit";
import { booleano, campo_busqueda, falla, filas_de, numero, texto } from "../../lib/comun.ts";
import { FRASES_ACTIVACION, contiene_activacion, quitar_activacion } from "../../lib/nlu/bot.ts";
import { intencion_por_id, type Datos } from "../../lib/nlu/intenciones.ts";
import { interpretar, type Interpretacion } from "../../lib/nlu/interprete.ts";
import { UMBRAL_POR_DEFECTO } from "../../lib/nlu/puntuador.ts";
import { alias_pedido, ejecutar_intencion, pedido_a_entregar } from "../../lib/voz/ejecutor.ts";

/**
 * Texto → intención (`interpretar`) → acción sobre Reparto (`ejecutar`).
 * Toda orden queda en la bitácora con lo que se entendió y lo que se contestó.
 */

export type Ajustes = {
  frases_activacion: string[];
  umbral: number;
  intenciones_activas: string[];
  confirmar_antes: boolean;
};

const lista = (v: unknown): string[] =>
  Array.isArray(v) ? v.map(texto).filter(Boolean) : [];

/** El perfil en uso (`es_activa`), o los valores por defecto si no hay ninguno. */
export async function ajustes_activos(ctx: Pick<KirletCtx, "data">): Promise<Ajustes> {
  const filas = await filas_de(ctx, "herr_voz", { is_active: true });
  const perfil = filas.find((f) => f.es_activa === true) ?? null;
  const frases = lista(perfil?.frases_activacion);
  return {
    frases_activacion: frases.length ? frases : FRASES_ACTIVACION,
    umbral: numero(perfil?.umbral) ?? UMBRAL_POR_DEFECTO,
    intenciones_activas: lista(perfil?.intenciones_activas),
    confirmar_antes: perfil ? perfil.confirmar_antes !== false : true,
  };
}

type Entrada = {
  texto: string;
  intencion: string | null;
  confianza: number;
  ambiguo: boolean;
  datos: Datos;
  resultado: Record<string, unknown> | null;
  respuesta: string;
  estado: "interpretado" | "ejecutado" | "pendiente_confirmacion" | "error" | "no_entendido";
};

async function anotar(ctx: KirletCtx, e: Entrada): Promise<DomainRow> {
  const ts = now_iso();
  const name = e.texto.slice(0, 120) || "(sin texto)";
  return ctx.data.insert("herr_voz_bitacora", {
    id: new_id("voz-bit"),
    name,
    description: "",
    is_active: true,
    created_by: ctx.actor,
    search_field: campo_busqueda(name, e.intencion, e.respuesta),
    texto: e.texto,
    intencion: e.intencion,
    confianza: e.confianza,
    ambiguo: e.ambiguo,
    datos: e.datos,
    resultado: e.resultado,
    respuesta: e.respuesta,
    estado: e.estado,
    fecha_hora: ts,
    created_at: ts,
    updated_at: ts,
  });
}

/** Quita la frase de activación y devuelve la orden; vacía si solo saludó. */
function orden_de(texto_crudo: string, ajustes: Ajustes): { orden: string; solo_saludo: boolean } {
  const saluda = contiene_activacion(texto_crudo, ajustes.frases_activacion);
  const orden = saluda ? quitar_activacion(texto_crudo, ajustes.frases_activacion) : texto_crudo;
  return { orden, solo_saludo: saluda && !orden };
}

function interpretar_texto(texto_crudo: string, ajustes: Ajustes): Interpretacion {
  const { orden, solo_saludo } = orden_de(texto_crudo, ajustes);
  if (solo_saludo) {
    return { intencion: null, confianza: 0, ambiguo: false, alternativas: [], datos: {}, respuesta: "Te escucho. ¿Qué hago?" };
  }
  return interpretar(orden, { umbral: ajustes.umbral, activas: ajustes.intenciones_activas });
}

type Cuerpo = {
  texto?: unknown;
  orden?: unknown;
  intencion?: unknown;
  datos?: unknown;
  confirmado?: unknown;
};

const datos_de = (v: unknown): Datos => {
  const out: Datos = {};
  if (v && typeof v === "object" && !Array.isArray(v)) {
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      if (val != null && val !== "") out[k] = String(val);
    }
  }
  return out;
};

export const herr_voz_flow = define_routes({
  "POST /herr-voz/interpretar": async (ctx) => {
    const body = await ctx.body<Cuerpo>();
    const frase = texto(body.texto) || texto(body.orden);
    if (!frase) falla(400, "Escribe la orden", "validation_error");
    const r = interpretar_texto(frase, await ajustes_activos(ctx));
    const estado = r.intencion ? "interpretado" : "no_entendido";
    await anotar(ctx, { texto: frase, ...r, resultado: null, estado });
    return { data: { ...r, estado }, message: r.respuesta };
  },

  "POST /herr-voz/ejecutar": async (ctx) => {
    const body = await ctx.body<Cuerpo>();
    const ajustes = await ajustes_activos(ctx);
    const frase = texto(body.texto) || texto(body.orden);
    let intencion: string;
    let datos: Datos;
    let confianza = 1;
    let ambiguo = false;
    let alternativas: Interpretacion["alternativas"] = [];
    if (frase) {
      const r = interpretar_texto(frase, ajustes);
      if (!r.intencion) {
        await anotar(ctx, { texto: frase, ...r, resultado: null, estado: "no_entendido" });
        return {
          data: { intencion: null, datos: r.datos, alternativas: r.alternativas, resultado: null, respuesta: r.respuesta, estado: "no_entendido" },
          message: r.respuesta,
        };
      }
      intencion = r.intencion;
      datos = { ...r.datos, ...datos_de(body.datos) };
      confianza = r.confianza;
      ambiguo = r.ambiguo;
      alternativas = r.alternativas;
    } else {
      intencion = texto(body.intencion);
      if (!intencion_por_id(intencion)) falla(400, "Escribe la orden o indica una intención válida", "validation_error");
      datos = datos_de(body.datos);
    }
    const def = intencion_por_id(intencion)!;
    const texto_bitacora = frase || `${intencion} ${JSON.stringify(datos)}`;

    // Solo lo que escribe pide confirmación; una consulta se responde y ya.
    if (ajustes.confirmar_antes && def.escribe && !booleano(body.confirmado)) {
      let respuesta = `${def.resumen(datos)} ¿Confirmas?`;
      // «Entregado» se fija al preguntar: el «sí» marca ese pedido aunque la lista cambie.
      const pedido = intencion === "entrega_registrar" && !datos.pedido_id ? await pedido_a_entregar(ctx, datos) : null;
      if (pedido) {
        datos = { ...datos, pedido_id: String(pedido.id) };
        const cobro = datos.cantidad ? ` Recibí ${datos.cantidad} pesos.` : "";
        respuesta = `Marco entregado ${alias_pedido(pedido)}.${cobro} ¿Confirmas?`;
      }
      await anotar(ctx, { texto: texto_bitacora, intencion, confianza, ambiguo, datos, resultado: null, respuesta, estado: "pendiente_confirmacion" });
      return { data: { intencion, datos, alternativas, resultado: null, respuesta, estado: "pendiente_confirmacion" }, message: respuesta };
    }

    const e = await ejecutar_intencion(ctx, intencion, datos);
    await anotar(ctx, { texto: texto_bitacora, intencion, confianza, ambiguo, datos, resultado: e.resultado, respuesta: e.respuesta, estado: e.estado });
    return { data: { intencion, datos, alternativas, resultado: e.resultado, respuesta: e.respuesta, estado: e.estado }, message: e.respuesta };
  },
});
