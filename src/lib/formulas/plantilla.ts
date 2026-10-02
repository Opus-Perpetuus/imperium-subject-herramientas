import { normalizar, texto } from "../comun.ts";
import type { TablaSpec } from "./esquema.ts";

/**
 * Plantillas de texto con columnas entre llaves: `{Nombre} · Tel. {Teléfono}`.
 * Se guardan con las claves (renombrar una columna no las rompe) y se enseñan
 * con los nombres. A diferencia de una fórmula no calculan: lo que queda fuera
 * de las llaves es texto tal cual, comillas y signos incluidos.
 */

const LLAVE = /\{([^{}]+)\}/g;

const VACIOS = /\(\s*\)|\[\s*\]/g;

/** Separadores sueltos en las orillas; el guion solo si va aparte, para no comerse el signo de `-50`. */
const ORILLAS = /^(?:[\s·•|,;:/–—]|-(?=\s))+|(?:[\s·•|,;:/–—]|(?<=\s)-)+$/g;

/** Cada `{Nombre}` (sin importar mayúsculas ni acentos) o `{clave}` pasa a `{clave}`; lo que no es columna se reporta. */
export function plantilla_con_claves(spec: TablaSpec, entrada: string): { plantilla: string; desconocidos: string[] } {
  const por_nombre = new Map<string, string>();
  for (const c of spec.campos) {
    por_nombre.set(normalizar(c.etiqueta), c.clave);
    por_nombre.set(c.clave, c.clave);
  }
  const desconocidos: string[] = [];
  const plantilla = texto(entrada).replace(LLAVE, (todo, dentro: string) => {
    const clave = por_nombre.get(dentro.trim()) ?? por_nombre.get(normalizar(dentro));
    if (clave) return `{${clave}}`;
    desconocidos.push(dentro.trim());
    return todo;
  });
  return { plantilla, desconocidos };
}

export function plantilla_con_etiquetas(spec: TablaSpec, plantilla: string | null | undefined): string {
  const etiquetas = new Map(spec.campos.map((c) => [c.clave, c.etiqueta]));
  return texto(plantilla).replace(LLAVE, (todo, clave: string) => (etiquetas.has(clave) ? `{${etiquetas.get(clave)}}` : todo));
}

/** La clave si la plantilla es solo una columna: así se ve elegida en el menú. */
export function columna_unica(plantilla: string | null | undefined): string | null {
  return /^\{([^{}]+)\}$/.exec(texto(plantilla))?.[1] ?? null;
}

/**
 * El texto con los valores puestos. Si ninguna columna trae dato no queda
 * nada («Tel.» solo no dice nada) y lo que dejó un dato vacío se limpia:
 * `{Nombre} ({Apodo})` sin apodo es «Ana», no «Ana ()».
 */
export function rellenar_plantilla(plantilla: string | null | undefined, valores: Record<string, string>): string {
  let llaves = 0;
  let con_dato = false;
  const lleno = texto(plantilla).replace(LLAVE, (_todo, clave: string) => {
    llaves++;
    const valor = texto(valores[clave]);
    if (valor) con_dato = true;
    return valor;
  });
  if (llaves && !con_dato) return "";
  return lleno.replace(VACIOS, "").replace(/\s+/g, " ").replace(ORILLAS, "");
}
