import { describe, expect, test } from "bun:test";
import type { Registro, TablaSpec, TipoCampo } from "./esquema.ts";
import { ordenar } from "./orden.ts";

const spec = (orden_campo: string | null, tipo: TipoCampo = "texto", orden_desc = false): TablaSpec => ({
  id: "t",
  name: "T",
  orden_campo,
  orden_desc,
  constantes: [],
  resumenes: [],
  campos: [
    { clave: "nombre", etiqueta: "Nombre", tipo: "texto" },
    { clave: "orden", etiqueta: "Orden", tipo },
  ],
});

const fila = (id: string, orden: string, creado = ""): Registro => ({
  id,
  valores: { nombre: id, orden },
  created_at: creado,
});

const ids = (filas: Registro[]) => filas.map((f) => f.id);

describe("orden de las filas", () => {
  test("un campo numérico se ordena por número y no por letra", () => {
    const filas = [fila("diez", "10"), fila("dos", "2"), fila("uno", "1")];
    expect(ids(ordenar(spec("orden", "entero"), filas))).toEqual(["uno", "dos", "diez"]);
  });

  test("un campo de texto se sigue ordenando por letra", () => {
    expect(ids(ordenar(spec("orden"), [fila("b", "beta"), fila("a", "alfa")]))).toEqual(["a", "b"]);
  });

  test("sin valor capturado la fila se va al final", () => {
    expect(ids(ordenar(spec("orden", "entero"), [fila("sin", ""), fila("uno", "1")]))).toEqual(["uno", "sin"]);
  });

  test("el descendente da la vuelta al numérico", () => {
    const filas = [fila("dos", "2"), fila("diez", "10"), fila("uno", "1")];
    expect(ids(ordenar(spec("orden", "entero", true), filas))).toEqual(["diez", "dos", "uno"]);
  });

  test("sin campo de orden o sin esquema manda lo más reciente", () => {
    const filas = [fila("viejo", "", "2026-01-01"), fila("nuevo", "", "2026-02-01")];
    expect(ids(ordenar(spec(null), filas))).toEqual(["nuevo", "viejo"]);
    expect(ids(ordenar(null, filas))).toEqual(["nuevo", "viejo"]);
  });

  test("un campo de orden que ya no existe no rompe nada", () => {
    expect(ordenar(spec("fantasma"), [fila("b", "2"), fila("a", "1")])).toHaveLength(2);
  });
});
