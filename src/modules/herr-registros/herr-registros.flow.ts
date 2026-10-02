import {
  define_routes,
  new_id,
  now_iso,
  type DomainRow,
  type FindManyOptions,
  type KirletCtx,
  type KirletRouteTable,
} from "@opus-perpetuus/imperium-core-kit";
import {
  campo_busqueda,
  es_foto_guardada,
  falla,
  fila_o_404,
  sello_ahora,
  solo_dia,
  subir_foto,
  texto,
  zona_valida,
} from "../../lib/comun.ts";
import { texto_buscable } from "../../lib/formulas/busqueda.ts";
import { calcular_valores, calculados_de } from "../../lib/formulas/calculadora.ts";
import { spec_de_fila, type CampoSpec, type TablaSpec } from "../../lib/formulas/esquema.ts";
import { formatear as unir_multivalor } from "../../lib/formulas/multivalor.ts";
import { objeto, registro_como_fila, registros_de, tabla_activa } from "../herr-tablas/herr-tablas.flow.ts";

/** Un valor capturado se guarda como texto; los compuestos del formulario se aplanan. */
function como_texto(v: unknown): string {
  if (v == null) return "";
  if (Array.isArray(v)) return unir_multivalor(v.map(String));
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    if (typeof o.latitude === "number" && typeof o.longitude === "number") {
      return `${o.latitude.toFixed(6)},${o.longitude.toFixed(6)}`;
    }
    return JSON.stringify(v);
  }
  return String(v);
}

const CON_ZONA = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})$/;

/** El datalist del lanzador manda la opción entera (`{_id, name}`), no su valor. */
const id_de_opcion = (v: unknown) => (v && typeof v === "object" && "_id" in v ? v._id : v);

/** Fecha como día `AAAA-MM-DD`; fecha y hora como hora de pared del negocio `AAAA-MM-DDTHH:mm`. */
function valor_de_campo(campo: CampoSpec, v: unknown): string {
  if (campo.tipo === "fecha") return como_texto(solo_dia(v));
  if (campo.tipo === "referencia") return como_texto(Array.isArray(v) ? v.map(id_de_opcion) : id_de_opcion(v));
  if (campo.tipo === "fecha_hora" && typeof v === "string" && CON_ZONA.test(v.trim())) {
    const ms = Date.parse(v.trim());
    if (!Number.isFinite(ms)) falla(400, `«${campo.etiqueta}» no es una fecha y hora válida`, "validation_error");
    return sello_ahora(zona_valida(), new Date(ms)).replace(" ", "T");
  }
  return como_texto(v);
}

/** Solo campos capturables de la tabla, y los requeridos presentes. */
function valores_capturados(spec: TablaSpec, entrada: unknown): Record<string, string> {
  const fuente = entrada ?? {};
  if (typeof fuente !== "object" || Array.isArray(fuente)) falla(400, "valores debe ser un objeto clave → valor");
  const capturables = new Map(spec.campos.filter((c) => c.tipo !== "calculado").map((c) => [c.clave, c]));
  const valores: Record<string, string> = {};
  for (const [clave, v] of Object.entries(fuente as Record<string, unknown>)) {
    const campo = capturables.get(clave);
    if (!campo) falla(400, `«${clave}» no es un campo de la tabla`);
    valores[clave] = valor_de_campo(campo, v);
  }
  for (const campo of capturables.values()) {
    if (campo.requerido && !valores[campo.clave]?.trim()) falla(400, `Falta «${campo.etiqueta}»`);
  }
  return valores;
}

/** Texto de presentación: el primer campo `en_resumen` con valor. */
function nombre_de(spec: TablaSpec, valores: Record<string, string>): string {
  const campo = spec.campos.find((c) => c.en_resumen && texto(valores[c.clave]));
  return campo ? texto(valores[campo.clave]) : "";
}

/**
 * Valida los valores contra la tabla, guarda sus fotos como adjuntos, calcula
 * los calculados con la tabla entera contando este registro (agregados y
 * funciones por fila) y deja listos `name` y `search_field`.
 */
export async function preparar_registro(
  ctx: KirletCtx,
  patch: DomainRow,
  existing: DomainRow | null,
): Promise<DomainRow> {
  if (existing) delete patch.created_by;
  else patch.created_by = ctx.actor;
  const tabla_id = texto(patch.tabla_id ?? existing?.tabla_id);
  const spec = spec_de_fila(await tabla_activa(ctx, tabla_id));
  const valores = valores_capturados(spec, patch.valores ?? existing?.valores);
  const id = texto(patch.id ?? existing?.id);
  const antes = objeto(existing?.valores);
  const miniaturas_previas = objeto(existing?.miniaturas);
  const miniaturas: Record<string, string> = {};
  for (const campo of spec.campos) {
    if (campo.tipo !== "foto") continue;
    const raw = valores[campo.clave] ?? "";
    const subida = await subir_foto(ctx, "herr-registros", id, raw);
    if (subida) {
      valores[campo.clave] = subida.url;
      if (subida.miniatura) miniaturas[campo.clave] = subida.miniatura;
    } else if (!es_foto_guardada(raw)) {
      if (campo.clave in valores) valores[campo.clave] = "";
    } else if (raw === antes[campo.clave] && miniaturas_previas[campo.clave]) {
      miniaturas[campo.clave] = miniaturas_previas[campo.clave]!;
    }
  }
  const filas = (await registros_de(ctx, tabla_id))
    .filter((r) => String(r.id) !== id)
    .map(registro_como_fila);
  filas.push({ id, valores });
  const todos = calcular_valores(spec, valores, filas);
  const calculados = calculados_de(spec, todos);
  return {
    ...patch,
    tabla_id,
    valores,
    calculados,
    miniaturas,
    name: nombre_de(spec, todos) || id,
    search_field: campo_busqueda(texto_buscable(valores, calculados, spec)),
  };
}

/** Las miniaturas pesan y no son un cambio que leer: fuera del historial. */
export function sin_miniaturas(row: DomainRow): DomainRow {
  const { miniaturas: _, ...resto } = row;
  return resto;
}

/** La miniatura de la primera foto como `foto`: así la lista de Registros la pinta como imagen. */
export function con_foto(row: DomainRow): DomainRow {
  const primera = Object.values(objeto(row.miniaturas)).find(Boolean);
  return primera ? { ...row, foto: primera } : row;
}

/**
 * `GET /herr-registros?tabla_id=` filtra por tabla. El CRUD genérico ignora
 * la query, y el patrón no puede declararse dos veces: se envuelve su handler.
 */
export function con_filtro_por_tabla(rutas: KirletRouteTable): KirletRouteTable {
  const lista = rutas.find((r) => r.pattern === "GET /herr-registros");
  if (!lista) return rutas;
  const original = lista.handler as (ctx: KirletCtx) => Promise<unknown>;
  lista.handler = async (ctx: KirletCtx) => {
    const tabla_id = texto(ctx.query.get("tabla_id"));
    if (!tabla_id) {
      const res = (await original(ctx)) as { data?: unknown } | null;
      if (res && Array.isArray(res.data)) res.data = res.data.map((r) => con_foto(r as DomainRow));
      return res;
    }
    const lq = ctx.list_query();
    const where: FindManyOptions["where"] = { tabla_id };
    if (!["1", "true"].includes(ctx.query.get("include_inactive") ?? "")) where.is_active = true;
    const orden = /^([a-z_]+):(asc|desc)$/.exec(lq.sort ?? "");
    const opts: FindManyOptions = {
      where,
      orderBy: orden ? { [orden[1]!]: orden[2] as "asc" | "desc" } : { updated_at: "desc" },
      limit: lq.take,
      offset: lq.skip,
      ...(lq.q ? { search: { fields: ["name", "search_field"], q: lq.q } } : {}),
    };
    const rows = await ctx.data.findMany("herr_registros", opts);
    if (ctx.query.get("as") === "options") {
      return { data: rows.map((r) => ({ value: r.id, label: r.name })) };
    }
    const total = await ctx.data.count("herr_registros", where, opts.search);
    return { data: rows.map(con_foto), total_elementos: total, message: "Ruta encontrada" };
  };
  return rutas;
}

/** El mismo asiento que deja el CRUD genérico: la captura escribe directo y sin esto no quedaba rastro. */
async function anotar_historial(
  ctx: KirletCtx,
  action: "create" | "update",
  before: DomainRow | null,
  after: DomainRow,
): Promise<void> {
  await ctx.nox.history.append({
    resource: "herr-registros",
    action,
    entity_id: String(after.id),
    actor_id: ctx.identity?.user_id ?? null,
    actor_label: ctx.actor,
    payload: { before: before && sin_miniaturas(before), after: sin_miniaturas(after) },
  });
}

export const herr_registros_flow = define_routes({
  /**
   * Alta/edición desde el formulario de la página `herramientas.herr-registro`:
   * los campos llegan planos por clave (así manda un `nox.form`) y se guardan
   * en `valores`. Con `id` edita ese registro.
   */
  "POST /herr-registros/captura": async (ctx) => {
    const { tabla_id, id, ...campos } = await ctx.body<Record<string, unknown>>();
    if (texto(id)) {
      const existing = await fila_o_404(ctx, "herr_registros", texto(id), "El registro");
      const patch = await preparar_registro(
        ctx,
        { tabla_id: texto(tabla_id) || existing.tabla_id, valores: campos },
        existing,
      );
      const updated = await ctx.data.update(
        "herr_registros",
        { id: String(existing.id) },
        { ...patch, updated_at: now_iso() },
      );
      if (updated) await anotar_historial(ctx, "update", existing, updated);
      return { data: updated };
    }
    const ts = now_iso();
    const row = await preparar_registro(
      ctx,
      {
        id: new_id("registro"),
        tabla_id: texto(tabla_id),
        valores: campos,
        description: "",
        is_active: true,
        created_at: ts,
        updated_at: ts,
      },
      null,
    );
    const creado = await ctx.data.insert("herr_registros", row);
    await anotar_historial(ctx, "create", null, creado);
    return ctx.created(creado);
  },
});
