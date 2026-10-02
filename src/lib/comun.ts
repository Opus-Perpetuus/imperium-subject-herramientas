import {
  KirletHttpError,
  kirlet_identity_can,
  type DomainRow,
  type KirletCtx,
  type KirletIdentity,
  type NoxFileRef,
} from "@opus-perpetuus/imperium-core-kit";

/**
 * Helpers compartidos por todas las herramientas. Sin lógica de negocio: solo
 * conversión de tipos, errores HTTP y el campo de búsqueda.
 */

/**
 * Lo que quien mira no puede hacer no se le ofrece: un enlace compartido o un
 * usuario de solo lectura no deben ver botones que acaban en un 403. Sin
 * identidad (pruebas, autenticación apagada) no se esconde nada.
 */
export function puede(
  identity: KirletIdentity | null,
  recurso: string,
  accion: "create" | "update" | "delete",
): boolean {
  return !identity || kirlet_identity_can(identity, `kirlet.herramientas.${recurso}`, accion);
}

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

/** Un `null` o vacío del formulario en una columna NOT NULL toma el valor por defecto. */
export function con_defecto(defecto: unknown): (v: unknown) => unknown {
  return (v) => (v == null || v === "" ? defecto : v);
}

/** Quita del cambio las columnas NOT NULL que llegan `null` o vacías: se conserva lo guardado. */
export function sin_vacios(patch: DomainRow, claves: readonly string[]): DomainRow {
  const out = { ...patch };
  for (const k of claves) if (k in out && (out[k] == null || out[k] === "")) delete out[k];
  return out;
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

/**
 * Zona del negocio. El contenedor corre en UTC: sin esto, desde las 18:00 de
 * México «hoy» ya es mañana y la hora no casa con la fecha. Se cambia por
 * servidor con `HERRAMIENTAS_ZONA` (IANA).
 */
export const ZONA_POR_DEFECTO = "America/Mexico_City";

/** Zona IANA utilizable, o la del servidor / por defecto si no llega o no existe. */
export function zona_valida(value?: unknown): string {
  const zona = texto(value) || texto(process.env.HERRAMIENTAS_ZONA);
  if (!zona) return ZONA_POR_DEFECTO;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zona });
    return zona;
  } catch {
    return ZONA_POR_DEFECTO;
  }
}

/** Minutos que la zona lleva respecto a UTC en ese instante (México: -360). */
export function desfase_minutos(zona: string, instante: Date): number {
  const partes = new Intl.DateTimeFormat("en-US", {
    timeZone: zona,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instante);
  const v = (tipo: string) => Number(partes.find((p) => p.type === tipo)?.value ?? 0);
  const como_utc = Date.UTC(v("year"), v("month") - 1, v("day"), v("hour"), v("minute"), v("second"));
  return Math.round((como_utc - instante.getTime()) / 60_000);
}

/** Hora de pared de la zona como ISO sin zona: `AAAA-MM-DDTHH:mm:ss`. */
function pared(zona: string, instante: Date): string {
  return new Date(instante.getTime() + desfase_minutos(zona, instante) * 60_000).toISOString().slice(0, 19);
}

/** `AAAA-MM-DD` de hoy en la zona del negocio. */
export function fecha_hoy(zona = zona_valida(), instante = new Date()): string {
  return pared(zona, instante).slice(0, 10);
}

/** `HH:mm` de ahora en la zona del negocio. */
export function hora_ahora(zona = zona_valida(), instante = new Date()): string {
  return pared(zona, instante).slice(11, 16);
}

/** `AAAA-MM-DD HH:mm` en la zona del negocio: sello de liquidación y cierre. */
export function sello_ahora(zona = zona_valida(), instante = new Date()): string {
  return pared(zona, instante).slice(0, 16).replace("T", " ");
}

const DIA_LEGIBLE = new Intl.DateTimeFormat("es-MX", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

/** `AAAA-MM-DD` → «2 de octubre de 2026»; lo que no es un día vuelve tal cual. */
export function dia_legible(dia: string): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(dia) ? DIA_LEGIBLE.format(new Date(`${dia}T12:00:00Z`)) : dia;
}

/** Un instante ISO en la zona del negocio: «2 de octubre de 2026, 10:35». */
export function momento_legible(iso: string, zona = zona_valida()): string {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return iso;
  const [dia, hora] = sello_ahora(zona, new Date(ms)).split(" ");
  return `${dia_legible(dia!)}, ${hora}`;
}

/**
 * Solo el día de una fecha. El selector de fecha del lanzador manda un `Date`
 * serializado (`2026-09-27T06:00:00.000Z`, medianoche local en UTC): se toma el
 * día de esa cadena tal cual, que es el que eligió el usuario.
 */
export function solo_dia(value: unknown): unknown {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}T/.test(value) ? value.slice(0, 10) : value;
}

const DATA_URL = /^data:([a-z]+\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/=\s]+)$/i;

/** Una foto subida: la URL del adjunto y, si el núcleo la da, su miniatura en data URL. */
export type FotoGuardada = { url: string; miniatura: string };

export function es_foto_guardada(valor: unknown): valor is string {
  return typeof valor === "string" && /^(\/|https?:\/\/|data:image\/)/i.test(valor.trim());
}

/**
 * Una imagen del formulario llega como data URL; se guarda como adjunto de la
 * plataforma (`nox.files`, sobrevive a un redeploy). Lo que no es data URL
 * (URL ya guardada, vacío) da `null`.
 */
export async function subir_foto(
  ctx: Pick<KirletCtx, "nox">,
  recurso: string,
  record_id: string,
  valor: unknown,
): Promise<FotoGuardada | null> {
  if (typeof valor !== "string") return null;
  const m = DATA_URL.exec(valor.trim());
  if (!m) return null;
  const tipo = m[1]!.toLowerCase();
  if (!tipo.startsWith("image/")) falla(400, "Solo se aceptan imágenes", "archivo_invalido");
  const bytes = Uint8Array.from(atob(m[2]!.replace(/\s+/g, "")), (c) => c.charCodeAt(0));
  let guardado: NoxFileRef & { thumbnail?: string };
  try {
    guardado = await ctx.nox.files.save({
      resource: recurso,
      record_id,
      data: bytes,
      filename: `${recurso}-${record_id}.${tipo.split("/")[1]!.replace("jpeg", "jpg")}`,
      content_type: tipo,
    });
  } catch (error) {
    // El cliente del kit envuelve la respuesta: «Kirlet service plane 400: {"error":"…"}».
    const mensaje = error instanceof Error ? error.message : String(error);
    const motivo = /"error"\s*:\s*"([^"]+)"/.exec(mensaje)?.[1] ?? mensaje;
    falla(502, `No se pudo guardar la foto: ${motivo}`, "archivo_no_guardado");
  }
  if (!es_foto_guardada(guardado?.url)) {
    falla(502, "No se pudo guardar la foto: el servidor no la almacenó", "archivo_no_guardado");
  }
  return { url: guardado.url, miniatura: es_foto_guardada(guardado.thumbnail) ? guardado.thumbnail : "" };
}

/** Como `subir_foto`, para las columnas que solo guardan la URL: lo que no es data URL vuelve tal cual. */
export async function guardar_imagen(
  ctx: Pick<KirletCtx, "nox">,
  recurso: string,
  record_id: string,
  valor: unknown,
): Promise<unknown> {
  return (await subir_foto(ctx, recurso, record_id, valor))?.url ?? valor;
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
