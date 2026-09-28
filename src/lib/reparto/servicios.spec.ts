import { beforeEach, describe, expect, test } from "bun:test";
import { MemoryKirletDataClient, type DomainRow } from "@opus-perpetuus/imperium-core-kit";
import { SUBJECT } from "../../subject.ts";
import {
  avanzar_pedido,
  cambiar_vehiculo,
  disponible_cobros,
  iniciar_jornada,
  jornada_activa,
  liquidar,
  registrar_gasto,
  registrar_pedido,
  terminar_jornada,
  vista_liquidacion,
  type CtxReparto,
} from "./servicios.ts";

// Sin gateway: el nombre del vehículo cae al snapshot.
delete process.env.CORE_DATA_URL;
delete process.env.NOX_DATA_URL;

let data: MemoryKirletDataClient;
let ctx: CtxReparto;

beforeEach(() => {
  data = new MemoryKirletDataClient(SUBJECT.schema());
  data.seed("herr_vehiculos", [
    { id: "aj1", vehiculo_id: "v1", name: "Moto roja", tanque_litros: 12, solo_gps: false, is_active: true },
    { id: "aj2", vehiculo_id: "v2", name: "Moto sin velocímetro", tanque_litros: 10, solo_gps: true, is_active: true },
  ]);
  data.seed("herr_domicilios", [{ id: "d1", name: "Casa azul", veces: 0, is_active: true }]);
  ctx = { data, actor: "repartidor@x" } as CtxReparto;
});

const status = (p: Promise<unknown>) => p.then(() => 200, (e: { status?: number }) => e.status ?? 500);

function pedido(o: DomainRow): DomainRow {
  return { id: `p${Math.random()}`, name: "P", is_active: true, estado: "capturado", cobrado: false, created_at: "", updated_at: "", ...o };
}

describe("jornada", () => {
  test("iniciar: una sola abierta, hora de fin normalizada, autor el actor", async () => {
    expect(await status(iniciar_jornada(ctx, { fin_programado: "25:00" }))).toBe(400);
    const j = await iniciar_jornada(ctx, { vehiculo_id: "v1", km_inicial: 1000, gasolina_inicial: "5/6", fin_programado: "9:5" });
    expect(j).toMatchObject({ estado: "abierta", fin_programado: "09:05", vehiculo_nombre: "Moto roja", created_by: "repartidor@x" });
    expect((await jornada_activa(ctx))?.id).toBe(j.id);
    expect(await status(iniciar_jornada(ctx, {}))).toBe(409);
  });

  test("cambiar de vehículo: al mismo es 409; el corte GPS suma todas las rutas de la jornada", async () => {
    const j = await iniciar_jornada(ctx, { vehiculo_id: "v1", km_inicial: 100 });
    const id = String(j.id);
    expect(await status(cambiar_vehiculo(ctx, id, { vehiculo_id: "v1" }))).toBe(409);
    data.seed("herr_rutas", [
      { id: "r1", jornada_id: id, distancia_m: 3000, is_active: true },
      { id: "r2", jornada_id: id, distancia_m: 1500, is_active: true },
      { id: "r3", jornada_id: "otra", distancia_m: 9999, is_active: true },
    ]);
    const r = await cambiar_vehiculo(ctx, id, { vehiculo_id: "v2", km_final_tramo: 104 });
    expect((r.tramos as DomainRow[]).map((t) => t.gps_m_fin ?? t.gps_m_inicio)).toEqual([4500, 4500]);
  });

  test("terminar deriva ingreso y gasto en gasolina de la jornada y entrega el cobro", async () => {
    const j = await iniciar_jornada(ctx, { vehiculo_id: "v1", km_inicial: 1000, gasolina_inicial: "6/6" });
    const id = String(j.id);
    data.seed("herr_pedidos", [
      pedido({ id: "a", jornada_id: id, estado: "entregado", cobrar: 250, recibido: 250 }),
      pedido({ id: "b", jornada_id: id, estado: "en_ruta", cobrar: 90 }),
    ]);
    data.seed("herr_gastos", [
      { id: "g", jornada_id: id, fuente: "cobros", descontado: false, cantidad: 100, recarga_id: "rec1", is_active: true, fecha: "2026-01-01" },
    ]);
    const r = await terminar_jornada(ctx, id, { km_final: 1060, gasolina_final: "0/6" });
    expect(r.jornada).toMatchObject({
      estado: "cerrada",
      entregas: 1,
      ingreso: 250,
      gasto_gasolina: 100,
      ganancia_neta: 150,
      km_recorridos: 60,
      gasolina_usada: 12,
      rendimiento: 5,
    });
    expect(r.liquidacion).toMatchObject({ a_caja: 150, pedido_ids: ["a"], gasto_ids: ["g"] });
    expect(r.liquidacion.sello).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
    expect(await data.findOne("herr_pedidos", { id: "a" })).toMatchObject({ cobrado: true, liquidacion: r.liquidacion.sello });
    expect(await status(terminar_jornada(ctx, id))).toBe(409);
  });

  test("un ingreso capturado se respeta; uno en cero se deriva", async () => {
    const j = await iniciar_jornada(ctx, {});
    const id = String(j.id);
    await data.update("herr_jornadas", { id }, { ingreso: 0 });
    data.seed("herr_pedidos", [pedido({ jornada_id: id, estado: "entregado", cobrar: 80 })]);
    expect((await terminar_jornada(ctx, id, { ingreso: 500 })).jornada.ingreso).toBe(500);
    const k = await iniciar_jornada(ctx, {});
    await data.update("herr_jornadas", { id: String(k.id) }, { ingreso: 0 });
    data.seed("herr_pedidos", [pedido({ jornada_id: String(k.id), estado: "entregado", cobrar: 80 })]);
    expect((await terminar_jornada(ctx, String(k.id))).jornada.ingreso).toBe(80);
  });
});

describe("liquidación", () => {
  test("solo lee lo pendiente: lo ya cobrado no cuenta aunque sea enorme", async () => {
    data.seed("herr_pedidos", [
      pedido({ id: "viejo", cobrado: true, estado: "cobrado", cobrar: 99999, recibido: 99999, liquidacion: "2026-01-01 10:00" }),
      pedido({ id: "nuevo", estado: "entregado", cobrar: 120, recibido: 150 }),
    ]);
    const v = await vista_liquidacion(ctx, null);
    expect(v).toMatchObject({ a_caja: 120, propinas: 30, pedido_ids: ["nuevo"], disponible: 120 });
    expect(await status(vista_liquidacion(ctx, "no-existe"))).toBe(404);
    const r = await liquidar(ctx, null);
    expect(r.sello).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
    expect((await liquidar(ctx, null)).sello).toBeNull();
  });

  test("el fondo de cambio solo se salda si se pide", async () => {
    data.seed("herr_caja", [
      { id: "ret", tipo: "retiro_cambio", cantidad: 200, saldado: false, is_active: true },
      { id: "apo", tipo: "aporte_propio", cantidad: 30, saldado: false, is_active: true },
    ]);
    await liquidar(ctx, null);
    expect((await data.findOne("herr_caja", { id: "ret" }))!.saldado).toBe(false);
    expect((await data.findOne("herr_caja", { id: "apo" }))!.saldado).toBe(true);
    await liquidar(ctx, null, { devolver_cambio: true });
    expect((await data.findOne("herr_caja", { id: "ret" }))!.saldado).toBe(true);
  });
});

describe("pedidos", () => {
  test("hacia delante se puede saltar pasos; hacia atrás no; entregar dos veces cuenta una visita", async () => {
    data.seed("herr_pedidos", [pedido({ id: "p1", cobrar: 100, domicilio_id: "d1" })]);
    const e = await avanzar_pedido(ctx, "p1", "entregado", { recibido: 120 });
    expect(e).toMatchObject({ estado: "entregado", recibido: 120, propina: 20 });
    expect(e.hora_entrega).toMatch(/^\d{2}:\d{2}$/);
    const otra = await avanzar_pedido(ctx, "p1", "entregado");
    expect(otra.hora_entrega).toBe(e.hora_entrega);
    expect((await data.findOne("herr_domicilios", { id: "d1" }))!.veces).toBe(1);
    expect(await status(avanzar_pedido(ctx, "p1", "surtido"))).toBe(409);
    expect(await status(avanzar_pedido(ctx, "p1", "entregado", { recibido: -1 }))).toBe(400);
    await data.update("herr_pedidos", { id: "p1" }, { cobrado: true });
    expect(await status(avanzar_pedido(ctx, "p1", "entregado"))).toBe(409);
    expect(await status(avanzar_pedido(ctx, "nada", "surtido"))).toBe(404);
  });

  test("registrar_pedido aplica las reglas del CRUD: orden siguiente, jornada abierta, autor y derivados", async () => {
    data.seed("herr_pedidos", [pedido({ id: "p1", orden: 4, cobrar: 100 })]);
    const jornada = await iniciar_jornada(ctx, { vehiculo_id: "v1" });
    const p = await registrar_pedido(ctx, { cobrar: 250, domicilio_texto: "Calle 5", detalle: "Pedido por voz" });
    expect(p).toMatchObject({
      orden: 5,
      cobrar: 250,
      propina: 0,
      estado: "capturado",
      cobrado: false,
      liquidacion: null,
      created_by: "repartidor@x",
      jornada_id: jornada.id,
      name: "Pedido 5 · Calle 5",
    });
    expect(p.fecha).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(p.hora).toMatch(/^\d{2}:\d{2}$/);
    expect(p.search_field).toContain("pedido por voz");
    expect(await data.findOne("herr_pedidos", { id: String(p.id) })).toMatchObject({ orden: 5 });
  });
});

describe("gastos", () => {
  test("de cobros no pasa del disponible; de caja nace descontado; toma la jornada abierta", async () => {
    const j = await iniciar_jornada(ctx, {});
    data.seed("herr_pedidos", [pedido({ estado: "entregado", cobrar: 100, recibido: 100 })]);
    expect(await disponible_cobros(ctx)).toBe(100);
    expect(await status(registrar_gasto(ctx, { cantidad: 150, motivo: "Llanta" }))).toBe(400);
    const g = await registrar_gasto(ctx, { cantidad: 60, motivo: "Aceite" });
    expect(g).toMatchObject({ fuente: "cobros", descontado: false, jornada_id: j.id, created_by: "repartidor@x", name: "Aceite" });
    expect(await disponible_cobros(ctx)).toBe(40);
    expect(await disponible_cobros(ctx, String(g.id))).toBe(100);
    expect(await registrar_gasto(ctx, { cantidad: 500, fuente: "caja" })).toMatchObject({ descontado: true, name: "Gasto" });
    expect(await status(registrar_gasto(ctx, { cantidad: 1, fuente: "banco" }))).toBe(400);
  });
});
