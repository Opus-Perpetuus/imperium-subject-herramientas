import { booleano, texto } from "../comun.ts";
import type { CampoSpec } from "./esquema.ts";

/**
 * Columna «Código (escáner)»: qué hace la captura después de leer un QR o un
 * código de barras. Se traduce a la configuración genérica del input
 * `nox.input-scanner` del núcleo (`ScannerConfig`), que es la que lee la cámara.
 */

export const FORMATOS_ESCANER = {
  todos: "QR y códigos de barras",
  qr: "Solo QR (incluye Micro QR)",
  barras: "Solo códigos de barras (EAN, UPC, Code 128…)",
} as const;
export type FormatosEscaner = keyof typeof FORMATOS_ESCANER;

export type EscanerCampo = {
  formatos: FormatosEscaner;
  /** Clave de otra columna de la tabla donde se copia lo leído. */
  destino: string | null;
  /** URL con `{valor}`: http/https o ruta interna «/…». */
  plantilla: string | null;
  /** Si lo leído es una dirección web, ofrecer abrirla (con confirmación). */
  abrir_url: boolean;
  /** Buscar lo leído en los registros de esta misma tabla. */
  buscar: boolean;
  /** La cámara se queda abierta para leer uno tras otro. */
  continuo: boolean;
};

export const ESCANER_VACIO: EscanerCampo = {
  formatos: "todos",
  destino: null,
  plantilla: null,
  abrir_url: false,
  buscar: false,
  continuo: false,
};

const FORMATOS_NUCLEO: Record<Exclude<FormatosEscaner, "todos">, string[]> = {
  qr: ["qr_code", "micro_qr_code", "rm_qr_code"],
  barras: ["ean_13", "ean_8", "upc_a", "upc_e", "code_39", "code_93", "code_128", "itf", "codabar", "databar", "databar_limited", "databar_expanded"],
};

/** Tipos de columna que pueden recibir lo leído. */
export const TIPOS_DESTINO_ESCANER = new Set(["texto", "codigo", "numero", "entero", "dinero", "nota"]);

const es_formatos = (v: string): v is FormatosEscaner => Object.hasOwn(FORMATOS_ESCANER, v);

/** Una plantilla que no se puede abrir con seguridad no se guarda: solo http/https o ruta interna, y con `{valor}`. */
export function plantilla_valida(plantilla: string): string | null {
  const p = plantilla.trim();
  if (!p) return null;
  if (!p.includes("{valor}")) return "La dirección debe llevar {valor} donde va el código";
  if (p.startsWith("/") && !p.startsWith("//")) return null;
  try {
    const url = new URL(p.replaceAll("{valor}", "x"));
    return url.protocol === "https:" || url.protocol === "http:" ? null : "Solo direcciones http:// o https://";
  } catch {
    return "La dirección no es válida";
  }
}

export function normalizar_escaner(x: unknown): EscanerCampo | null {
  if (!x || typeof x !== "object") return null;
  const o = x as Record<string, unknown>;
  const formatos = texto(o.formatos);
  const plantilla = texto(o.plantilla);
  return {
    formatos: es_formatos(formatos) ? formatos : "todos",
    destino: texto(o.destino) || null,
    plantilla: plantilla && !plantilla_valida(plantilla) ? plantilla : null,
    abrir_url: o.abrir_url === true,
    buscar: o.buscar === true,
    continuo: o.continuo === true,
  };
}

/**
 * Lo que manda el formulario del diseñador (`escaner_*`), sobre lo que ya
 * había. Devuelve el motivo si algo no se puede guardar.
 */
export function escaner_desde_formulario(
  campos: CampoSpec[],
  campo: CampoSpec,
  body: Record<string, unknown>,
): { escaner: EscanerCampo } | { error: string } {
  const e: EscanerCampo = { ...ESCANER_VACIO, ...(campo.escaner ?? {}) };
  if ("escaner_formatos" in body) {
    const f = texto(body.escaner_formatos);
    e.formatos = es_formatos(f) ? f : "todos";
  }
  if ("escaner_destino" in body) {
    const destino = texto(body.escaner_destino) || null;
    if (destino) {
      const otro = campos.find((c) => c.clave === destino);
      if (!otro || otro.clave === campo.clave || !TIPOS_DESTINO_ESCANER.has(otro.tipo)) {
        return { error: "Elige otra columna de texto o número para copiar el código" };
      }
    }
    e.destino = destino;
  }
  if ("escaner_plantilla" in body) {
    const plantilla = texto(body.escaner_plantilla);
    const problema = plantilla_valida(plantilla);
    if (problema) return { error: problema };
    e.plantilla = plantilla || null;
  }
  if ("escaner_abrir_url" in body) e.abrir_url = booleano(body.escaner_abrir_url);
  if ("escaner_buscar" in body) e.buscar = booleano(body.escaner_buscar);
  if ("escaner_continuo" in body) e.continuo = booleano(body.escaner_continuo);
  return { escaner: e };
}

/** La configuración del input `nox.input-scanner` para capturar esta columna. */
export function config_escaner(campo: CampoSpec, campos: CampoSpec[], tabla_id?: string): Record<string, unknown> {
  const e = campo.escaner ?? ESCANER_VACIO;
  const actions: Record<string, unknown>[] = [];
  if (e.destino && campos.some((c) => c.clave === e.destino && c.clave !== campo.clave)) {
    actions.push({ kind: "guardar_en", target: e.destino });
  }
  if (e.plantilla) actions.push({ kind: "abrir_plantilla", template: e.plantilla, new_tab: !e.plantilla.startsWith("/") });
  if (e.abrir_url) actions.push({ kind: "abrir_valor", confirm: true, new_tab: true });
  if (e.buscar && tabla_id) {
    actions.push({ kind: "abrir_plantilla", template: `/internal/herr-tabla?id=${encodeURIComponent(tabla_id)}&q={valor}`, new_tab: false });
  }
  return {
    ...(e.formatos === "todos" ? {} : { formats: FORMATOS_NUCLEO[e.formatos] }),
    ...(actions.length ? { actions } : {}),
    ...(e.continuo ? { continuous: true } : {}),
    ...(campo.multiple ? { multiple: true } : {}),
    gs1: true,
    history: true,
  };
}
