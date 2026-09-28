import type { Bloque, Tramo } from "./ast.ts";
import { ancla_de, texto_plano } from "./indice.ts";
import { analizar_tramos } from "./parser.ts";

/**
 * AST → HTML. Todo texto y atributo se escapa; el parser no tiene bloque de
 * HTML crudo, así que nada de la entrada llega a la salida como marcado.
 * Los metadatos no se pintan.
 */

export function escapar(texto: string): string {
  return texto
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function a_html(bloques: Bloque[]): string {
  return bloques_a_html(bloques, new Set());
}

function bloques_a_html(bloques: Bloque[], anclas: Set<string>): string {
  return bloques.map((b) => bloque_a_html(b, anclas)).join("\n");
}

function bloque_a_html(b: Bloque, anclas: Set<string>): string {
  switch (b.tipo) {
    case "encabezado": {
      const ancla = ancla_de(texto_plano(b.contenido), anclas);
      return `<h${b.nivel} id="${escapar(ancla)}">${tramos_a_html(b.contenido)}</h${b.nivel}>`;
    }
    case "parrafo":
      return `<p>${tramos_a_html(b.contenido)}</p>`;
    case "cita":
      return `<blockquote>\n${bloques_a_html(b.hijos, anclas)}\n</blockquote>`;
    case "codigo": {
      const clase = b.lenguaje ? ` class="language-${escapar(b.lenguaje)}"` : "";
      return `<pre><code${clase}>${escapar(b.codigo)}</code></pre>`;
    }
    case "vinetas":
      return `<ul>\n${b.elementos.map((e) => `<li>${tramos_a_html(e.contenido)}</li>`).join("\n")}\n</ul>`;
    case "numerada": {
      const inicio = b.inicio === 1 ? "" : ` start="${b.inicio}"`;
      return `<ol${inicio}>\n${b.elementos.map((e) => `<li>${tramos_a_html(e.contenido)}</li>`).join("\n")}\n</ol>`;
    }
    case "tareas":
      return `<ul class="tareas">\n${b.elementos
        .map(
          (t) =>
            `<li><input type="checkbox" disabled${t.hecha ? " checked" : ""}> ${tramos_a_html(t.contenido)}</li>`,
        )
        .join("\n")}\n</ul>`;
    case "tabla": {
      const celda = (etiqueta: string, c: string) =>
        `<${etiqueta}>${tramos_a_html(analizar_tramos(c))}</${etiqueta}>`;
      const cabecera = `<thead><tr>${b.cabecera.map((c) => celda("th", c)).join("")}</tr></thead>`;
      const filas = b.filas.map((f) => `<tr>${f.map((c) => celda("td", c)).join("")}</tr>`).join("\n");
      return `<table>\n${cabecera}\n<tbody>\n${filas}\n</tbody>\n</table>`;
    }
    case "regla":
      return "<hr>";
    case "metadatos":
      return "";
  }
}

export function tramos_a_html(tramos: Tramo[]): string {
  return tramos.map(tramo_a_html).join("");
}

function tramo_a_html(t: Tramo): string {
  switch (t.tipo) {
    case "texto":
      return escapar(t.valor);
    case "negrita":
      return `<strong>${tramos_a_html(t.hijos)}</strong>`;
    case "cursiva":
      return `<em>${tramos_a_html(t.hijos)}</em>`;
    case "tachado":
      return `<del>${tramos_a_html(t.hijos)}</del>`;
    case "resaltado":
      return `<mark>${tramos_a_html(t.hijos)}</mark>`;
    case "codigo":
      return `<code>${escapar(t.valor)}</code>`;
    case "enlace":
      return `<a href="${escapar(t.url)}">${escapar(t.texto)}</a>`;
    case "imagen":
      return `<img src="${escapar(t.url)}" alt="${escapar(t.alt)}">`;
    case "wiki":
      return `<a data-wiki="${escapar(t.destino)}">${escapar(t.alias ?? t.destino)}</a>`;
    case "etiqueta":
      return `<span class="etiqueta">#${escapar(t.nombre)}</span>`;
  }
}
