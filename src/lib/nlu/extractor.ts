import { normalizar_frase, normalizar_ligero } from "./normalizador.ts";

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

const CANTIDAD = /(?:\$\s*)?(\d+(?:[.,]\d{1,2})?)\s*(?:pesos|mxn|\$)?/gi;
const HORA = /\b([01]?\d|2[0-3])[:\s]([0-5]\d)\b|\b([01]?\d|2[0-3])\s*(?:horas?|hrs?)\b|\b(\d{1,2})\s+y\s+(\d{1,2})\b/i;
const NUMERO = /\b(\d+(?:[.,]\d+)?)\s*(?:litros?|l\b|pedidos?|unidades?|piezas?)/i;

/** Prefijos de acción que se recortan antes de tomar un nombre. */
const PREFIJOS_NOMBRE = [
  "llama a", "llamar a", "llama al", "marca a", "marcar a", "marcale a",
  "comunicame con", "hablale a", "ponme con", "conectame con",
  "busca", "buscar", "abre", "abrir",
];

const dos = (n: number) => String(n).padStart(2, "0");

export function extraer_cantidad(texto: string): number | null {
  for (const m of texto.matchAll(CANTIDAD)) {
    const v = Number(m[1]!.replace(",", "."));
    if (Number.isFinite(v)) return v;
  }
  // «cincuenta pesos» ya expandido a dígitos por la normalización.
  const n = normalizar_frase(texto);
  const m = /\b(\d+(?:\.\d+)?)\s*(?:pesos|mxn)?\b/.exec(n);
  if (m) {
    const v = Number(m[1]);
    if (Number.isFinite(v)) return v;
  }
  return null;
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

export function extraer_numero(texto: string): number | null {
  const m = NUMERO.exec(texto);
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

export function extraer_datos(texto: string): DatosExtraidos {
  const original = texto.trim();
  if (!original) return { cantidad: null, hora: null, numero: null, nombre: null, resto: "" };
  return {
    cantidad: extraer_cantidad(original),
    hora: extraer_hora(original),
    numero: extraer_numero(original),
    nombre: extraer_nombre(original),
    resto: normalizar_frase(original),
  };
}
