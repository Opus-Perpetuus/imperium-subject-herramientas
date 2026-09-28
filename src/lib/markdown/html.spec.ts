import { describe, expect, test } from "bun:test";
import { a_html } from "./html.ts";
import { encabezados, etiquetas } from "./indice.ts";
import { analizar } from "./parser.ts";

const html_de = (md: string) => a_html(analizar(md));

describe("markdown → html", () => {
  test("encabezados con ancla, párrafos e inline mixto", () => {
    expect(html_de("# Hola mundo\n\n**a** *b* ~~c~~ ==d== `e`")).toBe(
      '<h1 id="hola-mundo">Hola mundo</h1>\n<p><strong>a</strong> <em>b</em> <del>c</del> <mark>d</mark> <code>e</code></p>',
    );
  });

  test("escapa el texto: un <script> nunca llega como marcado", () => {
    const html = html_de('<script>alert("x")</script> & "comillas"');
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &quot;comillas&quot;");
  });

  test("escapa atributos de enlaces e imágenes", () => {
    expect(html_de('[t](a"b) ![x"y](c)')).toBe('<p><a href="a&quot;b">t</a> <img src="c" alt="x&quot;y"></p>');
  });

  test("una URL con esquema ejecutable no llega al href ni al src", () => {
    expect(html_de("[x](javascript:alert)")).toBe("<p><a>x</a></p>");
    expect(html_de("[x](JaVaScRiPt:alert) [y](vbscript:msgbox)")).toBe("<p><a>x</a> <a>y</a></p>");
    expect(html_de("[x](java&#9;script:alert)")).toBe('<p><a href="java&amp;#9;script:alert">x</a></p>');
    expect(a_html([{ tipo: "parrafo", contenido: [{ tipo: "enlace", texto: "x", url: " java\tscript:alert" }] }])).toBe("<p><a>x</a></p>");
    expect(html_de("[x](data:text/html;base64,PHNjcmlwdD4=)")).toBe("<p><a>x</a></p>");
    expect(html_de("![i](data:image/png;base64,AAAA) ![j](data:text/html;base64,AAAA)")).toBe(
      '<p><img src="data:image/png;base64,AAAA" alt="i"> <img alt="j"></p>',
    );
    expect(html_de("[w](https://a.mx) [m](mailto:a@b.mx) [r](/interno)")).toBe(
      '<p><a href="https://a.mx">w</a> <a href="mailto:a@b.mx">m</a> <a href="/interno">r</a></p>',
    );
  });

  test("tareas como casillas deshabilitadas", () => {
    expect(html_de("- [ ] pendiente\n- [x] hecha")).toBe(
      '<ul class="tareas">\n<li><input type="checkbox" disabled> pendiente</li>\n<li><input type="checkbox" disabled checked> hecha</li>\n</ul>',
    );
  });

  test("listas, cita anidada, código y regla", () => {
    expect(html_de("- a\n- b\n\n2. c\n\n> q\n> > qq\n\n```js\n<b>\n```\n\n---")).toBe(
      [
        "<ul>\n<li>a</li>\n<li>b</li>\n</ul>",
        '<ol start="2">\n<li>c</li>\n</ol>',
        "<blockquote>\n<p>q</p>\n<blockquote>\n<p>qq</p>\n</blockquote>\n</blockquote>",
        '<pre><code class="language-js">&lt;b&gt;</code></pre>',
        "<hr>",
      ].join("\n"),
    );
  });

  test("tabla GFM con inline en las celdas", () => {
    expect(html_de("| a | b |\n|---|---|\n| **1** | 2 |")).toBe(
      "<table>\n<thead><tr><th>a</th><th>b</th></tr></thead>\n<tbody>\n<tr><td><strong>1</strong></td><td>2</td></tr>\n</tbody>\n</table>",
    );
  });

  test("wiki, etiquetas y metadatos", () => {
    expect(html_de("---\nk: v\n---\n[[nota|alias]] #tag")).toBe(
      '\n<p><a data-wiki="nota">alias</a> <span class="etiqueta">#tag</span></p>',
    );
  });
});

describe("markdown: índice", () => {
  test("encabezados con anclas únicas, también dentro de citas", () => {
    const ast = analizar("# Título\n## Título\n> ### Ñandú *veloz*\n## ¿Qué?");
    expect(encabezados(ast)).toEqual([
      { nivel: 1, texto: "Título", ancla: "titulo" },
      { nivel: 2, texto: "Título", ancla: "titulo-2" },
      { nivel: 3, texto: "Ñandú veloz", ancla: "nandu-veloz" },
      { nivel: 2, texto: "¿Qué?", ancla: "que" },
    ]);
    // El HTML usa las mismas anclas.
    expect(a_html(ast)).toContain('<h2 id="titulo-2">');
  });

  test("etiquetas únicas en orden, en cualquier bloque", () => {
    const ast = analizar("# #a\n\ntexto #b y **#c** #a\n- [ ] #d\n> #e\n\n| #f |\n|---|\n| #b |");
    expect(etiquetas(ast)).toEqual(["a", "b", "c", "d", "e", "f"]);
  });
});
