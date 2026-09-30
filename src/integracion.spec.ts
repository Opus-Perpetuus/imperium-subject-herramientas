import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  create_kirlet_test_context,
  validate_page_descriptor_renderable,
  walk_ui_tree,
  type KirletServer,
  type NoxPageDescriptor,
  type NoxUiNode,
} from "@opus-perpetuus/imperium-core-kit";
import { ESTADOS } from "./lib/pedidos/estado.ts";
import { SUBJECT } from "./subject.ts";

/**
 * Las herramientas de punta a punta sobre el SUBJECT real: lo que una escribe
 * lo lee otra por HTTP (voz → reparto, recargas → gastos, descriptor → captura).
 * Ninguna tabla de juguete: cualquier deriva entre módulos aparece aquí.
 */

// Sin gateway: los nombres de vehículo caen al snapshot aunque el shell traiga el env del núcleo.
delete process.env.CORE_DATA_URL;
delete process.env.NOX_DATA_URL;

const VEHICULO = "veh_ext_1";
const HOY = new Date().toISOString().slice(0, 10);

const COLUMNAS = new Map(SUBJECT.schema().tables.map((t) => [t.name, new Set(t.columns.map((c) => c.name))]));

let server: KirletServer;

beforeEach(() => {
  server = create_kirlet_test_context(SUBJECT);
});
afterEach(() => server.stop());

async function api(method: string, path: string, body?: unknown) {
  const res = await server.fetch(
    new Request(`http://t${path}`, {
      method,
      headers: body === undefined ? {} : { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  );
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { status: res.status, json, data: json.data as any };
}

async function pagina(path: string): Promise<NoxPageDescriptor> {
  const res = await server.fetch(new Request(`http://t${path}`));
  expect(res.status).toBe(200);
  const doc = (await res.json()) as NoxPageDescriptor;
  const ok = validate_page_descriptor_renderable(doc);
  if (!ok.ok) throw new Error(JSON.stringify(ok.issues));
  return doc;
}

function nodos(page: NoxPageDescriptor, prefijo: string): NoxUiNode[] {
  const out: NoxUiNode[] = [];
  walk_ui_tree(page.page, (n) => {
    if (n.component.startsWith(prefijo)) out.push(n);
  });
  return out;
}

/** Claves escritas en la tabla que el esquema no declara: en Postgres serían un 500. */
async function claves_no_declaradas(tabla: string): Promise<string[]> {
  const declaradas = COLUMNAS.get(tabla)!;
  const filas = await server.data.findMany(tabla, {});
  expect(filas.length).toBeGreaterThan(0);
  return [...new Set(filas.flatMap((f) => Object.keys(f).filter((k) => !declaradas.has(k))))];
}

const voz = (texto: string) => api("POST", "/herr-voz/ejecutar", { texto, confirmado: true });

async function ajustes_moto() {
  const r = await api("POST", "/herr-vehiculos", { vehiculo_id: VEHICULO, name: "Moto roja" });
  expect(r.status).toBe(201);
  return r.data as Record<string, unknown>;
}

describe("integración entre herramientas", () => {
  test("1. un día completo por voz sobre las tablas reales de Reparto", async () => {
    await ajustes_moto();

    const inicio = await voz("iniciar jornada con la moto roja");
    expect(inicio.data).toMatchObject({ intencion: "jornada_iniciar", estado: "ejecutado", respuesta: "Jornada iniciada con Moto roja." });
    const jornada_id = String(inicio.data.resultado.jornada_id);
    const activa = await api("GET", "/herr-jornadas/activa");
    expect(activa.status).toBe(200);
    expect(activa.data).toMatchObject({ id: jornada_id, estado: "abierta", vehiculo_id: VEHICULO, vehiculo_nombre: "Moto roja" });

    expect((await voz("anota un pedido de 250 en morelos 45")).data.respuesta).toBe("Pedido registrado por 250 pesos en morelos 45.");
    const pedidos = await api("GET", "/herr-pedidos");
    expect(pedidos.json.total_elementos).toBe(1);
    const pedido = pedidos.data[0];
    expect(ESTADOS).toContain(pedido.estado);
    expect(pedido).toMatchObject({ estado: "capturado", orden: 1, cobrar: 250, cobrado: false, domicilio_texto: "morelos 45", jornada_id });

    expect((await voz("saqué de cambio 200")).data.respuesta).toBe("Anotados 200 pesos de cambio de la caja. No cuenta como venta.");
    expect((await voz("entregado, recibí 250")).data.respuesta).toBe("Entregado morelos 45. No queda ninguno.");
    expect((await api("GET", `/herr-pedidos/${pedido.id}`)).data).toMatchObject({ estado: "entregado", recibido: 250 });
    expect((await voz("gasté 80 pesos de refacciones")).data.respuesta).toBe("Gasto de 80 pesos registrado.");

    expect((await voz("cuánto llevo hoy")).data.respuesta).toBe(
      "Hoy, con la jornada abierta, a caja irían 170 pesos, propinas 0, 1 pedidos cobrables.",
    );
    // La voz dice lo que se entrega sin el fondo de cambio (se conserva salvo que se devuelva); el `neto` lo incluye.
    const vista = await api("GET", `/herr-jornadas/${jornada_id}/liquidacion`);
    expect(vista.status).toBe(200);
    expect(vista.data).toMatchObject({
      a_caja: 170,
      cambio_de_caja: 200,
      me_debe_caja: 0,
      neto: 370,
      propinas: 0,
      faltante: 0,
      en_curso: 0,
      gastos_sin_cubrir: 0,
      disponible: 170,
      efectivo_en_mano: 370,
      nada_que_cobrar: false,
      pedidos_de_hoy: { registros: 1, total: 250, fechas: [] },
      gastos_de_hoy: { registros: 1, total: 80, fechas: [] },
      caja_de_hoy: { registros: 1, total: 200, fechas: [] },
    });

    const liq = await api("POST", `/herr-jornadas/${jornada_id}/liquidar`, { devolver_cambio: true });
    expect(liq.status).toBe(200);
    const sello = String(liq.data.sello);
    expect(sello).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
    expect((await api("GET", `/herr-pedidos/${pedido.id}`)).data).toMatchObject({ cobrado: true, estado: "cobrado", liquidacion: sello });
    const gastos = await api("GET", "/herr-gastos");
    expect(gastos.data).toHaveLength(1);
    expect(gastos.data[0]).toMatchObject({ motivo: "refacciones", cantidad: 80, fuente: "cobros", descontado: true, liquidacion: sello, jornada_id });
    const caja = await api("GET", "/herr-caja");
    expect(caja.data).toHaveLength(1);
    expect(caja.data[0]).toMatchObject({ tipo: "retiro_cambio", cantidad: 200, saldado: true, liquidacion: sello, jornada_id });

    expect((await voz("entregar el cobro")).data.respuesta).toBe("No hay nada que liquidar.");
    expect((await voz("terminar jornada")).data.respuesta).toBe("Jornada terminada.");
    expect((await api("GET", `/herr-jornadas/${jornada_id}`)).data).toMatchObject({ estado: "cerrada", entregas: 1, ingreso: 250, vehiculo_id: VEHICULO });
    expect((await api("GET", "/herr-jornadas/activa")).status).toBe(404);

    for (const tabla of ["herr_jornadas", "herr_pedidos", "herr_gastos", "herr_caja"]) {
      expect(await claves_no_declaradas(tabla)).toEqual([]);
    }
  });

  test("2. recarga → gasto derivado → liquidación; borrar la recarga desactiva el gasto", async () => {
    await ajustes_moto();
    const jornada = await api("POST", "/herr-jornadas/iniciar", { vehiculo_id: VEHICULO });
    expect(jornada.status).toBe(201);
    const jornada_id = String(jornada.data.id);

    const recarga = await api("POST", "/herr-recargas", {
      vehiculo_id: VEHICULO,
      pesos: 200,
      litros: 8,
      fecha_hora: `${HOY}T14:30:00-06:00`,
      jornada_id,
    });
    expect(recarga.status).toBe(201);
    expect(recarga.data).toMatchObject({ name: `Recarga ${HOY} · Moto roja`, litros_efectivos: 8, aproximado: false });

    const gasto_id = `gasto_recarga_${recarga.data.id}`;
    const gasto = await api("GET", `/herr-gastos/${gasto_id}`);
    expect(gasto.status).toBe(200);
    expect(gasto.data).toMatchObject({
      id: gasto_id,
      motivo: "Gasolina · 8 L",
      cantidad: 200,
      fuente: "cobros",
      descontado: false,
      recarga_id: recarga.data.id,
      jornada_id,
      fecha: HOY,
      hora: "14:30",
    });

    const vista = await api("GET", `/herr-jornadas/${jornada_id}/liquidacion`);
    expect(vista.data).toMatchObject({
      gasto_ids: [],
      gastos_sin_cubrir: 200,
      gastos_de_hoy: { registros: 1, total: 200, fechas: [] },
      a_caja: 0,
      nada_que_cobrar: true,
    });
    expect(await claves_no_declaradas("herr_recargas")).toEqual([]);
    expect(await claves_no_declaradas("herr_gastos")).toEqual([]);

    expect((await api("DELETE", `/herr-recargas/${recarga.data.id}`)).status).toBe(200);
    expect((await api("GET", `/herr-gastos/${gasto_id}`)).status).toBe(404);
    expect((await api("GET", `/herr-jornadas/${jornada_id}/liquidacion`)).data.gastos_de_hoy.registros).toBe(0);
  });

  test("3. tabla desde plantilla capturada con el body exacto del formulario dinámico", async () => {
    const plantillas = await api("GET", "/herr-tablas/plantillas");
    expect(plantillas.status).toBe(200);
    const plantilla_id = String(plantillas.data.find((p: { id: string }) => p.id === "jornada_moto").id);
    const tabla = await api("POST", "/herr-tablas/desde-plantilla", { plantilla_id });
    expect(tabla.status).toBe(201);
    const tabla_id = String(tabla.data.id);

    const doc = await pagina(`/pages/herramientas.herr-registro?tabla=${tabla_id}`);
    const [form] = nodos(doc, "nox.form");
    expect(form).toBeDefined();
    const props = form!.props as Record<string, unknown>;
    // Misma regla que `ui-action.ts` del kit: anidado en `invoke` o plano en props.
    const invoke = (props.invoke ?? props) as { method: string; action: string };
    expect(invoke).toMatchObject({ method: "POST", action: "api://herr-registros/captura" });
    const ruta = invoke.action.replace(/^api:\/\//, "/");

    const body: Record<string, unknown> = {};
    for (const input of nodos(doc, "nox.input-")) {
      body[String(input.props!.name)] = input.props!.value ?? "";
    }
    expect(body.tabla_id).toBe(tabla_id);
    expect(body).not.toHaveProperty("km_recorridos");
    Object.assign(body, {
      fecha: "2026-08-07",
      km_inicial: "1180.5",
      km_final: "1310.5",
      gasolina_inicial: "8",
      gasolina_final: "4",
      entregas: "24",
      ingreso: "760",
      gasto_gasolina: "180",
    });

    const captura = await api("POST", ruta, body);
    expect(captura.status).toBe(201);
    expect(captura.data.tabla_id).toBe(tabla_id);
    expect(captura.data.calculados).toEqual({
      km_recorridos: "130.0",
      gasolina_usada: "4.00",
      rendimiento: "32.5",
      ganancia_neta: "580.00",
      por_entrega: "24.17",
    });

    const resumen = await api("GET", `/herr-tablas/${tabla_id}/resumen`);
    expect(resumen.status).toBe(200);
    expect(resumen.data.total_filas).toBe(1);
    expect(resumen.data.agregados.km_recorridos.suma).toBe(130);
    expect(resumen.data.agregados.ingreso.suma).toBe(760);

    const cierre = await api("POST", `/herr-tablas/${tabla_id}/cerrar`);
    expect(cierre.status).toBe(200);
    expect(cierre.data.filas).toBe(1);
    const cierres = await api("GET", "/herr-cierres");
    expect(cierres.data).toHaveLength(1);
    expect(cierres.data[0]).toMatchObject({ tabla_id, cierre_id: cierre.data.cierre_id, name: "2026-08-07" });
    expect(cierres.data[0].valores).toMatchObject({ km_final: "1310.5", km_recorridos: "130.0" });
    expect((await api("GET", `/herr-registros?tabla_id=${tabla_id}`)).data).toHaveLength(0);
  });

  test("4. pedido con precio automático desde el catálogo de ejemplo", async () => {
    expect((await api("POST", "/herr-menu-categorias/ejemplo")).status).toBe(201);
    const por_nombre = async (ruta: string, name: string) => {
      const fila = ((await api("GET", ruta)).data as Array<Record<string, unknown>>).find((f) => f.name === name);
      expect(fila).toBeDefined();
      return String(fila!.id);
    };
    const grande = await por_nombre("/herr-menu-tamanos", "Grande");
    const hawaiana = await por_nombre("/herr-menu-productos", "Hawaiana");
    const mexicana = await por_nombre("/herr-menu-productos", "Mexicana");
    const orilla = await por_nombre("/herr-menu-extras", "Orilla rellena");
    const alitas = ((await api("GET", "/herr-menu-complementos")).data as Array<Record<string, unknown>>).find(
      (c) => c.name === "Alitas" && c.variante === "6 pzas",
    )!;
    const lineas = [
      { tipo: "producto", tamano_id: grande, partes: [hawaiana, mexicana], extras: [orilla] },
      { tipo: "complemento", complemento_id: alitas.id, cantidad: 2 },
    ];

    const cotizacion = await api("POST", "/herr-pedidos/cotizar", { lineas });
    expect(cotizacion.status).toBe(200);
    expect(cotizacion.data).toMatchObject({ total: 485, problemas: [], problemas_catalogo: [] });

    const pedido = await api("POST", "/herr-pedidos", { domicilio_texto: "Calle 5 #12", productos_json: { lineas } });
    expect(pedido.status).toBe(201);
    expect(pedido.data).toMatchObject({
      orden: 1,
      cobrar: 485,
      propina: 0,
      estado: "capturado",
      productos: "Grande dividida: Hawaiana / Mexicana con orilla rellena\n2 Alitas 6 pzas",
    });
    const id = pedido.data.id;
    expect((await api("POST", `/herr-pedidos/${id}/surtir`)).data.estado).toBe("surtido");
    expect((await api("POST", `/herr-pedidos/${id}/en-ruta`)).data.estado).toBe("en_ruta");
    const entrega = await api("POST", `/herr-pedidos/${id}/entregar`, { recibido: 500 });
    expect(entrega.data).toMatchObject({ estado: "entregado", recibido: 500, propina: 15 });
  });

  test("5. teléfono y agenda con el resto de la app cargada", async () => {
    const perfil = await api("POST", "/herr-telefono", { name: "Casa", es_activa: true });
    expect(perfil.status).toBe(201);
    const contacto = await api("POST", "/herr-telefono/contactos", {
      name: "Spam Seguros",
      regla_id: perfil.data.id,
      clave: "k9",
      modo: "rechazado",
    });
    expect(contacto.status).toBe(201);
    expect((await api("GET", "/herr-telefono/activa")).data.rechazados.map((c: { id: string }) => c.id)).toEqual([contacto.data.id]);

    const decision = await api("POST", "/herr-telefono/decidir", { contacto_conocido: true, contacto_clave: "k9", contacto_nombre: "Spam Seguros" });
    expect(decision.status).toBe(200);
    expect(decision.data.accion).toBe("rechazar");
    const llamadas = await api("GET", "/herr-telefono/llamadas");
    expect(llamadas.json.total_elementos).toBe(1);
    expect(llamadas.data[0]).toMatchObject({ id: decision.data.llamada_id, decision: "rechazada", name: "rechazada · Spam Seguros" });

    const evento = await api("POST", "/herr-agenda", { name: "Junta", fecha: HOY, inicio_minuto: 570, recordatorio_min: 30 });
    expect(evento.status).toBe(201);
    expect(typeof evento.data.recordatorio_en).toBe("string");
    const recordatorios = await api("GET", `/herr-agenda/recordatorios?desde=${HOY}&hasta=${HOY}`);
    expect(recordatorios.status).toBe(200);
    expect(recordatorios.data).toHaveLength(1);
    expect(recordatorios.data[0]).toMatchObject({ evento_id: evento.data.id, name: "Junta", recordatorio_en: evento.data.recordatorio_en, alarma: false });
    expect(Number.isFinite(Date.parse(recordatorios.data[0].inicio_en))).toBe(true);
  });

  test("6. utilidades: fórmula con filas y markdown sin sanear", async () => {
    const formula = await api("POST", "/herr-utilidades/formula", {
      formula: 'sumasi({monto}, {tipo} == "venta")',
      filas: [
        { monto: 10, tipo: "venta" },
        { monto: 5, tipo: "gasto" },
        { monto: 7, tipo: "venta" },
      ],
    });
    expect(formula.status).toBe(200);
    expect(formula.data).toMatchObject({ ok: true, valor: 17 });

    const markdown = await api("POST", "/herr-utilidades/markdown", { texto: "# Hola\n\n- [ ] tarea", sanear: false });
    expect(markdown.status).toBe(200);
    expect(markdown.data.html).toContain("<h1");
    expect(markdown.data.html).toContain('<input type="checkbox" disabled>');
    expect(markdown.data.encabezados).toEqual([{ nivel: 1, texto: "Hola", ancla: "hola" }]);
  });

  test("7. portada válida y cada capacidad anunciada existe como ruta", async () => {
    const inicio = await pagina("/pages/herramientas.herr-inicio");
    expect(inicio.id).toBe("herramientas.herr-inicio");
    expect(nodos(inicio, "nox.card").length).toBeGreaterThanOrEqual(6);

    const capacidades = await api("GET", "/herr-utilidades/capacidades");
    expect(capacidades.status).toBe(200);
    expect(capacidades.data.length).toBeGreaterThanOrEqual(10);
    const normal = (patron: string) => patron.replace(/:[a-z_]+/g, ":id");
    const patrones = new Set(SUBJECT.modules.flatMap((m) => m.routes.map((r) => normal(r.pattern))));
    const faltantes = (capacidades.data as Array<{ metodo: string; ruta: string }>)
      .map((c) => `${c.metodo} ${c.ruta}`)
      .filter((ruta) => !patrones.has(normal(ruta)));
    expect(faltantes).toEqual([]);
  });
});
