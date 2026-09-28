import { distancia_m } from "../geo/geo.ts";
import { AJUSTES, es_preciso, type Ajustes, type PuntoGps } from "./analizador.ts";

/** Lo que le pasa a una parada mientras se conduce. */
export type EventoParada =
  | { tipo: "iniciada"; lat: number; lon: number; desde: string; quieto_ms: number }
  | { tipo: "terminada" };

/**
 * Detecta paradas **en vivo**, punto a punto. Comparte los umbrales del
 * analizador a propósito: si vivo y diferido usaran umbrales distintos, el
 * informe del día contradiría lo que la app preguntó en la calle.
 */
export class DetectorParadas {
  private ancla: PuntoGps | null = null;
  private anunciada = false;

  constructor(private readonly ajustes: Ajustes = AJUSTES) {}

  punto(p: PuntoGps): EventoParada | null {
    // Un punto impreciso cancelaría paradas reales todo el tiempo: se ignora.
    if (!es_preciso(p, this.ajustes)) return null;

    const actual = this.ancla;
    if (!actual) {
      this.ancla = p;
      return null;
    }

    if (distancia_m(actual, p) > this.ajustes.radio_parada_m) {
      // Se movió: el ancla pasa a ser aquí y el reloj empieza de nuevo.
      const estaba_anunciada = this.anunciada;
      this.ancla = p;
      this.anunciada = false;
      return estaba_anunciada ? { tipo: "terminada" } : null;
    }

    if (this.anunciada) return null;
    const quieto_ms = Date.parse(p.t) - Date.parse(actual.t);
    if (quieto_ms < this.ajustes.parada_min_ms) return null;

    this.anunciada = true;
    // Se anuncia el ancla y no el punto actual: es donde de verdad se detuvo.
    return { tipo: "iniciada", lat: actual.lat, lon: actual.lon, desde: actual.t, quieto_ms };
  }

  reiniciar(): void {
    this.ancla = null;
    this.anunciada = false;
  }
}
