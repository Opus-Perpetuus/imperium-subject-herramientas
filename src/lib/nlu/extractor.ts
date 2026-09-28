import { expandir_numeros, normalizar_frase, normalizar_ligero, sin_acentos } from "./normalizador.ts";

/**
 * Datos sueltos de una orden hablada: cantidad en pesos, hora, número
 * (litros, pedidos, piezas) y nombre (contacto, calle, texto a buscar).
 */
export type DatosExtraidos = {
  cantidad: number | null;
  hora: string | null;
  numero: number | null;
  nombre: string | null;
  /** La orden normalizada, por si el ejecutor necesita el resto. */
  resto: string;
};

const HORA = /\b([01]?\d|2[0-3])[:\s]([0-5]\d)\b|\b([01]?\d|2[0-3])\s*(?:horas?|hrs?)\b|\b(\d{1,2})\s+y\s+(\d{1,2})\b/i;
const NUMERO = /\b(\d+(?:[.,]\d+)?)\s*(?:litros?|l\b|pedidos?|unidades?|piezas?)/i;

/** Prefijos de acción que se recortan antes de tomar un nombre. */
const PREFIJOS_NOMBRE = [
  "llama a", "llamar a", "llama al", "marca a", "marcar a", "marcale a",
  "comunicame con", "hablale a", "ponme con", "conectame con",
  "busca", "buscar", "abre", "abrir",
];

const dos = (n: number) => String(n).padStart(2, "0");

/** Palabras tras las que una cifra es parte del domicilio, no dinero: «calle 5», «número 12». */
const LUGAR = new Set([
  "calle", "avenida", "av", "numero", "num", "colonia", "col", "domicilio", "casa", "interior",
  "privada", "andador", "calzada", "boulevard", "blvd", "esquina",
]);
const MONEDA = /^(?:pesos?|mxn)$/;
const NO_MONETARIA = /^(?:litros?|l|pedidos?|unidades?|piezas?|km|kilometros?)$/;
const CIFRA = /^\d+(?:\.\d+)?$/;

/** La orden en palabras sueltas, con los números compuestos y el decimal y la hora intactos. */
function tokens_de(texto: string): string[] {
  const s = sin_acentos(texto.toLowerCase())
    .replace(/(\d),(\d{3})\b/g, "$1$2")
    .replace(/(\d)[.,](\d{1,2})\b/g, "$1_$2")
    .replace(/(\d):(\d)/g, "$1h$2")
    .replace(/\$/g, " $ ")
    .replace(/[^a-z0-9_$\s]/g, " ")
    .replace(/_/g, ".");
  return expandir_numeros(s.replace(/\s+/g, " ").trim()).split(" ").filter(Boolean);
}

/** Posiciones de la última aparición de `parte` dentro de `tokens`. */
function posiciones(tokens: string[], parte: string[]): Set<number> {
  if (!parte.length) return new Set();
  for (let i = tokens.length - parte.length; i >= 0; i--) {
    if (parte.every((p, k) => tokens[i + k] === p)) return new Set(parte.map((_, k) => i + k));
  }
  return new Set();
}

/**
 * Monto en pesos. Gana la cifra con «pesos» o «$»; si no hay, la primera que
 * no sea número de calle, hora ni cantidad de otra cosa (litros, pedidos).
 * `excluir` es un texto ya reconocido como otro dato (el domicilio): sus
 * cifras no son dinero.
 */
export function extraer_cantidad(texto: string, excluir = ""): number | null {
  const t = tokens_de(texto);
  const fuera = posiciones(t, tokens_de(excluir));
  const cifras = t.flatMap((tok, i) => (CIFRA.test(tok) ? [i] : []));
  const explicita = cifras.find((i) => t[i - 1] === "$" || MONEDA.test(t[i + 1] ?? ""));
  const elegida =
    explicita ??
    cifras.find(
      (i) => !fuera.has(i) && !LUGAR.has(t[i - 1] ?? "") && t[i - 1] !== "las" && !NO_MONETARIA.test(t[i + 1] ?? ""),
    );
  return elegida == null ? null : Number(t[elegida]);
}

function hora_en_palabras(texto: string): string | null {
  const m = /(?:a\s+)?las\s+(\d{1,2})(?:\s+(\d{1,2}))?/.exec(normalizar_frase(texto));
  if (!m) return null;
  const h = Number(m[1]);
  const min = m[2] ? Number(m[2]) : 0;
  return h >= 0 && h <= 23 && min >= 0 && min <= 59 ? `${dos(h)}:${dos(min)}` : null;
}

export function extraer_hora(texto: string): string | null {
  const m = HORA.exec(texto);
  if (!m) return hora_en_palabras(texto);
  if (m[1] && m[2]) return `${dos(Number(m[1]))}:${dos(Number(m[2]))}`;
  if (m[3]) return `${dos(Number(m[3]))}:00`;
  if (m[4] && m[5]) return `${dos(Number(m[4]))}:${dos(Number(m[5]))}`;
  return hora_en_palabras(texto);
}

/** Número con unidad («4.2 litros», «veinte litros»): los dichos en palabras se leen como cifras. */
export function extraer_numero(texto: string): number | null {
  const m = NUMERO.exec(tokens_de(texto).join(" "));
  if (!m) return null;
  const v = Number(m[1]!.replace(",", "."));
  return Number.isFinite(v) ? v : null;
}

export function extraer_nombre(texto: string): string | null {
  const n = normalizar_ligero(texto);
  for (const cruda of PREFIJOS_NOMBRE) {
    const p = normalizar_ligero(cruda);
    if (n.startsWith(`${p} `)) {
      const resto = n.slice(p.length + 1).trim();
      if (resto) return resto;
    }
  }
  // «llama maria» sin «a».
  const m = /(?:llama|llamar|marca|marcar)\s+(.+)/.exec(n);
  const resto = m?.[1]?.trim();
  return resto || null;
}

export function extraer_datos(texto: string, excluir = ""): DatosExtraidos {
  const original = texto.trim();
  if (!original) return { cantidad: null, hora: null, numero: null, nombre: null, resto: "" };
  return {
    cantidad: extraer_cantidad(original, excluir),
    hora: extraer_hora(original),
    numero: extraer_numero(original),
    nombre: extraer_nombre(original),
    resto: normalizar_frase(original),
  };
}
