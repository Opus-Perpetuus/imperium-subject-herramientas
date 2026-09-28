import { define_routes, new_id, now_iso, type DomainRow, type KirletCtx } from "@opus-perpetuus/imperium-core-kit";
import { booleano, campo_busqueda, falla, fecha_hoy, fila_o_404, filas_de, hora_ahora, numero, texto } from "../../lib/comun.ts";
import { HORA, ajustes_vehiculo, calcular, jornada_activa, tramos_desde, type Tramo } from "../../lib/jornadas/jornada.ts";
import { APORTE, sello, tipo_caja, vista_previa, type VistaPrevia } from "../../lib/liquidacion/liquidacion.ts";
import { es_entregado, estado_de } from "../../lib/pedidos/estado.ts";
import { nombre_vehiculo } from "../../lib/vehiculos/externo.ts";

async function jornada_abierta(ctx: KirletCtx, id: string): Promise<DomainRow> {
  const jornada = await fila_o_404(ctx, "herr_jornadas", id, "La jornada");
  if (jornada.estado !== "abierta") falla(409, "La jornada ya está cerrada", "conflict");
  return jornada;
}

/** Metros GPS acumulados de la ruta de la jornada (tabla del módulo de rutas), 0 si no hay. */
async function metros_gps(ctx: KirletCtx, jornada_id: string): Promise<number> {
  const ruta = await ctx.data.findOne("herr_rutas", { jornada_id });
  return numero(ruta?.distancia_m) ?? 0;
}

function tramo_nuevo(vehiculo_id: string, vehiculo_nombre: string, km_inicial: number | null, gps_m_inicio: number): Tramo {
  return { vehiculo_id, vehiculo_nombre, inicio: now_iso(), fin: null, km_inicial, km_final: null, gps_m_inicio, gps_m_fin: null };
}

/** Cierra el tramo abierto (el último) con la lectura de odómetro y el corte GPS. */
function cerrar_tramo(tramos: Tramo[], km_final: number | null, gps_m_fin: number): Tramo[] {
  const ultimo = tramos[tramos.length - 1];
  if (!ultimo || ultimo.fin) return tramos;
  return [...tramos.slice(0, -1), { ...ultimo, fin: now_iso(), km_final, gps_m_fin }];
}

/** La vista previa sin las filas crudas que solo necesita el commit. */
function resumen(vp: VistaPrevia) {
  const { pedidos: _p, gastos: _g, caja: _c, ...resto } = vp;
  return resto;
}

export const herr_jornadas_flow = define_routes({
  "GET /herr-jornadas/activa": async (ctx) => {
    const activa = await jornada_activa(ctx);
    if (!activa) falla(404, "No hay una jornada abierta", "not_found");
    return { data: activa };
  },

  /**
   * `vehiculo_id` es el id del `vehicle` de subject-vehiculos; los ajustes
   * de reparto (solo GPS, tanque) se leen de `herr_vehiculos` si existen.
   */
  "POST /herr-jornadas/iniciar": async (ctx) => {
    const body = await ctx.body<{
      vehiculo_id?: unknown;
      vehiculo_nombre?: unknown;
      km_inicial?: unknown;
      gasolina_inicial?: unknown;
      solo_gps?: unknown;
      fin_programado?: unknown;
    }>();
    if (await jornada_activa(ctx)) falla(409, "Ya hay una jornada abierta", "conflict");
    const fin_programado = texto(body.fin_programado);
    if (fin_programado && !HORA.test(fin_programado)) falla(400, "La hora de fin programado debe ser HH:mm", "validation_error");
    const vehiculo_id = texto(body.vehiculo_id);
    const ajustes = await ajustes_vehiculo(ctx, vehiculo_id);
    const vehiculo_nombre = vehiculo_id ? await nombre_vehiculo(ctx, vehiculo_id, body.vehiculo_nombre) : null;

    const solo_gps = booleano(body.solo_gps) || ajustes?.solo_gps === true;
    const km_inicial = solo_gps ? null : numero(body.km_inicial);
    const fecha = fecha_hoy();
    const ts = now_iso();
    const fila: DomainRow = {
      id: new_id("jornada"),
      name: `Jornada ${fecha}`,
      description: "",
      is_active: true,
      created_by: ctx.actor,
      fecha,
      hora_inicio: hora_ahora(),
      hora_fin: null,
      vehiculo_id: vehiculo_id || null,
      vehiculo_nombre,
      estado: "abierta",
      km_inicial,
      km_final: null,
      km_gps: 0,
      gasolina_inicial: texto(body.gasolina_inicial) || null,
      gasolina_final: null,
      entregas: 0,
      ingreso: null,
      gasto_gasolina: null,
      ruta_id: null,
      solo_gps,
      fin_programado: fin_programado || null,
      tramos: vehiculo_id ? [tramo_nuevo(vehiculo_id, vehiculo_nombre!, km_inicial, 0)] : [],
      notas: null,
      created_at: ts,
      updated_at: ts,
    };
    fila.search_field = campo_busqueda(fila.name, vehiculo_nombre, fila.estado);
    Object.assign(fila, calcular(fila, numero(ajustes?.tanque_litros)));
    return ctx.created(await ctx.data.insert("herr_jornadas", fila));
  },

  "POST /herr-jornadas/:id/terminar": async (ctx) => {
    const body = await ctx.body<{ km_final?: unknown; gasolina_final?: unknown; entregas?: unknown; ingreso?: unknown }>();
    const jornada = await jornada_abierta(ctx, ctx.params.id!);
    const id = String(jornada.id);
    const km_final = jornada.solo_gps === true ? null : numero(body.km_final);
    const metros = await metros_gps(ctx, id);
    const pedidos = await filas_de(ctx, "herr_pedidos", { jornada_id: id, is_active: true });
    const entregas = numero(body.entregas) ?? pedidos.filter((p) => es_entregado(estado_de(p))).length;
    const ajustes = await ajustes_vehiculo(ctx, jornada.vehiculo_id);

    const patch: DomainRow = {
      estado: "cerrada",
      hora_fin: hora_ahora(),
      km_final,
      gasolina_final: texto(body.gasolina_final) || jornada.gasolina_final || null,
      entregas,
      ingreso: numero(body.ingreso) ?? jornada.ingreso ?? null,
      km_gps: metros > 0 ? Math.round(metros / 100) / 10 : jornada.km_gps ?? 0,
      tramos: cerrar_tramo(tramos_desde(jornada.tramos), km_final, metros),
      updated_at: now_iso(),
    };
    Object.assign(patch, calcular({ ...jornada, ...patch }, numero(ajustes?.tanque_litros)));
    patch.search_field = campo_busqueda(jornada.name, jornada.vehiculo_nombre, patch.estado, jornada.notas);
    return { data: await ctx.data.update("herr_jornadas", { id }, patch) };
  },

  /** Cierra el tramo del vehículo que se deja y abre otro con el que se toma; la ruta GPS sigue. */
  "POST /herr-jornadas/:id/cambiar-vehiculo": async (ctx) => {
    const body = await ctx.body<{ vehiculo_id?: unknown; vehiculo_nombre?: unknown; km_inicial?: unknown; km_final?: unknown }>();
    const jornada = await jornada_abierta(ctx, ctx.params.id!);
    const vehiculo_id = texto(body.vehiculo_id);
    if (!vehiculo_id) falla(400, "Elige un vehículo", "validation_error");
    const ajustes = await ajustes_vehiculo(ctx, vehiculo_id);
    const vehiculo_nombre = await nombre_vehiculo(ctx, vehiculo_id, body.vehiculo_nombre);
    const id = String(jornada.id);
    const metros = await metros_gps(ctx, id);
    const solo_gps = jornada.solo_gps === true;
    const tramos = [
      ...cerrar_tramo(tramos_desde(jornada.tramos), solo_gps ? null : numero(body.km_final), metros),
      tramo_nuevo(vehiculo_id, vehiculo_nombre, solo_gps || ajustes?.solo_gps === true ? null : numero(body.km_inicial), metros),
    ];
    const patch: DomainRow = {
      vehiculo_id,
      vehiculo_nombre,
      tramos,
      search_field: campo_busqueda(jornada.name, vehiculo_nombre, jornada.estado, jornada.notas),
      updated_at: now_iso(),
    };
    return { data: await ctx.data.update("herr_jornadas", { id }, patch) };
  },

  "GET /herr-jornadas/:id/liquidacion": async (ctx) => {
    const jornada = await fila_o_404(ctx, "herr_jornadas", ctx.params.id!, "La jornada");
    return { data: resumen(await vista_previa(ctx, String(jornada.id))) };
  },

  /**
   * «Entregar cobros». Recalcula aquí, sobre lo pendiente en este instante, y
   * estampa el mismo sello en todo: pedidos cobrados, gastos cubiertos y caja
   * (los aportes siempre; el fondo de cambio solo si `devolver_cambio`, porque
   * se suele conservar de un día para otro).
   */
  "POST /herr-jornadas/:id/liquidar": async (ctx) => {
    const body = await ctx.body<{ devolver_cambio?: unknown }>();
    const jornada = await fila_o_404(ctx, "herr_jornadas", ctx.params.id!, "La jornada");
    const vp = await vista_previa(ctx, String(jornada.id));
    if (vp.nada_que_cobrar) return { data: { ...resumen(vp), sello: null } };

    const marca = sello(fecha_hoy(), hora_ahora());
    const ts = now_iso();
    const devolver_cambio = booleano(body.devolver_cambio);
    const caja_a_saldar = vp.caja.filter(
      (m) => vp.caja_ids.includes(String(m.id)) && (devolver_cambio || tipo_caja(m) === APORTE),
    );
    await ctx.data.batch([
      ...vp.pedido_ids.map((pid) => ({
        op: "update",
        table: "herr_pedidos",
        where: { id: pid },
        patch: { cobrado: true, estado: "cobrado", liquidacion: marca, updated_at: ts },
      })),
      ...vp.gasto_ids.map((gid) => ({
        op: "update",
        table: "herr_gastos",
        where: { id: gid },
        patch: { descontado: true, liquidacion: marca, updated_at: ts },
      })),
      ...caja_a_saldar.map((m) => ({
        op: "update",
        table: "herr_caja",
        where: { id: String(m.id) },
        patch: { saldado: true, liquidacion: marca, updated_at: ts },
      })),
    ]);
    return { data: { ...resumen(vp), sello: marca } };
  },
});
