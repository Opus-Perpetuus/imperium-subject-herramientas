import { describe, expect, test } from "bun:test";
import { formatos_para_dibujar, png_de_codigo } from "./codigos.ts";
import { formato_de_valor, gtin_valido } from "../formulas/escaner.ts";

describe("formato deducido del valor (antes todo salía QR)", () => {
  test("GTIN con dígito verificador válido", () => {
    expect(gtin_valido("7501055375936")).toBe(true);
    expect(gtin_valido("7501055375937")).toBe(false);
    expect(formato_de_valor("7501055375936")).toBe("ean_13");
    expect(formato_de_valor("0021136010374")).toBe("ean_13");
    expect(formato_de_valor("96385074")).toBe("ean_8");
    expect(formato_de_valor("036000291452")).toBe("upc_a");
    expect(formato_de_valor("10012345678902")).toBe("itf");
  });

  test("sin GTIN: dígitos o columna de barras → Code 128, texto → QR", () => {
    expect(formato_de_valor("12345")).toBe("code_128");
    expect(formato_de_valor("ABC-1", "barras")).toBe("code_128");
    expect(formato_de_valor("https://x.mx")).toBe("qr_code");
    expect(formato_de_valor("7501055375936", "qr")).toBe("qr_code");
    expect(formato_de_valor("12345", "todos", true)).toBe("");
  });
});

describe("formatos_para_dibujar", () => {
  test("registro viejo sin formato: un EAN-13 se imprime como EAN-13", () => {
    expect(formatos_para_dibujar(undefined, false, "7501055375936")[0]).toBe("ean13");
    expect(formatos_para_dibujar(undefined, true, "0021136010374")[0]).toBe("ean13");
  });

  test("el formato leído manda; el deducido cede ante el GTIN", () => {
    expect(formatos_para_dibujar("code_128", false, "7501055375936")[0]).toBe("code128");
    expect(formatos_para_dibujar("qr_code", false, "7501055375936", true)[0]).toBe("ean13");
    expect(formatos_para_dibujar("code_39", false, "ABC", true)[0]).toBe("code39");
  });

  test("texto sin formato: QR; en columna de barras, Code 128", () => {
    expect(formatos_para_dibujar(undefined, false, "hola")).toEqual(["qrcode"]);
    expect(formatos_para_dibujar(undefined, true, "hola")[0]).toBe("code128");
  });

  test("png_de_codigo dibuja el EAN-13 sin metadata", async () => {
    const url = await png_de_codigo("7501055375936");
    expect(url?.startsWith("data:image/png;base64,")).toBe(true);
  });
});
