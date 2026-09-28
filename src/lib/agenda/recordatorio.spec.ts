import { describe, expect, test } from "bun:test";
import {
  ADELANTOS,
  adelanto_valido,
  desfase_minutos,
  evento_desde,
  fecha_valida,
  hoy_en_zona,
  inicio_fin,
  instante_local,
  ordenar_eventos,
  recordatorio_en,
  zona_valida,
  type EventoAgenda,
} from "./recordatorio.ts";

function evento(extra: Partial<EventoAgenda> = {}): EventoAgenda {
  return { fecha: "2026-09-28", inicio_minuto: null, duracion_min: 60, recordatorio_min: 15, ...extra };
}

describe("zona y desfase", () => {
  test("México va 6 horas detrás de UTC (sin horario de verano desde 2022)", () => {
    expect(desfase_minutos("America/Mexico_City", new Date("2026-09-28T12:00:00Z"))).toBe(-360);
    expect(desfase_minutos("America/Mexico_City", new Date("2026-01-15T12:00:00Z"))).toBe(-360);
    expect(desfase_minutos("UTC", new Date("2026-09-28T12:00:00Z"))).toBe(0);
  });

  test("una hora de pared se convierte a instante en la zona, incluso con horario de verano", () => {
    expect(instante_local("2026-09-28", 9 * 60, "America/Mexico_City").toISOString()).toBe("2026-09-28T15:00:00.000Z");
    // Madrid en verano: UTC+2.
    expect(instante_local("2026-07-01", 9 * 60, "Europe/Madrid").toISOString()).toBe("2026-07-01T07:00:00.000Z");
    // Madrid en invierno: UTC+1.
    expect(instante_local("2026-01-01", 9 * 60, "Europe/Madrid").toISOString()).toBe("2026-01-01T08:00:00.000Z");
  });

  test("hoy se decide en la zona, no en UTC", () => {
    const madrugada_utc = new Date("2026-09-28T02:00:00Z");
    expect(hoy_en_zona("America/Mexico_City", madrugada_utc)).toBe("2026-09-27");
    expect(hoy_en_zona("UTC", madrugada_utc)).toBe("2026-09-28");
  });

  test("una zona inexistente o vacía cae a la de por defecto", () => {
    expect(zona_valida("Marte/Olympus")).toBe("America/Mexico_City");
    expect(zona_valida("")).toBe("America/Mexico_City");
    expect(zona_valida("Europe/Madrid")).toBe("Europe/Madrid");
  });
});

describe("recordatorio_en", () => {
  test("evento con hora: la hora menos el adelanto", () => {
    expect(recordatorio_en(evento({ inicio_minuto: 9 * 60 + 30, recordatorio_min: 30 }))).toBe("2026-09-28T15:00:00.000Z");
    expect(recordatorio_en(evento({ inicio_minuto: 9 * 60, recordatorio_min: 0 }))).toBe("2026-09-28T15:00:00.000Z");
  });

  test("todo el día avisa a las 08:00 locales", () => {
    expect(recordatorio_en(evento({ recordatorio_min: 15 }))).toBe("2026-09-28T13:45:00.000Z");
    expect(recordatorio_en(evento({ recordatorio_min: 1440 }))).toBe("2026-09-27T14:00:00.000Z");
  });

  test("sin aviso o con fecha inválida no hay instante", () => {
    expect(recordatorio_en(evento({ recordatorio_min: -1 }))).toBeNull();
    expect(recordatorio_en(evento({ fecha: "2026-13-40" }))).toBeNull();
    expect(recordatorio_en(evento({ fecha: "" }))).toBeNull();
  });

  test("respeta la zona que se le pasa", () => {
    expect(recordatorio_en(evento({ inicio_minuto: 9 * 60, recordatorio_min: 0 }), "UTC")).toBe("2026-09-28T09:00:00.000Z");
  });
});

describe("inicio_fin", () => {
  test("todo el día arranca a medianoche y dura lo que diga, nunca menos de 15 min", () => {
    expect(inicio_fin(evento({ duracion_min: 60 }))).toEqual({
      inicio_en: "2026-09-28T06:00:00.000Z",
      fin_en: "2026-09-28T07:00:00.000Z",
    });
    expect(inicio_fin(evento({ inicio_minuto: 10 * 60, duracion_min: 5 }))).toEqual({
      inicio_en: "2026-09-28T16:00:00.000Z",
      fin_en: "2026-09-28T16:15:00.000Z",
    });
  });
});

describe("filas y orden", () => {
  test("evento_desde rellena los valores por defecto", () => {
    expect(evento_desde({ fecha: "2026-09-28" })).toEqual({
      fecha: "2026-09-28",
      inicio_minuto: null,
      duracion_min: 60,
      recordatorio_min: 15,
    });
    expect(evento_desde({ fecha: "2026-09-28", inicio_minuto: "90", duracion_min: 30, recordatorio_min: -1 })).toEqual({
      fecha: "2026-09-28",
      inicio_minuto: 90,
      duracion_min: 30,
      recordatorio_min: -1,
    });
  });

  test("ordenar_eventos: por fecha, luego hora, los de todo el día primero", () => {
    const orden = ordenar_eventos([
      { id: "c", fecha: "2026-09-29", inicio_minuto: 60, name: "c" },
      { id: "b", fecha: "2026-09-28", inicio_minuto: 600, name: "b" },
      { id: "a", fecha: "2026-09-28", inicio_minuto: null, name: "a" },
      { id: "d", fecha: "2026-09-28", inicio_minuto: 60, name: "d" },
    ]);
    expect(orden.map((e) => e.id)).toEqual(["a", "d", "b", "c"]);
  });

  test("validadores", () => {
    expect(fecha_valida("2026-09-28")).toBe(true);
    expect(fecha_valida("2026-02-30")).toBe(false);
    expect(fecha_valida("2026-04-31")).toBe(false);
    expect(fecha_valida("2028-02-29")).toBe(true);
    expect(fecha_valida("28/09/2026")).toBe(false);
    expect(adelanto_valido(15)).toBe(true);
    expect(adelanto_valido(7)).toBe(false);
    expect(ADELANTOS.map((a) => a.value)).toEqual([-1, 0, 5, 15, 30, 60, 180, 1440]);
  });
});
