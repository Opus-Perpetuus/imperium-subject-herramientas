import type { CampoSpec, TipoCampo } from "./esquema.ts";

/**
 * Tipos que, además de capturarse, pueden llenarse solos con una fórmula:
 * un entero que cuenta las filas de una subtabla (`sub_cuenta(…)`), un número
 * que suma una columna de otra tabla (`tabla_suma(…)`)… Con fórmula se portan
 * como un cálculo (no se capturan, se recalculan al leer) sin dejar de ser de
 * su tipo (decimales, unidad, totales).
 */
export const TIPOS_LLENADO_AUTOMATICO: ReadonlySet<TipoCampo> = new Set(["entero", "numero", "dinero"]);

/** Si su valor sale de una fórmula: los «Cálculo» y los de arriba que ya tienen una. */
export function es_calculado(campo: Pick<CampoSpec, "tipo" | "formula"> | null | undefined): boolean {
  if (!campo) return false;
  if (campo.tipo === "calculado") return true;
  const f = campo.formula?.trim();
  return TIPOS_LLENADO_AUTOMATICO.has(campo.tipo) && !!f && f !== "0";
}
