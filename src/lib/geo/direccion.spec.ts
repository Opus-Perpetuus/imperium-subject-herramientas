import { describe, expect, test } from "bun:test";
import { mapear_direccion, rellenar_huecos } from "./direccion.ts";

describe("mapear dirección", () => {
  test("completa se reparte en sus campos", () => {
    expect(
      mapear_direccion({ calle: "Calle Morelos", numero: "45", colonia: "Centro", localidad: "CDMX" }),
    ).toEqual({ calle: "Calle Morelos", numero: "45", colonia: "Centro", alias: "Calle Morelos 45" });
  });

  test("sin colonia se usa la localidad; sin número el alias es la calle; sin calle cae a la colonia", () => {
    expect(mapear_direccion({ calle: "Morelos", numero: "45", localidad: "Toluca" })?.colonia).toBe("Toluca");
    const sin_numero = mapear_direccion({ calle: "Morelos", colonia: "Centro" })!;
    expect(sin_numero.numero).toBe("");
    expect(sin_numero.alias).toBe("Morelos");
    expect(mapear_direccion({ colonia: "Centro" })?.alias).toBe("Centro");
  });

  test("el lugar sirve de número solo si parece un número", () => {
    expect(mapear_direccion({ calle: "Morelos", lugar: "45", colonia: "Centro" })?.numero).toBe("45");
    expect(
      mapear_direccion({ calle: "Morelos", lugar: "Farmacia del Ahorro", colonia: "Centro" })?.numero,
    ).toBe("");
  });

  test("sin datos no se inventa una dirección", () => {
    expect(mapear_direccion(null)).toBeNull();
    expect(mapear_direccion({})).toBeNull();
    expect(mapear_direccion({ lugar: "12" })).toBeNull();
  });
});

describe("rellenar huecos", () => {
  const mapeada = { calle: "Morelos", numero: "45", colonia: "Centro", alias: "Morelos 45" };

  test("solo los huecos; lo tecleado manda", () => {
    const out = rellenar_huecos<Record<string, string>>({ alias: "La de la reja verde", calle: "" }, mapeada);
    expect(out).toEqual({ alias: "La de la reja verde", calle: "Morelos", numero: "45", colonia: "Centro" });
  });

  test("sin nada que rellenar no cambia; un blanco cuenta como hueco", () => {
    const actual = { alias: "Morelos 45", calle: "Morelos" };
    expect(rellenar_huecos(actual, null)).toBe(actual);
    expect(rellenar_huecos({ colonia: "   " }, mapeada).colonia).toBe("Centro");
  });
});
