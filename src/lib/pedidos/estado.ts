import type { DomainRow } from "@opus-perpetuus/imperium-core-kit";
import { booleano, normalizar, numero } from "../comun.ts";

/**
 * El estado de un pedido a lo largo de su vida: del papelito al cobro.
 * Papelitos y pedidos son una sola colección; el estado le sigue la pista.
 */

export const ESTADOS = ["capturado", "surtido", "en_ruta", "entregado", "cobrado"] as const;
export type Estado = (typeof ESTADOS)[number];

export const ETIQUETA_ESTADO: Record<Estado, string> = {
  capturado: "Capturado",
  surtido: "Surtido",
  en_ruta: "En ruta",
  entregado: "Entregado",
  cobrado: "Cobrado",
};

/**
 * Estado de una fila, leyendo con tolerancia lo escrito en otras épocas:
 * 1. `cobrado = true` gana sobre el texto: el flag es el que decidió el dinero.
 * 2. «Pendiente» (época anterior) es hoy «capturado».
 * 3. Vacío → «entregado»: antes de existir el campo, registrar era haber surtido.
 * 4. Un valor desconocido se devuelve tal cual: se ve y se corrige.
 */
export function estado_de(fila: DomainRow): string {
  if (booleano(fila.cobrado)) return "cobrado";
  const raw = normalizar(fila.estado).replace(/\s+/g, "_");
  if (!raw) return "entregado";
  if (raw === "pendiente") return "capturado";
  return raw;
}

/** El siguiente paso del flujo, o null si no lo hay o el estado no se reconoce. */
export function siguiente(estado: string): Estado | null {
  const i = (ESTADOS as readonly string[]).indexOf(estado);
  return i < 0 ? null : (ESTADOS[i + 1] ?? null);
}

/** Ya salió de mis manos: cuenta para las entregas. */
export function es_entregado(estado: string): boolean {
  return estado === "entregado" || estado === "cobrado";
}

/** Sigue en el mostrador o en la calle: aparece en la lista de trabajo. */
export function es_abierto(estado: string): boolean {
  return estado === "capturado" || estado === "surtido" || estado === "en_ruta";
}

/** Orden de entrega del siguiente pedido: uno más que el mayor de los abiertos. */
export function siguiente_orden(pedidos: DomainRow[]): number {
  const mayor = pedidos
    .filter((p) => es_abierto(estado_de(p)))
    .reduce((max, p) => Math.max(max, numero(p.orden) ?? 0), 0);
  return mayor + 1;
}
