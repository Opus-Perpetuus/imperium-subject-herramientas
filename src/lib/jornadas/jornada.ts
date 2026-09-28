import type { DomainRow } from "@opus-perpetuus/imperium-core-kit";
import { leer_lectura, litros, type VehiculoCombustible } from "../combustible/litros.ts";
import { numero, texto } from "../comun.ts";

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

export type Calculados = {
  km_recorridos: number;
  gasolina_usada: number | null;
  rendimiento: number | null;
  ganancia_neta: number;
  por_entrega: number;
};

const redondear = (n: number, decimales: number) => Math.round(n * 10 ** decimales) / 10 ** decimales;

/** Litros de una lectura («3/6» o litros) con los ajustes del vehículo; null si no se puede saber. */
function litros_de(valor: unknown, ajustes: VehiculoCombustible | null): number | null {
  const lectura = leer_lectura(valor);
  return lectura ? (litros(lectura, ajustes ?? {})?.litros ?? null) : null;
}

/**
 * Los campos calculados de la jornada. Con dos o más tramos la distancia sale
 * tramo a tramo (dos vehículos no comparten odómetro); con uno, la misma regla
 * sobre los campos planos: odómetro si hay dos lecturas y no da negativo, si
 * no GPS. Sin lectura de gasolina (o sin tanque ni calibración para una
 * fracción del medidor) el consumo y el rendimiento quedan en null; una
 * lectura final de cero es válida.
 */
export function calcular(fila: DomainRow, ajustes: VehiculoCombustible | null = null): Calculados {
  const km_inicial = numero(fila.km_inicial);
  const km_final = numero(fila.km_final);
  const tramos = tramos_desde(fila.tramos);
  const odometro = km_inicial != null && km_final != null && km_final - km_inicial >= 0 ? km_final - km_inicial : null;
  const km_recorridos = redondear(tramos.length > 1 ? distancia_dia(tramos) : (odometro ?? numero(fila.km_gps) ?? 0), 1);
  const inicial = litros_de(fila.gasolina_inicial, ajustes);
  const final = litros_de(fila.gasolina_final, ajustes);
  const gasolina_usada = inicial != null && final != null && inicial - final >= 0 ? redondear(inicial - final, 2) : null;
  const rendimiento = gasolina_usada != null && gasolina_usada > 0 ? redondear(km_recorridos / gasolina_usada, 1) : null;
  const ingreso = numero(fila.ingreso) ?? 0;
  const gasto_gasolina = numero(fila.gasto_gasolina) ?? 0;
  const ganancia_neta = ingreso > 0 ? redondear(ingreso - gasto_gasolina, 2) : 0;
  const entregas = numero(fila.entregas) ?? 0;
  const por_entrega = entregas > 0 ? redondear(ganancia_neta / entregas, 2) : 0;
  return { km_recorridos, gasolina_usada, rendimiento, ganancia_neta, por_entrega };
}

const HORA = /^\s*(\d{1,2})\s*:\s*(\d{1,2})\s*$/;

/** «9:30», «22:5» o «22:30» → `HH:mm`; null si no es una hora del día. */
export function hora_hhmm(valor: unknown): string | null {
  const m = HORA.exec(texto(valor));
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

/**
 * El instante del apagado programado, o null si `hhmm` no es una hora. Una
 * hora anterior o igual a la de inicio es del día siguiente: arrancar a las
 * 21:00 y poner «02:00» es la madrugada que viene.
 */
export function fin_programado(hhmm: string, inicio: Date): Date | null {
  const hora = hora_hhmm(hhmm);
  if (!hora) return null;
  const fin = new Date(inicio);
  fin.setHours(Number(hora.slice(0, 2)), Number(hora.slice(3)), 0, 0);
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
 * Última lectura de odómetro del vehículo: el `km_final` de su último tramo
 * cerrado, en cualquier jornada (a media jornada se cambia de vehículo). Las
 * jornadas se ordenan por fecha y hora de inicio y sus tramos por el cierre;
 * una jornada sin tramos cuenta como uno con sus campos planos. Lo medido
 * solo por GPS no trae lectura y se salta: elegirlo dejaría la sugerencia muda.
 */
export function sugerir_km(jornadas: DomainRow[], vehiculo_id: string): number | null {
  const clave = (j: DomainRow) => `${texto(j.fecha)} ${texto(j.hora_inicio)} ${texto(j.created_at)}`;
  for (const j of [...jornadas].sort((a, b) => clave(b).localeCompare(clave(a)))) {
    const tramos = tramos_desde(j.tramos);
    if (!tramos.length) {
      if (texto(j.vehiculo_id) === vehiculo_id && numero(j.km_final) != null) return numero(j.km_final);
      continue;
    }
    const ultimo = tramos
      .filter((t) => t.vehiculo_id === vehiculo_id && t.fin && t.km_final != null)
      .sort((a, b) => b.fin!.localeCompare(a.fin!))[0];
    if (ultimo) return ultimo.km_final;
  }
  return null;
}
