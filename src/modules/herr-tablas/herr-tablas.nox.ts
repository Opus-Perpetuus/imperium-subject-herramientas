import type { NoxPageDescriptor, NoxUiNode } from "@opus-perpetuus/imperium-core-kit";

/** Piezas de descriptor compartidas por las páginas de tablas, registros y cierres. */

export const API = "api://m/subject-herramientas";
export const OWNER = "subject-herramientas";

export function nodo(component: string, props: Record<string, unknown> = {}, children?: NoxUiNode[]): NoxUiNode {
  return { component, props, ...(children?.length ? { children } : {}) };
}

export function enlace(text: string, href: string): NoxUiNode {
  return { component: "nox.link", props: { href, text }, text };
}

export function boton(text: string, props: Record<string, unknown> = {}): NoxUiNode {
  return { component: "nox.button", props: { ...props, text }, text };
}

export function pagina(id: string, title: string, hijos: NoxUiNode[]): NoxPageDescriptor {
  return { id, owner: OWNER, title, page: nodo("nox.page", {}, hijos) };
}

export function con_unidad(valor: string, unidad?: string | null): string {
  return valor && unidad ? `${valor} ${unidad}` : valor;
}
