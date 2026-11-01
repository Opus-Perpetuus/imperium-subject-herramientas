import type { CampoSpec } from "./esquema.ts";

/**
 * Si su valor sale de una fórmula. Solo el tipo «Cálculo» lleva fórmula: entero,
 * número y dinero siempre se capturan (en 0.17.2 pudieron llevar una; al leer
 * el esquema se descarta y la columna vuelve a capturarse, ver `normalizar_campo`).
 */
export function es_calculado(campo: Pick<CampoSpec, "tipo"> | null | undefined): boolean {
  return campo?.tipo === "calculado";
}
