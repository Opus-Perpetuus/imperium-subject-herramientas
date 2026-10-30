import { describe, expect, test } from "bun:test";
import type { CampoSpec } from "./esquema.ts";
import { aplicar_cantidad, describir_cambio, normalizar_reglas, patron_coincide, regla_desde_formulario, type TablasDeRegla } from "./reglas.ts";

const lineas: { id: string; name: string; campos: CampoSpec[] } = {
  id: "t_lin",
  name: "Líneas",
  campos: [
    { clave: "pedido", etiqueta: "Pedido", tipo: "referencia", tabla_ref_id: "t_ped" },
    { clave: "cajas", etiqueta: "Cajas", tipo: "entero" },
  ],
};
const pedidos = { id: "t_ped", name: "Pedidos", campos: [{ clave: "total", etiqueta: "Total", tipo: "entero" }] as CampoSpec[] };
const productos = {
  id: "t_prod",
  name: "Productos",
  campos: [
    { clave: "codigo", etiqueta: "Código", tipo: "codigo" },
    { clave: "piezas", etiqueta: "Piezas", tipo: "entero" },
  ] as CampoSpec[],
};
const t: TablasDeRegla = { actual: lineas, tabla: (id) => [lineas, pedidos, productos].find((x) => x.id === id) ?? null };

describe("reglas al escanear", () => {
  test("el patrón: vacío es cualquiera, * es comodín, sin distinguir mayúsculas", () => {
    expect(patron_coincide("", "X")).toBe(true);
    expect(patron_coincide("", "")).toBe(false);
    expect(patron_coincide("caja-*", "CAJA-12")).toBe(true);
    expect(patron_coincide("CAJA-*", "BOTELLA-1")).toBe(false);
    expect(patron_coincide("A.B", "AxB")).toBe(false);
  });

  test("sumar, restar y poner; vacío cuenta como cero", () => {
    expect(aplicar_cantidad("", "sumar", 12)).toBe("12");
    expect(aplicar_cantidad("5", "restar", 2)).toBe("3");
    expect(aplicar_cantidad("5", "poner", 2)).toBe("2");
    expect(aplicar_cantidad("0.1", "sumar", 0.2)).toBe("0.3");
    expect(describir_cambio("sumar", 12, "Botellas")).toBe("+12 Botellas");
  });

  test("el formulario valida cada columna contra su tabla", () => {
    const base = { destino: "padre", enlace: "pedido", accion: "sumar", cantidad: "12", columna: "t_ped.total" };
    const ok = regla_desde_formulario(base, t, "r1");
    expect("regla" in ok && ok.regla).toMatchObject({ destino: "padre", enlace: "pedido", columna: "total", cantidad: 12 });
    expect(regla_desde_formulario({ ...base, columna: "t_lin.cajas" }, t, "r1")).toHaveProperty("error");
    expect(regla_desde_formulario({ ...base, enlace: "" }, t, "r1")).toHaveProperty("error");
    expect(regla_desde_formulario({ ...base, cantidad_de: "t_prod.piezas" }, t, "r1")).toHaveProperty("error");
    const por_caja = regla_desde_formulario({ ...base, tabla_origen: "t_prod", cantidad_de: "t_prod.piezas" }, t, "r1");
    expect("regla" in por_caja && por_caja.regla.cantidad_de).toBe("piezas");
    expect(
      regla_desde_formulario({ destino: "existente_o_nuevo", tabla_destino: "t_ped", cantidad: "1", columna: "t_ped.total" }, t, "r1"),
    ).toHaveProperty("error");
  });

  test("normaliza lo guardado y descarta lo que no sirve", () => {
    const ok = regla_desde_formulario({ destino: "actual", cantidad: "1", columna: "t_lin.cajas" }, t, "r1");
    if (!("regla" in ok)) throw new Error("debía valer");
    expect(normalizar_reglas(JSON.stringify([ok.regla, { id: "x" }, null]))).toEqual([ok.regla]);
    expect(normalizar_reglas("no es json")).toEqual([]);
  });
});
