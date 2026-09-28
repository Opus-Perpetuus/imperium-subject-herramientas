import type { TablaSpec } from "./esquema.ts";

/**
 * Índice invertido para buscar en los registros de una tabla: token → ids.
 * Consultas multi-palabra en AND con prefijos (`"reforma 12"` encuentra
 * `"Av. Reforma 128"`); la puntuación combina tokens que casan y recencia.
 */

export type EntradaIndexada = {
  id: string;
  /** Valores, calculados y etiquetas de referencia ya resueltas. */
  texto: string;
  /** ISO; desempata por recencia. */
  updated_at?: string;
};

/** Minúsculas y sin diacríticos (é→e, ñ→n). */
function plegar(texto: string): string {
  return texto.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");
}

/** Minúsculas, sin acentos ni puntuación; lo no alfanumérico separa. */
export function tokenizar(texto: string): string[] {
  if (!texto.trim()) return [];
  return plegar(texto).split(/[^a-z0-9]+/).filter(Boolean);
}

export function construir_indice(entradas: EntradaIndexada[]): Map<string, Set<string>> {
  const indice = new Map<string, Set<string>>();
  for (const entrada of entradas) {
    for (const token of new Set(tokenizar(entrada.texto))) {
      let ids = indice.get(token);
      if (!ids) indice.set(token, (ids = new Set()));
      ids.add(entrada.id);
    }
  }
  return indice;
}

/** Más tokens del documento que empiezan por algún término → mejor. */
function puntuacion(entrada: EntradaIndexada, terminos: string[]): number {
  const tokens = tokenizar(entrada.texto);
  return terminos.reduce((s, t) => s + tokens.filter((tok) => tok.startsWith(t)).length, 0);
}

const recencia = (a: EntradaIndexada, b: EntradaIndexada) =>
  (b.updated_at ?? "").localeCompare(a.updated_at ?? "");

/**
 * Consulta vacía → todos los ids por recencia. Si no, AND de términos por
 * prefijo, ordenados por puntuación y luego recencia.
 */
export function buscar(
  indice: Map<string, Set<string>>,
  consulta: string,
  por_id: Map<string, EntradaIndexada>,
): string[] {
  const terminos = tokenizar(consulta);
  if (!terminos.length) {
    return [...por_id.values()].sort(recencia).map((e) => e.id);
  }
  const por_termino = terminos.map((t) => {
    const ids = new Set<string>();
    for (const [token, docs] of indice) {
      if (token.startsWith(t)) for (const id of docs) ids.add(id);
    }
    return ids;
  });
  if (por_termino.some((ids) => !ids.size)) return [];
  let candidatos = por_termino[0]!;
  for (const ids of por_termino.slice(1)) {
    candidatos = new Set([...candidatos].filter((id) => ids.has(id)));
  }
  return [...candidatos]
    .map((id) => por_id.get(id))
    .filter((e): e is EntradaIndexada => e !== undefined)
    .sort((a, b) => puntuacion(b, terminos) - puntuacion(a, terminos) || recencia(a, b))
    .map((e) => e.id);
}

/** Tipos que no son texto buscable: geo envenenaría el índice con dígitos; foto y ruta guardan ids/URLs. */
const NO_INDEXABLES = new Set(["geo", "foto", "ruta"]);

/**
 * El texto por el que un registro se encuentra. Los campos geo se excluyen:
 * `"19.432600,-99.133200"` se partiría en `19`, `43`, `99` y envenenaría el índice.
 */
export function texto_buscable(
  valores: Record<string, string>,
  extras: Record<string, string> = {},
  spec: TablaSpec | null = null,
): string {
  const excluidos = new Set(
    (spec?.campos ?? []).filter((c) => NO_INDEXABLES.has(c.tipo)).map((c) => c.clave),
  );
  const propios = Object.entries(valores)
    .filter(([clave]) => !excluidos.has(clave))
    .map(([, v]) => v);
  return [...propios, ...Object.values(extras)].filter((v) => v && v.trim()).join(" ");
}
