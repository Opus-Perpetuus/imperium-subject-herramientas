import { es_foto_guardada } from "../comun.ts";
import type { CampoSpec } from "./esquema.ts";

/** Lo que cambió en un campo, ya en palabras de la lista (etiqueta y valores presentados). */
export type Cambio = { etiqueta: string; antes: string; despues: string };

/**
 * Los campos capturables que cambiaron entre dos versiones de un registro.
 * `presentar` da el valor como se lee en la lista (fechas, dinero, nombres de
 * los enlaces). Las fotos no tienen texto: se dice si se puso, cambió o quitó.
 */
export function cambios_de(
  campos: CampoSpec[],
  antes: Record<string, string>,
  despues: Record<string, string>,
  presentar: (campo: CampoSpec, raw: string) => string,
): Cambio[] {
  const out: Cambio[] = [];
  for (const campo of campos) {
    if (campo.tipo === "calculado") continue;
    const a = antes[campo.clave] ?? "";
    const d = despues[campo.clave] ?? "";
    if (a === d) continue;
    if (campo.tipo === "foto") {
      const habia = es_foto_guardada(a);
      const hay = es_foto_guardada(d);
      if (habia || hay) {
        out.push({
          etiqueta: campo.etiqueta,
          antes: habia ? (hay ? "Foto anterior" : "Sí") : "",
          despues: hay ? (habia ? "Foto nueva" : "Sí") : "",
        });
      }
      continue;
    }
    const antes_txt = presentar(campo, a);
    const despues_txt = presentar(campo, d);
    if (antes_txt !== despues_txt) out.push({ etiqueta: campo.etiqueta, antes: antes_txt, despues: despues_txt });
  }
  return out;
}

/** «Cantidad: 3 → 5 · Producto: — → Mezcal». */
export function describir_cambios(cambios: Cambio[]): string {
  return cambios.map((c) => `${c.etiqueta}: ${c.antes || "—"} → ${c.despues || "—"}`).join(" · ");
}

/** «Cambió Cantidad», «Cambió Cantidad y Producto», «Cambió Cantidad, Producto y 2 más». */
export function titulo_de_cambios(cambios: Cambio[]): string {
  const nombres = cambios.map((c) => c.etiqueta);
  if (!nombres.length) return "Se guardó sin cambios";
  if (nombres.length === 1) return `Cambió ${nombres[0]}`;
  if (nombres.length <= 3) return `Cambió ${nombres.slice(0, -1).join(", ")} y ${nombres.at(-1)}`;
  return `Cambió ${nombres.slice(0, 2).join(", ")} y ${nombres.length - 2} más`;
}
