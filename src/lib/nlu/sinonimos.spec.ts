import { describe, expect, test } from "bun:test";
import { INTENCIONES } from "./intenciones.ts";
import { SINONIMOS, frases_de, resolver_sinonimo } from "./sinonimos.ts";

describe("sinónimos", () => {
  test("resuelve llamadas", () => {
    expect(resolver_sinonimo("márcale a juan")?.intencion).toBe("llamar");
    expect(resolver_sinonimo("hablale a maria")?.intencion).toBe("llamar");
    expect(resolver_sinonimo("descolgar")?.intencion).toBe("llamada_contestar");
  });

  test("gana la frase más larga: «no contestar» sobre «contestar»", () => {
    expect(resolver_sinonimo("no contestar")?.intencion).toBe("llamada_rechazar");
  });

  test("jornada y registros", () => {
    expect(resolver_sinonimo("arrancar jornada")?.intencion).toBe("jornada_iniciar");
    expect(resolver_sinonimo("nuevo pedido")?.intencion).toBe("pedido_registrar");
    expect(resolver_sinonimo("anotar gasto")?.intencion).toBe("gasto_registrar");
    expect(resolver_sinonimo("cerrar el dia")?.intencion).toBe("cerrar_dia");
    expect(resolver_sinonimo("saqué de cambio 200")?.intencion).toBe("caja_retiro");
  });

  test("lo desconocido es null", () => {
    expect(resolver_sinonimo("haz un cafe con leche")).toBeNull();
  });

  test("restringido a las intenciones activas", () => {
    expect(resolver_sinonimo("nuevo pedido", ["gasto_registrar"])).toBeNull();
  });

  test("toda intención del registro tiene sinónimos y viceversa", () => {
    const ids = INTENCIONES.map((i) => i.id).sort();
    expect(Object.keys(SINONIMOS).sort()).toEqual(ids);
    for (const id of ids) expect(frases_de(id).length).toBeGreaterThan(0);
  });
});
