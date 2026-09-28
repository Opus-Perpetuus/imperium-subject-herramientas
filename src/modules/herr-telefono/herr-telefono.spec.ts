import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { create_kirlet_test_context, define_subject } from "@opus-perpetuus/imperium-core-kit";
import { herr_telefono_module } from "./herr-telefono.routes.ts";

const SUBJECT = define_subject({
  id: "SUBJECT-herramientas",
  name: "Herramientas",
  compat: { nox: ">=0.5.0", kit: "^0.5.0" },
  modules: [herr_telefono_module],
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

async function perfil(extra: Record<string, unknown> = {}) {
  const r = await call("POST", "/herr-telefono", { name: "Casa", es_activa: true, ...extra });
  expect(r.status).toBe(201);
  return r.data as Record<string, unknown>;
}

async function decidir(body: Record<string, unknown>) {
  const r = await call("POST", "/herr-telefono/decidir", body);
  expect(r.status).toBe(200);
  return r.data as {
    accion: string;
    anunciar: boolean;
    texto_anuncio: string;
    retardo_s: number;
    anuncio_repeticiones: number;
    silenciar_timbre: boolean;
  };
}

beforeEach(() => {
  server = create_kirlet_test_context(SUBJECT);
});
afterEach(() => server.stop());

describe("perfiles", () => {
  test("un perfil nuevo trae los valores por defecto y solo uno queda vigente", async () => {
    const casa = await perfil();
    expect(casa).toMatchObject({
      activo: false,
      ambito: "nadie",
      accion_desconocidos: "permitir",
      retardo_s: 5,
      anuncio_plantilla: "Llamada de {nombre}",
      anuncio_repeticiones: 2,
      whatsapp_activo: true,
      es_activa: true,
    });
    const moto = await perfil({ name: "Moto", conduciendo_activo: true });
    const activa = await call("GET", "/herr-telefono/activa");
    expect(activa.data.perfil.id).toBe(moto.id);
    expect((await call("GET", `/herr-telefono/${casa.id}`)).data.es_activa).toBe(false);

    // Reactivar por PATCH vuelve a dejar uno solo.
    expect((await call("PATCH", `/herr-telefono/${casa.id}`, { es_activa: true })).status).toBe(200);
    expect((await call("GET", "/herr-telefono/activa")).data.perfil.id).toBe(casa.id);
    expect((await call("GET", `/herr-telefono/${moto.id}`)).data.es_activa).toBe(false);
  });

  test("un null del formulario toma el valor por defecto y created_by lo fija el servidor", async () => {
    const casa = await perfil({ retardo_s: null, anuncio_repeticiones: "", ambito: null, activo: null, created_by: "otro@x" });
    expect(casa).toMatchObject({ retardo_s: 5, anuncio_repeticiones: 2, ambito: "nadie", activo: false, created_by: "dev@local" });
    const patch = await call("PATCH", `/herr-telefono/${casa.id}`, { retardo_s: null, created_by: "otro@x" });
    expect(patch.data).toMatchObject({ retardo_s: 5, created_by: "dev@local" });
    const contacto = await call("POST", "/herr-telefono/contactos", { name: "Ana", regla_id: casa.id, modo: null, created_by: "otro@x" });
    expect(contacto.data).toMatchObject({ modo: "seleccionado", clave: "ana", created_by: "dev@local" });
    expect((await call("PATCH", `/herr-telefono/contactos/${contacto.data.id}`, { clave: null })).data.clave).toBe("ana");
    const llamada = await call("POST", "/herr-telefono/llamadas", { decision: "rechazada", fecha_hora: null, origen: null, conduciendo: null });
    expect(llamada.data).toMatchObject({ fecha_hora: llamada.data.created_at, origen: "telefono", conduciendo: false, created_by: "dev@local" });
  });

  test("un null o vacío en una columna NOT NULL sin valor por defecto conserva lo guardado", async () => {
    const llamada = await call("POST", "/herr-telefono/llamadas", {
      decision: "rechazada",
      fecha_hora: "2026-09-27T10:00:00.000Z",
      is_active: null,
    });
    expect(llamada.data.is_active).toBe(true);
    for (const vacio of [null, ""]) {
      const r = await call("PATCH", `/herr-telefono/llamadas/${llamada.data.id}`, {
        fecha_hora: vacio,
        decision: vacio,
        name: vacio,
        is_active: null,
      });
      expect(r.status).toBe(200);
      expect(r.data).toMatchObject({
        fecha_hora: "2026-09-27T10:00:00.000Z",
        decision: "rechazada",
        name: llamada.data.name,
        is_active: true,
      });
    }
    const casa = await perfil({ is_active: null });
    expect(casa.is_active).toBe(true);
    expect((await call("PATCH", `/herr-telefono/${casa.id}`, { name: null, is_active: null })).data).toMatchObject({
      name: "Casa",
      is_active: true,
    });
    const contacto = await call("POST", "/herr-telefono/contactos", { name: "Ana", regla_id: casa.id, is_active: null });
    expect(contacto.data.is_active).toBe(true);
    const editado = await call("PATCH", `/herr-telefono/contactos/${contacto.data.id}`, { regla_id: "", name: null });
    expect(editado.data).toMatchObject({ regla_id: casa.id, name: "Ana" });
  });

  test("ámbito, acción y campos desconocidos se validan", async () => {
    expect((await call("POST", "/herr-telefono", { name: "X", ambito: "marte" })).status).toBe(400);
    expect((await call("POST", "/herr-telefono", { name: "X", accion_desconocidos: "gritar" })).status).toBe(400);
    expect((await call("POST", "/herr-telefono", { name: "X", inventado: 1 })).status).toBe(400);
  });

  test("sin perfil vigente la ruta lo dice y el contestador está apagado", async () => {
    expect((await call("GET", "/herr-telefono/activa")).data).toEqual({ perfil: null, seleccionados: [], rechazados: [] });
    const d = await decidir({ numero: "+525599999999", contacto_conocido: false });
    expect(d).toMatchObject({ accion: "permitir", anunciar: false, silenciar_timbre: false, retardo_s: 5, anuncio_repeticiones: 2 });
  });
});

describe("contactos y llamadas anidados", () => {
  test("los contactos cuelgan del perfil y la ruta /activa los reparte por modo", async () => {
    const casa = await perfil();
    const rafa = await call("POST", "/herr-telefono/contactos", {
      name: "Rafael Muñoz",
      regla_id: casa.id,
      telefono: "+525512345678",
      clave: "k1",
    });
    expect(rafa.status).toBe(201);
    expect(rafa.data.modo).toBe("seleccionado");
    const spam = await call("POST", "/herr-telefono/contactos", { name: "Spam Seguros", regla_id: casa.id, modo: "rechazado" });
    expect(spam.status).toBe(201);
    // Sin clave de la agenda del teléfono, identifica el nombre normalizado.
    expect(spam.data.clave).toBe("spam seguros");
    expect((await call("POST", "/herr-telefono/contactos", { name: "X", regla_id: casa.id, modo: "raro" })).status).toBe(400);
    expect((await call("POST", "/herr-telefono/contactos", { name: "X" })).status).toBe(400);

    const lista = await call("GET", "/herr-telefono/contactos");
    expect(lista.status).toBe(200);
    expect(lista.json.total_elementos).toBe(2);
    expect((await call("GET", `/herr-telefono/contactos/${rafa.data.id}`)).data.name).toBe("Rafael Muñoz");
    expect((await call("PATCH", `/herr-telefono/contactos/${rafa.data.id}`, { modo: "rechazado" })).data.modo).toBe("rechazado");

    const activa = await call("GET", "/herr-telefono/activa");
    expect(activa.data.seleccionados).toHaveLength(0);
    expect(activa.data.rechazados.map((c: { clave: string }) => c.clave).sort()).toEqual(["k1", "spam seguros"]);

    // El CRUD del perfil sigue respondiendo por id: el sub-recurso no lo pisa.
    expect((await call("GET", `/herr-telefono/${casa.id}`)).status).toBe(200);
    expect((await call("GET", "/herr-telefono/contactos?as=options")).data[0]).toHaveProperty("label");
  });

  test("Android registra una llamada sin nombre y el registro lo compone", async () => {
    const r = await call("POST", "/herr-telefono/llamadas", { numero: "+525599999999", decision: "rechazada" });
    expect(r.status).toBe(201);
    expect(r.data).toMatchObject({ name: "rechazada · +525599999999", origen: "telefono", conduciendo: false });
    expect(typeof r.data.fecha_hora).toBe("string");
    expect((await call("POST", "/herr-telefono/llamadas", { decision: "quemada" })).status).toBe(400);
    const lista = await call("GET", "/herr-telefono/llamadas");
    expect(lista.json.total_elementos).toBe(1);
  });
});

describe("decidir", () => {
  test("aplica las cuatro reglas en orden y registra cada llamada", async () => {
    const casa = await perfil({ activo: true, ambito: "seleccionados", accion_desconocidos: "silenciar", retardo_s: 8 });
    await call("POST", "/herr-telefono/contactos", { name: "Rafael", regla_id: casa.id, clave: "k1", modo: "seleccionado" });
    await call("POST", "/herr-telefono/contactos", { name: "Spam", regla_id: casa.id, clave: "k9", modo: "rechazado" });

    // 1. Rechazado siempre se rechaza.
    expect((await decidir({ contacto_conocido: true, contacto_clave: "k9", contacto_nombre: "Spam" })).accion).toBe("rechazar");
    // 2. Desconocido según la acción configurada.
    const desconocido = await decidir({ numero: "+525599999999", contacto_conocido: false });
    expect(desconocido).toMatchObject({ accion: "silenciar", anunciar: true, silenciar_timbre: true, retardo_s: 8 });
    expect(desconocido.texto_anuncio).toBe("Llamada de +525599999999");
    // 4. Encendido: se descuelga según el ámbito con el timbre callado.
    const elegido = await decidir({ contacto_conocido: true, contacto_clave: "k1", contacto_nombre: "Rafael" });
    expect(elegido).toMatchObject({ accion: "contestar", anunciar: true, silenciar_timbre: true });
    expect(elegido.texto_anuncio).toBe("Llamada de Rafael");
    const otro = await decidir({ contacto_conocido: true, contacto_clave: "k2", contacto_nombre: "Luisa", origen: "whatsapp" });
    expect(otro).toMatchObject({ accion: "permitir", anunciar: true, silenciar_timbre: true });
    expect(otro.texto_anuncio).toBe("Llamada de WhatsApp de Luisa");

    // 3. Apagado: todo suena, salvo los rechazados.
    await call("PATCH", `/herr-telefono/${casa.id}`, { activo: false });
    expect(await decidir({ contacto_conocido: true, contacto_clave: "k1" })).toMatchObject({ accion: "permitir", anunciar: false, silenciar_timbre: false });
    expect((await decidir({ contacto_conocido: true, contacto_clave: "k9" })).accion).toBe("rechazar");

    const llamadas = await call("GET", "/herr-telefono/llamadas");
    expect(llamadas.json.total_elementos).toBe(6);
    const nombres = llamadas.data.map((l: { name: string }) => l.name).sort();
    expect(nombres).toContain("rechazada · Spam");
    expect(nombres).toContain("silenciada · +525599999999");
    expect(nombres).toContain("contestada · Rafael");
    expect(llamadas.data.find((l: { origen: string }) => l.origen === "whatsapp").contacto_nombre).toBe("Luisa");
  });

  test("un contacto dado de alta sin clave se reconoce por su nombre o por su teléfono", async () => {
    const casa = await perfil({ activo: true, ambito: "seleccionados", retardo_s: 200, anuncio_repeticiones: 3 });
    await call("POST", "/herr-telefono/contactos", { name: "Spam Seguros", regla_id: casa.id, modo: "rechazado" });
    await call("POST", "/herr-telefono/contactos", { name: "Mamá", regla_id: casa.id, telefono: "+52 1 55 1234 5678" });

    expect((await decidir({ contacto_conocido: true, contacto_nombre: "Spam Seguros" })).accion).toBe("rechazar");
    // La clave de Android no casa, pero el nombre sí.
    expect((await decidir({ contacto_conocido: true, contacto_clave: "k9", contacto_nombre: "spam  seguros" })).accion).toBe("rechazar");
    expect((await decidir({ contacto_nombre: "Spam Seguros", origen: "whatsapp" })).accion).toBe("rechazar");

    const mama = await decidir({ contacto_conocido: true, contacto_nombre: "Mamá" });
    expect(mama).toMatchObject({ accion: "contestar", retardo_s: 60, anuncio_repeticiones: 3 });
    expect((await decidir({ numero: "5512345678", contacto_conocido: false })).accion).toBe("contestar");
    expect((await decidir({ numero: "5500000000", contacto_conocido: false })).accion).toBe("permitir");
  });

  test("conduciendo fuerza el contestador y rechaza desconocidos solo si el perfil lo tiene activado", async () => {
    const casa = await perfil({ activo: false, ambito: "contactos", conduciendo_activo: true });
    const en_marcha = await decidir({ numero: "+525599999999", contacto_conocido: false, conduciendo: true });
    expect(en_marcha.accion).toBe("rechazar");
    expect((await decidir({ contacto_conocido: true, contacto_clave: "k1", contacto_nombre: "Rafa", conduciendo: true })).accion).toBe("contestar");
    // Parado, el perfil sigue apagado y sin tocar.
    expect((await decidir({ numero: "+525599999999", contacto_conocido: false })).accion).toBe("permitir");
    expect((await call("GET", `/herr-telefono/${casa.id}`)).data.activo).toBe(false);

    await call("PATCH", `/herr-telefono/${casa.id}`, { conduciendo_activo: false });
    expect((await decidir({ numero: "+525599999999", contacto_conocido: false, conduciendo: true })).accion).toBe("permitir");
    const registradas = (await call("GET", "/herr-telefono/llamadas")).data as Array<{ conduciendo: boolean }>;
    expect(registradas.filter((l) => l.conduciendo)).toHaveLength(3);
  });
});

describe("páginas", () => {
  test("las cuatro páginas se arman y la del teléfono lista las últimas llamadas", async () => {
    for (const id of ["herramientas.herr-telefono", "herramientas.herr-telefono-contactos", "herramientas.herr-telefono-llamadas"]) {
      const res = await server.fetch(new Request(`http://t/pages/${id}`));
      expect(res.status).toBe(200);
      expect(((await res.json()) as { page: { component: string } }).page.component).toBe("nox.feature-shell");
    }
    await perfil();
    await call("POST", "/herr-telefono/llamadas", { numero: "+525599999999", decision: "rechazada" });
    const res = await server.fetch(new Request("http://t/pages/herramientas.herr-telefono-android"));
    expect(res.status).toBe(200);
    const doc = (await res.json()) as { page: { children: Array<{ component: string; props?: { rows?: unknown[] } }> } };
    const componentes = doc.page.children.map((c) => c.component);
    expect(componentes).toEqual(["nox.alert", "nox.markdown-view", "nox.link", "nox.table"]);
    expect(doc.page.children[3]!.props!.rows).toHaveLength(1);
  });
});
