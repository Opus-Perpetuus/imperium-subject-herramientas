import { describe, expect, test } from "bun:test";
import { calcular_valores, type ContextoCalculo, type TablaCargada } from "./calculadora.ts";
import { formula_con_claves, formula_con_etiquetas } from "./disenio.ts";
import { spec_de_fila, validar_esquema, type Registro, type TablaSpec } from "./esquema.ts";
import { filas_de_subtabla, resumen_subtabla } from "./subtabla.ts";

const tabla = (id: string, name: string, campos: Record<string, unknown>[]): TablaSpec =>
  spec_de_fila({ id, name, campos: campos.map((c) => ({ etiqueta: c.clave, ...c })) });

const ITEMS = {
  clave: "items",
  etiqueta: "Productos",
  tipo: "subtabla",
  columnas: [
    { clave: "producto", etiqueta: "Producto", tipo: "referencia", tabla_ref_id: "t_cat" },
    { clave: "nombre", etiqueta: "Nombre", tipo: "texto" },
    { clave: "cantidad", etiqueta: "Cantidad", tipo: "entero" },
    { clave: "precio", etiqueta: "Precio", tipo: "dinero" },
    { clave: "importe", etiqueta: "Importe", tipo: "calculado", formula: "{cantidad} * {precio} * (1 - {descuento} / 100)" },
    { clave: "foto", etiqueta: "Foto", tipo: "foto" },
  ],
};

const CATALOGO = tabla("t_cat", "Catálogo", [
  { clave: "nombre", tipo: "texto" },
  { clave: "precio", tipo: "dinero" },
]);
const VENTA = tabla("t_venta", "Ventas", [
  { clave: "descuento", tipo: "numero" },
  ITEMS,
  { clave: "piezas", tipo: "calculado", decimales: 0, formula: "{items.cantidad}" },
  { clave: "total", tipo: "calculado", formula: "{items.importe}" },
  { clave: "renglones", tipo: "calculado", decimales: 0, formula: "{items}" },
  { clave: "caros", tipo: "calculado", decimales: 0, formula: 'sub_cuenta("items", {precio} > 20)' },
  { clave: "pan", tipo: "calculado", decimales: 0, formula: 'sub_suma("Productos", {cantidad}, {nombre} = "Pan")' },
  { clave: "lista", tipo: "calculado", formula: 'sub_unir("items", {nombre}, {cantidad} > 1 o {precio} > 100, " / ")' },
  { clave: "ultimo", tipo: "calculado", formula: "{items.ultima.nombre}" },
  { clave: "catalogo", tipo: "calculado", formula: "{items.producto}" },
]);

const filas = JSON.stringify([
  { _id: "a", nombre: "Pan", cantidad: "3", precio: "10" },
  { _id: "b", nombre: "Vino", cantidad: "1", precio: "120" },
]);

const catalogo: TablaCargada = { spec: CATALOGO, filas: [{ id: "c1", valores: { nombre: "Pan", precio: "10" } }] };
const ctx = (extra: TablaCargada[] = []): ContextoCalculo => {
  const todas = [catalogo, ...extra];
  return {
    externas: {
      por_nombre: (n) => todas.find((t) => t.spec.id === n || t.spec.name === n) ?? { error: `No existe «${n}»` },
      por_id: (id) => todas.find((t) => t.spec.id === id) ?? null,
    },
    compartido: new Map(),
  };
};

describe("subtabla", () => {
  test("el esquema es válido y las columnas no admitidas se descartan", () => {
    expect(validar_esquema(VENTA, [CATALOGO])).toEqual([]);
    expect(VENTA.campos.find((c) => c.clave === "items")!.columnas!.map((c) => c.clave)).toEqual([
      "producto",
      "nombre",
      "cantidad",
      "precio",
      "importe",
    ]);
  });

  test("errores: sin columnas, columna inexistente y subtabla desconocida", () => {
    const mala = tabla("t", "T", [
      { clave: "vacia", tipo: "subtabla", columnas: [] },
      ITEMS,
      { clave: "x", tipo: "calculado", formula: "{items.nada}" },
      { clave: "y", tipo: "calculado", formula: 'sub_suma("otra", 1)' },
    ]);
    const e = validar_esquema(mala, [CATALOGO]).join(" | ");
    expect(e).toContain("agrega al menos una columna");
    expect(e).toContain("«nada» no es una columna de la subtabla");
    expect(e).toContain("«otra» no es una subtabla");
  });

  test("calcula columnas de fila, totales, conteos y condiciones y/o", () => {
    const out = calcular_valores(VENTA, { descuento: "10", items: filas }, [], ctx());
    const guardadas = filas_de_subtabla(out.items);
    expect(guardadas.map((f) => f.importe)).toEqual(["27.00", "108.00"]);
    expect(out.piezas).toBe("4");
    expect(out.total).toBe("135.00");
    expect(out.renglones).toBe("2");
    expect(out.caros).toBe("1");
    expect(out.pan).toBe("3");
    expect(out.lista).toBe("Pan / Vino");
    expect(out.ultimo).toBe("Vino");
  });

  test("sin filas todo sale en cero o vacío, sin errores", () => {
    const out = calcular_valores(VENTA, { descuento: "0" }, [], ctx());
    expect(out.total).toBe("0.00");
    expect(out.renglones).toBe("0");
    expect(out.ultimo).toBe("");
  });

  test("otra tabla elige la subtabla completa o una fila", () => {
    const ventas: TablaCargada = { spec: VENTA, filas: [{ id: "v1", valores: { descuento: "0", items: filas } }] };
    const completa = tabla("t_ent", "Entregas", [
      { clave: "venta", tipo: "referencia", tabla_ref_id: "t_venta", ref_subtabla: "items", ref_subtabla_modo: "whole" },
      { clave: "cuantas", tipo: "calculado", decimales: 0, formula: "{venta.cantidad}" },
      { clave: "desc", tipo: "calculado", decimales: 0, formula: "{venta.descuento}" },
    ]);
    const una = tabla("t_dev", "Devoluciones", [
      { clave: "renglon", tipo: "referencia", tabla_ref_id: "t_venta", ref_subtabla: "items", ref_subtabla_modo: "element" },
      { clave: "que", tipo: "calculado", formula: "{renglon.nombre}" },
      { clave: "cuanto", tipo: "calculado", formula: "{renglon.importe}" },
    ]);
    expect(validar_esquema(completa, [VENTA, CATALOGO])).toEqual([]);
    expect(validar_esquema(una, [VENTA, CATALOGO])).toEqual([]);
    expect(una.campos[0]!.ref_subtabla_modo).toBe("element");
    const a = calcular_valores(completa, { venta: "v1" }, [], ctx([ventas]));
    expect(a.cuantas).toBe("4");
    expect(a.desc).toBe("0");
    const b = calcular_valores(una, { renglon: "v1~b" }, [], ctx([ventas]));
    expect(b.que).toBe("Vino");
    expect(b.cuanto).toBe("120.00");
  });

  test("las fórmulas se escriben con nombres visibles", () => {
    const f = formula_con_claves(VENTA, 'sub_suma("Productos", {Cantidad} * {Precio}, {Nombre} = "Pan") + {Productos.Última.Cantidad}', [CATALOGO]);
    expect(f).toBe('sub_suma("items", {cantidad} * {precio}, {nombre} = "Pan") + {items.ultima.cantidad}');
    expect(formula_con_etiquetas(VENTA, f, [CATALOGO])).toBe(
      'sub_suma("Productos", {Cantidad} * {Precio}, {Nombre} = "Pan") + {Productos.ultima.Cantidad}',
    );
  });

  test("resumen en una línea", () => {
    const campo = VENTA.campos.find((c) => c.clave === "items")!;
    const r = resumen_subtabla(campo, filas_de_subtabla(filas), (_c, raw) => raw);
    expect(r).toContain("2 filas");
    expect(r).toContain("Pan");
  });
});

void (null as unknown as Registro);
