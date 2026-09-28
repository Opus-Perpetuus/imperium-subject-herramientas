import { describe, expect, test } from "bun:test";
import { odometro_al_cierre } from "./odometro.ts";

describe("odómetro al cierre", () => {
  test("suma los km GPS del tramo a la lectura de apertura", () => {
    expect(odometro_al_cierre(1000, 5, 15)).toBeCloseTo(1010, 9);
  });

  test("nunca devuelve la apertura si el GPS se movió", () => {
    const cierre = odometro_al_cierre(12_345.6, 0, 3.2);
    expect(cierre - 12_345.6).toBeCloseTo(3.2, 9);
  });

  test("un GPS que retrocede cuenta cero", () => {
    expect(odometro_al_cierre(100, 10, 9)).toBe(100);
  });
});
