/**
 * Similitud de cadenas: Levenshtein normalizado y Jaro-Winkler. Puras y
 * simétricas en [0, 1] (1 = idénticas).
 */

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  let curr = new Array<number>(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const costo = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1]! + 1, prev[j]! + 1, prev[j - 1]! + costo);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[b.length]!;
}

/** 1 − distancia / longitud mayor. Idénticas → 1; una vacía y otra no → 0. */
export function levenshtein_normalizado(a: string, b: string): number {
  if (a === b) return 1;
  if (!a.length || !b.length) return 0;
  return 1 - levenshtein(a, b) / Math.max(a.length, b.length);
}

export function jaro(a: string, b: string): number {
  if (a === b) return 1;
  const ventana = Math.floor(Math.max(a.length, b.length) / 2) - 1;
  if (ventana < 0) return 0;
  const a_ok = new Array<boolean>(a.length).fill(false);
  const b_ok = new Array<boolean>(b.length).fill(false);
  let coincidencias = 0;
  for (let i = 0; i < a.length; i++) {
    const desde = Math.max(0, i - ventana);
    const hasta = Math.min(i + ventana + 1, b.length);
    for (let j = desde; j < hasta; j++) {
      if (b_ok[j] || a[i] !== b[j]) continue;
      a_ok[i] = true;
      b_ok[j] = true;
      coincidencias++;
      break;
    }
  }
  if (!coincidencias) return 0;
  let transposiciones = 0;
  let k = 0;
  for (let i = 0; i < a.length; i++) {
    if (!a_ok[i]) continue;
    while (!b_ok[k]) k++;
    if (a[i] !== b[k]) transposiciones++;
    k++;
  }
  const m = coincidencias;
  return (m / a.length + m / b.length + (m - transposiciones / 2) / m) / 3;
}

function prefijo_comun(a: string, b: string, max: number): number {
  const tope = Math.min(a.length, b.length, max);
  let i = 0;
  while (i < tope && a[i] === b[i]) i++;
  return i;
}

/** Jaro-Winkler: el prefijo común (hasta 4) refuerza el puntaje. */
export function jaro_winkler(a: string, b: string, p = 0.1): number {
  if (a === b) return 1;
  if (!a.length || !b.length) return 0;
  const j = jaro(a, b);
  const puntaje = j + prefijo_comun(a, b, 4) * p * (1 - j);
  return Math.min(1, Math.max(0, puntaje));
}

/** La mejor de las dos medidas. */
export function similitud(a: string, b: string): number {
  return Math.max(levenshtein_normalizado(a, b), jaro_winkler(a, b));
}
