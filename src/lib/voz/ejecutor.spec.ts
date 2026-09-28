import { beforeEach, describe, expect, test } from "bun:test";
import { MemoryKirletDataClient } from "@opus-perpetuus/imperium-core-kit";
import { tramos_desde } from "../jornadas/jornada.ts";
import { INTENCIONES } from "../nlu/intenciones.ts";
import { jornada_activa } from "../reparto/servicios.ts";
import { INTENCIONES_EJECUTABLES, ejecutar_intencion, pesos, type CtxVoz } from "./ejecutor.ts";

let ctx: CtxVoz;
let data: MemoryKirletDataClient;

beforeEach(() => {
  data = new MemoryKirletDataClient();
  ctx = { data, actor: "repartidor@prueba" };
});

/** Ajustes de reparto de un vehículo: `vehiculo_id` es el id externo de la app Vehículos. */
const vehiculo = (vehiculo_id: string, name: string) =>
  data.insert("herr_vehiculos", {
    id: `ajuste-${vehiculo_id}`,
    vehiculo_id,
    name,
    is_active: true,
    solo_gps: false,
    created_at: "t",
    updated_at: "t",
  });

const ejecutar = (intencion: string, datos: Record<string, string> = {}) => ejecutar_intencion(ctx, intencion, datos);

/** Lectura de odómetro al abrir la jornada (y su tramo), como la capturaría la pantalla. */
async function odometro_inicial(km: number) {
  const j = (await jornada_activa(ctx))!;
  const tramos = tramos_desde(j.tramos).map((t) => ({ ...t, km_inicial: km }));
  await data.update("herr_jornadas", { id: String(j.id) }, { km_inicial: km, tramos });
}

/** Una ruta GPS de la jornada abierta con `metros` recorridos. */
async function ruta(metros: number) {
  const j = (await jornada_activa(ctx))!;
  await data.insert("herr_rutas", { id: `ruta-${metros}`, jornada_id: String(j.id), distancia_m: metros, is_active: true });
}

/** Pedido entregado y cobrado al cliente: deja dinero de cobros disponible. */
async function pedido_cobrado(cantidad: string) {
  await ejecutar("pedido_registrar", { cantidad });
  await ejecutar("entrega_registrar", { cantidad });
}

describe("cobertura", () => {
  test("toda intención del registro tiene manejador o es del teléfono", () => {
    const del_registro = INTENCIONES.map((i) => i.id);
    const telefono = INTENCIONES.filter((i) => i.telefono).map((i) => i.id);
    expect([...INTENCIONES_EJECUTABLES, ...telefono].sort()).toEqual([...del_registro].sort());
  });

  test("las del teléfono se delegan sin tocar datos; una desconocida es error", async () => {
    const r = await ejecutar("llamar", { contacto: "ana" });
    expect(r.estado).toBe("interpretado");
    expect(r.resultado).toEqual({ delegada: "telefono" });
    expect((await ejecutar("volar")).estado).toBe("error");
  });

  test("pesos se lee entero o con centavos", () => {
    expect(pesos(250)).toBe("250");
    expect(pesos(45.5)).toBe("45.50");
  });
});

describe("jornada", () => {
  test("sin vehículos no arranca; con uno solo lo toma y guarda el id externo", async () => {
    expect((await ejecutar("jornada_iniciar")).respuesta).toBe("No hay vehículos configurados para reparto.");
    await vehiculo("v1", "Italika");
    const r = await ejecutar("jornada_iniciar");
    expect(r.estado).toBe("ejecutado");
    expect(r.respuesta).toBe("Jornada iniciada con Italika.");
    const j = await jornada_activa(ctx);
    expect(j?.vehiculo_id).toBe("v1");
    expect(j?.vehiculo_nombre).toBe("Italika");
    expect(j?.estado).toBe("abierta");
    expect(j?.name).toMatch(/^Jornada \d{4}-\d{2}-\d{2}$/);
    expect((await ejecutar("jornada_iniciar")).respuesta).toBe("Ya hay una jornada abierta.");
  });

  test("con varios vehículos hace falta decir cuál: por nombre, parecido o id externo; nunca se inventa", async () => {
    await vehiculo("v1", "Italika");
    await vehiculo("v2", "Boxer");
    const r = await ejecutar("jornada_iniciar");
    expect(r.estado).toBe("error");
    expect(r.resultado?.opciones).toEqual([
      { id: "v1", etiqueta: "Italika" },
      { id: "v2", etiqueta: "Boxer" },
    ]);
    expect((await ejecutar("jornada_iniciar", { vehiculo: "la pulsar" })).respuesta).toBe("No conozco el vehículo la pulsar.");
    expect((await ejecutar("jornada_iniciar", { vehiculo_id: "v9" })).respuesta).toBe("No conozco ese vehículo.");
    // «bóxer» como lo transcribe el reconocedor: parecido, no exacto.
    expect((await ejecutar("jornada_iniciar", { vehiculo: "boxxer" })).respuesta).toBe("Jornada iniciada con Boxer.");
    expect((await jornada_activa(ctx))?.vehiculo_id).toBe("v2");
  });

  test("cambiar de vehículo cierra el tramo con el odómetro estimado y abre el del nuevo", async () => {
    await vehiculo("v1", "Italika");
    await vehiculo("v2", "Boxer");
    await ejecutar("jornada_iniciar", { vehiculo_id: "v1" });
    await odometro_inicial(1000);
    await ruta(12_500);
    expect((await ejecutar("jornada_cambiar_vehiculo", { vehiculo: "italika" })).respuesta).toBe("Ya estás en Italika.");
    const r = await ejecutar("jornada_cambiar_vehiculo", { vehiculo: "boxer" });
    expect(r.respuesta).toBe("Cambié a Boxer.");
    const j = await jornada_activa(ctx);
    expect(j?.vehiculo_id).toBe("v2");
    const tramos = tramos_desde(j?.tramos);
    expect(tramos).toHaveLength(2);
    expect(tramos[0]).toMatchObject({ vehiculo_id: "v1", km_inicial: 1000, km_final: 1012.5, gps_m_inicio: 0, gps_m_fin: 12_500 });
    expect(tramos[0]?.fin).toBeString();
    expect(tramos[1]).toMatchObject({ vehiculo_id: "v2", fin: null, gps_m_inicio: 12_500 });
  });

  test("terminar cierra, cuenta entregas, calcula y estima el odómetro con el GPS", async () => {
    await vehiculo("v1", "Italika");
    await ejecutar("jornada_iniciar");
    const j = (await jornada_activa(ctx))!;
    await odometro_inicial(1000);
    await ruta(12_500);
    await ejecutar("pedido_registrar", { cantidad: "250", domicilio: "calle 5" });
    await ejecutar("entrega_registrar", { cantidad: "250" });
    const r = await ejecutar("jornada_terminar");
    expect(r.respuesta).toBe("Jornada terminada. Entregas 250 pesos a caja.");
    const cerrada = await data.findOne("herr_jornadas", { id: String(j.id) });
    expect(cerrada).toMatchObject({ estado: "cerrada", km_final: 1012.5, km_recorridos: 12.5, entregas: 1, ingreso: 250 });
    expect(cerrada?.hora_fin).toMatch(/^\d{2}:\d{2}$/);
    expect(tramos_desde(cerrada?.tramos)[0]?.fin).toBeString();
    expect((await data.findMany("herr_pedidos", {}))[0]).toMatchObject({ cobrado: true });
    expect(await jornada_activa(ctx)).toBeNull();
    expect((await ejecutar("jornada_terminar")).respuesta).toBe("No hay jornada en curso.");
  });

  test("una jornada nueva arranca con el último odómetro del vehículo", async () => {
    await vehiculo("v1", "Italika");
    await ejecutar("jornada_iniciar");
    await odometro_inicial(100);
    await ruta(20_000);
    await ejecutar("jornada_terminar");
    await ejecutar("jornada_iniciar");
    expect((await jornada_activa(ctx))?.km_inicial).toBe(120);
  });

  test("pausar y reanudar son del teléfono", async () => {
    expect((await ejecutar("jornada_pausar")).estado).toBe("interpretado");
    expect((await ejecutar("jornada_reanudar")).estado).toBe("interpretado");
  });
});

describe("pedidos, gastos y caja", () => {
  beforeEach(async () => {
    await vehiculo("v1", "Italika");
    await ejecutar("jornada_iniciar");
  });

  test("sin jornada todo lo que escribe se rechaza", async () => {
    await ejecutar("jornada_terminar");
    for (const i of ["pedido_registrar", "gasto_registrar", "caja_retiro", "recarga_registrar"]) {
      expect((await ejecutar(i, { cantidad: "10" })).respuesta).toBe("No hay jornada en curso.");
    }
    // Liquidar no necesita jornada: lo pendiente puede ser de días anteriores.
    expect((await ejecutar("cobro_registrar")).respuesta).toBe("No hay nada que liquidar.");
  });

  test("pedido: orden consecutiva, domicilio conocido enlazado, monto obligatorio", async () => {
    await data.insert("herr_domicilios", { id: "d1", name: "Calle 5 #12", is_active: true, veces: 0 });
    expect((await ejecutar("pedido_registrar")).respuesta).toBe("Dime el monto a cobrar.");
    const r1 = await ejecutar("pedido_registrar", { cantidad: "250", domicilio: "calle 5" });
    expect(r1.respuesta).toBe("Pedido registrado por 250 pesos en Calle 5 #12.");
    const r2 = await ejecutar("pedido_registrar", { cantidad: "120.5" });
    expect(r2.respuesta).toBe("Pedido registrado por 120.50 pesos.");
    const pedidos = await data.findMany("herr_pedidos", { orderBy: { orden: "asc" } });
    expect(pedidos.map((p) => p.orden)).toEqual([1, 2]);
    expect(pedidos[0]).toMatchObject({
      name: "Pedido 1 · Calle 5 #12",
      domicilio_id: "d1",
      cobrar: 250,
      estado: "capturado",
      cobrado: false,
      detalle: "Pedido por voz",
    });
    expect(pedidos[0]?.jornada_id).toBe((await jornada_activa(ctx))?.id);
  });

  test("entregar: el del domicilio dicho, si no el primero de la ruta; dice el siguiente", async () => {
    await data.insert("herr_domicilios", { id: "d1", name: "Juarez 10", is_active: true, veces: 0 });
    await ejecutar("pedido_registrar", { cantidad: "100", domicilio: "morelos 45" });
    await ejecutar("pedido_registrar", { cantidad: "200", domicilio: "juarez 10" });
    const r1 = await ejecutar("entrega_registrar", { domicilio: "juarez", cantidad: "220" });
    expect(r1.respuesta).toBe("Entregado Juarez 10. Siguiente: morelos 45.");
    const juarez = await data.findOne("herr_pedidos", { domicilio_texto: "Juarez 10" });
    expect(juarez).toMatchObject({ estado: "entregado", recibido: 220, propina: 20 });
    expect(juarez?.hora_entrega).toMatch(/^\d{2}:\d{2}$/);
    expect(await data.findOne("herr_domicilios", { id: "d1" })).toMatchObject({ veces: 1 });
    const r2 = await ejecutar("entrega_registrar");
    expect(r2.respuesta).toBe("Entregado morelos 45. No queda ninguno.");
    // Sin decir cuánto se recibió no se inventa: entregar y cobrar son dos cosas.
    expect((await data.findOne("herr_pedidos", { domicilio_texto: "morelos 45" }))?.recibido).toBeNull();
    expect((await ejecutar("entrega_registrar")).respuesta).toBe("No hay pedidos por entregar.");
  });

  test("entregar el pedido fijado al preguntar: si ya no está abierto no se marca otro", async () => {
    await ejecutar("pedido_registrar", { cantidad: "100", domicilio: "morelos 45" });
    await ejecutar("pedido_registrar", { cantidad: "200", domicilio: "juarez 10" });
    const [a] = await data.findMany("herr_pedidos", { orderBy: { orden: "asc" } });
    await data.update("herr_pedidos", { id: String(a!.id) }, { estado: "entregado" });
    expect((await ejecutar("entrega_registrar", { pedido_id: String(a!.id) })).respuesta).toBe("No encontré ese pedido.");
    expect((await data.findOne("herr_pedidos", { domicilio_texto: "juarez 10" }))?.estado).toBe("capturado");
  });

  test("gasto con motivo o por defecto, solo con dinero de cobros", async () => {
    expect((await ejecutar("gasto_registrar")).respuesta).toBe("Dime el monto del gasto.");
    expect((await ejecutar("gasto_registrar", { cantidad: "80" })).respuesta).toBe("No hay dinero de cobros para cubrirlo.");
    await pedido_cobrado("250");
    const r = await ejecutar("gasto_registrar", { cantidad: "80", motivo: "refacciones" });
    expect(r.respuesta).toBe("Gasto de 80 pesos registrado.");
    const g = await data.findOne("herr_gastos", { motivo: "refacciones" });
    expect(g).toMatchObject({ name: "refacciones", cantidad: 80, fuente: "cobros", descontado: false, created_by: "repartidor@prueba" });
    await ejecutar("gasto_registrar", { cantidad: "20" });
    expect(await data.findOne("herr_gastos", { motivo: "Gasto por voz" })).not.toBeNull();
  });

  test("caja: retiro y aporte con su advertencia", async () => {
    expect((await ejecutar("caja_retiro")).respuesta).toBe("Dime cuánto.");
    const retiro = await ejecutar("caja_retiro", { cantidad: "200" });
    expect(retiro.respuesta).toBe("Anotados 200 pesos de cambio de la caja. No cuenta como venta.");
    const aporte = await ejecutar("caja_aporte", { cantidad: "150" });
    expect(aporte.respuesta).toBe("Anotados 150 pesos tuyos. Te los devuelven al liquidar, no son propina.");
    const filas = await data.findMany("herr_caja", {});
    expect(filas.map((f) => [f.tipo, f.cantidad, f.saldado])).toEqual([
      ["retiro_cambio", 200, false],
      ["aporte_propio", 150, false],
    ]);
  });

  test("recarga: fila de recarga más su gasto de gasolina", async () => {
    expect((await ejecutar("recarga_registrar")).respuesta).toBe("Dime cuánto pagaste de gasolina.");
    expect((await ejecutar("recarga_registrar", { cantidad: "200" })).respuesta).toBe("No hay dinero de cobros para cubrirlo.");
    expect(await data.count("herr_recargas")).toBe(0);
    await pedido_cobrado("250");
    const r = await ejecutar("recarga_registrar", { cantidad: "200", numero: "4" });
    expect(r.respuesta).toBe("Carga de gasolina de 200 pesos registrada.");
    const recarga = (await data.findMany("herr_recargas", {}))[0]!;
    expect(recarga).toMatchObject({ vehiculo_id: "v1", pesos: 200, litros: 4, precio_litro: 50 });
    expect(recarga.name).toMatch(/^Recarga \d{4}-\d{2}-\d{2} · Italika$/);
    const gasto = (await data.findMany("herr_gastos", {}))[0]!;
    expect(gasto).toMatchObject({ motivo: "Gasolina · 4 L", cantidad: 200, fuente: "cobros" });
    expect(gasto.recarga_id).toBe(recarga.id);
    expect(gasto.id).toBe(`gasto_recarga_${recarga.id}`);
  });

  test("pendiente: se anota y se surte el más reciente con lo recibido", async () => {
    expect((await ejecutar("pendiente_surtir")).respuesta).toBe("No hay pendientes por surtir.");
    const r = await ejecutar("pendiente_registrar", { cantidad: "120", domicilio: "juarez 10" });
    expect(r.respuesta).toBe("Pendiente anotado por 120 pesos en juarez 10.");
    expect((await ejecutar("pendiente_surtir")).respuesta).toBe("Dime cuánto recibiste.");
    expect((await ejecutar("pendiente_surtir", { cantidad: "120" })).respuesta).toBe("Pendiente surtido. Recibí 120 pesos.");
    const p = (await data.findMany("herr_pedidos", {}))[0]!;
    expect(p).toMatchObject({ estado: "entregado", recibido: 120 });
    expect(p.hora_entrega).toMatch(/^\d{2}:\d{2}$/);
  });
});

describe("liquidación y consultas", () => {
  beforeEach(async () => {
    await vehiculo("v1", "Italika");
    await ejecutar("jornada_iniciar");
  });

  test("cuánto llevo hoy: la liquidación de la app, sin el fondo de cambio", async () => {
    await ejecutar("pedido_registrar", { cantidad: "250", domicilio: "calle 5" });
    await ejecutar("pedido_registrar", { cantidad: "100", domicilio: "morelos" });
    await ejecutar("entrega_registrar", { domicilio: "calle 5", cantidad: "260" });
    await ejecutar("gasto_registrar", { cantidad: "80" });
    await ejecutar("caja_retiro", { cantidad: "200" });
    await ejecutar("caja_aporte", { cantidad: "50" });
    const r = await ejecutar("consulta_hoy");
    // 250 cobrados − 80 de gasto − 50 propios = 120; el cambio de caja se conserva.
    expect(r.respuesta).toBe("Hoy, con la jornada abierta, a caja irían 120 pesos, propinas 10, 1 pedidos cobrables y 1 en curso.");
    expect(r.resultado).toEqual({ a_caja: 120, propinas: 10, cobrables: 1, en_curso: 1 });
  });

  test("entregar el cobro liquida lo pendiente con sello y después no queda nada", async () => {
    expect((await ejecutar("cobro_registrar")).respuesta).toBe("No hay nada que liquidar.");
    await ejecutar("pedido_registrar", { cantidad: "100" });
    await ejecutar("entrega_registrar");
    // Entregado sin decir cuánto se recibió: aún no es cobrable.
    expect((await ejecutar("cobro_registrar")).respuesta).toBe("No hay nada que liquidar.");
    await pedido_cobrado("250");
    await ejecutar("gasto_registrar", { cantidad: "80" });
    const r = await ejecutar("cobro_registrar");
    expect(r.respuesta).toBe("Cobro entregado. Entregas 170 pesos.");
    expect((await data.findOne("herr_pedidos", { cobrar: 100 }))?.cobrado).toBe(false);
    const p = (await data.findOne("herr_pedidos", { cobrar: 250 }))!;
    expect(p).toMatchObject({ cobrado: true, estado: "cobrado" });
    expect(p.liquidacion).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
    const g = (await data.findMany("herr_gastos", {}))[0]!;
    expect(g).toMatchObject({ descontado: true, liquidacion: p.liquidacion });
    expect((await ejecutar("cobro_registrar")).respuesta).toBe("No hay nada que liquidar.");
  });

  test("el fondo de cambio solo se salda si se dice que se devuelve", async () => {
    await pedido_cobrado("250");
    await ejecutar("caja_retiro", { cantidad: "200" });
    const r = await ejecutar("cobro_registrar");
    expect(r.respuesta).toBe("Cobro entregado. Entregas 250 pesos. Conservas 200 pesos de cambio.");
    expect((await data.findMany("herr_caja", {}))[0]?.saldado).toBe(false);
    expect((await ejecutar("cobro_registrar")).respuesta).toBe("No hay nada que liquidar.");
    const devuelto = await ejecutar("cobro_registrar", { devolver_cambio: "true" });
    expect(devuelto.respuesta).toBe("Cobro entregado. Entregas 200 pesos.");
    expect((await data.findMany("herr_caja", {}))[0]).toMatchObject({ saldado: true });
  });

  test("si puse más de lo que cobré, la caja me devuelve", async () => {
    await ejecutar("caja_aporte", { cantidad: "300" });
    expect((await ejecutar("cobro_registrar")).respuesta).toBe("Liquidado. La caja te devuelve 300 pesos.");
  });

  test("cuántos pedidos y cuánto he gastado", async () => {
    await ejecutar("pedido_registrar", { cantidad: "250" });
    await ejecutar("pedido_registrar", { cantidad: "100" });
    await ejecutar("entrega_registrar", { cantidad: "250" });
    await ejecutar("gasto_registrar", { cantidad: "80" });
    await ejecutar("gasto_registrar", { cantidad: "20.5" });
    expect((await ejecutar("consulta_pedidos")).respuesta).toBe("Llevas 2 pedidos y 1 en curso.");
    expect((await ejecutar("consulta_gastos")).respuesta).toBe("Has gastado 100.50 pesos en 2 gastos.");
  });

  test("las consultas siguen respondiendo con la jornada de hoy ya cerrada", async () => {
    await pedido_cobrado("250");
    await ejecutar("jornada_terminar");
    expect((await ejecutar("consulta_pedidos")).respuesta).toBe("Llevas 1 pedidos.");
    expect((await ejecutar("consulta_hoy")).respuesta).toStartWith("Hoy a caja irían 0 pesos");
  });

  test("buscar recorre domicilios, pedidos y gastos", async () => {
    await data.insert("herr_domicilios", { id: "d1", name: "Calle Morelos 45", search_field: "calle morelos 45", is_active: true });
    await ejecutar("pedido_registrar", { cantidad: "250", domicilio: "morelos" });
    expect((await ejecutar("buscar")).respuesta).toBe("Dime qué busco.");
    const r = await ejecutar("buscar", { busqueda: "Morelos" });
    expect(r.respuesta).toBe("Encontré 2. Domicilios: Calle Morelos 45. Pedidos: Pedido 1 · Calle Morelos 45.");
    expect((await ejecutar("buscar", { busqueda: "zzz" })).respuesta).toBe("No encontré nada para zzz.");
  });

  test("cerrar el día termina la jornada y liquida", async () => {
    await pedido_cobrado("250");
    const r = await ejecutar("cerrar_dia");
    expect(r.respuesta).toBe("Cerré el día. 1 pedidos entregados. Entregas 250 pesos a caja.");
    expect(await jornada_activa(ctx)).toBeNull();
    expect((await ejecutar("cerrar_dia")).respuesta).toBe("No hay jornada en curso.");
  });
});
