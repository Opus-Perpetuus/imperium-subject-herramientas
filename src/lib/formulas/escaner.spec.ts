import { describe, expect, test } from "bun:test";
import type { CampoSpec } from "./esquema.ts";
import { config_escaner, escaner_desde_formulario, normalizar_escaner, plantilla_valida } from "./escaner.ts";

const campos: CampoSpec[] = [
  { clave: "codigo", etiqueta: "Código", tipo: "codigo" },
  { clave: "sku", etiqueta: "SKU", tipo: "texto" },
  { clave: "foto", etiqueta: "Foto", tipo: "foto" },
];

describe("plantilla de la dirección", () => {
  test("solo http/https o ruta interna, y con {valor}", () => {
    expect(plantilla_valida("")).toBeNull();
    expect(plantilla_valida("https://x.mx/p?c={valor}")).toBeNull();
    expect(plantilla_valida("/internal/products?view_list_search={valor}")).toBeNull();
    expect(plantilla_valida("https://x.mx/p")).toContain("{valor}");
    expect(plantilla_valida("javascript:alert({valor})")).toContain("http");
    expect(plantilla_valida("//evil.mx/{valor}")).not.toBeNull();
  });
});

describe("desde el formulario del diseñador", () => {
  test("guarda lo elegido y rechaza destinos y plantillas que no sirven", () => {
    const r = escaner_desde_formulario(campos, campos[0]!, {
      escaner_formatos: "qr",
      escaner_destino: "sku",
      escaner_plantilla: "https://x.mx/{valor}",
      escaner_abrir_url: "true",
      escaner_buscar: true,
      escaner_continuo: false,
    });
    expect(r).toEqual({
      escaner: { formatos: "qr", destino: "sku", plantilla: "https://x.mx/{valor}", abrir_url: true, buscar: true, continuo: false },
    });
    expect(escaner_desde_formulario(campos, campos[0]!, { escaner_destino: "foto" })).toHaveProperty("error");
    expect(escaner_desde_formulario(campos, campos[0]!, { escaner_destino: "codigo" })).toHaveProperty("error");
    expect(escaner_desde_formulario(campos, campos[0]!, { escaner_plantilla: "data:text/html,{valor}" })).toHaveProperty("error");
  });

  test("lo guardado se relee y lo inválido se descarta", () => {
    expect(normalizar_escaner(null)).toBeNull();
    expect(normalizar_escaner({ formatos: "raro", plantilla: "javascript:{valor}", abrir_url: "sí" })).toEqual({
      formatos: "todos",
      destino: null,
      plantilla: null,
      abrir_url: false,
      buscar: false,
      continuo: false,
    });
  });
});

describe("configuración del input scanner", () => {
  test("sin ajustes solo deja el valor, con GS1 e historial", () => {
    expect(config_escaner(campos[0]!, campos, "t1")).toEqual({ gs1: true, history: true });
  });

  test("traduce cada ajuste a una acción genérica del núcleo", () => {
    const campo: CampoSpec = {
      ...campos[0]!,
      multiple: true,
      escaner: { formatos: "barras", destino: "sku", plantilla: "https://x.mx/{valor}", abrir_url: true, buscar: true, continuo: true },
    };
    const c = config_escaner(campo, campos, "t 1");
    expect(c.formats).toContain("ean_13");
    expect(c.formats).not.toContain("qr_code");
    expect(c.continuous).toBe(true);
    expect(c.multiple).toBe(true);
    expect(c.actions).toEqual([
      { kind: "guardar_en", target: "sku" },
      { kind: "abrir_plantilla", template: "https://x.mx/{valor}", new_tab: true },
      { kind: "abrir_valor", confirm: true, new_tab: true },
      { kind: "abrir_plantilla", template: "/internal/herr-tabla?id=t%201&q={valor}", new_tab: false },
    ]);
  });

  test("un destino que ya no existe no se manda", () => {
    const campo: CampoSpec = { ...campos[0]!, escaner: { formatos: "todos", destino: "borrada", plantilla: null, abrir_url: false, buscar: false, continuo: false } };
    expect(config_escaner(campo, campos).actions).toBeUndefined();
  });
});
