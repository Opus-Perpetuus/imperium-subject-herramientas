import { describe, expect, test } from "bun:test";
import { ESTADOS, es_abierto, es_entregado, estado_de, siguiente, siguiente_orden } from "./estado.ts";

describe("estado_de", () => {
  test("lee las tres épocas sin reescribir nada", () => {
    expect(estado_de({ cobrar: 100 })).toBe("entregado");
    expect(estado_de({ estado: "  " })).toBe("entregado");
    expect(estado_de({ estado: "Pendiente" })).toBe("capturado");
    expect(estado_de({ estado: "En ruta" })).toBe("en_ruta");
    expect(estado_de({ estado: "en_ruta" })).toBe("en_ruta");
    expect(estado_de({ estado: "Entregado" })).toBe("entregado");
  });

  test("cobrado = true manda sobre el texto", () => {
    expect(estado_de({ estado: "entregado", cobrado: true })).toBe("cobrado");
    expect(estado_de({ estado: "capturado", cobrado: "true" })).toBe("cobrado");
  });

  test("un valor desconocido se deja tal cual", () => {
    expect(estado_de({ estado: "Vete a saber" })).toBe("vete_a_saber");
  });
});

describe("flujo", () => {
  test("avanza en orden y después de cobrado no hay nada", () => {
    expect(siguiente("capturado")).toBe("surtido");
    expect(siguiente("surtido")).toBe("en_ruta");
    expect(siguiente("en_ruta")).toBe("entregado");
    expect(siguiente("entregado")).toBe("cobrado");
    expect(siguiente("cobrado")).toBeNull();
    expect(siguiente("raro")).toBeNull();
  });

  test("abiertos y entregados", () => {
    expect(ESTADOS.filter(es_abierto)).toEqual(["capturado", "surtido", "en_ruta"]);
    expect(ESTADOS.filter(es_entregado)).toEqual(["entregado", "cobrado"]);
  });

  test("siguiente_orden es uno más que el mayor de los abiertos", () => {
    expect(siguiente_orden([])).toBe(1);
    expect(
      siguiente_orden([
        { orden: 3, estado: "capturado" },
        { orden: 9, estado: "entregado" },
        { orden: 5, estado: "en_ruta" },
        { orden: 7, estado: "surtido", cobrado: true },
      ]),
    ).toBe(6);
  });
});
