import { describe, expect, test } from "bun:test";
import { calcular_valores, valores_resumen, type ContextoCalculo, type TablaCargada } from "./calculadora.ts";
import { armar_formula, pedido_desde_formulario } from "./constructor.ts";
import { formula_con_claves, formula_con_etiquetas } from "./disenio.ts";
import { spec_de_fila, validar_esquema, type Registro, type TablaSpec } from "./esquema.ts";
import { a_numero, a_texto, ambito_de, evaluar, referencias, type Ambito, type Valor } from "./motor.ts";

/** Ámbito con filas propias y otras tablas por nombre. */
function mundo(valores: Record<string, Valor>, filas: Record<string, Valor>[] = [], tablas: Record<string, Record<string, Valor>[]> = {}): Ambito {
  return {
    ...ambito_de(valores, filas.map((f) => ambito_de(f))),
    tabla: (n) => (n in tablas ? { filas: tablas[n]!.map((f) => ambito_de(f)) } : { error: `No existe la tabla «${n}»` }),
  };
}

function valor(formula: string, ambito: Ambito): Valor {
  const r = evaluar(formula, ambito);
  if (!r.ok) throw new Error(r.error);
  return r.valor;
}

const VENTAS = [
  { producto: "Vino", categoria: "Bebida", cantidad: 3, estado: "pagado", almacen: "Norte" },
  { producto: "Vino", categoria: "Bebida", cantidad: 2, estado: "pendiente", almacen: "Norte" },
  { producto: "Pan", categoria: "Comida", cantidad: 10, estado: "pagado", almacen: "Sur" },
  { producto: "Cerveza", categoria: "Bebida", cantidad: 6, estado: "pagado", almacen: "Sur" },
];

describe("fórmulas sobre otra tabla", () => {
  const amb = mundo({ nombre: "Vino", almacen: "Sur" }, [], { Ventas: VENTAS });

  test("tabla_suma con y / o anidados y columnas del registro como operando", () => {
    expect(a_numero(valor('tabla_suma("Ventas", {cantidad})', amb))).toBe(21);
    expect(a_numero(valor('tabla_suma("Ventas", {cantidad}, {producto} = {actual:nombre})', amb))).toBe(5);
    expect(
      a_numero(valor('tabla_suma("Ventas", {cantidad}, ({producto} = "Vino" o {producto} = "Cerveza") y {estado} = "pagado" y {almacen} = {actual:almacen})', amb)),
    ).toBe(6);
    expect(a_numero(valor('tabla_suma("Ventas", {cantidad}, {estado} = "pagado" y no({categoria} = "Comida" o {almacen} = "Sur"))', amb))).toBe(3);
  });

  test("cuenta, promedio, mínimo, máximo, buscar y unir", () => {
    expect(a_numero(valor('tabla_cuenta("Ventas")', amb))).toBe(4);
    expect(a_numero(valor('tabla_cuenta("Ventas", {categoria} = "Bebida")', amb))).toBe(3);
    expect(a_numero(valor('tabla_promedio("Ventas", {cantidad}, {producto} = "Vino")', amb))).toBe(2.5);
    expect(a_numero(valor('tabla_minimo("Ventas", {cantidad})', amb))).toBe(2);
    expect(a_numero(valor('tabla_maximo("Ventas", {cantidad}, {categoria} = "Bebida")', amb))).toBe(6);
    expect(valor('tabla_buscar("Ventas", {almacen}, {producto} = "Pan")', amb)).toBe("Sur");
    expect(valor('tabla_buscar("Ventas", {almacen}, {producto} = "Nada")', amb)).toBe(null);
    expect(valor('tabla_unir("Ventas", {producto}, {almacen} = "Sur")', amb)).toBe("Pan, Cerveza");
    expect(valor('tabla_unir("Ventas", {producto}, {almacen} = "Sur", " / ")', amb)).toBe("Pan / Cerveza");
  });

  test("encadenan con aritmética y si() anidados; si() solo evalúa la rama elegida", () => {
    expect(a_texto(valor('si(tabla_suma("Ventas", {cantidad}, {producto} = {actual:nombre}) > 4, "Mucho " + {actual:nombre}, "Poco")', amb))).toBe("Mucho Vino");
    expect(valor('si(1, "ok", tabla_suma("NoExiste", {x}))', amb)).toBe("ok");
    expect(valor('si(0, 1, si(1, si(0, 2, 3), 4))', amb)).toBe(3);
  });

  test("una tabla que no existe es un error visible, no un cero", () => {
    const r = evaluar('tabla_suma("Nada", {x})', amb);
    expect(r).toEqual({ ok: false, error: "No existe la tabla «Nada»" });
  });

  test("el nombre de la tabla va entre comillas y los argumentos se revisan", () => {
    for (const f of ["tabla_suma({x}, {y})", "tabla_suma()", 'tabla_suma("T")', 'tabla_cuenta("T", 1, 2)', 'tabla_unir("T", {a}, 1, ",", 5)']) {
      expect(evaluar(f, amb).ok).toBe(false);
    }
  });

  test("sin eval: el texto de la fórmula nunca se ejecuta como código", () => {
    for (const f of ['constructor("return 1")()', "process.exit(1)", "{x}.constructor", "__proto__(1)"]) {
      expect(evaluar(f, amb).ok).toBe(false);
    }
    for (const f of ["{constructor}", "{__proto__}", "sumasi({toString}, 1)"]) {
      expect(evaluar(f, mundo({}, [{}])).ok).toBe(true);
      expect(a_numero(valor(f, mundo({}, [{}])))).toBe(0);
    }
  });
});

describe("filas de la misma tabla", () => {
  const abonos = [
    { monto: 100, estado: "pagado", moto: "Italika", nota: "a" },
    { monto: 50, estado: "pagado", moto: "Vento", nota: "b" },
    { monto: 70, estado: "pendiente", moto: "Italika", nota: "c" },
  ];

  test("{actual:x} compara cada fila con el registro que se calcula", () => {
    const amb = mundo({ moto: "Italika" }, abonos);
    expect(a_numero(valor("sumasi({monto}, {moto} = {actual:moto})", amb))).toBe(170);
    expect(a_numero(valor('sumasi({monto}, {moto} = {actual:moto} y {estado} = "pagado")', amb))).toBe(100);
  });

  test("buscarsi y unirsi; concatenar si se cumple", () => {
    const amb = mundo({ moto: "Italika" }, abonos);
    expect(valor('buscarsi({nota}, {estado} = "pendiente")', amb)).toBe("c");
    expect(valor("unirsi({nota}, {moto} = {actual:moto})", amb)).toBe("a, c");
    expect(valor('unirsi({nota}, 1, "")', amb)).toBe("abc");
    expect(valor('si({moto} = "Italika", "Moto: " + {moto}, "")', amb)).toBe("Moto: Italika");
  });
});

describe("referencias por tabla", () => {
  test("separa lo propio de lo de otras tablas y de los enlaces", () => {
    const r = referencias('{total} + tabla_suma("Ventas", {cantidad}, {producto} = {actual:nombre} y {cliente.zona} = "N") + {cliente.saldo} + sumasi({monto}, 1)');
    expect(r.propias).toEqual(new Set(["total", "nombre", "cliente", "monto"]));
    expect(r.directas).toEqual(new Set(["total", "nombre", "cliente"]));
    expect(r.tablas.get("Ventas")).toEqual(new Set(["cantidad", "producto", "cliente"]));
    expect(r.enlaces).toEqual([{ campo: "cliente", columna: "saldo" }]);
    expect(r.enlaces_tablas.get("Ventas")).toEqual([{ campo: "cliente", columna: "zona" }]);
  });
});

// #region Con esquemas

function tabla(id: string, name: string, campos: Array<Partial<TablaSpec["campos"][number]> & { clave: string; tipo: string }>, resumenes: TablaSpec["resumenes"] = []): TablaSpec {
  return spec_de_fila({ id, name, campos: campos.map((c) => ({ etiqueta: c.clave[0]!.toUpperCase() + c.clave.slice(1), ...c })), constantes: [], resumenes });
}

const PRODUCTOS = tabla("t_prod", "Productos", [
  { clave: "nombre", tipo: "texto" },
  { clave: "precio", tipo: "dinero" },
  { clave: "vendido", tipo: "calculado", formula: 'tabla_suma("t_vent", {cantidad}, {producto} = {actual:_id})' },
]);
const VENTAS_SPEC = tabla("t_vent", "Ventas", [
  { clave: "producto", tipo: "referencia", tabla_ref_id: "t_prod" },
  { clave: "cantidad", tipo: "entero" },
  { clave: "importe", tipo: "calculado", formula: "{cantidad} * {producto.precio}" },
]);

function cargada(spec: TablaSpec, filas: Array<[string, Record<string, string>]>): TablaCargada {
  return { spec, filas: filas.map(([id, valores]): Registro => ({ id, valores })) };
}

describe("calculadora con otras tablas", () => {
  const productos = cargada(PRODUCTOS, [["p1", { nombre: "Vino", precio: "120" }], ["p2", { nombre: "Pan", precio: "15" }]]);
  const ventas = cargada(VENTAS_SPEC, [["v1", { producto: "p1", cantidad: "2" }], ["v2", { producto: "p1", cantidad: "1" }], ["v3", { producto: "p2", cantidad: "4" }]]);
  const contexto = (): ContextoCalculo => ({
    externas: {
      por_nombre: (n) => ([productos, ventas].find((t) => t.spec.id === n || t.spec.name === n) ?? { error: `No existe la tabla «${n}»` }),
      por_id: (id) => [productos, ventas].find((t) => t.spec.id === id) ?? null,
    },
    compartido: new Map(),
  });

  test("{enlace.columna} lee el registro enlazado", () => {
    expect(calcular_valores(VENTAS_SPEC, { producto: "p1", cantidad: "2" }, ventas.filas, contexto()).importe).toBe("240.00");
    expect(calcular_valores(VENTAS_SPEC, { producto: "", cantidad: "2" }, ventas.filas, contexto()).importe).toBe("0.00");
  });

  test("varios enlazados: los números se suman", () => {
    const multi = tabla("t_ped", "Pedidos", [
      { clave: "productos", tipo: "referencia", tabla_ref_id: "t_prod", multiple: true },
      { clave: "total", tipo: "calculado", formula: "{productos.precio}" },
      { clave: "nombres", tipo: "calculado", formula: "{productos.nombre}" },
    ]);
    const out = calcular_valores(multi, { productos: "p1|p2" }, [], contexto());
    expect(out.total).toBe("135.00");
    expect(out.nombres).toBe("Vino, Pan");
  });

  test("agregado filtrado de otra tabla por cada registro", () => {
    const ctx = contexto();
    expect(calcular_valores(PRODUCTOS, { nombre: "Vino" }, productos.filas, ctx, "p1").vendido).toBe("3.00");
    expect(calcular_valores(PRODUCTOS, { nombre: "Pan" }, productos.filas, ctx, "p2").vendido).toBe("4.00");
    expect(calcular_valores(PRODUCTOS, { nombre: "Nuevo" }, productos.filas, ctx).vendido).toBe("0.00");
  });

  test("sin otras tablas cargadas el error se ve en la celda", () => {
    expect(calcular_valores(PRODUCTOS, {}, [], {}).vendido).toMatch(/^⚠ No se pudo leer la tabla/);
  });

  test("un resumen sobre otra tabla", () => {
    const con_total = { ...PRODUCTOS, resumenes: [{ clave: "piezas", etiqueta: "Piezas vendidas", formula: 'tabla_suma("Ventas", {cantidad})', decimales: 0 }] };
    expect(valores_resumen(con_total, productos.filas, contexto())[0]!.texto).toBe("7");
  });

  test("lo que no depende del registro se calcula una vez por vista", () => {
    let lecturas = 0;
    const ctx = contexto();
    const por_nombre = ctx.externas!.por_nombre;
    ctx.externas!.por_nombre = (n) => {
      lecturas++;
      return por_nombre(n);
    };
    const spec = tabla("t_x", "X", [{ clave: "total", tipo: "calculado", formula: 'tabla_suma("Ventas", {cantidad}) + 0' }]);
    for (let i = 0; i < 50; i++) expect(calcular_valores(spec, {}, [], ctx).total).toBe("7.00");
    expect(lecturas).toBe(1);
  });
});

describe("validación entre tablas", () => {
  test("tabla, columna o enlace inexistentes se reportan", () => {
    const mala = tabla("t_m", "Mala", [
      { clave: "a", tipo: "calculado", formula: 'tabla_suma("Ventas", {no_hay})' },
      { clave: "b", tipo: "calculado", formula: 'tabla_suma("Nadie", {x})' },
      { clave: "c", tipo: "calculado", formula: "{a.precio}" },
    ]);
    const errores = validar_esquema(mala, [PRODUCTOS, VENTAS_SPEC]);
    expect(errores).toContain("«a»: «no_hay» no existe en «Ventas»");
    expect(errores).toContain("«b»: No existe la tabla «Nadie»");
    expect(errores.some((e) => e.includes("«a» no es un enlace"))).toBe(true);
    expect(validar_esquema(PRODUCTOS, [VENTAS_SPEC])).toEqual([]);
    expect(validar_esquema(VENTAS_SPEC, [PRODUCTOS])).toEqual([]);
  });

  test("un ciclo entre tablas se rechaza", () => {
    const a = tabla("t_a", "A", [
      { clave: "x", tipo: "calculado", formula: 'tabla_suma("B", {y})' },
    ]);
    const b = tabla("t_b", "B", [
      { clave: "y", tipo: "calculado", formula: 'tabla_maximo("A", {x}) + 1' },
    ]);
    expect(validar_esquema(a, [b])).toEqual(["Ciclo de cálculo: A.X → B.Y → A.X. Quita una de esas referencias."]);
  });

  test("un ciclo dentro de la tabla también; sumasi sobre la misma columna no", () => {
    const t = tabla("t_c", "C", [
      { clave: "x", tipo: "calculado", formula: "{y} + 1" },
      { clave: "y", tipo: "calculado", formula: "{x} * 2" },
    ]);
    expect(validar_esquema(t)[0]).toMatch(/^Ciclo de cálculo: C\.(X|Y) → /);
    const acumulado = tabla("t_d", "D", [
      { clave: "monto", tipo: "dinero" },
      { clave: "x", tipo: "calculado", formula: "sumasi({x}, {monto} > 0)" },
    ]);
    expect(validar_esquema(acumulado)).toEqual([]);
  });
});

describe("nombres visibles entre tablas", () => {
  test("se guarda el id de la tabla y las claves de SU tabla; se enseña con nombres", () => {
    const visible = 'tabla_suma("ventas", {Cantidad}, {Producto} = {actual:_id}) + {Precio}';
    const guardada = formula_con_claves(PRODUCTOS, visible, [VENTAS_SPEC]);
    expect(guardada).toBe('tabla_suma("t_vent", {cantidad}, {producto} = {actual:_id}) + {precio}');
    expect(formula_con_etiquetas(PRODUCTOS, guardada, [VENTAS_SPEC])).toBe('tabla_suma("Ventas", {Cantidad}, {Producto} = {actual:_id}) + {Precio}');
  });

  test("los enlaces se traducen por partes", () => {
    expect(formula_con_claves(VENTAS_SPEC, "{Cantidad} × {Producto.Precio}", [PRODUCTOS])).toBe("{cantidad} * {producto.precio}");
    expect(formula_con_etiquetas(VENTAS_SPEC, "{cantidad} * {producto.precio}", [PRODUCTOS])).toBe("{Cantidad} * {Producto.Precio}");
  });
});

describe("constructor de fórmulas", () => {
  test("otra tabla con condiciones y una columna del registro", () => {
    const pedido = pedido_desde_formulario({
      ext_que: "suma",
      ext_tabla: "t_vent",
      ext_columna: "t_vent|cantidad",
      ext_union: "y",
      ext_c1_columna: "t_vent|producto",
      ext_c1_op: "=",
      ext_c1_actual: "nombre",
      ext_c2_columna: "t_vent|cantidad",
      ext_c2_op: ">=",
      ext_c2_valor: "2",
      ext_c3_columna: "t_vent|producto",
      ext_c3_op: "lleno",
    })!;
    expect(armar_formula(PRODUCTOS, [VENTAS_SPEC], pedido)).toEqual({
      formula: 'tabla_suma("t_vent", {cantidad}, ({producto} == {actual:nombre}) y ({cantidad} >= 2) y (no(vacio({producto}))))',
    });
  });

  test("la misma tabla usa sumasi/cuentasi; contar sin condiciones cuenta todo", () => {
    const base = { ext_tabla: "t_prod", ext_columna: "t_prod|nombre", ext_c1_columna: "t_prod|nombre", ext_c1_op: "contiene", ext_c1_valor: "vi" };
    expect(armar_formula(PRODUCTOS, [], pedido_desde_formulario({ ...base, ext_que: "unir" })!)).toEqual({ formula: 'unirsi({nombre}, contiene({nombre}, "vi"))' });
    expect(armar_formula(PRODUCTOS, [], pedido_desde_formulario({ ext_que: "cuenta", ext_tabla: "t_prod" })!)).toEqual({ formula: "cuentasi(1)" });
  });

  test("columnas de otra tabla que la elegida se rechazan", () => {
    const r = armar_formula(PRODUCTOS, [VENTAS_SPEC], pedido_desde_formulario({ ext_que: "suma", ext_tabla: "t_vent", ext_columna: "t_prod|precio" })!);
    expect("error" in r && r.error).toContain("«Ventas»");
    expect(pedido_desde_formulario({ ext_que: "" })).toBeNull();
  });
});

// #endregion
