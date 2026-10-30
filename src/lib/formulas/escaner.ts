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

/** Qué se enseña de lo leído al capturar, en la lista y al imprimir. */
export const MOSTRAR_ESCANER = {
  valor: "El texto del código",
  codigo: "El código dibujado (QR o barras)",
  ambos: "El código dibujado y su texto",
} as const;
export type MostrarEscaner = keyof typeof MOSTRAR_ESCANER;

/**
 * En el formulario de captura, la metadata de lo leído (formato, versión del
 * QR, corrección de errores…) va junto al código como `<clave>@codigo`.
 */
export const SUFIJO_CODIGO = "@codigo";

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
  /** El texto, el código regenerado o ambos. */
  mostrar: MostrarEscaner;
  /** Con varios códigos: una nota por código (va en la metadata como `note`). */
  notas?: boolean;
};

export const ESCANER_VACIO: EscanerCampo = {
  formatos: "todos",
  destino: null,
  plantilla: null,
  abrir_url: false,
  buscar: false,
  continuo: false,
  mostrar: "valor",
  notas: false,
};

const FORMATOS_NUCLEO: Record<Exclude<FormatosEscaner, "todos">, string[]> = {
  qr: ["qr_code", "micro_qr_code", "rm_qr_code"],
  barras: ["ean_13", "ean_8", "upc_a", "upc_e", "code_39", "code_93", "code_128", "itf", "codabar", "databar", "databar_limited", "databar_expanded"],
};

/** Formato con que el núcleo dibuja lo que no trae formato leído (antes siempre QR). */
export function formato_regenerado(formatos: FormatosEscaner): "code_128" | "qr_code" | undefined {
  return formatos === "barras" ? "code_128" : formatos === "qr" ? "qr_code" : undefined;
}

/** GTIN (EAN-8, UPC-A, EAN-13, ITF-14) con dígito verificador válido. */
export function gtin_valido(valor: string): boolean {
  if (!/^\d{8}$|^\d{12,14}$/.test(valor)) return false;
  const d = valor.split("").map(Number);
  const control = d.pop()!;
  const suma = d.reverse().reduce((acc, x, i) => acc + x * (i % 2 === 0 ? 3 : 1), 0);
  return (10 - (suma % 10)) % 10 === control;
}

const GTIN: Record<number, string> = { 8: "ean_8", 12: "upc_a", 13: "ean_13", 14: "itf" };

/**
 * El formato de un código sin formato leído (tecleado o registro viejo), como
 * `infer_scanner_format` del núcleo: GTIN válido → EAN/UPC/ITF-14; con
 * `seguro` solo eso. Si no, dígitos (o columna de solo barras) → Code 128 y
 * texto → QR.
 */
export function formato_de_valor(valor: string, formatos: FormatosEscaner = "todos", seguro = false): string {
  const t = valor.trim();
  if (!t) return "";
  if (formatos !== "qr" && gtin_valido(t)) return GTIN[t.length]!;
  if (seguro) return "";
  if (formatos === "qr") return "qr_code";
  const ascii = /^[\x20-\x7e]+$/.test(t) && t.length <= 80;
  return ascii && (formatos === "barras" || /^\d+$/.test(t)) ? "code_128" : "qr_code";
}

/** Tipos de columna que pueden recibir lo leído. */
export const TIPOS_DESTINO_ESCANER = new Set(["texto", "codigo", "numero", "entero", "dinero", "nota"]);

const es_formatos = (v: string): v is FormatosEscaner => Object.hasOwn(FORMATOS_ESCANER, v);
const es_mostrar = (v: string): v is MostrarEscaner => Object.hasOwn(MOSTRAR_ESCANER, v);

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
    mostrar: es_mostrar(texto(o.mostrar)) ? (texto(o.mostrar) as MostrarEscaner) : "valor",
    notas: o.notas === true,
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
  if ("escaner_notas" in body) e.notas = booleano(body.escaner_notas);
  if ("escaner_mostrar" in body) {
    const m = texto(body.escaner_mostrar);
    e.mostrar = es_mostrar(m) ? m : "valor";
  }
  return { escaner: e };
}

/**
 * La configuración del input `nox.input-scanner` para capturar esta columna.
 * El historial es solo del registro abierto (`history_scope`); uno nuevo aún
 * no tiene lecturas propias, así que no ofrece las de otros registros.
 */
export function config_escaner(campo: CampoSpec, campos: CampoSpec[], tabla_id?: string, registro_id?: string): Record<string, unknown> {
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
    ...(e.mostrar !== "valor" ? { display: e.mostrar } : {}),
    ...(formato_regenerado(e.formatos) ? { regenerate_format: formato_regenerado(e.formatos) } : {}),
    ...(campo.multiple && e.notas ? { notes: true, notes_label: "Nota" } : {}),
    metadata_target: `${campo.clave}${SUFIJO_CODIGO}`,
    gs1: true,
    ...(registro_id ? { history: true, history_scope: `herr-registro:${registro_id}` } : { history: false }),
  };
}

/** Los códigos de una celda «Código»: uno, o los que unió el modo «varios» (`, `, como el input del núcleo). */
export function codigos_de(campo: Pick<CampoSpec, "multiple">, raw: string): string[] {
  const t = raw.trim();
  if (!t) return [];
  if (!campo.multiple) return [t];
  return [...new Set(t.split(", ").map((v) => v.trim()).filter(Boolean))];
}

const CLAVES_METADATA: Record<string, number> = {
  value: 2048,
  format: 32,
  format_label: 80,
  dimension: 4,
  source: 16,
  engine: 24,
  version: 40,
  ec_level: 40,
  symbology_identifier: 16,
  content_type: 40,
  read_at: 40,
  note: 500,
};

function metadata_limpia(x: unknown): Record<string, unknown> | null {
  if (!x || typeof x !== "object" || Array.isArray(x)) return null;
  const o = x as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [clave, max] of Object.entries(CLAVES_METADATA)) {
    const x = o[clave];
    const v = typeof x === "string" || typeof x === "number" ? texto(x).slice(0, max) : "";
    if (v) out[clave] = v;
  }
  if (typeof o.length === "number" && Number.isInteger(o.length) && o.length >= 0) out.length = o.length;
  if (o.gs1 === true) out.gs1 = true;
  // El formato se dedujo del valor (tecleado), no lo leyó la cámara.
  if (o.inferred === true && out.format) out.inferred = true;
  return typeof out.value === "string" ? out : null;
}

const MAX_METADATA = 50;

/**
 * La metadata que mandó el input del escáner, solo de los códigos que quedan
 * en el campo y con lo que se sabe leer: nunca se guarda un JSON cualquiera.
 * Vacío si no hay nada que guardar.
 */
export function metadata_de_codigo(campo: Pick<CampoSpec, "multiple">, valor: string, raw: unknown): string {
  let datos = raw;
  if (typeof raw === "string") {
    if (!raw.trim()) return "";
    try {
      datos = JSON.parse(raw);
    } catch {
      return "";
    }
  }
  const lista = (Array.isArray(datos) ? datos : [datos]).map(metadata_limpia).filter((m) => m !== null);
  const vigentes = new Set(codigos_de(campo, valor));
  const quedan = lista.filter((m) => vigentes.has(String(m.value))).slice(-MAX_METADATA);
  if (!quedan.length) return "";
  return JSON.stringify(campo.multiple ? quedan : quedan[quedan.length - 1]);
}

/** La metadata guardada de cada código (código → metadata limpia). */
export function metadatas_de_codigos(raw: unknown): Map<string, Record<string, unknown>> {
  let datos = raw;
  if (typeof raw === "string") {
    try {
      datos = raw.trim() ? JSON.parse(raw) : [];
    } catch {
      return new Map();
    }
  }
  const out = new Map<string, Record<string, unknown>>();
  for (const m of (Array.isArray(datos) ? datos : [datos]).map(metadata_limpia)) if (m) out.set(String(m.value), m);
  return out;
}

/** La nota de cada código (código → nota), de la metadata guardada. Vacío si no hay notas. */
export function notas_de_codigos(raw: unknown): Map<string, string> {
  const out = new Map<string, string>();
  for (const [codigo, m] of metadatas_de_codigos(raw)) {
    if (typeof m.note === "string" && m.note.trim()) out.set(codigo, m.note.trim());
  }
  return out;
}

/** «A1 (frágil), B2»: los códigos con su nota, para el texto de una celda o del impreso. */
export function codigos_con_notas(campo: Pick<CampoSpec, "multiple">, valor: string, raw_metadata: unknown): string {
  const notas = notas_de_codigos(raw_metadata);
  return codigos_de(campo, valor)
    .map((c) => (notas.get(c) ? `${c} (${notas.get(c)})` : c))
    .join(", ");
}
