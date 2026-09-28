import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  create_kirlet_test_context,
  define_module,
  define_subject,
  validate_page_descriptor_renderable,
  type KirletColumnDecl,
  type KirletServer,
  type KirletTableDecl,
} from "@opus-perpetuus/imperium-core-kit";
import { herr_voz_module } from "./herr-voz.routes.ts";

/**
 * Las tablas de Reparto las crean otros módulos; aquí se declaran con las
 * columnas del contrato como módulo mínimo de prueba.
 */
const BASE: KirletColumnDecl[] = [
  { name: "id", type: "text", primaryKey: true },
  { name: "name", type: "text", notNull: true },
  { name: "description", type: "text" },
  { name: "is_active", type: "boolean", notNull: true, default: true },
  { name: "ref", type: "text" },
  { name: "search_field", type: "text" },
  { name: "created_by", type: "text" },
  { name: "custom_data", type: "json" },
  { name: "payload", type: "json" },
  { name: "created_at", type: "text", notNull: true },
  { name: "updated_at", type: "text", notNull: true },
];

const tabla = (name: string, columnas: Array<[string, KirletColumnDecl["type"]]>): KirletTableDecl => ({
  name,
  columns: [...BASE, ...columnas.map(([n, type]) => ({ name: n, type }))],
});

const reparto_prueba = define_module({
  resource: "herr-reparto-prueba",
  labels: { singular: "Reparto de prueba", plural: "Reparto de prueba" },
  routes: [],
  menu: [],
  tables: [
    tabla("herr_jornadas", [
      ["fecha", "text"], ["hora_inicio", "text"], ["hora_fin", "text"], ["vehiculo_id", "text"],
      ["vehiculo_nombre", "text"], ["estado", "text"], ["km_inicial", "real"], ["km_final", "real"],
      ["km_gps", "real"], ["entregas", "integer"], ["ingreso", "real"], ["ruta_id", "text"], ["tramos", "json"],
    ]),
    tabla("herr_pedidos", [
      ["fecha", "text"], ["hora", "text"], ["orden", "integer"], ["cobrar", "real"], ["recibido", "real"],
      ["propina", "real"], ["domicilio_texto", "text"], ["domicilio_id", "text"], ["contacto_nombre", "text"],
      ["telefono", "text"], ["detalle", "text"], ["productos", "text"], ["productos_json", "json"],
      ["jornada_id", "text"], ["cobrado", "boolean"], ["estado", "text"], ["hora_surtido", "text"],
      ["hora_entrega", "text"], ["liquidacion", "text"],
    ]),
    tabla("herr_gastos", [
      ["fecha", "text"], ["hora", "text"], ["motivo", "text"], ["cantidad", "real"], ["fuente", "text"],
      ["jornada_id", "text"], ["descontado", "boolean"],
    ]),
    tabla("herr_caja", [
      ["fecha", "text"], ["hora", "text"], ["tipo", "text"], ["cantidad", "real"], ["motivo", "text"],
      ["jornada_id", "text"], ["saldado", "boolean"],
    ]),
    tabla("herr_recargas", [
      ["vehiculo_id", "text"], ["fecha_hora", "text"], ["km", "real"], ["pesos", "real"],
      ["precio_litro", "real"], ["litros", "real"], ["jornada_id", "text"],
    ]),
    // Ajustes de reparto por vehículo: `vehiculo_id` apunta al `vehicle` de la app Vehículos.
    tabla("herr_vehiculos", [["vehiculo_id", "text"], ["solo_gps", "boolean"]]),
    tabla("herr_domicilios", [["lat", "real"], ["lon", "real"], ["veces", "integer"]]),
  ],
});

const SUBJECT = define_subject({
  id: "SUBJECT-herramientas",
  name: "Herramientas",
  compat: { nox: ">=0.5.0", kit: "^0.5.0" },
  modules: [herr_voz_module, reparto_prueba],
});

let server: KirletServer;

beforeEach(async () => {
  server = create_kirlet_test_context(SUBJECT);
  await server.data.insert("herr_vehiculos", {
    id: "ajuste-1",
    vehiculo_id: "vehicle_ext_1",
    name: "Italika",
    is_active: true,
    solo_gps: false,
    created_at: "t",
    updated_at: "t",
  });
});
afterEach(() => server.stop());

type Respuesta = { status: number; data: Record<string, unknown>; message?: string };

async function post(path: string, body: unknown): Promise<Respuesta> {
  const res = await server.fetch(
    new Request(`http://t${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
  const json = (await res.json()) as { data?: Record<string, unknown>; message?: string };
  return { status: res.status, data: json.data ?? {}, message: json.message };
}

async function get(path: string): Promise<{ status: number; body: Record<string, unknown> }> {
  const res = await server.fetch(new Request(`http://t${path}`));
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

const bitacora = async () =>
  (await get("/herr-voz/bitacora")).body.data as Array<Record<string, unknown>>;

const ejecutar = (texto: string, extra: Record<string, unknown> = {}) =>
  post("/herr-voz/ejecutar", { texto, confirmado: true, ...extra });

describe("POST /herr-voz/interpretar", () => {
  test("devuelve intención, datos y alternativas, y anota la bitácora", async () => {
    const r = await post("/herr-voz/interpretar", { texto: "anota un pedido de 250 en la calle 5" });
    expect(r.status).toBe(200);
    expect(r.data.intencion).toBe("pedido_registrar");
    expect(r.data.ambiguo).toBe(false);
    expect(r.data.confianza).toBeGreaterThanOrEqual(0.55);
    expect(r.data.datos).toMatchObject({ cantidad: "250", domicilio: "calle 5" });
    expect(Array.isArray(r.data.alternativas)).toBe(true);
    expect(r.data.estado).toBe("interpretado");
    expect(r.message).toBe("Entendí: registrar pedido.");

    const filas = await bitacora();
    expect(filas).toHaveLength(1);
    expect(filas[0]).toMatchObject({
      name: "anota un pedido de 250 en la calle 5",
      intencion: "pedido_registrar",
      estado: "interpretado",
    });
    expect(await server.data.count("herr_pedidos")).toBe(0);
  });

  test("lo que no se entiende queda como no_entendido; la activación sola pide la orden", async () => {
    const r = await post("/herr-voz/interpretar", { texto: "haz un café" });
    expect(r.data.intencion).toBeNull();
    expect(r.data.estado).toBe("no_entendido");
    const saludo = await post("/herr-voz/interpretar", { texto: "hola imperium" });
    expect(saludo.data.respuesta).toBe("Te escucho. ¿Qué hago?");
    expect((await bitacora()).map((f) => f.estado)).toEqual(["no_entendido", "no_entendido"]);
  });

  test("la frase de activación se quita antes de interpretar", async () => {
    const r = await post("/herr-voz/interpretar", { texto: "Oye Imperium, cuánto llevo hoy" });
    expect(r.data.intencion).toBe("consulta_hoy");
  });

  test("sin texto es 400", async () => {
    expect((await post("/herr-voz/interpretar", {})).status).toBe(400);
  });
});

describe("POST /herr-voz/ejecutar", () => {
  test("sin confirmar, lo que escribe queda pendiente de confirmación", async () => {
    const r = await post("/herr-voz/ejecutar", { texto: "iniciar jornada" });
    expect(r.data.estado).toBe("pendiente_confirmacion");
    expect(r.data.intencion).toBe("jornada_iniciar");
    expect(r.data.respuesta).toBe("Inicio la jornada. ¿Confirmas?");
    expect(await server.data.count("herr_jornadas")).toBe(0);
    expect((await bitacora())[0]?.estado).toBe("pendiente_confirmacion");

    // La confirmación reenvía intención y datos, sin volver a interpretar.
    const ok = await post("/herr-voz/ejecutar", { intencion: "jornada_iniciar", datos: r.data.datos, confirmado: true });
    expect(ok.data.estado).toBe("ejecutado");
    expect(await server.data.count("herr_jornadas", { estado: "abierta" })).toBe(1);
  });

  test("una consulta no pide confirmación", async () => {
    const r = await post("/herr-voz/ejecutar", { texto: "cuánto llevo hoy" });
    expect(r.data.estado).toBe("ejecutado");
    expect(r.data.respuesta).toBe("Hoy no hay jornada ni movimientos.");
  });

  test("el perfil puede apagar la confirmación y acotar las órdenes", async () => {
    await post("/herr-voz", {
      name: "Sin confirmar",
      confirmar_antes: false,
      intenciones_activas: ["consulta_hoy", "jornada_iniciar"],
      umbral: 0.6,
    });
    expect((await post("/herr-voz/ejecutar", { texto: "iniciar jornada" })).data.estado).toBe("ejecutado");
    const fuera = await post("/herr-voz/ejecutar", { texto: "anota un pedido de 250 en la calle 5" });
    expect(fuera.data.estado).toBe("no_entendido");
  });

  test("flujo de un día: jornada, pedido, gasto, cambio, entrega, consulta, cobro y cierre", async () => {
    expect((await ejecutar("iniciar jornada")).data.respuesta).toBe("Jornada iniciada con Italika.");

    const pedido = await ejecutar("anota un pedido de 250 en la calle 5");
    expect(pedido.data.estado).toBe("ejecutado");
    expect(pedido.message).toBe("Pedido registrado por 250 pesos en calle 5.");
    const fila = (await server.data.findMany("herr_pedidos", {}))[0]!;
    expect(fila).toMatchObject({ orden: 1, cobrar: 250, domicilio_texto: "calle 5", estado: "capturado" });

    expect((await ejecutar("saqué de cambio 200")).data.respuesta).toBe(
      "Anotados 200 pesos de cambio de la caja. No cuenta como venta.",
    );
    expect((await server.data.findOne("herr_caja", { tipo: "retiro_cambio" }))?.cantidad).toBe(200);

    expect((await ejecutar("entregado, recibí doscientos cincuenta")).data.respuesta).toBe("Entregado calle 5. No queda ninguno.");
    expect(await server.data.findOne("herr_pedidos", { id: String(fila.id) })).toMatchObject({ estado: "entregado", recibido: 250 });

    expect((await ejecutar("gasté 80 pesos de refacciones")).data.respuesta).toBe("Gasto de 80 pesos registrado.");
    expect((await server.data.findOne("herr_gastos", { motivo: "refacciones" }))?.cantidad).toBe(80);

    const hoy = await ejecutar("cuánto llevo hoy");
    expect(hoy.data.respuesta).toBe("Hoy, con la jornada abierta, a caja irían 170 pesos, propinas 0, 1 pedidos cobrables.");

    expect((await ejecutar("entregar el cobro")).data.respuesta).toBe(
      "Cobro entregado. Entregas 170 pesos. Conservas 200 pesos de cambio.",
    );
    expect((await server.data.findOne("herr_pedidos", { id: String(fila.id) }))?.cobrado).toBe(true);
    expect((await server.data.findOne("herr_caja", { tipo: "retiro_cambio" }))?.saldado).toBe(false);

    const cambio = await ejecutar("entregué el cobro y devuelvo el cambio");
    expect(cambio.data.datos).toMatchObject({ devolver_cambio: "true" });
    expect(cambio.data.respuesta).toBe("Cobro entregado. Entregas 200 pesos.");
    expect((await server.data.findOne("herr_caja", { tipo: "retiro_cambio" }))?.saldado).toBe(true);

    const fin = await ejecutar("terminar jornada");
    expect(fin.data.respuesta).toBe("Jornada terminada.");
    const jornada = (await server.data.findMany("herr_jornadas", {}))[0]!;
    expect(jornada).toMatchObject({ estado: "cerrada", entregas: 1, ingreso: 250, vehiculo_id: "vehicle_ext_1" });

    const filas = await bitacora();
    expect(filas.map((f) => f.estado)).toEqual(new Array(filas.length).fill("ejecutado"));
    expect(filas.map((f) => f.intencion)).toContain("caja_retiro");
  });

  test("«entregado» fija el pedido al preguntar; si ya no está abierto, el «sí» no marca otro", async () => {
    await ejecutar("iniciar jornada");
    await ejecutar("anota un pedido de cien en morelos 45");
    await ejecutar("anota un pedido de doscientos en juárez 10");
    const a = await server.data.findOne("herr_pedidos", { domicilio_texto: "morelos 45" });
    const r = await post("/herr-voz/ejecutar", { texto: "entregado" });
    expect(r.data.estado).toBe("pendiente_confirmacion");
    expect(r.data.respuesta).toBe("Marco entregado morelos 45. ¿Confirmas?");
    expect(r.data.datos).toMatchObject({ pedido_id: String(a!.id) });
    await server.data.update("herr_pedidos", { id: String(a!.id) }, { estado: "entregado" });
    const ok = await post("/herr-voz/ejecutar", { intencion: "entrega_registrar", datos: r.data.datos, confirmado: true });
    expect(ok.data.respuesta).toBe("No encontré ese pedido.");
    expect((await server.data.findOne("herr_pedidos", { domicilio_texto: "juarez 10" }))?.estado).toBe("capturado");
  });

  test("un fallo de dominio se contesta en voz y queda como error", async () => {
    const r = await ejecutar("anota un pedido de 250 en la calle 5");
    expect(r.status).toBe(200);
    expect(r.data.estado).toBe("error");
    expect(r.data.respuesta).toBe("No hay jornada en curso.");
    expect((await bitacora())[0]?.estado).toBe("error");
  });

  test("el formulario de la página manda «orden» y la casilla: sin marcar pregunta, marcada ejecuta", async () => {
    const r = await post("/herr-voz/ejecutar", { orden: "cuántos pedidos llevo", confirmado: false });
    expect(r.data.estado).toBe("ejecutado");
    expect(r.data.respuesta).toBe("Llevas 0 pedidos.");
    const pregunta = await post("/herr-voz/ejecutar", { orden: "iniciar jornada", confirmado: false });
    expect(pregunta.data.estado).toBe("pendiente_confirmacion");
    expect(pregunta.message).toBe("Inicio la jornada. ¿Confirmas?");
    expect(await server.data.count("herr_jornadas")).toBe(0);
    expect((await post("/herr-voz/ejecutar", { orden: "iniciar jornada", confirmado: true })).data.estado).toBe("ejecutado");
  });

  test("intención inválida sin texto es 400", async () => {
    expect((await post("/herr-voz/ejecutar", { intencion: "volar" })).status).toBe(400);
  });
});

describe("CRUD y páginas", () => {
  test("ajustes: solo un perfil activo y el umbral acotado", async () => {
    const a = await post("/herr-voz", { name: "A", umbral: 3 });
    expect(a.status).toBe(201);
    expect(a.data.umbral).toBe(1);
    expect(a.data.es_activa).toBe(true);
    const b = await post("/herr-voz", { name: "B", es_activa: true });
    expect(b.status).toBe(201);
    expect((await server.data.findOne("herr_voz", { id: String(a.data.id) }))?.es_activa).toBe(false);
    const lista = await get("/herr-voz");
    expect((lista.body.data as unknown[]).length).toBe(2);
  });

  test("bitácora: lista y detalle como sub-recurso", async () => {
    await post("/herr-voz/interpretar", { texto: "terminar jornada" });
    const lista = await get("/herr-voz/bitacora");
    expect(lista.status).toBe(200);
    const filas = lista.body.data as Array<Record<string, unknown>>;
    expect(filas).toHaveLength(1);
    const detalle = await get(`/herr-voz/bitacora/${filas[0]!.id}`);
    expect(detalle.status).toBe(200);
    expect((detalle.body.data as Record<string, unknown>).intencion).toBe("jornada_terminar");
  });

  test("las tres páginas se sirven y son renderizables", async () => {
    for (const id of ["herramientas.herr-voz", "herramientas.herr-voz-bitacora", "herramientas.herr-asistente"]) {
      const r = await get(`/pages/${id}`);
      expect(r.status).toBe(200);
      expect(validate_page_descriptor_renderable(r.body).ok).toBe(true);
    }
  });

  test("la página del asistente lleva el aviso, el formulario y las últimas 15 órdenes", async () => {
    for (let i = 0; i < 17; i++) await post("/herr-voz/interpretar", { texto: `orden ${i} cuánto llevo hoy` });
    const r = await get("/pages/herramientas.herr-asistente");
    const page = r.body.page as { children: Array<{ component: string; props: Record<string, unknown>; children?: unknown[] }> };
    expect(page.children.map((c) => c.component)).toEqual(["nox.alert", "nox.form", "nox.table"]);
    const form = page.children[1]!;
    expect(form.props.invoke).toEqual({ method: "POST", action: "api://herr-voz/ejecutar" });
    // Sin `confirmado` fijo: lo que escribe primero se pregunta y se confirma marcando la casilla.
    expect(form.props.body).toBeUndefined();
    const campos = form.children as Array<{ component: string; props?: { name?: string; value?: unknown } }>;
    expect(campos[0]).toMatchObject({ component: "nox.input-text", props: { name: "orden" } });
    expect(campos[1]).toMatchObject({ component: "nox.input-checkbox", props: { name: "confirmado", value: false } });
    const rows = page.children[2]!.props.rows as Array<Record<string, unknown>>;
    expect(rows).toHaveLength(15);
    expect(rows[0]).toMatchObject({ texto: "orden 16 cuánto llevo hoy", intencion: "consulta_hoy", estado: "interpretado" });
    expect(Object.keys(rows[0]!)).toEqual(["texto", "intencion", "respuesta", "estado"]);
  });

  test("el manifiesto expone permisos, páginas y menú del módulo", () => {
    const m = SUBJECT.manifest();
    expect(m.permissions?.map((p) => p.id)).toContain("subject.herramientas.herr-voz.read");
    expect(m.pages?.map((p) => p.path)).toEqual(
      expect.arrayContaining(["herr-voz", "herr-asistente", "herr-voz-bitacora"]),
    );
    expect(m.menu?.map((i) => i.id)).toEqual(
      expect.arrayContaining(["herramientas.herr-voz", "herramientas.herr-asistente", "herramientas.herr-voz-bitacora"]),
    );
  });
});
