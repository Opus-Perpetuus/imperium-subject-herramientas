import { new_id, now_iso, type DomainRow, type KirletCtx } from "@opus-perpetuus/imperium-core-kit";
import {
  booleano,
  campo_busqueda,
  centavos,
  falla,
  fecha_hoy,
  fila_o_404,
  filas_de,
  hora_ahora,
  numero,
  sello_ahora,
  solo_dia,
  texto,
} from "../comun.ts";
import { calcular, hora_hhmm, tramos_desde, type Tramo } from "../jornadas/jornada.ts";
import {
  APORTE,
  FUENTES_GASTO,
  disponible,
  efectivo_en_mano,
  liquidar as cuenta_liquidacion,
  tipo_caja,
  type Liquidacion,
} from "../liquidacion/liquidacion.ts";
import { ESTADOS, ETIQUETA_ESTADO, es_abierto, es_entregado, estado_de, siguiente_orden, type Estado } from "../pedidos/estado.ts";
import { catalogo_de } from "../precios/catalogo.ts";
import { cotizar, lineas_desde } from "../precios/motor.ts";
import { nombre_vehiculo } from "../vehiculos/externo.ts";

/**
 * Las operaciones de Reparto que escriben: ciclo de la jornada, liquidación,
 * estados del pedido y alta de gastos. Las usan las rutas HTTP y el asistente
 * de voz, para que las dos entradas apliquen las mismas reglas. Los errores
 * salen con `falla` (KirletHttpError).
 */

export type CtxReparto = Pick<KirletCtx, "data" | "actor">;
type CtxLectura = Pick<KirletCtx, "data">;

const EPS = 1e-9;

// ─── Jornada ────────────────────────────────────────────────────────────────

/** La jornada abierta más reciente, o null si no hay ninguna en curso. */
export async function jornada_activa(ctx: CtxLectura): Promise<DomainRow | null> {
  const [fila] = await ctx.data.findMany("herr_jornadas", {
    where: { estado: "abierta", is_active: true },
    orderBy: { created_at: "desc" },
    limit: 1,
  });
  return fila ?? null;
}

/**
 * Ajustes de reparto del vehículo (`herr_vehiculos`, clave `vehiculo_id` =
 * id del `vehicle` de subject-vehiculos), o null si no hay fila: entonces
 * el vehículo mide con odómetro y no se conoce la capacidad del tanque.
 */
export async function ajustes_vehiculo(ctx: CtxLectura, vehiculo_id: unknown): Promise<DomainRow | null> {
  const id = texto(vehiculo_id);
  if (!id) return null;
  const fila = await ctx.data.findOne("herr_vehiculos", { vehiculo_id: id });
  return fila && fila.is_active !== false ? fila : null;
}

async function jornada_abierta(ctx: CtxLectura, id: string): Promise<DomainRow> {
  const jornada = await fila_o_404(ctx, "herr_jornadas", id, "La jornada");
  if (jornada.estado !== "abierta") falla(409, "La jornada ya está cerrada", "conflict");
  return jornada;
}

/** Metros GPS de la jornada: la suma de sus rutas (Android puede reiniciar la ruta a media jornada). */
export async function metros_gps(ctx: CtxLectura, jornada_id: string): Promise<number> {
  const rutas = await filas_de(ctx, "herr_rutas", { jornada_id, is_active: true });
  return rutas.reduce((s, r) => s + (numero(r.distancia_m) ?? 0), 0);
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

export type InicioJornada = {
  vehiculo_id?: unknown;
  vehiculo_nombre?: unknown;
  km_inicial?: unknown;
  gasolina_inicial?: unknown;
  solo_gps?: unknown;
  fin_programado?: unknown;
};

/**
 * Abre la jornada del día. `vehiculo_id` es el id del `vehicle` de
 * subject-vehiculos; los ajustes de reparto (solo GPS, tanque) se leen de
 * `herr_vehiculos` si existen. Una sola jornada abierta a la vez.
 */
export async function iniciar_jornada(ctx: CtxReparto, datos: InicioJornada = {}): Promise<DomainRow> {
  if (await jornada_activa(ctx)) falla(409, "Ya hay una jornada abierta", "conflict");
  const fin_texto = texto(datos.fin_programado);
  const fin_programado = fin_texto ? hora_hhmm(fin_texto) : null;
  if (fin_texto && !fin_programado) falla(400, "La hora de fin programado debe ser HH:mm", "validation_error");
  const vehiculo_id = texto(datos.vehiculo_id);
  const ajustes = await ajustes_vehiculo(ctx, vehiculo_id);
  const vehiculo_nombre = vehiculo_id ? await nombre_vehiculo(ctx, vehiculo_id, datos.vehiculo_nombre) : null;

  const solo_gps = booleano(datos.solo_gps) || ajustes?.solo_gps === true;
  const km_inicial = solo_gps ? null : numero(datos.km_inicial);
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
    gasolina_inicial: texto(datos.gasolina_inicial) || null,
    gasolina_final: null,
    entregas: 0,
    ingreso: null,
    gasto_gasolina: null,
    ruta_id: null,
    solo_gps,
    fin_programado,
    tramos: vehiculo_id ? [tramo_nuevo(vehiculo_id, vehiculo_nombre!, km_inicial, 0)] : [],
    notas: null,
    created_at: ts,
    updated_at: ts,
  };
  fila.search_field = campo_busqueda(fila.name, vehiculo_nombre, fila.estado);
  Object.assign(fila, calcular(fila, ajustes));
  return ctx.data.insert("herr_jornadas", fila);
}

export type CambioVehiculo = {
  vehiculo_id: unknown;
  vehiculo_nombre?: unknown;
  /** Odómetro del vehículo que se deja. */
  km_final_tramo?: unknown;
  /** Odómetro del vehículo que se toma. */
  km_inicial?: unknown;
};

/** Cierra el tramo del vehículo que se deja y abre otro con el que se toma; la ruta GPS sigue. */
export async function cambiar_vehiculo(ctx: CtxReparto, jornada_id: string, datos: CambioVehiculo): Promise<DomainRow> {
  const jornada = await jornada_abierta(ctx, jornada_id);
  const vehiculo_id = texto(datos.vehiculo_id);
  if (!vehiculo_id) falla(400, "Elige un vehículo", "validation_error");
  if (vehiculo_id === texto(jornada.vehiculo_id)) falla(409, "Ya estás en ese vehículo", "conflict");
  const ajustes = await ajustes_vehiculo(ctx, vehiculo_id);
  const vehiculo_nombre = await nombre_vehiculo(ctx, vehiculo_id, datos.vehiculo_nombre);
  const id = String(jornada.id);
  const metros = await metros_gps(ctx, id);
  const solo_gps = jornada.solo_gps === true;
  const tramos = [
    ...cerrar_tramo(tramos_desde(jornada.tramos), solo_gps ? null : numero(datos.km_final_tramo), metros),
    tramo_nuevo(vehiculo_id, vehiculo_nombre, solo_gps || ajustes?.solo_gps === true ? null : numero(datos.km_inicial), metros),
  ];
  const patch: DomainRow = {
    vehiculo_id,
    vehiculo_nombre,
    tramos,
    search_field: campo_busqueda(jornada.name, vehiculo_nombre, jornada.estado, jornada.notas),
    updated_at: now_iso(),
  };
  return (await ctx.data.update("herr_jornadas", { id }, patch))!;
}

export type CierreJornada = { km_final?: unknown; gasolina_final?: unknown; entregas?: unknown; ingreso?: unknown };

/**
 * Cierra la jornada y entrega el cobro (la liquidación, sin devolver el fondo
 * de cambio). Lo que no llega se deriva de la propia jornada: entregas e
 * ingreso de sus pedidos entregados, gasto en gasolina de sus recargas. Un
 * ingreso o gasto ya capturado (distinto de cero) se respeta.
 */
export async function terminar_jornada(
  ctx: CtxReparto,
  jornada_id: string,
  datos: CierreJornada = {},
): Promise<{ jornada: DomainRow; liquidacion: VistaLiquidacion & { sello: string | null } }> {
  const jornada = await jornada_abierta(ctx, jornada_id);
  const id = String(jornada.id);
  const km_final = jornada.solo_gps === true ? null : numero(datos.km_final);
  const [metros, pedidos, recargas, ajustes] = await Promise.all([
    metros_gps(ctx, id),
    filas_de(ctx, "herr_pedidos", { jornada_id: id, is_active: true }),
    filas_de(ctx, "herr_gastos", { jornada_id: id, is_active: true, recarga_id: { isNotNull: true } }),
    ajustes_vehiculo(ctx, jornada.vehiculo_id),
  ]);
  const entregados = pedidos.filter((p) => es_entregado(estado_de(p)));
  const suma = (filas: DomainRow[], campo: string) => centavos(filas.reduce((s, f) => s + (numero(f[campo]) ?? 0), 0));

  const patch: DomainRow = {
    estado: "cerrada",
    hora_fin: hora_ahora(),
    km_final,
    gasolina_final: texto(datos.gasolina_final) || jornada.gasolina_final || null,
    entregas: numero(datos.entregas) ?? entregados.length,
    ingreso: numero(datos.ingreso) ?? (numero(jornada.ingreso) || suma(entregados, "cobrar")),
    gasto_gasolina: numero(jornada.gasto_gasolina) || suma(recargas, "cantidad"),
    km_gps: metros > 0 ? Math.round(metros / 100) / 10 : (jornada.km_gps ?? 0),
    tramos: cerrar_tramo(tramos_desde(jornada.tramos), km_final, metros),
    updated_at: now_iso(),
  };
  Object.assign(patch, calcular({ ...jornada, ...patch }, ajustes));
  patch.search_field = campo_busqueda(jornada.name, jornada.vehiculo_nombre, patch.estado, jornada.notas);
  const cerrada = (await ctx.data.update("herr_jornadas", { id }, patch))!;
  return { jornada: cerrada, liquidacion: await liquidar(ctx, id) };
}

// ─── Liquidación ────────────────────────────────────────────────────────────

export type VistaLiquidacion = Liquidacion & { disponible: number; efectivo_en_mano: number };

/** Solo lo que aún no se liquidó: el histórico cobrado no cuenta y no se lee. */
async function pendientes(ctx: CtxLectura) {
  const [pedidos, gastos, caja] = await Promise.all([
    filas_de(ctx, "herr_pedidos", { is_active: true, cobrado: { ne: true } }),
    filas_de(ctx, "herr_gastos", { is_active: true, fuente: "cobros", descontado: { ne: true } }),
    filas_de(ctx, "herr_caja", { is_active: true, saldado: { ne: true } }),
  ]);
  return { pedidos, gastos, caja };
}

/**
 * El efectivo de cobros que hay en el bolsillo (ver `disponible`), sin contar
 * el gasto `excluir_gasto_id` (el que se está editando).
 */
export async function disponible_cobros(ctx: CtxLectura, excluir_gasto_id?: string): Promise<number> {
  const p = await pendientes(ctx);
  return disponible(p.pedidos, excluir_gasto_id ? p.gastos.filter((g) => String(g.id) !== excluir_gasto_id) : p.gastos);
}

/** Un gasto de fuente «cobros» no puede superar lo disponible. */
export async function exigir_disponible(ctx: CtxLectura, cantidad: number, excluir_gasto_id?: string): Promise<void> {
  if (cantidad > (await disponible_cobros(ctx, excluir_gasto_id)) + EPS) {
    falla(400, "No hay dinero de cobros para cubrirlo", "validation_error");
  }
}

type Pendientes = Awaited<ReturnType<typeof pendientes>>;

function vista_de(p: Pendientes, jornada_id: string | null): VistaLiquidacion {
  return {
    ...cuenta_liquidacion(p.pedidos, p.gastos, jornada_id, p.caja),
    disponible: disponible(p.pedidos, p.gastos),
    efectivo_en_mano: efectivo_en_mano(p.pedidos, p.gastos, p.caja),
  };
}

/**
 * La liquidación tal como quedaría ahora mismo: todo lo pendiente de todas
 * las jornadas; `jornada_id` solo decide qué es «de hoy» en el desglose.
 */
export async function vista_liquidacion(ctx: CtxLectura, jornada_id: string | null): Promise<VistaLiquidacion> {
  if (jornada_id) await fila_o_404(ctx, "herr_jornadas", jornada_id, "La jornada");
  return vista_de(await pendientes(ctx), jornada_id);
}

/**
 * «Entregar cobros». Recalcula aquí, sobre lo pendiente en este instante, y
 * estampa el mismo sello en todo: pedidos cobrados, gastos cubiertos y caja
 * (los aportes siempre; el fondo de cambio solo si `devolver_cambio`, porque
 * se suele conservar de un día para otro).
 */
export async function liquidar(
  ctx: CtxLectura,
  jornada_id: string | null,
  opciones: { devolver_cambio?: unknown } = {},
): Promise<VistaLiquidacion & { sello: string | null }> {
  if (jornada_id) await fila_o_404(ctx, "herr_jornadas", jornada_id, "La jornada");
  const p = await pendientes(ctx);
  const vista = vista_de(p, jornada_id);
  const devolver_cambio = booleano(opciones.devolver_cambio);
  const caja_a_saldar = p.caja.filter(
    (m) => vista.caja_ids.includes(String(m.id)) && (devolver_cambio || tipo_caja(m) === APORTE),
  );
  // Sin cobrables ni caja que saldar (p. ej. solo el fondo de cambio que se conserva) no se mueve nada.
  if (!vista.pedido_ids.length && !caja_a_saldar.length) return { ...vista, sello: null };

  const marca = sello_ahora();
  const ts = now_iso();
  await ctx.data.batch([
    ...vista.pedido_ids.map((pid) => ({
      op: "update",
      table: "herr_pedidos",
      where: { id: pid },
      patch: { cobrado: true, estado: "cobrado", liquidacion: marca, updated_at: ts },
    })),
    ...vista.gasto_ids.map((gid) => ({
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
  return { ...vista, sello: marca };
}

const CAMPOS_INOCUOS = new Set(["description", "notas", "updated_at"]);

function mismo_valor(a: unknown, b: unknown): boolean {
  if (texto(a) === "" && texto(b) === "") return true;
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

/**
 * Una fila liquidada (con sello en `liquidacion`) ya es dinero entregado: el
 * CRUD solo puede cambiarle la descripción o las notas. Sin `patch`, es un
 * borrado. Se comparan valores, no claves: el formulario reenvía la fila entera.
 */
export function exigir_no_liquidada(existente: DomainRow, patch?: DomainRow): void {
  if (!texto(existente.liquidacion)) return;
  const tocados = patch
    ? Object.keys(patch).filter((k) => !CAMPOS_INOCUOS.has(k) && !mismo_valor(patch[k], existente[k]))
    : ["borrar"];
  if (tocados.length) {
    falla(409, "Ya está liquidado: solo se puede cambiar la descripción o las notas", "conflict");
  }
}

// ─── Pedidos ────────────────────────────────────────────────────────────────

/**
 * Lo que se deriva de una fila completa de pedido. Con `productos_json` se
 * cotiza y se reescribe la prosa (con la promoción aplicada: sin ella, el
 * descuento en `cobrar` no se puede cuadrar); `cobrar` solo se rellena cuando
 * nadie lo tecleó: en cuanto se corrige a mano, manda la mano. Un JSON roto o
 * vacío no toca nada («si se borra, no pasa nada»). El estado se lee con
 * `estado_de` y solo se reescribe cuando `estado` o `cobrado` cambian.
 */
export async function derivados_pedido(
  ctx: CtxLectura,
  fila: DomainRow,
  opts: { cotizar: boolean; rellenar_cobrar: boolean; estado: boolean },
): Promise<DomainRow> {
  const out: DomainRow = {};
  if (opts.cotizar && fila.productos_json != null) {
    const { lineas, promo_id } = lineas_desde(fila.productos_json);
    if (lineas.length) {
      const catalogo = await catalogo_de(ctx);
      const q = cotizar(lineas, catalogo, promo_id);
      const promo = promo_id ? catalogo.promos[promo_id] : undefined;
      out.productos = [q.productos, promo ? `Promoción: ${promo.nombre}` : ""].filter(Boolean).join("\n");
      if (opts.rellenar_cobrar) out.cobrar = q.total;
    }
  }
  const cobrar = numero(out.cobrar ?? fila.cobrar) ?? 0;
  const recibido = numero(fila.recibido);
  out.propina = recibido == null ? 0 : Math.max(0, recibido - cobrar);
  if (opts.estado) {
    const estado = estado_de(fila);
    if (!(ESTADOS as readonly string[]).includes(estado)) falla(400, "Estado de pedido no válido", "validation_error");
    out.estado = estado;
  }
  const domicilio = texto(fila.domicilio_texto);
  out.name = domicilio ? `Pedido ${fila.orden} · ${domicilio}` : `Pedido ${fila.orden}`;
  out.search_field = campo_busqueda(
    out.name,
    fila.contacto_nombre,
    fila.telefono,
    out.productos ?? fila.productos,
    fila.detalle,
    fila.fecha,
  );
  return out;
}

/**
 * La fila completa de un pedido nuevo: el siguiente orden de entrega, fecha y
 * hora de ahora, la jornada abierta si no se indica otra, estado «capturado»
 * y los derivados (precio y prosa desde `productos_json`, propina, nombre).
 * El autor es siempre quien lo registra.
 */
export async function preparar_pedido(ctx: CtxReparto, row: DomainRow): Promise<DomainRow> {
  const fila: DomainRow = {
    ...row,
    created_by: ctx.actor,
    liquidacion: null,
    fecha: texto(row.fecha) || fecha_hoy(),
    hora: texto(row.hora) || hora_ahora(),
    orden: numero(row.orden) ?? siguiente_orden(await filas_de(ctx, "herr_pedidos", { is_active: true, cobrado: { ne: true } })),
    jornada_id: texto(row.jornada_id) || ((await jornada_activa(ctx))?.id ?? null),
    cobrado: booleano(row.cobrado),
    // Nuevo y sin estado = en el mostrador; `estado_de` leería el vacío como «entregado».
    estado: texto(row.estado) || "capturado",
  };
  return {
    ...fila,
    ...(await derivados_pedido(ctx, fila, { cotizar: true, rellenar_cobrar: numero(row.cobrar) == null, estado: true })),
  };
}

export type PedidoNuevo = {
  cobrar?: unknown;
  domicilio_texto?: unknown;
  domicilio_id?: unknown;
  detalle?: unknown;
  productos_json?: unknown;
  jornada_id?: unknown;
};

/** Registra un pedido con las reglas del CRUD (ver `preparar_pedido`). */
export async function registrar_pedido(ctx: CtxReparto, datos: PedidoNuevo): Promise<DomainRow> {
  const ts = now_iso();
  const row: DomainRow = {
    id: new_id("pedido"),
    description: "",
    is_active: true,
    cobrar: numero(datos.cobrar),
    recibido: null,
    domicilio_texto: texto(datos.domicilio_texto),
    domicilio_id: texto(datos.domicilio_id) || null,
    contacto_nombre: "",
    telefono: "",
    detalle: texto(datos.detalle),
    productos: "",
    productos_json: datos.productos_json ?? null,
    jornada_id: datos.jornada_id,
    hora_surtido: null,
    hora_entrega: null,
    created_at: ts,
    updated_at: ts,
  };
  return ctx.data.insert("herr_pedidos", await preparar_pedido(ctx, row));
}

export type DestinoPedido = Extract<Estado, "surtido" | "en_ruta" | "entregado">;

/**
 * Mueve el pedido hacia delante en el flujo (capturado → surtido → en ruta →
 * entregado; se puede saltar pasos, nunca volver). Repetir el mismo paso no
 * hace nada salvo anotar `recibido`: entregar dos veces no cuenta dos visitas
 * al domicilio. `recibido` es opcional: entregar y cobrar son dos cosas.
 */
export async function avanzar_pedido(
  ctx: CtxReparto,
  pedido_id: string,
  destino: DestinoPedido,
  datos: { recibido?: unknown } = {},
): Promise<DomainRow> {
  const pedido = await fila_o_404(ctx, "herr_pedidos", pedido_id, "El pedido");
  const actual = estado_de(pedido);
  if (actual === "cobrado") falla(409, "El pedido ya está cobrado", "conflict");
  const cambios: DomainRow = {};
  const recibido = numero(datos.recibido);
  if (recibido != null) {
    if (recibido < 0) falla(400, "Lo recibido no puede ser negativo", "validation_error");
    cambios.recibido = recibido;
    cambios.propina = Math.max(0, recibido - (numero(pedido.cobrar) ?? 0));
  }
  const id = String(pedido.id);
  if (actual === destino) {
    if (!Object.keys(cambios).length) return pedido;
    return (await ctx.data.update("herr_pedidos", { id }, { ...cambios, updated_at: now_iso() }))!;
  }
  if (!es_abierto(actual) || ESTADOS.indexOf(destino) < ESTADOS.indexOf(actual as Estado)) {
    const etiqueta = ETIQUETA_ESTADO[actual as Estado] ?? actual;
    falla(409, `El pedido está ${etiqueta.toLowerCase()}: no puede pasar a ${ETIQUETA_ESTADO[destino].toLowerCase()}`, "conflict");
  }
  if (destino === "surtido") cambios.hora_surtido = hora_ahora();
  if (destino === "entregado") cambios.hora_entrega = hora_ahora();
  const actualizado = (await ctx.data.update("herr_pedidos", { id }, { estado: destino, ...cambios, updated_at: now_iso() }))!;

  const domicilio_id = texto(pedido.domicilio_id);
  if (destino === "entregado" && domicilio_id) {
    const domicilio = await ctx.data.findOne("herr_domicilios", { id: domicilio_id });
    if (domicilio) {
      const ts = now_iso();
      await ctx.data.update(
        "herr_domicilios",
        { id: domicilio_id },
        { veces: (numero(domicilio.veces) ?? 0) + 1, ultima_entrega: ts, updated_at: ts },
      );
    }
  }
  return actualizado;
}

// ─── Gastos ─────────────────────────────────────────────────────────────────

export function fuente_gasto(valor: unknown): string {
  const fuente = texto(valor) || "cobros";
  if (!(FUENTES_GASTO as readonly string[]).includes(fuente)) {
    falla(400, `La fuente debe ser ${FUENTES_GASTO.join(" o ")}`, "validation_error");
  }
  return fuente;
}

export function nombre_y_busqueda_gasto(fila: DomainRow): DomainRow {
  const name = texto(fila.motivo) || "Gasto";
  return { name, search_field: campo_busqueda(name, fila.fuente, fila.fecha) };
}

/**
 * La fila completa de un gasto nuevo: fuente válida (uno de «caja» nace
 * descontado), dinero de cobros suficiente, fecha y hora de ahora y la
 * jornada abierta si no se indica otra. El autor es siempre quien lo registra.
 */
export async function preparar_gasto(ctx: CtxReparto, row: DomainRow): Promise<DomainRow> {
  const fuente = fuente_gasto(row.fuente);
  const descontado = fuente === "caja" ? true : booleano(row.descontado);
  const cantidad = numero(row.cantidad);
  if (cantidad == null || cantidad < 0) falla(400, "La cantidad no puede ser negativa", "validation_error");
  if (fuente === "cobros" && !descontado) await exigir_disponible(ctx, cantidad);
  const fila: DomainRow = {
    ...row,
    cantidad,
    fuente,
    descontado,
    created_by: ctx.actor,
    liquidacion: null,
    fecha: texto(solo_dia(row.fecha)) || fecha_hoy(),
    hora: texto(row.hora) || hora_ahora(),
    jornada_id: texto(row.jornada_id) || ((await jornada_activa(ctx))?.id ?? null),
  };
  return { ...fila, ...nombre_y_busqueda_gasto(fila) };
}

export type GastoNuevo = {
  cantidad: unknown;
  motivo?: unknown;
  fuente?: unknown;
  jornada_id?: unknown;
  fecha?: unknown;
  hora?: unknown;
  description?: unknown;
};

/** Registra un gasto con las reglas del CRUD (ver `preparar_gasto`). */
export async function registrar_gasto(ctx: CtxReparto, datos: GastoNuevo): Promise<DomainRow> {
  const ts = now_iso();
  const row: DomainRow = {
    id: new_id("gasto"),
    description: texto(datos.description),
    is_active: true,
    motivo: texto(datos.motivo) || null,
    cantidad: datos.cantidad,
    fuente: datos.fuente,
    jornada_id: datos.jornada_id,
    fecha: datos.fecha,
    hora: datos.hora,
    created_at: ts,
    updated_at: ts,
  };
  return ctx.data.insert("herr_gastos", await preparar_gasto(ctx, row));
}
