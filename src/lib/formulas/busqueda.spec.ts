import { describe, expect, test } from "bun:test";
import { buscar, construir_indice, texto_buscable, tokenizar, type EntradaIndexada } from "./busqueda.ts";
import type { TablaSpec } from "./esquema.ts";

const entrada = (id: string, texto: string, updated_at = ""): EntradaIndexada => ({ id, texto, updated_at });

function indice_de(...entradas: EntradaIndexada[]) {
  return [construir_indice(entradas), new Map(entradas.map((e) => [e.id, e]))] as const;
}

describe("búsqueda", () => {
  test("multi-palabra en AND", () => {
    const [i, por_id] = indice_de(
      entrada("a", "Av. Reforma 128 Col. Centro"),
      entrada("b", "Av. Reforma sin número"),
      entrada("c", "Calle Morelos 12"),
    );
    expect(buscar(i, "reforma 12", por_id)).toEqual(["a"]);
  });

  test("sin acentos: reforma casa con Réforma", () => {
    const [i, por_id] = indice_de(entrada("a", "Calle Réforma Norte"), entrada("b", "Otra cosa"));
    expect(buscar(i, "reforma", por_id)).toEqual(["a"]);
    expect(buscar(i, "Réforma", por_id)).toEqual(["a"]);
  });

  test("prefijo: refor encuentra Reforma", () => {
    const [i, por_id] = indice_de(entrada("a", "Av. Reforma 128"), entrada("b", "Calle Morelos"));
    expect(buscar(i, "refor", por_id)).toEqual(["a"]);
  });

  test("busca en calculados y etiquetas de referencia vía extras", () => {
    const texto = texto_buscable({ cobrar: "85", vehiculo: "veh-9" }, { propina: "15", vehiculo_label: "Italika 150" });
    const [i, por_id] = indice_de(entrada("p1", texto));
    expect(buscar(i, "15", por_id)).toEqual(["p1"]);
    expect(buscar(i, "italika", por_id)).toEqual(["p1"]);
    expect(buscar(i, "veh-9", por_id)).toEqual(["p1"]);
  });

  test("consulta vacía devuelve todo por recencia", () => {
    const [i, por_id] = indice_de(
      entrada("viejo", "uno", "2026-01-01"),
      entrada("nuevo", "dos", "2026-03-01"),
      entrada("medio", "tres", "2026-02-01"),
    );
    expect(buscar(i, "", por_id)).toEqual(["nuevo", "medio", "viejo"]);
    expect(buscar(i, "   ", por_id)).toEqual(["nuevo", "medio", "viejo"]);
  });

  test("puntuación por recencia cuando el match es el mismo", () => {
    const [i, por_id] = indice_de(entrada("viejo", "Reforma 100", "2026-01-01"), entrada("nuevo", "Reforma 200", "2026-02-01"));
    expect(buscar(i, "reforma", por_id)).toEqual(["nuevo", "viejo"]);
  });

  test("más tokens que casan gana", () => {
    const [i, por_id] = indice_de(entrada("uno", "Reforma", "2026-02-01"), entrada("dos", "Reforma y Reforma", "2026-01-01"));
    expect(buscar(i, "ref", por_id)).toEqual(["dos", "uno"]);
  });

  test("tokenize ignora la puntuación", () => {
    expect(tokenizar("¡Hola, mundo!")).toEqual(["hola", "mundo"]);
    expect(tokenizar("Av. Reforma 128")).toEqual(["av", "reforma", "128"]);
  });

  test("sin candidatos el resultado es vacío", () => {
    const [i, por_id] = indice_de(entrada("a", "Calle Morelos"));
    expect(buscar(i, "reforma", por_id)).toEqual([]);
  });

  test("los campos geo, foto y ruta no entran al índice", () => {
    const spec: TablaSpec = {
      id: "t",
      name: "T",
      constantes: [],
      resumenes: [],
      campos: [
        { clave: "calle", etiqueta: "Calle", tipo: "texto" },
        { clave: "geo", etiqueta: "Ubicación", tipo: "geo" },
        { clave: "foto", etiqueta: "Foto", tipo: "foto" },
        { clave: "ruta", etiqueta: "Ruta", tipo: "ruta" },
      ],
    };
    const valores = { calle: "Reforma 43", geo: "19.432600,-99.133200", foto: "data:image/png;base64,QUJD", ruta: "ruta-99" };
    expect(texto_buscable(valores, {}, spec)).toBe("Reforma 43");
  });
});
