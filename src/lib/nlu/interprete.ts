import { extraer_datos } from "./extractor.ts";
import {
  ETIQUETAS_DATOS,
  casar_intencion,
  etiqueta_de,
  intencion_por_id,
  type Datos,
} from "./intenciones.ts";
import { puntuar, type Candidato } from "./puntuador.ts";

/**
 * Texto → intención + datos. El registro (frases y regex) captura datos
 * estructurados y da un empujón al puntuador; el puntuador decide con
 * sinónimos y similitud. Bajo el umbral no se adivina; si el registro casó de
 * forma exacta, se usa como respaldo para que un empate del puntuador no tire
 * una frase canónica.
 */
export type Interpretacion = {
  intencion: string | null;
  confianza: number;
  ambiguo: boolean;
  alternativas: Array<{ intencion: string; confianza: number }>;
  datos: Datos;
  /** Frase corta para leer en voz alta (pregunta o resumen de lo entendido). */
  respuesta: string;
};

export type OpcionesInterpretar = {
  umbral?: number;
  activas?: string[];
};

/** Datos del extractor (números) como texto, sin los nulos. */
function datos_extraidos(texto: string): Datos {
  const d = extraer_datos(texto);
  const out: Datos = {};
  if (d.cantidad != null) out.cantidad = String(d.cantidad);
  if (d.hora) out.hora = d.hora;
  if (d.numero != null) out.numero = String(d.numero);
  if (d.nombre) out.nombre = d.nombre;
  return out;
}

/** Alinea los nombres del extractor con los que espera cada intención. */
function alinear(intencion: string, datos: Datos): Datos {
  const out = { ...datos };
  if (intencion === "llamar" && !out.contacto && out.nombre) out.contacto = out.nombre;
  if (intencion === "buscar" && !out.busqueda && out.nombre) out.busqueda = out.nombre;
  return out;
}

const alternativas_de = (candidatos: Candidato[], elegida: string | null) =>
  candidatos
    .filter((c) => c.intencion !== elegida)
    .slice(0, 3)
    .map((c) => ({ intencion: c.intencion, confianza: Number(c.confianza.toFixed(3)) }));

export function interpretar(texto: string, opciones: OpcionesInterpretar = {}): Interpretacion {
  const activas = opciones.activas ?? [];
  const registro = casar_intencion(texto, activas);
  const aciertos = registro ? { [registro.intencion]: 1 } : {};
  const p = puntuar(texto, { umbral: opciones.umbral, aciertos, activas });

  let elegida: string | null = null;
  let confianza = 0;
  if (p.mejor && !p.preguntar && intencion_por_id(p.mejor.intencion)) {
    elegida = p.mejor.intencion;
    confianza = p.mejor.confianza;
  } else if (registro) {
    elegida = registro.intencion;
    confianza = p.candidatos.find((c) => c.intencion === registro.intencion)?.confianza ?? 1;
  }

  // Ambiguo o bajo el umbral: sin intención; las candidatas van en alternativas.
  if (!elegida) {
    return {
      intencion: null,
      confianza: Number((p.mejor?.confianza ?? 0).toFixed(3)),
      ambiguo: p.ambiguo,
      alternativas: alternativas_de(p.candidatos, null),
      datos: {},
      respuesta: p.mensaje ?? "No pude hacer eso. No reconozco la orden.",
    };
  }
  const datos = alinear(elegida, {
    ...datos_extraidos(texto),
    ...(registro?.intencion === elegida ? registro.datos : {}),
  });
  const falta = (intencion_por_id(elegida)?.requiere ?? []).find((clave) => !datos[clave]);
  if (falta) {
    return {
      intencion: null,
      confianza: Number(confianza.toFixed(3)),
      ambiguo: false,
      alternativas: alternativas_de(p.candidatos, null),
      datos,
      respuesta: `No pude hacer eso. Falta ${ETIQUETAS_DATOS[falta] ?? falta}.`,
    };
  }
  return {
    intencion: elegida,
    confianza: Number(confianza.toFixed(3)),
    ambiguo: false,
    alternativas: alternativas_de(p.candidatos, elegida),
    datos,
    respuesta: `Entendí: ${etiqueta_de(elegida)}.`,
  };
}
