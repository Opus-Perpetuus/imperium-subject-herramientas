import { describe, expect, test } from "bun:test";
import {
  campos_desde_propuestas,
  clave_libre,
  columnas_desde_texto,
  formula_con_claves,
  formula_con_etiquetas,
  inferir_tipo,
  mensajes_legibles,
  necesita_ajustes,
  campo_nuevo,
  totales_por_defecto,
} from "./disenio.ts";
import { spec_de_fila, validar_esquema, type TablaSpec } from "./esquema.ts";

const vacia: TablaSpec = { id: "t", name: "T", campos: [], constantes: [], resumenes: [] };

const abonos: TablaSpec = {
  ...vacia,
  constantes: [{ clave: "deuda", etiqueta: "Deuda a saldar", valor: "5000" }],
  campos: [
    { clave: "pagado", etiqueta: "Abono", tipo: "dinero" },
    { clave: "km_inicial", etiqueta: "Kilometraje inicial", tipo: "numero" },
  ],
};

describe("tipo adivinado por el nombre", () => {
  test.each([
    ["Fecha", "fecha"],
    ["Fecha de pago", "fecha"],
    ["Método de pago", "opcion"],
    ["Categoría", "opcion"],
    ["Precio", "dinero"],
    ["Monto total", "dinero"],
    ["Cantidad", "entero"],
    ["Kilómetros", "numero"],
    ["Foto del ticket", "foto"],
    ["Observaciones", "nota"],
    ["¿Pagado?", "booleano"],
    ["Entregado", "booleano"],
    ["Hora de llegada", "hora"],
    ["Horas trabajadas", "numero"],
    ["Cliente", "texto"],
    ["Teléfono", "texto"],
  ])("«%s» → %s", (etiqueta, tipo) => {
    expect(inferir_tipo(etiqueta).tipo).toBe(tipo as never);
  });

  test("la unidad entre paréntesis sale del nombre y decide número o dinero", () => {
    expect(inferir_tipo("Distancia (km)")).toEqual({ etiqueta: "Distancia", tipo: "numero", unidad: "km" });
    expect(inferir_tipo("Cobro (MXN)")).toEqual({ etiqueta: "Cobro", tipo: "dinero", unidad: "MXN" });
    expect(inferir_tipo("Presión (psi)").tipo).toBe("numero");
    expect(inferir_tipo("Precio").unidad).toBe("$");
  });
});

describe("columnas desde texto libre", () => {
  test("una por renglón, con viñetas, opciones tras los dos puntos y sin repetidas", () => {
    const cols = columnas_desde_texto("- Fecha\n2. Cliente\nCategoría: Comida, Transporte / Otro\n\nMonto ($)\nfecha");
    expect(cols.map((c) => [c.etiqueta, c.tipo])).toEqual([
      ["Fecha", "fecha"],
      ["Cliente", "texto"],
      ["Categoría", "opcion"],
      ["Monto", "dinero"],
    ]);
    expect(cols[2]!.opciones).toEqual(["Comida", "Transporte", "Otro"]);
  });

  test("un solo renglón con comas son varias columnas", () => {
    expect(columnas_desde_texto("Nombre, Teléfono, Cumpleaños").map((c) => c.tipo)).toEqual([
      "texto",
      "texto",
      "fecha",
    ]);
  });

  test("las columnas creadas pasan la validación del esquema", () => {
    const campos = campos_desde_propuestas(vacia, columnas_desde_texto("Nombre\nNombre!\n1er pago\nFoto\nNotas\n¿Listo?\nTotal"));
    const spec = spec_de_fila({ id: "t", name: "T", campos });
    expect(validar_esquema(spec)).toEqual([]);
    expect(campos.map((c) => c.clave)).toEqual(["nombre", "nombre_2", "c_1er_pago", "foto", "notas", "listo", "total"]);
    expect(campos.filter((c) => c.en_resumen).map((c) => c.clave)).toEqual(["nombre", "nombre_2", "c_1er_pago", "listo", "total"]);
  });

  test("el total automático es de montos, no de precios por unidad", () => {
    const campos = campos_desde_propuestas(vacia, columnas_desde_texto("Precio\nCosto unitario\nImporte\nPropina"));
    expect(totales_por_defecto(campos).map((r) => [r.etiqueta, r.formula])).toEqual([
      ["Total de Importe", "{suma:importe}"],
      ["Total de Propina", "{suma:propina}"],
    ]);
  });
});

describe("claves", () => {
  test("nunca chocan y siempre empiezan con letra", () => {
    expect(clave_libre("Precio", new Set(["precio", "precio_2"]))).toBe("precio_3");
    expect(clave_libre("¿?", new Set())).toBe("columna");
    expect(clave_libre("2do turno", new Set())).toBe("c_2do_turno");
  });

  test("un cálculo o una lista recién agregados piden el segundo paso", () => {
    expect(necesita_ajustes(campo_nuevo(vacia, { etiqueta: "Ganancia", tipo: "calculado" }))).toBe(true);
    expect(necesita_ajustes(campo_nuevo(vacia, { etiqueta: "Estado", tipo: "opcion" }))).toBe(true);
    expect(necesita_ajustes(campo_nuevo(vacia, { etiqueta: "Estado", tipo: "opcion", opciones: ["A"] }))).toBe(false);
    expect(necesita_ajustes(campo_nuevo(vacia, { etiqueta: "Cliente", tipo: "texto" }))).toBe(false);
  });
});

describe("fórmulas con nombres visibles", () => {
  test("se escriben con los nombres y se guardan con las claves", () => {
    expect(formula_con_claves(abonos, "{Deuda a saldar} - {suma:abono}")).toBe("{deuda} - {suma:pagado}");
    expect(formula_con_claves(abonos, "{kilometraje INICIAL} × 2 ÷ {km_inicial}")).toBe("{km_inicial} * 2 / {km_inicial}");
    expect(formula_con_claves(abonos, 'si({Abono} > 0, "{Abono}", "×")')).toBe('si({pagado} > 0, "{Abono}", "×")');
    expect(formula_con_claves(abonos, "{Nada} + 1")).toBe("{Nada} + 1");
  });

  test("y se enseñan con los nombres", () => {
    expect(formula_con_etiquetas(abonos, "{deuda} - {suma:pagado}")).toBe("{Deuda a saldar} - {suma:Abono}");
  });

  test("los errores hablan con los nombres de la tabla", () => {
    const rota: TablaSpec = {
      ...abonos,
      campos: [...abonos.campos, { clave: "falta", etiqueta: "Lo que falta", tipo: "calculado", formula: "{nada} + 1" }],
    };
    expect(mensajes_legibles(rota, validar_esquema(rota))).toBe("«Lo que falta»: «nada» no existe");
  });
});
