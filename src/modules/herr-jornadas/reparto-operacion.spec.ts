import { afterAll, describe, expect, test } from "bun:test";
import {
  MemoryKirletDataClient,
  assert_kirlet_conformance,
  create_kirlet_test_context,
  define_subject,
  validate_page_descriptor_renderable,
  type DomainRow,
} from "@opus-perpetuus/imperium-core-kit";
import { join } from "node:path";
import { herr_caja_module } from "../herr-caja/herr-caja.routes.ts";
import { herr_gastos_module } from "../herr-gastos/herr-gastos.routes.ts";
import { herr_menu_categorias_module } from "../herr-menu-categorias/herr-menu-categorias.routes.ts";
import { herr_menu_complementos_module } from "../herr-menu-complementos/herr-menu-complementos.routes.ts";
import { herr_menu_extras_module } from "../herr-menu-extras/herr-menu-extras.routes.ts";
import { herr_menu_productos_module } from "../herr-menu-productos/herr-menu-productos.routes.ts";
import { herr_menu_promos_module } from "../herr-menu-promos/herr-menu-promos.routes.ts";
import { herr_menu_tamanos_module } from "../herr-menu-tamanos/herr-menu-tamanos.routes.ts";
import { herr_pedidos_module } from "../herr-pedidos/herr-pedidos.routes.ts";
import { herr_jornadas_module } from "./herr-jornadas.routes.ts";

/**
 * La parte operativa de «Reparto a domicilio» de punta a punta por HTTP:
 * catálogo → cotización → jornada → pedidos → gastos y caja → liquidación.
 * Las tablas del otro agente (vehículos, domicilios, rutas) se siembran
 * directo en memoria: aquí solo se leen.
 */
const SUBJECT = define_subject({
  id: "SUBJECT-herramientas",
  name: "Herramientas",
  version: "0.0.0",
  compat: { nox: ">=0.5.0", kit: "^0.5.0" },
  storage_files: true,
  modules: [
    herr_jornadas_module,
    herr_pedidos_module,
    herr_gastos_module,
    herr_caja_module,
    herr_menu_categorias_module,
    herr_menu_tamanos_module,
    herr_menu_productos_module,
    herr_menu_extras_module,
    herr_menu_complementos_module,
    herr_menu_promos_module,
  ],
});

const data = new MemoryKirletDataClient(SUBJECT.schema());
// Ajustes de reparto por vehículo externo (`vehiculo_id` = id del `vehicle` de subject-vehiculos).
data.seed("herr_vehiculos", [
  { id: "aj1", vehiculo_id: "v1", name: "Moto roja", tanque_litros: 12, solo_gps: false, is_active: true },
  { id: "aj2", vehiculo_id: "v2", name: "Moto sin velocímetro", tanque_litros: 10, solo_gps: true, is_active: true },
]);
data.seed("herr_domicilios", [{ id: "d1", name: "Casa azul", veces: 2, ultima_entrega: null, is_active: true }]);
const server = create_kirlet_test_context(SUBJECT, { data });
afterAll(() => server.stop());

async function api(method: string, path: string, body?: unknown) {
  const res = await server.fetch(
    new Request(`http://t${path}`, {
      method,
      headers: { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  );
  const text = await res.text();
  const json = text ? JSON.parse(text) : null;
  return { status: res.status, json, data: (json?.data ?? null) as DomainRow };
}

async function por_nombre(tabla: string, name: string): Promise<DomainRow> {
  return (await data.findOne(tabla, { name }))!;
}

const estado: { jornada?: DomainRow; pedido?: DomainRow; pedido2?: DomainRow; gasto?: DomainRow; retiro?: DomainRow; aporte?: DomainRow } = {};

describe("conformance", () => {
  test("layout y manifiesto de los 10 módulos", () => {
    assert_kirlet_conformance({ definition: SUBJECT, src_dir: join(import.meta.dir, "..", "..") });
    const manifest = SUBJECT.manifest();
    const ids = (manifest.pages ?? []).map((p) => p.id);
    expect(ids).toContain("herramientas.herr-jornada");
    expect(ids).toContain("herramientas.herr-liquidacion");
    expect((manifest.menu ?? []).length).toBe(12);
  });
});

describe("catálogo y cotización", () => {
  test("carga el catálogo de ejemplo una sola vez", async () => {
    const r = await api("POST", "/herr-menu-categorias/ejemplo");
    expect(r.status).toBe(201);
    expect(r.data).toEqual({ categorias: 3, tamanos: 4, productos: 8, extras: 1, complementos: 5 });
    expect((await api("POST", "/herr-menu-categorias/ejemplo")).status).toBe(409);
    const lista = await api("GET", "/herr-menu-tamanos");
    expect(lista.json.total_elementos).toBe(4);
    expect(lista.json.data[0].name).toBe("Chica");
  });

  test("cotiza: máximo de las partes + extras, complementos por cantidad, promo con centavos", async () => {
    const grande = await por_nombre("herr_menu_tamanos", "Grande");
    const familiar = await por_nombre("herr_menu_tamanos", "Familiar");
    const hawaiana = await por_nombre("herr_menu_productos", "Hawaiana");
    const mexicana = await por_nombre("herr_menu_productos", "Mexicana");
    const suprema = await por_nombre("herr_menu_productos", "Suprema");
    const orilla = await por_nombre("herr_menu_extras", "Orilla rellena");
    const alitas = (await data.findOne("herr_menu_complementos", { variante: "6 pzas" }))!;

    const q = await api("POST", "/herr-pedidos/cotizar", {
      lineas: [
        { tipo: "producto", tamano_id: grande.id, partes: [hawaiana.id, mexicana.id], extras: [orilla.id] },
        { tipo: "complemento", complemento_id: alitas.id, cantidad: 2 },
      ],
    });
    expect(q.status).toBe(200);
    expect(q.data.total).toBe(295 + 190);
    expect(q.data.problemas).toEqual([]);
    expect(q.data.problemas_catalogo).toEqual([]);
    expect(q.data.productos).toBe("Grande dividida: Hawaiana / Mexicana con orilla rellena\n2 Alitas 6 pzas");

    const promo = await api("POST", "/herr-menu-promos", { name: "30 %", descuento_pct: 30, descuento_pesos: "" });
    expect(promo.status).toBe(201);
    const con_promo = await api("POST", "/herr-pedidos/cotizar", {
      lineas: [{ tipo: "producto", tamano_id: familiar.id, partes: [suprema.id] }],
      promo_id: promo.data.id,
    });
    expect(con_promo.data).toMatchObject({ subtotal: 360, descuento: 108, total: 252 });
  });

  test("un campo desconocido o una columna de precio fuera de rango son 400", async () => {
    expect((await api("POST", "/herr-menu-categorias", { name: "X", columna_precio: 5 })).status).toBe(400);
    expect((await api("POST", "/herr-menu-extras", { name: "X", precio: 1, otro: 2 })).status).toBe(400);
  });
});

describe("jornada y pedidos", () => {
  test("iniciar: una sola abierta, con vehículo y tramo", async () => {
    expect((await api("GET", "/herr-jornadas/activa")).status).toBe(404);
    expect((await api("POST", "/herr-jornadas/iniciar", { fin_programado: "25:99" })).status).toBe(400);
    const r = await api("POST", "/herr-jornadas/iniciar", {
      vehiculo_id: "v1",
      km_inicial: 1000,
      gasolina_inicial: "5/6",
      fin_programado: "22:30",
    });
    expect(r.status).toBe(201);
    estado.jornada = r.data;
    expect(r.data).toMatchObject({
      estado: "abierta",
      vehiculo_id: "v1",
      vehiculo_nombre: "Moto roja",
      km_inicial: 1000,
      km_recorridos: 0,
      solo_gps: false,
      fin_programado: "22:30",
    });
    expect((r.data.tramos as DomainRow[]).length).toBe(1);
    expect(r.data.name).toBe(`Jornada ${r.data.fecha}`);
    expect((await api("GET", "/herr-jornadas/activa")).data.id).toBe(r.data.id);
    expect((await api("POST", "/herr-jornadas/iniciar", {})).status).toBe(409);
  });

  test("crear pedido con productos_json: cobrar y productos rellenos, orden consecutivo", async () => {
    const grande = await por_nombre("herr_menu_tamanos", "Grande");
    const hawaiana = await por_nombre("herr_menu_productos", "Hawaiana");
    const mexicana = await por_nombre("herr_menu_productos", "Mexicana");
    const orilla = await por_nombre("herr_menu_extras", "Orilla rellena");
    const r = await api("POST", "/herr-pedidos", {
      domicilio_texto: "Calle 5 #12",
      domicilio_id: "d1",
      contacto_nombre: "Ana",
      productos_json: { lineas: [{ tipo: "producto", tamano_id: grande.id, partes: [hawaiana.id, mexicana.id], extras: [orilla.id] }] },
    });
    expect(r.status).toBe(201);
    estado.pedido = r.data;
    expect(r.data).toMatchObject({
      orden: 1,
      cobrar: 295,
      propina: 0,
      estado: "capturado",
      cobrado: false,
      productos: "Grande dividida: Hawaiana / Mexicana con orilla rellena",
      name: "Pedido 1 · Calle 5 #12",
      jornada_id: estado.jornada!.id,
    });
    expect(r.data.search_field).toContain("ana");

    // Un recibido en blanco es «en curso», no cero; `cobrar` tecleado manda sobre la cotización.
    const r2 = await api("POST", "/herr-pedidos", {
      domicilio_texto: "Av. Central 9",
      cobrar: 150,
      recibido: "",
      productos_json: { lineas: [{ tipo: "producto", tamano_id: grande.id, partes: [hawaiana.id] }] },
    });
    expect(r2.status).toBe(201);
    estado.pedido2 = r2.data;
    expect(r2.data).toMatchObject({ orden: 2, cobrar: 150, recibido: null, name: "Pedido 2 · Av. Central 9" });
    expect((await api("POST", "/herr-pedidos", { domicilio_texto: "x", estado: "volando" })).status).toBe(400);
  });

  test("editar: un JSON nuevo sin cobrar vuelve a cotizar; con cobrar, manda la mano", async () => {
    const chica = await por_nombre("herr_menu_tamanos", "Chica");
    const queso = await por_nombre("herr_menu_productos", "Queso");
    const json = { lineas: [{ tipo: "producto", tamano_id: chica.id, partes: [queso.id] }] };
    const a = await api("PATCH", `/herr-pedidos/${estado.pedido2!.id}`, { productos_json: json });
    expect(a.data).toMatchObject({ cobrar: 110, productos: "Chica Queso" });
    const b = await api("PATCH", `/herr-pedidos/${estado.pedido2!.id}`, { productos_json: json, cobrar: 120 });
    expect(b.data.cobrar).toBe(120);
    expect((await api("PATCH", `/herr-pedidos/${estado.pedido2!.id}`, { recibido: "" })).data.recibido).toBeNull();
    // Un JSON roto (el editor manda texto) no toca la prosa ni el precio: «si se borra, no pasa nada».
    const roto = await api("PATCH", `/herr-pedidos/${estado.pedido2!.id}`, { productos_json: "{no json" });
    expect(roto.status).toBe(200);
    expect(roto.data).toMatchObject({ productos: "Chica Queso", cobrar: 120, propina: 0 });
  });

  test("surtir → en ruta → entregar con recibido; el domicilio recuerda la visita", async () => {
    const id = estado.pedido!.id;
    const s = await api("POST", `/herr-pedidos/${id}/surtir`);
    expect(s.status).toBe(200);
    expect(s.data.estado).toBe("surtido");
    expect(s.data.hora_surtido).toMatch(/^\d{2}:\d{2}$/);
    expect((await api("POST", `/herr-pedidos/${id}/en-ruta`)).data.estado).toBe("en_ruta");
    const e = await api("POST", `/herr-pedidos/${id}/entregar`, { recibido: 300 });
    expect(e.data).toMatchObject({ estado: "entregado", recibido: 300, propina: 5 });
    expect(e.data.hora_entrega).toMatch(/^\d{2}:\d{2}$/);
    const domicilio = (await data.findOne("herr_domicilios", { id: "d1" }))!;
    expect(domicilio.veces).toBe(3);
    expect(domicilio.ultima_entrega).toBeTruthy();
    expect((await api("POST", `/herr-pedidos/${estado.pedido2!.id}/entregar`, { recibido: -1 })).status).toBe(400);
  });
});

describe("gastos y caja", () => {
  test("un gasto de cobros no puede superar el disponible; uno de caja nace descontado", async () => {
    const g = await api("POST", "/herr-gastos", { motivo: "Gasolina", cantidad: 100 });
    expect(g.status).toBe(201);
    estado.gasto = g.data;
    expect(g.data).toMatchObject({ name: "Gasolina", fuente: "cobros", descontado: false, jornada_id: estado.jornada!.id });
    const grande = await api("POST", "/herr-gastos", { motivo: "Llanta", cantidad: 500 });
    expect(grande.status).toBe(400);
    expect(grande.json.message).toBe("No hay dinero de cobros para cubrirlo");
    const caja = await api("POST", "/herr-gastos", { motivo: "Aceite", cantidad: 80, fuente: "caja" });
    expect(caja.data.descontado).toBe(true);
    expect((await api("POST", "/herr-gastos", { motivo: "x", cantidad: 1, fuente: "banco" })).status).toBe(400);
  });

  test("movimientos de caja: retiro y aporte", async () => {
    const retiro = await api("POST", "/herr-caja", { tipo: "retiro_cambio", cantidad: 200 });
    expect(retiro.status).toBe(201);
    estado.retiro = retiro.data;
    expect(retiro.data).toMatchObject({ name: "Retiro para cambio", saldado: false, jornada_id: estado.jornada!.id });
    const aporte = await api("POST", "/herr-caja", { tipo: "aporte_propio", cantidad: 30, motivo: "Completé un cambio" });
    estado.aporte = aporte.data;
    expect(aporte.data.name).toBe("Completé un cambio");
    expect((await api("POST", "/herr-caja", { tipo: "prestamo", cantidad: 5 })).status).toBe(400);
  });
});

describe("liquidación", () => {
  test("la vista previa trae los números del cierre", async () => {
    const r = await api("GET", `/herr-jornadas/${estado.jornada!.id}/liquidacion`);
    expect(r.status).toBe(200);
    expect(r.data).toMatchObject({
      a_caja: 195,
      propinas: 5,
      faltante: 0,
      gastos_sin_cubrir: 0,
      en_curso: 1,
      cambio_de_caja: 200,
      me_debe_caja: 30,
      neto: 365,
      disponible: 195,
      efectivo_en_mano: 395,
      nada_que_cobrar: false,
      pedidos_de_hoy: { registros: 1, total: 295, fechas: [] },
    });
    expect(r.data.pedidos).toBeUndefined();
  });

  test("liquidar estampa pedidos, gastos y aportes; el cambio solo si se pide", async () => {
    const r = await api("POST", `/herr-jornadas/${estado.jornada!.id}/liquidar`, {});
    expect(r.status).toBe(200);
    const marca = String(r.data.sello);
    expect(marca).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
    const pedido = (await api("GET", `/herr-pedidos/${estado.pedido!.id}`)).data;
    expect(pedido).toMatchObject({ cobrado: true, estado: "cobrado", liquidacion: marca });
    expect((await api("GET", `/herr-gastos/${estado.gasto!.id}`)).data).toMatchObject({ descontado: true, liquidacion: marca });
    expect((await api("GET", `/herr-caja/${estado.aporte!.id}`)).data).toMatchObject({ saldado: true, liquidacion: marca });
    expect((await api("GET", `/herr-caja/${estado.retiro!.id}`)).data.saldado).toBe(false);
    expect((await api("POST", `/herr-pedidos/${estado.pedido!.id}/entregar`)).status).toBe(409);

    const otra = await api("POST", `/herr-jornadas/${estado.jornada!.id}/liquidar`, { devolver_cambio: true });
    expect(otra.data).toMatchObject({ a_caja: 0, cambio_de_caja: 200, neto: 200 });
    expect((await api("GET", `/herr-caja/${estado.retiro!.id}`)).data.saldado).toBe(true);
    const nada = await api("POST", `/herr-jornadas/${estado.jornada!.id}/liquidar`, {});
    expect(nada.data).toMatchObject({ nada_que_cobrar: true, sello: null });
  });
});

describe("cierre de jornada y vehículos", () => {
  test("terminar calcula km, gasolina, rendimiento y entregas", async () => {
    const r = await api("POST", `/herr-jornadas/${estado.jornada!.id}/terminar`, {
      km_final: 1090,
      gasolina_final: "2/6",
      ingreso: 600,
    });
    expect(r.status).toBe(200);
    expect(r.data).toMatchObject({
      estado: "cerrada",
      km_final: 1090,
      km_recorridos: 90,
      gasolina_usada: 6,
      rendimiento: 15,
      entregas: 1,
      ingreso: 600,
      ganancia_neta: 600,
      por_entrega: 600,
    });
    expect(r.data.hora_fin).toMatch(/^\d{2}:\d{2}$/);
    const tramos = r.data.tramos as DomainRow[];
    expect(tramos[0]).toMatchObject({ km_final: 1090 });
    expect(tramos[0]!.fin).toBeTruthy();
    expect((await api("POST", `/herr-jornadas/${estado.jornada!.id}/terminar`, {})).status).toBe(409);
    expect((await api("GET", "/herr-jornadas/activa")).status).toBe(404);
  });

  test("editar una jornada por CRUD recalcula con la capacidad del vehículo", async () => {
    const r = await api("PATCH", `/herr-jornadas/${estado.jornada!.id}`, { gasto_gasolina: 150, entregas: 12 });
    expect(r.data).toMatchObject({ ganancia_neta: 450, por_entrega: 37.5, gasolina_usada: 6 });
  });

  test("cambiar de vehículo cierra un tramo y abre otro; uno sin velocímetro no pide odómetro", async () => {
    data.seed("herr_rutas", []);
    const nueva = await api("POST", "/herr-jornadas/iniciar", { vehiculo_id: "v1", km_inicial: 1090 });
    expect(nueva.status).toBe(201);
    data.seed("herr_rutas", [{ id: "r1", jornada_id: nueva.data.id, distancia_m: 4200, is_active: true }]);
    const r = await api("POST", `/herr-jornadas/${nueva.data.id}/cambiar-vehiculo`, { vehiculo_id: "v2", km_final: 1100, km_inicial: 500 });
    expect(r.status).toBe(200);
    expect(r.data).toMatchObject({ vehiculo_id: "v2", vehiculo_nombre: "Moto sin velocímetro" });
    const tramos = r.data.tramos as DomainRow[];
    expect(tramos.length).toBe(2);
    expect(tramos[0]).toMatchObject({ vehiculo_id: "v1", km_inicial: 1090, km_final: 1100, gps_m_fin: 4200 });
    expect(tramos[1]).toMatchObject({ vehiculo_id: "v2", km_inicial: null, gps_m_inicio: 4200, fin: null });
    expect((await api("POST", `/herr-jornadas/${nueva.data.id}/cambiar-vehiculo`, {})).status).toBe(400);
    // Un vehículo externo sin fila de ajustes: mide con odómetro y el nombre es el que manda el cliente.
    const prestada = await api("POST", `/herr-jornadas/${nueva.data.id}/cambiar-vehiculo`, {
      vehiculo_id: "v3",
      vehiculo_nombre: "Prestada",
      km_inicial: 300,
    });
    expect(prestada.data).toMatchObject({ vehiculo_id: "v3", vehiculo_nombre: "Prestada" });
    expect((prestada.data.tramos as DomainRow[])[2]).toMatchObject({ vehiculo_id: "v3", km_inicial: 300, gps_m_inicio: 4200 });

    data.seed("herr_rutas", [{ id: "r1", jornada_id: nueva.data.id, distancia_m: 9200, is_active: true }]);
    const fin = await api("POST", `/herr-jornadas/${nueva.data.id}/terminar`, {});
    // Tramo 1 por odómetro (10 km) + tramo 2 por GPS (0 km) + tramo 3 por GPS (5 km).
    expect(fin.data).toMatchObject({ km_gps: 9.2, km_recorridos: 15 });
    estado.jornada = fin.data;
  });
});

describe("páginas", () => {
  test("herr-jornada y herr-liquidacion son descriptores válidos y renderizables", async () => {
    const sin = await server.fetch(new Request("http://t/pages/herramientas.herr-jornada"));
    expect(sin.status).toBe(200);
    const vacia = await sin.json();
    expect(validate_page_descriptor_renderable(vacia).ok).toBe(true);
    expect(JSON.stringify(vacia)).toContain("herr-jornadas/iniciar");

    const con = await server.fetch(new Request(`http://t/pages/herramientas.herr-jornada?id=${estado.jornada!.id}`));
    const jornada = await con.json();
    const check = validate_page_descriptor_renderable(jornada);
    expect(check.ok).toBe(true);
    const texto = JSON.stringify(jornada);
    expect(texto).toContain("nox.stats");
    expect(texto).toContain(`/internal/herr-liquidacion?jornada=${estado.jornada!.id}`);
    // Se mira una jornada cerrada y no hay ninguna abierta: se ofrece iniciar.
    expect(texto).toContain("herr-jornadas/iniciar");

    // Con todo liquidado no hay botón, solo el aviso; con un aporte pendiente, vuelve el botón.
    const liq = await server.fetch(new Request(`http://t/pages/herramientas.herr-liquidacion?jornada=${estado.jornada!.id}`));
    expect(liq.status).toBe(200);
    const sin_nada = await liq.json();
    expect(validate_page_descriptor_renderable(sin_nada).ok).toBe(true);
    expect(JSON.stringify(sin_nada)).toContain("Nada que liquidar");
    await api("POST", "/herr-caja", { tipo: "aporte_propio", cantidad: 25, jornada_id: estado.jornada!.id });
    const con_boton = await (
      await server.fetch(new Request(`http://t/pages/herramientas.herr-liquidacion?jornada=${estado.jornada!.id}`))
    ).json();
    expect(validate_page_descriptor_renderable(con_boton).ok).toBe(true);
    const cuerpo = JSON.stringify(con_boton);
    expect(cuerpo).toContain(`api://herr-jornadas/${estado.jornada!.id}/liquidar`);
    expect(cuerpo).toContain("Te devuelven");

    for (const id of ["herramientas.herr-pedidos", "herramientas.herr-menu-tamanos", "herramientas.herr-caja"]) {
      const shell = await server.fetch(new Request(`http://t/pages/${id}`));
      expect(shell.status).toBe(200);
    }
  });
});
