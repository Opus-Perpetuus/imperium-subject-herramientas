import { describe, expect, test } from "bun:test";
import type { Bloque, Tramo } from "./ast.ts";
import { analizar, analizar_tramos } from "./parser.ts";

const texto_de = (tramos: Tramo[]) =>
  tramos.map((t) => (t.tipo === "texto" ? t.valor : "")).join("");

describe("markdown: bloques", () => {
  test("los encabezados llevan su nivel", () => {
    const bloques = analizar("# Uno\n\n### Tres\n\n####### Siete");
    expect(bloques[0]).toMatchObject({ tipo: "encabezado", nivel: 1 });
    expect(bloques[1]).toMatchObject({ tipo: "encabezado", nivel: 3 });
    // Más de seis almohadillas no es encabezado.
    expect(bloques[2]!.tipo).toBe("parrafo");
  });

  test("un párrafo une líneas contiguas", () => {
    const bloques = analizar("línea uno\nlínea dos");
    expect(bloques).toHaveLength(1);
    expect(bloques[0]!.tipo).toBe("parrafo");
    expect(texto_de((bloques[0] as { contenido: Tramo[] }).contenido)).toBe("línea uno línea dos");
  });

  test("las tareas guardan estado y línea de origen", () => {
    const lista = analizar("- [ ] pendiente\n- [x] hecha")[0];
    expect(lista).toEqual({
      tipo: "tareas",
      elementos: [
        { hecha: false, contenido: [{ tipo: "texto", valor: "pendiente" }], linea: 0 },
        { hecha: true, contenido: [{ tipo: "texto", valor: "hecha" }], linea: 1 },
      ],
    });
  });

  test("las viñetas terminan donde empieza una tarea", () => {
    const bloques = analizar("- a\n- b\n- [ ] c");
    expect(bloques.map((b) => b.tipo)).toEqual(["vinetas", "tareas"]);
  });

  test("las listas numeradas conservan el inicio", () => {
    const lista = analizar("3. tres\n4) cuatro")[0] as Extract<Bloque, { tipo: "numerada" }>;
    expect(lista.inicio).toBe(3);
    expect(lista.elementos).toHaveLength(2);
  });

  test("una tabla necesita fila separadora", () => {
    const tabla = analizar("| a | b |\n| --- | :-: |\n| 1 | 2 |\n| 3 | 4 |")[0];
    expect(tabla).toEqual({ tipo: "tabla", cabecera: ["a", "b"], filas: [["1", "2"], ["3", "4"]] });
    // Sin separadora es un párrafo: si no, cualquier texto con `|` sería tabla.
    expect(analizar("| a | b |\n| 1 | 2 |")[0]!.tipo).toBe("parrafo");
  });

  test("los metadatos solo cuentan al inicio del documento", () => {
    const al_inicio = analizar("---\ntitulo: Prueba\netiquetas: a, b\n---\n\ntexto");
    expect(al_inicio[0]).toEqual({
      tipo: "metadatos",
      entradas: { titulo: "Prueba", etiquetas: "a, b" },
    });
    expect(al_inicio[1]!.tipo).toBe("parrafo");

    const en_medio = analizar("texto\n\n---\n\notro");
    expect(en_medio.some((b) => b.tipo === "metadatos")).toBe(false);
    expect(en_medio.some((b) => b.tipo === "regla")).toBe(true);
  });

  test("un bloque de código sin cerrar llega al final", () => {
    const codigo = analizar("```ts\nconst x = 1;\nconst y = 2;")[0];
    expect(codigo).toEqual({ tipo: "codigo", lenguaje: "ts", codigo: "const x = 1;\nconst y = 2;" });
  });

  test("las vallas ~~~ cierran y no interpretan su contenido", () => {
    const bloques = analizar("~~~\n# no es título\n~~~\ndespués");
    expect(bloques[0]).toEqual({ tipo: "codigo", lenguaje: null, codigo: "# no es título" });
    expect(bloques[1]!.tipo).toBe("parrafo");
  });

  test("las citas se analizan recursivamente y anidan", () => {
    const cita = analizar("> # Dentro\n> texto\n> > más adentro")[0] as Extract<Bloque, { tipo: "cita" }>;
    expect(cita.hijos[0]!.tipo).toBe("encabezado");
    expect(cita.hijos[1]!.tipo).toBe("parrafo");
    const interna = cita.hijos[2] as Extract<Bloque, { tipo: "cita" }>;
    expect(interna.tipo).toBe("cita");
    expect(interna.hijos[0]!.tipo).toBe("parrafo");
  });

  test("un párrafo se corta cuando empieza otro bloque", () => {
    const bloques = analizar("texto\n- viñeta\n***");
    expect(bloques.map((b) => b.tipo)).toEqual(["parrafo", "vinetas", "regla"]);
  });
});

describe("markdown: tramos", () => {
  test("un delimitador sin cerrar es texto literal", () => {
    const tramos = analizar_tramos("esto es **a medias");
    expect(tramos.every((t) => t.tipo === "texto")).toBe(true);
    expect(texto_de(tramos)).toBe("esto es **a medias");
  });

  test("negrita y cursiva anidan", () => {
    const negrita = analizar_tramos("**fuerte *y torcido***")[0] as Extract<Tramo, { tipo: "negrita" }>;
    expect(negrita.tipo).toBe("negrita");
    expect(negrita.hijos.some((t) => t.tipo === "cursiva")).toBe(true);
  });

  test("dos negritas en la misma línea no se fusionan", () => {
    const tramos = analizar_tramos("**uno** y **dos**");
    expect(tramos.filter((t) => t.tipo === "negrita")).toHaveLength(2);
  });

  test("inline mixto: __negrita__, _cursiva_, ~~tachado~~, ==resaltado==, `código`", () => {
    const tramos = analizar_tramos("__a__ _b_ ~~c~~ ==d== `e<f>`");
    expect(tramos.map((t) => t.tipo)).toEqual([
      "negrita", "texto", "cursiva", "texto", "tachado", "texto", "resaltado", "texto", "codigo",
    ]);
    expect(tramos[8]).toEqual({ tipo: "codigo", valor: "e<f>" });
  });

  test("enlaces e imágenes", () => {
    expect(analizar_tramos("ver [sitio](https://x.mx) y ![foto](a.png)")).toEqual([
      { tipo: "texto", valor: "ver " },
      { tipo: "enlace", texto: "sitio", url: "https://x.mx" },
      { tipo: "texto", valor: " y " },
      { tipo: "imagen", alt: "foto", url: "a.png" },
    ]);
    // Corchete sin paréntesis: texto literal.
    expect(texto_de(analizar_tramos("[no es enlace]"))).toBe("[no es enlace]");
  });

  test("los enlaces internos aceptan alias", () => {
    expect(analizar_tramos("[[nota]]")[0]).toEqual({ tipo: "wiki", destino: "nota", alias: null });
    expect(analizar_tramos("[[nota|así se ve]]")[0]).toEqual({ tipo: "wiki", destino: "nota", alias: "así se ve" });
  });

  test("una etiqueta necesita espacio antes y una letra después", () => {
    expect(analizar_tramos("#trabajo")[0]).toEqual({ tipo: "etiqueta", nombre: "trabajo" });
    expect(analizar_tramos("ir a #compras/súper, ya")[1]).toEqual({ tipo: "etiqueta", nombre: "compras/súper" });
    expect(analizar_tramos("url#ancla").some((t) => t.tipo === "etiqueta")).toBe(false);
    expect(analizar_tramos("# ").some((t) => t.tipo === "etiqueta")).toBe(false);
    expect(analizar_tramos("#1").some((t) => t.tipo === "etiqueta")).toBe(false);
  });

  test("el resaltado se reconoce", () => {
    expect(analizar_tramos("==importante==")[0]!.tipo).toBe("resaltado");
  });
});
