import { describe, expect, test } from "bun:test";
import { calcular_valores, formatear, valores_resumen } from "./calculadora.ts";
import type { Registro, TablaSpec } from "./esquema.ts";
import { deudas, jornada_moto } from "./plantillas.ts";

const fila = (id: string, valores: Record<string, string>): Registro => ({ id, valores });

const resumen = (spec: TablaSpec, filas: Registro[] = []) =>
  Object.fromEntries(valores_resumen(spec, filas).map((r) => [r.resumen.clave, r.texto]));

describe("campos calculados", () => {
  test("una jornada completa calcula toda la cadena", () => {
    const out = calcular_valores(
      jornada_moto(),
      {
        km_inicial: "1180.5",
        km_final: "1310.5",
        gasolina_inicial: "8",
        gasolina_final: "4",
        entregas: "24",
        ingreso: "760",
        gasto_gasolina: "180",
      },
      [],
    );
    expect(out.km_recorridos).toBe("130.0");
    expect(out.gasolina_usada).toBe("4.00");
    expect(out.rendimiento).toBe("32.5");
    expect(out.ganancia_neta).toBe("580.00");
    expect(out.por_entrega).toBe("24.17");
  });

  test("a media jornada los derivados salen en cero y no en error ni negativos", () => {
    const spec = jornada_moto();
    const out = calcular_valores(spec, { km_inicial: "1180.5", gasolina_inicial: "8" }, []);
    expect(out.km_recorridos).toBe("0.0");
    expect(out.gasolina_usada).toBe("0.00");
    expect(out.rendimiento).toBe("0.0");
    for (const campo of spec.campos.filter((c) => c.tipo === "calculado")) {
      expect(out[campo.clave]!.startsWith("⚠")).toBe(false);
      expect(Number(out[campo.clave])).toBeGreaterThanOrEqual(0);
    }
  });

  test("la coma decimal se acepta como separador", () => {
    const out = calcular_valores(jornada_moto(), { km_inicial: "1180,5", km_final: "1310,5" }, []);
    expect(out.km_recorridos).toBe("130.0");
  });

  test("un error de fórmula queda en el valor con ⚠", () => {
    const spec: TablaSpec = {
      id: "t",
      name: "T",
      constantes: [],
      resumenes: [],
      campos: [{ clave: "x", etiqueta: "X", tipo: "calculado", formula: "frobnicate(1)" }],
    };
    expect(calcular_valores(spec, {}, []).x).toMatch(/^⚠ .*frobnicate/);
  });
});

describe("plantilla de deudas", () => {
  const con_deuda = (valor: string) => {
    const base = deudas();
    return { ...base, constantes: base.constantes.map((c) => ({ ...c, valor })) };
  };

  test("resume la deuda fija contra los abonos", () => {
    const r = resumen(con_deuda("12000"), [fila("a1", { pagado: "3000" }), fila("a2", { pagado: "1500" })]);
    expect(r.abonado).toBe("4500.00");
    expect(r.restante).toBe("7500.00");
    expect(r.avance).toBe("37.5");
  });

  test("sin abonos dice la deuda entera y cero por ciento", () => {
    const r = resumen(con_deuda("8000"));
    expect(r.abonado).toBe("0.00");
    expect(r.restante).toBe("8000.00");
    expect(r.avance).toBe("0.0");
  });
});

describe("valores fijos y agregados de columna", () => {
  const spec: TablaSpec = {
    id: "t",
    name: "Abonos",
    constantes: [{ clave: "meta", etiqueta: "Meta", valor: "1000", unidad: "$" }],
    resumenes: [],
    campos: [
      { clave: "pagado", etiqueta: "Abono", tipo: "dinero", unidad: "$" },
      { clave: "nota", etiqueta: "Nota", tipo: "texto" },
      { clave: "falta", etiqueta: "Falta", tipo: "calculado", formula: "{meta} - {suma:pagado}", decimales: 2 },
    ],
  };
  const con_resumen = (formula: string, decimales = 2, extra: Partial<TablaSpec> = {}): TablaSpec => ({
    ...spec,
    ...extra,
    resumenes: [{ clave: "x", etiqueta: "X", formula, decimales }],
  });

  test("un valor fijo se resuelve como un campo más", () => {
    expect(calcular_valores(spec, {}, []).falta).toBe("1000.00");
  });

  test("la suma recorre todos los registros y no solo el actual", () => {
    const filas = [fila("a", { pagado: "300" }), fila("b", { pagado: "250" }), fila("c", { pagado: "50" })];
    expect(calcular_valores(spec, { pagado: "300" }, filas).falta).toBe("400.00");
  });

  test("los registros sin número no cuentan y no rompen la suma", () => {
    const filas = [
      fila("a", { pagado: "300" }),
      fila("b", { pagado: "" }),
      fila("c", { nota: "sin abono" }),
      fila("d", { pagado: "⚠ Fórmula inválida" }),
    ];
    expect(calcular_valores(spec, {}, filas).falta).toBe("700.00");
  });

  test("cada operación de columna hace lo suyo", () => {
    const filas = [fila("a", { pagado: "10" }), fila("b", { pagado: "30" }), fila("c", { pagado: "20" })];
    expect(resumen(con_resumen("{suma:pagado}"), filas).x).toBe("60.00");
    expect(resumen(con_resumen("{promedio:pagado}"), filas).x).toBe("20.00");
    expect(resumen(con_resumen("{cuenta:pagado}"), filas).x).toBe("3.00");
    expect(resumen(con_resumen("{minimo:pagado}"), filas).x).toBe("10.00");
    expect(resumen(con_resumen("{maximo:pagado}"), filas).x).toBe("30.00");
  });

  test("una columna vacía da cero y no error", () => {
    expect(resumen(con_resumen("{promedio:pagado}")).x).toBe("0.00");
  });

  test("un resumen no ve los campos del registro", () => {
    expect(resumen(con_resumen("{pagado}"), [fila("a", { pagado: "500" })]).x).toBe("");
  });

  test("un valor fijo de texto entra a las fórmulas como texto", () => {
    const con_texto = con_resumen('si({moto_principal} == "italika", 1, 0)', 0, {
      constantes: [...spec.constantes, { clave: "moto_principal", etiqueta: "Moto", valor: "Italika" }],
    });
    expect(resumen(con_texto).x).toBe("1");
  });

  test("un resumen puede producir texto y se muestra sin formato numérico", () => {
    const con_texto = con_resumen('si({suma:pagado} >= {meta}, "Saldada", "Faltan " + ({meta} - {suma:pagado}))');
    expect(resumen(con_texto, [fila("a", { pagado: "600" }), fila("b", { pagado: "500" })]).x).toBe("Saldada");
    expect(resumen(con_texto, [fila("a", { pagado: "600" })]).x).toBe("Faltan 400");
  });

  test("una suma condicional funciona en un resumen y en un calculado", () => {
    const estado = { clave: "estado", etiqueta: "Estado", tipo: "opcion" as const, opciones: ["pagado", "pendiente"] };
    const en_resumen = con_resumen('sumasi({pagado}, {estado} == "pagado")', 2, { campos: [...spec.campos, estado] });
    const filas = [
      fila("a", { pagado: "300", estado: "pagado" }),
      fila("b", { pagado: "250", estado: "pendiente" }),
      fila("c", { pagado: "50", estado: "Pagado" }),
    ];
    expect(resumen(en_resumen, filas).x).toBe("350.00");

    const en_calculado: TablaSpec = {
      ...spec,
      campos: [
        ...spec.campos,
        estado,
        { clave: "total_pagado", etiqueta: "Total pagado", tipo: "calculado", formula: 'sumasi({pagado}, {estado} == "pagado")', decimales: 2 },
      ],
    };
    const out = calcular_valores(en_calculado, { pagado: "100" }, [
      fila("a", { pagado: "300", estado: "pagado" }),
      fila("b", { pagado: "200", estado: "pagado" }),
    ]);
    expect(out.total_pagado).toBe("500.00");
  });

  test("un campo de texto con dígitos no entra en los agregados", () => {
    const con_tel = con_resumen("{suma:tel}", 2, {
      campos: [...spec.campos, { clave: "tel", etiqueta: "Teléfono", tipo: "texto" }],
    });
    expect(resumen(con_tel, [fila("a", { tel: "5551234" }), fila("b", { tel: "5555678" })]).x).toBe("0.00");
  });

  test("booleanos y niveles entran como número", () => {
    const con_tipos: TablaSpec = {
      ...spec,
      campos: [
        { clave: "urgente", etiqueta: "Urgente", tipo: "booleano" },
        { clave: "tanque", etiqueta: "Tanque", tipo: "nivel", capacidad: 12 },
        { clave: "x", etiqueta: "X", tipo: "calculado", formula: "{urgente} * 2 + {tanque}", decimales: 1 },
      ],
    };
    expect(calcular_valores(con_tipos, { urgente: "true", tanque: "3/6" }, []).x).toBe("8.0");
    expect(calcular_valores(con_tipos, { urgente: "false", tanque: "" }, []).x).toBe("0.0");
  });
});

describe("formato", () => {
  test("redondeo mitad hacia arriba con punto", () => {
    expect(formatear(24.166, 2)).toBe("24.17");
    expect(formatear(2.5, 0)).toBe("2");
    expect(formatear(-3.456, 2)).toBe("-3.46");
    expect(formatear(0.005, 2)).toBe("0.01");
    expect(formatear(1234, 1)).toBe("1234.0");
  });
});
