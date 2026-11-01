import { describe, expect, test } from "bun:test";
import { code_completions_issues } from "@opus-perpetuus/imperium-core-kit";
import { CATALOGO_URL_ESCANER, catalogo_formula, catalogo_plantilla, describir_columna, funciones_formula } from "./autocompletado.ts";
import { spec_de_fila, type TablaSpec } from "./esquema.ts";
import {
  error_sintaxis,
  NOMBRES_FUNCIONES_FILA,
  NOMBRES_FUNCIONES_SIMPLES,
  NOMBRES_FUNCIONES_SUBTABLA,
  NOMBRES_FUNCIONES_TABLA,
} from "./motor.ts";
import { spec_de_subtabla } from "./subtabla.ts";

const CLIENTES: TablaSpec = spec_de_fila({
  id: "t_cli",
  name: "Clientes",
  campos: [
    { clave: "nombre", etiqueta: "Nombre", tipo: "texto" },
    { clave: "telefono", etiqueta: "Teléfono", tipo: "texto" },
  ],
});

const PARTIDAS = {
  clave: "partidas",
  etiqueta: "Partidas",
  tipo: "subtabla",
  columnas: [
    { clave: "cantidad", etiqueta: "Cantidad", tipo: "entero", unidad_columna: "unidad" },
    { clave: "unidad", etiqueta: "Unidad", tipo: "texto" },
    { clave: "precio", etiqueta: "Precio", tipo: "dinero", unidad: "$" },
  ],
};

const PEDIDOS: TablaSpec = spec_de_fila({
  id: "t_ped",
  name: "Pedidos",
  campos: [
    { clave: "cliente", etiqueta: "Cliente", tipo: "referencia", tabla_ref_id: "t_cli" },
    { clave: "estado", etiqueta: "Estado", tipo: "opcion", opciones: ["Pendiente", "Pagado"] },
    { clave: "total", etiqueta: "Total", tipo: "calculado", formula: 'sub_suma("partidas", {cantidad} * {precio})', unidad: "$" },
    { clave: "litros", etiqueta: "Litros", tipo: "numero", unidad: "L" },
    PARTIDAS,
  ],
  constantes: [{ clave: "meta", etiqueta: "Meta", valor: "1000" }],
});

const PAGOS: TablaSpec = spec_de_fila({
  id: "t_pag",
  name: "Pagos",
  campos: [
    { clave: "pedido", etiqueta: "Pedido", tipo: "referencia", tabla_ref_id: "t_ped" },
    { clave: "monto", etiqueta: "Monto", tipo: "dinero" },
  ],
});

const TODAS = [CLIENTES, PEDIDOS, PAGOS];
const por_label = (labels: string[]) => (c: { items: { label: string }[] }) => labels.map((l) => c.items.find((i) => i.label === l));

describe("funciones del autocompletado", () => {
  test("están todas las del motor, cada una con firma, explicación y ejemplo que se puede escribir", () => {
    const catalogo = catalogo_formula(PEDIDOS, TODAS, { excepto: "total" });
    const nombres = new Set(catalogo.items.filter((i) => i.kind === "function").map((i) => i.label.replace("(…)", "")));
    for (const n of [...NOMBRES_FUNCIONES_SIMPLES, ...NOMBRES_FUNCIONES_FILA, ...NOMBRES_FUNCIONES_TABLA, ...NOMBRES_FUNCIONES_SUBTABLA, "si", "if"]) {
      expect(nombres.has(n)).toBe(true);
    }
    for (const f of funciones_formula()) {
      expect(f.que_hace.length).toBeGreaterThan(10);
      expect(f.firma.startsWith(`${f.nombre}(`)).toBe(true);
      expect(error_sintaxis(f.ejemplo)).toBeNull();
      for (const [p] of f.parametros) expect(f.firma).toContain(p);
    }
  });

  test("toda sugerencia dice qué es", () => {
    for (const catalogo of [
      catalogo_formula(PEDIDOS, TODAS, { excepto: "total" }),
      catalogo_formula(PEDIDOS, TODAS, { total: true }),
      catalogo_plantilla(CLIENTES),
      CATALOGO_URL_ESCANER,
    ]) {
      expect(code_completions_issues(catalogo)).toEqual([]);
      for (const i of catalogo.items) {
        expect(i.detail ?? "").not.toBe("");
        expect(i.documentation ?? "").not.toBe("");
      }
      expect(catalogo.documentation?.length).toBeGreaterThan(50);
    }
  });
});

describe("columnas descritas desde su definición", () => {
  test("tipo, unidad, tabla y si es un cálculo con su fórmula legible", () => {
    const total = PEDIDOS.campos.find((c) => c.clave === "total")!;
    const d = describir_columna(total, PEDIDOS, TODAS);
    expect(d).toContain("**Total** de la tabla «Pedidos»");
    expect(d).toContain("Tipo: Cálculo");
    expect(d).toContain("Unidad: $");
    expect(d).toContain('Es un cálculo: `sub_suma("Partidas", {Cantidad} * {Precio})`');
    const cliente = describir_columna(PEDIDOS.campos[0]!, PEDIDOS, TODAS);
    expect(cliente).toContain("Enlace a un registro de «Clientes»");
    const estado = describir_columna(PEDIDOS.campos[1]!, PEDIDOS, TODAS);
    expect(estado).toContain('Opciones: "Pendiente", "Pagado"');
    const sub = spec_de_subtabla(PEDIDOS, PEDIDOS.campos.find((c) => c.clave === "partidas")!);
    expect(describir_columna(sub.campos[0]!, sub, TODAS)).toContain("Unidad: la que diga la columna «Unidad» en cada registro");
  });
});

describe("referencias de la fórmula", () => {
  const catalogo = catalogo_formula(PEDIDOS, TODAS, { excepto: "total" });

  test("columnas, fijos, enlaces y subtablas de este registro", () => {
    const [litros, meta, tel, sub, col, ultima, n] = por_label([
      "{Litros}",
      "{Meta}",
      "{Cliente.Teléfono}",
      "{Partidas}",
      "{Partidas.Cantidad}",
      "{Partidas.ultima.Precio}",
      "{Partidas.N.Precio}",
    ])(catalogo);
    expect(litros?.detail).toBe("Número · L · Pedidos");
    expect(meta?.detail).toContain("Valor fijo = 1000");
    expect(tel?.documentation).toContain("Por el enlace «Cliente» (tabla «Clientes»)");
    expect(sub?.scopes).toEqual(["", "filas"]);
    expect(col?.documentation).toContain("La suma de la columna");
    expect(ultima?.documentation).toContain("última fila");
    expect(n?.insert_text).toBe("{Partidas.${1:1}.Precio}");
    expect(new RegExp(n!.hover_pattern!).test("{Partidas.3.Precio}")).toBe(true);
    // La columna que se edita no se ofrece (salvo dentro de tabla_suma("Pedidos", …), donde es de cada registro).
    expect(catalogo.items.filter((i) => i.label === "{Total}").map((i) => i.scopes)).toEqual([["tabla:t_ped"]]);
  });

  test("dentro de sub_suma(\"Partidas\", …) las columnas son de cada fila", () => {
    const scope = catalogo.scopes!.find((s) => s.argument === "Partidas")!;
    expect(scope).toMatchObject({ id: "sub:partidas", function_pattern: "^sub_", parent: "" });
    const dentro = catalogo.items.filter((i) => i.scopes?.includes("sub:partidas")).map((i) => i.label);
    expect(dentro).toEqual(expect.arrayContaining(["{Cantidad}", "{Precio}", "{actual:Litros}", "{actual:_id}"]));
    const argumento = catalogo.items.find((i) => i.argument_of === "^sub_" && i.label === "Partidas");
    expect(argumento?.scopes).toEqual([""]);
  });

  test("dentro de tabla_suma(\"Pagos\", …) las de esa tabla, y los hijos a la mano", () => {
    expect(catalogo.scopes!.filter((s) => s.id === "tabla:t_pag").map((s) => s.argument)).toEqual(["Pagos", "t_pag"]);
    const monto = catalogo.items.find((i) => i.label === "{Monto}" && i.scopes?.includes("tabla:t_pag"));
    expect(monto?.documentation).toContain("Columna de cada registro de «Pagos»: **Monto**");
    expect(catalogo.items.find((i) => i.argument_of === "^tabla_" && i.label === "Pagos")?.documentation).toContain("Columnas: Pedido, Monto");
    const hijos = catalogo.items.find((i) => i.label === "Hijos en Pagos: sumar");
    expect(hijos?.insert_text).toBe('tabla_suma("Pagos", {${1:Monto}}, {Pedido} = {actual:_id})');
    // La subtabla de otra tabla vive dentro de esa tabla.
    expect(catalogo.scopes!.find((s) => s.id === "tabla:t_ped/sub:partidas")).toMatchObject({ parent: "tabla:t_ped" });
  });

  test("un total ofrece columnas enteras y no las del registro", () => {
    const total = catalogo_formula(PEDIDOS, TODAS, { total: true });
    expect(total.items.find((i) => i.label === "{suma:Litros}")?.documentation).toContain("todos los registros de «Pedidos»");
    expect(total.items.find((i) => i.label === "{Litros}")?.scopes).toEqual(["filas"]);
  });

  test("una columna de subtabla ve su fila y el registro, sin totales ni hijos", () => {
    const partidas = PEDIDOS.campos.find((c) => c.clave === "partidas")!;
    const sub = catalogo_formula(spec_de_subtabla(PEDIDOS, partidas), TODAS, { excepto: "precio", subtabla: partidas });
    const labels = sub.items.map((i) => i.label);
    expect(labels).toEqual(expect.arrayContaining(["{Cantidad}", "{Litros}", "{Meta}"]));
    expect(labels.some((l) => l.startsWith("{suma:") || l.startsWith("Hijos en"))).toBe(false);
  });
});

describe("plantillas", () => {
  test("de un renglón, con las columnas de la tabla enlazada", () => {
    const c = catalogo_plantilla(CLIENTES);
    expect(c.single_line).toBe(true);
    expect(c.items.map((i) => i.label)).toEqual(["{Nombre}", "{Teléfono}"]);
    expect(CATALOGO_URL_ESCANER.items[0]!.label).toBe("{valor}");
  });
});
