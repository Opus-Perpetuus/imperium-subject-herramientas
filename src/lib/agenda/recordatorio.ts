import { numero, texto } from "../comun.ts";

/**
 * Recordatorios de la agenda. `fecha` y `inicio_minuto` se guardan aparte
 * (fecha ISO y minutos desde medianoche) en vez de un instante: un evento a las
 * 9:00 sigue siendo a las 9:00 aunque cambie la zona horaria. El instante del
 * aviso se calcula aquí, en la zona del usuario, para que Android solo programe.
 */

export const ZONA_POR_DEFECTO = "America/Mexico_City";

/** Cuánta antelación tiene el aviso; `-1` = sin aviso. */
export const ADELANTOS = [
  { value: -1, label: "Sin aviso" },
  { value: 0, label: "A la hora" },
  { value: 5, label: "5 min antes" },
  { value: 15, label: "15 min antes" },
  { value: 30, label: "30 min antes" },
  { value: 60, label: "1 h antes" },
  { value: 180, label: "3 h antes" },
  { value: 1440, label: "1 día antes" },
] as const;

export const ADELANTO_POR_DEFECTO = 15;
export const DURACION_POR_DEFECTO = 60;
/** Un evento nunca dura menos de esto en el calendario. */
export const DURACION_MINIMA = 15;
/** Un evento de día completo avisa a las 8:00; a medianoche nadie lo vería. */
export const MINUTO_TODO_EL_DIA = 8 * 60;

const FECHA = /^\d{4}-\d{2}-\d{2}$/;

export type EventoAgenda = {
  fecha: string;
  /** Minutos desde medianoche; `null` = todo el día. */
  inicio_minuto: number | null;
  duracion_min: number;
  recordatorio_min: number;
};

export function fecha_valida(value: unknown): boolean {
  const f = texto(value);
  return FECHA.test(f) && !Number.isNaN(Date.parse(`${f}T00:00:00Z`));
}

export function adelanto_valido(value: unknown): boolean {
  return ADELANTOS.some((a) => a.value === value);
}

/** Zona IANA utilizable, o la de por defecto si no llega o no existe. */
export function zona_valida(value: unknown): string {
  const zona = texto(value);
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

/** `AAAA-MM-DD` de hoy en la zona: el servidor corre en UTC y a las 19:00 de México ya es «mañana». */
export function hoy_en_zona(zona = ZONA_POR_DEFECTO, instante = new Date()): string {
  return new Date(instante.getTime() + desfase_minutos(zona, instante) * 60_000).toISOString().slice(0, 10);
}

/** Instante UTC de una hora de pared (`fecha` + minutos) en la zona dada. */
export function instante_local(fecha: string, minuto: number, zona: string): Date {
  const [y, m, d] = fecha.split("-").map(Number) as [number, number, number];
  const pared = Date.UTC(y, m - 1, d, 0, minuto);
  // Dos pasadas: el desfase se lee en el instante aproximado y se corrige por si cae en un cambio de horario.
  const aprox = new Date(pared - desfase_minutos(zona, new Date(pared)) * 60_000);
  return new Date(pared - desfase_minutos(zona, aprox) * 60_000);
}

/** Fila de `herr_agenda` → evento tipado con los valores por defecto. */
export function evento_desde(fila: Record<string, unknown>): EventoAgenda {
  return {
    fecha: texto(fila.fecha),
    inicio_minuto: numero(fila.inicio_minuto),
    duracion_min: numero(fila.duracion_min) ?? DURACION_POR_DEFECTO,
    recordatorio_min: numero(fila.recordatorio_min) ?? ADELANTO_POR_DEFECTO,
  };
}

/** Instante ISO en el que debe sonar el aviso, o `null` si no hay. */
export function recordatorio_en(evento: EventoAgenda, zona = ZONA_POR_DEFECTO): string | null {
  if (evento.recordatorio_min < 0 || !fecha_valida(evento.fecha)) return null;
  const minuto = evento.inicio_minuto ?? MINUTO_TODO_EL_DIA;
  const inicio = instante_local(evento.fecha, minuto, zona);
  return new Date(inicio.getTime() - evento.recordatorio_min * 60_000).toISOString();
}

/**
 * Inicio y fin del evento como en el calendario: todo el día arranca a
 * medianoche y el fin es el inicio más la duración, nunca menos de 15 min.
 */
export function inicio_fin(evento: EventoAgenda, zona = ZONA_POR_DEFECTO): { inicio_en: string; fin_en: string } {
  const inicio = instante_local(evento.fecha, evento.inicio_minuto ?? 0, zona);
  const minutos = Math.max(DURACION_MINIMA, evento.duracion_min);
  return {
    inicio_en: inicio.toISOString(),
    fin_en: new Date(inicio.getTime() + minutos * 60_000).toISOString(),
  };
}

/** Orden de agenda: por fecha y luego por hora; los de todo el día primero. */
export function ordenar_eventos<T extends Record<string, unknown>>(filas: T[]): T[] {
  const inicio = (f: T) => numero(f.inicio_minuto) ?? -1;
  return [...filas].sort(
    (a, b) =>
      texto(a.fecha).localeCompare(texto(b.fecha)) ||
      inicio(a) - inicio(b) ||
      texto(a.name).localeCompare(texto(b.name), "es"),
  );
}
