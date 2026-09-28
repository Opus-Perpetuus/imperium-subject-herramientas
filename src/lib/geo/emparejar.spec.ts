import { describe, expect, test } from "bun:test";
import { cercanos, emparejar, mejor } from "./emparejar.ts";

const aqui = { lat: 19.4326, lon: -99.1332 };

/** ~11 m por cada 0.0001 grados de latitud. */
function al_norte(metros: number, name: string) {
  return { name, lat: aqui.lat + metros / 111_320, lon: aqui.lon };
}

describe("emparejar domicilios", () => {
  test("uno a la puerta se encuentra; a dos cuadras no", () => {
    const cerca = cercanos(aqui, [al_norte(12, "Morelos 45")]);
    expect(cerca).toHaveLength(1);
    expect(cerca[0]!.fila.name).toBe("Morelos 45");
    expect(cerca[0]!.distancia_m).toBeLessThan(15);
    expect(cercanos(aqui, [al_norte(250, "Juárez 12")])).toHaveLength(0);
  });

  test("se ordenan del más cercano al más lejano", () => {
    const cerca = cercanos(aqui, [al_norte(30, "Lejos"), al_norte(8, "Cerca")]);
    expect(cerca.map((c) => c.fila.name)).toEqual(["Cerca", "Lejos"]);
  });

  test("acierto inequívoco vs ambigüedad", () => {
    expect(mejor(cercanos(aqui, [al_norte(10, "Morelos 45")]))?.fila.name).toBe("Morelos 45");
    expect(mejor(cercanos(aqui, [al_norte(10, "Morelos 45"), al_norte(14, "Morelos 47")]))).toBeNull();
    expect(mejor(cercanos(aqui, [al_norte(5, "Morelos 45"), al_norte(38, "Otra")]))?.fila.name).toBe(
      "Morelos 45",
    );
    expect(mejor([])).toBeNull();
  });

  test("emparejar resume mejor, candidatos y ambigüedad", () => {
    const r = emparejar(aqui, [al_norte(10, "A"), al_norte(14, "B")]);
    expect(r.mejor).toBeNull();
    expect(r.ambiguo).toBe(true);
    expect(r.candidatos).toHaveLength(2);
    expect(emparejar(aqui, []).ambiguo).toBe(false);
  });

  test("sin coordenadas se ignora sin reventar", () => {
    expect(cercanos(aqui, [{ name: "Solo texto" }, { name: "Nulos", lat: null, lon: null }])).toHaveLength(0);
  });
});
