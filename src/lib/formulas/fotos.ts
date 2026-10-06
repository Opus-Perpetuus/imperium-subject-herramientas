/**
 * Una columna «Varias fotos» guarda sus URLs en una sola cadena y sus
 * miniaturas en otra, en el mismo orden. No es `multivalor`: aquí una
 * miniatura vacía ocupa su lugar y dos fotos iguales siguen siendo dos.
 */

export const SEPARADOR = "|";

/** Fotos por registro en una columna «Varias fotos»: el lanzador las manda en un solo cuerpo de 8 MB. */
export const MAX_FOTOS = 10;

export function partir(raw: string | null | undefined): string[] {
  return raw ? raw.split(SEPARADOR).map((v) => v.trim()) : [];
}

export function unir(valores: string[]): string {
  return valores.join(SEPARADOR);
}

/** Las fotos de un valor: las de una columna «Varias fotos» o la única de una «Foto». */
export function lista_de(raw: string | null | undefined): string[] {
  return partir(raw).filter(Boolean);
}

/** «1 foto», «3 fotos» o vacío. */
export function cuantas_son(n: number): string {
  return n ? `${n} ${n === 1 ? "foto" : "fotos"}` : "";
}

export function cuantas(raw: string | null | undefined): string {
  return cuantas_son(lista_de(raw).length);
}
