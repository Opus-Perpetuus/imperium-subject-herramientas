import { distancia_m } from "../geo/geo.ts";

/**
 * Convierte una lista de puntos GPS en un informe de ruta. Lógica pura.
 */

/** Una lectura del GPS tal como la guarda `herr_rutas.puntos`. */
export type PuntoGps = {
  /** Instante ISO. */
  t: string;
  lat: number;
  lon: number;
  /** Precisión en metros; cuanto mayor, menos fiable. Ausente = fiable. */
  acc?: number;
  /** Metros por segundo según el proveedor. */
  spd?: number;
};

export type Ajustes = {
  /** Un punto con 60 m de error salta media cuadra: descartarlo es más exacto que promediarlo. */
  precision_max_m: number;
  /** Por debajo es ruido del receptor: un teléfono inmóvil acumula metros si se suma cada micro-variación. */
  paso_min_m: number;
  /** Radio dentro del cual se considera que no hubo desplazamiento. */
  radio_parada_m: number;
  /** Tiempo mínimo quieto para llamarlo parada. */
  parada_min_ms: number;
  /** Hueco a partir del cual el tramo no cuenta: la recta entre extremos no se parece al camino. */
  hueco_senal_ms: number;
};

export const AJUSTES: Ajustes = {
  precision_max_m: 35,
  paso_min_m: 4,
  radio_parada_m: 18,
  parada_min_ms: 90_000,
  hueco_senal_ms: 120_000,
};

export type Parada = {
  desde: string;
  hasta: string;
  duracion_ms: number;
  /** Posición media del grupo: promediar amortigua el zigzagueo del receptor. */
  lat: number;
  lon: number;
};

/**
 * `movimiento_ms` y `parado_ms` se calculan por separado y no como resta del
 * total: los huecos sin señal no son ni movimiento ni parada.
 */
export type Informe = {
  iniciada: string | null;
  terminada: string | null;
  distancia_m: number;
  movimiento_ms: number;
  parado_ms: number;
  paradas: Parada[];
  /** Metros por segundo, solo sobre el tiempo en movimiento. */
  velocidad_media_mps: number;
  velocidad_max_mps: number;
  /** Puntos descartados por precisión insuficiente. */
  puntos_descartados: number;
};

export type PuntoMs = PuntoGps & { ms: number };

export function punto_gps_valido(raw: unknown): PuntoGps | null {
  if (!raw || typeof raw !== "object") return null;
  const p = raw as Record<string, unknown>;
  const ms = typeof p.t === "string" ? Date.parse(p.t) : NaN;
  if (!Number.isFinite(ms)) return null;
  if (typeof p.lat !== "number" || typeof p.lon !== "number") return null;
  if (Math.abs(p.lat) > 90 || Math.abs(p.lon) > 180) return null;
  const out: PuntoGps = { t: p.t as string, lat: p.lat, lon: p.lon };
  if (typeof p.acc === "number" && Number.isFinite(p.acc)) out.acc = p.acc;
  if (typeof p.spd === "number" && Number.isFinite(p.spd)) out.spd = p.spd;
  return out;
}

export function con_ms(puntos: PuntoGps[]): PuntoMs[] {
  return puntos.map((p) => ({ ...p, ms: Date.parse(p.t) }));
}

export function ordenar_por_tiempo(puntos: PuntoGps[]): PuntoMs[] {
  return con_ms(puntos).sort((a, b) => a.ms - b.ms);
}

export const es_preciso = (p: PuntoGps, ajustes: Ajustes) => (p.acc ?? 0) <= ajustes.precision_max_m;

/**
 * Agrupa puntos consecutivos que caben en `radio_parada_m` y duran al menos
 * `parada_min_ms`. El ancla es el primer punto del grupo, no un centroide: con
 * centroide un recorrido lento en línea recta se registraría como una parada.
 * Un hueco largo NO rompe el grupo: el receptor calla estando quieto, y el
 * silencio con regreso dentro del radio es la firma de una parada real.
 */
function detectar_paradas(puntos: PuntoMs[], ajustes: Ajustes): Parada[] {
  const paradas: Parada[] = [];
  let ancla = 0;

  const cerrar = (ultimo: number) => {
    const a = puntos[ancla]!;
    const u = puntos[ultimo]!;
    const duracion = u.ms - a.ms;
    if (duracion < ajustes.parada_min_ms) return;
    const grupo = puntos.slice(ancla, ultimo + 1);
    paradas.push({
      desde: a.t,
      hasta: u.t,
      duracion_ms: duracion,
      lat: grupo.reduce((s, p) => s + p.lat, 0) / grupo.length,
      lon: grupo.reduce((s, p) => s + p.lon, 0) / grupo.length,
    });
  };

  for (let i = 1; i < puntos.length; i++) {
    if (distancia_m(puntos[ancla]!, puntos[i]!) > ajustes.radio_parada_m) {
      cerrar(i - 1);
      ancla = i;
    }
  }
  cerrar(puntos.length - 1);
  return paradas;
}

/**
 * Las paradas se detectan por agrupación posicional, no por velocidad: la
 * velocidad del GPS a baja marcha es ruido.
 */
export function analizar(puntos: PuntoGps[], ajustes: Ajustes = AJUSTES): Informe {
  const descartados = puntos.filter((p) => !es_preciso(p, ajustes)).length;
  const limpios = ordenar_por_tiempo(puntos.filter((p) => es_preciso(p, ajustes)));

  if (limpios.length < 2) {
    const todos = ordenar_por_tiempo(puntos);
    return {
      iniciada: todos[0]?.t ?? null,
      terminada: todos[todos.length - 1]?.t ?? null,
      distancia_m: 0,
      movimiento_ms: 0,
      parado_ms: 0,
      paradas: [],
      velocidad_media_mps: 0,
      velocidad_max_mps: 0,
      puntos_descartados: descartados,
    };
  }

  const paradas = detectar_paradas(limpios, ajustes);
  const rangos = paradas.map((p) => [Date.parse(p.desde), Date.parse(p.hasta)] as const);

  let distancia = 0;
  let movimiento_ms = 0;
  let max = 0;
  for (let i = 1; i < limpios.length; i++) {
    const prev = limpios[i - 1]!;
    const curr = limpios[i]!;
    const dt = curr.ms - prev.ms;
    if (dt > ajustes.hueco_senal_ms) continue;
    const paso = distancia_m(prev, curr);
    const en_parada = rangos.some(([desde, hasta]) => curr.ms >= desde && curr.ms <= hasta);
    if (!en_parada && paso >= ajustes.paso_min_m) {
      distancia += paso;
      movimiento_ms += dt;
      if (dt > 0) max = Math.max(max, paso / (dt / 1000));
    }
  }

  return {
    iniciada: limpios[0]!.t,
    terminada: limpios[limpios.length - 1]!.t,
    distancia_m: distancia,
    movimiento_ms,
    parado_ms: paradas.reduce((s, p) => s + p.duracion_ms, 0),
    paradas,
    velocidad_media_mps: movimiento_ms > 0 ? distancia / (movimiento_ms / 1000) : 0,
    velocidad_max_mps: max,
    puntos_descartados: descartados,
  };
}

/** "2 h 15 min" o "45 min". */
export function formatear_duracion(ms: number): string {
  const minutos_totales = Math.floor(Math.abs(ms) / 60_000);
  const horas = Math.floor(minutos_totales / 60);
  const minutos = minutos_totales % 60;
  if (horas > 0 && minutos > 0) return `${horas} h ${minutos} min`;
  if (horas > 0) return `${horas} h`;
  return `${minutos} min`;
}
