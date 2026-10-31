import { describe, expect, test } from "bun:test";
import { calcular_valores, type ContextoCalculo } from "./calculadora.ts";
import { armar_formula, opciones_columnas, opciones_origen, pedido_desde_formulario } from "./constructor.ts";
import { formula_con_claves, operando, opciones_numericas } from "./disenio.ts";
import { spec_de_fila, type TablaSpec } from "./esquema.ts";
import { ayuda_subtabla } from "../../modules/herr-tablas/herr-tablas.disenador.ts";

const PARTIDAS = {
  clave: "partidas",
  etiqueta: "Partidas",
  tipo: "subtabla",
  columnas: [
    { clave: "tipo", etiqueta: "Tipo", tipo: "texto" },
    { clave: "cantidad", etiqueta: "Cantidad", tipo: "entero" },
    { clave: "precio", etiqueta: "Precio", tipo: "dinero" },
    { clave: "nombre", etiqueta: "Nombre", tipo: "texto" },
  ],
};
const PEDIDO: TablaSpec = spec_de_fila({
  id: "t_ped",
  name: "Pedidos",
  campos: [{ clave: "cliente", etiqueta: "Cliente", tipo: "texto" }, { clave: "minimo", etiqueta: "Mínimo", tipo: "numero" }, PARTIDAS],
});
const filas = JSON.stringify([
  { _id: "a", tipo: "X", cantidad: "2", precio: "15", nombre: "Tornillo" },
  { _id: "b", tipo: "X", cantidad: "5", precio: "8", nombre: "Tuerca" },
  { _id: "c", tipo: "Y", cantidad: "1", precio: "50", nombre: "Llave" },
  { _id: "d", tipo: "X", cantidad: "3", precio: "40", nombre: "Pinza" },
]);
const ctx: ContextoCalculo = { externas: { por_nombre: (n) => ({ error: `No existe «${n}»` }), por_id: () => null }, compartido: new Map() };

const calcula = (formula: string) => {
  const spec = spec_de_fila({ ...PEDIDO, campos: [...PEDIDO.campos, { clave: "r", etiqueta: "R", tipo: "calculado", decimales: 0, formula }] });
  return calcular_valores(spec, { cliente: "Ana", minimo: "10", partidas: filas }, [], ctx).r;
};

describe("subtablas en el diseñador de cálculos", () => {
  test("la ayuda y los menús enseñan las subcolumnas", () => {
    const ayuda = ayuda_subtabla(PEDIDO.campos.find((c) => c.clave === "partidas")!);
    expect(ayuda).toContain("{Partidas}");
    expect(ayuda).toContain("{Partidas.Precio}");
    expect(ayuda).toContain("{Partidas.ultima.Cantidad}");
    expect(ayuda).toContain('sub_cuenta("Partidas"');
    expect(opciones_origen(PEDIDO, [])).toContainEqual({ value: "sub:partidas", label: "Subtabla Partidas (las filas de este registro)" });
    expect(opciones_columnas(PEDIDO, [])).toContainEqual({ value: "sub:partidas|precio", label: "Subtabla Partidas › Precio" });
    expect(opciones_numericas(PEDIDO)).toContainEqual({ value: "partidas.cantidad", label: "Partidas › Cantidad (suma de las filas)" });
    expect(operando(PEDIDO, "partidas.cantidad")).toBe("{partidas.cantidad}");
    expect(operando(PEDIDO, "partidas.nada")).toBeNull();
  });

  test("el constructor arma sub_suma con condiciones de subcolumnas", () => {
    const r = armar_formula(PEDIDO, [], pedido_desde_formulario({
      ext_que: "suma", ext_tabla: "sub:partidas", ext_columna: "sub:partidas|cantidad",
      ext_c1_columna: "sub:partidas|tipo", ext_c1_op: "=", ext_c1_valor: "X",
      ext_c2_columna: "sub:partidas|precio", ext_c2_op: ">", ext_c2_actual: "minimo",
    })!);
    expect(r).toEqual({ formula: 'sub_suma("partidas", {cantidad}, ({tipo} == "X") y ({precio} > {actual:minimo}))' });
    if ("formula" in r) expect(calcula(r.formula)).toBe("5");
  });

  test("anidada: la 1 y (alguna de las demás); contar sin condición", () => {
    const r = armar_formula(PEDIDO, [], pedido_desde_formulario({
      ext_que: "cuenta", ext_tabla: "sub:partidas", ext_union: "y_o",
      ext_c1_columna: "sub:partidas|tipo", ext_c1_valor: "X",
      ext_c2_columna: "sub:partidas|precio", ext_c2_op: ">", ext_c2_valor: "30",
      ext_c3_columna: "sub:partidas|cantidad", ext_c3_op: ">=", ext_c3_valor: "5",
    })!);
    expect(r).toEqual({ formula: 'sub_cuenta("partidas", ({tipo} == "X") y (({precio} > 30) o ({cantidad} >= 5)))' });
    if ("formula" in r) expect(calcula(r.formula)).toBe("2");
    expect(armar_formula(PEDIDO, [], pedido_desde_formulario({ ext_que: "cuenta", ext_tabla: "sub:partidas" })!)).toEqual({ formula: 'sub_cuenta("partidas")' });
  });

  test("no deja mezclar columnas del registro como origen de la subtabla", () => {
    const r = armar_formula(PEDIDO, [], pedido_desde_formulario({ ext_que: "suma", ext_tabla: "sub:partidas", ext_columna: "t_ped|minimo" })!);
    expect("error" in r).toBe(true);
    expect(armar_formula(PEDIDO, [], pedido_desde_formulario({ ext_que: "suma", ext_tabla: "sub:nada", ext_columna: "sub:nada|x" })!)).toEqual({ error: "Esa subtabla ya no está en esta tabla" });
  });

  test("los ejemplos escritos a mano funcionan (con nombres visibles)", () => {
    const f = (e: string) => calcula(formula_con_claves(PEDIDO, e));
    expect(f('sub_suma("Partidas", {Cantidad}, {Tipo} = "X" y {Precio} > 10)')).toBe("5");
    expect(f('sub_suma("Partidas", {Cantidad} × {Precio}, {Tipo} = "X" y ({Precio} > 10 o {Cantidad} >= 5))')).toBe("190");
    expect(f('sub_cuenta("Partidas", {Tipo} = "X" o {Precio} >= 50)')).toBe("4");
    expect(f('sub_unir("Partidas", {Nombre}, {Tipo} = "X" y {Cantidad} > 2, " / ")')).toBe("Tuerca / Pinza");
    expect(f("{Partidas}")).toBe("4");
    expect(f("{Partidas.Cantidad}")).toBe("11");
    expect(f("{Partidas.ultima.Nombre}")).toBe("Pinza");
  });
});
