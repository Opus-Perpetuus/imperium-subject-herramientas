/**
 * Varios valores en un campo de una sola cadena (referencias y opciones con
 * `multiple`). La barra vertical y no la coma: los ids nunca la contienen y la
 * coma sí aparece en texto escrito por personas.
 */
export const SEPARADOR = "|";

export function parsear(raw: string | null | undefined): string[] {
  if (!raw) return [];
  return [...new Set(raw.split(SEPARADOR).map((v) => v.trim()).filter(Boolean))];
}

export function formatear(valores: string[]): string {
  return [...new Set(valores.map((v) => v.trim()).filter(Boolean))].join(SEPARADOR);
}

export function alternar(raw: string | null | undefined, valor: string): string {
  const actuales = parsear(raw);
  return formatear(
    actuales.includes(valor) ? actuales.filter((v) => v !== valor) : [...actuales, valor],
  );
}
