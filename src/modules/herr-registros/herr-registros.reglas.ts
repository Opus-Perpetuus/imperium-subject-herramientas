import { define_routes, type DomainRow, type KirletCtx } from "@opus-perpetuus/imperium-core-kit";
import { falla, fila_o_404, texto } from "../../lib/comun.ts";
import { celda_coincide, registro_por_codigo } from "../../lib/formulas/escaneo.ts";
import { spec_de_fila, type TablaSpec } from "../../lib/formulas/esquema.ts";
import { texto_a_numero } from "../../lib/formulas/motor.ts";
import {
  CAMPO_REGLAS,
  DESTINOS_CON_REGISTRO,
  TIPOS_CANTIDAD,
  aplicar_cantidad,
  describir_cambio,
  patron_coincide,
  type ReglaEscaneo,
} from "../../lib/formulas/reglas.ts";
import { formatear, parsear } from "../../lib/formulas/multivalor.ts";
import { filas_recalculadas, ids_referencia, objeto, registros_de, tabla_activa } from "../herr-tablas/herr-tablas.flow.ts";
import { guardar_captura } from "./herr-registros.flow.ts";

export type ResultadoReglas = {
  /** Una línea por regla aplicada. */
  aplicadas: string[];
  /** Reglas que coincidían pero no se pudieron aplicar, con el motivo. */
  omitidas: string[];
  /**
   * En memoria: lo que cambia en el formulario abierto (columna → valor). El
   * navegador lo pone en el formulario sin recargar; se guarda con «Guardar».
   */
  set: Record<string, string | number | string[]>;
};

/**
 * El registro abierto. `en_memoria`: sus valores son los del formulario (con
 * lo que aún no se guarda) y lo que le toque no se escribe en la base, vuelve
 * en `set`. Sin `en_memoria`, `id` es obligatorio y se guarda al momento.
 */
export type Abierto = { id: string | null; valores: Record<string, unknown>; en_memoria: boolean };

type Contexto = { ctx: KirletCtx; specs: Map<string, TablaSpec | null> };

async function spec_de(c: Contexto, id: string): Promise<TablaSpec | null> {
  if (!c.specs.has(id)) {
    const fila = await c.ctx.data.findOne("herr_tablas", { id });
    c.specs.set(id, fila && fila.is_active !== false ? spec_de_fila(fila) : null);
  }
  return c.specs.get(id) ?? null;
}

async function registro_activo(c: Contexto, id: string): Promise<DomainRow | null> {
  const r = id ? await c.ctx.data.findOne("herr_registros", { id }) : null;
  return r && r.is_active !== false ? r : null;
}

const etiqueta = (spec: TablaSpec, clave: string) => spec.campos.find((c) => c.clave === clave)?.etiqueta ?? clave;
const nombre_regla = (r: ReglaEscaneo, i: number) => r.nombre || `Regla ${i + 1}`;

/** Solo las columnas de la tabla, como texto: así llegan del formulario (números, casillas…). */
export function valores_de_formulario(spec: TablaSpec, form: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const c of spec.campos) {
    const v = form[c.clave];
    if (v === undefined || v === null) continue;
    const lista = Array.isArray(v) ? v.map((x) => texto(x)).filter(Boolean) : null;
    out[c.clave] = lista ? (c.multiple ? formatear(lista) : lista.join(",")) : texto(v);
  }
  return out;
}

/**
 * Aplica, en orden, todas las reglas de la tabla cuyo patrón y tabla de
 * origen coinciden con el código. Cada regla relee su destino, así que dos
 * reglas sobre el mismo registro se acumulan.
 */
export async function aplicar_reglas(ctx: KirletCtx, spec: TablaSpec, abierto: Abierto | null, leido: string): Promise<ResultadoReglas> {
  const codigo = leido.trim();
  const out: ResultadoReglas = { aplicadas: [], omitidas: [], set: {} };
  const c: Contexto = { ctx, specs: new Map([[spec.id, spec]]) };
  const actual = abierto ? { ...abierto, valores: { ...abierto.valores } } : null;
  /** Cambia una columna del registro abierto: en memoria o guardando. */
  const cambiar_actual = async (cambios: Record<string, string>) => {
    if (!actual) return;
    Object.assign(actual.valores, cambios);
    if (actual.en_memoria) {
      for (const [clave, v] of Object.entries(cambios)) {
        const campo = spec.campos.find((x) => x.clave === clave);
        out.set[clave] = campo?.multiple ? parsear(v) : campo && TIPOS_CANTIDAD.has(campo.tipo) ? (texto_a_numero(v) ?? v) : v;
      }
      return;
    }
    const r = await guardar_captura(ctx, { tabla_id: spec.id, id: actual.id!, valores: actual.valores });
    actual.valores = { ...objeto(r.row.valores) };
  };

  for (const [i, regla] of (spec.reglas ?? []).entries()) {
    if (!patron_coincide(regla.codigo, codigo)) continue;
    const nombre = nombre_regla(regla, i);
    const omitir = (motivo: string) => out.omitidas.push(`${nombre}: ${motivo}`);

    // De dónde es el código.
    let origen: { spec: TablaSpec; id: string; valores: Record<string, string> } | null = null;
    if (regla.tabla_origen) {
      const ospec = await spec_de(c, regla.tabla_origen);
      if (!ospec) {
        omitir("la tabla de origen ya no está");
        continue;
      }
      const fila = registro_por_codigo(ospec, await filas_recalculadas(ctx, ospec, await registros_de(ctx, ospec.id)), codigo);
      if (!fila) continue; // el código no es de esa tabla: la regla no aplica
      origen = { spec: ospec, id: fila.id, valores: fila.valores };
    }

    let cantidad = regla.cantidad;
    if (regla.cantidad_de && origen) {
      const por = texto_a_numero(origen.valores[regla.cantidad_de] ?? "");
      if (por === null) {
        omitir(`el registro del código no tiene «${etiqueta(origen.spec, regla.cantidad_de)}»`);
        continue;
      }
      cantidad *= por;
    }

    if (DESTINOS_CON_REGISTRO.has(regla.destino) && !actual) {
      omitir("abre un registro para aplicarla");
      continue;
    }

    // Tabla y registro destino; `es_actual`: el destino es el registro abierto.
    let destino: TablaSpec | null = null;
    let existente: DomainRow | null = null;
    const es_actual = regla.destino === "actual";
    if (es_actual) {
      destino = spec;
    } else if (regla.destino === "padre" || regla.destino === "nuevo_padre") {
      const enlace = spec.campos.find((x) => x.clave === regla.enlace && x.tipo === "referencia");
      destino = enlace?.tabla_ref_id ? await spec_de(c, enlace.tabla_ref_id) : null;
      if (destino && regla.destino === "padre") {
        const padre_id = ids_referencia(texto(actual!.valores[regla.enlace!]))[0] ?? "";
        existente = await registro_activo(c, padre_id);
        if (!existente) {
          omitir(`el registro abierto no tiene «${enlace!.etiqueta}»`);
          continue;
        }
      }
    } else {
      destino = regla.tabla_destino ? await spec_de(c, regla.tabla_destino) : null;
      if (destino && regla.destino === "existente_o_nuevo" && regla.columna_codigo) {
        const campo = destino.campos.find((x) => x.clave === regla.columna_codigo);
        if (campo) {
          const filas = await registros_de(ctx, destino.id);
          existente =
            filas.find((r) => {
              const raw = texto(objeto(r.valores)[campo.clave]);
              return campo.tipo === "referencia" ? !!origen && ids_referencia(raw).includes(origen.id) : celda_coincide(campo, raw, codigo);
            }) ?? null;
        }
      }
    }
    if (!destino) {
      omitir("la tabla donde se anota ya no está");
      continue;
    }
    const columna = destino.campos.find((x) => x.clave === regla.columna);
    if (!columna) {
      omitir("la columna donde se anota ya no está");
      continue;
    }
    const cambio = describir_cambio(regla.accion, cantidad, columna.etiqueta);

    try {
      if (es_actual) {
        await cambiar_actual({ [columna.clave]: aplicar_cantidad(texto(actual!.valores[columna.clave]), regla.accion, cantidad) });
        out.aplicadas.push(`${nombre}: ${cambio} en este registro`);
        continue;
      }
      const valores: Record<string, unknown> = existente ? { ...objeto(existente.valores) } : {};
      valores[columna.clave] = aplicar_cantidad(texto(valores[columna.clave]), regla.accion, cantidad);
      let sin_enlace = false;
      if (!existente) {
        const campo_codigo = destino.campos.find((x) => x.clave === regla.columna_codigo);
        if (campo_codigo) valores[campo_codigo.clave] = campo_codigo.tipo === "referencia" ? (origen?.id ?? "") : codigo;
        if (regla.enlace_actual) {
          if (actual?.id) valores[regla.enlace_actual] = actual.id;
          else sin_enlace = !!actual;
        }
      }
      const r = await guardar_captura(ctx, { tabla_id: destino.id, id: existente ? String(existente.id) : undefined, valores });
      // Un padre nuevo queda enlazado al registro abierto si ese enlace estaba vacío
      // (o se agrega, si el enlace es de varios registros).
      if (regla.destino === "nuevo_padre" && actual) {
        const enlace = spec.campos.find((x) => x.clave === regla.enlace);
        const ya = texto(actual.valores[regla.enlace!]);
        if (enlace?.multiple) await cambiar_actual({ [regla.enlace!]: formatear([...parsear(ya), String(r.row.id)]) });
        else if (!ya) await cambiar_actual({ [regla.enlace!]: String(r.row.id) });
      }
      const donde = r.creado ? `registro nuevo de «${destino.name}»` : `«${texto(r.row.name) || destino.name}»`;
      out.aplicadas.push(
        `${nombre}: ${cambio} en ${donde}` + (sin_enlace ? " (se enlaza a este registro cuando lo guardes y vuelvas a escanear)" : ""),
      );
    } catch (e) {
      omitir(e instanceof Error ? e.message : "no se pudo guardar");
    }
  }
  return out;
}

/** Prefijo del escáner que agrega registros a un enlace de varios (`__enlace_<clave>`). */
export const PREFIJO_ESCANER_ENLACE = "__enlace_";

/**
 * Agrega a un enlace de varios registros el registro de la otra tabla cuyo
 * código se leyó. Responde la lista completa en `set` para el formulario
 * abierto; no guarda nada (se guarda con «Guardar»).
 */
export async function agregar_por_codigo(
  ctx: KirletCtx,
  spec: TablaSpec,
  clave: string,
  actuales: string[],
  leido: string,
): Promise<{ set: Record<string, string[]>; message: string }> {
  const codigo = leido.trim();
  if (!codigo) falla(400, "Escanea un código", "validation_error");
  const campo = spec.campos.find((x) => x.clave === clave && x.tipo === "referencia" && x.multiple && x.tabla_ref_id);
  if (!campo) falla(400, "Ese enlace no es de varios registros", "validation_error");
  const destino = await ctx.data.findOne("herr_tablas", { id: campo!.tabla_ref_id! });
  if (!destino || destino.is_active === false) falla(404, `La tabla a la que apunta «${campo!.etiqueta}» ya no está`, "not_found");
  const dspec = spec_de_fila(destino!);
  const hallado = registro_por_codigo(dspec, await filas_recalculadas(ctx, dspec, await registros_de(ctx, dspec.id)), codigo);
  if (!hallado) falla(404, `Ningún registro de «${dspec.name}» tiene el código «${codigo}»`, "not_found");
  const ids = parsear(formatear(actuales));
  const ya = ids.includes(hallado!.id);
  return {
    set: { [clave]: ya ? ids : [...ids, hallado!.id] },
    message: ya
      ? `El registro con «${codigo}» ya estaba en «${campo!.etiqueta}»`
      : `Se agregó el registro con «${codigo}» a «${campo!.etiqueta}»; se guarda con «Guardar»`,
  };
}

export const herr_registros_reglas = define_routes({
  /**
   * Un código leído en el escáner de un enlace de varios registros: vuelve el
   * enlace con ese registro agregado, para el formulario abierto.
   */
  "POST /herr-registros/escanear-enlace": async (ctx) => {
    const body = await ctx.body<{ campo?: string; codigo?: string; formulario?: unknown }>();
    const form = body.formulario && typeof body.formulario === "object" && !Array.isArray(body.formulario) ? (body.formulario as Record<string, unknown>) : {};
    const spec = spec_de_fila(await tabla_activa(ctx, texto(form.tabla_id)));
    const campo = texto(body.campo);
    const clave = campo.startsWith(PREFIJO_ESCANER_ENLACE) ? campo.slice(PREFIJO_ESCANER_ENLACE.length) : campo;
    const v = form[clave];
    const actuales = Array.isArray(v) ? v.map((x) => texto(x)) : parsear(texto(v));
    const r = await agregar_por_codigo(ctx, spec, clave, actuales, texto(body.codigo ?? form[campo]));
    return { data: { set: r.set }, message: r.message };
  },

  /**
   * Un código leído con el escáner de reglas.
   * - `formulario` (el del registro abierto, con lo no guardado): lo que toca
   *   al registro abierto vuelve en `set` y el navegador lo pone sin recargar.
   * - `id` sin `formulario`: el registro guardado; se escribe al momento.
   * - Sin ninguno (desde «Ver tabla»): solo reglas que no piden registro.
   */
  "POST /herr-registros/escanear": async (ctx) => {
    const body = await ctx.body<{ tabla_id?: string; id?: string; codigo?: string; formulario?: unknown }>();
    const form = body.formulario && typeof body.formulario === "object" && !Array.isArray(body.formulario) ? (body.formulario as Record<string, unknown>) : null;
    const spec = spec_de_fila(await tabla_activa(ctx, texto(form?.tabla_id ?? body.tabla_id)));
    const codigo = texto(body.codigo ?? form?.[CAMPO_REGLAS]);
    if (!codigo) falla(400, "Escanea un código", "validation_error");
    const id = texto(form?.id ?? body.id);
    const guardado = id ? await fila_o_404(ctx, "herr_registros", id, "El registro") : null;
    if (guardado && String(guardado.tabla_id) !== spec.id) falla(400, "Ese registro es de otra tabla", "validation_error");
    const abierto: Abierto | null = form
      ? { id: id || null, valores: valores_de_formulario(spec, form), en_memoria: true }
      : guardado
        ? { id, valores: objeto(guardado.valores), en_memoria: false }
        : null;
    const r = await aplicar_reglas(ctx, spec, abierto, codigo);
    if (!r.aplicadas.length && !r.omitidas.length) falla(404, `Ninguna regla aplica al código «${codigo}»`, "not_found");
    if (!r.aplicadas.length) falla(409, r.omitidas.join(" · "), "conflict");
    return { data: r, message: [...r.aplicadas, ...r.omitidas.map((o) => `No se aplicó ${o}`)].join(" · ") };
  },
});
