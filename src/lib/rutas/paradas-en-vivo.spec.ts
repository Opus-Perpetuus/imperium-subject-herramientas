import { describe, expect, test } from "bun:test";
import { DetectorParadas } from "./paradas-en-vivo.ts";
import type { PuntoGps } from "./analizador.ts";

const BASE = 1_700_000_000_000;
const LAT = 19.4326;

function punto(segundos: number, metros_norte = 0, acc = 8): PuntoGps {
  return {
    t: new Date(BASE + segundos * 1000).toISOString(),
    lat: LAT + metros_norte / 111_320,
    lon: -99.1332,
    acc,
  };
}

describe("detector de paradas en vivo", () => {
  test("quieto menos del umbral no es parada; pasado el umbral sí, y se anuncia una vez", () => {
    const d = new DetectorParadas();
    expect(d.punto(punto(0))).toBeNull();
    expect(d.punto(punto(30, 2))).toBeNull();
    expect(d.punto(punto(60, 3))).toBeNull();
    const evento = d.punto(punto(95, 3));
    expect(evento?.tipo).toBe("iniciada");
    if (evento?.tipo === "iniciada") {
      expect(evento.lat).toBeCloseTo(LAT, 4);
      expect(evento.desde).toBe(punto(0).t);
    }
    expect(d.punto(punto(120, 3))).toBeNull();
    expect(d.punto(punto(150, 1))).toBeNull();
  });

  test("alejarse reinicia el conteo y arrancar termina la parada", () => {
    const d = new DetectorParadas();
    d.punto(punto(0));
    d.punto(punto(60, 2));
    expect(d.punto(punto(70, 200))).toBeNull();
    expect(d.punto(punto(120, 202))).toBeNull();
    expect(d.punto(punto(170, 203))?.tipo).toBe("iniciada");
    expect(d.punto(punto(200, 500))).toEqual({ tipo: "terminada" });
    d.punto(punto(210, 502));
    expect(d.punto(punto(310, 503))?.tipo).toBe("iniciada");
  });

  test("un punto impreciso no rompe una parada; reiniciar olvida lo que llevaba", () => {
    const d = new DetectorParadas();
    d.punto(punto(0));
    d.punto(punto(40, 150, 70));
    expect(d.punto(punto(95, 2))?.tipo).toBe("iniciada");
    d.reiniciar();
    expect(d.punto(punto(100))).toBeNull();
    expect(d.punto(punto(130, 3))).toBeNull();
  });
});
