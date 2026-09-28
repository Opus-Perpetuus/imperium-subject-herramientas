import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { create_kirlet_test_context, define_subject } from "@opus-perpetuus/imperium-core-kit";
import { herr_agenda_module } from "./herr-agenda.routes.ts";

const SUBJECT = define_subject({
  id: "SUBJECT-herramientas",
  name: "Herramientas",
  compat: { nox: ">=0.5.0", kit: "^0.5.0" },
  modules: [herr_agenda_module],
});

type Server = ReturnType<typeof create_kirlet_test_context>;
let server: Server;

async function call(method: string, path: string, body?: unknown) {
  const res = await server.fetch(
    new Request(`http://t${path}`, {
      method,
      headers: body === undefined ? {} : { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  );
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { status: res.status, json, data: json.data as any };
}

async function evento(extra: Record<string, unknown>) {
  const r = await call("POST", "/herr-agenda", { name: "Evento", fecha: "2026-09-28", ...extra });
  expect(r.status).toBe(201);
  return r.data as Record<string, unknown>;
}

beforeEach(() => {
  server = create_kirlet_test_context(SUBJECT);
});
afterEach(() => server.stop());

describe("recordatorio_en", () => {
  test("evento con hora: la hora local de México menos el adelanto", async () => {
    const e = await evento({ name: "Junta", inicio_minuto: 570, recordatorio_min: 30 });
    expect(e).toMatchObject({ duracion_min: 60, alarma: false, hecho: false, recordatorio_en: "2026-09-28T15:00:00.000Z" });
  });

  test("todo el día avisa a las 08:00 y sin aviso no hay instante", async () => {
    expect((await evento({ name: "Cumple" })).recordatorio_en).toBe("2026-09-28T13:45:00.000Z");
    expect((await evento({ name: "Nada", recordatorio_min: -1 })).recordatorio_en).toBeNull();
  });

  test("custom_data.tz cambia la zona; una zona inválida cae a México", async () => {
    const madrid = await evento({ name: "Madrid", inicio_minuto: 540, recordatorio_min: 0, custom_data: { tz: "Europe/Madrid" } });
    expect(madrid.recordatorio_en).toBe("2026-09-28T07:00:00.000Z");
    const rara = await evento({ name: "Rara", inicio_minuto: 540, recordatorio_min: 0, custom_data: { tz: "Marte/Olympus" } });
    expect(rara.recordatorio_en).toBe("2026-09-28T15:00:00.000Z");
  });

  test("al editar se recalcula con la fila completa y la fecha del selector se recorta", async () => {
    const e = await evento({ name: "Junta", fecha: "2026-09-28T00:00:00.000Z", inicio_minuto: 570, recordatorio_min: 30 });
    expect(e.fecha).toBe("2026-09-28");
    const patch = await call("PATCH", `/herr-agenda/${e.id}`, { inicio_minuto: "" });
    expect(patch.status).toBe(200);
    expect(patch.data.inicio_minuto).toBeNull();
    expect(patch.data.recordatorio_en).toBe("2026-09-28T13:30:00.000Z");
    // El cliente no fija el instante a mano: se recalcula aunque lo mande.
    const echo = await call("PATCH", `/herr-agenda/${e.id}`, { recordatorio_en: "2000-01-01T00:00:00Z" });
    expect(echo.status).toBe(200);
    expect(echo.data.recordatorio_en).toBe("2026-09-28T13:30:00.000Z");
  });

  test("validaciones", async () => {
    expect((await call("POST", "/herr-agenda", { name: "X", fecha: "28/09/2026" })).status).toBe(400);
    expect((await call("POST", "/herr-agenda", { name: "X" })).status).toBe(400);
    expect((await call("POST", "/herr-agenda", { name: "X", fecha: "2026-09-28", inicio_minuto: 1440 })).status).toBe(400);
    expect((await call("POST", "/herr-agenda", { name: "X", fecha: "2026-09-28", recordatorio_min: 7 })).status).toBe(400);
    expect((await call("POST", "/herr-agenda", { name: "X", fecha: "2026-02-30" })).status).toBe(400);
  });

  test("un null del formulario en una columna NOT NULL toma el valor por defecto", async () => {
    const e = await evento({ name: "Vacío", duracion_min: null, recordatorio_min: null, alarma: null, hecho: null });
    expect(e).toMatchObject({ duracion_min: 60, recordatorio_min: 15, alarma: false, hecho: false });
    const patch = await call("PATCH", `/herr-agenda/${e.id}`, { duracion_min: null, recordatorio_min: "" });
    expect(patch.data).toMatchObject({ duracion_min: 60, recordatorio_min: 15 });
  });

  test("un null o vacío en name, fecha o is_active conserva lo guardado; is_active null al crear es true", async () => {
    const e = await evento({ name: "Junta", is_active: null });
    expect(e.is_active).toBe(true);
    const patch = await call("PATCH", `/herr-agenda/${e.id}`, { name: null, fecha: "", is_active: null });
    expect(patch.status).toBe(200);
    expect(patch.data).toMatchObject({ name: "Junta", fecha: "2026-09-28", is_active: true });
  });

  test("created_by lo fija el servidor y no se edita", async () => {
    const e = await evento({ name: "Mío", created_by: "otro@x" });
    expect(e.created_by).toBe("dev@local");
    const patch = await call("PATCH", `/herr-agenda/${e.id}`, { created_by: "otro@x" });
    expect(patch.data.created_by).toBe("dev@local");
  });
});

describe("rango, recordatorios y hecho", () => {
  test("rango filtra por fecha y ordena por día y hora", async () => {
    await evento({ name: "Tarde", fecha: "2026-09-28", inicio_minuto: 900 });
    await evento({ name: "Todo el día", fecha: "2026-09-28" });
    await evento({ name: "Mañana", fecha: "2026-09-29", inicio_minuto: 60 });
    await evento({ name: "Temprano", fecha: "2026-09-28", inicio_minuto: 480 });
    await evento({ name: "Fuera", fecha: "2026-10-05" });
    const r = await call("GET", "/herr-agenda/rango?desde=2026-09-28&hasta=2026-09-29");
    expect(r.status).toBe(200);
    expect(r.data.map((e: { name: string }) => e.name)).toEqual(["Todo el día", "Temprano", "Tarde", "Mañana"]);
    expect((await call("GET", "/herr-agenda/rango?desde=2026-09-29&hasta=2026-09-28")).status).toBe(400);
    expect((await call("GET", "/herr-agenda/rango?desde=ayer")).status).toBe(400);
  });

  test("recordatorios deja fuera lo hecho y lo que no avisa, y trae inicio y fin", async () => {
    const junta = await evento({ name: "Junta", inicio_minuto: 570, duracion_min: 5, recordatorio_min: 15, alarma: true });
    await evento({ name: "Sin aviso", recordatorio_min: -1 });
    const hecho = await evento({ name: "Ya hecho", inicio_minuto: 600 });
    await call("POST", `/herr-agenda/${hecho.id}/hecho`);
    await evento({ name: "Cumple" });

    await evento({ name: "Otro día", fecha: "2026-09-30", inicio_minuto: 570, recordatorio_min: 30 });
    const r = await call("GET", "/herr-agenda/recordatorios?desde=2026-09-28&hasta=2026-09-28");
    expect(r.status).toBe(200);
    expect(r.data).toEqual([
      {
        evento_id: expect.any(String),
        name: "Cumple",
        recordatorio_en: "2026-09-28T13:45:00.000Z",
        alarma: false,
        inicio_en: "2026-09-28T06:00:00.000Z",
        fin_en: "2026-09-28T07:00:00.000Z",
      },
      {
        evento_id: junta.id,
        name: "Junta",
        recordatorio_en: "2026-09-28T15:15:00.000Z",
        alarma: true,
        inicio_en: "2026-09-28T15:30:00.000Z",
        // Nunca menos de 15 minutos.
        fin_en: "2026-09-28T15:45:00.000Z",
      },
    ]);
  });

  test("recordatorios selecciona por el instante del aviso, no por la fecha del evento", async () => {
    const manana = await evento({ name: "Mañana", fecha: "2026-09-29", inicio_minuto: 540, recordatorio_min: 1440 });
    await evento({ name: "Hoy tarde", fecha: "2026-09-28", inicio_minuto: 1200, recordatorio_min: 0 });
    const r = await call("GET", "/herr-agenda/recordatorios?desde=2026-09-28&hasta=2026-09-28");
    expect(r.data.map((a: { name: string }) => a.name)).toEqual(["Mañana", "Hoy tarde"]);
    expect(r.data[0]).toMatchObject({ evento_id: manana.id, recordatorio_en: "2026-09-28T15:00:00.000Z" });
    // El 29 el aviso de «Mañana» ya sonó (fue el 28): no se repite.
    expect((await call("GET", "/herr-agenda/recordatorios?desde=2026-09-29")).data).toEqual([]);
    // Instantes ISO: el rango es exacto.
    const iso = await call("GET", "/herr-agenda/recordatorios?desde=2026-09-28T15:00:00Z&hasta=2026-09-28T16:00:00Z");
    expect(iso.data.map((a: { name: string }) => a.name)).toEqual(["Mañana"]);
    expect((await call("GET", "/herr-agenda/recordatorios?desde=ayer")).status).toBe(400);
    expect((await call("GET", "/herr-agenda/recordatorios?desde=2026-09-29&hasta=2026-09-28")).status).toBe(400);
  });

  test("sin desde, los avisos ya vencidos no salen", async () => {
    await evento({ name: "Pasado", fecha: "2020-01-01", inicio_minuto: 540, recordatorio_min: 0 });
    await evento({ name: "Futuro", fecha: "2999-01-01", inicio_minuto: 540, recordatorio_min: 0 });
    const r = await call("GET", "/herr-agenda/recordatorios?hasta=2999-12-31");
    expect(r.data.map((a: { name: string }) => a.name)).toEqual(["Futuro"]);
  });

  test("hecho alterna y un id inexistente es 404", async () => {
    const e = await evento({ name: "Tarea" });
    expect((await call("POST", `/herr-agenda/${e.id}/hecho`)).data.hecho).toBe(true);
    expect((await call("POST", `/herr-agenda/${e.id}/hecho`)).data.hecho).toBe(false);
    expect((await call("POST", "/herr-agenda/nada/hecho")).status).toBe(404);
  });
});

describe("páginas", () => {
  test("la lista se arma y la del día lee ?fecha= y pinta la tabla", async () => {
    const lista = await server.fetch(new Request("http://t/pages/herramientas.herr-agenda"));
    expect(lista.status).toBe(200);
    await evento({ name: "Junta", inicio_minuto: 570 });
    await evento({ name: "Otro día", fecha: "2026-09-29" });
    const res = await server.fetch(new Request("http://t/pages/herramientas.herr-agenda-dia?fecha=2026-09-28"));
    expect(res.status).toBe(200);
    const doc = (await res.json()) as {
      title: string;
      page: { children: Array<{ component: string; props?: { rows?: Array<Record<string, string>> }; children?: Array<{ props: { href: string } }> }> };
    };
    expect(doc.title).toBe("Agenda del 2026-09-28");
    expect(doc.page.children[0]!.children!.map((l) => l.props.href)).toEqual([
      "/internal/herr-agenda-dia?fecha=2026-09-27",
      "/internal/herr-agenda-dia",
      "/internal/herr-agenda-dia?fecha=2026-09-29",
      "/internal/herr-agenda",
    ]);
    const tabla = doc.page.children[1]!;
    expect(tabla.component).toBe("nox.table");
    expect(tabla.props!.rows).toEqual([{ hora: "09:30", titulo: "Junta", duracion: "60 min", aviso: "2026-09-28 09:15", hecho: "No" }]);

    await evento({ name: "Temprano", fecha: "2026-09-30", inicio_minuto: 10, recordatorio_min: 30 });
    const temprano = await server.fetch(new Request("http://t/pages/herramientas.herr-agenda-dia?fecha=2026-09-30"));
    const filas = ((await temprano.json()) as { page: { children: Array<{ props?: { rows?: Array<Record<string, string>> } }> } }).page.children[1]!.props!.rows!;
    expect(filas[0]!.aviso).toBe("2026-09-29 23:40");
    const vacio = await server.fetch(new Request("http://t/pages/herramientas.herr-agenda-dia?fecha=2026-12-25"));
    expect(((await vacio.json()) as { page: { children: Array<{ component: string }> } }).page.children[1]!.component).toBe("nox.empty");
  });
});
