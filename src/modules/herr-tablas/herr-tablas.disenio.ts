import {
  define_routes,
  new_id,
  now_iso,
  type DomainRow,
  type KirletCtx,
} from "@opus-perpetuus/imperium-core-kit";
import { booleano, campo_busqueda, falla, numero, texto } from "../../lib/comun.ts";
import {
  CON_PLANTILLA,
  OPERACIONES,
  PARTES_UI,
  SIN_COLUMNA,
  TIPO_AUTOMATICO,
  TOTAL_REGISTROS,
  campos_desde_propuestas,
  clave_libre,
  claves_usadas,
  columnas_desde_texto,
  es_operacion,
  es_total,
  formula_con_claves,
  limpiar_etiqueta,
  mensajes_legibles,
  necesita_ajustes,
  nombre_total,
  operando,
  opciones_desde_texto,
  totales_por_defecto,
} from "../../lib/formulas/disenio.ts";
import {
  PARTES_REF,
  TIPOS_CAMPO,
  spec_de_fila,
  validar_esquema,
  type CampoSpec,
  type TablaSpec,
  type TipoCampo,
} from "../../lib/formulas/esquema.ts";
import { claves_referenciadas, parsear_agregado } from "../../lib/formulas/motor.ts";
import { plantilla_con_claves } from "../../lib/formulas/plantilla.ts";
import { tabla_activa } from "./herr-tablas.flow.ts";

const ESQUEMA = ["campos", "constantes", "resumenes"] as const;

const huella = (fila: DomainRow) => {
  const s = spec_de_fila(fila);
  return JSON.stringify([s.campos, s.constantes, s.resumenes]);
};

/** Valida el esquema antes de guardarlo, lo deja normalizado y sube `version_esquema` cuando cambia. */
export function preparar_tabla(ctx: KirletCtx, patch: DomainRow, existing: DomainRow | null): DomainRow {
  if (existing) delete patch.created_by;
  else patch.created_by = ctx.actor;
  for (const col of ESQUEMA) {
    if (typeof patch[col] === "string") falla(400, `${col}: JSON inválido`);
  }
  const fila = { ...existing, ...patch };
  const spec = spec_de_fila(fila);
  const errores = validar_esquema(spec);
  if (errores.length) falla(400, errores.join("; "));
  const toca_esquema = !existing || ESQUEMA.some((col) => col in patch);
  if (toca_esquema) {
    patch.campos = spec.campos;
    patch.constantes = spec.constantes;
    patch.resumenes = spec.resumenes;
  }
  if (!existing) patch.version_esquema = 1;
  else if (toca_esquema && huella(fila) !== huella(existing)) {
    patch.version_esquema = Number(existing.version_esquema ?? 0) + 1;
  }
  patch.search_field = campo_busqueda(fila.name, fila.description, ...spec.campos.map((c) => c.etiqueta));
  return patch;
}

/**
 * Guarda el esquema que cambió el diseñador por el mismo camino que el CRUD
 * (normalización, versión, búsqueda), pero con los errores en los nombres que
 * ve la persona. No deja rastro en el historial del CRUD: ese lo escribe el
 * CRUD genérico en sus propios hooks.
 */
async function guardar(ctx: KirletCtx, existing: DomainRow, spec: TablaSpec, extra: DomainRow = {}): Promise<DomainRow> {
  const errores = validar_esquema(spec);
  if (errores.length) falla(400, mensajes_legibles(spec, errores), "validation_error");
  const patch = preparar_tabla(
    ctx,
    { campos: spec.campos, constantes: spec.constantes, resumenes: spec.resumenes, ...extra },
    existing,
  );
  const cambio = { ...patch, updated_at: now_iso() };
  return (await ctx.data.update("herr_tablas", { id: String(existing.id) }, cambio)) ?? { ...existing, ...cambio };
}

async function esquema(ctx: KirletCtx): Promise<{ fila: DomainRow; spec: TablaSpec }> {
  const fila = await tabla_activa(ctx, ctx.params.id!);
  return { fila, spec: spec_de_fila(fila) };
}

function tipo_elegido(valor: unknown): TipoCampo | null {
  const t = texto(valor);
  if (!t || t === TIPO_AUTOMATICO) return null;
  if (!(TIPOS_CAMPO as readonly string[]).includes(t)) falla(400, `Tipo desconocido «${t}»`, "validation_error");
  return t as TipoCampo;
}

function indice_de<T extends { clave: string }>(lista: T[], clave: string | undefined, que: string): number {
  const i = lista.findIndex((x) => x.clave === clave);
  if (i < 0) falla(404, `${que} no existe`, "not_found");
  return i;
}

function usa(formula: string | null | undefined, clave: string): boolean {
  return [...claves_referenciadas(formula ?? "")].some((ref) => ref === clave || parsear_agregado(ref)?.campo === clave);
}

/** No se quita lo que otra fórmula necesita: quedaría rota sin que nadie lo note hasta el siguiente registro. */
function exigir_sin_uso(spec: TablaSpec, clave: string, etiqueta: string): void {
  const usan = [
    ...spec.campos.filter((c) => c.clave !== clave && c.tipo === "calculado" && usa(c.formula, clave)),
    ...spec.resumenes.filter((r) => usa(r.formula, clave)),
  ].map((x) => `«${x.etiqueta}»`);
  if (usan.length) falla(409, `«${etiqueta}» se usa en ${usan.join(", ")}: cambia o quita eso primero`, "conflict");
}

/** Lo que el formulario necesita para saber a dónde seguir (`then` con `{id}`, `{modo}`, `{campo}`, `{v}`). */
function siguiente(fila: DomainRow, modo: "disenar" | "campo", campo = "") {
  return { id: String(fila.id), modo, campo, v: String(fila.version_esquema ?? "") };
}

/** Cambios del editor de columna; solo toca lo que llega. */
async function aplicar_cambios(ctx: KirletCtx, spec: TablaSpec, antes: CampoSpec, body: Record<string, unknown>): Promise<CampoSpec> {
  const campo: CampoSpec = { ...antes };
  if ("etiqueta" in body) {
    campo.etiqueta = limpiar_etiqueta(texto(body.etiqueta));
    if (!campo.etiqueta) falla(400, "Escribe el nombre de la columna", "validation_error");
  }
  if ("tipo" in body) campo.tipo = tipo_elegido(body.tipo) ?? campo.tipo;
  if ("requerido" in body) campo.requerido = booleano(body.requerido);
  if ("en_resumen" in body) campo.en_resumen = booleano(body.en_resumen);
  if ("multiple" in body) campo.multiple = booleano(body.multiple);
  if ("valor_por_defecto" in body) campo.valor_por_defecto = texto(body.valor_por_defecto) || null;
  if ("unidad" in body) campo.unidad = texto(body.unidad) || null;
  const decimales = numero(body.decimales);
  if (decimales !== null) campo.decimales = Math.min(6, Math.max(0, Math.round(decimales)));
  const pasos = numero(body.pasos);
  if (pasos !== null) campo.pasos = Math.max(0, Math.round(pasos));
  if ("capacidad" in body) campo.capacidad = numero(body.capacidad);
  if ("opciones" in body) campo.opciones = opciones_desde_texto(body.opciones);
  if ("enlace" in body) {
    const tabla_ref = texto(body.enlace) || null;
    if (tabla_ref && !(await ctx.data.findOne("herr_tablas", { id: tabla_ref }))) {
      falla(400, "La tabla enlazada no existe", "validation_error");
    }
    // Las plantillas nombran columnas de la tabla de antes.
    if (tabla_ref !== campo.tabla_ref_id) for (const { campo: parte } of PARTES_REF) campo[parte] = null;
    campo.tabla_ref_id = tabla_ref;
  }
  const op = texto(body.operacion);
  if (es_operacion(op)) {
    const a = operando(spec, texto(body.dato_a));
    const b = operando(spec, texto(body.dato_b), numero(body.numero_b));
    if (!a || !b) falla(400, "Elige los dos datos de la operación (o escribe un número para B)", "validation_error");
    campo.formula = OPERACIONES[op].armar(a, b);
    if (op === "porcentaje" && !campo.unidad) campo.unidad = "%";
  } else if (texto(body.formula)) {
    campo.formula = formula_con_claves(spec, texto(body.formula));
  }
  if (campo.tipo === "calculado") campo.formula ||= "0";
  else campo.formula = null;
  if (campo.tipo === "entero") campo.decimales = 0;
  return campo;
}

export const herr_tablas_disenio = define_routes({
  /** Tabla nueva desde un nombre y, si se quiere, las columnas escritas como texto libre. */
  "POST /herr-tablas/nueva": async (ctx) => {
    const body = await ctx.body<{ name?: string; columnas?: string }>();
    const name = texto(body.name);
    if (!name) falla(400, "Ponle nombre a la tabla", "validation_error");
    const vacia: TablaSpec = { id: "", name, campos: [], constantes: [], resumenes: [] };
    const campos = campos_desde_propuestas(vacia, columnas_desde_texto(texto(body.columnas)));
    const ts = now_iso();
    const row = preparar_tabla(
      ctx,
      {
        id: new_id("tabla"),
        name,
        description: "",
        is_active: true,
        icono: "fa-table",
        campos,
        constantes: [],
        resumenes: totales_por_defecto(campos),
        plantilla_id: null,
        // Una bitácora se lee de lo más nuevo a lo más viejo por su fecha.
        orden_campo: campos.find((c) => c.tipo === "fecha")?.clave ?? null,
        orden_desc: true,
        // «Cerrar día» vacía la tabla: que nadie lo encuentre sin haberlo pedido.
        cerrable: false,
        created_at: ts,
        updated_at: ts,
      },
      null,
    );
    return ctx.created(await ctx.data.insert("herr_tablas", row));
  },

  /**
   * Agrega columnas. `etiqueta` admite varias separadas por coma o renglón y
   * `Categoría: A, B` para una lista; `tipo` (o «auto») manda si es una sola.
   */
  "POST /herr-tablas/:id/campos": async (ctx) => {
    const { fila, spec } = await esquema(ctx);
    const body = await ctx.body<{ etiqueta?: string; tipo?: string }>();
    const propuestas = columnas_desde_texto(texto(body.etiqueta));
    if (!propuestas.length) falla(400, "Escribe el nombre de la columna", "validation_error");
    const tipo = tipo_elegido(body.tipo);
    if (tipo && propuestas.length === 1) propuestas[0]!.tipo = tipo;
    const nuevos = campos_desde_propuestas(spec, propuestas);
    const guardada = await guardar(ctx, fila, { ...spec, campos: [...spec.campos, ...nuevos] });
    const primero = nuevos[0]!;
    const modo = nuevos.length === 1 && necesita_ajustes(primero) ? "campo" : "disenar";
    const nombres = nuevos.map((c) => `«${c.etiqueta}»`).join(", ");
    return {
      data: siguiente(guardada, modo, primero.clave),
      message: nuevos.length === 1 ? `Columna ${nombres} agregada` : `Columnas agregadas: ${nombres}`,
    };
  },

  "PATCH /herr-tablas/:id/campos/:clave": async (ctx) => {
    const { fila, spec } = await esquema(ctx);
    const i = indice_de(spec.campos, ctx.params.clave, "La columna");
    const antes = spec.campos[i]!;
    const body = await ctx.body<Record<string, unknown>>();
    const campo = await aplicar_cambios(ctx, spec, antes, body);
    const campos = spec.campos.toSpliced(i, 1);
    const posicion = numero(body.posicion);
    campos.splice(posicion === null ? i : Math.min(campos.length, Math.max(0, Math.round(posicion))), 0, campo);
    const guardada = await guardar(ctx, fila, { ...spec, campos });
    // Otro tipo u otra tabla traen otros ajustes (opciones, fórmula, qué se ve): se vuelve a abrir la columna para verlos.
    const modo =
      campo.tipo !== antes.tipo || campo.tabla_ref_id !== antes.tabla_ref_id || necesita_ajustes(campo) ? "campo" : "disenar";
    return { data: siguiente(guardada, modo, campo.clave), message: `Columna «${campo.etiqueta}» guardada` };
  },

  /**
   * Qué se ve de cada registro enlazado al elegirlo, parte por parte: una
   * columna del menú (`columna_<parte>`) o una plantilla escrita con los
   * nombres de las columnas (`plantilla_<parte>`).
   */
  "PATCH /herr-tablas/:id/campos/:clave/opcion": async (ctx) => {
    const { fila, spec } = await esquema(ctx);
    const i = indice_de(spec.campos, ctx.params.clave, "La columna");
    const campo = { ...spec.campos[i]! };
    if (campo.tipo !== "referencia" || !campo.tabla_ref_id) {
      falla(409, `Elige primero de qué tabla se toma «${campo.etiqueta}»`, "conflict");
    }
    const destino = spec_de_fila(await tabla_activa(ctx, campo.tabla_ref_id));
    const body = await ctx.body<Record<string, unknown>>();
    for (const { campo: parte } of PARTES_REF) {
      const columna = texto(body[`columna_${parte}`]);
      if (columna === SIN_COLUMNA) campo[parte] = null;
      else if (columna && columna !== CON_PLANTILLA) {
        if (!destino.campos.some((c) => c.clave === columna)) {
          falla(400, `«${PARTES_UI[parte]}»: «${destino.name}» no tiene esa columna`, "validation_error");
        }
        campo[parte] = `{${columna}}`;
      }
      if (`plantilla_${parte}` in body) {
        const { plantilla, desconocidos } = plantilla_con_claves(destino, texto(body[`plantilla_${parte}`]));
        if (desconocidos.length) {
          const cuales = desconocidos.map((n) => `«${n}»`).join(", ");
          const verbo = desconocidos.length === 1 ? "no es una columna" : "no son columnas";
          falla(400, `«${PARTES_UI[parte]}»: ${cuales} ${verbo} de «${destino.name}»`, "validation_error");
        }
        campo[parte] = plantilla || null;
      }
    }
    const guardada = await guardar(ctx, fila, { ...spec, campos: spec.campos.with(i, campo) });
    return { data: siguiente(guardada, "campo", campo.clave), message: `Así se verá «${campo.etiqueta}» al capturar` };
  },

  "DELETE /herr-tablas/:id/campos/:clave": async (ctx) => {
    const { fila, spec } = await esquema(ctx);
    const campo = spec.campos[indice_de(spec.campos, ctx.params.clave, "La columna")]!;
    exigir_sin_uso(spec, campo.clave, campo.etiqueta);
    const campos = spec.campos.filter((c) => c.clave !== campo.clave);
    const extra = spec.orden_campo === campo.clave ? { orden_campo: null } : {};
    const guardada = await guardar(ctx, fila, { ...spec, campos }, extra);
    return { data: siguiente(guardada, "disenar"), message: `Columna «${campo.etiqueta}» quitada` };
  },

  /** Valor fijo: se escribe una vez y vale para todos los registros (una meta, una deuda, el precio del litro). */
  "POST /herr-tablas/:id/constantes": async (ctx) => {
    const { fila, spec } = await esquema(ctx);
    const body = await ctx.body<{ etiqueta?: string; valor?: string; unidad?: string }>();
    const etiqueta = limpiar_etiqueta(texto(body.etiqueta));
    if (!etiqueta) falla(400, "Escribe el nombre del valor fijo", "validation_error");
    const constante = {
      clave: clave_libre(etiqueta, claves_usadas(spec)),
      etiqueta,
      valor: texto(body.valor),
      unidad: texto(body.unidad) || null,
      decimales: 2,
    };
    const guardada = await guardar(ctx, fila, { ...spec, constantes: [...spec.constantes, constante] });
    return { data: siguiente(guardada, "disenar"), message: `Valor fijo «${etiqueta}» agregado` };
  },

  "PATCH /herr-tablas/:id/constantes/:clave": async (ctx) => {
    const { fila, spec } = await esquema(ctx);
    const i = indice_de(spec.constantes, ctx.params.clave, "El valor fijo");
    const body = await ctx.body<{ valor?: unknown; unidad?: unknown }>();
    const constante = { ...spec.constantes[i]! };
    if ("valor" in body) constante.valor = texto(body.valor);
    if ("unidad" in body) constante.unidad = texto(body.unidad) || null;
    const guardada = await guardar(ctx, fila, { ...spec, constantes: spec.constantes.with(i, constante) });
    return { data: siguiente(guardada, "disenar"), message: `«${constante.etiqueta}» guardado` };
  },

  "DELETE /herr-tablas/:id/constantes/:clave": async (ctx) => {
    const { fila, spec } = await esquema(ctx);
    const constante = spec.constantes[indice_de(spec.constantes, ctx.params.clave, "El valor fijo")]!;
    exigir_sin_uso(spec, constante.clave, constante.etiqueta);
    const constantes = spec.constantes.filter((c) => c.clave !== constante.clave);
    const guardada = await guardar(ctx, fila, { ...spec, constantes });
    return { data: siguiente(guardada, "disenar"), message: `Valor fijo «${constante.etiqueta}» quitado` };
  },

  /**
   * Total que se ve encima de la lista. Guiado (`tipo` + `campo`: «Total de
   * Monto») o con fórmula escrita con los nombres de las columnas.
   */
  "POST /herr-tablas/:id/resumenes": async (ctx) => {
    const { fila, spec } = await esquema(ctx);
    const body = await ctx.body<{ tipo?: string; campo?: string; etiqueta?: string; formula?: string }>();
    const tipo = texto(body.tipo);
    const campo = spec.campos.find((c) => c.clave === texto(body.campo));
    let formula: string;
    let etiqueta = limpiar_etiqueta(texto(body.etiqueta));
    let unidad: string | null = null;
    let decimales = 2;
    if (texto(body.formula)) {
      formula = formula_con_claves(spec, texto(body.formula));
      if (!etiqueta) falla(400, "Ponle nombre al total", "validation_error");
    } else if (tipo === TOTAL_REGISTROS.valor) {
      formula = TOTAL_REGISTROS.formula;
      etiqueta ||= "Registros";
      decimales = 0;
    } else if (es_total(tipo) && campo) {
      formula = `{${tipo}:${campo.clave}}`;
      etiqueta ||= nombre_total(tipo, campo);
      const cuenta = tipo === "cuenta" || campo.tipo === "booleano";
      unidad = cuenta ? null : (campo.unidad ?? null);
      decimales = cuenta || campo.tipo === "entero" ? 0 : (campo.decimales ?? 2);
    } else {
      falla(400, "Elige qué calcular y de qué columna", "validation_error");
    }
    const resumen = {
      clave: clave_libre(etiqueta, new Set(spec.resumenes.map((r) => r.clave))),
      etiqueta,
      formula,
      unidad,
      decimales,
    };
    const guardada = await guardar(ctx, fila, { ...spec, resumenes: [...spec.resumenes, resumen] });
    return { data: siguiente(guardada, "disenar"), message: `Total «${etiqueta}» agregado` };
  },

  "DELETE /herr-tablas/:id/resumenes/:clave": async (ctx) => {
    const { fila, spec } = await esquema(ctx);
    const resumen = spec.resumenes[indice_de(spec.resumenes, ctx.params.clave, "El total")]!;
    const resumenes = spec.resumenes.filter((r) => r.clave !== resumen.clave);
    const guardada = await guardar(ctx, fila, { ...spec, resumenes });
    return { data: siguiente(guardada, "disenar"), message: `Total «${resumen.etiqueta}» quitado` };
  },
});
