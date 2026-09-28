import { KirletHttpError, new_id, now_iso, type DomainRow, type KirletCtx } from "@opus-perpetuus/imperium-core-kit";
import { motivo_gasto } from "../combustible/litros.ts";
import {
  booleano,
  campo_busqueda,
  centavos,
  fecha_hoy,
  filas_de,
  hora_ahora,
  normalizar,
  numero,
  texto,
} from "../comun.ts";
import { sugerir_km, tramos_desde } from "../jornadas/jornada.ts";
import { intencion_por_id, type Datos } from "../nlu/intenciones.ts";
import { similitud } from "../nlu/similitud.ts";
import { es_abierto, estado_de } from "../pedidos/estado.ts";
import {
  avanzar_pedido,
  cambiar_vehiculo,
  iniciar_jornada,
  jornada_activa,
  liquidar,
  metros_gps,
  preparar_gasto,
  registrar_gasto,
  registrar_pedido,
  terminar_jornada,
  vista_liquidacion,
  type VistaLiquidacion,
} from "../reparto/servicios.ts";
import { odometro_al_cierre } from "./odometro.ts";

/**
 * Ejecuta una intención ya interpretada sobre Reparto con las mismas
 * operaciones que las rutas HTTP (`lib/reparto/servicios.ts`). Devuelve
 * siempre una frase corta para leer en voz alta; un error de dominio
 * (400/404/409) se dice tal cual.
 */
export type Ejecucion = {
  intencion: string;
  estado: "ejecutado" | "error" | "interpretado";
  resultado: Record<string, unknown> | null;
  respuesta: string;
};

export type CtxVoz = Pick<KirletCtx, "data" | "actor">;

type Salida = Omit<Ejecucion, "intencion">;
type Manejador = (ctx: CtxVoz, datos: Datos) => Promise<Salida>;

const ok = (respuesta: string, resultado: Record<string, unknown> | null = null): Salida => ({
  estado: "ejecutado",
  resultado,
  respuesta,
});
const error = (respuesta: string): Salida => ({ estado: "error", resultado: null, respuesta });

/** «250» o «45.50», como se lee en voz alta. */
export function pesos(v: number): string {
  const c = centavos(v);
  return Number.isInteger(c) ? String(c) : c.toFixed(2);
}

function base(ctx: CtxVoz, prefijo: string, name: string): DomainRow {
  const ts = now_iso();
  return {
    id: new_id(prefijo),
    name,
    description: "",
    is_active: true,
    created_by: ctx.actor,
    search_field: campo_busqueda(name),
    created_at: ts,
    updated_at: ts,
  };
}

const orden_de = (p: DomainRow) => numero(p.orden) ?? Number.POSITIVE_INFINITY;
const suma = (filas: DomainRow[], campo: string) =>
  centavos(filas.reduce((acc, f) => acc + (numero(f[campo]) ?? 0), 0));

/** Nombre con el que se menciona un pedido en voz alta. */
export function alias_pedido(p: DomainRow): string {
  return texto(p.domicilio_texto) || texto(p.productos) || `el pedido ${texto(p.orden)}`.trim();
}

/** La abierta, o la última de hoy para consultar cuando ya se cerró. */
async function jornada_de_hoy(ctx: CtxVoz): Promise<DomainRow | null> {
  const abierta = await jornada_activa(ctx);
  if (abierta) return abierta;
  const [ultima] = await ctx.data.findMany("herr_jornadas", {
    where: { fecha: fecha_hoy(), is_active: true },
    orderBy: { created_at: "desc" },
    limit: 1,
  });
  return ultima ?? null;
}

const pedidos_de = (ctx: CtxVoz, jornada: DomainRow) =>
  filas_de(ctx, "herr_pedidos", { jornada_id: String(jornada.id), is_active: true });

/**
 * Ajustes de reparto por vehículo (`herr_vehiculos`): `vehiculo_id` es el id
 * del `vehicle` de la app Vehículos y `name` el nombre con que se le llama.
 * La jornada y la recarga guardan ese id externo, nunca el de la fila.
 */
type Vehiculo = { vehiculo_id: string; nombre: string };

async function vehiculos(ctx: CtxVoz): Promise<Vehiculo[]> {
  return (await filas_de(ctx, "herr_vehiculos", { is_active: true }))
    .map((v) => ({ vehiculo_id: texto(v.vehiculo_id), nombre: texto(v.name) }))
    .filter((v) => v.vehiculo_id && v.nombre);
}

/** Por nombre: prefijo o contenido, y si no, el más parecido (≥ 0.8). */
function vehiculo_por_nombre(lista: Vehiculo[], pista: string): Vehiculo | null {
  const directo = lista.find((v) => normalizar(v.nombre).includes(pista));
  if (directo) return directo;
  let mejor: { v: Vehiculo; s: number } | null = null;
  for (const v of lista) {
    const s = similitud(normalizar(v.nombre), pista);
    if (s >= 0.8 && (!mejor || s > mejor.s)) mejor = { v, s };
  }
  return mejor?.v ?? null;
}

/** Vehículo por id externo, por nombre parecido, o el único que hay. */
async function vehiculo_para(
  ctx: CtxVoz,
  datos: Datos,
): Promise<{ vehiculo: Vehiculo } | { fallo: Salida }> {
  const lista = await vehiculos(ctx);
  if (!lista.length) return { fallo: error("No hay vehículos configurados para reparto.") };
  const id = texto(datos.vehiculo_id);
  if (id) {
    const v = lista.find((x) => x.vehiculo_id === id);
    return v ? { vehiculo: v } : { fallo: error("No conozco ese vehículo.") };
  }
  const pista = normalizar(datos.vehiculo);
  if (pista) {
    const v = vehiculo_por_nombre(lista, pista);
    return v ? { vehiculo: v } : { fallo: error(`No conozco el vehículo ${datos.vehiculo}.`) };
  }
  if (lista.length === 1) return { vehiculo: lista[0]! };
  const opciones = lista.map((v) => ({ id: v.vehiculo_id, etiqueta: v.nombre }));
  return {
    fallo: {
      estado: "error",
      resultado: { opciones },
      respuesta: `¿Con qué vehículo? Hay: ${opciones.map((o) => o.etiqueta).join(", ")}.`,
    },
  };
}

/** Último odómetro leído del vehículo (ver `sugerir_km`). */
async function km_sugerido(ctx: CtxVoz, vehiculo_id: string): Promise<number | null> {
  return sugerir_km(await filas_de(ctx, "herr_jornadas", { is_active: true }), vehiculo_id);
}

/**
 * Odómetro estimado del vehículo en uso: la lectura con que abrió su tramo
 * más los kilómetros GPS de la jornada desde entonces. Por voz no hay
 * teclado para dictarlo; null si el tramo no tiene lectura.
 */
async function odometro_estimado(ctx: CtxVoz, jornada: DomainRow): Promise<number | null> {
  const tramo = tramos_desde(jornada.tramos).at(-1);
  const km_inicial = tramo ? tramo.km_inicial : numero(jornada.km_inicial);
  if (km_inicial == null) return null;
  const metros = await metros_gps(ctx, String(jornada.id));
  const km = odometro_al_cierre(km_inicial, (tramo?.gps_m_inicio ?? 0) / 1000, metros / 1000);
  return Math.round(km * 10) / 10;
}

async function iniciar_por_voz(ctx: CtxVoz, datos: Datos): Promise<Salida> {
  if (await jornada_activa(ctx)) return error("Ya hay una jornada abierta.");
  const v = await vehiculo_para(ctx, datos);
  if ("fallo" in v) return v.fallo;
  const { vehiculo_id, nombre } = v.vehiculo;
  const jornada = await iniciar_jornada(ctx, {
    vehiculo_id,
    vehiculo_nombre: nombre,
    km_inicial: await km_sugerido(ctx, vehiculo_id),
  });
  return ok(`Jornada iniciada con ${texto(jornada.vehiculo_nombre) || nombre}.`, { jornada_id: jornada.id });
}

async function cambiar_por_voz(ctx: CtxVoz, datos: Datos): Promise<Salida> {
  const jornada = await jornada_activa(ctx);
  if (!jornada) return iniciar_por_voz(ctx, datos);
  const v = await vehiculo_para(ctx, datos);
  if ("fallo" in v) return v.fallo;
  const { vehiculo_id, nombre } = v.vehiculo;
  if (vehiculo_id === texto(jornada.vehiculo_id)) return error(`Ya estás en ${nombre}.`);
  const actualizada = await cambiar_vehiculo(ctx, String(jornada.id), {
    vehiculo_id,
    vehiculo_nombre: nombre,
    km_final_tramo: await odometro_estimado(ctx, jornada),
    km_inicial: await km_sugerido(ctx, vehiculo_id),
  });
  return ok(`Cambié a ${texto(actualizada.vehiculo_nombre) || nombre}.`, { jornada_id: jornada.id, vehiculo_id });
}

/**
 * Lo que cambia de manos al liquidar: el fondo de cambio solo cuenta si se
 * devuelve. Positivo lo entrego yo; negativo me lo paga la caja.
 */
const a_entregar = (v: VistaLiquidacion, devolver_cambio: boolean) =>
  centavos(devolver_cambio ? v.neto : v.neto - v.cambio_de_caja);

/** Cierra la jornada abierta (que además entrega el cobro, sin devolver el cambio). */
async function cerrar_jornada(ctx: CtxVoz): Promise<{ entregas: number; a_caja: number; jornada_id: unknown } | null> {
  const jornada = await jornada_activa(ctx);
  if (!jornada) return null;
  const { jornada: cerrada, liquidacion } = await terminar_jornada(ctx, String(jornada.id), {
    km_final: await odometro_estimado(ctx, jornada),
  });
  return {
    jornada_id: jornada.id,
    entregas: numero(cerrada.entregas) ?? 0,
    a_caja: liquidacion.sello ? a_entregar(liquidacion, false) : 0,
  };
}

function frase_a_caja(a_caja: number): string {
  if (a_caja > 0) return ` Entregas ${pesos(a_caja)} pesos a caja.`;
  if (a_caja < 0) return ` La caja te devuelve ${pesos(-a_caja)} pesos.`;
  return "";
}

async function terminar_por_voz(ctx: CtxVoz): Promise<Salida> {
  const r = await cerrar_jornada(ctx);
  if (!r) return error("No hay jornada en curso.");
  return ok(`Jornada terminada.${frase_a_caja(r.a_caja)}`, r);
}

/** «Cerrar el día» = terminar la jornada, que ya entrega el cobro. */
async function cerrar_dia(ctx: CtxVoz): Promise<Salida> {
  const r = await cerrar_jornada(ctx);
  if (!r) return error("No hay jornada en curso.");
  return ok(`Cerré el día. ${r.entregas} pedidos entregados.${frase_a_caja(r.a_caja)}`, r);
}

async function pedido_por_voz(ctx: CtxVoz, datos: Datos, pendiente: boolean): Promise<Salida> {
  const jornada = await jornada_activa(ctx);
  if (!jornada) return error("No hay jornada en curso.");
  const cobrar = numero(datos.cantidad);
  if (cobrar == null) return error("Dime el monto a cobrar.");
  let domicilio_texto = texto(datos.domicilio);
  let domicilio_id: unknown = null;
  if (domicilio_texto) {
    const conocido = (await filas_de(ctx, "herr_domicilios", { is_active: true })).find((d) =>
      normalizar(d.name).includes(normalizar(domicilio_texto)),
    );
    if (conocido) {
      domicilio_id = conocido.id;
      domicilio_texto = texto(conocido.name);
    }
  }
  const pedido = await registrar_pedido(ctx, {
    cobrar: centavos(cobrar),
    domicilio_texto,
    domicilio_id,
    detalle: pendiente ? "Pendiente por voz" : "Pedido por voz",
    jornada_id: jornada.id,
  });
  const que = pendiente ? "Pendiente anotado" : "Pedido registrado";
  const donde = domicilio_texto ? ` en ${domicilio_texto}` : "";
  return ok(`${que} por ${pesos(cobrar)} pesos${donde}.`, { pedido_id: pedido.id, orden: pedido.orden });
}

async function gasto_por_voz(ctx: CtxVoz, datos: Datos): Promise<Salida> {
  const jornada = await jornada_activa(ctx);
  if (!jornada) return error("No hay jornada en curso.");
  const cantidad = numero(datos.cantidad);
  if (cantidad == null) return error("Dime el monto del gasto.");
  const gasto = await registrar_gasto(ctx, {
    cantidad: centavos(cantidad),
    motivo: texto(datos.motivo) || "Gasto por voz",
    jornada_id: jornada.id,
  });
  return ok(`Gasto de ${pesos(cantidad)} pesos registrado.`, { gasto_id: gasto.id });
}

/** Pedidos por entregar, en el orden de la ruta. */
async function abiertos_en_orden(ctx: Pick<KirletCtx, "data">): Promise<DomainRow[]> {
  return (await filas_de(ctx, "herr_pedidos", { is_active: true, cobrado: { ne: true } }))
    .filter((p) => es_abierto(estado_de(p)))
    .sort((a, b) => orden_de(a) - orden_de(b));
}

function elegir_pedido(abiertos: DomainRow[], datos: Datos): DomainRow | null {
  if (texto(datos.pedido_id)) return abiertos.find((p) => String(p.id) === texto(datos.pedido_id)) ?? null;
  if (texto(datos.domicilio)) {
    const pista = normalizar(datos.domicilio);
    return abiertos.find((p) => normalizar(p.domicilio_texto).includes(pista) || normalizar(p.name).includes(pista)) ?? null;
  }
  return abiertos[0] ?? null;
}

/**
 * A qué pedido se refiere «entregado»: el indicado (`pedido_id`), el del
 * domicilio dicho, o el primero de la ruta. Se resuelve al preguntar, para
 * que el «sí» marque ese y no otro si la lista cambia entretanto.
 */
export async function pedido_a_entregar(ctx: Pick<KirletCtx, "data">, datos: Datos): Promise<DomainRow | null> {
  return elegir_pedido(await abiertos_en_orden(ctx), datos);
}

/** `recibido` solo si se dijo: entregar y cobrar son dos cosas. */
async function marcar_entrega(ctx: CtxVoz, datos: Datos): Promise<Salida> {
  const abiertos = await abiertos_en_orden(ctx);
  if (!abiertos.length) return error("No hay pedidos por entregar.");
  const pedido = elegir_pedido(abiertos, datos);
  if (!pedido) return error("No encontré ese pedido.");
  await avanzar_pedido(ctx, String(pedido.id), "entregado", { recibido: datos.cantidad });
  const siguiente = abiertos.find((p) => p.id !== pedido.id);
  const cola = siguiente ? ` Siguiente: ${alias_pedido(siguiente)}.` : " No queda ninguno.";
  return ok(`Entregado ${alias_pedido(pedido)}.${cola}`, { pedido_id: pedido.id });
}

async function movimiento_caja(ctx: CtxVoz, datos: Datos, tipo: "retiro_cambio" | "aporte_propio"): Promise<Salida> {
  const jornada = await jornada_activa(ctx);
  if (!jornada) return error("No hay jornada en curso.");
  const cantidad = numero(datos.cantidad);
  if (cantidad == null) return error("Dime cuánto.");
  const retiro = tipo === "retiro_cambio";
  const fila: DomainRow = {
    ...base(ctx, "caja", `${retiro ? "Retiro de cambio" : "Aporte propio"} ${pesos(cantidad)}`),
    fecha: fecha_hoy(),
    hora: hora_ahora(),
    tipo,
    cantidad: centavos(cantidad),
    motivo: "Por voz",
    jornada_id: jornada.id,
    saldado: false,
    liquidacion: null,
  };
  await ctx.data.insert("herr_caja", fila);
  // Se dice lo que NO es: ni venta ni propina. Quien lo dicta va conduciendo.
  const cierre = retiro
    ? "de cambio de la caja. No cuenta como venta."
    : "tuyos. Te los devuelven al liquidar, no son propina.";
  return ok(`Anotados ${pesos(cantidad)} pesos ${cierre}`, { caja_id: fila.id });
}

async function registrar_recarga(ctx: CtxVoz, datos: Datos): Promise<Salida> {
  const jornada = await jornada_activa(ctx);
  if (!jornada) return error("No hay jornada en curso.");
  const vehiculo_id = texto(jornada.vehiculo_id);
  if (!vehiculo_id) return error("No hay vehículo en la jornada.");
  const pesos_carga = numero(datos.cantidad);
  if (pesos_carga == null) return error("Dime cuánto pagaste de gasolina.");
  const litros = numero(datos.numero);
  const recarga: DomainRow = {
    ...base(ctx, "recarga", `Recarga ${fecha_hoy()} · ${texto(jornada.vehiculo_nombre) || vehiculo_id}`),
    vehiculo_id,
    fecha_hora: now_iso(),
    km: await odometro_estimado(ctx, jornada),
    pesos: centavos(pesos_carga),
    precio_litro: litros ? centavos(pesos_carga / litros) : null,
    litros,
    litros_efectivos: litros,
    aproximado: false,
    jornada_id: jornada.id,
  };
  const motivo = motivo_gasto(litros);
  const gasto = await preparar_gasto(ctx, {
    ...base(ctx, "gasto", motivo),
    // Misma convención que el hook de herr-recargas: así borrar la recarga desactiva el gasto.
    id: `gasto_recarga_${recarga.id}`,
    motivo,
    cantidad: centavos(pesos_carga),
    fuente: "cobros",
    descontado: false,
    jornada_id: jornada.id,
    recarga_id: recarga.id,
  });
  await ctx.data.batch([
    { op: "insert", table: "herr_recargas", row: recarga },
    { op: "insert", table: "herr_gastos", row: gasto },
  ]);
  return ok(`Carga de gasolina de ${pesos(pesos_carga)} pesos registrada.`, { recarga_id: recarga.id, gasto_id: gasto.id });
}

/** El pendiente dictado más reciente se entrega con lo que se recibió. */
async function surtir_pendiente(ctx: CtxVoz, datos: Datos): Promise<Salida> {
  const pendientes = (await abiertos_en_orden(ctx)).filter((p) => normalizar(p.detalle).includes("pendiente"));
  if (!pendientes.length) return ok("No hay pendientes por surtir.");
  const recibido = numero(datos.cantidad);
  if (recibido == null) return error("Dime cuánto recibiste.");
  const pedido = [...pendientes].sort((a, b) => texto(b.updated_at).localeCompare(texto(a.updated_at)))[0]!;
  await avanzar_pedido(ctx, String(pedido.id), "entregado", { recibido });
  return ok(`Pendiente surtido. Recibí ${pesos(recibido)} pesos.`, { pedido_id: pedido.id });
}

/** «Entregar el cobro»: la liquidación de la app; el fondo de cambio solo si se dijo que se devuelve. */
async function entregar_cobro(ctx: CtxVoz, datos: Datos): Promise<Salida> {
  const jornada = await jornada_activa(ctx);
  const devolver_cambio = booleano(datos.devolver_cambio);
  const v = await liquidar(ctx, jornada ? String(jornada.id) : null, { devolver_cambio });
  const a_caja = a_entregar(v, devolver_cambio);
  const resultado = { a_caja, pedidos: v.pedido_ids.length, sello: v.sello };
  if (v.nada_que_cobrar || (!devolver_cambio && !v.pedido_ids.length && !v.me_debe_caja)) {
    return ok("No hay nada que liquidar.", resultado);
  }
  const conservas = !devolver_cambio && v.cambio_de_caja > 0 ? ` Conservas ${pesos(v.cambio_de_caja)} pesos de cambio.` : "";
  // Nunca «a caja» en negativo: si puse más de lo que cobré, me lo devuelven.
  if (a_caja < 0) return ok(`Liquidado. La caja te devuelve ${pesos(-a_caja)} pesos.${conservas}`, resultado);
  return ok(`Cobro entregado. Entregas ${pesos(a_caja)} pesos.${conservas}`, resultado);
}

async function consulta_hoy(ctx: CtxVoz): Promise<Salida> {
  const jornada = await jornada_de_hoy(ctx);
  const v = await vista_liquidacion(ctx, jornada ? String(jornada.id) : null);
  if (!jornada && v.nada_que_cobrar && !v.en_curso) {
    return ok("Hoy no hay jornada ni movimientos.", { a_caja: 0, pedidos: 0 });
  }
  const a_caja = a_entregar(v, false);
  const prefijo = texto(jornada?.estado) === "abierta" ? "Hoy, con la jornada abierta, " : "Hoy ";
  const caja = a_caja < 0 ? `la caja te devolvería ${pesos(-a_caja)} pesos` : `a caja irían ${pesos(a_caja)} pesos`;
  const en_curso = v.en_curso ? ` y ${v.en_curso} en curso.` : ".";
  return ok(
    `${prefijo}${caja}, propinas ${pesos(v.propinas)}, ${v.pedido_ids.length} pedidos cobrables${en_curso}`,
    { a_caja, propinas: centavos(v.propinas), cobrables: v.pedido_ids.length, en_curso: v.en_curso },
  );
}

async function consulta_pedidos(ctx: CtxVoz): Promise<Salida> {
  const jornada = await jornada_de_hoy(ctx);
  const pedidos = jornada ? await pedidos_de(ctx, jornada) : [];
  const en_curso = pedidos.filter((p) => es_abierto(estado_de(p))).length;
  const cola = en_curso ? ` y ${en_curso} en curso.` : ".";
  return ok(`Llevas ${pedidos.length} pedidos${cola}`, { pedidos: pedidos.length, en_curso });
}

async function consulta_gastos(ctx: CtxVoz): Promise<Salida> {
  const jornada = await jornada_de_hoy(ctx);
  const gastos = jornada ? await filas_de(ctx, "herr_gastos", { jornada_id: String(jornada.id), is_active: true }) : [];
  const total = suma(gastos, "cantidad");
  return ok(`Has gastado ${pesos(total)} pesos en ${gastos.length} gastos.`, { total, gastos: gastos.length });
}

const TABLAS_BUSCABLES: Array<[string, string]> = [
  ["herr_domicilios", "Domicilios"],
  ["herr_pedidos", "Pedidos"],
  ["herr_gastos", "Gastos"],
];

async function buscar(ctx: CtxVoz, datos: Datos): Promise<Salida> {
  const q = texto(datos.busqueda);
  if (!q) return error("Dime qué busco.");
  const hallazgos: Array<{ tabla: string; id: unknown; name: string }> = [];
  for (const [tabla, etiqueta] of TABLAS_BUSCABLES) {
    const filas = await ctx.data.findMany(tabla, {
      where: { is_active: true },
      search: { fields: ["name", "search_field"], q: normalizar(q) },
      limit: 5,
    });
    for (const f of filas) hallazgos.push({ tabla: etiqueta, id: f.id, name: texto(f.name) });
  }
  const top = hallazgos.slice(0, 5);
  if (!top.length) return ok(`No encontré nada para ${q}.`, { hallazgos: [] });
  const detalle = top.map((h) => `${h.tabla}: ${h.name}`).join(". ");
  return ok(`Encontré ${top.length}. ${detalle}.`, { hallazgos: top });
}

const MANEJADORES: Record<string, Manejador> = {
  jornada_iniciar: iniciar_por_voz,
  jornada_cambiar_vehiculo: cambiar_por_voz,
  jornada_elegir_vehiculo: cambiar_por_voz,
  jornada_terminar: terminar_por_voz,
  pedido_registrar: (ctx, d) => pedido_por_voz(ctx, d, false),
  pendiente_registrar: (ctx, d) => pedido_por_voz(ctx, d, true),
  gasto_registrar: gasto_por_voz,
  entrega_registrar: marcar_entrega,
  caja_retiro: (ctx, d) => movimiento_caja(ctx, d, "retiro_cambio"),
  caja_aporte: (ctx, d) => movimiento_caja(ctx, d, "aporte_propio"),
  recarga_registrar: registrar_recarga,
  pendiente_surtir: surtir_pendiente,
  cobro_registrar: entregar_cobro,
  consulta_hoy,
  consulta_pedidos,
  consulta_gastos,
  buscar,
  cerrar_dia,
};

/** Ids con manejador aquí; las demás intenciones las ejecuta el teléfono. */
export const INTENCIONES_EJECUTABLES = Object.keys(MANEJADORES);

export async function ejecutar_intencion(ctx: CtxVoz, intencion: string, datos: Datos = {}): Promise<Ejecucion> {
  const def = intencion_por_id(intencion);
  if (!def) return { intencion, estado: "error", resultado: null, respuesta: "No pude hacer eso. Orden desconocida." };
  if (def.telefono) {
    return { intencion, estado: "interpretado", resultado: { delegada: "telefono" }, respuesta: "Esa orden la ejecuta el teléfono." };
  }
  const manejador = MANEJADORES[intencion];
  if (!manejador) return { intencion, estado: "error", resultado: null, respuesta: "Ocurrió un error." };
  try {
    return { intencion, ...(await manejador(ctx, datos)) };
  } catch (err) {
    // Una regla de Reparto que no se cumple se dice tal cual; lo demás va al log.
    if (err instanceof KirletHttpError && err.status < 500) {
      return { intencion, ...error(err.message.endsWith(".") ? err.message : `${err.message}.`) };
    }
    console.warn(`[herr-voz] fallo al ejecutar ${intencion}`, err);
    return { intencion, estado: "error", resultado: null, respuesta: "Ocurrió un error." };
  }
}
