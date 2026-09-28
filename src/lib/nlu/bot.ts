import { intencion_por_id, type Datos } from "./intenciones.ts";
import { interpretar, type OpcionesInterpretar } from "./interprete.ts";
import { normalizar_ligero } from "./normalizador.ts";

/**
 * Motor de diálogo por reglas: activación → orden → confirmación o elección
 * numerada. Puro: escuchar, hablar y ejecutar viven fuera (la app Android o
 * las rutas HTTP).
 */

export const FRASES_ACTIVACION = ["hola imperium", "oye imperium"];

/** ¿El texto contiene alguna frase de activación? */
export function contiene_activacion(texto: string, frases: string[] = FRASES_ACTIVACION): boolean {
  const n = normalizar_ligero(texto);
  if (!n) return false;
  return frases.some((cruda) => {
    const p = normalizar_ligero(cruda);
    return !!p && (n === p || n.startsWith(`${p} `) || n.endsWith(` ${p}`) || ` ${n} `.includes(` ${p} `));
  });
}

/** Quita la frase de activación del inicio y devuelve la orden que sigue. */
export function quitar_activacion(texto: string, frases: string[] = FRASES_ACTIVACION): string {
  const n = normalizar_ligero(texto);
  const ordenadas = frases.map(normalizar_ligero).filter(Boolean).sort((a, b) => b.length - a.length);
  for (const p of ordenadas) {
    if (n === p) return "";
    if (n.startsWith(`${p} `)) return n.slice(p.length + 1).trim();
  }
  return n;
}

const ORDINALES: Record<string, number> = {
  uno: 1, una: 1, primero: 1, primera: 1,
  dos: 2, segundo: 2, segunda: 2,
  tres: 3, tercero: 3, tercera: 3,
  cuatro: 4, cuarto: 4, cuarta: 4,
  cinco: 5, quinto: 5, quinta: 5,
  seis: 6, sexto: 6, siete: 7, ocho: 8, nueve: 9, diez: 10,
};

/** Respuesta numerada: «2», «dos», «opción 2», «el 2». */
export function numero_de_opcion(texto: string, max: number): number | null {
  const n = normalizar_ligero(texto);
  const digito = /\b(\d+)\b/.exec(n);
  if (digito) {
    const v = Number(digito[1]);
    if (v >= 1 && v <= max) return v;
  }
  const palabras = n.split(" ");
  for (const [palabra, v] of Object.entries(ORDINALES)) {
    if (palabras.includes(palabra) && v >= 1 && v <= max) return v;
  }
  return null;
}

const SI = new Set(["si", "sii", "sip", "claro", "correcto", "exacto", "ese", "esa", "dale", "va", "afirmativo", "ok", "okey", "aja", "simon"]);
const NO = new Set(["no", "nop", "negativo", "otro", "otra", "cancela", "cancelar", "nel", "todavia"]);

/**
 * Sí → true, no → false, no se entendió → null. Palabra por palabra, nunca
 * por prefijo («sitio» contiene «si»). El «no» se mira primero: «no, ese es
 * otro» lleva «ese», que solo sería un sí, y marcaría entregado un pedido
 * que sigue en la moto.
 */
export function respuesta_si_no(texto: string): boolean | null {
  const palabras = normalizar_ligero(texto).split(" ").filter(Boolean);
  if (palabras.some((w) => NO.has(w))) return false;
  if (palabras.some((w) => SI.has(w))) return true;
  return null;
}

export type Opcion = { id: string; etiqueta: string };

export type AccionResuelta = { intencion: string; datos: Datos };

export type EstadoBot =
  | { fase: "inactivo" }
  | { fase: "esperando_orden" }
  | { fase: "esperando_confirmacion"; pendiente: AccionResuelta; pregunta: string; repreguntado?: boolean }
  | { fase: "esperando_opcion"; parcial: AccionResuelta; clave: string; opciones: Opcion[] };

export type PasoBot = {
  estado: EstadoBot;
  /** Texto a decir de inmediato (pregunta, fallo, activación). */
  decir: string | null;
  /** Acción lista para ejecutar; el éxito se locuta después de ejecutarla. */
  ejecutar: AccionResuelta | null;
  fallo: boolean;
};

export type OpcionesBot = OpcionesInterpretar & {
  frases_activacion?: string[];
  /** Pregunta de confirmación para una acción; null = no confirmar. */
  confirmar?: (accion: AccionResuelta) => string | null;
};

const INACTIVO: EstadoBot = { fase: "inactivo" };

function paso(estado: EstadoBot, decir: string | null, ejecutar: AccionResuelta | null = null, fallo = false): PasoBot {
  return { estado, decir, ejecutar, fallo };
}

function resolver(orden: string, opciones: OpcionesBot): PasoBot {
  const r = interpretar(orden, opciones);
  if (!r.intencion || r.ambiguo || !intencion_por_id(r.intencion)) {
    return paso(INACTIVO, r.respuesta, null, true);
  }
  const accion = { intencion: r.intencion, datos: r.datos };
  const pregunta = opciones.confirmar?.(accion) ?? null;
  if (pregunta) return paso({ fase: "esperando_confirmacion", pendiente: accion, pregunta }, pregunta);
  return paso(INACTIVO, null, accion);
}

/** Avanza la máquina con un nuevo enunciado. */
export function avanzar_bot(estado: EstadoBot, texto: string, opciones: OpcionesBot = {}): PasoBot {
  const frases = opciones.frases_activacion ?? FRASES_ACTIVACION;
  const n = normalizar_ligero(texto);
  if (!n) return paso(estado, null);

  switch (estado.fase) {
    case "inactivo": {
      if (!contiene_activacion(texto, frases)) return paso(estado, null);
      const orden = quitar_activacion(texto, frases);
      if (!orden) return paso({ fase: "esperando_orden" }, "Te escucho.");
      return resolver(orden, opciones);
    }
    case "esperando_orden":
      return resolver(n, opciones);
    case "esperando_confirmacion": {
      const r = respuesta_si_no(n);
      if (r === true) return paso(INACTIVO, null, estado.pendiente);
      if (r === false) return paso(INACTIVO, "De acuerdo, no lo hago.");
      // Se repregunta una vez y se abandona: insistir con el casco puesto es
      // peor que dejarlo para la pantalla.
      if (estado.repreguntado) return paso(INACTIVO, "Lo dejo así.");
      return paso({ ...estado, repreguntado: true }, estado.pregunta);
    }
    case "esperando_opcion": {
      const pick = numero_de_opcion(texto, estado.opciones.length);
      if (pick == null) {
        const numeros = estado.opciones.map((_, i) => String(i + 1)).join(" o ");
        return paso(estado, `No entendí el número. Di ${numeros}.`);
      }
      const elegida = estado.opciones[pick - 1]!;
      const accion = { intencion: estado.parcial.intencion, datos: { ...estado.parcial.datos, [estado.clave]: elegida.id } };
      return paso(INACTIVO, null, accion);
    }
  }
}

/** Pregunta numerada para elegir un dato que falta (vehículo, contacto…). */
export function pedir_opcion(parcial: AccionResuelta, clave: string, opciones: Opcion[], pregunta: string): PasoBot {
  const lista = opciones.map((o, i) => `${i + 1}: ${o.etiqueta}.`).join(" ");
  return paso({ fase: "esperando_opcion", parcial, clave, opciones }, `${pregunta} ${lista}`);
}
