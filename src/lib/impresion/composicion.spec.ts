import { describe, expect, test } from "bun:test";
import { componer, partir, repartir, type Impreso, type Medida, type Pagina } from "./composicion.ts";

/** Monoespaciada: cada letra mide medio tamaño. */
const medir: Medida = (texto, tamano) => texto.length * tamano * 0.5;

const textos = (p: Pagina) => p.textos.map((t) => t.texto);

function tabla(filas: number, columnas = 3): Impreso {
  return {
    titulo: "Bitácoras Cava",
    subtitulo: "Impreso el 1 de octubre de 2026",
    columnas: Array.from({ length: columnas }, (_, i) => ({ titulo: `Columna ${i + 1}`, derecha: i === columnas - 1 })),
    filas: Array.from({ length: filas }, (_, f) => Array.from({ length: columnas }, (_, c) => `f${f + 1}c${c + 1}`)),
    total: `Total: ${filas} registros`,
  };
}

describe("partir en líneas", () => {
  test("junta palabras mientras quepan, respeta los saltos y corta las palabras que no caben", () => {
    expect(partir("uno dos tres", 30, 10, false, medir)).toEqual(["uno", "dos", "tres"]);
    expect(partir("uno dos tres", 40, 10, false, medir)).toEqual(["uno dos", "tres"]);
    expect(partir("uno dos tres", 100, 10, false, medir)).toEqual(["uno dos tres"]);
    expect(partir("a\nb", 100, 10, false, medir)).toEqual(["a", "b"]);
    expect(partir("abcdefghij", 20, 10, false, medir)).toEqual(["abcd", "efgh", "ij"]);
    expect(partir("", 20, 10, false, medir)).toEqual([""]);
  });
});

describe("repartir el ancho", () => {
  test("si sobra se estira en proporción; si falta ceden primero las más anchas y las angostas quedan enteras", () => {
    expect(repartir([100, 100], [20, 20], 400)).toEqual([200, 200]);
    const [notas, producto] = repartir([300, 100], [50, 50], 300);
    expect(notas).toBeCloseTo(200);
    expect(producto).toBeCloseTo(100);
    const tres = repartir([400, 300, 60], [50, 50, 50], 400);
    expect(tres[0]).toBeCloseTo(170);
    expect(tres[1]).toBeCloseTo(170);
    expect(tres[2]).toBeCloseTo(60);
    expect(repartir([100, 100], [80, 120], 100)).toEqual([40, 60]);
  });
});

describe("componer", () => {
  test("una tabla chica cabe en una hoja vertical con título, encabezados, filas, total y pie", () => {
    const [hoja, ...resto] = componer(tabla(3), medir);
    expect(resto).toEqual([]);
    expect(hoja!.ancho).toBe(612);
    expect(textos(hoja!)).toEqual([
      "Bitácoras Cava",
      "Impreso el 1 de octubre de 2026",
      "Columna 1",
      "Columna 2",
      "Columna 3",
      "f1c1",
      "f1c2",
      "f1c3",
      "f2c1",
      "f2c2",
      "f2c3",
      "f3c1",
      "f3c2",
      "f3c3",
      "Total: 3 registros",
      "Bitácoras Cava",
      "Página 1 de 1",
    ]);
    expect(hoja!.textos.filter((t) => t.negrita).map((t) => t.texto)).toEqual([
      "Bitácoras Cava",
      "Columna 1",
      "Columna 2",
      "Columna 3",
      "Total: 3 registros",
    ]);
  });

  test("las columnas llenan el ancho útil y lo alineado a la derecha termina en su orilla", () => {
    const [hoja] = componer(tabla(2), medir);
    const c3 = hoja!.textos.find((t) => t.texto === "f1c3")!;
    expect(c3.x + medir("f1c3", c3.tamano, false)).toBeCloseTo(612 - 36 - 4);
    const c1 = hoja!.textos.find((t) => t.texto === "f1c1")!;
    expect(c1.x).toBeCloseTo(36 + 4);
  });

  test("muchas columnas van en hoja horizontal", () => {
    expect(componer(tabla(2, 12), medir)[0]!.ancho).toBe(792);
  });

  test("muchas filas: varias hojas, cada una repite los encabezados y el total va en la última", () => {
    const hojas = componer(tabla(120), medir);
    expect(hojas.length).toBeGreaterThan(2);
    for (const [i, hoja] of hojas.entries()) {
      expect(textos(hoja).at(-1)).toBe(`Página ${i + 1} de ${hojas.length}`);
      if (i > 0) expect(textos(hoja).slice(0, 3)).toEqual(["Columna 1", "Columna 2", "Columna 3"]);
      for (const t of hoja.textos) expect(t.y).toBeLessThan(hoja.alto);
    }
    expect(textos(hojas.at(-1)!)).toContain("Total: 120 registros");
    const filas = hojas.flatMap((h) => textos(h).filter((t) => /^f\d+c1$/.test(t)));
    expect(filas).toHaveLength(120);
    expect(filas[0]).toBe("f1c1");
    expect(filas.at(-1)).toBe("f120c1");
  });

  test("un texto largo se parte en líneas y pasado el tope termina en «…»", () => {
    const impreso = tabla(1, 2);
    impreso.filas[0]![0] = "palabra ".repeat(200).trim();
    const lineas = componer(impreso, medir)[0]!.textos.filter((t) => t.texto.startsWith("palabra"));
    expect(lineas).toHaveLength(4);
    expect(lineas.at(-1)!.texto.endsWith("…")).toBe(true);
  });

  test("el texto sale en NFC y sin guion suave", () => {
    const impreso = tabla(1, 1);
    impreso.filas[0]![0] = "Ñandú pe­ra";
    const [hoja] = componer(impreso, medir);
    expect(textos(hoja!)).toContain("Ñandú pera");
  });

  test("sin registros sale la hoja con encabezados y el total en cero", () => {
    const [hoja, ...resto] = componer(tabla(0), medir);
    expect(resto).toEqual([]);
    expect(textos(hoja!)).toContain("Columna 1");
    expect(textos(hoja!)).toContain("Total: 0 registros");
  });
});

describe("fotos en el impreso", () => {
  const con_fotos: Impreso = {
    titulo: "Productos",
    subtitulo: "",
    columnas: [{ titulo: "Nombre" }, { titulo: "Foto", imagen: true }],
    filas: [
      ["Mezcal", "data:image/jpeg;base64,AAAA"],
      ["Vino", ""],
    ],
    total: "Total: 2 registros",
  };

  test("cada foto ocupa su caja dentro de la celda y su fila crece a ese alto; la cabecera lleva el título", () => {
    const [hoja] = componer(con_fotos, medir);
    expect(hoja!.imagenes).toHaveLength(1);
    const [imagen] = hoja!.imagenes;
    expect(imagen!.href).toBe("data:image/jpeg;base64,AAAA");
    expect(imagen!.alto).toBe(40);
    expect(imagen!.ancho).toBeGreaterThanOrEqual(40);
    expect(textos(hoja!)).toContain("Foto");
    expect(textos(hoja!)).not.toContain("data:image/jpeg;base64,AAAA");
    const rayas = hoja!.rayas.map((r) => r.y1).sort((a, b) => a - b);
    const alto_fila_con_foto = rayas[1]! - rayas[0]!;
    const alto_fila_sin_foto = rayas[2]! - rayas[1]!;
    expect(alto_fila_con_foto).toBeGreaterThanOrEqual(40);
    expect(alto_fila_sin_foto).toBeLessThan(alto_fila_con_foto);
    expect(imagen!.y).toBeGreaterThan(rayas[0]!);
    expect(imagen!.y + imagen!.alto).toBeLessThanOrEqual(rayas[1]!);
  });

  test("varias fotos en una celda van en cuadros iguales sin encimarse; si no caben a lo ancho bajan de renglón", () => {
    const fotos = Array.from({ length: 5 }, (_, i) => `data:image/jpeg;base64,F${i}`);
    const galeria = (columnas_de_texto: number): Pagina =>
      componer(
        {
          titulo: "Galería",
          subtitulo: "",
          columnas: [
            ...Array.from({ length: columnas_de_texto }, (_, i) => ({ titulo: `Dato largo ${i + 1}` })),
            { titulo: "Fotos", imagen: true },
          ],
          filas: [[...Array.from({ length: columnas_de_texto }, () => "un texto que ocupa su lugar"), fotos.join("|")]],
          total: "Total: 1 registro",
        },
        medir,
      )[0]!;
    for (const hoja of [galeria(1), galeria(9)]) {
      expect(hoja.imagenes.map((i) => i.href)).toEqual(fotos);
      expect(hoja.imagenes.every((i) => i.ancho === 40 && i.alto === 40)).toBe(true);
      const encimadas = hoja.imagenes.some((a, i) =>
        hoja.imagenes.some((b, j) => i !== j && a.x < b.x + b.ancho && b.x < a.x + a.ancho && a.y < b.y + b.alto && b.y < a.y + a.alto),
      );
      expect(encimadas).toBe(false);
      const rayas = hoja.rayas.map((r) => r.y1).sort((a, b) => a - b);
      expect(Math.max(...hoja.imagenes.map((i) => i.y + i.alto))).toBeLessThanOrEqual(rayas[1]!);
    }
    expect(new Set(galeria(1).imagenes.map((i) => i.y)).size).toBe(1);
    expect(new Set(galeria(9).imagenes.map((i) => i.y)).size).toBeGreaterThan(1);
  });
});
