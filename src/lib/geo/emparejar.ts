import { distancia_m, punto_valido, type Punto } from "./geo.ts";

/**
 * Reconocer un domicilio ya visitado por cercanía: al marcar la entrega, el
 * GPS dice dónde estás y el directorio dice si ya habías estado ahí.
 */

/**
 * Cuarenta metros: un domicilio urbano ocupa unos diez de frente y el GPS en
 * calle yerra entre quince y veinticinco. Con más entra el vecino de enfrente.
 */
export const RADIO_M = 40;

/** Por debajo de esta separación, dos candidatos no se distinguen con GPS. */
export const AMBIGUEDAD_M = 15;

/** Grados de latitud por metro; sirve para descartar sin pagar el haversine. */
const GRADOS_POR_METRO = 1 / 111_320;

export type Candidato<T> = { fila: T; distancia_m: number };

type ConCoordenadas = { lat?: unknown; lon?: unknown };

/** Filas dentro del radio, de la más cercana a la más lejana. Sin coordenadas se ignoran. */
export function cercanos<T extends ConCoordenadas>(
  aqui: Punto,
  filas: T[],
  radio_m = RADIO_M,
): Candidato<T>[] {
  const ventana_lat = radio_m * GRADOS_POR_METRO;
  const out: Candidato<T>[] = [];
  for (const fila of filas) {
    const punto = punto_valido(fila.lat, fila.lon);
    if (!punto) continue;
    // Filtro barato antes del caro: con cientos de domicilios se nota en la calle.
    if (Math.abs(punto.lat - aqui.lat) > ventana_lat) continue;
    const metros = distancia_m(aqui, punto);
    if (metros > radio_m) continue;
    out.push({ fila, distancia_m: metros });
  }
  return out.sort((a, b) => a.distancia_m - b.distancia_m);
}

/**
 * El acierto inequívoco, o null si hay dudas. Con dos casas contiguas es mejor
 * preguntar que marcar como entregado el pedido equivocado.
 */
export function mejor<T>(candidatos: Candidato<T>[], ambiguedad_m = AMBIGUEDAD_M): Candidato<T> | null {
  const primero = candidatos[0];
  if (!primero) return null;
  const segundo = candidatos[1];
  if (!segundo) return primero;
  return segundo.distancia_m - primero.distancia_m > ambiguedad_m ? primero : null;
}

export function emparejar<T extends ConCoordenadas>(aqui: Punto, filas: T[], radio_m = RADIO_M) {
  const candidatos = cercanos(aqui, filas, radio_m);
  const elegido = mejor(candidatos);
  return { mejor: elegido, candidatos, ambiguo: candidatos.length > 0 && elegido === null };
}
