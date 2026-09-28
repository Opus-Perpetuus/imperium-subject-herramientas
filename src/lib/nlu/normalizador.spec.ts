import { describe, expect, test } from "bun:test";
import { contiene_frase, normalizar_frase, normalizar_ligero } from "./normalizador.ts";

describe("normalizador", () => {
  test("minúsculas, sin acentos ni signos", () => {
    expect(normalizar_frase("¡Hola, Pepé!")).toBe("hola pepe");
    expect(normalizar_ligero("Teléfono")).toBe("telefono");
  });

  test("expande números en palabras", () => {
    expect(normalizar_frase("llama a dos")).toBe("llama a 2");
    expect(normalizar_frase("gasté cincuenta pesos")).toBe("gaste 50 pesos");
    expect(normalizar_frase("anota un pedido")).toBe("anota 1 pedido");
  });

  test("la ligera no expande números ni quita muletillas", () => {
    expect(normalizar_ligero("anota un pedido, por favor")).toBe("anota un pedido por favor");
  });

  test("quita muletillas", () => {
    const n = normalizar_frase("eh este por favor inicia la jornada");
    expect(n).toBe("inicia la jornada");
  });

  test("expande elisiones", () => {
    expect(normalizar_frase("pa' la casa")).toBe("para la casa");
    expect(normalizar_frase("pa la casa")).toBe("para la casa");
  });

  test("contiene_frase casa palabras completas y respeta el «no» previo", () => {
    expect(contiene_frase("contesta la llamada", "contesta")).toBe(true);
    expect(contiene_frase("xcontestay", "contesta")).toBe(false);
    expect(contiene_frase("no contestar la llamada", "contestar la llamada")).toBe(false);
    expect(contiene_frase("no contestar", "no contestar")).toBe(true);
  });
});
