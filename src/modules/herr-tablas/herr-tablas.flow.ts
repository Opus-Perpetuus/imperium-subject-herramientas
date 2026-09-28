import {
  define_routes,
  new_id,
  now_iso,
  type DomainRow,
  type KirletCtx,
} from "@opus-perpetuus/imperium-core-kit";
import { campo_busqueda, falla, fila_o_404, filas_de, texto } from "../../lib/comun.ts";
import { buscar, construir_indice, texto_buscable } from "../../lib/formulas/busqueda.ts";
import { calcular_valores, calculados_de, numero_de, valores_resumen } from "../../lib/formulas/calculadora.ts";
import { claves_resumen_archivo, planear_cierre } from "../../lib/formulas/cierre.ts";
import { spec_de_fila, type Registro, type TablaSpec } from "../../lib/formulas/esquema.ts";
import { parsear } from "../../lib/formulas/multivalor.ts";
import {
  TIPOS_AGREGADO,
  calcular_agregado,
  texto_a_numero,
  type TipoAgregado,
} from "../../lib/formulas/motor.ts";
import { plantilla_de, plantillas } from "../../lib/formulas/plantillas.ts";

type Datos = Pick<KirletCtx, "data">;

/** Tipos cuya columna se puede sumar, promediar, etc. */
const AGREGABLES = new Set(["numero", "dinero", "entero", "nivel", "booleano", "calculado"]);

/** Columna json de clave → valor; puede llegar como objeto o como texto. */
export function objeto(v: unknown): Record<string, string> {
  let o = v;
  if (typeof v === "string") {
    try {
      o = JSON.parse(v);
    } catch {
      o = null;
    }
  }
  if (!o || typeof o !== "object" || Array.isArray(o)) return {};
  return Object.fromEntries(
    Object.entries(o as Record<string, unknown>).map(([k, x]) => [k, x == null ? "" : String(x)]),
  );
}

export async function tabla_activa(ctx: Datos, id: string): Promise<DomainRow> {
  if (!id) falla(400, "Elige una tabla");
  return fila_o_404(ctx, "herr_tablas", id, "La tabla");
}

export async function registros_de(ctx: Datos, tabla_id: string): Promise<DomainRow[]> {
  return filas_de(ctx, "herr_registros", { tabla_id, is_active: true });
}

/** Capturados y calculados juntos: así los ve el motor y así los indexa la búsqueda. */
export function registro_como_fila(row: DomainRow): Registro {
  return {
    id: String(row.id),
    valores: { ...objeto(row.valores), ...objeto(row.calculados) },
    created_at: texto(row.created_at),
    updated_at: texto(row.updated_at),
  };
}

/**
 * Filas con los calculados reevaluados contra la tabla entera. Los guardados
 * en `calculados` son de cuando se capturó cada una: un `{suma:pagado}` de la
 * primera fila no sabe de las que llegaron después.
 */
export function filas_recalculadas(spec: TablaSpec, registros: DomainRow[]): Registro[] {
  const base = registros.map(registro_como_fila);
  return base.map((f, i) => ({ ...f, valores: calcular_valores(spec, objeto(registros[i]!.valores), base) }));
}

/** Clave de cada campo referencia → (id del registro apuntado → etiqueta que se enseña). */
export async function etiquetas_referencia(
  data: KirletCtx["data"],
  spec: TablaSpec,
): Promise<Map<string, Map<string, string>>> {
  const out = new Map<string, Map<string, string>>();
  for (const campo of spec.campos) {
    if (campo.tipo !== "referencia" || !campo.tabla_ref_id) continue;
    const filas = await filas_de({ data }, "herr_registros", { tabla_id: campo.tabla_ref_id, is_active: true });
    out.set(
      campo.clave,
      new Map(
        filas.map((r) => [
          String(r.id),
          (campo.clave_ref_display && objeto(r.valores)[campo.clave_ref_display]) || texto(r.name) || String(r.id),
        ]),
      ),
    );
  }
  return out;
}

/** Etiquetas resueltas de las referencias de una fila, para indexarlas como texto. */
function etiquetas_de_fila(
  valores: Record<string, string>,
  etiquetas: Map<string, Map<string, string>>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [clave, de] of etiquetas) {
    const nombres = parsear(valores[clave]).map((id) => de.get(id) ?? "");
    if (nombres.length) out[`${clave}_etiqueta`] = nombres.join(" ");
  }
  return out;
}

export function fila_de_plantilla(p: TablaSpec, name: string, actor: string | null): DomainRow {
  const ts = now_iso();
  return {
    id: new_id("tabla"),
    name,
    description: p.description ?? "",
    is_active: true,
    created_by: actor,
    search_field: campo_busqueda(name, p.description),
    icono: p.icono,
    campos: p.campos,
    constantes: p.constantes,
    resumenes: p.resumenes,
    plantilla_id: p.plantilla_id,
    orden_campo: p.orden_campo ?? null,
    orden_desc: p.orden_desc !== false,
    cerrable: true,
    version_esquema: 1,
    created_at: ts,
    updated_at: ts,
  };
}

export const herr_tablas_flow = define_routes({
  "GET /herr-tablas/plantillas": () => ({
    data: plantillas().map((p) => ({
      id: p.id,
      nombre: p.name,
      descripcion: p.description,
      icono: p.icono,
      campos: p.campos,
      constantes: p.constantes,
      resumenes: p.resumenes,
    })),
  }),

  "POST /herr-tablas/desde-plantilla": async (ctx) => {
    const body = await ctx.body<{ plantilla_id?: string; name?: string }>();
    const plantilla = plantilla_de(texto(body.plantilla_id));
    if (!plantilla) falla(404, "La plantilla no existe", "not_found");
    const fila = fila_de_plantilla(plantilla, texto(body.name) || plantilla.name, ctx.actor);
    return ctx.created(await ctx.data.insert("herr_tablas", fila));
  },

  "GET /herr-tablas/:id/resumen": async (ctx) => {
    const spec = spec_de_fila(await tabla_activa(ctx, ctx.params.id));
    const filas = filas_recalculadas(spec, await registros_de(ctx, spec.id));
    const agregados: Record<string, Record<TipoAgregado, number>> = {};
    for (const campo of spec.campos) {
      if (!AGREGABLES.has(campo.tipo)) continue;
      const valores = filas
        .map((f) => numero_de(spec, f.valores, campo.clave))
        .filter((n): n is number => n !== null);
      agregados[campo.clave] = Object.fromEntries(
        (Object.keys(TIPOS_AGREGADO) as TipoAgregado[]).map((t) => [t, calcular_agregado(t, valores)]),
      ) as Record<TipoAgregado, number>;
    }
    const resumenes = valores_resumen(spec, filas).map(({ resumen, texto: t }) => ({
      clave: resumen.clave,
      etiqueta: resumen.etiqueta,
      valor: texto_a_numero(t),
      texto: t,
    }));
    return { data: { agregados, resumenes, total_filas: filas.length } };
  },

  /** Archiva las filas en `herr_cierres` (con resúmenes y fijos del momento) y vacía la tabla. */
  "POST /herr-tablas/:id/cerrar": async (ctx) => {
    const spec = spec_de_fila(await tabla_activa(ctx, ctx.params.id));
    if (!spec.cerrable) falla(409, "Esta tabla no se cierra: es un catálogo", "conflict");
    const registros = await registros_de(ctx, spec.id);
    if (!registros.length) falla(409, "No hay registros que cerrar", "conflict");
    const filas = filas_recalculadas(spec, registros);
    const cerrado_at = now_iso();
    const resumen = Object.fromEntries(valores_resumen(spec, filas).map((r) => [r.resumen.clave, r.texto]));
    const resumen_archivo = Object.fromEntries(
      claves_resumen_archivo(spec).map(([clave, clave_archivo]) => [clave_archivo, resumen[clave] ?? ""]),
    );
    const calculados_por_fila = Object.fromEntries(
      filas.map((f) => [f.id, { ...calculados_de(spec, f.valores), ...resumen_archivo }]),
    );
    const plan = planear_cierre(spec, filas, cerrado_at, calculados_por_fila)!;
    const por_id = new Map(registros.map((r) => [String(r.id), r]));
    await ctx.data.batch([
      ...plan.filas_archivadas.map((f) => {
        const r = por_id.get(f.id)!;
        return {
          op: "insert",
          table: "herr_cierres",
          row: {
            id: new_id("cierre"),
            name: texto(r.name),
            description: "",
            is_active: true,
            created_by: ctx.actor,
            search_field: texto(r.search_field),
            tabla_id: spec.id,
            cierre_id: plan.cierre_id,
            cerrado_at,
            valores: f.valores,
            custom_data: { registro_id: f.id },
            created_at: cerrado_at,
            updated_at: cerrado_at,
          },
        };
      }),
      ...registros.map((r) => ({
        op: "update",
        table: "herr_registros",
        where: { id: String(r.id) },
        patch: { is_active: false, updated_at: cerrado_at },
      })),
    ]);
    return { data: { cierre_id: plan.cierre_id, filas: plan.filas_archivadas.length } };
  },

  "POST /herr-tablas/:id/buscar": async (ctx) => {
    const spec = spec_de_fila(await tabla_activa(ctx, ctx.params.id));
    const body = await ctx.body<{ q?: string }>();
    const registros = await registros_de(ctx, spec.id);
    const etiquetas = await etiquetas_referencia(ctx.data, spec);
    const entradas = filas_recalculadas(spec, registros).map((f) => ({
      id: f.id,
      texto: texto_buscable(f.valores, etiquetas_de_fila(f.valores, etiquetas), spec),
      updated_at: f.updated_at,
    }));
    const por_registro = new Map(registros.map((r) => [String(r.id), r]));
    const data = buscar(
      construir_indice(entradas),
      texto(body.q),
      new Map(entradas.map((e) => [e.id, e])),
    ).map((id) => por_registro.get(id)!);
    return { data, total_elementos: data.length };
  },
});
