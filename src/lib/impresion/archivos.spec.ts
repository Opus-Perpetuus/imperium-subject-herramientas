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

describe("fotos en los archivos", () => {
  /** JPEG rojo de 12×8. */
  const ROJO = "data:image/jpeg;base64,/9j/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAAIAAwDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAb/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAABgf/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCIAGltf//Z";
  const con_foto: Impreso = {
    titulo: "Productos",
    subtitulo: "",
    columnas: [{ titulo: "Nombre" }, { titulo: "Foto", imagen: true }],
    filas: [["Mezcal", ROJO]],
    total: "Total: 1 registro",
  };

  test("el PDF lleva la foto incrustada una vez", async () => {
    const hojas = componer({ ...con_foto, filas: [["Mezcal", ROJO], ["Otra vez", ROJO]] }, await medida());
    const pdf = new TextDecoder("latin1").decode(await pdf_de(hojas, "Productos"));
    expect(pdf.match(/\/Subtype\s*\/Image/g)).toHaveLength(1);
  });

  test("el PNG pinta la foto dentro de su caja", async () => {
    const [hoja] = componer(con_foto, await medida());
    const [png] = await png_de([hoja!]);
    const { Resvg } = await import("@resvg/resvg-wasm");
    const imagen = hoja!.imagenes[0]!;
    const escala = 150 / 72;
    const svg = svg_de(hoja!);
    expect(svg).toContain(`<image href="${ROJO}"`);
    const pixeles = new Resvg(svg, { fitTo: { mode: "width", value: Math.round(hoja!.ancho * escala) } }).render();
    const x = Math.round((imagen.x + imagen.ancho / 2) * escala);
    const y = Math.round((imagen.y + imagen.alto / 2) * escala);
    const i = (y * pixeles.width + x) * 4;
    const [r, g, b] = [pixeles.pixels[i]!, pixeles.pixels[i + 1]!, pixeles.pixels[i + 2]!];
    expect(r).toBeGreaterThan(180);
    expect(g).toBeLessThan(80);
    expect(b).toBeLessThan(80);
    expect(dimensiones(png!)).toEqual([1275, 1650]);
  });

  test("una imagen que no es data URL de JPEG o PNG no se dibuja ni rompe el archivo", async () => {
    const [hoja] = componer({ ...con_foto, filas: [["Mezcal", "/api/media/abc"]] }, await medida());
    expect(svg_de(hoja!)).not.toContain("<image");
    const pdf = await pdf_de([hoja!], "Productos");
    expect(new TextDecoder().decode(pdf.subarray(0, 5))).toBe("%PDF-");
  });
});

