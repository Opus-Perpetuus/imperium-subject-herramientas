import type { DomainRow, KirletCtx } from "@opus-perpetuus/imperium-core-kit";
import { filas_de, numero, texto } from "../comun.ts";

/**
 * Reglas puras de la jornada: tramos por vehículo, distancia, consumo,
 * campos calculados, fin programado, política de odómetro y sugerencia de km.
 */

/**
 * Un tramo de jornada con un vehículo concreto. Cambiar de vehículo a media
 * jornada abre otro sin cortar la ruta GPS: `gps_m_inicio/fin` recortan la
 * traza continua del día en la porción de cada vehículo.
 */
export type Tramo = {
  vehiculo_id: string;
  vehiculo_nombre: string;
  /** ISO. */
  inicio: string;
  fin: string | null;
  km_inicial: number | null;
  km_final: number | null;
  gps_m_inicio: number;
  gps_m_fin: number | null;
};

/** Lee `tramos` (json) con tolerancia: lo que no sea un tramo se descarta. */
export function tramos_desde(raw: unknown): Tramo[] {
  let valor = raw;
  if (typeof valor === "string") {
    try {
      valor = JSON.parse(valor);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(valor)) return [];
  return valor
    .filter((t): t is Record<string, unknown> => !!t && typeof t === "object")
    .map((t) => ({
      vehiculo_id: texto(t.vehiculo_id),
      vehiculo_nombre: texto(t.vehiculo_nombre),
      inicio: texto(t.inicio),
      fin: texto(t.fin) || null,
      km_inicial: numero(t.km_inicial),
      km_final: numero(t.km_final),
      gps_m_inicio: numero(t.gps_m_inicio) ?? 0,
      gps_m_fin: numero(t.gps_m_fin),
    }));
}

/** Km del tramo: odómetro si están las dos lecturas y no da negativo; si no, GPS. */
export function distancia_tramo(t: Tramo): number | null {
  if (t.km_inicial != null && t.km_final != null && t.km_final - t.km_inicial >= 0) {
    return t.km_final - t.km_inicial;
  }
  if (t.gps_m_fin != null) return Math.max(0, t.gps_m_fin - t.gps_m_inicio) / 1000;
  return null;
}

/** Distancia del día con la regla de `distancia_tramo` tramo a tramo. */
export function distancia_dia(tramos: Tramo[]): number {
  return tramos.reduce((s, t) => s + (distancia_tramo(t) ?? 0), 0);
}

/**
 * Litros de una lectura de combustible. Un número son litros; «3/6» es una
 * fracción del medidor que se convierte con la capacidad del tanque y, sin
 * ella, queda en unidades de sección (el rendimiento sale por sección).
 */
export function nivel_litros(valor: unknown, tanque_litros: number | null = null): number | null {
  const raw = texto(valor);
  if (!raw) return null;
  const m = /^(\d+(?:[.,]\d+)?)\s*\/\s*(\d+(?:[.,]\d+)?)$/.exec(raw);
  if (!m) return numero(raw);
  const a = numero(m[1]) ?? 0;
  const b = numero(m[2]) ?? 0;
  if (b <= 0) return null;
  return tanque_litros != null && tanque_litros > 0 ? (a / b) * tanque_litros : a;
}

export type Calculados = {
  km_recorridos: number;
  gasolina_usada: number;
  rendimiento: number;
  ganancia_neta: number;
  por_entrega: number;
};

const redondear = (n: number, decimales: number) => Math.round(n * 10 ** decimales) / 10 ** decimales;

/**
 * Los campos calculados de la jornada. Con dos o más tramos la distancia sale
 * tramo a tramo (dos vehículos no comparten odómetro); con uno, del odómetro
 * si hay lectura final y si no, del GPS.
 */
export function calcular(fila: DomainRow, tanque_litros: number | null = null): Calculados {
  const km_inicial = numero(fila.km_inicial) ?? 0;
  const km_final = numero(fila.km_final) ?? 0;
  const km_gps = numero(fila.km_gps) ?? 0;
  const tramos = tramos_desde(fila.tramos);
  const km_recorridos = redondear(
    tramos.length > 1 ? distancia_dia(tramos) : km_final > 0 ? km_final - km_inicial : km_gps,
    1,
  );
  const inicial = nivel_litros(fila.gasolina_inicial, tanque_litros) ?? 0;
  const final = nivel_litros(fila.gasolina_final, tanque_litros) ?? 0;
  const gasolina_usada = redondear(final > 0 ? inicial - final : 0, 2);
  const rendimiento = gasolina_usada > 0 ? redondear(km_recorridos / gasolina_usada, 1) : 0;
  const ingreso = numero(fila.ingreso) ?? 0;
  const gasto_gasolina = numero(fila.gasto_gasolina) ?? 0;
  const ganancia_neta = ingreso > 0 ? redondear(ingreso - gasto_gasolina, 2) : 0;
  const entregas = numero(fila.entregas) ?? 0;
  const por_entrega = entregas > 0 ? redondear(ganancia_neta / entregas, 2) : 0;
  return { km_recorridos, gasolina_usada, rendimiento, ganancia_neta, por_entrega };
}

export const HORA = /^([01]\d|2[0-3]):([0-5]\d)$/;

/**
 * El instante del apagado programado, o null si `hhmm` no es una hora. Una
 * hora anterior o igual a la de inicio es del día siguiente: arrancar a las
 * 21:00 y poner «02:00» es la madrugada que viene.
 */
export function fin_programado(hhmm: string, inicio: Date): Date | null {
  const m = HORA.exec(texto(hhmm));
  if (!m) return null;
  const fin = new Date(inicio);
  fin.setHours(Number(m[1]), Number(m[2]), 0, 0);
  if (fin.getTime() <= inicio.getTime()) fin.setDate(fin.getDate() + 1);
  return fin;
}

/** Minutos que faltan, con piso en cero. */
export function minutos_restantes(fin: Date, ahora: Date): number {
  return Math.max(0, Math.floor((fin.getTime() - ahora.getTime()) / 60_000));
}

/**
 * Si un tramo admite lectura de odómetro: el vehículo manda (velocímetro
 * muerto = solo GPS) y la jornada tiene derecho de veto (si arrancó midiendo
 * por GPS, sus totales están hechos así).
 */
export function pide_odometro(vehiculo: DomainRow | null, jornada: DomainRow | null): boolean {
  return !!vehiculo && vehiculo.solo_gps !== true && jornada?.solo_gps !== true;
}

/**
 * Última lectura de odómetro del vehículo según la tabla de jornadas. Las
 * jornadas sin `km_final` se saltan: una medida solo por GPS no trae lectura
 * y elegirla dejaría la sugerencia muda.
 */
export function sugerir_km(jornadas: DomainRow[], vehiculo_id: string): number | null {
  const con_lectura = jornadas
    .filter((j) => texto(j.vehiculo_id) === vehiculo_id && numero(j.km_final) != null)
    .sort((a, b) => texto(b.fecha).localeCompare(texto(a.fecha)));
  return con_lectura.length ? numero(con_lectura[0]!.km_final) : null;
}

/** La jornada abierta más reciente, o null si no hay ninguna en curso. */
export async function jornada_activa(ctx: Pick<KirletCtx, "data">): Promise<DomainRow | null> {
  const abiertas = await filas_de(ctx, "herr_jornadas", { estado: "abierta", is_active: true });
  return abiertas.sort((a, b) => texto(b.created_at).localeCompare(texto(a.created_at)))[0] ?? null;
}

/**
 * Ajustes de reparto del vehículo (`herr_vehiculos`, clave `vehiculo_id` =
 * id del `vehicle` de subject-vehiculos), o null si no hay fila: entonces
 * el vehículo mide con odómetro y no se conoce la capacidad del tanque.
 */
export async function ajustes_vehiculo(ctx: Pick<KirletCtx, "data">, vehiculo_id: unknown): Promise<DomainRow | null> {
  const id = texto(vehiculo_id);
  if (!id) return null;
  const fila = await ctx.data.findOne("herr_vehiculos", { vehiculo_id: id });
  return fila && fila.is_active !== false ? fila : null;
}
