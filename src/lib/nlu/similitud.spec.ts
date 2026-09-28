import { describe, expect, test } from "bun:test";
import { jaro_winkler, levenshtein, levenshtein_normalizado, similitud } from "./similitud.ts";

describe("similitud", () => {
  test("levenshtein simétrico y acotado", () => {
    expect(levenshtein("hola", "hola")).toBe(0);
    expect(levenshtein("abc", "ab")).toBe(levenshtein("ab", "abc"));
    const s = levenshtein_normalizado("contesta", "contestar");
    expect(s).toBeGreaterThan(0.7);
    expect(s).toBeLessThanOrEqual(1);
  });

  test("normalizado: idénticas 1, una vacía 0", () => {
    expect(levenshtein_normalizado("x", "x")).toBe(1);
    expect(levenshtein_normalizado("", "a")).toBe(0);
  });

  test("jaro-winkler simétrico, acotado y 1 para idénticas", () => {
    const a = jaro_winkler("marcar", "marcarr");
    expect(a).toBeCloseTo(jaro_winkler("marcarr", "marcar"), 5);
    expect(a).toBeGreaterThan(0);
    expect(a).toBeLessThanOrEqual(1);
    expect(jaro_winkler("mismo", "mismo")).toBe(1);
  });

  test("la mejor medida separa lo parecido de lo ajeno", () => {
    expect(similitud("iniciar jornada", "iniciar jornada")).toBeGreaterThan(0.99);
    expect(similitud("xyz", "iniciar jornada")).toBeLessThan(0.5);
  });

  test("un error típico del reconocedor sigue cerca", () => {
    expect(similitud("inisiar jornada", "iniciar jornada")).toBeGreaterThan(0.8);
  });
});
