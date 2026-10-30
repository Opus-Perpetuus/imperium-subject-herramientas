import { describe, expect, test } from "bun:test";
import type { CampoSpec } from "./esquema.ts";
import {
  ESCANER_VACIO,
  codigos_de,
  config_escaner,
  escaner_desde_formulario,
  metadata_de_codigo,
  normalizar_escaner,
  plantilla_valida,
} from "./escaner.ts";

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
      escaner_mostrar: "ambos",
      escaner_notas: "true",
    });
    expect(r).toEqual({
      escaner: { formatos: "qr", destino: "sku", plantilla: "https://x.mx/{valor}", abrir_url: true, buscar: true, continuo: false, mostrar: "ambos", notas: true },
    });
    expect(escaner_desde_formulario(campos, campos[0]!, { escaner_mostrar: "imagen" })).toEqual({
      escaner: expect.objectContaining({ mostrar: "valor" }),
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
      mostrar: "valor",
      notas: false,
    });
    expect(normalizar_escaner({ mostrar: "codigo" })?.mostrar).toBe("codigo");
  });
});

describe("configuración del input scanner", () => {
  test("sin ajustes solo deja el valor, con GS1 e historial", () => {
    expect(config_escaner(campos[0]!, campos, "t1")).toEqual({ gs1: true, history: false, metadata_target: "codigo@codigo" });
  });

  test("el historial es solo del registro abierto; las notas, solo con varios códigos", () => {
    expect(config_escaner(campos[0]!, campos, "t1", "r9")).toMatchObject({ history: true, history_scope: "herr-registro:r9" });
    const con_notas = { ...campos[0]!, escaner: { ...ESCANER_VACIO, notas: true } };
    expect(config_escaner(con_notas, campos).notes).toBeUndefined();
    expect(config_escaner({ ...con_notas, multiple: true }, campos)).toMatchObject({ multiple: true, notes: true, notes_label: "Nota" });
  });

  test("la nota de cada código se guarda limpia en la metadata", () => {
    const meta = metadata_de_codigo({ multiple: true }, "A, B", JSON.stringify([{ value: "A", note: "x".repeat(900) }, { value: "B", note: {} }]));
    const [a, b] = JSON.parse(meta) as { value: string; note?: string }[];
    expect(a!.note!.length).toBe(500);
    expect(b!.note).toBeUndefined();
  });

  test("traduce cada ajuste a una acción genérica del núcleo", () => {
    const campo: CampoSpec = {
      ...campos[0]!,
      multiple: true,
      escaner: { formatos: "barras", destino: "sku", plantilla: "https://x.mx/{valor}", abrir_url: true, buscar: true, continuo: true, mostrar: "codigo" },
    };
    const c = config_escaner(campo, campos, "t 1");
    expect(c.formats).toContain("ean_13");
    expect(c.formats).not.toContain("qr_code");
    expect(c.continuous).toBe(true);
    expect(c.multiple).toBe(true);
    expect(c.display).toBe("codigo");
    expect(c.metadata_target).toBe("codigo@codigo");
    expect(c.actions).toEqual([
      { kind: "guardar_en", target: "sku" },
      { kind: "abrir_plantilla", template: "https://x.mx/{valor}", new_tab: true },
      { kind: "abrir_valor", confirm: true, new_tab: true },
      { kind: "abrir_plantilla", template: "/internal/herr-tabla?id=t%201&q={valor}", new_tab: false },
    ]);
  });

  test("un destino que ya no existe no se manda", () => {
    const campo: CampoSpec = { ...campos[0]!, escaner: { formatos: "todos", destino: "borrada", plantilla: null, abrir_url: false, buscar: false, continuo: false, mostrar: "valor" } };
    expect(config_escaner(campo, campos).actions).toBeUndefined();
  });
});

describe("metadata de lo leído", () => {
  const qr = { value: "https://x.mx/1", format: "qr_code", version: "3", ec_level: "M", source: "camara", length: 14, gs1: false };

  test("solo los códigos de la columna: uno, o los que unió «varios»", () => {
    expect(codigos_de({}, " A1 ")).toEqual(["A1"]);
    expect(codigos_de({}, "https://x.mx/?a=1, 2")).toEqual(["https://x.mx/?a=1, 2"]);
    expect(codigos_de({ multiple: true }, "A, B, A")).toEqual(["A", "B"]);
    expect(codigos_de({ multiple: true }, "")).toEqual([]);
  });

  test("se guarda limpia y solo si el código sigue en el campo", () => {
    const guardada = JSON.parse(metadata_de_codigo({}, "https://x.mx/1", JSON.stringify({ ...qr, extra: "<script>", version: { mal: 1 } })));
    expect(guardada).toEqual({ value: "https://x.mx/1", format: "qr_code", ec_level: "M", source: "camara", length: 14 });
    expect(metadata_de_codigo({}, "otro", JSON.stringify(qr))).toBe("");
    expect(metadata_de_codigo({}, "https://x.mx/1", "no es json")).toBe("");
    expect(metadata_de_codigo({}, "https://x.mx/1", "")).toBe("");
    expect(metadata_de_codigo({}, "https://x.mx/1", { format: "qr_code" })).toBe("");
  });

  test("con varios códigos, una por código vigente", () => {
    const lista = [
      { value: "A", format: "ean_13" },
      { value: "B", format: "qr_code", gs1: true },
      { value: "C", format: "code_128" },
    ];
    expect(JSON.parse(metadata_de_codigo({ multiple: true }, "A, B", lista))).toEqual([
      { value: "A", format: "ean_13" },
      { value: "B", format: "qr_code", gs1: true },
    ]);
    // Una columna que dejó de ser «varios» se queda con la del código que tiene.
    expect(JSON.parse(metadata_de_codigo({}, "B", lista))).toEqual({ value: "B", format: "qr_code", gs1: true });
  });
});

describe("formato del código regenerado", () => {
  test("columna de barras o QR lo pasa al núcleo; «todos» lo deja deducir", () => {
    const barras: CampoSpec = { clave: "codigo", etiqueta: "Código", tipo: "codigo", escaner: { ...ESCANER_VACIO, formatos: "barras", mostrar: "codigo" } };
    expect(config_escaner(barras, campos).regenerate_format).toBe("code_128");
    expect(config_escaner({ ...barras, escaner: { ...barras.escaner!, formatos: "qr" } }, campos).regenerate_format).toBe("qr_code");
    expect(config_escaner(campos[0]!, campos).regenerate_format).toBeUndefined();
  });

  test("la metadata deducida conserva inferred al guardarse", () => {
    const meta = { value: "7501055375936", format: "ean_13", format_label: "EAN-13 (deducido)", source: "teclado", inferred: true, extra: 1 };
    const guardada = JSON.parse(metadata_de_codigo({}, "7501055375936", JSON.stringify(meta)));
    expect(guardada).toMatchObject({ format: "ean_13", inferred: true });
    expect(guardada.extra).toBeUndefined();
  });
});

