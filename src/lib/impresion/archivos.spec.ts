import { describe, expect, test } from "bun:test";
import { PDFDocument } from "pdf-lib";
import { medida, pdf_de, png_de, svg_de } from "./archivos.ts";
import { componer, type Impreso } from "./composicion.ts";

const impreso: Impreso = {
  titulo: "Bitácoras Cava",
  subtitulo: "Impreso el 1 de octubre de 2026 a las 19:10",
  columnas: [{ titulo: "Producto" }, { titulo: "Cantidad", derecha: true }],
  filas: [
    ["Vino tinto 750 ml", "35"],
    ["Ñandú «especial» & <otro>", "12"],
  ],
  total: "Total: 2 registros",
};

/** Ancho y alto de un PNG, de su cabecera IHDR. */
function dimensiones(png: Uint8Array): [number, number] {
  const vista = new DataView(png.buffer, png.byteOffset, png.byteLength);
  return [vista.getUint32(16), vista.getUint32(20)];
}

describe("archivos de una impresión", () => {
  test("mide con la fuente de la app: el ancho crece con el texto, el tamaño y la negrita", async () => {
    const medir = await medida();
    expect(medir("MMMM", 10, false)).toBeGreaterThan(medir("iiii", 10, false));
    expect(medir("Total", 10, true)).toBeGreaterThan(medir("Total", 10, false));
    expect(medir("Cantidad", 20, false)).toBeCloseTo(2 * medir("Cantidad", 10, false));
    expect(medir("", 10, false)).toBe(0);
  });

  test("el PDF trae una página por hoja y el nombre de la tabla en sus datos", async () => {
    const muchas = { ...impreso, filas: Array.from({ length: 150 }, (_, i) => [`Producto ${i + 1}`, String(i)]) };
    const hojas = componer(muchas, await medida());
    expect(hojas.length).toBeGreaterThan(1);
    const pdf = await pdf_de(hojas, "Bitácoras Cava");
    expect(new TextDecoder().decode(pdf.subarray(0, 5))).toBe("%PDF-");
    const doc = await PDFDocument.load(pdf);
    expect(doc.getPageCount()).toBe(hojas.length);
    expect(doc.getTitle()).toBe("Bitácoras Cava");
    expect(doc.getPage(0).getSize()).toEqual({ width: 612, height: 792 });
  });

  test("cada hoja es un PNG carta a 150 ppp", async () => {
    const hojas = componer(impreso, await medida());
    const pngs = await png_de(hojas);
    expect(pngs).toHaveLength(hojas.length);
    expect([...pngs[0]!.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(dimensiones(pngs[0]!)).toEqual([1275, 1650]);
  });

  test("el SVG escapa lo que el usuario escribió", async () => {
    const [hoja] = componer(impreso, await medida());
    const svg = svg_de(hoja!);
    expect(svg).toContain("Ñandú «especial» &amp; &lt;otro&gt;");
    expect(svg).not.toContain("<otro>");
  });
});
