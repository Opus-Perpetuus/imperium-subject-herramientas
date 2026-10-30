import { describe, expect, test } from "bun:test";
import type { CampoSpec, Registro } from "./esquema.ts";
import {
  celda_coincide,
  columna_de_escaneo,
  escaneo_desde_formulario,
  normalizar_escaneo,
  registro_por_codigo,
} from "./escaneo.ts";

const campos: CampoSpec[] = [
  { clave: "nombre", etiqueta: "Nombre", tipo: "texto" },
  { clave: "codigo", etiqueta: "Código", tipo: "codigo" },
  { clave: "codigos", etiqueta: "Códigos", tipo: "codigo", multiple: true },
  { clave: "foto", etiqueta: "Foto", tipo: "foto" },
  { clave: "rota", etiqueta: "Rota", tipo: "referencia" },
];
const fila = (id: string, valores: Record<string, string>): Registro => ({ id, valores }) as Registro;

describe("al escanear (esquema)", () => {
  test("normaliza solo acciones conocidas con columna, también desde texto JSON", () => {
    expect(normalizar_escaneo({ accion: "nuevo", columna: "codigo" })).toEqual({ accion: "nuevo", columna: "codigo" });
    expect(normalizar_escaneo('{"accion":"abrir_o_nuevo","columna":"x"}')).toEqual({ accion: "abrir_o_nuevo", columna: "x" });
    expect(normalizar_escaneo({ accion: "toString", columna: "codigo" })).toBeNull();
    expect(normalizar_escaneo({ accion: "nuevo" })).toBeNull();
    expect(normalizar_escaneo("{roto")).toBeNull();
    expect(normalizar_escaneo(null)).toBeNull();
  });

  test("la columna debe existir y recibir códigos; un enlace necesita su tabla", () => {
    expect(columna_de_escaneo({ campos, escaneo: { accion: "nuevo", columna: "codigo" } })?.clave).toBe("codigo");
    expect(columna_de_escaneo({ campos, escaneo: { accion: "nuevo", columna: "foto" } })).toBeNull();
    expect(columna_de_escaneo({ campos, escaneo: { accion: "nuevo", columna: "rota" } })).toBeNull();
    expect(columna_de_escaneo({ campos, escaneo: { accion: "nuevo", columna: "no_hay" } })).toBeNull();
    expect(escaneo_desde_formulario({ campos }, { escaneo_accion: "ninguna" })).toEqual({ escaneo: null });
    expect(escaneo_desde_formulario({ campos }, { escaneo_accion: "nuevo", escaneo_columna: "foto" })).toHaveProperty("error");
    expect(escaneo_desde_formulario({ campos }, { escaneo_accion: "x", escaneo_columna: "codigo" })).toHaveProperty("error");
    expect(escaneo_desde_formulario({ campos }, { escaneo_accion: "abrir_o_nuevo", escaneo_columna: "nombre" })).toEqual({
      escaneo: { accion: "abrir_o_nuevo", columna: "nombre" },
    });
  });

  test("busca primero en las columnas «Código» (también las de varios) y luego en las de texto", () => {
    const filas = [
      fila("1", { nombre: "A-2", codigo: "X" }),
      fila("2", { nombre: "Llave", codigo: "A-2" }),
      fila("3", { nombre: "Caja", codigos: "B-1, B-2" }),
    ];
    expect(registro_por_codigo({ campos }, filas, "A-2")?.id).toBe("2");
    expect(registro_por_codigo({ campos }, filas, "b-2")?.id).toBe("3");
    expect(registro_por_codigo({ campos }, filas, "llave")?.id).toBe("2");
    expect(registro_por_codigo({ campos }, filas, "nada")).toBeNull();
    expect(celda_coincide(campos[1]!, "A-2", " ")).toBe(false);
  });
});
