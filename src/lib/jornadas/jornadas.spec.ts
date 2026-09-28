import { describe, expect, test } from "bun:test";
import {
  calcular,
  distancia_dia,
  distancia_tramo,
  fin_programado,
  minutos_restantes,
  nivel_litros,
  pide_odometro,
  sugerir_km,
  tramos_desde,
  type Tramo,
} from "./jornada.ts";

const tramo = (o: Partial<Tramo>): Tramo => ({
  vehiculo_id: "v1",
  vehiculo_nombre: "Moto",
  inicio: "2026-08-05T08:00:00.000Z",
  fin: null,
  km_inicial: null,
  km_final: null,
  gps_m_inicio: 0,
  gps_m_fin: null,
  ...o,
});

describe("tramos", () => {
  test("distancia: odómetro si están las dos lecturas, si no GPS, si no nada", () => {
    expect(distancia_tramo(tramo({ km_inicial: 100, km_final: 130.5, gps_m_fin: 99_999 }))).toBe(30.5);
    expect(distancia_tramo(tramo({ km_inicial: 100, gps_m_inicio: 1000, gps_m_fin: 13_500 }))).toBe(12.5);
    // Una lectura final menor que la inicial es un error de dedo: cae al GPS.
    expect(distancia_tramo(tramo({ km_inicial: 100, km_final: 90, gps_m_fin: 2000 }))).toBe(2);
    expect(distancia_tramo(tramo({}))).toBeNull();
  });

  test("la distancia del día suma tramo a tramo", () => {
    expect(distancia_dia([tramo({ km_inicial: 10, km_final: 20 }), tramo({ gps_m_inicio: 500, gps_m_fin: 3500 })])).toBe(13);
  });

  test("tramos_desde tolera JSON roto y filas incompletas", () => {
    expect(tramos_desde("{")).toEqual([]);
    expect(tramos_desde(null)).toEqual([]);
    expect(tramos_desde([{ vehiculo_id: "v1", km_inicial: "12,5" }, null, 3])).toEqual([
      tramo({ vehiculo_nombre: "", inicio: "", km_inicial: 12.5 }),
    ]);
  });
});

describe("nivel_litros", () => {
  test("número = litros; fracción con tanque = litros; sin tanque = secciones", () => {
    expect(nivel_litros(4.5)).toBe(4.5);
    expect(nivel_litros("3/6", 12)).toBe(6);
    expect(nivel_litros("3/6")).toBe(3);
    expect(nivel_litros("1.5/6", 12)).toBe(3);
    expect(nivel_litros("")).toBeNull();
    expect(nivel_litros("3/0", 12)).toBeNull();
  });
});

describe("calcular", () => {
  test("las fórmulas de la jornada, con guardianes mientras sigue abierta", () => {
    expect(calcular({ km_inicial: 1180.5, km_gps: 42.3 })).toEqual({
      km_recorridos: 42.3,
      gasolina_usada: 0,
      rendimiento: 0,
      ganancia_neta: 0,
      por_entrega: 0,
    });
    expect(
      calcular(
        {
          km_inicial: 1000,
          km_final: 1090,
          km_gps: 85,
          gasolina_inicial: "5/6",
          gasolina_final: "2/6",
          entregas: 12,
          ingreso: 600,
          gasto_gasolina: 150,
        },
        12,
      ),
    ).toEqual({ km_recorridos: 90, gasolina_usada: 6, rendimiento: 15, ganancia_neta: 450, por_entrega: 37.5 });
  });

  test("con dos vehículos la distancia sale tramo a tramo, no de dos odómetros distintos", () => {
    const fila = {
      km_inicial: 1000,
      km_final: 500,
      tramos: [
        tramo({ km_inicial: 1000, km_final: 1030, fin: "x" }),
        tramo({ vehiculo_id: "v2", km_inicial: 480, km_final: 500 }),
      ],
    };
    expect(calcular(fila).km_recorridos).toBe(50);
  });
});

describe("fin programado", () => {
  test("una hora posterior es hoy; anterior o igual, mañana", () => {
    const inicio = new Date(2026, 7, 5, 15, 0);
    expect(fin_programado("22:30", inicio)?.getTime()).toBe(new Date(2026, 7, 5, 22, 30).getTime());
    expect(fin_programado("02:00", new Date(2026, 7, 5, 21, 0))?.getTime()).toBe(new Date(2026, 7, 6, 2, 0).getTime());
    expect(fin_programado("15:00", inicio)?.getTime()).toBe(new Date(2026, 7, 6, 15, 0).getTime());
    expect(fin_programado("25:00", inicio)).toBeNull();
    expect(fin_programado("", inicio)).toBeNull();
  });

  test("minutos restantes con piso en cero", () => {
    const fin = new Date(2026, 7, 5, 22, 30);
    expect(minutos_restantes(fin, new Date(2026, 7, 5, 22, 0))).toBe(30);
    expect(minutos_restantes(fin, new Date(2026, 7, 5, 23, 0))).toBe(0);
  });
});

describe("odómetro", () => {
  test("el vehículo manda y la jornada veta", () => {
    expect(pide_odometro({ solo_gps: false }, null)).toBe(true);
    expect(pide_odometro({ solo_gps: true }, null)).toBe(false);
    expect(pide_odometro({ solo_gps: false }, { solo_gps: true })).toBe(false);
    expect(pide_odometro(null, null)).toBe(false);
  });

  test("sugerir_km toma el km_final de la jornada más reciente del vehículo con lectura", () => {
    const jornadas = [
      { vehiculo_id: "v1", fecha: "2026-08-01", km_final: 12100 },
      { vehiculo_id: "v1", fecha: "2026-08-03", km_final: "12266,5" },
      { vehiculo_id: "v1", fecha: "2026-08-04", km_final: "" },
      { vehiculo_id: "v2", fecha: "2026-08-04", km_final: 900 },
    ];
    expect(sugerir_km(jornadas, "v1")).toBe(12266.5);
    expect(sugerir_km(jornadas, "v3")).toBeNull();
  });
});
