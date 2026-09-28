import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  MemoryKirletDataClient,
  create_kirlet_test_context,
  define_crud,
  define_module,
  define_subject,
  type DomainRow,
} from "@opus-perpetuus/imperium-core-kit";
import { herr_vehiculos_module } from "./herr-vehiculos.routes.ts";
import { herr_domicilios_module } from "../herr-domicilios/herr-domicilios.routes.ts";
import { herr_etiquetas_module } from "../herr-etiquetas/herr-etiquetas.routes.ts";
import { herr_recargas_module } from "../herr-recargas/herr-recargas.routes.ts";
import { herr_rutas_module } from "../herr-rutas/herr-rutas.routes.ts";
import type { PuntoGps } from "../../lib/rutas/analizador.ts";

/**
 * Módulo mínimo de `herr-gastos` (lo hace otro agente) con las columnas del
 * contrato, para comprobar que una recarga con importe crea su gasto.
 */
const herr_gastos_prueba = define_module({
  resource: "herr-gastos",
  labels: { singular: "Gasto", plural: "Gastos" },
  routes: define_crud({
    resource: "herr-gastos",
    table: "herr_gastos",
    soft_delete: true,
    soft_delete_field: "is_active",
    fields: {
      name: { type: "string", required: true },
      description: { type: "string" },
      is_active: { type: "boolean" },
      motivo: { type: "string" },
      cantidad: { type: "number" },
      fuente: { type: "string" },
      fecha: { type: "string" },
      hora: { type: "string" },
      jornada_id: { type: "string" },
      descontado: { type: "boolean" },
      recarga_id: { type: "string" },
    },
  }),
  tables: [
    {
      name: "herr_gastos",
      columns: [
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
        { name: "motivo", type: "text" },
        { name: "cantidad", type: "real" },
        { name: "fuente", type: "text" },
        { name: "fecha", type: "text" },
        { name: "hora", type: "text" },
        { name: "jornada_id", type: "text" },
        { name: "descontado", type: "boolean" },
        { name: "recarga_id", type: "text" },
      ],
    },
  ],
});

const SUBJECT = define_subject({
  id: "SUBJECT-herramientas",
  name: "Herramientas",
  compat: { nox: ">=0.5.0", kit: "^0.5.0" },
  storage_files: true,
  modules: [
    herr_vehiculos_module,
    herr_domicilios_module,
    herr_etiquetas_module,
    herr_recargas_module,
    herr_rutas_module,
    herr_gastos_prueba,
  ],
});

type Server = ReturnType<typeof create_kirlet_test_context>;
let data: MemoryKirletDataClient;
let server: Server;

async function call(method: string, path: string, body?: unknown) {
  const res = await server.fetch(
    new Request(`http://t${path}`, {
      method,
      headers: body === undefined ? {} : { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  );
  const json = res.status === 204 ? {} : ((await res.json()) as Record<string, unknown>);
  return { status: res.status, json, data: json.data as any };
}

const TS = "2026-09-27T12:00:00.000Z";
const AQUI = { lat: 19.4326, lon: -99.1332 };

/** ~11 m por cada 0.0001 grados de latitud. */
const al_norte = (metros: number) => ({ lat: AQUI.lat + metros / 111_320, lon: AQUI.lon });

async function domicilio(id: string, name: string, metros: number): Promise<DomainRow> {
  return data.insert("herr_domicilios", {
    id, name, is_active: true, ...al_norte(metros), veces: 0, created_at: TS, updated_at: TS,
  });
}

beforeEach(() => {
  // Sin gateway: los nombres de vehículo caen al snapshot/id aunque el shell traiga el env del núcleo.
  delete process.env.CORE_DATA_URL;
  delete process.env.NOX_DATA_URL;
  data = new MemoryKirletDataClient(SUBJECT.schema());
  server = create_kirlet_test_context(SUBJECT, { data });
});

afterEach(() => server.stop());

describe("manifiesto y páginas", () => {
  test("los cinco módulos publican menú, permisos y páginas válidas", async () => {
    const manifest = SUBJECT.manifest();
    for (const r of ["herr-vehiculos", "herr-domicilios", "herr-etiquetas", "herr-recargas", "herr-rutas"]) {
      expect(manifest.permissions?.some((p) => p.id === `subject.herramientas.${r}.read`)).toBe(true);
      expect(manifest.menu?.some((m) => m.id === `herramientas.${r}`)).toBe(true);
    }
    const iconos = new Set(manifest.menu?.map((m) => m.icon));
    expect(iconos.size).toBe(manifest.menu!.length);
    for (const mod of SUBJECT.modules) {
      for (const page of mod.pages ?? []) {
        const desc = await page.build({ url: null, identity: null, data, nox: {} as never, files: {} as never });
        expect(desc.page.component).toBe("nox.feature-shell");
      }
    }
  });
});

describe("vehículos", () => {
  test("catálogo de tanques", async () => {
    const r = await call("GET", "/herr-vehiculos/tanques");
    expect(r.status).toBe(200);
    expect(r.data).toHaveLength(26);
    expect(r.data[0]).toMatchObject({ id: "italika-ft150", tanque_litros: 12, nombre: "Italika FT150 (2008–2019)" });
  });

  test("ajustes por vehículo externo: alta, uno por vehículo, por-vehiculo", async () => {
    const ok = await call("POST", "/herr-vehiculos", {
      vehiculo_id: "veh1", name: "Moto Roja", placa: "ABC-123", medidor: "barras", marcas: 6,
    });
    expect(ok.status).toBe(201);
    expect(ok.data.search_field).toBe("moto roja veh1 abc-123 barras");

    // Sin nombre y sin gateway (tests): el snapshot queda como el id externo.
    const sin_nombre = await call("POST", "/herr-vehiculos", { vehiculo_id: "veh2" });
    expect(sin_nombre.status).toBe(201);
    expect(sin_nombre.data.name).toBe("veh2");

    expect((await call("POST", "/herr-vehiculos", { vehiculo_id: "veh1" })).status).toBe(409);
    expect((await call("POST", "/herr-vehiculos", { name: "Sin vehículo" })).status).toBe(400);
    expect((await call("POST", "/herr-vehiculos", { vehiculo_id: "veh3", medidor: "reloj" })).status).toBe(400);

    const por = await call("GET", "/herr-vehiculos/por-vehiculo/veh1");
    expect(por.status).toBe(200);
    expect(por.data.id).toBe(ok.data.id);
    expect((await call("GET", "/herr-vehiculos/por-vehiculo/nadie")).status).toBe(404);

    const mismo = await call("PATCH", `/herr-vehiculos/${ok.data.id}`, { vehiculo_id: "veh1", tanque_litros: 14 });
    expect(mismo.status).toBe(200);
    expect(mismo.data.tanque_litros).toBe(14);
    expect((await call("PATCH", `/herr-vehiculos/${ok.data.id}`, { vehiculo_id: "veh2" })).status).toBe(409);

    await call("DELETE", `/herr-vehiculos/${ok.data.id}`);
    expect((await call("GET", "/herr-vehiculos/por-vehiculo/veh1")).status).toBe(404);
  });

  test("dar de alta otra vez un vehículo borrado reutiliza sus ajustes", async () => {
    const ok = await call("POST", "/herr-vehiculos", { vehiculo_id: "veh1", name: "Moto Roja", tanque_litros: 12 });
    await data.update("herr_vehiculos", { id: ok.data.id }, { litros_por_paso: [2, 2, 2, 2, 2, 2] });
    expect((await call("DELETE", `/herr-vehiculos/${ok.data.id}`)).status).toBe(200);

    const otra_vez = await call("POST", "/herr-vehiculos", { vehiculo_id: "veh1", medidor: "barras" });
    expect(otra_vez.status).toBe(201);
    expect(otra_vez.data).toMatchObject({
      id: ok.data.id, is_active: true, name: "Moto Roja", tanque_litros: 12, medidor: "barras", litros_por_paso: [2, 2, 2, 2, 2, 2],
    });
    expect(await data.count("herr_vehiculos", { vehiculo_id: "veh1" })).toBe(1);
    expect((await call("GET", "/herr-vehiculos/por-vehiculo/veh1")).data.id).toBe(ok.data.id);
    expect((await call("POST", "/herr-vehiculos", { vehiculo_id: "veh1" })).status).toBe(409);
  });

  test("created_by lo pone el servidor en todos los módulos", async () => {
    const altas: Array<[string, DomainRow]> = [
      ["herr-vehiculos", { vehiculo_id: "veh9" }],
      ["herr-domicilios", { name: "Morelos 45" }],
      ["herr-etiquetas", { name: "Perro" }],
      ["herr-recargas", { vehiculo_id: "veh9", litros: 3 }],
      ["herr-rutas", { name: "Ruta" }],
    ];
    for (const [recurso, body] of altas) {
      const r = await call("POST", `/${recurso}`, { ...body, created_by: "intruso" });
      expect(r.status).toBe(201);
      expect(r.data.created_by).not.toBe("intruso");
      const p = await call("PATCH", `/${recurso}/${r.data.id}`, { created_by: "intruso" });
      expect(p.status).toBe(200);
      expect(p.data.created_by).toBe(r.data.created_by);
    }
  });
});

describe("domicilios", () => {
  test("emparejar: mejor inequívoco o ambigüedad con distancias", async () => {
    await domicilio("d1", "Morelos 45", 10);
    await domicilio("d2", "Morelos 47", 14);
    const ambiguo = await call("POST", "/herr-domicilios/emparejar", AQUI);
    expect(ambiguo.status).toBe(200);
    expect(ambiguo.data.mejor).toBeNull();
    expect(ambiguo.data.ambiguo).toBe(true);
    expect(ambiguo.data.candidatos.map((c: any) => c.fila.id)).toEqual(["d1", "d2"]);
    expect(ambiguo.data.candidatos[0].distancia_m).toBeCloseTo(10, 0);
    expect(ambiguo.data.candidatos[1].distancia_m).toBeCloseTo(14, 0);

    await data.update("herr_domicilios", { id: "d2" }, al_norte(38));
    const claro = await call("POST", "/herr-domicilios/emparejar", AQUI);
    expect(claro.data.mejor.id).toBe("d1");
    expect(claro.data.ambiguo).toBe(false);

    await domicilio("lejos", "Juárez 12", 250);
    const radio = await call("POST", "/herr-domicilios/emparejar", { ...AQUI, radio_m: 300 });
    expect(radio.data.candidatos).toHaveLength(3);

    expect((await call("POST", "/herr-domicilios/emparejar", { lat: "x" })).status).toBe(400);
  });

  test("aquí mismo crea con la dirección resuelta y luego reutiliza", async () => {
    const creado = await call("POST", "/herr-domicilios/aqui-mismo", {
      ...AQUI,
      direccion: { calle: "Calle Morelos", numero: "45", colonia: "Centro", localidad: "CDMX" },
    });
    expect(creado.status).toBe(201);
    expect(creado.data.creada).toBe(true);
    expect(creado.data.fila).toMatchObject({
      name: "Calle Morelos 45", calle: "Calle Morelos", numero: "45", colonia: "Centro",
      lat: AQUI.lat, lon: AQUI.lon, veces: 0, is_active: true,
    });

    const otra_vez = await call("POST", "/herr-domicilios/aqui-mismo", { ...al_norte(12), alias: "Ignorado" });
    expect(otra_vez.status).toBe(200);
    expect(otra_vez.data.creada).toBe(false);
    expect(otra_vez.data.fila.id).toBe(creado.data.fila.id);
    expect(await data.count("herr_domicilios")).toBe(1);

    const con_alias = await call("POST", "/herr-domicilios/aqui-mismo", {
      ...al_norte(250), alias: "La de la reja verde", direccion: { calle: "Morelos", numero: "99" },
    });
    expect(con_alias.data.fila.name).toBe("La de la reja verde");
    expect(con_alias.data.fila.numero).toBe("99");

    const sin_nada = await call("POST", "/herr-domicilios/aqui-mismo", al_norte(500));
    expect(sin_nada.data.fila.name).toBe("19.437092,-99.133200");
  });

  test("entrega incrementa veces y sella la fecha; mapa da los enlaces", async () => {
    await domicilio("d1", "Morelos 45", 0);
    const una = await call("POST", "/herr-domicilios/d1/entrega", { en: "2026-09-27T15:00:00-06:00" });
    expect(una.data.veces).toBe(1);
    expect(una.data.ultima_entrega).toBe("2026-09-27T15:00:00-06:00");
    const dos = await call("POST", "/herr-domicilios/d1/entrega", {});
    expect(dos.data.veces).toBe(2);
    expect(Number.isFinite(Date.parse(dos.data.ultima_entrega))).toBe(true);

    const mapa = await call("GET", "/herr-domicilios/d1/mapa");
    expect(mapa.data.ver).toBe("https://www.google.com/maps/search/?api=1&query=19.432600%2C-99.133200");
    expect(mapa.data.como_llegar).toBe(
      "https://www.google.com/maps/dir/?api=1&destination=19.432600%2C-99.133200&travelmode=two_wheeler",
    );
    expect(mapa.data.geo.startsWith("geo:19.432600,-99.133200?q=")).toBe(true);

    await data.insert("herr_domicilios", { id: "sin", name: "Sin geo", is_active: true, created_at: TS, updated_at: TS });
    expect((await call("GET", "/herr-domicilios/sin/mapa")).status).toBe(409);
    expect((await call("GET", "/herr-domicilios/nadie/mapa")).status).toBe(404);
  });

  test("el CRUD rellena la búsqueda con alias, calle y contacto", async () => {
    const r = await call("POST", "/herr-domicilios", { name: "Reja verde", calle: "Morelos", numero: "45", contacto_nombre: "Ana" });
    expect(r.status).toBe(201);
    expect(r.data.search_field).toBe("reja verde morelos 45 ana");
    expect(r.data.etiquetas).toEqual([]);
  });
});

describe("etiquetas", () => {
  test("color por defecto y validación", async () => {
    const ok = await call("POST", "/herr-etiquetas", { name: "Perro" });
    expect(ok.data.color).toBe("neutro");
    expect((await call("POST", "/herr-etiquetas", { name: "Portón", color: "morado" })).status).toBe(400);
    const opciones = await call("GET", "/herr-etiquetas?as=options");
    expect(opciones.data).toEqual([{ value: ok.data.id, label: "Perro" }]);
  });
});

describe("rutas GPS", () => {
  const T0 = Date.parse("2026-09-27T08:00:00.000Z");
  const punto = (metros_norte: number, ms: number, acc = 5): PuntoGps => ({
    t: new Date(ms).toISOString(),
    lat: 20.6736 + metros_norte / 111_320,
    lon: -103.344,
    acc,
  });

  test("iniciar, anexar puntos con paradas en vivo, informe y terminar", async () => {
    const inicio = await call("POST", "/herr-rutas/iniciar", { jornada_id: "j1", en: "2026-09-27T08:00:00.000Z" });
    expect(inicio.status).toBe(201);
    expect(inicio.data).toMatchObject({ name: "Ruta 2026-09-27", jornada_id: "j1", distancia_m: 0, puntos: [] });
    const id = inicio.data.id;

    // Avanza 250 m y se queda quieto: el primer lote ya lleva 2 min parado. El
    // último paso (200→250 m) cae dentro de la parada, como en el analizador.
    const lote1: PuntoGps[] = [];
    for (let i = 0; i < 6; i++) lote1.push(punto(i * 50, T0 + i * 10_000));
    const parada = T0 + 60_000;
    for (let i = 0; i < 5; i++) lote1.push(punto(250, parada + i * 30_000));
    const r1 = await call("POST", `/herr-rutas/${id}/puntos`, { puntos: lote1 });
    expect(r1.status).toBe(200);
    expect(r1.data.nuevos).toBe(11);
    expect(r1.data.distancia_m).toBeCloseTo(200, -1);
    expect(r1.data.parada_iniciada).toMatchObject({ desde: lote1[5]!.t });
    expect(r1.data.parada_iniciada.lat).toBeCloseTo(lote1[5]!.lat, 6);
    expect(r1.data.parada_terminada).toBeUndefined();

    // Sigue quieto hasta los 5 min y arranca: el segundo lote termina la parada.
    const lote2: PuntoGps[] = [];
    for (let i = 5; i < 11; i++) lote2.push(punto(250, parada + i * 30_000));
    const sigue = parada + 330_000;
    for (let i = 0; i < 4; i++) lote2.push(punto(300 + i * 50, sigue + i * 10_000));
    const r2 = await call("POST", `/herr-rutas/${id}/puntos`, { puntos: [...lote2, lote1[0]!] });
    expect(r2.data.nuevos).toBe(10);
    expect(r2.data.parada_iniciada).toBeUndefined();
    expect(r2.data.parada_terminada).toEqual({ en: lote2[6]!.t });
    expect(r2.data.distancia_m).toBeCloseTo(400, -1);

    const repetido = await call("POST", `/herr-rutas/${id}/puntos`, { puntos: lote2 });
    expect(repetido.data.nuevos).toBe(0);
    expect(repetido.data.puntos).toBe(21);

    const informe = await call("GET", `/herr-rutas/${id}/informe`);
    expect(informe.data.paradas).toHaveLength(1);
    expect(informe.data.paradas[0].duracion_ms).toBeGreaterThanOrEqual(300_000);
    expect(informe.data.distancia_m).toBeCloseTo(400, -1);
    expect(informe.data.puntos_descartados).toBe(0);
    expect((await data.findOne("herr_rutas", { id }))?.informe).toEqual(informe.data);

    const fin = await call("POST", `/herr-rutas/${id}/terminar`, {});
    expect(Number.isFinite(Date.parse(fin.data.terminada))).toBe(true);
    expect(fin.data.informe.paradas).toHaveLength(1);
    expect((await call("POST", `/herr-rutas/${id}/terminar`, {})).status).toBe(409);

    // Un lote tardío tras terminar rehace también el informe guardado.
    const tarde = [punto(500, sigue + 60_000), punto(550, sigue + 70_000)];
    const r3 = await call("POST", `/herr-rutas/${id}/puntos`, { puntos: tarde });
    expect(r3.data.nuevos).toBe(2);
    const guardada = (await data.findOne("herr_rutas", { id }))!;
    expect(guardada.distancia_m).toBe(r3.data.distancia_m);
    expect((guardada.informe as { distancia_m: number }).distancia_m).toBe(r3.data.distancia_m);

    expect((await call("POST", `/herr-rutas/${id}/puntos`, { puntos: [{ t: "ayer", lat: 1, lon: 1 }] })).status).toBe(400);
    expect((await call("POST", `/herr-rutas/${id}/puntos`, {})).status).toBe(400);
    expect((await call("POST", "/herr-rutas/nadie/puntos", { puntos: [] })).status).toBe(404);
  });

  test("iniciar con jornada deja la ruta en la jornada", async () => {
    await data.insert("herr_jornadas", { id: "j1", name: "Jornada", is_active: true, ruta_id: null, created_at: TS, updated_at: TS });
    const inicio = await call("POST", "/herr-rutas/iniciar", { jornada_id: "j1" });
    expect((await data.findOne("herr_jornadas", { id: "j1" }))?.ruta_id).toBe(inicio.data.id);
  });

  test("el CRUD rechaza puntos ilegibles", async () => {
    const malos = [{ t: "ayer", lat: 20.6, lon: -103.3 }, { t: "2026-09-27T10:00:00Z" }];
    expect((await call("POST", "/herr-rutas", { name: "Ruta", puntos: malos })).status).toBe(400);
    const r = await call("POST", "/herr-rutas", { name: "Ruta", puntos: [punto(0, T0)] });
    expect(r.status).toBe(201);
    expect((await call("PATCH", `/herr-rutas/${r.data.id}`, { puntos: malos })).status).toBe(400);
    expect((await call("PATCH", `/herr-rutas/${r.data.id}`, { puntos: "no" })).status).toBe(400);
  });
});

describe("recargas", () => {
  /** Ajustes de reparto del vehículo externo `veh1`. */
  async function moto(extra: DomainRow = {}) {
    return data.insert("herr_vehiculos", {
      id: "aj1", vehiculo_id: "veh1", name: "Moto Roja", is_active: true, tanque_litros: 12, medidor: "barras",
      marcas: 6, divisiones: 1, aguja_fuera: false, litros_por_paso: [], created_at: TS, updated_at: TS, ...extra,
    });
  }

  test("con importe crea el gasto, deriva litros y calibra el vehículo; borrar quita el gasto", async () => {
    await moto();
    const r = await call("POST", "/herr-recargas", {
      vehiculo_id: "veh1", pesos: 240, precio_litro: 24, nivel_antes: "0/6", nivel_despues: "4/6",
      jornada_id: "j1", fecha_hora: "2026-09-27T14:30:00-06:00",
    });
    expect(r.status).toBe(201);
    expect(r.data).toMatchObject({
      name: "Recarga 2026-09-27 · Moto Roja", litros_efectivos: 10, aproximado: true,
      search_field: "recarga 2026-09-27 · moto roja moto roja veh1 j1 2026-09-27",
    });

    const gasto = await call("GET", `/herr-gastos/gasto_recarga_${r.data.id}`);
    expect(gasto.status).toBe(200);
    expect(gasto.data).toMatchObject({
      name: "Gasolina · 10 L", motivo: "Gasolina · 10 L", cantidad: 240, fuente: "cobros",
      fecha: "2026-09-27", hora: "14:30", jornada_id: "j1", descontado: false, recarga_id: r.data.id, is_active: true,
    });

    // 10 L en 4 secciones = 2.5 L/sección observados; EMA 0.35 sobre 2 L lineales → 2.175.
    const calibrada = (await data.findOne("herr_vehiculos", { id: "aj1" }))!.litros_por_paso as number[];
    expect(calibrada).toHaveLength(6);
    expect(calibrada[0]).toBeCloseTo(2.175, 9);
    expect(calibrada[3]).toBeCloseTo(2.175, 9);
    expect(calibrada[4]).toBe(2);

    const borrado = await call("DELETE", `/herr-recargas/${r.data.id}`);
    expect(borrado.status).toBe(200);
    expect((await call("GET", `/herr-gastos/gasto_recarga_${r.data.id}`)).status).toBe(404);
    expect(await data.findOne("herr_gastos", { id: `gasto_recarga_${r.data.id}` })).toMatchObject({ is_active: false, cantidad: 240 });
  });

  test("editar la recarga corrige su gasto: lo crea, lo actualiza o lo desactiva", async () => {
    const r = await call("POST", "/herr-recargas", { vehiculo_id: "veh1", litros: 5, fecha_hora: "2026-09-27T14:30:00-06:00" });
    const gasto_id = `gasto_recarga_${r.data.id}`;
    expect(await data.count("herr_gastos")).toBe(0);

    const con_importe = await call("PATCH", `/herr-recargas/${r.data.id}`, { pesos: 120, jornada_id: "j1" });
    expect(con_importe.status).toBe(200);
    expect((await call("GET", `/herr-gastos/${gasto_id}`)).data).toMatchObject({
      cantidad: 120, motivo: "Gasolina · 5 L", fecha: "2026-09-27", hora: "14:30", jornada_id: "j1", is_active: true,
    });

    await call("PATCH", `/herr-recargas/${r.data.id}`, { pesos: 150, litros: 6, fecha_hora: "2026-09-28T02:10:00Z", jornada_id: "j2" });
    expect((await call("GET", `/herr-gastos/${gasto_id}`)).data).toMatchObject({
      cantidad: 150, motivo: "Gasolina · 6 L", name: "Gasolina · 6 L", fecha: "2026-09-27", hora: "20:10", jornada_id: "j2",
    });
    expect(await data.count("herr_gastos")).toBe(1);

    await call("PATCH", `/herr-recargas/${r.data.id}`, { pesos: null });
    expect((await data.findOne("herr_gastos", { id: gasto_id }))?.is_active).toBe(false);
    await call("PATCH", `/herr-recargas/${r.data.id}`, { pesos: 90 });
    expect((await call("GET", `/herr-gastos/${gasto_id}`)).data).toMatchObject({ cantidad: 90, is_active: true });
  });

  test("editar recalibra con las lecturas nuevas", async () => {
    await moto();
    const r = await call("POST", "/herr-recargas", { vehiculo_id: "veh1", litros: 10 });
    expect((await data.findOne("herr_vehiculos", { id: "aj1" }))!.litros_por_paso).toEqual([]);
    await call("PATCH", `/herr-recargas/${r.data.id}`, { nivel_antes: "0/6", nivel_despues: "4/6" });
    const calibrada = (await data.findOne("herr_vehiculos", { id: "aj1" }))!.litros_por_paso as number[];
    expect(calibrada[0]).toBeCloseTo(2.175, 9);
  });

  test("una recarga cuyo gasto ya se liquidó no se borra ni cambia su importe", async () => {
    const r = await call("POST", "/herr-recargas", { vehiculo_id: "veh1", pesos: 200, litros: 8 });
    const gasto_id = `gasto_recarga_${r.data.id}`;
    await data.update("herr_gastos", { id: gasto_id }, { descontado: true, liquidacion: "2026-09-27 20:00" });

    expect((await call("PATCH", `/herr-recargas/${r.data.id}`, { pesos: 300 })).status).toBe(409);
    expect((await call("DELETE", `/herr-recargas/${r.data.id}`)).status).toBe(409);
    expect((await data.findOne("herr_recargas", { id: r.data.id }))).toMatchObject({ pesos: 200, is_active: true });
    expect(await data.findOne("herr_gastos", { id: gasto_id })).toMatchObject({ cantidad: 200, is_active: true, descontado: true });

    const notas = await call("PATCH", `/herr-recargas/${r.data.id}`, { pesos: 200, description: "ticket perdido" });
    expect(notas.status).toBe(200);
    expect((await data.findOne("herr_gastos", { id: gasto_id }))?.liquidacion).toBe("2026-09-27 20:00");
  });

  test("editar solo la descripción no vuelve a calibrar ni toca el gasto", async () => {
    await moto();
    const r = await call("POST", "/herr-recargas", {
      vehiculo_id: "veh1", pesos: 240, precio_litro: 24, nivel_antes: "0/6", nivel_despues: "4/6",
    });
    const gasto_id = `gasto_recarga_${r.data.id}`;
    const calibrada = (await data.findOne("herr_vehiculos", { id: "aj1" }))!.litros_por_paso;
    await data.update("herr_gastos", { id: gasto_id }, { motivo: "Gasolina Pemex", updated_at: "t" });

    expect((await call("PATCH", `/herr-recargas/${r.data.id}`, { description: "ticket en la guantera" })).status).toBe(200);
    expect((await data.findOne("herr_vehiculos", { id: "aj1" }))!.litros_por_paso).toEqual(calibrada);
    expect((await data.findOne("herr_gastos", { id: gasto_id }))?.motivo).toBe("Gasolina Pemex");

    await call("PATCH", `/herr-recargas/${r.data.id}`, { nivel_despues: "5/6" });
    expect((await data.findOne("herr_vehiculos", { id: "aj1" }))!.litros_por_paso).not.toEqual(calibrada);
  });

  test("reenviar la fila entera con la hora local sin zona no es un cambio: sin 409 aunque esté liquidada", async () => {
    const r = await call("POST", "/herr-recargas", {
      vehiculo_id: "veh1", pesos: 200, litros: 8, jornada_id: "j1", fecha_hora: "2026-09-27T20:30:00.000Z",
    });
    await data.update("herr_gastos", { id: `gasto_recarga_${r.data.id}` }, { descontado: true, liquidacion: "2026-09-27 20:00" });
    const { id: _id, created_at: _alta, updated_at: _cambio, ...fila } = r.data;
    const reenvio = await call("PATCH", `/herr-recargas/${r.data.id}`, {
      ...fila, pesos: "200", litros: "8.0", fecha_hora: "2026-09-27T14:30", description: "sin factura",
    });
    expect(reenvio.status).toBe(200);
    expect((await call("PATCH", `/herr-recargas/${r.data.id}`, { fecha_hora: "2026-09-27T15:30" })).status).toBe(409);
  });

  test("un gasto que el usuario desactivó en Gastos no se reactiva al editar la recarga", async () => {
    const r = await call("POST", "/herr-recargas", { vehiculo_id: "veh1", pesos: 200, litros: 8 });
    const gasto_id = `gasto_recarga_${r.data.id}`;
    await data.update("herr_gastos", { id: gasto_id }, { is_active: false, updated_at: "t" });
    expect((await call("PATCH", `/herr-recargas/${r.data.id}`, { pesos: 220 })).status).toBe(200);
    expect(await data.findOne("herr_gastos", { id: gasto_id })).toMatchObject({ is_active: false, cantidad: 200 });
  });

  test("un vehículo sin ajustes se recarga igual, sin calibrar", async () => {
    const r = await call("POST", "/herr-recargas", {
      vehiculo_id: "veh-nuevo", pesos: 100, precio_litro: 25, nivel_antes: "0/6", nivel_despues: "2/6", fecha_hora: "2026-09-27T09:00:00Z",
    });
    expect(r.status).toBe(201);
    expect(r.data).toMatchObject({ name: "Recarga 2026-09-27 · veh-nuevo", litros_efectivos: 4, aproximado: true });
    expect(await data.count("herr_gastos")).toBe(1);
    expect(await data.count("herr_vehiculos")).toBe(0);
  });

  test("sin importe no hay gasto; litros tecleados son exactos y el PATCH recalcula", async () => {
    await moto();
    const r = await call("POST", "/herr-recargas", { vehiculo_id: "veh1", litros: 4.2, name: "Mi carga" });
    expect(r.data).toMatchObject({ name: "Mi carga", litros_efectivos: 4.2, aproximado: false });
    expect(await data.count("herr_gastos")).toBe(0);
    const p = await call("PATCH", `/herr-recargas/${r.data.id}`, { litros: null, pesos: 100, precio_litro: 25 });
    expect(p.data).toMatchObject({ litros_efectivos: 4, aproximado: true });
  });

  test("combustible del vehículo: rendimiento exacto entre llenados y litros tras la última recarga", async () => {
    await moto();
    const vacio = await call("GET", "/herr-vehiculos/aj1/combustible");
    expect(vacio.data).toMatchObject({ ajustes_id: "aj1", vehiculo_id: "veh1", recargas: 0, ultima_recarga: null, rendimiento_exacto: null, litros_estimados: null });
    expect(vacio.data.calibracion).toEqual({ litros_por_paso: [], secciones: 6, completa: false });

    await call("POST", "/herr-recargas", { vehiculo_id: "veh1", km: 1000, litros: 5, tanque_lleno: true, fecha_hora: "2026-09-20T10:00:00Z" });
    await call("POST", "/herr-recargas", { vehiculo_id: "veh1", km: 1120, litros: 4, tanque_lleno: true, fecha_hora: "2026-09-25T10:00:00Z" });
    const lleno = await call("GET", "/herr-vehiculos/aj1/combustible");
    expect(lleno.data.rendimiento_exacto).toBe(30);
    expect(lleno.data.litros_estimados).toEqual({ litros: 12, aproximado: false });

    // Un llenado sin odómetro entre medias: sin dos llenados seguidos con km no hay rendimiento exacto.
    await call("POST", "/herr-recargas", { vehiculo_id: "veh1", litros: 2, tanque_lleno: true, fecha_hora: "2026-09-25T18:00:00Z" });
    await call("POST", "/herr-recargas", { vehiculo_id: "veh1", km: 1180, litros: 3, tanque_lleno: true, fecha_hora: "2026-09-25T20:00:00Z" });
    expect((await call("GET", "/herr-vehiculos/aj1/combustible")).data.rendimiento_exacto).toBeNull();

    const parcial = await call("POST", "/herr-recargas", { vehiculo_id: "veh1", litros: 2, nivel_despues: "3/6", fecha_hora: "2026-09-26T10:00:00Z" });
    const medio = await call("GET", "/herr-vehiculos/aj1/combustible");
    expect(medio.data.ultima_recarga.id).toBe(parcial.data.id);
    expect(medio.data.litros_estimados).toEqual({ litros: 6, aproximado: true });
    expect(medio.data.recargas).toBe(5);
    expect((await call("GET", "/herr-vehiculos/nadie/combustible")).status).toBe(404);
  });
});
