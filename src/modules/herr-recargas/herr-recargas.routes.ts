import {
  define_crud,
  define_module,
  now_iso,
  type DomainRow,
  type KirletCtx,
} from "@opus-perpetuus/imperium-core-kit";
import { booleano, campo_busqueda, falla, fecha_hoy, hora_ahora, numero, texto, zona_valida } from "../../lib/comun.ts";
import {
  actualizar_litros_por_paso,
  leer_lectura,
  litros_efectivos,
  motivo_gasto,
} from "../../lib/combustible/litros.ts";
import { nombre_vehiculo } from "../../lib/vehiculos/externo.ts";
import { ajustes_por_vehiculo } from "../herr-vehiculos/herr-vehiculos.flow.ts";
import { herr_recargas_pages } from "./herr-recargas.pages.ts";
import { herr_recargas_tables } from "./herr-recargas.tables.ts";

/**
 * Una carga de gasolina de un vehículo externo (`vehiculo_id` = id del
 * `vehicle` de subject-vehiculos). Con importe, es además un gasto de la
 * jornada (fila en `herr_gastos` con id derivado, para corregir en vez de
 * duplicar); con lectura del medidor antes y después, enseña la calibración
 * de los ajustes de reparto del vehículo, si los hay.
 */

const id_gasto = (recarga_id: unknown) => `gasto_recarga_${recarga_id}`;

/** Campos de la recarga que alimentan su gasto. */
const CAMPOS_DEL_GASTO = ["pesos", "litros", "precio_litro", "litros_efectivos", "fecha_hora", "jornada_id", "is_active"];

/** Campos que alimentan la calibración del medidor. */
const CAMPOS_DE_CALIBRACION = ["nivel_antes", "nivel_despues", "litros", "pesos", "precio_litro", "vehiculo_id"];

const NUMERICOS = new Set(["pesos", "litros", "precio_litro", "litros_efectivos"]);

/**
 * Día y hora de pared en la zona del negocio. Un instante con zona (`Z`,
 * `-06:00`) se convierte; uno sin zona ya es hora local y se toma tal cual.
 */
function dia_y_hora(fecha_hora: unknown): { fecha: string; hora: string } {
  const v = texto(fecha_hora);
  const ms = Date.parse(v);
  if (/(Z|[+-]\d{2}:?\d{2})$/i.test(v) && Number.isFinite(ms)) {
    const zona = zona_valida();
    return { fecha: fecha_hoy(zona, new Date(ms)), hora: hora_ahora(zona, new Date(ms)) };
  }
  return { fecha: v.slice(0, 10) || fecha_hoy(), hora: v.slice(11, 16) || hora_ahora() };
}

/**
 * Igualdad por tipo: números como números y la fecha y hora como hora de pared
 * del negocio. El formulario reenvía la fila entera con la hora local sin zona
 * (`2026-09-27T14:30`) aunque se guardara con zona: es la misma recarga.
 */
function mismo_valor(campo: string, a: unknown, b: unknown): boolean {
  if (campo === "is_active") return (a !== false) === (b !== false);
  if (NUMERICOS.has(campo)) return numero(a) === numero(b);
  if (campo === "fecha_hora" && texto(a) && texto(b)) {
    const x = dia_y_hora(a);
    const y = dia_y_hora(b);
    return x.fecha === y.fecha && x.hora === y.hora;
  }
  return texto(a) === texto(b);
}

/** ¿Alguno de `campos` presentes en `nuevo` cambia respecto a `anterior`? */
function cambia(campos: string[], nuevo: DomainRow, anterior: DomainRow): boolean {
  return campos.some((k) => k in nuevo && !mismo_valor(k, nuevo[k], anterior[k]));
}

const vigente = (recarga: DomainRow) => recarga.is_active !== false && (numero(recarga.pesos) ?? 0) > 0;

async function gasto_de(ctx: KirletCtx, recarga_id: unknown): Promise<DomainRow | null> {
  return ctx.data.findOne("herr_gastos", { id: id_gasto(recarga_id) });
}

const liquidado = (gasto: DomainRow | null) => !!gasto && (booleano(gasto.descontado) || !!texto(gasto.liquidacion));

/** Un gasto ya descontado en una liquidación no se toca: la recarga tampoco. */
async function exigir_gasto_abierto(ctx: KirletCtx, recarga: DomainRow): Promise<void> {
  if (liquidado(await gasto_de(ctx, recarga.id))) {
    falla(409, "El gasto de esta recarga ya se descontó en una liquidación", "conflict");
  }
}

/** Campos derivados: litros efectivos, `aproximado`, nombre y búsqueda. */
async function preparar(ctx: KirletCtx, row: DomainRow, existing: DomainRow = {}): Promise<DomainRow> {
  const m = { ...existing, ...row };
  const vehiculo_id = texto(m.vehiculo_id);
  const ajustes = vehiculo_id ? await ajustes_por_vehiculo(ctx, vehiculo_id) : null;
  const vehiculo = texto(ajustes?.name) || vehiculo_id;
  const efectivos = litros_efectivos(m);
  row.litros_efectivos = efectivos;
  row.aproximado = efectivos != null && !(numero(m.litros)! > 0);
  const { fecha } = dia_y_hora(m.fecha_hora);
  if (!texto(m.name)) {
    // Solo aquí se va al gateway: un PATCH con nombre no paga la llamada.
    const nombre = vehiculo_id ? await nombre_vehiculo(ctx, vehiculo_id, ajustes?.name) : "sin vehículo";
    row.name = `Recarga ${fecha} · ${nombre}`;
  }
  row.search_field = campo_busqueda(row.name ?? m.name, vehiculo, vehiculo_id, m.jornada_id, fecha);
  return row;
}

/** Lo que el gasto copia de la recarga. */
function datos_del_gasto(recarga: DomainRow, pesos: number): DomainRow {
  const motivo = motivo_gasto(numero(recarga.litros_efectivos));
  return {
    name: motivo,
    search_field: campo_busqueda(motivo),
    motivo,
    cantidad: pesos,
    ...dia_y_hora(recarga.fecha_hora),
    jornada_id: texto(recarga.jornada_id) || null,
  };
}

async function crear_gasto(ctx: KirletCtx, recarga: DomainRow): Promise<void> {
  const pesos = numero(recarga.pesos);
  if (pesos == null || pesos <= 0 || recarga.is_active === false) return;
  const ts = now_iso();
  await ctx.data.insert("herr_gastos", {
    id: id_gasto(recarga.id),
    description: "",
    is_active: true,
    created_by: ctx.actor,
    ...datos_del_gasto(recarga, pesos),
    fuente: "cobros",
    descontado: false,
    recarga_id: recarga.id,
    created_at: ts,
    updated_at: ts,
  });
}

/**
 * Tras editar la recarga: el gasto se crea, se corrige o se desactiva si ya no
 * hay importe; uno liquidado no se toca. Solo se reactiva el que desactivó la
 * propia recarga al quedarse sin importe: si la recarga tenía importe y su
 * gasto está inactivo, lo desactivó el usuario en Gastos y así se queda.
 */
async function sincronizar_gasto(ctx: KirletCtx, recarga: DomainRow, anterior: DomainRow): Promise<void> {
  const gasto = await gasto_de(ctx, recarga.id);
  if (!gasto) return crear_gasto(ctx, recarga);
  if (liquidado(gasto)) return;
  if (gasto.is_active === false && vigente(anterior)) return;
  const activo = vigente(recarga);
  await ctx.data.update("herr_gastos", { id: String(gasto.id) }, {
    ...(activo ? datos_del_gasto(recarga, numero(recarga.pesos)!) : {}),
    is_active: activo,
    updated_at: now_iso(),
  });
}

/** Sin ajustes de reparto para el vehículo no hay nada que calibrar: la recarga queda igual. */
async function calibrar(ctx: KirletCtx, recarga: DomainRow): Promise<void> {
  const antes = leer_lectura(recarga.nivel_antes);
  const despues = leer_lectura(recarga.nivel_despues);
  const cargados = numero(recarga.litros_efectivos);
  if (antes?.tipo !== "medidor" || despues?.tipo !== "medidor" || cargados == null) return;
  const ajustes = await ajustes_por_vehiculo(ctx, texto(recarga.vehiculo_id));
  if (!ajustes) return;
  const nueva = actualizar_litros_por_paso(ajustes, antes, despues, cargados);
  if (!nueva) return;
  await ctx.data.update("herr_vehiculos", { id: String(ajustes.id) }, { litros_por_paso: nueva, updated_at: now_iso() });
}

export const herr_recargas_module = define_module({
  resource: "herr-recargas",
  labels: {
    singular: "Recarga de combustible",
    plural: "Recargas de combustible",
    read: "Ver recargas",
    write: "Editar recargas",
  },
  routes: define_crud({
    resource: "herr-recargas",
    table: "herr_recargas",
    soft_delete: true,
    soft_delete_field: "is_active",
    history: true,
    default_sort: "fecha_hora:desc",
    id_prefix: "recarga",
    fields: {
      // Sin `required`: el nombre se rellena solo («Recarga <fecha> · <vehículo>»).
      name: { type: "string", search: true },
      description: { type: "string", search: true },
      is_active: { type: "boolean" },
      ref: { type: "string" },
      search_field: { type: "string", search: true },
      created_by: { type: "string" },
      custom_data: { type: "json" },
      payload: { type: "json" },
      /** Id del `vehicle` de subject-vehiculos. */
      vehiculo_id: { type: "string", search: true },
      fecha_hora: { type: "string" },
      km: { type: "number" },
      pesos: { type: "number" },
      precio_litro: { type: "number" },
      litros: { type: "number" },
      nivel_antes: { type: "string" },
      nivel_despues: { type: "string" },
      tanque_lleno: { type: "boolean" },
      jornada_id: { type: "string", search: true },
      litros_efectivos: { type: "number" },
      aproximado: { type: "boolean" },
    },
    options_map: { value: "id", label: "name" },
    hooks: {
      before_create: (ctx, row) =>
        preparar(ctx, { ...row, created_by: ctx.actor, fecha_hora: row.fecha_hora || now_iso() }),
      before_update: async (ctx, _id, patch, existing) => {
        delete patch.created_by;
        const listo = await preparar(ctx, patch, existing);
        if (cambia(CAMPOS_DEL_GASTO, listo, existing)) await exigir_gasto_abierto(ctx, existing);
        return listo;
      },
      after_create: async (ctx, row) => {
        await crear_gasto(ctx, row);
        await calibrar(ctx, row);
      },
      // La calibración es una media móvil: volver a mezclar la misma recarga la desvía.
      after_update: async (ctx, row, existing) => {
        if (cambia(CAMPOS_DEL_GASTO, row, existing)) await sincronizar_gasto(ctx, row, existing);
        if (cambia(CAMPOS_DE_CALIBRACION, row, existing)) await calibrar(ctx, row);
      },
      before_delete: exigir_gasto_abierto,
      after_delete: async (ctx, row) => {
        await ctx.data.update("herr_gastos", { id: id_gasto(row.id) }, { is_active: false, updated_at: now_iso() });
      },
    },
  }),
  tables: herr_recargas_tables,
  pages: herr_recargas_pages,
  menu: [
    {
      id: "herramientas.herr-recargas",
      label: "Recargas",
      order: 53,
      pageId: "herramientas.herr-recargas",
      path: "herr-recargas",
      permission: "subject.herramientas.herr-recargas.read",
      icon: "fa-gas-pump",
    },
  ],
});
