import { numero, texto } from "../comun.ts";
import type { CampoSpec } from "./esquema.ts";
import { texto_a_numero } from "./motor.ts";

/**
 * Reglas al escanear: «cuando se lee este código (o un código de esta tabla),
 * haz esto con una cantidad en tal registro». Viven en la tabla desde la que
 * se escanea y se aplican con el registro abierto o desde «Ver tabla».
 * Para sumar otra acción o destino basta una entrada aquí y su caso en
 * `herr-registros.reglas.ts`.
 */

export const ACCIONES_REGLA = {
  sumar: "Sumar la cantidad",
  restar: "Restar la cantidad",
  poner: "Poner la cantidad (reemplaza)",
} as const;
export type AccionRegla = keyof typeof ACCIONES_REGLA;

export const DESTINOS_REGLA = {
  actual: "El registro abierto",
  padre: "El registro al que apunta un enlace del registro abierto",
  nuevo_padre: "Un registro nuevo en la tabla a la que apunta un enlace",
  nuevo: "Un registro nuevo en otra tabla",
  existente_o_nuevo: "El registro de otra tabla que ya tenga ese código; si no hay, uno nuevo",
} as const;
export type DestinoRegla = keyof typeof DESTINOS_REGLA;

/** Destinos que necesitan un registro abierto. */
export const DESTINOS_CON_REGISTRO: ReadonlySet<DestinoRegla> = new Set(["actual", "padre"]);
/** Destinos cuya tabla sale de un enlace de esta tabla. */
export const DESTINOS_POR_ENLACE: ReadonlySet<DestinoRegla> = new Set(["padre", "nuevo_padre"]);
/** Destinos que crean (o pueden crear) un registro. */
export const DESTINOS_QUE_CREAN: ReadonlySet<DestinoRegla> = new Set(["nuevo_padre", "nuevo", "existente_o_nuevo"]);

export const TIPOS_CANTIDAD: ReadonlySet<string> = new Set(["numero", "entero", "dinero"]);
/** Dónde puede anotarse el código (o el registro de origen) en un registro creado. */
export const TIPOS_CODIGO_REGLA: ReadonlySet<string> = new Set(["codigo", "texto", "referencia"]);

export type ReglaEscaneo = {
  id: string;
  nombre: string;
  /** Qué códigos: vacío = cualquiera; `*` es comodín (`CAJA-*`). Sin distinguir mayúsculas. */
  codigo: string;
  /** El código debe ser de un registro de esta tabla (su «Código» o su texto). */
  tabla_origen: string | null;
  destino: DestinoRegla;
  /** Clave del enlace de esta tabla (destinos «padre» y «nuevo_padre»). */
  enlace: string | null;
  /** Tabla de los destinos «nuevo» y «existente_o_nuevo». */
  tabla_destino: string | null;
  accion: AccionRegla;
  /** Columna numérica del registro destino. */
  columna: string;
  cantidad: number;
  /** Columna numérica del registro de origen que multiplica la cantidad (p. ej. «piezas por caja»). */
  cantidad_de: string | null;
  /** En el destino: dónde va el código (o el registro de origen, si es un enlace); en «existente_o_nuevo», por dónde se busca. */
  columna_codigo: string | null;
  /** En un registro creado: el enlace que apunta al registro abierto. */
  enlace_actual: string | null;
};

const es_accion = (v: string): v is AccionRegla => Object.hasOwn(ACCIONES_REGLA, v);
const es_destino = (v: string): v is DestinoRegla => Object.hasOwn(DESTINOS_REGLA, v);
const o_null = (v: unknown) => texto(v) || null;

export const MAX_REGLAS = 30;

export function normalizar_regla(x: unknown): ReglaEscaneo | null {
  if (!x || typeof x !== "object" || Array.isArray(x)) return null;
  const o = x as Record<string, unknown>;
  const accion = texto(o.accion);
  const destino = texto(o.destino);
  const columna = texto(o.columna);
  const cantidad = numero(o.cantidad);
  if (!texto(o.id) || !es_accion(accion) || !es_destino(destino) || !columna || cantidad === null) return null;
  return {
    id: texto(o.id),
    nombre: texto(o.nombre).slice(0, 120),
    codigo: texto(o.codigo).slice(0, 200),
    tabla_origen: o_null(o.tabla_origen),
    destino,
    enlace: o_null(o.enlace),
    tabla_destino: o_null(o.tabla_destino),
    accion,
    columna,
    cantidad,
    cantidad_de: o_null(o.cantidad_de),
    columna_codigo: o_null(o.columna_codigo),
    enlace_actual: o_null(o.enlace_actual),
  };
}

export function normalizar_reglas(x: unknown): ReglaEscaneo[] {
  let lista = x;
  if (typeof x === "string") {
    try {
      lista = JSON.parse(x);
    } catch {
      return [];
    }
  }
  return Array.isArray(lista) ? lista.map(normalizar_regla).filter((r) => r !== null).slice(0, MAX_REGLAS) : [];
}

/** Si el código leído cumple el patrón de la regla (vacío = cualquiera; `*` = lo que sea). */
export function patron_coincide(patron: string, codigo: string): boolean {
  const p = patron.trim();
  const c = codigo.trim();
  if (!c) return false;
  if (!p) return true;
  const re = new RegExp(`^${p.split("*").map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join(".*")}$`, "i");
  return re.test(c);
}

/** El valor nuevo de la columna: suma, resta o reemplaza; vacío cuenta como cero. */
export function aplicar_cantidad(actual: string, accion: AccionRegla, cantidad: number): string {
  const base = texto_a_numero(actual) ?? 0;
  const r = accion === "sumar" ? base + cantidad : accion === "restar" ? base - cantidad : cantidad;
  return String(Math.round(r * 1e6) / 1e6);
}

/** Cómo se dice lo que hizo la regla: «+12 Botellas», «−3 Piezas», «Existencia = 5». */
export function describir_cambio(accion: AccionRegla, cantidad: number, etiqueta: string): string {
  if (accion === "poner") return `${etiqueta} = ${cantidad}`;
  return `${accion === "sumar" ? "+" : "−"}${cantidad} ${etiqueta}`;
}

/** Las tablas que una regla toca, para validar sus columnas contra cada una. */
export type TablasDeRegla = {
  actual: { id: string; campos: CampoSpec[] };
  /** Esquema de otra tabla por id (activa), o `null` si no existe. */
  tabla: (id: string) => { id: string; name: string; campos: CampoSpec[] } | null;
};

/** La tabla destino de una regla (sin validarla aún). */
export function tabla_destino_de(regla: Pick<ReglaEscaneo, "destino" | "enlace" | "tabla_destino">, t: TablasDeRegla) {
  if (regla.destino === "actual") return t.actual;
  if (DESTINOS_POR_ENLACE.has(regla.destino)) {
    const enlace = t.actual.campos.find((c) => c.clave === regla.enlace && c.tipo === "referencia");
    return enlace?.tabla_ref_id ? t.tabla(enlace.tabla_ref_id) : null;
  }
  return regla.tabla_destino ? t.tabla(regla.tabla_destino) : null;
}

/**
 * Lo que manda el diseñador. Las columnas llegan como `<tabla>.<clave>` (el
 * menú las lista de todas las tablas) y aquí se comprueba que sean de la tabla
 * que corresponde a cada parte de la regla.
 */
export function regla_desde_formulario(
  body: Record<string, unknown>,
  t: TablasDeRegla,
  id: string,
): { regla: ReglaEscaneo } | { error: string } {
  const destino = texto(body.destino);
  const accion = texto(body.accion) || "sumar";
  if (!es_destino(destino)) return { error: "Elige a qué registro va" };
  if (!es_accion(accion)) return { error: "Esa acción no existe" };
  const cantidad = numero(body.cantidad);
  if (cantidad === null) return { error: "Escribe la cantidad" };
  const enlace = DESTINOS_POR_ENLACE.has(destino) ? texto(body.enlace) : "";
  if (DESTINOS_POR_ENLACE.has(destino) && !t.actual.campos.some((c) => c.clave === enlace && c.tipo === "referencia" && c.tabla_ref_id)) {
    return { error: "Elige el enlace de esta tabla que apunta a la tabla padre" };
  }
  const tabla_destino = destino === "nuevo" || destino === "existente_o_nuevo" ? texto(body.tabla_destino) : "";
  const borrador = { destino, enlace: enlace || null, tabla_destino: tabla_destino || null };
  const dest = tabla_destino_de(borrador, t);
  if (!dest) return { error: "Elige la tabla donde se anota" };

  const columna_en = (raw: unknown, tabla_id: string): CampoSpec | null | "otra" => {
    const v = texto(raw);
    if (!v) return null;
    const [tid, clave] = v.includes(".") ? [v.slice(0, v.indexOf(".")), v.slice(v.indexOf(".") + 1)] : [tabla_id, v];
    if (tid !== tabla_id) return "otra";
    const tabla = tabla_id === t.actual.id ? t.actual : t.tabla(tabla_id);
    return tabla?.campos.find((c) => c.clave === clave) ?? "otra";
  };

  const columna = columna_en(body.columna, dest.id);
  if (!columna || columna === "otra" || !TIPOS_CANTIDAD.has(columna.tipo)) {
    return { error: "Elige una columna de número de la tabla donde se anota" };
  }
  const tabla_origen = texto(body.tabla_origen) || null;
  if (tabla_origen && !t.tabla(tabla_origen)) return { error: "La tabla de origen no existe" };
  let cantidad_de: string | null = null;
  if (texto(body.cantidad_de)) {
    if (!tabla_origen) return { error: "Para tomar la cantidad del código, elige la tabla de donde es el código" };
    const c = columna_en(body.cantidad_de, tabla_origen);
    if (!c || c === "otra" || !TIPOS_CANTIDAD.has(c.tipo)) return { error: "La cantidad por código debe ser una columna de número de la tabla de origen" };
    cantidad_de = c.clave;
  }
  let columna_codigo: string | null = null;
  if (texto(body.columna_codigo)) {
    const c = columna_en(body.columna_codigo, dest.id);
    if (!c || c === "otra" || !TIPOS_CODIGO_REGLA.has(c.tipo)) return { error: "El código va en una columna «Código», de texto o un enlace de la tabla donde se anota" };
    if (c.tipo === "referencia" && c.tabla_ref_id !== tabla_origen) return { error: "Ese enlace no apunta a la tabla de origen del código" };
    columna_codigo = c.clave;
  }
  if (destino === "existente_o_nuevo" && !columna_codigo) return { error: "Elige por qué columna se busca el registro que ya tiene el código" };
  let enlace_actual: string | null = null;
  if (DESTINOS_QUE_CREAN.has(destino) && texto(body.enlace_actual)) {
    const c = columna_en(body.enlace_actual, dest.id);
    if (!c || c === "otra" || c.tipo !== "referencia" || c.tabla_ref_id !== t.actual.id) {
      return { error: "El enlace al registro abierto debe ser una columna que apunte a esta tabla" };
    }
    enlace_actual = c.clave;
  }
  return {
    regla: {
      id,
      nombre: texto(body.nombre).slice(0, 120),
      codigo: texto(body.codigo).slice(0, 200),
      tabla_origen,
      destino,
      enlace: borrador.enlace,
      tabla_destino: borrador.tabla_destino,
      accion,
      columna: columna.clave,
      cantidad,
      cantidad_de,
      columna_codigo,
      enlace_actual,
    },
  };
}
