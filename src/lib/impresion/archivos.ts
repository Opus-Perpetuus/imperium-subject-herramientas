import fontkit from "@pdf-lib/fontkit";
import { initWasm, Resvg } from "@resvg/resvg-wasm";
import { PDFDocument, rgb, type PDFFont } from "pdf-lib";
import { escapar } from "../markdown/html.ts";
import type { Medida, Pagina } from "./composicion.ts";

/**
 * El PDF y los PNG de unas páginas compuestas. La fuente viaja con la app: la
 * imagen del contenedor no trae fuentes ni rasterizador, y el mismo archivo
 * mide, se incrusta en el PDF y dibuja el PNG, así que los tres coinciden.
 */

export const FAMILIA = "Montserrat";
const ARCHIVOS = { regular: "Montserrat-Regular.ttf", negrita: "Montserrat-Bold.ttf" } as const;

/** 150 puntos por pulgada: se lee en el teléfono y se imprime bien. */
const PX_POR_PUNTO = 150 / 72;

type Fuentes = { regular: Uint8Array; negrita: Uint8Array };

let fuentes: Promise<Fuentes> | null = null;

function cargar_fuentes(): Promise<Fuentes> {
  const leer = async (archivo: string) =>
    new Uint8Array(await Bun.file(new URL(`./fuentes/${archivo}`, import.meta.url)).arrayBuffer());
  return (fuentes ??= Promise.all([leer(ARCHIVOS.regular), leer(ARCHIVOS.negrita)]).then(([regular, negrita]) => ({
    regular,
    negrita,
  })));
}

let medida_lista: Promise<Medida> | null = null;

/** Ancho con los avances de cada glifo, sin interletraje: así coloca pdf-lib el texto. */
export function medida(): Promise<Medida> {
  return (medida_lista ??= cargar_fuentes().then((f) => {
    const medidor = (bytes: Uint8Array) => {
      const fuente = fontkit.create(Buffer.from(bytes));
      const avances = new Map<number, number>();
      return (texto: string) => {
        let total = 0;
        for (const caracter of texto) {
          const cp = caracter.codePointAt(0)!;
          let avance = avances.get(cp);
          if (avance === undefined) avances.set(cp, (avance = fuente.glyphForCodePoint(cp).advanceWidth));
          total += avance;
        }
        return total / fuente.unitsPerEm;
      };
    };
    const regular = medidor(f.regular);
    const negrita = medidor(f.negrita);
    return (texto, tamano, es_negrita) => (es_negrita ? negrita : regular)(texto) * tamano;
  }));
}

function color(hex: string) {
  const n = (i: number) => Number.parseInt(hex.slice(i, i + 2), 16) / 255;
  return rgb(n(1), n(3), n(5));
}

export async function pdf_de(paginas: Pagina[], titulo: string): Promise<Uint8Array> {
  const f = await cargar_fuentes();
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  doc.setTitle(titulo);
  doc.setCreator("Imperium · Herramientas");
  const regular = await doc.embedFont(f.regular, { subset: true });
  const negrita = await doc.embedFont(f.negrita, { subset: true });
  const fuente = (es_negrita: boolean): PDFFont => (es_negrita ? negrita : regular);
  for (const p of paginas) {
    const hoja = doc.addPage([p.ancho, p.alto]);
    for (const r of p.rellenos) {
      hoja.drawRectangle({ x: r.x, y: p.alto - r.y - r.alto, width: r.ancho, height: r.alto, color: color(r.color) });
    }
    for (const l of p.rayas) {
      hoja.drawLine({
        start: { x: l.x1, y: p.alto - l.y1 },
        end: { x: l.x2, y: p.alto - l.y2 },
        thickness: 0.5,
        color: color(l.color),
      });
    }
    for (const t of p.textos) {
      hoja.drawText(t.texto, { x: t.x, y: p.alto - t.y, size: t.tamano, font: fuente(t.negrita), color: color(t.color) });
    }
  }
  return doc.save();
}

export function svg_de(p: Pagina): string {
  const n = (x: number) => Math.round(x * 100) / 100;
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${n(p.ancho)}" height="${n(p.alto)}" viewBox="0 0 ${n(p.ancho)} ${n(p.alto)}">`,
    `<rect width="${n(p.ancho)}" height="${n(p.alto)}" fill="#ffffff"/>`,
    ...p.rellenos.map((r) => `<rect x="${n(r.x)}" y="${n(r.y)}" width="${n(r.ancho)}" height="${n(r.alto)}" fill="${r.color}"/>`),
    ...p.rayas.map(
      (l) => `<line x1="${n(l.x1)}" y1="${n(l.y1)}" x2="${n(l.x2)}" y2="${n(l.y2)}" stroke="${l.color}" stroke-width="0.5"/>`,
    ),
    ...p.textos.map(
      (t) =>
        `<text x="${n(t.x)}" y="${n(t.y)}" font-family="${FAMILIA}" font-size="${n(t.tamano)}" font-weight="${t.negrita ? 700 : 400}" fill="${t.color}" xml:space="preserve">${escapar(t.texto)}</text>`,
    ),
    "</svg>",
  ].join("");
}

let wasm: Promise<void> | null = null;

function iniciar_resvg(): Promise<void> {
  return (wasm ??= Bun.file(Bun.resolveSync("@resvg/resvg-wasm/index_bg.wasm", import.meta.dir))
    .arrayBuffer()
    .then((bytes) => initWasm(bytes)));
}

export async function png_de(paginas: Pagina[]): Promise<Uint8Array[]> {
  const [f] = await Promise.all([cargar_fuentes(), iniciar_resvg()]);
  return paginas.map((p) => {
    const resvg = new Resvg(svg_de(p), {
      fitTo: { mode: "width", value: Math.round(p.ancho * PX_POR_PUNTO) },
      font: { fontBuffers: [f.regular, f.negrita], defaultFontFamily: FAMILIA, sansSerifFamily: FAMILIA },
    });
    const imagen = resvg.render();
    const png = imagen.asPng();
    imagen.free();
    resvg.free();
    return png;
  });
}
