import type { DomainRow, KirletCtx } from "@opus-perpetuus/imperium-core-kit";
import { booleano, filas_de, numero, texto } from "../comun.ts";

/**
 * La aritmética de «Entregar cobros»: cuánto va a caja, cuánto es propina y
 * cuánto falta. Trabaja sobre los campos crudos (`cobrar`, `recibido`,
 * `cantidad`), nunca sobre valores calculados guardados.
 *
 * Defensas: montos no numéricos o negativos excluyen la fila y se reportan;
 * los gastos se aplican por orden de fecha/hora y solo si caben completos
 * (a caja nunca es negativo); un gasto de fuente «caja» jamás entra, aunque
 * alguien edite su flag.
 */

export const RETIRO = "retiro_cambio";
export const APORTE = "aporte_propio";
export const TIPOS_CAJA = [RETIRO, APORTE] as const;
export const ETIQUETA_TIPO_CAJA: Record<string, string> = {
  [RETIRO]: "Retiro para cambio",
  [APORTE]: "Aporte propio",
};

export const FUENTES_GASTO = ["cobros", "caja"] as const;

/** Desglose de una parte: cuántas filas, cuánto suman y de qué fechas vienen. */
export type Parte = { registros: number; total: number; fechas: string[] };

export type Liquidacion = {
  /** max(0, Σ cobrar de cobrables − gastos aplicados). */
  a_caja: number;
  /** Σ (recibido − cobrar) positivos. */
  propinas: number;
  /** Σ max(0, cobrar − recibido): lo que el efectivo no alcanzó. */
  faltante: number;
  /** Pedidos que esta liquidación marca cobrados. */
  pedido_ids: string[];
  /** Gastos que cupieron completos y se marcan descontados. */
  gasto_ids: string[];
  /** Σ de gastos de cobros que no cupieron: siguen pendientes. */
  gastos_sin_cubrir: number;
  /** Pedidos sin `recibido`: registrados pero aún no cobrados al cliente. */
  en_curso: number;
  /** Filas con monto no numérico o negativo, fuera de la cuenta. */
  invalidos: string[];
  pedidos_de_hoy: Parte;
  pedidos_de_otras_jornadas: Parte;
  gastos_de_hoy: Parte;
  gastos_de_otras_jornadas: Parte;
  /** Σ retiros de cambio sin saldar: efectivo de la caja que traigo encima. */
  cambio_de_caja: number;
  /** Σ aportes propios sin saldar: dinero mío que la caja me debe. */
  me_debe_caja: number;
  /** Movimientos de caja que esta liquidación salda. */
  caja_ids: string[];
  caja_de_hoy: Parte;
  caja_de_otras_jornadas: Parte;
  /** Lo que cambia de manos, con signo: positivo entrego yo, negativo me paga la caja. */
  neto: number;
  /** Sin cobrables ni caja no hay nada que liquidar (los gastos sobreviven). */
  nada_que_cobrar: boolean;
};

const EPS = 1e-9;

/** Monto de una columna: null si está vacía o no es número. */
function monto(valor: unknown): number | null {
  return numero(valor);
}

function vacio(valor: unknown): boolean {
  return valor == null || texto(valor) === "";
}

function parte(filas: { fecha: string; monto: number }[], con_fechas: boolean): Parte {
  return {
    registros: filas.length,
    total: filas.reduce((s, f) => s + f.monto, 0),
    fechas: con_fechas ? [...new Set(filas.map((f) => f.fecha).filter(Boolean))].sort() : [],
  };
}

/** Tipo de un movimiento de caja, o null si no se reconoce: aquí no hay valor seguro por defecto. */
export function tipo_caja(fila: DomainRow): string | null {
  const tipo = texto(fila.tipo);
  return (TIPOS_CAJA as readonly string[]).includes(tipo) ? tipo : null;
}

export function liquidar(
  pedidos: DomainRow[],
  gastos: DomainRow[],
  jornada_id: string | null,
  caja: DomainRow[] = [],
): Liquidacion {
  const invalidos: string[] = [];
  let en_curso = 0;

  const cobrables: { id: string; fecha: string; jornada: string; cobrar: number; recibido: number }[] = [];
  for (const p of pedidos) {
    if (booleano(p.cobrado)) continue;
    const cobrar = monto(p.cobrar);
    if (cobrar == null || cobrar < 0) {
      invalidos.push(String(p.id));
      continue;
    }
    if (vacio(p.recibido)) {
      en_curso += 1;
      continue;
    }
    const recibido = monto(p.recibido);
    if (recibido == null || recibido < 0) {
      invalidos.push(String(p.id));
      continue;
    }
    cobrables.push({ id: String(p.id), fecha: texto(p.fecha), jornada: texto(p.jornada_id), cobrar, recibido });
  }

  const pendientes: { id: string; fecha: string; hora: string; creado: string; jornada: string; cantidad: number }[] = [];
  for (const g of gastos) {
    // La fuente manda antes que el flag: un gasto de caja nunca salió de los cobros.
    if (texto(g.fuente) !== "cobros") continue;
    if (booleano(g.descontado)) continue;
    const cantidad = monto(g.cantidad);
    if (cantidad == null || cantidad < 0) {
      invalidos.push(String(g.id));
      continue;
    }
    pendientes.push({
      id: String(g.id),
      fecha: texto(g.fecha),
      hora: texto(g.hora),
      creado: texto(g.created_at),
      jornada: texto(g.jornada_id),
      cantidad,
    });
  }
  // Fecha ISO y HH:mm ordenan igual alfabética que cronológicamente; el
  // empate lo decide `created_at` (los ids del kit no llevan marca de tiempo).
  const ordenados = [...pendientes].sort(
    (a, b) => a.fecha.localeCompare(b.fecha) || a.hora.localeCompare(b.hora) || a.creado.localeCompare(b.creado),
  );

  const total_cobrar = cobrables.reduce((s, c) => s + c.cobrar, 0);
  let aplicado = 0;
  const gasto_ids: string[] = [];
  let sin_cubrir = 0;
  for (const g of ordenados) {
    if (aplicado + g.cantidad <= total_cobrar + EPS) {
      aplicado += g.cantidad;
      gasto_ids.push(g.id);
    } else {
      sin_cubrir += g.cantidad;
    }
  }

  const es_hoy = (jornada: string) => jornada_id != null && jornada === jornada_id;
  const pedidos_hoy = cobrables.filter((c) => es_hoy(c.jornada)).map((c) => ({ fecha: c.fecha, monto: c.cobrar }));
  const pedidos_otros = cobrables.filter((c) => !es_hoy(c.jornada)).map((c) => ({ fecha: c.fecha, monto: c.cobrar }));
  const gastos_hoy = ordenados.filter((g) => es_hoy(g.jornada)).map((g) => ({ fecha: g.fecha, monto: g.cantidad }));
  const gastos_otros = ordenados.filter((g) => !es_hoy(g.jornada)).map((g) => ({ fecha: g.fecha, monto: g.cantidad }));

  // Los movimientos de caja van aparte y al final: no compiten con los gastos
  // por el dinero cobrado, solo suman o restan al neto.
  const movimientos: { id: string; fecha: string; jornada: string; tipo: string; cantidad: number }[] = [];
  for (const m of caja) {
    if (booleano(m.saldado)) continue;
    const tipo = tipo_caja(m);
    const cantidad = monto(m.cantidad);
    if (tipo == null || cantidad == null || cantidad < 0) {
      invalidos.push(String(m.id));
      continue;
    }
    movimientos.push({ id: String(m.id), fecha: texto(m.fecha), jornada: texto(m.jornada_id), tipo, cantidad });
  }
  const caja_hoy = movimientos.filter((m) => es_hoy(m.jornada)).map((m) => ({ fecha: m.fecha, monto: m.cantidad }));
  const caja_otros = movimientos.filter((m) => !es_hoy(m.jornada)).map((m) => ({ fecha: m.fecha, monto: m.cantidad }));

  const a_caja = Math.max(0, total_cobrar - aplicado);
  const cambio_de_caja = movimientos.filter((m) => m.tipo === RETIRO).reduce((s, m) => s + m.cantidad, 0);
  const me_debe_caja = movimientos.filter((m) => m.tipo === APORTE).reduce((s, m) => s + m.cantidad, 0);
  const pedido_ids = cobrables.map((c) => c.id);
  const caja_ids = movimientos.map((m) => m.id);

  return {
    a_caja,
    propinas: cobrables.reduce((s, c) => s + Math.max(0, c.recibido - c.cobrar), 0),
    faltante: cobrables.reduce((s, c) => s + Math.max(0, c.cobrar - c.recibido), 0),
    pedido_ids,
    gasto_ids,
    gastos_sin_cubrir: sin_cubrir,
    en_curso,
    invalidos,
    pedidos_de_hoy: parte(pedidos_hoy, false),
    pedidos_de_otras_jornadas: parte(pedidos_otros, true),
    gastos_de_hoy: parte(gastos_hoy, false),
    gastos_de_otras_jornadas: parte(gastos_otros, true),
    cambio_de_caja,
    me_debe_caja,
    caja_ids,
    caja_de_hoy: parte(caja_hoy, false),
    caja_de_otras_jornadas: parte(caja_otros, true),
    neto: a_caja + cambio_de_caja - me_debe_caja,
    nada_que_cobrar: pedido_ids.length === 0 && caja_ids.length === 0,
  };
}

/**
 * El efectivo de cobros que de verdad hay en el bolsillo: Σ min(recibido,
 * cobrar) de los cobrables − gastos de cobros aún pendientes. Lo recibido de
 * más es propina (no se gasta en la entrega) y lo recibido de menos es lo
 * único que existe. Valida el alta de un gasto de fuente «cobros».
 */
export function disponible(pedidos: DomainRow[], gastos: DomainRow[]): number {
  let cobrado = 0;
  for (const p of pedidos) {
    if (booleano(p.cobrado)) continue;
    const cobrar = monto(p.cobrar);
    const recibido = vacio(p.recibido) ? null : monto(p.recibido);
    if (cobrar == null || recibido == null || cobrar < 0 || recibido < 0) continue;
    cobrado += Math.min(recibido, cobrar);
  }
  let pendiente = 0;
  for (const g of gastos) {
    if (texto(g.fuente) !== "cobros" || booleano(g.descontado)) continue;
    const cantidad = monto(g.cantidad);
    if (cantidad == null || cantidad < 0) continue;
    pendiente += cantidad;
  }
  return cobrado - pendiente;
}

/**
 * Efectivo físico en la bolsa: el disponible más el cambio que presta la
 * caja. Solo informativo: el fondo de cambio no autoriza gastos.
 */
export function efectivo_en_mano(pedidos: DomainRow[], gastos: DomainRow[], caja: DomainRow[]): number {
  const cambio = caja
    .filter((m) => !booleano(m.saldado) && tipo_caja(m) === RETIRO)
    .reduce((s, m) => s + Math.max(0, monto(m.cantidad) ?? 0), 0);
  return disponible(pedidos, gastos) + cambio;
}

/** El sello «YYYY-MM-DD HH:mm» que la liquidación estampa en todo lo que marca. */
export function sello(fecha: string, hora: string): string {
  return `${fecha} ${hora}`;
}

export type VistaPrevia = Liquidacion & {
  disponible: number;
  efectivo_en_mano: number;
  pedidos: DomainRow[];
  gastos: DomainRow[];
  caja: DomainRow[];
};

/**
 * La liquidación tal como quedaría ahora mismo. Lee **todo** lo pendiente de
 * todas las jornadas; `jornada_id` solo decide qué es «de hoy» en el desglose.
 */
export async function vista_previa(ctx: Pick<KirletCtx, "data">, jornada_id: string | null): Promise<VistaPrevia> {
  const [pedidos, gastos, caja] = await Promise.all([
    filas_de(ctx, "herr_pedidos", { is_active: true }),
    filas_de(ctx, "herr_gastos", { is_active: true }),
    filas_de(ctx, "herr_caja", { is_active: true }),
  ]);
  return {
    ...liquidar(pedidos, gastos, jornada_id, caja),
    disponible: disponible(pedidos, gastos),
    efectivo_en_mano: efectivo_en_mano(pedidos, gastos, caja),
    pedidos,
    gastos,
    caja,
  };
}
