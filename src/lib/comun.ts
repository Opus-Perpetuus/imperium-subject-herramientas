import {
  KirletHttpError,
  type DomainRow,
  type KirletCtx,
} from "@opus-perpetuus/imperium-core-kit";

/**
 * Helpers compartidos por todas las herramientas. Sin lógica de negocio: solo
 * conversión de tipos, errores HTTP y el campo de búsqueda.
 */

/** Tope de filas que una herramienta lee de golpe (tablas de un solo usuario). */
export const LIMITE_FILAS = 5000;

export function texto(value: unknown): string {
  return value == null ? "" : String(value).trim();
}

/** Número o `null`; acepta coma decimal y texto vacío. */
export function numero(value: unknown): number | null {
  if (value == null || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const n = Number(String(value).trim().replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

export function booleano(value: unknown): boolean {
  return value === true || value === "true" || value === 1 || value === "1";
}

export function falla(status: number, message: string, code = "error"): never {
  throw new KirletHttpError(status, code, message);
}

/** Texto plano en minúsculas y sin acentos para `search_field` y búsquedas. */
export function normalizar(value: unknown): string {
  return texto(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

export function campo_busqueda(...partes: unknown[]): string {
  return partes.map(normalizar).filter(Boolean).join(" ");
}

/** Clave estable a partir de una etiqueta: `Precio por hora` → `precio_por_hora`. */
export function clave_desde_etiqueta(label: string): string {
  return normalizar(label)
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

/** Redondeo a centavos, mitad hacia arriba, como una caja registradora. */
export function centavos(value: number): number {
  return Math.round(value * 100) / 100;
}

export function fecha_hoy(): string {
  return new Date().toISOString().slice(0, 10);
}

/** `HH:mm` local del servidor. */
export function hora_ahora(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export async function filas_de(
  ctx: Pick<KirletCtx, "data">,
  tabla: string,
  where: Record<string, unknown> = {},
): Promise<DomainRow[]> {
  return ctx.data.findMany(tabla, {
    where: where as never,
    limit: LIMITE_FILAS,
  });
}

export async function fila_o_404(
  ctx: Pick<KirletCtx, "data">,
  tabla: string,
  id: string,
  nombre = "El registro",
): Promise<DomainRow> {
  const row = await ctx.data.findOne(tabla, { id });
  if (!row || row.is_active === false) falla(404, `${nombre} no existe`, "not_found");
  return row;
}
