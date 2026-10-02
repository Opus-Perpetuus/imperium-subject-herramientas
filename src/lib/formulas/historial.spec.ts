import { describe, expect, test } from "bun:test";
import type { CampoSpec } from "./esquema.ts";
import { cambios_de, describir_cambios, titulo_de_cambios } from "./historial.ts";

const CAMPOS: CampoSpec[] = [
  { clave: "producto", etiqueta: "Producto", tipo: "referencia" },
  { clave: "cantidad", etiqueta: "Cantidad", tipo: "entero" },
  { clave: "total", etiqueta: "Total", tipo: "calculado", formula: "{cantidad} * 2" },
  { clave: "foto", etiqueta: "Foto", tipo: "foto" },
];
const NOMBRES: Record<string, string> = { r1: "Mezcal", r2: "Tequila" };
const presentar = (c: CampoSpec, raw: string) => (c.clave === "producto" ? (NOMBRES[raw] ?? "") : raw);

describe("cambios de un registro", () => {
  test("solo lo capturado que cambió, en palabras de la lista", () => {
    const cambios = cambios_de(
      CAMPOS,
      { producto: "r1", cantidad: "3", total: "6" },
      { producto: "r2", cantidad: "3", total: "6" },
      presentar,
    );
    expect(cambios).toEqual([{ etiqueta: "Producto", antes: "Mezcal", despues: "Tequila" }]);
  });

  test("un calculado no cuenta aunque cambie: cambia porque cambió otro", () => {
    expect(cambios_de(CAMPOS, { cantidad: "3", total: "6" }, { cantidad: "5", total: "10" }, presentar)).toEqual([
      { etiqueta: "Cantidad", antes: "3", despues: "5" },
    ]);
  });

  test("la foto se dice puesta, cambiada o quitada", () => {
    expect(cambios_de(CAMPOS, {}, { foto: "/api/media/a" }, presentar)).toEqual([
      { etiqueta: "Foto", antes: "", despues: "Sí" },
    ]);
    expect(cambios_de(CAMPOS, { foto: "/api/media/a" }, { foto: "/api/media/b" }, presentar)).toEqual([
      { etiqueta: "Foto", antes: "Foto anterior", despues: "Foto nueva" },
    ]);
    expect(cambios_de(CAMPOS, { foto: "/api/media/a" }, { foto: "" }, presentar)).toEqual([
      { etiqueta: "Foto", antes: "Sí", despues: "" },
    ]);
  });

  test("limpiar el «undefined» de una foto que nunca se guardó no es quitarla", () => {
    expect(cambios_de(CAMPOS, { foto: "undefined" }, { foto: "" }, presentar)).toEqual([]);
  });

  test("un valor distinto que se lee igual no es un cambio", () => {
    expect(cambios_de(CAMPOS, { cantidad: "3" }, { cantidad: "3" }, presentar)).toEqual([]);
    expect(cambios_de(CAMPOS, { producto: "x" }, { producto: "y" }, presentar)).toEqual([]);
  });
});

describe("cómo se cuenta", () => {
  const c = (etiqueta: string) => ({ etiqueta, antes: "a", despues: "b" });

  test("título según cuántos campos cambiaron", () => {
    expect(titulo_de_cambios([])).toBe("Se guardó sin cambios");
    expect(titulo_de_cambios([c("Cantidad")])).toBe("Cambió Cantidad");
    expect(titulo_de_cambios([c("Cantidad"), c("Producto")])).toBe("Cambió Cantidad y Producto");
    expect(titulo_de_cambios([c("A"), c("B"), c("C"), c("D")])).toBe("Cambió A, B y 2 más");
  });

  test("detalle con raya para lo vacío", () => {
    expect(
      describir_cambios([
        { etiqueta: "Cantidad", antes: "3", despues: "5" },
        { etiqueta: "Nota", antes: "", despues: "hola" },
      ]),
    ).toBe("Cantidad: 3 → 5 · Nota: — → hola");
  });
});
