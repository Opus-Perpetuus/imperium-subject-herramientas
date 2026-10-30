import { texto } from "../comun.ts";
import { codigos_de } from "./escaner.ts";
import type { CampoSpec, Registro, TablaSpec } from "./esquema.ts";

/**
 * «Al escanear» de una tabla: qué pasa cuando en «Ver tabla» se lee un QR o
 * código de barras. Cada acción dice a qué columna va el código; para sumar
 * otra basta una entrada aquí y su caso en `resolver` de la captura.
 */
export const ACCIONES_ESCANEO = {
  nuevo: {
    label: "Abrir un registro nuevo con el código ya puesto",
    boton: "Escanear para anotar",
  },
  abrir_o_nuevo: {
    label: "Abrir el registro que ya tenga ese código; si no hay, uno nuevo",
    boton: "Escanear para abrir o anotar",
  },
  reglas: {
    label: "Aplicar las reglas al escanear de la tabla, sin abrir un registro",
    boton: "Escanear para aplicar reglas",
  },
} as const;
export type AccionEscaneo = keyof typeof ACCIONES_ESCANEO;

export type EscaneoTabla = {
  accion: AccionEscaneo;
  /** Clave de la columna que recibe lo leído (o, si es un enlace, el registro con ese código). */
  columna: string;
};

/** Columnas que pueden recibir lo leído: el texto tal cual o, en un enlace, el registro que lo tiene. */
export const TIPOS_COLUMNA_ESCANEO: ReadonlySet<string> = new Set(["codigo", "texto", "referencia"]);

export const es_accion_escaneo = (v: string): v is AccionEscaneo => Object.hasOwn(ACCIONES_ESCANEO, v);

/** Acciones que no ponen el código en una columna (no piden «columna»). */
export const ACCIONES_SIN_COLUMNA: ReadonlySet<AccionEscaneo> = new Set(["reglas"]);

export function normalizar_escaneo(x: unknown): EscaneoTabla | null {
  let o = x;
  if (typeof x === "string") {
    try {
      o = JSON.parse(x);
    } catch {
      return null;
    }
  }
  if (!o || typeof o !== "object" || Array.isArray(o)) return null;
  const r = o as Record<string, unknown>;
  const accion = texto(r.accion);
  const columna = texto(r.columna);
  if (!es_accion_escaneo(accion)) return null;
  if (ACCIONES_SIN_COLUMNA.has(accion)) return { accion, columna: "" };
  return columna ? { accion, columna } : null;
}

/** La columna configurada, si sigue existiendo y sigue siendo de un tipo que recibe códigos. */
export function columna_de_escaneo(spec: Pick<TablaSpec, "campos" | "escaneo">): CampoSpec | null {
  const e = spec.escaneo;
  if (!e || ACCIONES_SIN_COLUMNA.has(e.accion)) return null;
  const campo = spec.campos.find((c) => c.clave === e.columna);
  if (!campo || !TIPOS_COLUMNA_ESCANEO.has(campo.tipo)) return null;
  if (campo.tipo === "referencia" && !campo.tabla_ref_id) return null;
  return campo;
}

/** Lo que manda el diseñador (`escaneo_accion`, `escaneo_columna`); «ninguna» lo apaga. */
export function escaneo_desde_formulario(
  spec: Pick<TablaSpec, "campos">,
  body: Record<string, unknown>,
): { escaneo: EscaneoTabla | null } | { error: string } {
  const accion = texto(body.escaneo_accion);
  if (!accion || accion === "ninguna") return { escaneo: null };
  if (!es_accion_escaneo(accion)) return { error: "Esa acción no existe" };
  if (ACCIONES_SIN_COLUMNA.has(accion)) return { escaneo: { accion, columna: "" } };
  const columna = texto(body.escaneo_columna);
  const campo = spec.campos.find((c) => c.clave === columna);
  if (!campo || !TIPOS_COLUMNA_ESCANEO.has(campo.tipo) || (campo.tipo === "referencia" && !campo.tabla_ref_id)) {
    return { error: "Elige una columna «Código», de texto o un enlace a otra tabla para poner lo leído" };
  }
  return { escaneo: { accion, columna } };
}

const igual = (a: string, b: string) => a.trim().toLocaleLowerCase("es-MX") === b.trim().toLocaleLowerCase("es-MX");

/** Si la celda de esta columna contiene el código leído (exacto o sin distinguir mayúsculas). */
export function celda_coincide(campo: CampoSpec, raw: string, codigo: string): boolean {
  const c = codigo.trim();
  if (!c) return false;
  const valores = campo.tipo === "codigo" ? codigos_de(campo, raw) : [raw.trim()];
  return valores.some((v) => v === c) || valores.some((v) => igual(v, c));
}

/**
 * El registro de una tabla que tiene el código: primero en sus columnas
 * «Código», luego en las de texto. Con varios, el primero en orden.
 */
export function registro_por_codigo(spec: Pick<TablaSpec, "campos">, filas: Registro[], codigo: string): Registro | null {
  const grupos = [spec.campos.filter((c) => c.tipo === "codigo"), spec.campos.filter((c) => c.tipo === "texto")];
  for (const campos of grupos) {
    const fila = filas.find((f) => campos.some((c) => celda_coincide(c, f.valores[c.clave] ?? "", codigo)));
    if (fila) return fila;
  }
  return null;
}

/**
 * El escáner que aplica las reglas: envía el código al leerlo
 * (`submit_on_scan`); con `registro_id` el historial es solo de ese registro.
 */
export function config_escaneo_reglas(registro_id?: string): Record<string, unknown> {
  return {
    submit_on_scan: true,
    ...(registro_id ? { history: true, history_scope: `herr-registro:${registro_id}:reglas` } : { history: false }),
  };
}

/** El input del escáner de «Ver tabla»: lo leído abre la captura con `escaneo=`. */
export function config_escaneo_tabla(tabla_id: string): Record<string, unknown> {
  return {
    actions: [
      {
        kind: "abrir_plantilla",
        template: `/internal/herr-registro?tabla=${encodeURIComponent(tabla_id)}&escaneo={valor}`,
        new_tab: false,
      },
    ],
    history: false,
  };
}
