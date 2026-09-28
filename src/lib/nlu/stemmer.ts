import { normalizar_frase, normalizar_ligero } from "./normalizador.ts";

/**
 * Lematización ligera del español: sufijos verbales y de plural. No es un
 * Snowball completo: no toca palabras cortas y solo recorta si la raíz que
 * queda tiene longitud mínima.
 */

const RAIZ_MINIMA = 3;

const SUFIJOS_VERBALES = [
  "andome", "andote", "andolo", "andola", "andolos", "andolas",
  "iendome", "iendote", "iendolo",
  "amos", "emos", "imos",
  "ando", "iendo", "yendo",
  "aron", "eron", "ieron",
  "aba", "ada", "ado", "ida", "ido",
  "ase", "ese", "ara", "era",
  "aria", "eria",
  "aste", "iste",
  "ar", "er", "ir",
  "an", "en", "es",
].sort((a, b) => b.length - a.length);

const SUFIJOS_PLURAL = ["ces", "es", "s"].sort((a, b) => b.length - a.length);

function quitar_sufijo(palabra: string, sufijos: string[]): string | null {
  for (const suf of sufijos) {
    if (palabra.length > suf.length + RAIZ_MINIMA - 1 && palabra.endsWith(suf)) {
      const raiz = palabra.slice(0, -suf.length);
      if (raiz.length >= RAIZ_MINIMA) return raiz;
    }
  }
  return null;
}

export function raiz(palabra: string): string {
  const w = normalizar_ligero(palabra);
  if (w.length <= RAIZ_MINIMA) return w;
  return quitar_sufijo(w, SUFIJOS_VERBALES) ?? quitar_sufijo(w, SUFIJOS_PLURAL) ?? w;
}

/** `raiz` aplicada a cada palabra de la frase normalizada. */
export function raiz_frase(texto: string): string {
  return normalizar_frase(texto).split(" ").filter(Boolean).map(raiz).join(" ");
}
