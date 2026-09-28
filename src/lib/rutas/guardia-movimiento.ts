/**
 * Decide si el vehículo va en marcha, con histéresis para no parpadear: un
 * alto de semáforo no puede apagar el contestador y arrancar tras el alto no
 * puede volver a encenderlo.
 */

export type EstadoMovimiento = {
  /** Régimen actual ya confirmado. */
  en_marcha: boolean;
  /** Desde cuándo (ms) la velocidad apunta al régimen contrario. 0 = no apunta. */
  desde: number;
};

export type Transicion = "arranco" | "se_detuvo";

/** ~14 km/h: por encima ya no es alguien caminando con el teléfono en la mano. */
export const EN_MARCHA_MPS = 4.0;
/** ~5 km/h: por debajo está parado; el margen absorbe el ruido del receptor. */
export const PARADO_MPS = 1.5;
/** Medio minuto en marcha antes de tocar nada: una salida de garaje no cuenta. */
export const A_MARCHA_MS = 30_000;
/** Dos minutos y medio parado: cubre de sobra el semáforo más largo. */
export const A_PARADO_MS = 150_000;

export const ESTADO_INICIAL: EstadoMovimiento = { en_marcha: false, desde: 0 };

export function al_recibir_velocidad(
  estado: EstadoMovimiento,
  velocidad_mps: number,
  ahora_ms: number,
): { estado: EstadoMovimiento; transicion: Transicion | null } {
  const apunta = estado.en_marcha ? velocidad_mps < PARADO_MPS : velocidad_mps > EN_MARCHA_MPS;

  // La velocidad volvió al régimen actual: el reloj del cambio se reinicia.
  if (!apunta) return { estado: { ...estado, desde: 0 }, transicion: null };

  // Primera muestra que apunta al cambio: empieza a contar, sin decidir nada.
  if (estado.desde === 0) return { estado: { ...estado, desde: ahora_ms }, transicion: null };

  const umbral = estado.en_marcha ? A_PARADO_MS : A_MARCHA_MS;
  if (ahora_ms - estado.desde < umbral) return { estado, transicion: null };

  const nuevo = !estado.en_marcha;
  return {
    estado: { en_marcha: nuevo, desde: 0 },
    transicion: nuevo ? "arranco" : "se_detuvo",
  };
}
