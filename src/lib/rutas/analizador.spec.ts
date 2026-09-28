import { describe, expect, test } from "bun:test";
import { analizar, formatear_duracion, punto_gps_valido, type PuntoGps } from "./analizador.ts";

const T0 = 1_700_000_000_000;

/** Un grado de latitud ≈ 111 320 m: recorridos con distancia conocida. */
export function punto(metros_norte: number, en_ms: number, acc = 5): PuntoGps {
  return {
    t: new Date(en_ms).toISOString(),
    lat: 20.6736 + metros_norte / 111_320,
    lon: -103.344,
    acc,
  };
}

describe("analizador de rutas", () => {
  test("un recorrido recto suma su distancia", () => {
    const puntos = Array.from({ length: 11 }, (_, i) => punto(i * 50, T0 + i * 10_000));
    const informe = analizar(puntos);
    expect(informe.distancia_m).toBeCloseTo(500, -1);
    expect(informe.paradas).toHaveLength(0);
  });

  test("los puntos imprecisos se descartan y se cuentan", () => {
    const informe = analizar([punto(0, T0), punto(500, T0 + 10_000, 80), punto(50, T0 + 20_000)]);
    expect(informe.puntos_descartados).toBe(1);
    expect(informe.distancia_m).toBeCloseTo(50, -1);
  });

  test("el ruido del receptor estando quieto no suma distancia", () => {
    const puntos = Array.from({ length: 21 }, (_, i) => punto(i * 1, T0 + i * 3_000));
    expect(analizar(puntos).distancia_m).toBe(0);
  });

  test("una detención larga se registra como parada", () => {
    const puntos: PuntoGps[] = [];
    for (let i = 0; i < 6; i++) puntos.push(punto(i * 50, T0 + i * 10_000));
    const inicio_parada = T0 + 60_000;
    for (let i = 0; i < 11; i++) puntos.push(punto(250, inicio_parada + i * 30_000));
    const sigue = inicio_parada + 330_000;
    for (let i = 0; i < 4; i++) puntos.push(punto(300 + i * 50, sigue + i * 10_000));
    const informe = analizar(puntos);
    expect(informe.paradas).toHaveLength(1);
    expect(informe.paradas[0]!.duracion_ms).toBeGreaterThanOrEqual(300_000);
    expect(informe.movimiento_ms).toBeGreaterThan(0);
    expect(informe.parado_ms).toBe(informe.paradas[0]!.duracion_ms);
  });

  test("una detención breve (semáforo) no cuenta como parada", () => {
    const puntos: PuntoGps[] = [];
    for (let i = 0; i < 3; i++) puntos.push(punto(i * 50, T0 + i * 10_000));
    for (let i = 0; i < 4; i++) puntos.push(punto(100, T0 + 30_000 + i * 10_000));
    for (let i = 0; i < 3; i++) puntos.push(punto(150 + i * 50, T0 + 80_000 + i * 10_000));
    expect(analizar(puntos).paradas).toHaveLength(0);
  });

  test("un hueco de señal no cuenta ni como movimiento ni como parada", () => {
    const informe = analizar([
      punto(0, T0),
      punto(50, T0 + 10_000),
      punto(3_050, T0 + 310_000),
      punto(3_100, T0 + 320_000),
    ]);
    expect(informe.distancia_m).toBeCloseTo(100, -1);
  });

  test("un hueco con los extremos en el mismo sitio es parada, no pérdida de señal", () => {
    const puntos: PuntoGps[] = [];
    for (let i = 0; i < 3; i++) puntos.push(punto(i * 50, T0 + i * 10_000));
    puntos.push(punto(105, T0 + 30_000));
    puntos.push(punto(110, T0 + 270_000));
    for (let i = 0; i < 3; i++) puntos.push(punto(150 + i * 50, T0 + 280_000 + i * 10_000));
    const informe = analizar(puntos);
    expect(informe.paradas).toHaveLength(1);
    expect(informe.paradas[0]!.duracion_ms).toBeGreaterThanOrEqual(240_000);
  });

  test("un recorrido lento en línea recta no se confunde con una parada", () => {
    const puntos = Array.from({ length: 21 }, (_, i) => punto(i * 20, T0 + i * 60_000));
    const informe = analizar(puntos);
    expect(informe.paradas).toHaveLength(0);
    expect(informe.distancia_m).toBeCloseTo(400, -1);
  });

  test("menos de dos puntos produce un informe vacío pero válido", () => {
    const informe = analizar([punto(0, T0)]);
    expect(informe.distancia_m).toBe(0);
    expect(informe.paradas).toHaveLength(0);
    expect(informe.iniciada).toBe(new Date(T0).toISOString());
    expect(analizar([]).iniciada).toBeNull();
  });

  test("la velocidad media solo considera el tiempo en movimiento", () => {
    const puntos: PuntoGps[] = [];
    for (let i = 0; i < 11; i++) puntos.push(punto(i * 50, T0 + i * 10_000));
    for (let i = 0; i < 11; i++) puntos.push(punto(500, T0 + 100_000 + i * 30_000));
    expect(analizar(puntos).velocidad_media_mps).toBeCloseTo(5, 0);
  });

  test("los puntos desordenados se analizan en orden de tiempo", () => {
    const puntos = Array.from({ length: 11 }, (_, i) => punto(i * 50, T0 + i * 10_000)).reverse();
    expect(analizar(puntos).distancia_m).toBeCloseTo(500, -1);
  });

  test("formatear_duracion es legible", () => {
    expect(formatear_duracion(45 * 60_000)).toBe("45 min");
    expect(formatear_duracion((2 * 60 + 15) * 60_000)).toBe("2 h 15 min");
    expect(formatear_duracion(3 * 60 * 60_000)).toBe("3 h");
  });

  test("punto_gps_valido filtra lo ilegible", () => {
    expect(punto_gps_valido({ t: "2026-09-27T10:00:00Z", lat: 19.4, lon: -99.1, acc: 8 })).toEqual({
      t: "2026-09-27T10:00:00Z",
      lat: 19.4,
      lon: -99.1,
      acc: 8,
    });
    expect(punto_gps_valido({ t: "ayer", lat: 19.4, lon: -99.1 })).toBeNull();
    expect(punto_gps_valido({ t: "2026-09-27T10:00:00Z", lat: "19.4", lon: -99.1 })).toBeNull();
    expect(punto_gps_valido({ t: "2026-09-27T10:00:00Z", lat: 95, lon: -99.1 })).toBeNull();
    expect(punto_gps_valido(null)).toBeNull();
  });
});
