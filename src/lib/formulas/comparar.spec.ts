import { describe, expect, test } from "bun:test";
import { agrupacion_por_defecto, comparar_grupos, comparar_totales, type Periodo } from "./comparar.ts";
import type { Registro, TablaSpec } from "./esquema.ts";

const SPEC: TablaSpec = {
  id: "t",
  name: "Bitácora",
  campos: [
    { clave: "nota", etiqueta: "Nota", tipo: "texto" },
    { clave: "producto", etiqueta: "Producto", tipo: "referencia", tabla_ref_id: "p" },
    { clave: "cantidad", etiqueta: "Cantidad", tipo: "entero" },
    { clave: "monto", etiqueta: "Monto", tipo: "dinero", decimales: 2 },
  ],
  constantes: [],
  resumenes: [{ clave: "vendido", etiqueta: "Vendido", formula: "{suma:monto}", decimales: 2 }],
  campos_cierre: [
    { clave: "efectivo", etiqueta: "Efectivo", tipo: "dinero", decimales: 2 },
    { clave: "responsable", etiqueta: "Responsable", tipo: "texto" },
    { clave: "cuadro", etiqueta: "¿Cuadró?", tipo: "booleano" },
  ],
};

const NOMBRES: Record<string, string> = { m: "Mezcal", t: "Tequila", v: "Vino" };
let n = 0;
const fila = (producto: string, cantidad: string, monto: string): Registro => ({
  id: `r${n++}`,
  valores: { producto, cantidad, monto },
});

function periodo(titulo: string, filas: Registro[], resumenes: Record<string, string> = {}, datos: Record<string, string> = {}): Periodo {
  return { titulo, filas, resumenes, datos, grupo_de: (f) => NOMBRES[f.valores.producto ?? ""] ?? "" };
}

const lunes = periodo("Lunes", [fila("m", "2", "300"), fila("t", "1", "150")], { vendido: "450.00" }, {
  efectivo: "450",
  responsable: "Ana",
  cuadro: "true",
});
const martes = periodo("Martes", [fila("m", "5", "750"), fila("m", "1", "150"), fila("v", "3", "600")], { vendido: "1500.00" }, {
  efectivo: "1400",
  responsable: "Luis",
  cuadro: "false",
});

describe("totales comparados", () => {
  test("registros, totales de la tabla, sumas y datos del cierre; la diferencia es el último menos el primero", () => {
    expect(comparar_totales(SPEC, [lunes, martes])).toEqual([
      { dato: "Registros", valores: ["2", "3"], diferencia: "+1" },
      { dato: "Vendido", valores: ["450.00", "1500.00"], diferencia: "+1050.00" },
      { dato: "Suma de Cantidad", valores: ["3", "9"], diferencia: "+6" },
      { dato: "Suma de Monto", valores: ["450.00", "1500.00"], diferencia: "+1050.00" },
      { dato: "Efectivo", valores: ["450.00", "1400.00"], diferencia: "+950.00" },
      { dato: "Responsable", valores: ["Ana", "Luis"], diferencia: "" },
      { dato: "¿Cuadró?", valores: ["Sí", "No"], diferencia: "" },
    ]);
  });

  test("lo actual no tiene datos de cierre: se ve una raya y no hay diferencia de ese dato", () => {
    const actual = periodo("Lo actual", [fila("t", "4", "600")], { vendido: "600.00" });
    const filas = comparar_totales(SPEC, [martes, actual]);
    expect(filas.find((f) => f.dato === "Efectivo")).toEqual({ dato: "Efectivo", valores: ["1400.00", "—"], diferencia: "" });
    expect(filas.find((f) => f.dato === "Registros")).toEqual({ dato: "Registros", valores: ["3", "1"], diferencia: "-2" });
  });

  test("tres o más periodos: una columna por periodo", () => {
    const miercoles = periodo("Miércoles", [fila("v", "1", "200")], { vendido: "200.00" });
    const [registros] = comparar_totales(SPEC, [lunes, martes, miercoles]);
    expect(registros).toEqual({ dato: "Registros", valores: ["2", "3", "1"], diferencia: "-1" });
  });
});

describe("desglose por grupo", () => {
  const cantidad = SPEC.campos.find((c) => c.clave === "cantidad")!;

  test("suma una columna por grupo; lo que no hubo en un periodo vale 0", () => {
    expect(comparar_grupos(SPEC, [lunes, martes], cantidad)).toEqual([
      { dato: "Mezcal", valores: ["2", "6"], diferencia: "+4" },
      { dato: "Tequila", valores: ["1", "0"], diferencia: "-1" },
      { dato: "Vino", valores: ["0", "3"], diferencia: "+3" },
    ]);
  });

  test("sin columna que sumar cuenta registros", () => {
    expect(comparar_grupos(SPEC, [lunes, martes], null)).toEqual([
      { dato: "Mezcal", valores: ["1", "2"], diferencia: "+1" },
      { dato: "Tequila", valores: ["1", "0"], diferencia: "-1" },
      { dato: "Vino", valores: ["0", "1"], diferencia: "+1" },
    ]);
  });

  test("una fila sin dato en la columna de grupo se junta aparte", () => {
    const raro = periodo("X", [{ id: "x", valores: { cantidad: "2" } }]);
    expect(comparar_grupos(SPEC, [raro, raro], cantidad)).toEqual([{ dato: "(sin dato)", valores: ["2", "2"], diferencia: "0" }]);
  });

  test("por defecto se agrupa por el primer enlace", () => {
    expect(agrupacion_por_defecto(SPEC)?.clave).toBe("producto");
    expect(agrupacion_por_defecto({ ...SPEC, campos: SPEC.campos.filter((c) => c.tipo !== "referencia") })?.clave).toBe("nota");
    expect(agrupacion_por_defecto({ ...SPEC, campos: [] })).toBeNull();
  });
});
