import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { FUENTES_GASTO, TIPOS_CAJA } from "./lib/liquidacion/liquidacion";
import { MEDIDORES } from "./modules/herr-vehiculos/herr-vehiculos.routes";
import {
  FUENTE_GASTO_OPTIONS,
  GENERAL_OPTION_LIST_SEED_PATH,
  GENERAL_OPTION_LIST_SEEDS,
  general_option_list_options_source,
  MEDIDOR_OPTIONS,
  push_general_option_seeds,
  TIPO_CAJA_OPTIONS,
} from "./general-option-seeds";

describe("general option seeds", () => {
  test("optionsSource apunta al control del núcleo", () => {
    expect(general_option_list_options_source("subject-herramientas/herr-caja", "tipo")).toBe(
      "api://general-option-list-control/options?model_id=subject-herramientas%2Fherr-caja&list_key=tipo&as=options",
    );
  });

  test("cada lista tiene clave y valores únicos", () => {
    for (const entry of GENERAL_OPTION_LIST_SEEDS) {
      expect(entry.model_id.startsWith("subject-herramientas/")).toBe(true);
      for (const list of entry.lists) {
        expect(list.list_key.length).toBeGreaterThan(0);
        const values = list.options.map((o) => o.value);
        expect(new Set(values).size).toBe(values.length);
      }
    }
  });

  test("seeds alineados a enums de validación del código", () => {
    expect(TIPO_CAJA_OPTIONS.map((o) => o.value)).toEqual([...TIPOS_CAJA]);
    expect(FUENTE_GASTO_OPTIONS.map((o) => o.value)).toEqual([...FUENTES_GASTO]);
    expect(MEDIDOR_OPTIONS.map((o) => o.value)).toEqual([...MEDIDORES]);
  });

  test("forms B usan optionsSource sin options literales", () => {
    const caja = readFileSync(new URL("./modules/herr-caja/herr-caja.pages.ts", import.meta.url), "utf8");
    expect(caja).toContain('name: "tipo"');
    expect(caja).toContain("general_option_list_options_source");
    expect(caja).not.toMatch(/name: "tipo"[\s\S]*?options:\s*\[/);
    const gastos = readFileSync(new URL("./modules/herr-gastos/herr-gastos.pages.ts", import.meta.url), "utf8");
    expect(gastos).toContain("general_option_list_options_source");
    expect(gastos).not.toMatch(/name: "fuente"[\s\S]*?options:\s*\[/);
    const veh = readFileSync(
      new URL("./modules/herr-vehiculos/herr-vehiculos.pages.ts", import.meta.url),
      "utf8",
    );
    expect(veh).toContain("general_option_list_options_source");
    expect(veh).not.toMatch(/name: "medidor"[\s\S]*?options:\s*\[/);
  });

  test("campos C siguen literales (etiquetas color, columna_precio, telefono)", () => {
    const etiquetas = readFileSync(
      new URL("./modules/herr-etiquetas/herr-etiquetas.pages.ts", import.meta.url),
      "utf8",
    );
    expect(etiquetas).toMatch(/options:\s*\[/);
    const cats = readFileSync(
      new URL("./modules/herr-menu-categorias/herr-menu-categorias.pages.ts", import.meta.url),
      "utf8",
    );
    expect(cats).toMatch(/name: "columna_precio"[\s\S]*?options:\s*\[/);
    const tel = readFileSync(
      new URL("./modules/herr-telefono/herr-telefono.pages.ts", import.meta.url),
      "utf8",
    );
    expect(tel).toMatch(/options:\s*\[/);
  });
});

describe("push_general_option_seeds", () => {
  const env = {
    CORE_DATA_URL: "http://core:3000/api/kirlets/data/x",
    SUBJECT_TECHNICAL_ID: "subject-herramientas",
    CORE_SUBJECT_GATEWAY_SECRET: "s",
  };
  test("sin env no llama", async () => {
    let called = false;
    const r = await push_general_option_seeds({
      env: {},
      fetchImpl: (async () => {
        called = true;
        return new Response();
      }) as unknown as typeof fetch,
    });
    expect(r).toEqual({ pushed: false, reason: "core_not_configured" });
    expect(called).toBe(false);
  });
  test("POST entries a seed-defaults del núcleo", async () => {
    let url = "";
    let init: RequestInit | undefined;
    const fetchImpl = (async (u: string, i: RequestInit) => {
      url = u;
      init = i;
      return Response.json({ data: [{ inserted: 1 }] });
    }) as unknown as typeof fetch;
    const r = await push_general_option_seeds({ env, fetchImpl });
    expect(url).toBe(`http://core:3000${GENERAL_OPTION_LIST_SEED_PATH}`);
    expect(init?.method).toBe("POST");
    const body = JSON.parse(String(init?.body));
    expect(body.entries.length).toBe(GENERAL_OPTION_LIST_SEEDS.length);
    expect(r.pushed).toBe(true);
  });
});
