import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { ESTADOS } from "./lib/pedidos/estado";
import {
  JORNADA_ESTADO_OPTIONS,
  PEDIDO_ESTADO_OPTIONS,
  push_status_seeds,
  STATUS_OPTION_SEED_PATH,
  STATUS_OPTION_SEEDS,
} from "./status-seeds";

describe("status seeds", () => {
  test("cada seed tiene valores únicos con campo y formato color/icon", () => {
    for (const s of STATUS_OPTION_SEEDS) {
      const values = s.options.map((o) => o.value);
      expect(new Set(values).size).toBe(values.length);
      expect(s.options.every((o) => o.field_name === s.status_fields?.[0])).toBe(true);
      expect(
        s.options.every((o) => /^#[0-9a-f]{6}$/.test(o.color) && /^fas fa-[a-z0-9-]+$/.test(o.icon ?? "")),
      ).toBe(true);
      expect(s.model_id.startsWith("subject-herramientas/")).toBe(true);
    }
  });

  test("jornada abierta/cerrada y pedido ESTADOS alineados al código", () => {
    expect(JORNADA_ESTADO_OPTIONS.map((o) => o.value)).toEqual(["abierta", "cerrada"]);
    expect(PEDIDO_ESTADO_OPTIONS.map((o) => o.value)).toEqual([...ESTADOS]);
    expect(PEDIDO_ESTADO_OPTIONS.some((o) => o.value === "cobrado")).toBe(true);
  });

  test("input-status sin options literales en jornadas y pedidos", () => {
    const jornadas = readFileSync(
      new URL("./modules/herr-jornadas/herr-jornadas.pages.ts", import.meta.url),
      "utf8",
    );
    expect(jornadas).toMatch(/name: "estado",\n\s+component: "input-status",/);
    expect(jornadas).not.toMatch(/name: "estado"[\s\S]*?options:\s*\[/);
    const pedidos = readFileSync(
      new URL("./modules/herr-pedidos/herr-pedidos.pages.ts", import.meta.url),
      "utf8",
    );
    expect(pedidos).toMatch(/name: "estado",\n\s+component: "input-status",/);
    expect(pedidos).not.toMatch(/name: "estado"[\s\S]*?options:\s*\[/);
  });

  test("herr-voz sigue con input-status RO y options propias (no tocar)", () => {
    const voz = readFileSync(new URL("./modules/herr-voz/herr-voz.pages.ts", import.meta.url), "utf8");
    expect(voz).toMatch(/name: "estado", component: "input-status".*options: ESTADOS/);
  });
});

describe("push_status_seeds", () => {
  const env = {
    CORE_DATA_URL: "http://core:3000/api/kirlets/data/x",
    SUBJECT_TECHNICAL_ID: "subject-herramientas",
    CORE_SUBJECT_GATEWAY_SECRET: "s",
  };
  test("sin env no llama", async () => {
    let called = false;
    const r = await push_status_seeds({
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
    const r = await push_status_seeds({ env, fetchImpl });
    expect(url).toBe(`http://core:3000${STATUS_OPTION_SEED_PATH}`);
    expect(init?.method).toBe("POST");
    const body = JSON.parse(String(init?.body));
    expect(body.entries.map((e: { model_id: string }) => e.model_id)).toContain(
      "subject-herramientas/herr-jornadas",
    );
    expect((init?.headers as Record<string, string>)["x-imperium-subject"]).toBe("subject-herramientas");
    expect(r.pushed).toBe(true);
  });
  test("rechazo del núcleo no lanza", async () => {
    const fetchImpl = (async () => Response.json({ error: "x" }, { status: 401 })) as unknown as typeof fetch;
    expect(await push_status_seeds({ env, fetchImpl })).toEqual({
      pushed: false,
      reason: "core_refused",
      status: 401,
    });
  });
});
