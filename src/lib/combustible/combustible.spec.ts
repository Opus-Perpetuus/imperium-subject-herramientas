import { describe, expect, test } from "bun:test";
import { ajustar, calibracion_sobrevive, fraccion, incremento, maximo, minimo, secciones } from "./escala.ts";
import {
  actualizar_litros_por_paso,
  leer_lectura,
  litros,
  litros_efectivos,
  motivo_gasto,
  rendimiento_exacto,
  texto_lectura,
  type LecturaMedidor,
  type VehiculoCombustible,
} from "./litros.ts";
import { TANQUES, nombre_tanque, tanque_por_id } from "./tanques.ts";

const medidor = (paso: number, pasos: number): LecturaMedidor => ({ tipo: "medidor", paso, pasos });

describe("escala del medidor", () => {
  const normal = { marcas: 6, divisiones: 10, aguja_fuera: false };
  const saliendose = { marcas: 6, divisiones: 10, aguja_fuera: true };

  test("sin aguja fuera, las secciones son las impresas", () => {
    expect(secciones(normal)).toBe(6);
    expect(minimo(normal)).toBe(0);
    expect(maximo(normal)).toBe(6);
    expect(fraccion(normal, 0)).toBe(0);
    expect(fraccion(normal, 3)).toBe(0.5);
    expect(fraccion(normal, 6)).toBe(1);
  });

  test("con aguja fuera hay dos secciones más y la marca de vacío no es vacío", () => {
    expect(secciones(saliendose)).toBe(8);
    expect(minimo(saliendose)).toBe(-1);
    expect(maximo(saliendose)).toBe(7);
    expect(fraccion(saliendose, 0)).toBeCloseTo(1 / 8, 9);
    expect(fraccion(saliendose, -1)).toBe(0);
    expect(fraccion(saliendose, 7)).toBe(1);
    expect(fraccion(saliendose, 6)).toBeCloseTo(7 / 8, 9);
    expect(fraccion(saliendose, 3)).toBe(0.5);
  });

  test("divisiones: dónde engancha el dedo, sin salirse del recorrido", () => {
    expect(incremento(saliendose)).toBeCloseTo(0.1, 9);
    expect(ajustar(saliendose, 3.42)).toBeCloseTo(3.4, 9);
    expect(ajustar(saliendose, 3.38)).toBeCloseTo(3.4, 9);
    const barritas = { marcas: 6, divisiones: 1, aguja_fuera: false };
    expect(ajustar(barritas, 3.42)).toBe(3);
    expect(ajustar(barritas, 3.61)).toBe(4);
    expect(ajustar(normal, 9)).toBe(6);
    expect(ajustar(normal, -3)).toBe(0);
    expect(ajustar(saliendose, 9)).toBe(7);
    expect(ajustar(saliendose, -3)).toBe(-1);
  });

  test("la calibración sobrevive solo si no cambian las secciones", () => {
    expect(calibracion_sobrevive(normal, saliendose)).toBe(false);
    expect(calibracion_sobrevive(normal, { ...normal, divisiones: 20 })).toBe(true);
  });
});

describe("litros", () => {
  const moto: VehiculoCombustible = { tanque_litros: 12, marcas: 6, divisiones: 1, aguja_fuera: false, litros_por_paso: [] };

  test("lectura de texto: medidor o litros", () => {
    expect(leer_lectura("3/6")).toEqual(medidor(3, 6));
    expect(leer_lectura(" 3.5 / 6 ")).toEqual(medidor(3.5, 6));
    expect(leer_lectura("-1/6")).toEqual(medidor(-1, 6));
    expect(leer_lectura("5.5")).toEqual({ tipo: "litros", valor: 5.5 });
    expect(leer_lectura(5)).toEqual({ tipo: "litros", valor: 5 });
    expect(leer_lectura("")).toBeNull();
    expect(leer_lectura("3/0")).toBeNull();
    expect(leer_lectura("lleno")).toBeNull();
    expect(texto_lectura(medidor(3, 6))).toBe("3/6");
  });

  test("3 de 6 barritas de 12 L son 6 L aproximados; litros son exactos", () => {
    expect(litros(medidor(3, 6), moto)).toEqual({ litros: 6, aproximado: true });
    expect(litros({ tipo: "litros", valor: 5.5 }, moto)).toEqual({ litros: 5.5, aproximado: false });
  });

  test("la calibración manda sobre lo lineal, con paso parcial", () => {
    expect(litros(medidor(3, 6), { ...moto, litros_por_paso: [1, 1, 1, 3, 3, 3] })?.litros).toBe(3);
    expect(litros(medidor(1.5, 6), { ...moto, litros_por_paso: [2, 2, 2, 2, 2, 2] })?.litros).toBe(3);
    expect(litros(medidor(2, 4), { ...moto, tanque_litros: 8 })?.litros).toBe(4);
  });

  test("sin tanque ni calibración no se inventan litros", () => {
    expect(litros(medidor(3, 6), { marcas: 6 })).toBeNull();
    expect(litros(medidor(3, 0), moto)).toBeNull();
  });

  describe("aguja fuera: 6 marcas, 12 L sobre 8 secciones", () => {
    const rara = { ...moto, divisiones: 10, aguja_fuera: true };
    const l = (v: VehiculoCombustible, paso: number) => litros(medidor(paso, 6), v)!.litros;

    test("marcas y topes", () => {
      expect(l(rara, 0)).toBeCloseTo(1.5, 9);
      expect(l(rara, -1)).toBe(0);
      expect(l(rara, 6)).toBeCloseTo(10.5, 9);
      expect(l(rara, 7)).toBeCloseTo(12, 9);
      expect(l(rara, 3)).toBeCloseTo(6, 9);
      expect(l(rara, 3.1)).toBeCloseTo(6.15, 9);
      expect(l(rara, 6) - l(rara, 0)).toBeCloseTo(9, 9);
    });

    test("una calibración de seis no se usa en una escala de ocho; con ocho sí", () => {
      expect(l({ ...rara, litros_por_paso: [2, 2, 2, 2, 2, 2] }, 0)).toBeCloseTo(1.5, 9);
      const ocho = { ...rara, litros_por_paso: Array(8).fill(1.5) };
      expect(l(ocho, 0)).toBeCloseTo(1.5, 9);
      expect(l(ocho, 7)).toBeCloseTo(12, 9);
    });

    test("lo aprendido tiene una entrada por sección del recorrido y se puede reusar", () => {
      const aprendida = actualizar_litros_por_paso(rara, medidor(0, 6), medidor(6, 6), 9)!;
      expect(aprendida).toHaveLength(8);
      expect(aprendida[1]).toBeCloseTo(1.5, 9);
      expect(aprendida[6]).toBeCloseTo(1.5, 9);
      const calibrada = { ...rara, litros_por_paso: aprendida };
      expect(l(calibrada, 0)).toBeCloseTo(1.5, 9);
      expect(l(calibrada, 6)).toBeCloseTo(10.5, 9);
    });

    test("una lectura con otro número de marcas usa su propia escala, sin sobrerrecorrido", () => {
      expect(litros(medidor(2, 4), rara)?.litros).toBe(6);
    });
  });

  test("actualizar_litros_por_paso se mueve hacia la observación", () => {
    const v = { tanque_litros: 8, marcas: 4, divisiones: 1, aguja_fuera: false, litros_por_paso: [2, 2, 2, 2] };
    const next = actualizar_litros_por_paso(v, medidor(1, 4), medidor(3, 4), 4, 1)!;
    expect(next[1]).toBeCloseTo(2, 6);
    expect(next[2]).toBeCloseTo(2, 6);
    // EMA por defecto: 6 L en dos pasos son 3 L/paso observados; 2·0.65 + 3·0.35 = 2.35.
    const suave = actualizar_litros_por_paso(v, medidor(1, 4), medidor(3, 4), 6)!;
    expect(suave[1]).toBeCloseTo(2.35, 9);
    expect(suave[0]).toBe(2);
    expect(actualizar_litros_por_paso(v, medidor(3, 4), medidor(1, 4), 4)).toBeNull();
    expect(actualizar_litros_por_paso(v, medidor(1, 4), medidor(3, 6), 4)).toBeNull();
    expect(actualizar_litros_por_paso({ marcas: 4 }, medidor(1, 4), medidor(3, 4), 4)).toBeNull();
  });

  test("rendimiento exacto entre dos llenados", () => {
    expect(rendimiento_exacto(1000, 1120, 4)).toBe(30);
    expect(rendimiento_exacto(1120, 1000, 4)).toBeNull();
    expect(rendimiento_exacto(1000, 1120, 0)).toBeNull();
  });

  test("litros efectivos y motivo del gasto", () => {
    expect(litros_efectivos({ litros: 4.2, pesos: 200, precio_litro: 24 })).toBe(4.2);
    expect(litros_efectivos({ pesos: 240, precio_litro: 24 })).toBe(10);
    expect(litros_efectivos({ pesos: 240 })).toBeNull();
    expect(motivo_gasto(4.2)).toBe("Gasolina · 4.2 L");
    expect(motivo_gasto(10)).toBe("Gasolina · 10 L");
    expect(motivo_gasto(200 / 23.5)).toBe("Gasolina · 8.51 L");
    expect(motivo_gasto(null)).toBe("Gasolina");
  });
});

describe("catálogo de tanques", () => {
  test("26 modelos con ids únicos", () => {
    expect(TANQUES).toHaveLength(26);
    expect(new Set(TANQUES.map((m) => m.id)).size).toBe(26);
    expect(tanque_por_id("italika-ft150")?.tanque_litros).toBe(12);
    expect(nombre_tanque(tanque_por_id("italika-ft150")!)).toBe("Italika FT150 (2008–2019)");
    expect(nombre_tanque(tanque_por_id("tvs-sport")!)).toBe("TVS Sport");
    expect(tanque_por_id("nada")).toBeNull();
  });
});
