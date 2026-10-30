import bwipjs from "bwip-js/node";
import { formato_de_valor } from "../formulas/escaner.ts";

/**
 * El código leído, dibujado de nuevo como PNG (data URL) para el impreso:
 * en su formato si se sabe y se puede escribir; si no, el deducido del
 * valor (EAN-13 con dígito verificador válido, etc.), Code 128 o QR. Lo que ningún formato acepta queda en `null`.
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

/**
 * En qué orden intentar: el formato leído; si no lo hay (tecleado o registro
 * viejo) o solo se dedujo, el que el valor demuestra (GTIN válido → EAN/UPC/
 * ITF-14), luego el deducido, Code 128 para barras y al final QR. Antes, sin
 * formato, todo salía QR aunque fuera un EAN-13.
 */
export function formatos_para_dibujar(
  formato: string | undefined,
  solo_barras: boolean,
  valor = "",
  inferido = false,
): string[] {
  const leido = formato && !inferido ? BCID[formato] : undefined;
  const columna = solo_barras ? "barras" : "todos";
  const seguro = leido ? undefined : BCID[formato_de_valor(valor, columna, true)];
  const deducido = formato && inferido ? BCID[formato] : undefined;
  const debil = leido || seguro || deducido ? undefined : BCID[formato_de_valor(valor, columna)];
  return [...new Set([leido, seguro, deducido, debil, solo_barras ? "code128" : undefined, "qrcode"])].filter((x): x is string => !!x);
}

export async function png_de_codigo(valor: string, formato?: string, solo_barras = false, inferido = false): Promise<string | null> {
  const t = valor.trim();
  if (!t) return null;
  const llave = `${formato ?? ""}|${inferido ? 1 : 0}|${solo_barras ? 1 : 0}|${t}`;
  if (cache.has(llave)) return cache.get(llave)!;
  let out: string | null = null;
  for (const bcid of formatos_para_dibujar(formato, solo_barras, t, inferido)) {
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
