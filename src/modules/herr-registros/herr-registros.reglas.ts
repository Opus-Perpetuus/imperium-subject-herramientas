import { define_routes, type DomainRow, type KirletCtx } from "@opus-perpetuus/imperium-core-kit";
import { falla, fila_o_404, texto } from "../../lib/comun.ts";
import { celda_coincide, registro_por_codigo } from "../../lib/formulas/escaneo.ts";
import { spec_de_fila, type TablaSpec } from "../../lib/formulas/esquema.ts";
import { texto_a_numero } from "../../lib/formulas/motor.ts";
import {
  DESTINOS_CON_REGISTRO,
  aplicar_cantidad,
  describir_cambio,
  patron_coincide,
  type ReglaEscaneo,
} from "../../lib/formulas/reglas.ts";
import { filas_recalculadas, ids_referencia, objeto, registros_de, tabla_activa } from "../herr-tablas/herr-tablas.flow.ts";
import { guardar_captura } from "./herr-registros.flow.ts";

export type ResultadoReglas = {
  /** Una línea por regla aplicada. */
  aplicadas: string[];
  /** Reglas que coincidían pero no se pudieron aplicar, con el motivo. */
  omitidas: string[];
};

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

/**
 * Aplica, en orden, todas las reglas de la tabla cuyo patrón y tabla de
 * origen coinciden con el código. Cada regla relee su destino, así que dos
 * reglas sobre el mismo registro se acumulan.
 */
export async function aplicar_reglas(
  ctx: KirletCtx,
  spec: TablaSpec,
  abierto: DomainRow | null,
  leido: string,
): Promise<ResultadoReglas> {
  const codigo = leido.trim();
  const out: ResultadoReglas = { aplicadas: [], omitidas: [] };
  const c: Contexto = { ctx, specs: new Map([[spec.id, spec]]) };
  let actual = abierto;
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
      const fila = registro_por_codigo(ospec, filas_recalculadas(ospec, await registros_de(ctx, ospec.id)), codigo);
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

    // Tabla y registro destino.
    let destino: TablaSpec | null = null;
    let existente: DomainRow | null = null;
    if (regla.destino === "actual") {
      destino = spec;
      existente = actual;
    } else if (regla.destino === "padre" || regla.destino === "nuevo_padre") {
      const enlace = spec.campos.find((x) => x.clave === regla.enlace && x.tipo === "referencia");
      destino = enlace?.tabla_ref_id ? await spec_de(c, enlace.tabla_ref_id) : null;
      if (destino && regla.destino === "padre") {
        const padre_id = ids_referencia(texto(objeto(actual!.valores)[regla.enlace!]))[0] ?? "";
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

    const valores: Record<string, unknown> = existente ? { ...objeto(existente.valores) } : {};
    valores[columna.clave] = aplicar_cantidad(texto(valores[columna.clave]), regla.accion, cantidad);
    if (!existente) {
      const campo_codigo = destino.campos.find((x) => x.clave === regla.columna_codigo);
      if (campo_codigo) valores[campo_codigo.clave] = campo_codigo.tipo === "referencia" ? (origen?.id ?? "") : codigo;
      if (regla.enlace_actual && actual) valores[regla.enlace_actual] = String(actual.id);
    }
    try {
      const r = await guardar_captura(ctx, {
        tabla_id: destino.id,
        id: existente ? String(existente.id) : undefined,
        valores,
      });
      if (actual && String(r.row.id) === String(actual.id)) actual = r.row;
      // Un padre nuevo queda enlazado al registro abierto si ese enlace estaba vacío.
      if (regla.destino === "nuevo_padre" && actual && !texto(objeto(actual.valores)[regla.enlace!])) {
        const enlazado = await guardar_captura(ctx, {
          tabla_id: spec.id,
          id: String(actual.id),
          valores: { ...objeto(actual.valores), [regla.enlace!]: String(r.row.id) },
        });
        actual = enlazado.row;
      }
      const donde = r.creado ? `registro nuevo de «${destino.name}»` : regla.destino === "actual" ? "este registro" : `«${texto(r.row.name) || destino.name}»`;
      out.aplicadas.push(`${nombre}: ${describir_cambio(regla.accion, cantidad, columna.etiqueta)} en ${donde}`);
    } catch (e) {
      omitir(e instanceof Error ? e.message : "no se pudo guardar");
    }
  }
  return out;
}

export const herr_registros_reglas = define_routes({
  /**
   * Un código leído con el escáner de reglas: con `id`, en el registro
   * abierto; sin él, desde «Ver tabla». Responde qué se aplicó y qué no.
   */
  "POST /herr-registros/escanear": async (ctx) => {
    const body = await ctx.body<{ tabla_id?: string; id?: string; codigo?: string }>();
    const spec = spec_de_fila(await tabla_activa(ctx, texto(body.tabla_id)));
    const codigo = texto(body.codigo);
    if (!codigo) falla(400, "Escanea un código", "validation_error");
    const abierto = texto(body.id) ? await fila_o_404(ctx, "herr_registros", texto(body.id), "El registro") : null;
    if (abierto && String(abierto.tabla_id) !== spec.id) falla(400, "Ese registro es de otra tabla", "validation_error");
    const r = await aplicar_reglas(ctx, spec, abierto, codigo);
    if (!r.aplicadas.length && !r.omitidas.length) falla(404, `Ninguna regla aplica al código «${codigo}»`, "not_found");
    if (!r.aplicadas.length) falla(409, r.omitidas.join(" · "), "conflict");
    return { data: r, message: [...r.aplicadas, ...r.omitidas.map((o) => `No se aplicó ${o}`)].join(" · ") };
  },
});
