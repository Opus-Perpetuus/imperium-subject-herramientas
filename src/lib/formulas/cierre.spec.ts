import { describe, expect, test } from "bun:test";
import { clave_unica, esquema_archivo, planear_cierre } from "./cierre.ts";
import { campo_de, type Registro, type TablaSpec } from "./esquema.ts";

const origen: TablaSpec = {
  id: "pedidos",
  name: "Pedidos surtidos",
  campos: [
    { clave: "fecha", etiqueta: "Fecha", tipo: "fecha" },
    { clave: "cobrar", etiqueta: "A cobrar", tipo: "dinero", unidad: "$" },
    {
      clave: "propina",
      etiqueta: "Propina",
      tipo: "calculado",
      formula: "if({recibido} - {cobrar} > 0, {recibido} - {cobrar}, 0)",
      unidad: "$",
      decimales: 2,
    },
    { clave: "domicilio", etiqueta: "Domicilio", tipo: "texto" },
  ],
  constantes: [{ clave: "tarifa", etiqueta: "Tarifa base", valor: "25", unidad: "$" }],
  resumenes: [{ clave: "propinas", etiqueta: "Propinas", formula: "{suma:propina}", unidad: "$" }],
};

const fila = (id: string, valores: Record<string, string>): Registro => ({
  id,
  valores,
  created_at: "2026-08-07T10:00:00.000Z",
  updated_at: "2026-08-07T11:00:00.000Z",
});

const CERRADO = "2026-08-07T22:00:00.000Z";

describe("cierre del día", () => {
  test("el esquema de archivo incluye campos, resúmenes, fijos y sello", () => {
    const archivo = esquema_archivo(origen);
    expect(archivo.id).toBe("pedidos-cierres");
    expect(archivo.cerrable).toBe(false);
    const claves = archivo.campos.map((c) => c.clave);
    expect(claves).toEqual(expect.arrayContaining(["fecha", "cobrar", "propina", "domicilio", "propinas", "tarifa", "cierre", "cierre_id"]));
    expect(campo_de(archivo, "cierre")!.tipo).toBe("fecha_hora");
    expect(campo_de(archivo, "cierre_id")!.tipo).toBe("texto");
  });

  test("los calculados quedan congelados como número sin fórmula", () => {
    const propina = campo_de(esquema_archivo(origen), "propina")!;
    expect(propina.tipo).toBe("numero");
    expect(propina.formula).toBeNull();
  });

  test("los fijos, calculados y resúmenes toman el valor del momento en cada fila", () => {
    const plan = planear_cierre(origen, [fila("p1", { fecha: "2026-08-07", cobrar: "85" })], CERRADO, {
      p1: { propina: "15", propinas: "15.00" },
    })!;
    const [row] = plan.filas_archivadas;
    expect(row!.valores.tarifa).toBe("25");
    expect(row!.valores.propina).toBe("15");
    expect(row!.valores.propinas).toBe("15.00");
    expect(row!.valores.cierre_id).toBe(plan.cierre_id);
    expect(row!.valores.cierre).toBe("2026-08-07T22:00");
    expect(row!.updated_at).toBe(CERRADO);
    expect(plan.cierre_id).toBe(`cierre-${Date.parse(CERRADO)}`);
  });

  test("colisión campo-resumen y campo-constante se desambiguan con prefijo", () => {
    const con_resumen = esquema_archivo({
      ...origen,
      resumenes: [{ clave: "propina", etiqueta: "Total propinas", formula: "{suma:propina}" }],
    });
    expect(campo_de(con_resumen, "propina")!.tipo).toBe("numero");
    expect(campo_de(con_resumen, "resumen_propina")).toBeDefined();

    const con_constante = esquema_archivo({
      ...origen,
      constantes: [{ clave: "cobrar", etiqueta: "Cobrar fijo", valor: "0" }],
    });
    expect(campo_de(con_constante, "cobrar")!.tipo).toBe("dinero");
    expect(campo_de(con_constante, "fijo_cobrar")).toBeDefined();

    const plan = planear_cierre(
      { ...origen, constantes: [{ clave: "cobrar", etiqueta: "Cobrar fijo", valor: "0" }] },
      [fila("a", { cobrar: "10" })],
      CERRADO,
    )!;
    expect(plan.filas_archivadas[0]!.valores.cobrar).toBe("10");
    expect(plan.filas_archivadas[0]!.valores.fijo_cobrar).toBe("0");
  });

  test("sin filas o tabla no cerrable no hay plan", () => {
    expect(planear_cierre(origen, [], CERRADO)).toBeNull();
    expect(planear_cierre({ ...origen, cerrable: false }, [fila("a", { cobrar: "1" })], CERRADO)).toBeNull();
  });

  test("una fila archivada por cada entrada", () => {
    const plan = planear_cierre(origen, [fila("a", { cobrar: "10" }), fila("b", { cobrar: "20" })], CERRADO)!;
    expect(plan.filas_archivadas.map((f) => f.id).sort()).toEqual(["a", "b"]);
    expect(plan.cierre_id.startsWith("cierre-")).toBe(true);
  });

  test("clave única con sufijos", () => {
    expect(clave_unica("Precio por hora", "x", [])).toBe("precio_por_hora");
    expect(clave_unica("Precio", "x", ["precio", "precio_2"])).toBe("precio_3");
    expect(clave_unica("¡¡!!", "respaldo", [])).toBe("respaldo");
  });
});
