import bwipjs from "bwip-js/node";

/**
 * El código leído, dibujado de nuevo como PNG (data URL) para el impreso:
 * en su formato si se sabe y se puede escribir; si no, Code 128 para una
 * columna de solo barras o QR. Lo que ningún formato acepta queda en `null`.
 */
const BCID: Record<string, string> = {
  qr_code: "qrcode",
  micro_qr_code: "microqrcode",
  rm_qr_code: "rectangularmicroqrcode",
  aztec: "azteccode",
  data_matrix: "datamatrix",
  pdf417: "pdf417",
  maxi_code: "maxicode",
  ean_13: "ean13",
  ean_8: "ean8",
  upc_a: "upca",
  upc_e: "upce",
  code_39: "code39",
  code_93: "code93",
  code_128: "code128",
  itf: "interleaved2of5",
  codabar: "rationalizedCodabar",
};
const DOS_D = new Set(["qrcode", "microqrcode", "rectangularmicroqrcode", "azteccode", "datamatrix", "pdf417", "maxicode"]);

const cache = new Map<string, string | null>();
const MAX_CACHE = 500;

export function formatos_para_dibujar(formato: string | undefined, solo_barras: boolean): string[] {
  const propio = formato ? BCID[formato] : undefined;
  return [...new Set([propio, solo_barras ? "code128" : "qrcode", "qrcode"].filter((x): x is string => !!x))];
}

export async function png_de_codigo(valor: string, formato?: string, solo_barras = false): Promise<string | null> {
  const t = valor.trim();
  if (!t) return null;
  const llave = `${formato ?? ""}|${solo_barras ? 1 : 0}|${t}`;
  if (cache.has(llave)) return cache.get(llave)!;
  let out: string | null = null;
  for (const bcid of formatos_para_dibujar(formato, solo_barras)) {
    try {
      const png = await bwipjs.toBuffer(
        DOS_D.has(bcid) ? { bcid, text: t, scale: 3, padding: 2 } : { bcid, text: t, scale: 2, height: 10, padding: 2 },
      );
      out = `data:image/png;base64,${Buffer.from(png).toString("base64")}`;
      break;
    } catch {
      /* este formato no acepta el texto: el siguiente */
    }
  }
  if (cache.size >= MAX_CACHE) cache.delete(cache.keys().next().value!);
  cache.set(llave, out);
  return out;
}
