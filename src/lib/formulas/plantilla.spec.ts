import { describe, expect, test } from "bun:test";
import type { TablaSpec } from "./esquema.ts";
import { columna_unica, plantilla_con_claves, plantilla_con_etiquetas, rellenar_plantilla } from "./plantilla.ts";

const clientes: TablaSpec = {
  id: "t",
  name: "Clientes",
  constantes: [{ clave: "meta", etiqueta: "Meta" }],
  resumenes: [],
  campos: [
    { clave: "nombre", etiqueta: "Nombre", tipo: "texto" },
    { clave: "telefono", etiqueta: "Teléfono", tipo: "texto" },
    { clave: "fecha_alta", etiqueta: "Fecha de alta", tipo: "fecha" },
  ],
};

describe("plantillas con nombres visibles", () => {
  test("los nombres, sin importar mayúsculas ni acentos, se guardan como claves; el resto es texto tal cual", () => {
    expect(plantilla_con_claves(clientes, ' {Nombre} · Tel. "{telefono}" desde {FECHA DE ALTA} × 2 ')).toEqual({
      plantilla: '{nombre} · Tel. "{telefono}" desde {fecha_alta} × 2',
      desconocidos: [],
    });
  });

  test("lo que no es una columna se reporta y queda igual: valores fijos y totales no cuentan", () => {
    expect(plantilla_con_claves(clientes, "{Nombre} {Apellido} {Meta} {suma:Nombre}")).toEqual({
      plantilla: "{nombre} {Apellido} {Meta} {suma:Nombre}",
      desconocidos: ["Apellido", "Meta", "suma:Nombre"],
    });
  });

  test("de vuelta con los nombres; una clave que ya no existe se ve tal cual", () => {
    expect(plantilla_con_etiquetas(clientes, "{nombre} ({telefono}) {borrada}")).toBe("{Nombre} ({Teléfono}) {borrada}");
  });

  test("una plantilla que es solo una columna se reconoce para el menú", () => {
    expect(columna_unica("{nombre}")).toBe("nombre");
    expect(columna_unica("{nombre} {telefono}")).toBeNull();
    expect(columna_unica("Tel. {telefono}")).toBeNull();
    expect(columna_unica(null)).toBeNull();
  });
});

describe("rellenar una plantilla", () => {
  const valores = { nombre: "Ana", telefono: "", saldo: "-50.00 $", colonia: "Centro" };

  test.each([
    ["{nombre} · {telefono}", "Ana"],
    ["{telefono} — {nombre}", "Ana"],
    ["{nombre}, {telefono}", "Ana"],
    ["{nombre} ({telefono})", "Ana"],
    ["{nombre} - {telefono}", "Ana"],
    ["Tel. {telefono}", ""],
    ["{saldo}", "-50.00 $"],
    ["Vive en   {colonia}", "Vive en Centro"],
    ["{borrada} {nombre}", "Ana"],
    ["Cliente", "Cliente"],
    ["", ""],
  ])("«%s» → «%s»", (plantilla, esperado) => {
    expect(rellenar_plantilla(plantilla, valores)).toBe(esperado);
  });
});
