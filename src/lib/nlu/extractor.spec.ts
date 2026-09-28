import { describe, expect, test } from "bun:test";
import { extraer_cantidad, extraer_datos, extraer_hora, extraer_nombre, extraer_numero } from "./extractor.ts";

describe("extractor de datos", () => {
  test("cantidad en pesos", () => {
    expect(extraer_cantidad("gasté 45.50 pesos")).toBeCloseTo(45.5);
    expect(extraer_cantidad("importe $100")).toBe(100);
    expect(extraer_cantidad("cincuenta pesos")).toBe(50);
    expect(extraer_cantidad("anota un pedido de 250 en la calle 5")).toBe(250);
    expect(extraer_cantidad("cuánto llevo hoy")).toBeNull();
  });

  test("hora", () => {
    expect(extraer_hora("a las 14:30")).toBe("14:30");
    expect(extraer_hora("a las 9 horas")).toBe("09:00");
    expect(extraer_hora("15 y 20")).toBe("15:20");
    expect(extraer_hora("a las tres")).toBe("03:00");
  });

  test("número con unidad", () => {
    expect(extraer_numero("cargué 4.2 litros")).toBeCloseTo(4.2);
    expect(extraer_numero("3 pedidos")).toBe(3);
    expect(extraer_numero("saqué de cambio 200")).toBeNull();
  });

  test("nombre tras un prefijo de acción", () => {
    expect(extraer_nombre("llama a María López")).toBe("maria lopez");
    expect(extraer_nombre("marca a pedro")).toBe("pedro");
    expect(extraer_nombre("llama maria")).toBe("maria");
    expect(extraer_nombre("terminar jornada")).toBeNull();
  });

  test("vacío no inventa nada", () => {
    const d = extraer_datos("");
    expect(d.cantidad).toBeNull();
    expect(d.hora).toBeNull();
    expect(d.nombre).toBeNull();
  });

  test("combinado", () => {
    const d = extraer_datos("registrar gasto de 80 pesos a las 10:15");
    expect(d.cantidad).toBe(80);
    expect(d.hora).toBe("10:15");
    expect(d.resto).toBe("registrar gasto de 80 pesos a las 10 15");
  });
});
