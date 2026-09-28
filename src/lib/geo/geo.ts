/**
 * Coordenadas, distancia y enlaces a Google Maps **sin API key**: las URL
 * públicas cubren ver y navegar sin cuenta de Google Cloud.
 */

export type Punto = { lat: number; lon: number };

/** Radio medio de la Tierra en metros. */
const RADIO_TIERRA_M = 6_371_008.8;

const rad = (grados: number) => (grados * Math.PI) / 180;

/** Distancia entre dos coordenadas en metros (haversine). Único haversine de la app. */
export function distancia_m(a: Punto, b: Punto): number {
  const d_lat = rad(b.lat - a.lat);
  const d_lon = rad(b.lon - a.lon);
  const h =
    Math.sin(d_lat / 2) * Math.sin(d_lat / 2) +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(d_lon / 2) * Math.sin(d_lon / 2);
  return 2 * RADIO_TIERRA_M * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

export function punto_valido(lat: unknown, lon: unknown): Punto | null {
  if (typeof lat !== "number" || typeof lon !== "number") return null;
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  // Un dedazo al corregir a mano no debe producir un enlace que abra en el vacío.
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
  return { lat, lon };
}

/**
 * Seis decimales (once centímetros), siempre con punto: una coma decimal
 * dentro de una URL de Maps la rompe en silencio.
 */
export function formato_geo(p: Punto): string {
  return `${p.lat.toFixed(6)},${p.lon.toFixed(6)}`;
}

/** Lee `"lat,lon"`; null si no lo es o si cae fuera del planeta. */
export function leer_geo(raw: unknown): Punto | null {
  if (typeof raw !== "string") return null;
  const partes = raw.split(",");
  if (partes.length !== 2) return null;
  const lat = Number(partes[0]!.trim());
  const lon = Number(partes[1]!.trim());
  if (partes[0]!.trim() === "" || partes[1]!.trim() === "") return null;
  return punto_valido(lat, lon);
}

export function enlace_ver(p: Punto): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(formato_geo(p))}`;
}

/** `two_wheeler`: en México Maps ofrece rutas de moto, que evitan los ejes prohibidos. */
export function enlace_como_llegar(p: Punto): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(formato_geo(p))}&travelmode=two_wheeler`;
}

/** `geo:` abre la app de mapas instalada, sea cual sea. */
export function geo_uri(p: Punto, etiqueta?: string | null): string {
  const coords = formato_geo(p);
  const q = etiqueta?.trim() ? `${coords}(${encodeURIComponent(etiqueta.trim())})` : coords;
  return `geo:${coords}?q=${q}`;
}
