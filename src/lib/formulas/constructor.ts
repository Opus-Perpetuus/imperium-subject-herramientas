import { texto } from "../comun.ts";
import type { TablaSpec } from "./esquema.ts";
import { texto_a_numero } from "./motor.ts";

/**
 * El armador de fórmulas del diseñador: «sumar la Cantidad de Ventas cuyo
 * Producto es el de este registro y cuyo Estado es Pagado» sin escribir la
 * fórmula. Sale una fórmula normal (`sumasi` / `tabla_suma`…) que luego se
 * puede seguir editando a mano para anidar más.
 */

export const QUE_HACER = {
  suma: "Sumar una columna",
  cuenta: "Contar los registros",
  promedio: "Promediar una columna",
  minimo: "El valor más bajo de una columna",
  maximo: "El valor más alto de una columna",
  buscar: "Traer el valor de una columna (el primer registro que cumpla)",
  unir: "Juntar los textos de una columna (separados por coma)",
} as const;

export type QueHacer = keyof typeof QUE_HACER;

export const COMPARADORES = {
  "=": "es igual a",
  "!=": "no es igual a",
  ">": "es mayor que",
  ">=": "es mayor o igual que",
  "<": "es menor que",
  "<=": "es menor o igual que",
  contiene: "contiene",
  vacio: "está vacío",
  lleno: "tiene dato",
} as const;

export type Comparador = keyof typeof COMPARADORES;

/** Condiciones que ofrece el formulario; más (o anidadas) se escriben en la fórmula. */
export const MAX_CONDICIONES = 4;

/** En la fórmula escrita, dónde va lo que arma el constructor: `{Precio} * {?}`. */
export const HUECO = "{?}";

export type Condicion = {
  /** Columna de la tabla de origen. */
  columna: string;
  op: Comparador;
  /** Con qué se compara: un valor escrito… */
  valor: string;
  /** …o una columna del registro que se calcula (gana sobre `valor`). */
  actual: string;
};

export type Pedido = {
  /** Id de la tabla de origen; la propia también vale. */
  tabla: string;
  que: QueHacer;
  columna: string;
  condiciones: Condicion[];
  union: "y" | "o";
};

/** `tabla_id|clave` en los menús de columna: así una lista sirve para todas las tablas. */
export function valor_columna(tabla_id: string, clave: string): string {
  return `${tabla_id}|${clave}`;
}

function partir_columna(v: string): { tabla: string; clave: string } | null {
  const i = v.lastIndexOf("|");
  return i > 0 ? { tabla: v.slice(0, i), clave: v.slice(i + 1) } : null;
}

/** El pedido del formulario, o `null` si no se usó el constructor. */
export function pedido_desde_formulario(body: Record<string, unknown>): Pedido | null {
  const que = texto(body.ext_que);
  if (!que) return null;
  const condiciones: Condicion[] = [];
  for (let n = 1; n <= MAX_CONDICIONES; n++) {
    const columna = texto(body[`ext_c${n}_columna`]);
    if (!columna) continue;
    condiciones.push({
      columna,
      op: (texto(body[`ext_c${n}_op`]) || "=") as Comparador,
      valor: texto(body[`ext_c${n}_valor`]),
      actual: texto(body[`ext_c${n}_actual`]),
    });
  }
  return {
    tabla: texto(body.ext_tabla),
    que: que as QueHacer,
    columna: texto(body.ext_columna),
    condiciones,
    union: texto(body.ext_union) === "o" ? "o" : "y",
  };
}

/** Un valor escrito como literal: número si lo parece, texto entre comillas si no. */
function literal(v: string): string {
  const n = texto_a_numero(v);
  return n !== null ? String(n) : JSON.stringify(v);
}

/**
 * La fórmula (con claves e id de tabla, lista para guardar) o el error que
 * ve la persona. `spec` es la tabla de la columna que se está editando.
 */
export function armar_formula(spec: TablaSpec, tablas: TablaSpec[], pedido: Pedido): { formula: string } | { error: string } {
  if (!Object.hasOwn(QUE_HACER, pedido.que)) return { error: `No sé hacer «${pedido.que}»` };
  const id_origen = pedido.tabla || spec.id;
  const origen = id_origen === spec.id ? spec : tablas.find((t) => t.id === id_origen);
  if (!origen) return { error: "Elige de qué tabla se toman los datos" };
  const de_origen = (v: string, que: string): string | { error: string } => {
    const c = partir_columna(v);
    if (!c) return { error: `Elige ${que}` };
    if (c.tabla !== origen.id) return { error: `${que[0]!.toUpperCase()}${que.slice(1)} tiene que ser de «${origen.name}»` };
    if (c.clave !== "_id" && !origen.campos.some((x) => x.clave === c.clave)) return { error: `«${c.clave}» ya no existe en «${origen.name}»` };
    return `{${c.clave}}`;
  };
  let valor: string | null = null;
  if (pedido.que !== "cuenta") {
    const v = de_origen(pedido.columna, "la columna que se toma");
    if (typeof v !== "string") return v;
    valor = v;
  }
  const partes: string[] = [];
  for (const [i, c] of pedido.condiciones.entries()) {
    const col = de_origen(c.columna, `la columna de la condición ${i + 1}`);
    if (typeof col !== "string") return col;
    if (!Object.hasOwn(COMPARADORES, c.op)) return { error: `Condición ${i + 1}: comparación desconocida «${c.op}»` };
    if (c.op === "vacio") {
      partes.push(`vacio(${col})`);
      continue;
    }
    if (c.op === "lleno") {
      partes.push(`no(vacio(${col}))`);
      continue;
    }
    let otro: string;
    if (c.actual) {
      if (c.actual !== "_id" && !spec.campos.some((x) => x.clave === c.actual) && !spec.constantes.some((x) => x.clave === c.actual)) {
        return { error: `Condición ${i + 1}: «${c.actual}» no es una columna de esta tabla` };
      }
      otro = `{actual:${c.actual}}`;
    } else {
      otro = literal(c.valor);
    }
    partes.push(c.op === "contiene" ? `contiene(${col}, ${otro})` : `${col} ${c.op === "=" ? "==" : c.op} ${otro}`);
  }
  const union = pedido.union === "o" ? " o " : " y ";
  const condicion = partes.length > 1 ? partes.map((p) => `(${p})`).join(union) : partes[0] ?? null;
  if (origen.id === spec.id) {
    const f = { suma: "sumasi", cuenta: "cuentasi", promedio: "promediosi", minimo: "minimosi", maximo: "maximosi", buscar: "buscarsi", unir: "unirsi" }[pedido.que];
    const cond = condicion ?? "1";
    return { formula: pedido.que === "cuenta" ? `${f}(${cond})` : `${f}(${valor}, ${cond})` };
  }
  const args = [JSON.stringify(origen.id), ...(valor ? [valor] : []), ...(condicion ? [condicion] : [])];
  return { formula: `tabla_${pedido.que}(${args.join(", ")})` };
}

/** Todas las columnas de todas las tablas para los menús: «Ventas › Cantidad». */
export function opciones_columnas(spec: TablaSpec, tablas: TablaSpec[], excepto?: string): Array<{ value: string; label: string }> {
  const todas = [spec, ...tablas.filter((t) => t.id !== spec.id)];
  return todas.flatMap((t) =>
    t.campos
      .filter((c) => !(t.id === spec.id && c.clave === excepto))
      .map((c) => ({ value: valor_columna(t.id, c.clave), label: `${t.id === spec.id ? "Esta tabla" : t.name} › ${c.etiqueta}` })),
  );
}
