import {
  SUBTABLE_ELEMENT_SEPARATOR,
  SUBTABLE_MAX_ROWS,
  combine_subtable_values,
  normalize_subtable_rows,
  parse_subtable_path,
  parse_subtable_rows,
  rows_for_path,
  serialize_subtable_rows,
  split_subtable_element,
  subtable_element_id,
  subtable_search_text,
  subtable_summary,
  type SubtablePath,
  type SubtableRefMode,
  type SubtableRow,
} from "@opus-perpetuus/imperium-core-kit";
import type { CampoSpec, TablaSpec, TipoCampo } from "./esquema.ts";
import type { Valor } from "./motor.ts";

/**
 * Subtablas de Herramientas sobre el bloque genérico del kit
 * (`descriptors/subtable.ts`: almacenamiento, rutas, enlaces a una fila y
 * escaneo que agrega). Aquí solo vive lo propio de las tablas: qué tipos de
 * columna caben y cómo se arma el esquema con que se calcula una fila.
 *
 * En las fórmulas del registro:
 * - `{items}` es cuántas filas tiene.
 * - `{items.cantidad}` junta la columna de todas las filas: suma si todo es número, si no la une.
 * - `{items.1.cantidad}`, `{items.primera.cantidad}`, `{items.ultima.cantidad}`: una fila.
 * - `sub_suma("items", {precio} * {cantidad}, {cantidad} > 0)` y las demás `sub_*`
 *   recorren las filas; dentro, `{x}` es la columna de cada fila y `{actual:x}` el registro.
 */

export const MAX_FILAS_SUBTABLA = SUBTABLE_MAX_ROWS;
export const MAX_COLUMNAS_SUBTABLA = 30;
export const SEPARADOR_ELEMENTO = SUBTABLE_ELEMENT_SEPARATOR;

/** Lo que puede ser una columna de subtabla: todo menos fotos, rutas GPS y otra subtabla. */
export const TIPOS_SUBCOLUMNA: ReadonlySet<TipoCampo> = new Set<TipoCampo>([
  "texto",
  "numero",
  "dinero",
  "entero",
  "booleano",
  "fecha",
  "hora",
  "fecha_hora",
  "opcion",
  "nota",
  "nivel",
  "geo",
  "codigo",
  "calculado",
  "referencia",
]);

/** Qué se elige al enlazar la subtabla de otra tabla (el modo del kit, en palabras de la app). */
export const MODOS_REF_SUBTABLA: Record<SubtableRefMode, string> = {
  whole: "La subtabla completa (se elige el registro)",
  element: "Una fila de la subtabla",
};
export type ModoRefSubtabla = SubtableRefMode;

export type FilaSubtabla = SubtableRow;
export type RutaSubtabla = SubtablePath;

export function columnas_de(campo: Pick<CampoSpec, "columnas">): CampoSpec[] {
  return campo.columnas ?? [];
}

export function columna_de(campo: Pick<CampoSpec, "columnas">, clave: string): CampoSpec | undefined {
  return columnas_de(campo).find((c) => c.clave === clave);
}

/** Las filas guardadas (JSON o arreglo); no se modifican (vienen de un caché). */
export function filas_de_subtabla(raw: unknown): readonly FilaSubtabla[] {
  return parse_subtable_rows(raw);
}

export const texto_de_subtabla = serialize_subtable_rows;

/** Lo que llega del formulario → filas guardables, con la regla de captura de cada columna. */
export function normalizar_filas(
  campo: Pick<CampoSpec, "columnas" | "etiqueta">,
  raw: unknown,
  normalizar_celda: (columna: CampoSpec, v: unknown) => string,
): FilaSubtabla[] {
  const reglas = columnas_de(campo).map((c) => ({ key: c.clave, computed: c.tipo === "calculado", campo: c }));
  try {
    return normalize_subtable_rows(raw, reglas, (r, v) => normalizar_celda(r.campo, v));
  } catch (e) {
    if (e instanceof Error && e.message.startsWith("At most")) {
      throw new Error(`«${campo.etiqueta}» admite hasta ${MAX_FILAS_SUBTABLA} filas`);
    }
    throw e;
  }
}

/**
 * El esquema con que se calcula una fila: sus columnas y, detrás, las columnas
 * capturadas del registro (para `{x}` que no es de la fila) y sus valores fijos.
 * Los calculados del registro no entran: se calculan después de la subtabla.
 */
export function spec_de_subtabla(spec: TablaSpec, campo: CampoSpec): TablaSpec {
  const columnas = columnas_de(campo);
  const propias = new Set(columnas.map((c) => c.clave));
  return {
    id: spec.id,
    name: `${spec.name} › ${campo.etiqueta}`,
    campos: [
      ...columnas,
      ...spec.campos.filter((c) => c.tipo !== "calculado" && c.tipo !== "subtabla" && !propias.has(c.clave)),
    ],
    constantes: spec.constantes,
    resumenes: [],
  };
}

function normaliza(s: string): string {
  return s.normalize("NFD").replace(/\p{M}/gu, "").trim().replace(/\s+/g, " ").toLowerCase();
}

/** Una subtabla de la tabla por clave o por nombre (como se escribió en `sub_*`). */
export function subtabla_de(spec: Pick<TablaSpec, "campos">, nombre: string): CampoSpec | undefined {
  const n = normaliza(nombre);
  return (
    spec.campos.find((c) => c.tipo === "subtabla" && c.clave === nombre) ??
    spec.campos.find((c) => c.tipo === "subtabla" && normaliza(c.etiqueta) === n)
  );
}

export const partir_ruta = parse_subtable_path;
export const filas_de_ruta = rows_for_path;
export const juntar = (valores: (Valor | undefined)[]): Valor => combine_subtable_values(valores);

export function partir_elemento(valor: string): { registro: string; fila: string | null } {
  const p = split_subtable_element(valor);
  return { registro: p.record, fila: p.row };
}
export const id_elemento = subtable_element_id;

/** Las filas en una línea para la lista, lo impreso y la búsqueda: «3 filas: Agua × 2 · Pan × 1 · …». */
export function resumen_subtabla(
  campo: CampoSpec,
  filas: readonly FilaSubtabla[],
  celda_presentada: (columna: CampoSpec, raw: string) => string,
  max = 3,
): string {
  const visibles = columnas_de(campo).filter((c) => c.tipo !== "nota");
  const preferidas = visibles.filter((c) => c.en_resumen);
  const usar = (preferidas.length ? preferidas : visibles).slice(0, 3);
  const por_clave = new Map(usar.map((c) => [c.clave, c]));
  return subtable_summary(filas, [...por_clave.keys()], (k, raw) => celda_presentada(por_clave.get(k)!, raw), {
    max,
    one: "fila",
    many: "filas",
  });
}

export const texto_buscable_subtabla = (raw: string): string => subtable_search_text(raw);
