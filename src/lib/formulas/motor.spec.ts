import { describe, expect, test } from "bun:test";
import {
  a_numero,
  a_texto,
  ambito_de,
  calcular_agregado,
  claves_referenciadas,
  evaluar,
  parsear_agregado,
  parsear_nivel,
  type Ambito,
  type Valor,
} from "./motor.ts";

function ambito(valores: Record<string, Valor>, filas: Record<string, Valor>[] = []): Ambito {
  return ambito_de(valores, filas.map((f) => ambito_de(f)));
}

function valor(formula: string, valores: Record<string, Valor> = {}, filas: Record<string, Valor>[] = []): Valor {
  const r = evaluar(formula, ambito(valores, filas));
  if (!r.ok) throw new Error(`Se esperaba un valor pero hubo error: ${r.error}`);
  return r.valor;
}

const num = (formula: string, valores: Record<string, Valor> = {}, filas: Record<string, Valor>[] = []) =>
  a_numero(valor(formula, valores, filas));
const txt = (formula: string, valores: Record<string, Valor> = {}) => a_texto(valor(formula, valores));

function error_de(formula: string): string {
  const r = evaluar(formula, ambito({}));
  if (r.ok) throw new Error(`Se esperaba error, se obtuvo ${JSON.stringify(r.valor)}`);
  return r.error;
}

describe("aritmética", () => {
  test("respeta la precedencia", () => {
    expect(num("2 + 3 * 4")).toBe(14);
    expect(num("(2 + 3) * 4")).toBe(20);
    expect(num("-2 - 3")).toBe(-5);
  });

  test("las referencias entre llaves se resuelven", () => {
    expect(num("{km_final} - {km_inicial}", { km_final: 1250, km_inicial: 1180 })).toBe(70);
  });

  test("un campo vacío vale cero y no es error", () => {
    expect(num("{no_capturado}")).toBe(0);
    expect(num("{no_capturado} + 10")).toBe(10);
  });

  test("dividir entre cero da cero", () => {
    expect(num("100 / 0")).toBe(0);
    expect(num("100 / {vacio}")).toBe(0);
    expect(num("7 % 0")).toBe(0);
    expect(num("2 ^ 3")).toBe(8);
  });

  test("las comparaciones producen uno o cero y encadenan", () => {
    expect(num("5 > 3")).toBe(1);
    expect(num("5 < 3")).toBe(0);
    expect(num("(5 > 3) * 2")).toBe(2);
  });

  test("if elige la rama", () => {
    expect(num("if(1 > 0, 10, 20)")).toBe(10);
    expect(num("if(1 < 0, 10, 20)")).toBe(20);
  });

  test("round respeta los decimales pedidos", () => {
    expect(num("round(3.14159, 2)")).toBeCloseTo(3.14, 6);
    expect(num("round(3.14159, 0)")).toBe(3);
  });

  test("la fórmula de rendimiento de la plantilla", () => {
    const f = "if({gasolina_usada} > 0, round({km_recorridos} / {gasolina_usada}, 1), 0)";
    expect(num(f, { gasolina_usada: 4, km_recorridos: 130 })).toBe(32.5);
    expect(num(f, { km_recorridos: 130 })).toBe(0);
  });

  test("la igualdad numérica tolera el residuo de coma flotante", () => {
    expect(num("0.1 + 0.2 == 0.3")).toBe(1);
  });
});

describe("errores", () => {
  test("función desconocida, paréntesis, sobrante, comilla", () => {
    expect(error_de("frobnicate(1)")).toContain("frobnicate");
    expect(error_de("(1 + 2")).not.toBe("");
    expect(error_de("1 + 2 basura")).not.toBe("");
    expect(error_de('"sin cierre')).not.toBe("");
    expect(error_de("")).toBe("Fórmula incompleta");
  });

  test("el operador o no se come el nombre de una función", () => {
    expect(error_de("1 objetivo(2)")).not.toBe("");
  });

  test("una palabra sin paréntesis pide comillas", () => {
    expect(error_de("pagado")).toContain("comillas");
  });

  test("un resultado infinito no es representable", () => {
    expect(error_de("10 ^ 400")).toBe("Resultado no representable");
  });
});

describe("texto", () => {
  test("una cadena literal es un valor", () => {
    expect(txt('"hola"')).toBe("hola");
    expect(txt("'hola'")).toBe("hola");
    expect(txt('"a\\nb"')).toBe("a\nb");
  });

  test("más concatena cuando un lado es texto y suma cuando ambos son números", () => {
    expect(txt('"Moto: " + {moto}', { moto: "Italika" })).toBe("Moto: Italika");
    expect(txt('"Entregas: " + {n}', { n: 12 })).toBe("Entregas: 12");
    expect(num("2 + 3")).toBe(5);
    expect(num("{a} + 3", { a: "2" })).toBe(5);
  });

  test("las igualdades comparan texto sin mayúsculas ni espacios de sobra", () => {
    expect(num('{estado} == "pagado"', { estado: "Pagado" })).toBe(1);
    expect(num('{estado} == " pagado "', { estado: "Pagado" })).toBe(1);
    expect(num('{estado} != "pagado"', { estado: "pendiente" })).toBe(1);
    expect(num('{estado} <> "pagado"', { estado: "pendiente" })).toBe(1);
    expect(num("3 = 3")).toBe(1);
    expect(num('{estado} = "pagado"', { estado: "pagado" })).toBe(1);
  });

  test("las fechas ISO se comparan como texto y ordenan bien", () => {
    expect(num('{fecha} >= "2026-08-01"', { fecha: "2026-08-03" })).toBe(1);
    expect(num('{fecha} > "2026-12-31"', { fecha: "2026-08-03" })).toBe(0);
  });

  test("si funciona con condición de texto y puede devolver texto", () => {
    expect(num('si({estado} == "pagado", 1, 0)', { estado: "pagado" })).toBe(1);
    expect(txt('si(1 > 0, "Sí", "No")')).toBe("Sí");
  });

  test("operadores lógicos", () => {
    expect(num("1 > 0 y 2 > 1")).toBe(1);
    expect(num("1 > 0 y 2 < 1")).toBe(0);
    expect(num("1 < 0 o 2 > 1")).toBe(1);
    expect(num("1 > 0 && 2 > 1")).toBe(1);
    expect(num("1 < 0 || 2 > 1")).toBe(1);
    expect(num("no(1 > 0)")).toBe(0);
  });

  test("funciones de texto básicas", () => {
    const v = { nota: "Cliente Moroso" };
    expect(num('contiene({nota}, "moroso")', v)).toBe(1);
    expect(num('empieza({nota}, "cliente")', v)).toBe(1);
    expect(num('termina({nota}, "OSO")', v)).toBe(1);
    expect(num("largo({nota})", v)).toBe(14);
    expect(txt("mayus({nota})", v)).toBe("CLIENTE MOROSO");
    expect(txt("minus({nota})", v)).toBe("cliente moroso");
    expect(num("vacio({no_existe})", v)).toBe(1);
    expect(num("vacio({nota})", v)).toBe(0);
    expect(num("vacio({blanco})", { blanco: "   " })).toBe(1);
    expect(txt('concat("a", "-", "b")')).toBe("a-b");
  });

  test("texto y número convierten explícitamente", () => {
    expect(txt("texto(3)")).toBe("3");
    expect(num('numero("3")')).toBe(3);
    expect(num('numero("no soy numero")')).toBe(0);
    expect(num('numero("")')).toBe(0);
  });

  test("un texto que no es número no es verdadero por accidente", () => {
    expect(txt('si({x}, "sí", "no")', { x: "   " })).toBe("no");
    expect(txt('si({x}, "sí", "no")', { x: "0x10" })).toBe("sí");
    expect(txt('si({x}, "sí", "no")', { x: "0" })).toBe("no");
  });
});

describe("dependencias", () => {
  test("referencedKeys extrae las claves, también las agregadas", () => {
    expect(claves_referenciadas("{a} + {b} * round({c}, 2)")).toEqual(new Set(["a", "b", "c"]));
    expect(claves_referenciadas("{meta} - {suma:pagado}")).toEqual(new Set(["meta", "suma:pagado"]));
  });

  test("ignora lo que hay dentro de cadenas", () => {
    expect(claves_referenciadas('contiene({nota}, "{km}") + {a}')).toEqual(new Set(["nota", "a"]));
  });
});

describe("nivel", () => {
  test("3 de 6 con capacidad, número pelón y fracción", () => {
    expect(parsear_nivel("3/6", 12)).toBe(6);
    expect(parsear_nivel("6.5")).toBe(6.5);
    expect(parsear_nivel("6,5")).toBe(6.5);
    expect(parsear_nivel("3/6")).toBe(0.5);
    expect(parsear_nivel("")).toBeNull();
    expect(parsear_nivel("3/0")).toBeNull();
  });
});

describe("agregados", () => {
  test("solo los prefijos conocidos", () => {
    expect(parsear_agregado("suma:pagado")).toEqual({ tipo: "suma", campo: "pagado" });
    expect(parsear_agregado("maximo:pagado")).toEqual({ tipo: "maximo", campo: "pagado" });
    expect(parsear_agregado("pagado")).toBeNull();
    expect(parsear_agregado("total:pagado")).toBeNull();
    expect(parsear_agregado("suma:")).toBeNull();
  });

  test("una columna vacía da cero", () => {
    expect(calcular_agregado("promedio", [])).toBe(0);
    expect(calcular_agregado("minimo", [])).toBe(0);
    expect(calcular_agregado("cuenta", [1, 2])).toBe(2);
  });
});

describe("funciones por fila", () => {
  const abonos = [
    { monto: 100, estado: "pagado", moto: "Italika" },
    { monto: 200, estado: "pendiente", moto: "Italika" },
    { monto: 50, estado: "pagado", moto: "Vento" },
  ];

  test("sumasi suma solo las filas que cumplen, con condiciones compuestas", () => {
    expect(num('sumasi({monto}, {estado} == "pagado")', {}, abonos)).toBe(150);
    expect(num('sumasi({monto}, {estado} == "pagado" y {moto} == "Italika")', {}, abonos)).toBe(100);
  });

  test("cuentasi, promediosi, minimosi y maximosi", () => {
    expect(num('cuentasi({estado} == "pagado")', {}, abonos)).toBe(2);
    expect(num("cuentasi(1)", {}, abonos)).toBe(3);
    expect(num('promediosi({monto}, {estado} == "pagado")', {}, abonos)).toBe(75);
    expect(num('minimosi({monto}, {estado} == "pagado")', {}, abonos)).toBe(50);
    expect(num('maximosi({monto}, {estado} == "pagado")', {}, abonos)).toBe(100);
  });

  test("valen cero sin registros y encadenan en aritmética", () => {
    expect(num('sumasi({monto}, {estado} == "pagado")')).toBe(0);
    expect(num("promediosi({monto}, 1)")).toBe(0);
    expect(num('sumasi({monto}, {estado} == "pagado") / cuentasi({estado} == "pagado")', {}, abonos)).toBe(75);
  });

  test("argumentos de menos y errores de sintaxis se reportan", () => {
    expect(error_de("sumasi({monto})")).not.toBe("");
    expect(error_de("cuentasi()")).not.toBe("");
    expect(error_de("sumasi({monto}, {estado} == )")).not.toBe("");
  });

  test("el anidamiento se corta en la profundidad máxima", () => {
    const filas_con_filas: Ambito[] = abonos.map((f) => ({
      valor: (clave: string) => f[clave as keyof typeof f],
      filas: () => abonos.map((g) => ({ valor: (c: string) => g[c as keyof typeof g], filas: () => [] })),
    }));
    const raiz: Ambito = { valor: () => undefined, filas: () => filas_con_filas };
    const r = evaluar("cuentasi(cuentasi(cuentasi(1) > 0) > 0)", raiz);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("anidadas");
  });
});
