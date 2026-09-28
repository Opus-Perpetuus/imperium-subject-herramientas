/**
 * Normalización de texto hablado para casar intenciones.
 *
 * Dos niveles: `normalizar_ligero` (minúsculas, sin acentos, solo letras y
 * dígitos) y `normalizar_frase`, que además quita muletillas, expande
 * elisiones («pa'» → «para») y números en palabras («cincuenta» → «50»).
 */

const MULETILLAS = [
  "eh", "ah", "este", "esta", "esto", "o sea", "pues", "bueno",
  "mira", "oye", "a ver", "mmm", "mm", "um", "uh",
  "por favor", "porfa", "porfis", "please",
];

const NUMEROS: Record<string, string> = {
  cero: "0",
  uno: "1", una: "1", un: "1",
  dos: "2", tres: "3", cuatro: "4", cinco: "5", seis: "6", siete: "7",
  ocho: "8", nueve: "9", diez: "10", once: "11", doce: "12", trece: "13",
  catorce: "14", quince: "15", dieciseis: "16", diecisiete: "17",
  dieciocho: "18", diecinueve: "19", veinte: "20", treinta: "30",
  cuarenta: "40", cincuenta: "50", sesenta: "60", setenta: "70",
  ochenta: "80", noventa: "90", cien: "100", ciento: "100",
  doscientos: "200", doscientas: "200", trescientos: "300", mil: "1000",
};

export function sin_acentos(texto: string): string {
  return texto.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/** Minúsculas, sin acentos, solo `a-z0-9` y espacios simples. */
export function normalizar_ligero(texto: string): string {
  return sin_acentos(texto.toLowerCase().trim())
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function expandir_elisiones(s: string): string {
  return s
    .replace(/\bpa'\B/g, "para")
    .replace(/\bpa\b/g, "para")
    .replace(/\bd'\B/g, "de")
    .replace(/\bal'\B/g, "a el")
    .replace(/\bdel'\B/g, "de el")
    .replace(/'/g, " ");
}

function quitar_muletillas(s: string): string {
  let t = ` ${s} `;
  const compuestas = MULETILLAS.filter((m) => m.includes(" ")).sort((a, b) => b.length - a.length);
  for (const m of compuestas) t = t.split(` ${m} `).join(" ");
  const simples = new Set(MULETILLAS.filter((m) => !m.includes(" ")));
  return t
    .trim()
    .split(/\s+/)
    .filter((tok) => tok && !simples.has(tok))
    .join(" ");
}

function expandir_numeros(s: string): string {
  return s
    .split(" ")
    .filter(Boolean)
    .map((tok) => NUMEROS[tok] ?? tok)
    .join(" ");
}

/** Normalización completa: la que ven los sinónimos y el puntuador. */
export function normalizar_frase(texto: string): string {
  let s = sin_acentos(texto.toLowerCase().trim());
  s = expandir_elisiones(s);
  s = s.replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
  s = quitar_muletillas(s);
  s = expandir_numeros(s);
  return s.replace(/\s+/g, " ").trim();
}

/**
 * ¿`frase` aparece en `texto` como palabras completas? No cuenta si la
 * palabra anterior es «no»: así «no contestar» no cae en «contestar».
 */
export function contiene_frase(texto: string, frase: string): boolean {
  if (texto === frase) return true;
  const padded = ` ${texto} `;
  const needle = ` ${frase} `;
  let desde = 0;
  for (;;) {
    const idx = padded.indexOf(needle, desde);
    if (idx < 0) return false;
    const antes = padded.slice(0, idx).trimEnd();
    const previa = antes.slice(antes.lastIndexOf(" ") + 1);
    if (previa !== "no") return true;
    desde = idx + 1;
  }
}
