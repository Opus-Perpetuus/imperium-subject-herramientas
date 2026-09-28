import { normalizar } from "../comun.ts";
import type { Bloque, Tramo } from "./ast.ts";
import { analizar_tramos } from "./parser.ts";

/** Índice del documento: encabezados con ancla y etiquetas únicas. */

export type Encabezado = { nivel: number; texto: string; ancla: string };

/** Texto sin formato de una lista de tramos. */
export function texto_plano(tramos: Tramo[]): string {
  return tramos
    .map((t) => {
      switch (t.tipo) {
        case "texto":
        case "codigo":
          return t.valor;
        case "enlace":
          return t.texto;
        case "imagen":
          return t.alt;
        case "wiki":
          return t.alias ?? t.destino;
        case "etiqueta":
          return `#${t.nombre}`;
        default:
          return texto_plano(t.hijos);
      }
    })
    .join("");
}

/** Ancla estable y única para un encabezado: `Precio por hora` → `precio-por-hora`, `-2` si se repite. */
export function ancla_de(texto: string, usadas: Set<string>): string {
  const base = normalizar(texto).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "seccion";
  let ancla = base;
  for (let n = 2; usadas.has(ancla); n++) ancla = `${base}-${n}`;
  usadas.add(ancla);
  return ancla;
}

/** Encabezados en orden de documento, incluidos los que van dentro de citas. */
export function encabezados(bloques: Bloque[], usadas = new Set<string>()): Encabezado[] {
  const out: Encabezado[] = [];
  for (const b of bloques) {
    if (b.tipo === "encabezado") {
      const texto = texto_plano(b.contenido);
      out.push({ nivel: b.nivel, texto, ancla: ancla_de(texto, usadas) });
    } else if (b.tipo === "cita") {
      out.push(...encabezados(b.hijos, usadas));
    }
  }
  return out;
}

/** Etiquetas `#x` únicas, en orden de aparición. */
export function etiquetas(bloques: Bloque[]): string[] {
  const vistas = new Set<string>();
  const recoger = (tramos: Tramo[]) => {
    for (const t of tramos) {
      if (t.tipo === "etiqueta") vistas.add(t.nombre);
      else if ("hijos" in t) recoger(t.hijos);
    }
  };
  const recorrer = (lista: Bloque[]) => {
    for (const b of lista) {
      switch (b.tipo) {
        case "encabezado":
        case "parrafo":
          recoger(b.contenido);
          break;
        case "cita":
          recorrer(b.hijos);
          break;
        case "vinetas":
        case "numerada":
        case "tareas":
          for (const e of b.elementos) recoger(e.contenido);
          break;
        case "tabla":
          for (const celda of [b.cabecera, ...b.filas].flat()) recoger(analizar_tramos(celda));
          break;
      }
    }
  };
  recorrer(bloques);
  return [...vistas];
}
