import { texto } from "../comun.ts";
import { ambito_sonda, claves_referenciadas, evaluar, parsear_agregado } from "./motor.ts";

/**
 * Esquema de una tabla personalizada: campos tipados, valores fijos y resúmenes.
 *
 * El conjunto de tipos es cerrado a propósito: con un «tipo libre» el motor de
 * fórmulas no sabría cómo sumar dos valores.
 */
export const TIPOS_CAMPO = [
  "texto",
  "numero",
  /** Número con unidad monetaria; se formatea distinto pero opera como número. */
  "dinero",
  "entero",
  "booleano",
  "fecha",
  "hora",
  "fecha_hora",
  /** Una opción de `opciones`. */
  "opcion",
  "foto",
  /** Texto largo en Markdown. */
  "nota",
  /** Referencia a una ruta GPS registrada. */
  "ruta",
  /** Nivel de un medidor: `"3/6"` o un número; `pasos` y `capacidad` dan la escala. */
  "nivel",
  /** `"lat,lon"` con seis decimales; no es número para el motor y la búsqueda lo excluye. */
  "geo",
  /** No se captura: se calcula con `formula`. */
  "calculado",
  /** Id de un registro de `tabla_ref_id`; las `PARTES_REF` dicen qué se enseña de él. */
  "referencia",
] as const;

export type TipoCampo = (typeof TIPOS_CAMPO)[number];

/** `clave` es estable y no se muestra; `etiqueta` se puede renombrar sin romper fórmulas. */
export type CampoSpec = {
  clave: string;
  etiqueta: string;
  tipo: TipoCampo;
  requerido?: boolean;
  valor_por_defecto?: string | null;
  opciones?: string[];
  formula?: string | null;
  unidad?: string | null;
  decimales?: number;
  /** Si aparece en la fila resumida de la lista. */
  en_resumen?: boolean;
  /** Solo nivel: divisiones del medidor; 0 = no aplica. */
  pasos?: number;
  /** Solo nivel: valor a escala completa, en `unidad`. */
  capacidad?: number | null;
  tabla_ref_id?: string | null;
  /** Solo referencia: plantillas con `{clave}` de la tabla enlazada (ver `PARTES_REF`). */
  ref_leyenda?: string | null;
  ref_leyenda_secundaria?: string | null;
  ref_descripcion?: string | null;
  ref_descripcion_secundaria?: string | null;
  /** Solo referencia y opción: varios valores en una cadena (ver multivalor). */
  multiple?: boolean;
};

/**
 * Las cuatro partes con que se ve un registro enlazado al elegirlo: las del
 * datalist del lanzador, con sus nombres de opción. Sin título se enseña el
 * nombre del registro.
 */
export const PARTES_REF = [
  { campo: "ref_leyenda", opcion: "label" },
  { campo: "ref_leyenda_secundaria", opcion: "leyend_secondary" },
  { campo: "ref_descripcion", opcion: "description" },
  { campo: "ref_descripcion_secundaria", opcion: "description_secondary" },
] as const;

export type ParteRef = (typeof PARTES_REF)[number]["campo"];

/** Se captura una vez y vale para todos los registros; las fórmulas lo usan como `{clave}`. */
export type ConstanteTabla = {
  clave: string;
  etiqueta: string;
  valor?: string;
  unidad?: string | null;
  decimales?: number;
};

/** Una cifra sobre la tabla entera, mostrada encima de la lista. */
export type ResumenTabla = {
  clave: string;
  etiqueta: string;
  formula: string;
  unidad?: string | null;
  decimales?: number;
};

export type TablaSpec = {
  id: string;
  name: string;
  description?: string;
  icono?: string;
  campos: CampoSpec[];
  constantes: ConstanteTabla[];
  resumenes: ResumenTabla[];
  plantilla_id?: string | null;
  /** Campo por el que se ordena la lista; sin él, lo más reciente primero. */
  orden_campo?: string | null;
  orden_desc?: boolean;
  /** Si «cerrar el día» puede archivar y vaciar la tabla (falso en catálogos). */
  cerrable?: boolean;
};

/** Una fila como la ve el motor: clave → valor en texto (capturados y calculados juntos). */
export type Registro = {
  id: string;
  valores: Record<string, string>;
  created_at?: string;
  updated_at?: string;
};

export const DECIMALES = 2;

export function decimales_de(x: { decimales?: number }): number {
  return Number.isInteger(x.decimales) ? (x.decimales as number) : DECIMALES;
}

export function campo_de(spec: TablaSpec, clave: string): CampoSpec | undefined {
  return spec.campos.find((c) => c.clave === clave);
}

export function constante_de(spec: TablaSpec, clave: string): ConstanteTabla | undefined {
  return spec.constantes.find((c) => c.clave === clave);
}

/** ¿Esta clave significa algo en la tabla? Campo, valor fijo o agregado sobre un campo existente. */
export function resuelve_clave(spec: TablaSpec, clave: string): boolean {
  const agregado = parsear_agregado(clave);
  if (agregado) return campo_de(spec, agregado.campo) !== undefined;
  return campo_de(spec, clave) !== undefined || constante_de(spec, clave) !== undefined;
}

/**
 * Campos calculados en orden de dependencia (orden topológico). Un ciclo deja
 * la rama sin ordenar y el motor lo reporta al evaluar en vez de colgarse.
 */
export function calculados_en_orden(spec: TablaSpec): CampoSpec[] {
  const calculados = spec.campos.filter((c) => c.tipo === "calculado");
  const por_clave = new Map(calculados.map((c) => [c.clave, c]));
  const resueltos = new Set<string>();
  const orden: CampoSpec[] = [];
  const visitar = (campo: CampoSpec, vistos: Set<string>) => {
    if (resueltos.has(campo.clave) || vistos.has(campo.clave)) return;
    vistos.add(campo.clave);
    for (const ref of claves_referenciadas(campo.formula ?? "")) {
      const dep = por_clave.get(ref);
      if (dep) visitar(dep, vistos);
    }
    if (!resueltos.has(campo.clave)) {
      resueltos.add(campo.clave);
      orden.push(campo);
    }
  };
  for (const c of calculados) visitar(c, new Set());
  return orden;
}

// #region Lectura desde una fila guardada

function lista(valor: unknown): Record<string, unknown>[] {
  const v = typeof valor === "string" ? intentar_json(valor) : valor;
  return Array.isArray(v) ? v.filter((x) => x && typeof x === "object") : [];
}

function intentar_json(texto: string): unknown {
  try {
    return JSON.parse(texto);
  } catch {
    return null;
  }
}

const texto_o_null = (v: unknown): string | null => (texto(v) ? texto(v) : null);
const entero = (v: unknown, defecto: number): number =>
  Number.isInteger(Number(v)) && v !== "" && v != null ? Number(v) : defecto;

function normalizar_campo(x: Record<string, unknown>): CampoSpec {
  const clave = texto(x.clave);
  // Hay filas guardadas con `clave_ref_display` (una sola columna): esa columna es su título.
  const display = texto(x.clave_ref_display);
  return {
    clave,
    etiqueta: texto(x.etiqueta) || clave,
    tipo: (texto(x.tipo) || "texto") as TipoCampo,
    requerido: x.requerido === true,
    valor_por_defecto: texto_o_null(x.valor_por_defecto),
    opciones: Array.isArray(x.opciones) ? x.opciones.map(texto).filter(Boolean) : [],
    formula: texto_o_null(x.formula),
    unidad: texto_o_null(x.unidad),
    decimales: entero(x.decimales, DECIMALES),
    en_resumen: x.en_resumen === true,
    pasos: entero(x.pasos, 0),
    capacidad: Number.isFinite(Number(x.capacidad)) && texto(x.capacidad) ? Number(x.capacidad) : null,
    tabla_ref_id: texto_o_null(x.tabla_ref_id),
    ref_leyenda: texto_o_null(x.ref_leyenda) ?? (display ? `{${display}}` : null),
    ref_leyenda_secundaria: texto_o_null(x.ref_leyenda_secundaria),
    ref_descripcion: texto_o_null(x.ref_descripcion),
    ref_descripcion_secundaria: texto_o_null(x.ref_descripcion_secundaria),
    multiple: x.multiple === true,
  };
}

function normalizar_constante(x: Record<string, unknown>): ConstanteTabla {
  const clave = texto(x.clave);
  return {
    clave,
    etiqueta: texto(x.etiqueta) || clave,
    valor: texto(x.valor),
    unidad: texto_o_null(x.unidad),
    decimales: entero(x.decimales, DECIMALES),
  };
}

function normalizar_resumen(x: Record<string, unknown>): ResumenTabla {
  const clave = texto(x.clave);
  return {
    clave,
    etiqueta: texto(x.etiqueta) || clave,
    formula: texto(x.formula),
    unidad: texto_o_null(x.unidad),
    decimales: entero(x.decimales, DECIMALES),
  };
}

/** El esquema que hay en una fila de `herr_tablas` (las columnas json pueden venir como texto). */
export function spec_de_fila(fila: Record<string, unknown>): TablaSpec {
  return {
    id: texto(fila.id),
    name: texto(fila.name),
    description: texto(fila.description),
    icono: texto(fila.icono) || "fa-table",
    campos: lista(fila.campos).map(normalizar_campo),
    constantes: lista(fila.constantes).map(normalizar_constante),
    resumenes: lista(fila.resumenes).map(normalizar_resumen),
    plantilla_id: texto_o_null(fila.plantilla_id),
    orden_campo: texto_o_null(fila.orden_campo),
    orden_desc: fila.orden_desc !== false,
    cerrable: fila.cerrable !== false,
  };
}

// #endregion

// #region Validación

const CLAVE = /^[a-z][a-z0-9_]*$/;

function errores_formula(spec: TablaSpec, formula: string, donde: string): string[] {
  const errores: string[] = [];
  for (const ref of claves_referenciadas(formula)) {
    if (!resuelve_clave(spec, ref)) errores.push(`«${donde}»: «${ref}» no existe`);
  }
  const r = evaluar(formula, ambito_sonda());
  if (!r.ok) errores.push(`«${donde}»: ${r.error}`);
  return errores;
}

/**
 * Avisos antes de guardar el esquema: claves inválidas o repetidas (campos y
 * valores fijos comparten espacio; los resúmenes tienen el suyo), tipos
 * desconocidos, calculados sin fórmula y referencias rotas.
 */
export function validar_esquema(spec: TablaSpec): string[] {
  const errores: string[] = [];
  const revisar_clave = (clave: string, donde: string, vistas: Set<string>) => {
    if (!CLAVE.test(clave)) errores.push(`${donde}: clave inválida «${clave}»`);
    else if (vistas.has(clave)) errores.push(`${donde}: clave repetida «${clave}»`);
    vistas.add(clave);
  };
  const vistas = new Set<string>();
  for (const campo of spec.campos) {
    revisar_clave(campo.clave, "Campo", vistas);
    if (!(TIPOS_CAMPO as readonly string[]).includes(campo.tipo)) {
      errores.push(`«${campo.clave}»: tipo desconocido «${campo.tipo}»`);
    }
    if (campo.tipo === "calculado") {
      if (!campo.formula) errores.push(`«${campo.clave}»: falta la fórmula`);
      else errores.push(...errores_formula(spec, campo.formula, campo.clave));
    }
  }
  for (const c of spec.constantes) revisar_clave(c.clave, "Valor fijo", vistas);
  const vistas_resumen = new Set<string>();
  for (const r of spec.resumenes) {
    revisar_clave(r.clave, "Resumen", vistas_resumen);
    if (!r.formula) errores.push(`«${r.clave}»: falta la fórmula`);
    else errores.push(...errores_formula(spec, r.formula, r.clave));
  }
  return errores;
}

// #endregion
