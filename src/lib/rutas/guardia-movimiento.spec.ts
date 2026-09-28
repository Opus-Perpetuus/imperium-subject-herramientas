import { describe, expect, test } from "bun:test";
import { ESTADO_INICIAL, al_recibir_velocidad, type EstadoMovimiento } from "./guardia-movimiento.ts";

const T0 = 1_700_000_000_000;
const seg = (s: number) => T0 + s * 1000;
/** 20 km/h ≈ 5.6 m/s: en marcha. 0.5 m/s: parado con ruido del GPS. */
const EN_MARCHA = 5.6;
const PARADO = 0.5;

function en_marcha_confirmada(): EstadoMovimiento {
  let e = al_recibir_velocidad(ESTADO_INICIAL, EN_MARCHA, seg(0)).estado;
  e = al_recibir_velocidad(e, EN_MARCHA, seg(40)).estado;
  return e;
}

describe("guardia de movimiento", () => {
  test("un instante en marcha no enciende; sostenido sí, y una sola vez", () => {
    const e = al_recibir_velocidad(ESTADO_INICIAL, EN_MARCHA, seg(0)).estado;
    expect(al_recibir_velocidad(e, EN_MARCHA, seg(5)).transicion).toBeNull();
    const r = al_recibir_velocidad(e, EN_MARCHA, seg(40));
    expect(r.transicion).toBe("arranco");
    expect(r.estado.en_marcha).toBe(true);
    expect(al_recibir_velocidad(r.estado, EN_MARCHA, seg(90)).transicion).toBeNull();
  });

  test("un alto corto no apaga y arrancar tras el alto no vuelve a encender", () => {
    let e = en_marcha_confirmada();
    e = al_recibir_velocidad(e, PARADO, seg(60)).estado;
    const r = al_recibir_velocidad(e, PARADO, seg(100));
    expect(r.transicion).toBeNull();
    expect(r.estado.en_marcha).toBe(true);
    expect(al_recibir_velocidad(e, EN_MARCHA, seg(75)).transicion).toBeNull();
  });

  test("estar parado de verdad apaga, y no se apaga dos veces", () => {
    let e = en_marcha_confirmada();
    e = al_recibir_velocidad(e, PARADO, seg(60)).estado;
    const r = al_recibir_velocidad(e, PARADO, seg(240));
    expect(r.transicion).toBe("se_detuvo");
    expect(r.estado.en_marcha).toBe(false);
    expect(al_recibir_velocidad(r.estado, PARADO, seg(400)).transicion).toBeNull();
  });

  test("caminar no enciende", () => {
    const e = al_recibir_velocidad(ESTADO_INICIAL, 1.4, seg(0)).estado;
    expect(al_recibir_velocidad(e, 1.4, seg(120)).transicion).toBeNull();
  });
});
