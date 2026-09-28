import { describe, expect, test } from "bun:test";
import { raiz, raiz_frase } from "./stemmer.ts";

describe("stemmer", () => {
  test("no destroza palabras cortas", () => {
    for (const w of ["la", "el", "yo", "un"]) expect(raiz(w)).toBe(w);
  });

  test("recorta sufijos verbales", () => {
    expect(raiz("contestar")).toBe("contest");
    expect(raiz("iniciando")).toBe("inici");
  });

  test("recorta plurales", () => {
    expect(raiz("pedidos")).toBe("pedido");
    expect(raiz("motos")).toBe("moto");
  });

  test("raiz_frase normaliza y recorta cada palabra", () => {
    expect(raiz_frase("Iniciar jornadas")).toBe("inici jornada");
  });
});
