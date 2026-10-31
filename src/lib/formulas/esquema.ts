import { texto } from "../comun.ts";
import { normalizar_escaner, type EscanerCampo } from "./escaner.ts";
import { normalizar_escaneo, type EscaneoTabla } from "./escaneo.ts";
import { normalizar_reglas, type ReglaEscaneo } from "./reglas.ts";
import { ambito_sonda, claves_referenciadas, evaluar, parsear_agregado, referencias } from "./motor.ts";

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
  /** Varias fotos: sus URLs unidas con `|`, y sus miniaturas igual y en el mismo orden. */
  "fotos",
  /** Texto largo en Markdown. */
  "nota",
  /** Referencia a una ruta GPS registrada. */
  "ruta",
  /** Nivel de un medidor: `"3/6"` o un número; `pasos` y `capacidad` dan la escala. */
  "nivel",
  /** `"lat,lon"` con seis decimales; no es número para el motor y la búsqueda lo excluye. */
  "geo",
  /** Texto leído de un QR o código de barras (cámara, foto, lector USB o a mano); `escaner` dice qué hacer después. */
  "codigo",
  /** No se captura: se calcula con `formula`. */
  "calculado",
  /** Id de un registro de `tabla_ref_id`; las `PARTES_REF` dicen qué se enseña de él. */
  "referencia",
] as const;

export type TipoCampo = (typeof TIPOS_CAMPO)[number];

/** Lo que se puede pedir en el formulario de un cierre: datos sueltos, sin fotos, enlaces ni cálculos. */
export const TIPOS_CAMPO_CIERRE = [
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
] as const satisfies readonly TipoCampo[];

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
  /** Solo número y entero: cada registro escribe su unidad; `unidad` es la que se propone. */
  unidad_por_registro?: boolean;
  /**
   * `<referencia>:<campo>`: la unidad es la del registro que elige la columna
   * `referencia` de esta tabla, tomada de su `campo` (la unidad de un número o
   * el texto de una columna como «Unidad»). Gana a `unidad_por_registro`.
   */
  unidad_de?: string | null;
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
  /** Solo referencia: la columna de fotos de la tabla enlazada que se enseña; `SIN_FOTO` ninguna; sin valor, la primera. */
  ref_foto?: string | null;
  /** Solo referencia: esa foto se ve también en la lista y en lo impreso, no solo al elegir. */
  ref_foto_en_tabla?: boolean;
  /** Solo código: qué formatos lee y qué hace la captura con lo leído. */
  escaner?: EscanerCampo | null;
  /** Solo referencia: elegir el registro escaneando un código de sus columnas «Código». */
  ref_escaner?: boolean;
};

export const SIN_FOTO = "-";

export const TIPOS_FOTO: ReadonlySet<TipoCampo> = new Set(["foto", "fotos"]);

/** Los tipos que pueden llevar una unidad distinta en cada registro. */
export const TIPOS_UNIDAD_POR_REGISTRO: ReadonlySet<TipoCampo> = new Set(["numero", "entero"]);

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
  /** Lo que se pide al hacer un cierre, además de su nombre y su fecha. */
  campos_cierre?: CampoSpec[];
  /** Qué pasa al escanear un código en «Ver tabla» (ver escaneo.ts). */
  escaneo?: EscaneoTabla | null;
  /** Reglas al escanear: qué cantidad se anota y dónde según el código (ver reglas.ts). */
  reglas?: ReglaEscaneo[];
};

/** Una fila como la ve el motor: clave → valor en texto (capturados y calculados juntos). */
export type Registro = {
  id: string;
  valores: Record<string, string>;
  created_at?: string;
  updated_at?: string;
  /** Clave de cada foto → su miniatura en data URL; el motor no la lee. */
  miniaturas?: Record<string, string>;
  /** Clave de cada número con `unidad_por_registro` → la unidad que se le escribió. */
  unidades?: Record<string, string>;
  /** Clave de cada columna «Código» → la metadata de lo leído en JSON (formato, versión, corrección). */
  codigos?: Record<string, string>;
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

/** ¿Esta clave significa algo en la tabla? Campo, valor fijo, `_id` o agregado sobre un campo existente. */
export function resuelve_clave(spec: TablaSpec, clave: string): boolean {
  if (clave === "_id") return true;
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
    unidad_por_registro: x.unidad_por_registro === true,
    unidad_de: texto_o_null(x.unidad_de),
    ref_foto: texto_o_null(x.ref_foto),
    ref_foto_en_tabla: x.ref_foto_en_tabla === true,
    ...(x.ref_escaner === true ? { ref_escaner: true } : {}),
    ...(x.escaner ? { escaner: normalizar_escaner(x.escaner) } : {}),
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
    campos_cierre: lista(fila.campos_cierre).map(normalizar_campo),
    escaneo: normalizar_escaneo(fila.escaneo),
    reglas: normalizar_reglas(fila.reglas),
  };
}

// #endregion

// #region Validación

const CLAVE = /^[a-z][a-z0-9_]*$/;

/** Nombres de tabla sin mayúsculas, acentos ni espacios de sobra. */
export function normalizar_nombre(nombre: string): string {
  return nombre.normalize("NFD").replace(/\p{M}/gu, "").trim().replace(/\s+/g, " ").toLowerCase();
}

/**
 * La tabla que nombra una fórmula: primero por id, luego por nombre. Dos tablas
 * con el mismo nombre obligan a usar el id.
 */
export function buscar_tabla(tablas: TablaSpec[], nombre: string): TablaSpec | { error: string } {
  const por_id = tablas.find((t) => t.id === nombre);
  if (por_id) return por_id;
  const n = normalizar_nombre(nombre);
  const mismas = tablas.filter((t) => normalizar_nombre(t.name) === n);
  if (mismas.length === 1) return mismas[0]!;
  if (mismas.length > 1) return { error: `Hay ${mismas.length} tablas «${nombre}»; usa su id: ${mismas.map((t) => t.id).join(", ")}` };
  return { error: `No existe la tabla «${nombre}»` };
}

/**
 * Errores de una fórmula. Con `otras` (todas las tablas) también revisa las
 * columnas de otras tablas y de los enlaces; sin ellas solo las propias.
 */
export function errores_formula(spec: TablaSpec, formula: string, donde: string, otras?: TablaSpec[]): string[] {
  const errores: string[] = [];
  const refs = referencias(formula);
  for (const ref of refs.propias) {
    if (!resuelve_clave(spec, ref)) errores.push(`«${donde}»: «${ref}» no existe`);
  }
  const revisar_enlaces = (en: TablaSpec, enlaces: { campo: string; columna: string }[]) => {
    for (const { campo, columna } of enlaces) {
      const c = campo_de(en, campo);
      if (!c) continue;
      if (c.tipo !== "referencia" || !c.tabla_ref_id) {
        errores.push(`«${donde}»: «${campo}» no es un enlace a otra tabla; no se puede leer «${campo}.${columna}»`);
        continue;
      }
      if (!otras) continue;
      const destino = c.tabla_ref_id === spec.id ? spec : otras.find((t) => t.id === c.tabla_ref_id);
      if (!destino) errores.push(`«${donde}»: la tabla enlazada en «${campo}» ya no existe`);
      else if (!resuelve_clave(destino, columna)) errores.push(`«${donde}»: «${columna}» no existe en «${destino.name}»`);
    }
  };
  revisar_enlaces(spec, refs.enlaces);
  if (otras) {
    const todas = otras.some((t) => t.id === spec.id) ? otras : [spec, ...otras];
    for (const [nombre, claves] of refs.tablas) {
      const t = buscar_tabla(todas, nombre);
      if ("error" in t) {
        errores.push(`«${donde}»: ${t.error}`);
        continue;
      }
      for (const clave of claves) {
        if (!resuelve_clave(t, clave)) errores.push(`«${donde}»: «${clave}» no existe en «${t.name}»`);
      }
      revisar_enlaces(t, refs.enlaces_tablas.get(nombre) ?? []);
    }
  }
  const r = evaluar(formula, ambito_sonda());
  if (!r.ok) errores.push(`«${donde}»: ${r.error}`);
  return errores;
}

/**
 * Ciclos entre calculados: `A.total` lee `B.precio` que lee `A.total`. Cuenta lo
 * que se lee del registro mismo, de otras tablas (`tabla_*`) y de los enlaces
 * (`{cliente.saldo}`); no lo que un `sumasi` lee de las filas de su propia tabla,
 * que usa los valores guardados y no puede girar en redondo.
 */
export function ciclos_de_calculo(spec: TablaSpec, otras: TablaSpec[] = []): string[] {
  const tablas = new Map<string, TablaSpec>([...otras.map((t) => [t.id, t] as const), [spec.id, spec]]);
  const lista_tablas = [...tablas.values()];
  const nodo = (t: TablaSpec, clave: string) => `${t.id}\u0000${clave}`;
  const nombre_de = (id_nodo: string) => {
    const [tid, clave] = id_nodo.split("\u0000") as [string, string];
    const t = tablas.get(tid)!;
    return `${t.name}.${campo_de(t, clave)?.etiqueta || clave}`;
  };
  const deps = new Map<string, string[]>();
  const dependencias = (t: TablaSpec, clave: string): string[] => {
    const id = nodo(t, clave);
    const ya = deps.get(id);
    if (ya) return ya;
    const out: string[] = [];
    deps.set(id, out);
    const formula = campo_de(t, clave)?.formula ?? "";
    const refs = referencias(formula);
    const calculado = (en: TablaSpec, c: string) => campo_de(en, c)?.tipo === "calculado";
    const enlazar = (en: TablaSpec, enlaces: { campo: string; columna: string }[]) => {
      for (const { campo, columna } of enlaces) {
        const destino = tablas.get(campo_de(en, campo)?.tabla_ref_id ?? "");
        if (destino && calculado(destino, columna)) out.push(nodo(destino, columna));
      }
    };
    for (const c of refs.directas) if (calculado(t, c)) out.push(nodo(t, c));
    enlazar(t, refs.enlaces);
    for (const [nombre, claves] of refs.tablas) {
      const otra = buscar_tabla(lista_tablas, nombre);
      if ("error" in otra || otra.id === t.id) continue;
      for (const c of claves) if (calculado(otra, c)) out.push(nodo(otra, c));
      enlazar(otra, refs.enlaces_tablas.get(nombre) ?? []);
    }
    return out;
  };
  const errores: string[] = [];
  const vistos = new Set<string>();
  const camino: string[] = [];
  const en_camino = new Set<string>();
  const visitar = (t: TablaSpec | undefined, id: string) => {
    if (en_camino.has(id)) {
      const ciclo = [...camino.slice(camino.indexOf(id)), id].map(nombre_de).join(" → ");
      errores.push(`Ciclo de cálculo: ${ciclo}. Quita una de esas referencias.`);
      return;
    }
    if (vistos.has(id) || !t) return;
    vistos.add(id);
    camino.push(id);
    en_camino.add(id);
    const clave = id.split("\u0000")[1]!;
    for (const dep of dependencias(t, clave)) {
      if (errores.length) break;
      visitar(tablas.get(dep.split("\u0000")[0]!), dep);
    }
    camino.pop();
    en_camino.delete(id);
  };
  for (const c of spec.campos) {
    if (c.tipo !== "calculado" || errores.length) continue;
    visitar(spec, nodo(spec, c.clave));
  }
  return errores;
}

/**
 * Avisos antes de guardar el esquema: claves inválidas o repetidas (campos y
 * valores fijos comparten espacio; los resúmenes tienen el suyo), tipos
 * desconocidos, calculados sin fórmula y referencias rotas.
 */
export function validar_esquema(spec: TablaSpec, otras?: TablaSpec[]): string[] {
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
      else errores.push(...errores_formula(spec, campo.formula, campo.clave, otras));
    }
    if (campo.unidad_de) {
      const ref = campo_de(spec, campo.unidad_de.split(":")[0] ?? "");
      if (ref?.tipo !== "referencia") errores.push(`«${campo.clave}»: su unidad sale de un enlace que ya no existe`);
    }
  }
  for (const c of spec.constantes) revisar_clave(c.clave, "Valor fijo", vistas);
  const vistas_resumen = new Set<string>();
  for (const r of spec.resumenes) {
    revisar_clave(r.clave, "Resumen", vistas_resumen);
    if (!r.formula) errores.push(`«${r.clave}»: falta la fórmula`);
    else errores.push(...errores_formula(spec, r.formula, r.clave, otras));
  }
  errores.push(...ciclos_de_calculo(spec, otras));
  const vistas_cierre = new Set<string>();
  for (const campo of spec.campos_cierre ?? []) {
    revisar_clave(campo.clave, "Dato del cierre", vistas_cierre);
    if (!(TIPOS_CAMPO_CIERRE as readonly string[]).includes(campo.tipo)) {
      errores.push(`«${campo.clave}»: un cierre no pide datos de tipo «${campo.tipo}»`);
    }
  }
  return errores;
}

// #endregion
