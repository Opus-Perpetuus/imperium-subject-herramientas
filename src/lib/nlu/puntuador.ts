import { etiqueta_de } from "./intenciones.ts";
import { contiene_frase, normalizar_frase } from "./normalizador.ts";
import { similitud } from "./similitud.ts";
import { SINONIMOS, resolver_sinonimo } from "./sinonimos.ts";
import { raiz_frase } from "./stemmer.ts";

/**
 * Combina señales (frase exacta, raíces, similitud difusa, sinónimo global y
 * acierto previo del registro) en una confianza 0–1. Bajo el umbral no se
 * adivina: se pide aclaración. Dos candidatos casi empatados también.
 */

export const UMBRAL_POR_DEFECTO = 0.55;
/** Diferencia mínima entre los dos mejores para no preguntar. */
const MARGEN_AMBIGUO = 0.08;

export type Candidato = {
  intencion: string;
  confianza: number;
  fuente: "frase" | "raiz" | "difuso" | "sinonimo" | "registro" | "ninguna";
};

export type Puntuacion = {
  mejor: Candidato | null;
  /** true: hay que preguntar en vez de ejecutar. */
  preguntar: boolean;
  /** Ambos mejores superan el umbral y casi empatan. */
  ambiguo: boolean;
  mensaje: string | null;
  candidatos: Candidato[];
};

export type OpcionesPuntuar = {
  umbral?: number;
  /** Intención → peso (0–1) de un acierto previo por palabras clave o regex. */
  aciertos?: Record<string, number>;
  /** Intenciones consideradas (vacío = todas). */
  activas?: string[];
};

const acotar = (v: number) => Math.min(1, Math.max(0, v));

export function puntuar(texto: string, opciones: OpcionesPuntuar = {}): Puntuacion {
  const umbral = opciones.umbral ?? UMBRAL_POR_DEFECTO;
  const aciertos = opciones.aciertos ?? {};
  const activas = opciones.activas ?? [];
  const normalizado = normalizar_frase(texto);
  if (!normalizado) {
    return { mejor: null, preguntar: true, ambiguo: false, mensaje: "No te oí. ¿Puedes repetir?", candidatos: [] };
  }
  const raices = raiz_frase(normalizado);
  const sinonimo = resolver_sinonimo(normalizado, activas);
  const candidatos: Candidato[] = [];

  for (const [intencion, frases] of Object.entries(SINONIMOS)) {
    if (activas.length && !activas.includes(intencion)) continue;
    let mejor = 0;
    let largo = 0;
    let fuente: Candidato["fuente"] = "ninguna";
    for (const cruda of frases) {
      const frase = normalizar_frase(cruda);
      if (!frase) continue;
      const exacta = contiene_frase(normalizado, frase) ? 1 : 0;
      const por_raiz = similitud(raices, raiz_frase(frase));
      const difusa = similitud(normalizado, frase);
      const local = Math.max(exacta, por_raiz * 0.95, difusa * 0.9);
      // A puntaje igual se prefiere la frase más larga.
      const gana = local > mejor + 1e-4 || (local >= mejor - 1e-4 && frase.length > largo);
      if (gana) {
        mejor = local;
        largo = frase.length;
        fuente = exacta >= 1 ? "frase" : por_raiz >= difusa ? "raiz" : "difuso";
      }
    }
    if (sinonimo?.intencion === intencion) {
      const puntos = 0.95 + Math.min(sinonimo.frase.length, 40) / 400;
      if (puntos >= mejor) {
        mejor = Math.min(1, puntos);
        fuente = "sinonimo";
        largo = sinonimo.frase.length;
      }
    }
    const acierto = aciertos[intencion] ?? 0;
    const bono_largo = Math.min(largo, 40) / 200;
    const confianza = acotar(mejor * 0.85 + acierto * 0.15 + bono_largo * 0.05);
    if (mejor > 0.2 || acierto > 0) candidatos.push({ intencion, confianza, fuente });
  }
  for (const [intencion, peso] of Object.entries(aciertos)) {
    if (!candidatos.some((c) => c.intencion === intencion)) {
      candidatos.push({ intencion, confianza: acotar(peso), fuente: "registro" });
    }
  }

  candidatos.sort((a, b) => b.confianza - a.confianza);
  const mejor = candidatos[0] ?? null;
  if (!mejor) {
    return { mejor: null, preguntar: true, ambiguo: false, mensaje: "No pude hacer eso. No reconozco la orden.", candidatos };
  }
  if (mejor.confianza < umbral) {
    return {
      mejor,
      preguntar: true,
      ambiguo: false,
      mensaje: `¿Quisiste decir algo sobre ${etiqueta_de(mejor.intencion)}? No estoy seguro.`,
      candidatos,
    };
  }
  const segundo = candidatos[1];
  if (segundo && mejor.confianza - segundo.confianza < MARGEN_AMBIGUO && segundo.confianza >= umbral) {
    return {
      mejor,
      preguntar: true,
      ambiguo: true,
      mensaje: `¿${etiqueta_de(mejor.intencion)} o ${etiqueta_de(segundo.intencion)}?`,
      candidatos,
    };
  }
  return { mejor, preguntar: false, ambiguo: false, mensaje: null, candidatos };
}
