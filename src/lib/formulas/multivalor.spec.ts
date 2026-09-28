import { describe, expect, test } from "bun:test";
import { alternar, formatear, parsear } from "./multivalor.ts";

describe("multivalor", () => {
  test("vacío, uno y varios en orden", () => {
    expect(parsear(null)).toEqual([]);
    expect(parsear("")).toEqual([]);
    expect(parsear("   ")).toEqual([]);
    expect(parsear("etq-1")).toEqual(["etq-1"]);
    expect(parsear("etq-1|etq-2|etq-3")).toEqual(["etq-1", "etq-2", "etq-3"]);
  });

  test("se lee lo que se escribió; huecos y repetidos no producen fantasmas", () => {
    expect(parsear(formatear(["etq-1", "etq-2"]))).toEqual(["etq-1", "etq-2"]);
    expect(parsear("etq-1||etq-2|")).toEqual(["etq-1", "etq-2"]);
    expect(parsear("etq-1|etq-1")).toEqual(["etq-1"]);
  });

  test("alternar agrega lo que falta y quita lo que ya estaba", () => {
    expect(alternar("etq-1", "etq-2")).toBe("etq-1|etq-2");
    expect(alternar("etq-1|etq-2|etq-3", "etq-2")).toBe("etq-1|etq-3");
    expect(alternar(null, "etq-1")).toBe("etq-1");
    expect(alternar("etq-1", "etq-1")).toBe("");
  });
});
