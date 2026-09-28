import { new_id, now_iso, type DomainRow, type KirletCtx } from "@opus-perpetuus/imperium-core-kit";
import { motivo_gasto } from "../combustible/litros.ts";
import {
  campo_busqueda,
  centavos,
  fecha_hoy,
  filas_de,
  hora_ahora,
  normalizar,
  numero,
  texto,
} from "../comun.ts";
import { intencion_por_id, type Datos } from "../nlu/intenciones.ts";
import { similitud } from "../nlu/similitud.ts";
import { odometro_al_cierre } from "./odometro.ts";

/**
 * Ejecuta una intención ya interpretada sobre las tablas de Reparto,
 * escribiendo directamente con `ctx.data` (las reglas mínimas de cada tabla
 * se replican aquí; no se llama por HTTP a las rutas de esos módulos).
 * Devuelve siempre una frase corta para leer en voz alta.
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

const ESTADOS_ABIERTOS = ["capturado", "surtido", "en_ruta"];
const ESTADOS_ENTREGADOS = ["entregado", "cobrado"];

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

const mas_reciente = (filas: DomainRow[]) =>
  [...filas].sort((a, b) => texto(b.created_at).localeCompare(texto(a.created_at)))[0] ?? null;

const orden_de = (p: DomainRow) => numero(p.orden) ?? Number.POSITIVE_INFINITY;
const abierto = (p: DomainRow) => ESTADOS_ABIERTOS.includes(texto(p.estado));
const entregado = (p: DomainRow) => ESTADOS_ENTREGADOS.includes(texto(p.estado));
const suma = (filas: DomainRow[], campo: string) =>
  centavos(filas.reduce((acc, f) => acc + (numero(f[campo]) ?? 0), 0));

/** Nombre con el que se menciona un pedido en voz alta. */
export function alias_pedido(p: DomainRow): string {
  return texto(p.domicilio_texto) || texto(p.productos) || `el pedido ${texto(p.orden)}`.trim();
}

/** Jornada abierta = la más reciente con estado «abierta». */
export async function jornada_abierta(ctx: CtxVoz): Promise<DomainRow | null> {
  return mas_reciente(await filas_de(ctx, "herr_jornadas", { estado: "abierta", is_active: true }));
}

/** La abierta, o la última de hoy para consultar cuando ya se cerró. */
async function jornada_de_hoy(ctx: CtxVoz): Promise<DomainRow | null> {
  return (
    (await jornada_abierta(ctx)) ??
    mas_reciente(await filas_de(ctx, "herr_jornadas", { fecha: fecha_hoy(), is_active: true }))
  );
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

/** Último odómetro conocido del vehículo: el cierre de su última jornada. */
async function ultimo_km(ctx: CtxVoz, vehiculo_id: string): Promise<number | null> {
  const cerradas = await filas_de(ctx, "herr_jornadas", { vehiculo_id, estado: "cerrada", is_active: true });
  return numero(mas_reciente(cerradas)?.km_final);
}

async function iniciar_jornada(ctx: CtxVoz, datos: Datos): Promise<Salida> {
  if (await jornada_abierta(ctx)) return error("Ya hay una jornada en curso.");
  const v = await vehiculo_para(ctx, datos);
  if ("fallo" in v) return v.fallo;
  const fecha = fecha_hoy();
  const jornada: DomainRow = {
    ...base(ctx, "jornada", `Jornada ${fecha}`),
    fecha,
    hora_inicio: hora_ahora(),
    hora_fin: null,
    vehiculo_id: v.vehiculo.vehiculo_id,
    vehiculo_nombre: v.vehiculo.nombre,
    estado: "abierta",
    km_inicial: await ultimo_km(ctx, v.vehiculo.vehiculo_id),
    km_final: null,
    km_gps: 0,
    entregas: 0,
    ingreso: 0,
    ruta_id: null,
    tramos: [],
  };
  await ctx.data.insert("herr_jornadas", jornada);
  return ok(`Jornada iniciada con ${v.vehiculo.nombre}.`, { jornada_id: jornada.id });
}

async function cambiar_vehiculo(ctx: CtxVoz, datos: Datos): Promise<Salida> {
  const jornada = await jornada_abierta(ctx);
  if (!jornada) return iniciar_jornada(ctx, datos);
  const v = await vehiculo_para(ctx, datos);
  if ("fallo" in v) return v.fallo;
  if (v.vehiculo.vehiculo_id === texto(jornada.vehiculo_id)) {
    return error(`Ya estás en ${v.vehiculo.nombre}.`);
  }
  const tramos = Array.isArray(jornada.tramos) ? (jornada.tramos as DomainRow[]) : [];
  const ultimo = tramos[tramos.length - 1];
  const tramo = {
    vehiculo_id: jornada.vehiculo_id,
    vehiculo_nombre: jornada.vehiculo_nombre,
    hora_inicio: ultimo ? texto(ultimo.hora_fin) : texto(jornada.hora_inicio),
    hora_fin: hora_ahora(),
  };
  await ctx.data.update(
    "herr_jornadas",
    { id: String(jornada.id) },
    {
      vehiculo_id: v.vehiculo.vehiculo_id,
      vehiculo_nombre: v.vehiculo.nombre,
      tramos: [...tramos, tramo],
      updated_at: now_iso(),
    },
  );
  return ok(`Cambié a ${v.vehiculo.nombre}.`, { jornada_id: jornada.id, vehiculo_id: v.vehiculo.vehiculo_id });
}

/** Lo que va a caja: cobros pendientes de liquidar, más el cambio prestado, menos gastos y dinero propio. */
async function resumen(ctx: CtxVoz, jornada: DomainRow) {
  const jornada_id = String(jornada.id);
  const [pedidos, gastos, caja] = await Promise.all([
    pedidos_de(ctx, jornada),
    filas_de(ctx, "herr_gastos", { jornada_id, is_active: true }),
    filas_de(ctx, "herr_caja", { jornada_id, is_active: true }),
  ]);
  const entregados = pedidos.filter(entregado);
  const por_liquidar = entregados.filter((p) => p.cobrado !== true);
  const gastos_pendientes = gastos.filter((g) => texto(g.fuente) === "cobros" && g.descontado !== true);
  const caja_pendiente = caja.filter((c) => c.saldado !== true);
  const retiros = caja_pendiente.filter((c) => texto(c.tipo) === "retiro_cambio");
  const aportes = caja_pendiente.filter((c) => texto(c.tipo) === "aporte_propio");
  const cobrado = suma(por_liquidar, "cobrar");
  const a_caja = centavos(cobrado + suma(retiros, "cantidad") - suma(gastos_pendientes, "cantidad") - suma(aportes, "cantidad"));
  return {
    pedidos,
    entregados,
    por_liquidar,
    gastos_pendientes,
    caja_pendiente,
    en_curso: pedidos.filter(abierto),
    propinas: suma(entregados, "propina"),
    a_caja,
    nada: !por_liquidar.length && !gastos_pendientes.length && !caja_pendiente.length,
  };
}

/** Marca como liquidado todo lo pendiente de la jornada y dice el neto. */
async function liquidar(ctx: CtxVoz, jornada: DomainRow) {
  const r = await resumen(ctx, jornada);
  const ts = now_iso();
  await ctx.data.batch([
    ...r.por_liquidar.map((p) => ({
      op: "update",
      table: "herr_pedidos",
      where: { id: String(p.id) },
      patch: { cobrado: true, estado: "cobrado", updated_at: ts },
    })),
    ...r.gastos_pendientes.map((g) => ({
      op: "update",
      table: "herr_gastos",
      where: { id: String(g.id) },
      patch: { descontado: true, updated_at: ts },
    })),
    ...r.caja_pendiente.map((c) => ({
      op: "update",
      table: "herr_caja",
      where: { id: String(c.id) },
      patch: { saldado: true, updated_at: ts },
    })),
  ]);
  return r;
}

async function terminar_jornada(ctx: CtxVoz): Promise<Salida> {
  const jornada = await jornada_abierta(ctx);
  if (!jornada) return error("No hay jornada en curso.");
  const r = await liquidar(ctx, jornada);
  const km_inicial = numero(jornada.km_inicial);
  await ctx.data.update(
    "herr_jornadas",
    { id: String(jornada.id) },
    {
      estado: "cerrada",
      hora_fin: hora_ahora(),
      km_final: km_inicial == null ? null : odometro_al_cierre(km_inicial, 0, numero(jornada.km_gps) ?? 0),
      entregas: r.entregados.length,
      ingreso: suma(r.entregados, "cobrar"),
      updated_at: now_iso(),
    },
  );
  const cola = r.a_caja > 0 ? ` Entregas ${pesos(r.a_caja)} pesos a caja.` : "";
  return ok(`Jornada terminada.${cola}`, { jornada_id: jornada.id, entregas: r.entregados.length, a_caja: r.a_caja });
}

async function registrar_pedido(ctx: CtxVoz, datos: Datos, pendiente: boolean): Promise<Salida> {
  const jornada = await jornada_abierta(ctx);
  if (!jornada) return error("No hay jornada en curso.");
  const cobrar = numero(datos.cantidad);
  if (cobrar == null) return error("Dime el monto a cobrar.");
  const abiertos = (await filas_de(ctx, "herr_pedidos", { is_active: true })).filter(abierto);
  const orden = abiertos.reduce((max, p) => Math.max(max, numero(p.orden) ?? 0), 0) + 1;
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
  const pedido: DomainRow = {
    ...base(ctx, "pedido", domicilio_texto ? `Pedido ${orden} · ${domicilio_texto}` : `Pedido ${orden}`),
    fecha: fecha_hoy(),
    hora: hora_ahora(),
    orden,
    cobrar: centavos(cobrar),
    recibido: null,
    propina: 0,
    domicilio_texto,
    domicilio_id,
    contacto_nombre: "",
    telefono: "",
    detalle: pendiente ? "Pendiente por voz" : "Pedido por voz",
    productos: "",
    productos_json: [],
    jornada_id: jornada.id,
    cobrado: false,
    estado: "capturado",
    hora_surtido: null,
    hora_entrega: null,
    liquidacion: null,
  };
  await ctx.data.insert("herr_pedidos", pedido);
  const que = pendiente ? "Pendiente anotado" : "Pedido registrado";
  const donde = domicilio_texto ? ` en ${domicilio_texto}` : "";
  return ok(`${que} por ${pesos(cobrar)} pesos${donde}.`, { pedido_id: pedido.id, orden });
}

async function registrar_gasto(ctx: CtxVoz, datos: Datos): Promise<Salida> {
  const jornada = await jornada_abierta(ctx);
  if (!jornada) return error("No hay jornada en curso.");
  const cantidad = numero(datos.cantidad);
  if (cantidad == null) return error("Dime el monto del gasto.");
  const motivo = texto(datos.motivo) || "Gasto por voz";
  const gasto: DomainRow = {
    ...base(ctx, "gasto", motivo),
    fecha: fecha_hoy(),
    hora: hora_ahora(),
    motivo,
    cantidad: centavos(cantidad),
    fuente: "cobros",
    jornada_id: jornada.id,
    descontado: false,
  };
  await ctx.data.insert("herr_gastos", gasto);
  return ok(`Gasto de ${pesos(cantidad)} pesos registrado.`, { gasto_id: gasto.id });
}

/** A qué pedido se refiere «entregado»: el dicho, el del domicilio, o el primero de la ruta. */
async function marcar_entrega(ctx: CtxVoz, datos: Datos): Promise<Salida> {
  const abiertos = (await filas_de(ctx, "herr_pedidos", { is_active: true }))
    .filter(abierto)
    .sort((a, b) => orden_de(a) - orden_de(b));
  if (!abiertos.length) return error("No hay pedidos por entregar.");
  let pedido: DomainRow | undefined;
  if (texto(datos.pedido_id)) {
    pedido = abiertos.find((p) => String(p.id) === texto(datos.pedido_id));
  } else if (texto(datos.domicilio)) {
    const pista = normalizar(datos.domicilio);
    pedido = abiertos.find((p) => normalizar(p.domicilio_texto).includes(pista) || normalizar(p.name).includes(pista));
  } else {
    pedido = abiertos[0];
  }
  if (!pedido) return error("No encontré ese pedido.");
  await ctx.data.update(
    "herr_pedidos",
    { id: String(pedido.id) },
    {
      estado: "entregado",
      hora_entrega: hora_ahora(),
      recibido: numero(pedido.recibido) ?? numero(pedido.cobrar),
      updated_at: now_iso(),
    },
  );
  const siguiente = abiertos.find((p) => p.id !== pedido!.id);
  const cola = siguiente ? ` Siguiente: ${alias_pedido(siguiente)}.` : " No queda ninguno.";
  return ok(`Entregado ${alias_pedido(pedido)}.${cola}`, { pedido_id: pedido.id });
}

async function movimiento_caja(ctx: CtxVoz, datos: Datos, tipo: "retiro_cambio" | "aporte_propio"): Promise<Salida> {
  const jornada = await jornada_abierta(ctx);
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
  };
  await ctx.data.insert("herr_caja", fila);
  // Se dice lo que NO es: ni venta ni propina. Quien lo dicta va conduciendo.
  const cierre = retiro
    ? "de cambio de la caja. No cuenta como venta."
    : "tuyos. Te los devuelven al liquidar, no son propina.";
  return ok(`Anotados ${pesos(cantidad)} pesos ${cierre}`, { caja_id: fila.id });
}

async function registrar_recarga(ctx: CtxVoz, datos: Datos): Promise<Salida> {
  const jornada = await jornada_abierta(ctx);
  if (!jornada) return error("No hay jornada en curso.");
  const vehiculo_id = texto(jornada.vehiculo_id);
  if (!vehiculo_id) return error("No hay vehículo en la jornada.");
  const pesos_carga = numero(datos.cantidad);
  if (pesos_carga == null) return error("Dime cuánto pagaste de gasolina.");
  const litros = numero(datos.numero);
  const km_inicial = numero(jornada.km_inicial);
  const recarga: DomainRow = {
    ...base(ctx, "recarga", `Recarga ${texto(jornada.vehiculo_nombre)} ${fecha_hoy()}`.trim()),
    vehiculo_id,
    fecha_hora: now_iso(),
    km: km_inicial == null ? null : odometro_al_cierre(km_inicial, 0, numero(jornada.km_gps) ?? 0),
    pesos: centavos(pesos_carga),
    precio_litro: litros ? centavos(pesos_carga / litros) : null,
    litros,
    litros_efectivos: litros,
    aproximado: false,
    jornada_id: jornada.id,
  };
  const motivo = motivo_gasto(litros);
  const gasto: DomainRow = {
    ...base(ctx, "gasto", motivo),
    // Misma convención que el hook de herr-recargas: así borrar la recarga borra el gasto.
    id: `gasto_recarga_${recarga.id}`,
    fecha: fecha_hoy(),
    hora: hora_ahora(),
    motivo,
    cantidad: centavos(pesos_carga),
    fuente: "cobros",
    jornada_id: jornada.id,
    descontado: false,
    recarga_id: recarga.id,
  };
  await ctx.data.batch([
    { op: "insert", table: "herr_recargas", row: recarga },
    { op: "insert", table: "herr_gastos", row: gasto },
  ]);
  return ok(`Carga de gasolina de ${pesos(pesos_carga)} pesos registrada.`, { recarga_id: recarga.id, gasto_id: gasto.id });
}

async function surtir_pendiente(ctx: CtxVoz, datos: Datos): Promise<Salida> {
  const pendientes = (await filas_de(ctx, "herr_pedidos", { estado: "capturado", is_active: true })).filter((p) =>
    normalizar(p.detalle).includes("pendiente"),
  );
  if (!pendientes.length) return ok("No hay pendientes por surtir.");
  const recibido = numero(datos.cantidad);
  if (recibido == null) return error("Dime cuánto recibiste.");
  // El más reciente: por voz no hay cómo señalar otro.
  const pedido = [...pendientes].sort((a, b) => texto(b.updated_at).localeCompare(texto(a.updated_at)))[0]!;
  await ctx.data.update(
    "herr_pedidos",
    { id: String(pedido.id) },
    { estado: "surtido", hora_surtido: hora_ahora(), recibido: centavos(recibido), updated_at: now_iso() },
  );
  return ok(`Pendiente surtido. Recibí ${pesos(recibido)} pesos.`, { pedido_id: pedido.id });
}

async function entregar_cobro(ctx: CtxVoz): Promise<Salida> {
  const jornada = await jornada_abierta(ctx);
  if (!jornada) return error("No hay jornada en curso.");
  const r = await liquidar(ctx, jornada);
  const resultado = { a_caja: r.a_caja, pedidos: r.por_liquidar.length };
  if (r.nada) return ok("No hay nada que liquidar.", resultado);
  // Nunca «a caja» en negativo: si puse más de lo que cobré, me lo devuelven.
  if (r.a_caja < 0) return ok(`Liquidado. La caja te devuelve ${pesos(-r.a_caja)} pesos.`, resultado);
  return ok(`Cobro entregado. Entregas ${pesos(r.a_caja)} pesos.`, resultado);
}

async function consulta_hoy(ctx: CtxVoz): Promise<Salida> {
  const jornada = await jornada_de_hoy(ctx);
  if (!jornada) return ok("Hoy no hay jornada ni movimientos.", { a_caja: 0, pedidos: 0 });
  const r = await resumen(ctx, jornada);
  const abierta = texto(jornada.estado) === "abierta";
  const prefijo = abierta ? "Hoy, con la jornada abierta, " : "Hoy ";
  const en_curso = r.en_curso.length ? ` y ${r.en_curso.length} en curso.` : ".";
  return ok(
    `${prefijo}a caja irían ${pesos(r.a_caja)} pesos, propinas ${pesos(r.propinas)}, ${r.por_liquidar.length} pedidos cobrables${en_curso}`,
    { a_caja: r.a_caja, propinas: r.propinas, cobrables: r.por_liquidar.length, en_curso: r.en_curso.length },
  );
}

async function consulta_pedidos(ctx: CtxVoz): Promise<Salida> {
  const jornada = await jornada_de_hoy(ctx);
  const pedidos = jornada ? await pedidos_de(ctx, jornada) : [];
  const en_curso = pedidos.filter(abierto).length;
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

async function cerrar_dia(ctx: CtxVoz): Promise<Salida> {
  const r = await terminar_jornada(ctx);
  if (r.estado !== "ejecutado") return r;
  const entregas = Number(r.resultado?.entregas ?? 0);
  const a_caja = Number(r.resultado?.a_caja ?? 0);
  const cola = a_caja > 0 ? ` Entregas ${pesos(a_caja)} pesos a caja.` : "";
  return ok(`Cerré el día. ${entregas} pedidos entregados.${cola}`, r.resultado);
}

const MANEJADORES: Record<string, Manejador> = {
  jornada_iniciar: iniciar_jornada,
  jornada_cambiar_vehiculo: cambiar_vehiculo,
  jornada_elegir_vehiculo: cambiar_vehiculo,
  jornada_terminar: terminar_jornada,
  pedido_registrar: (ctx, d) => registrar_pedido(ctx, d, false),
  pendiente_registrar: (ctx, d) => registrar_pedido(ctx, d, true),
  gasto_registrar: registrar_gasto,
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
    // El detalle va al log: recitar una excepción al oído es ruido.
    console.warn(`[herr-voz] fallo al ejecutar ${intencion}`, err);
    return { intencion, estado: "error", resultado: null, respuesta: "Ocurrió un error." };
  }
}
