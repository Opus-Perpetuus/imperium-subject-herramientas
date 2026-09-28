import { afterAll, describe, expect, test } from "bun:test";
import {
  create_kirlet_test_context,
  define_subject,
  sign_kirlet_identity_v2,
  validate_page_descriptor_renderable,
  type KirletIdentity,
} from "@opus-perpetuus/imperium-core-kit";
import { herr_utilidades_module } from "./herr-utilidades.routes.ts";

const SUBJECT = define_subject({
  id: "SUBJECT-herramientas",
  name: "Herramientas",
  compat: { nox: ">=0.5.0", kit: "^0.5.0" },
  modules: [herr_utilidades_module],
});
const server = create_kirlet_test_context(SUBJECT);
const SECRETO = "secreto-de-prueba";
const firmado = create_kirlet_test_context(SUBJECT, { auth_disabled: false, gateway_secret: SECRETO });
afterAll(() => {
  server.stop();
  firmado.stop();
});

/** Un usuario sin ningún grant de Herramientas (no tiene su menú). */
function sin_menu(user_type: KirletIdentity["user_type"]): Record<string, string> {
  return sign_kirlet_identity_v2(
    { user_id: "u1", email: "u1@x", is_admin: false, kirlet_id: SUBJECT.technical_id, grants: [], user_type, realm: "internal" },
    SECRETO,
  );
}

const get = (ruta: string) => server.fetch(new Request(`http://t${ruta}`));
const post = (ruta: string, body: unknown) =>
  server.fetch(
    new Request(`http://t${ruta}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );

describe("herr-utilidades", () => {
  test("markdown devuelve html saneado, ast, encabezados y etiquetas", async () => {
    const r = await post("/herr-utilidades/markdown", {
      texto: '# Título\n\n<script>alert(1)</script> ==ok== #tag\n\n- [x] hecha\n\n| a |\n|---|\n| 1 |',
    });
    expect(r.status).toBe(200);
    const { data } = await r.json();
    expect(data.html).not.toContain("<script");
    expect(data.html).toContain("&lt;script&gt;");
    expect(data.html).toContain("<mark>ok</mark>");
    expect(data.html).toContain("<table>");
    // El perfil del kit quita casillas, clases e ids; el texto se conserva.
    expect(data.html).not.toContain("<input");
    expect(data.html).toContain("hecha");
    expect(data.html).not.toContain('id="titulo"');
    expect(data.ast[0]).toMatchObject({ tipo: "encabezado", nivel: 1 });
    expect(data.encabezados).toEqual([{ nivel: 1, texto: "Título", ancla: "titulo" }]);
    expect(data.etiquetas).toEqual(["tag"]);
  });

  test("markdown sin sanear entrega el marcado íntegro", async () => {
    const r = await post("/herr-utilidades/markdown", {
      texto: "- [ ] tarea\n\n[[nota|alias]] #x",
      sanear: false,
    });
    const { data } = await r.json();
    expect(data.html).toContain('<input type="checkbox" disabled>');
    expect(data.html).toContain('<a data-wiki="nota">alias</a>');
    expect(data.html).toContain('<span class="etiqueta">#x</span>');
  });

  test("un usuario interno sin el menú de Herramientas puede usar los servicios; sin sesión interna, 401", async () => {
    const markdown = (headers: Record<string, string>) =>
      firmado.fetch(
        new Request("http://t/herr-utilidades/markdown", {
          method: "POST",
          headers: { ...headers, "content-type": "application/json" },
          body: JSON.stringify({ texto: "**a**", sanear: false }),
        }),
      );
    const r = await markdown(sin_menu("internal"));
    expect(r.status).toBe(200);
    expect((await r.json()).data.html).toBe("<p><strong>a</strong></p>");
    const salud = await firmado.fetch(new Request("http://t/herr-utilidades/salud", { headers: sin_menu("internal") }));
    expect((await salud.json()).data.ok).toBe(true);
    expect((await markdown(sin_menu("external"))).status).toBe(401);
    expect((await markdown(sin_menu("anonymous"))).status).toBe(401);
    expect((await markdown({})).status).toBe(401);
  });

  test("markdown exige texto", async () => {
    const r = await post("/herr-utilidades/markdown", {});
    expect(r.status).toBe(400);
    expect((await r.json()).error).toBe("texto_requerido");
  });

  test("capacidades lista al menos 10 entradas con su forma", async () => {
    const r = await get("/herr-utilidades/capacidades");
    expect(r.status).toBe(200);
    const { data } = await r.json();
    expect(data.length).toBeGreaterThanOrEqual(10);
    for (const c of data) {
      expect(Object.keys(c).sort()).toEqual(
        ["descripcion", "entrada", "herramienta", "id", "metodo", "ruta", "salida"],
      );
    }
    expect(new Set(data.map((c: { id: string }) => c.id)).size).toBe(data.length);
  });

  test("fórmula: valores, funciones y filas", async () => {
    let r = await post("/herr-utilidades/formula", {
      formula: "round({precio} * {cantidad} * (1 - {descuento} / 100), 2)",
      valores: { precio: 99.9, cantidad: 3, descuento: 10 },
    });
    expect(r.status).toBe(200);
    expect((await r.json()).data).toMatchObject({ ok: true, valor: 269.73 });
    r = await post("/herr-utilidades/formula", {
      formula: 'sumasi({monto}, {tipo} == "venta")',
      filas: [
        { monto: 10, tipo: "venta" },
        { monto: 5, tipo: "gasto" },
        { monto: 7, tipo: "venta" },
      ],
    });
    expect((await r.json()).data).toMatchObject({ ok: true, valor: 17 });
    r = await post("/herr-utilidades/formula", { formula: "1 +" });
    expect(r.status).toBe(200);
    expect((await r.json()).data.ok).toBe(false);
    r = await post("/herr-utilidades/formula", {});
    expect(r.status).toBe(400);
  });

  test("geo: distancia y enlaces", async () => {
    let r = await post("/herr-utilidades/geo/distancia", {
      desde: { lat: 20.6736, lon: -103.344 },
      hasta: { lat: 20.6736, lon: -103.334 },
    });
    expect(r.status).toBe(200);
    const { metros } = (await r.json()).data;
    expect(metros).toBeGreaterThan(1000);
    expect(metros).toBeLessThan(1100);
    r = await post("/herr-utilidades/geo/enlaces", { lat: 20.6736, lon: -103.344, etiqueta: "Casa" });
    const enlaces = (await r.json()).data;
    expect(enlaces.ver).toContain("20.673600%2C-103.344000");
    expect(enlaces.como_llegar).toContain("travelmode=two_wheeler");
    expect(enlaces.geo.startsWith("geo:")).toBe(true);
    r = await post("/herr-utilidades/geo/distancia", { desde: {}, hasta: {} });
    expect(r.status).toBe(400);
  });

  test("rutas: informe de una traza con una parada", async () => {
    const t0 = Date.parse("2026-09-27T12:00:00Z");
    const puntos: Array<{ t: string; lat: number; lon: number; acc: number }> = [];
    // 10 pasos de ~10 m cada 5 s, luego 2 min quieto, luego otros 10 pasos.
    for (let i = 0; i < 10; i++) {
      puntos.push({ t: new Date(t0 + i * 5000).toISOString(), lat: 20.6 + i * 0.00009, lon: -103.3, acc: 5 });
    }
    for (let i = 0; i < 24; i++) {
      puntos.push({ t: new Date(t0 + 50_000 + i * 5000).toISOString(), lat: 20.6 + 9 * 0.00009, lon: -103.3, acc: 5 });
    }
    for (let i = 1; i <= 10; i++) {
      puntos.push({ t: new Date(t0 + 170_000 + i * 5000).toISOString(), lat: 20.6 + (9 + i) * 0.00009, lon: -103.3, acc: 5 });
    }
    const r = await post("/herr-utilidades/rutas/analizar", { puntos });
    expect(r.status).toBe(200);
    const informe = (await r.json()).data;
    expect(informe.paradas.length).toBe(1);
    expect(informe.distancia_m).toBeGreaterThan(150);
    expect((await post("/herr-utilidades/rutas/analizar", { puntos: [] })).status).toBe(400);
  });

  test("salud", async () => {
    const r = await get("/herr-utilidades/salud");
    expect(r.status).toBe(200);
    const { data } = await r.json();
    expect(data.ok).toBe(true);
    expect(typeof data.version).toBe("string");
  });

  test("la página es válida y renderizable", async () => {
    const r = await get("/pages/herramientas.herr-utilidades");
    expect(r.status).toBe(200);
    const page = await r.json();
    const v = validate_page_descriptor_renderable(page);
    expect(v).toMatchObject({ ok: true });
    expect(page.page.children[1].props.rows.length).toBeGreaterThanOrEqual(10);
  });
});
