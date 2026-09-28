/**
 * Normalización de texto hablado para casar intenciones.
 *
 * Dos niveles: `normalizar_ligero` (minúsculas, sin acentos, solo letras y
 * dígitos) y `normalizar_frase`, que además quita muletillas, expande
 * elisiones («pa'» → «para») y números en palabras («doscientos cincuenta» → «250»).
 */

const MULETILLAS = [
  "eh", "ah", "este", "esta", "esto", "o sea", "pues", "bueno",
  "mira", "oye", "a ver", "mmm", "mm", "um", "uh",
  "por favor", "porfa", "porfis", "please",
];

const UNIDADES: Record<string, number> = {
  uno: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9,
};

/** Del 10 al 29: se dicen en una sola palabra. */
const DIECES: Record<string, number> = {
  diez: 10, once: 11, doce: 12, trece: 13, catorce: 14, quince: 15, dieciseis: 16,
  diecisiete: 17, dieciocho: 18, diecinueve: 19, veinte: 20, veintiuno: 21, veintiun: 21,
  veintiuna: 21, veintidos: 22, veintitres: 23, veinticuatro: 24, veinticinco: 25,
  veintiseis: 26, veintisiete: 27, veintiocho: 28, veintinueve: 29,
};

const DECENAS: Record<string, number> = {
  treinta: 30, cuarenta: 40, cincuenta: 50, sesenta: 60, setenta: 70, ochenta: 80, noventa: 90,
};

const CENTENAS: Record<string, number> = {
  cien: 100, ciento: 100, doscientos: 200, doscientas: 200, trescientos: 300, trescientas: 300,
  cuatrocientos: 400, cuatrocientas: 400, quinientos: 500, quinientas: 500, seiscientos: 600,
  seiscientas: 600, setecientos: 700, setecientas: 700, ochocientos: 800, ochocientas: 800,
  novecientos: 900, novecientas: 900,
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

/**
 * Valor de una palabra numérica. «un»/«una» solo cuentan dentro de un número
 * («ciento un», «treinta y una»): sueltos son artículo («anota un pedido»).
 */
function valor_palabra(tok: string, dentro: boolean): number | null {
  if (dentro && (tok === "un" || tok === "una")) return 1;
  return UNIDADES[tok] ?? DIECES[tok] ?? DECENAS[tok] ?? CENTENAS[tok] ?? null;
}

/**
 * Lee un número dicho en palabras desde `i`: «doscientos cincuenta» → 250,
 * «mil quinientos» → 1500, «treinta y cinco» → 35. Cada parte debe ser menor
 * que la anterior; lo que no encaja (una cifra, otra palabra) corta el número.
 */
function leer_numero(tokens: string[], i: number): { valor: number; fin: number } | null {
  if (tokens[i] === "cero") return { valor: 0, fin: i + 1 };
  let miles = 0;
  let resto = 0;
  let tope = 1000;
  let j = i;
  while (j < tokens.length) {
    const tok = tokens[j]!;
    if (tok === "mil" && miles === 0) {
      miles = (resto || 1) * 1000;
      resto = 0;
      tope = 1000;
      j++;
      continue;
    }
    if (tok === "y" && tope === 10 && valor_palabra(tokens[j + 1] ?? "", true) != null) {
      j++;
      continue;
    }
    const v = valor_palabra(tok, j > i);
    if (v == null || v >= tope) break;
    resto += v;
    tope = tok === "cien" ? 1 : v >= 100 ? 100 : v >= 30 ? 10 : 1;
    j++;
  }
  return j > i ? { valor: miles + resto, fin: j } : null;
}

/** Números en palabras a cifras; las cifras y el resto de palabras quedan igual. */
export function expandir_numeros(s: string): string {
  const tokens = s.split(" ").filter(Boolean);
  const out: string[] = [];
  for (let i = 0; i < tokens.length; ) {
    const n = leer_numero(tokens, i);
    if (n) {
      // «veinte punto cinco» → 20.5; la parte decimal se lee como se dice.
      const decimal = tokens[n.fin] === "punto" ? leer_numero(tokens, n.fin + 1) : null;
      out.push(decimal ? `${n.valor}.${decimal.valor}` : String(n.valor));
      i = decimal ? decimal.fin : n.fin;
    } else {
      out.push(tokens[i]!);
      i++;
    }
  }
  return out.join(" ");
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
