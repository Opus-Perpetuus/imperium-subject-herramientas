import {
  define_routes,
  new_id,
  now_iso,
  type DomainRow,
  type KirletCtx,
  type NoxUiNode,
} from "@opus-perpetuus/imperium-core-kit";
import { LIMITE_FILAS, campo_busqueda, es_foto_guardada, falla, fila_o_404, texto } from "../../lib/comun.ts";
import { NO_INDEXABLES, buscar, construir_indice } from "../../lib/formulas/busqueda.ts";
import { calcular_valores, formatear, numero_de, valores_resumen } from "../../lib/formulas/calculadora.ts";
import {
  PARTES_REF,
  SIN_FOTO,
  TIPOS_FOTO,
  decimales_de,
  spec_de_fila,
  type CampoSpec,
  type Registro,
  type TablaSpec,
} from "../../lib/formulas/esquema.ts";
import { MAX_FOTOS, cuantas, cuantas_son, lista_de, partir } from "../../lib/formulas/fotos.ts";
import { parsear } from "../../lib/formulas/multivalor.ts";
import {
  TIPOS_AGREGADO,
  calcular_agregado,
  texto_a_numero,
  type TipoAgregado,
} from "../../lib/formulas/motor.ts";
import { ordenar } from "../../lib/formulas/orden.ts";
import { rellenar_plantilla } from "../../lib/formulas/plantilla.ts";
import { plantilla_de, plantillas } from "../../lib/formulas/plantillas.ts";
import { con_unidad, nodo } from "./herr-tablas.nox.ts";

type Datos = Pick<KirletCtx, "data">;
export type Etiquetas = Map<string, Map<string, string>>;

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

/**
 * Todos los registros activos de la tabla, leídos por páginas de
 * `LIMITE_FILAS`: el cierre, el resumen y los agregados necesitan la tabla
 * entera, nunca un recorte.
 */
export async function registros_de(ctx: Datos, tabla_id: string): Promise<DomainRow[]> {
  const todos: DomainRow[] = [];
  for (;;) {
    const pagina = await ctx.data.findMany("herr_registros", {
      where: { tabla_id, is_active: true },
      orderBy: { id: "asc" },
      limit: LIMITE_FILAS,
      offset: todos.length,
    });
    todos.push(...pagina);
    if (pagina.length < LIMITE_FILAS) return todos;
  }
}

/** Capturados y calculados juntos: así los ve el motor y así los indexa la búsqueda. */
export function registro_como_fila(row: DomainRow): Registro {
  return {
    id: String(row.id),
    valores: { ...objeto(row.valores), ...objeto(row.calculados) },
    created_at: texto(row.created_at),
    updated_at: texto(row.updated_at),
    miniaturas: objeto(row.miniaturas),
    unidades: objeto(row.unidades),
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

const NUMERICOS = new Set(["numero", "dinero", "entero", "calculado"]);

/** Ids de un campo referencia. Hay filas con la opción entera del datalist en JSON (`{"_id":…}`): valen por su id. */
export function ids_referencia(raw: string): string[] {
  if (raw.startsWith("{")) {
    try {
      const id = texto((JSON.parse(raw) as { _id?: unknown })._id);
      if (id) return [id];
    } catch {
      // No era una opción en JSON: se lee como cualquier otro valor.
    }
  }
  return parsear(raw);
}

/**
 * El valor de un campo como se lee en la lista: números con sus decimales y
 * unidad, referencias por etiqueta. `unidad` es la de esta fila cuando la
 * columna no tiene una sola (ver `unidad_en_fila`).
 */
export function valor_presentado(
  campo: CampoSpec,
  raw: string,
  etiquetas: Etiquetas,
  unidad: string | null | undefined = campo.unidad,
): string {
  if (!raw) return "";
  if (campo.tipo === "foto") return es_foto_guardada(raw) ? "Foto" : "";
  if (campo.tipo === "fotos") return cuantas(raw);
  if (campo.tipo === "booleano") return raw === "true" ? "Sí" : "No";
  if (campo.tipo === "referencia") {
    const de = etiquetas.get(campo.clave);
    return ids_referencia(raw).map((id) => de?.get(id) ?? "—").join(" · ");
  }
  if (campo.multiple) return parsear(raw).join(" · ");
  if (NUMERICOS.has(campo.tipo)) {
    const n = texto_a_numero(raw);
    const valor = n === null ? raw : formatear(n, campo.tipo === "entero" ? 0 : decimales_de(campo));
    return con_unidad(valor, unidad);
  }
  return con_unidad(raw, unidad);
}

/** Un registro enlazado como opción del datalist del lanzador: una entrada por parte con texto y su foto. */
export type OpcionRef = {
  label: string;
  leyend_secondary?: string;
  description?: string;
  description_secondary?: string;
  image?: string;
};

/** Lo que hace falta de la tabla que elige una columna «Enlace»: su esquema, sus registros y cómo se ve cada uno al elegirlo. */
export type Enlace = {
  destino: TablaSpec | null;
  registros: Map<string, Registro>;
  opciones: Map<string, OpcionRef>;
};

/** Clave de cada columna «Enlace» de una tabla → su `Enlace`. */
export type Enlaces = Map<string, Enlace>;

/**
 * Las columnas de fotos de la tabla enlazada que acompañan a un enlace, en
 * orden de preferencia. Si la elegida (`ref_foto`) ya no existe, todas, como
 * cuando no se eligió ninguna.
 */
function campos_foto_ref(campo: CampoSpec, destino: TablaSpec | null): CampoSpec[] {
  if (!destino || campo.ref_foto === SIN_FOTO) return [];
  const fotos = destino.campos.filter((c) => TIPOS_FOTO.has(c.tipo));
  const elegida = fotos.filter((c) => c.clave === campo.ref_foto);
  return elegida.length ? elegida : fotos;
}

/** Fotos de una celda: miniaturas para pintarla y las completas para el visor, en el mismo orden. */
export type FotosCelda = { minis: string[]; urls: string[] };

function fotos_de_registro(registro: Registro, clave: string): FotosCelda {
  const urls = lista_de(registro.valores[clave]).filter(es_foto_guardada);
  const minis = partir(registro.miniaturas?.[clave]);
  return { urls, minis: urls.map((url, i) => minis[i] || url) };
}

/** Las fotos del registro enlazado (la primera columna que las tenga si no se eligió una). */
function fotos_del_enlazado(campo: CampoSpec, destino: TablaSpec | null, registro: Registro): FotosCelda {
  for (const c of campos_foto_ref(campo, destino)) {
    const fotos = fotos_de_registro(registro, c.clave);
    if (fotos.urls.length) return fotos;
  }
  return { minis: [], urls: [] };
}

function opcion_de(campo: CampoSpec, destino: TablaSpec | null, fila: DomainRow, registro: Registro, anidadas: Etiquetas): OpcionRef {
  const { valores } = registro;
  const presentados = destino
    ? Object.fromEntries(
        destino.campos.map((c) => [
          c.clave,
          valor_presentado(c, valores[c.clave] ?? "", anidadas, unidad_en_fila(c, registro, new Map())),
        ]),
      )
    : valores;
  const partes: Record<string, string> = {};
  for (const { campo: parte, opcion } of PARTES_REF) {
    const t = rellenar_plantilla(campo[parte], presentados);
    if (t) partes[opcion] = t;
  }
  // Solo una miniatura en línea: desde la APK un `<img>` a `/api/media` sale sin la sesión.
  const image =
    campos_foto_ref(campo, destino)
      .map((c) => partir(registro.miniaturas?.[c.clave]).find((m) => m.startsWith("data:")))
      .find(Boolean) ?? "";
  return { ...partes, label: partes.label || texto(fila.name) || String(fila.id), ...(image ? { image } : {}) };
}

/**
 * Las columnas «Enlace» de la tabla con lo que eligen. Un enlace de la tabla
 * enlazada se enseña por su título sin bajar más: dos tablas que se enlazan
 * entre sí no se resolverían nunca.
 */
export async function enlaces_de(data: KirletCtx["data"], spec: TablaSpec, profundidad = 1): Promise<Enlaces> {
  const out: Enlaces = new Map();
  const leidas = new Map<string, DomainRow[]>();
  for (const campo of spec.campos) {
    if (campo.tipo !== "referencia" || !campo.tabla_ref_id) continue;
    const tabla = await data.findOne("herr_tablas", { id: campo.tabla_ref_id });
    const destino = tabla ? spec_de_fila(tabla) : null;
    const usada = (clave: string) => PARTES_REF.some((p) => (campo[p.campo] ?? "").includes(`{${clave}}`));
    const enlaces =
      destino && profundidad > 0 ? destino.campos.filter((c) => c.tipo === "referencia" && usada(c.clave)) : [];
    const anidadas =
      destino && enlaces.length ? etiquetas_de(await enlaces_de(data, { ...destino, campos: enlaces }, profundidad - 1)) : new Map();
    const filas = leidas.get(campo.tabla_ref_id) ?? (await registros_de({ data }, campo.tabla_ref_id));
    leidas.set(campo.tabla_ref_id, filas);
    const registros = new Map(filas.map((r) => [String(r.id), registro_como_fila(r)]));
    out.set(campo.clave, {
      destino,
      registros,
      opciones: new Map(filas.map((r) => [String(r.id), opcion_de(campo, destino, r, registros.get(String(r.id))!, anidadas)])),
    });
  }
  return out;
}

/** Clave de cada campo referencia → (id del registro apuntado → su opción). */
export async function opciones_referencia(
  data: KirletCtx["data"],
  spec: TablaSpec,
  profundidad = 1,
): Promise<Map<string, Map<string, OpcionRef>>> {
  return new Map([...(await enlaces_de(data, spec, profundidad))].map(([clave, e]) => [clave, e.opciones]));
}

/** Clave de cada campo referencia → (id del registro apuntado → título que se enseña). */
export function etiquetas_de(enlaces: Enlaces): Etiquetas {
  return new Map([...enlaces].map(([clave, e]) => [clave, new Map([...e.opciones].map(([id, o]) => [id, o.label]))]));
}

export async function etiquetas_referencia(data: KirletCtx["data"], spec: TablaSpec, profundidad = 1): Promise<Etiquetas> {
  return etiquetas_de(await enlaces_de(data, spec, profundidad));
}

const UNIDAD_DE_NUMERO = new Set(["numero", "entero", "dinero", "calculado", "nivel"]);

/**
 * La unidad de una columna en una fila: la del registro que elige su enlace
 * (`unidad_de`), la que se escribió al capturar (`unidad_por_registro`) o la
 * de la columna. Sin dato de dónde sacarla, la de la columna.
 */
export function unidad_en_fila(campo: CampoSpec, fila: Registro, enlaces: Enlaces): string | null {
  if (campo.unidad_de) {
    const [ref = "", fuente = ""] = campo.unidad_de.split(":");
    const enlace = enlaces.get(ref);
    const id = ids_referencia(fila.valores[ref] ?? "")[0];
    const enlazado = id ? enlace?.registros.get(id) : undefined;
    const origen = enlace?.destino?.campos.find((c) => c.clave === fuente);
    if (enlazado && origen) {
      const u = UNIDAD_DE_NUMERO.has(origen.tipo)
        ? unidad_en_fila(origen, enlazado, new Map())
        : texto(enlazado.valores[origen.clave]);
      if (u) return u;
    }
    return campo.unidad ?? null;
  }
  if (campo.unidad_por_registro) return fila.unidades?.[campo.clave] || campo.unidad || null;
  return campo.unidad ?? null;
}

/** Lo que hace falta para enseñar filas: títulos de sus enlaces, la unidad de cada número y las fotos de lo enlazado. */
export type Presentacion = {
  etiquetas: Etiquetas;
  unidad: (campo: CampoSpec, fila: Registro) => string | null;
  fotos_enlace: (campo: CampoSpec, fila: Registro) => FotosCelda;
};

export function presentacion_de(enlaces: Enlaces): Presentacion {
  return {
    etiquetas: etiquetas_de(enlaces),
    unidad: (campo, fila) => unidad_en_fila(campo, fila, enlaces),
    fotos_enlace: (campo, fila) => {
      const enlace = enlaces.get(campo.clave);
      const fotos: FotosCelda = { minis: [], urls: [] };
      for (const id of ids_referencia(fila.valores[campo.clave] ?? "")) {
        const registro = enlace?.registros.get(id);
        if (!registro) continue;
        const de_uno = fotos_del_enlazado(campo, enlace!.destino, registro);
        fotos.minis.push(...de_uno.minis);
        fotos.urls.push(...de_uno.urls);
      }
      return { minis: fotos.minis.slice(0, MAX_FOTOS), urls: fotos.urls.slice(0, MAX_FOTOS) };
    },
  };
}

export function presentar(campo: CampoSpec, fila: Registro, p: Presentacion): string {
  return valor_presentado(campo, fila.valores[campo.clave] ?? "", p.etiquetas, p.unidad(campo, fila));
}

/** Ids de las filas que encuentra `q` en sus valores, calculados y etiquetas de enlaces; las mejores primero. */
/**
 * Ids de las filas que encuentra `q`, las mejores primero. Se indexa lo que
 * se lee en la lista: «Sí», el título de un enlace y la unidad de cada número,
 * no `true` ni el id del registro enlazado.
 */
export function coincidencias(spec: TablaSpec, filas: Registro[], p: Presentacion, q: string): string[] {
  const indexables = spec.campos.filter((c) => !NO_INDEXABLES.has(c.tipo));
  const entradas = filas.map((f) => ({
    id: f.id,
    texto: indexables.map((c) => presentar(c, f, p)).filter(Boolean).join(" "),
    updated_at: f.updated_at,
  }));
  return buscar(construir_indice(entradas), q, new Map(entradas.map((e) => [e.id, e])));
}

/** Las filas que encuentra `q`, en el orden en que ya venían (el de la tabla). */
export function filtrar_filas(spec: TablaSpec, filas: Registro[], p: Presentacion, q: string): Registro[] {
  if (!q) return filas;
  const si = new Set(coincidencias(spec, filas, p, q));
  return filas.filter((f) => si.has(f.id));
}

/** Registros por página en «Ver tabla» y en un cierre. */
export const POR_PAGINA = 50;

/** La página pedida (desde 1, como en la URL) dentro de las que hay, y desde qué fila empieza. */
export function pagina_de(total: number, pedida: string | null, por_pagina = POR_PAGINA): { pagina: number; desde: number } {
  const paginas = Math.max(1, Math.ceil(total / por_pagina));
  const n = Math.trunc(Number(pedida));
  const pagina = Number.isFinite(n) && n >= 1 ? Math.min(n, paginas) : 1;
  return { pagina, desde: (pagina - 1) * por_pagina };
}

/**
 * Buscador, la página pedida de la tabla y el paginador. Buscar por `q` y
 * paginar por `page` son las llaves que un enlace compartido deja cambiar.
 */
export function registros_paginados<T>(
  params: URLSearchParams,
  total: number,
  visibles: T[],
  tabla: (pagina: T[], vacio: string) => NoxUiNode,
  vacio = "Sin registros",
): NoxUiNode[] {
  const q = texto(params.get("q"));
  const { pagina: actual, desde } = pagina_de(visibles.length, params.get("page"));
  const out: NoxUiNode[] = [];
  if (total) out.push(nodo("nox.search", { label: "Buscar en los registros", value: q }));
  if (q) {
    const n = visibles.length;
    out.push(
      nodo("nox.markdown-view", {
        content: `**${n}** de ${total} ${total === 1 ? "registro" : "registros"} ${n === 1 ? "coincide" : "coinciden"} con «${q}».`,
      }),
    );
  }
  out.push(tabla(visibles.slice(desde, desde + POR_PAGINA), q ? "Ningún registro coincide con la búsqueda" : vacio));
  if (visibles.length > POR_PAGINA) {
    out.push(nodo("nox.paginator", { total: visibles.length, page_size: POR_PAGINA, page: actual }));
  }
  return out;
}

export function columnas_de_lista(spec: TablaSpec): CampoSpec[] {
  return spec.campos.some((c) => c.en_resumen) ? spec.campos.filter((c) => c.en_resumen) : spec.campos;
}

/** Lo que enseña «Ver tabla» (y lo que se imprime): las filas en su orden, las columnas de la lista y cómo se presenta cada fila. */
export async function vista_de_tabla(data: KirletCtx["data"], spec: TablaSpec) {
  const filas = ordenar(spec, filas_recalculadas(spec, await registros_de({ data }, spec.id)));
  const presentacion = presentacion_de(await enlaces_de(data, spec));
  return { filas, etiquetas: presentacion.etiquetas, columnas: columnas_de_lista(spec), presentacion };
}

const llave_miniatura = (clave: string) => `${clave}__mini`;
const llave_foto = (clave: string) => `${clave}__url`;

/** La columna con la foto de lo que elige un enlace: va junto a él cuando se pidió verla en la tabla. */
export const clave_foto_enlace = (clave: string) => `${clave}@foto`;

export function con_foto_de_enlace(campo: CampoSpec): boolean {
  return campo.tipo === "referencia" && campo.ref_foto_en_tabla === true && campo.ref_foto !== SIN_FOTO;
}

/**
 * El `nox.table` de unos registros: cada foto como miniatura que abre la
 * completa en el visor (varias, como galería), las fotos de lo enlazado en su
 * propia columna si se pidieron y, con `destino`, cada fila abre lo que diga.
 */
export function tabla_de_registros(
  columnas: CampoSpec[],
  filas: Registro[],
  p: Presentacion,
  destino?: (fila: Registro) => string,
  vacio = "Sin registros",
): NoxUiNode {
  const de_imagen = (key: string, label: string) => ({ key, label, image_key: llave_miniatura(key), image_full_key: llave_foto(key) });
  const poner_fotos = (fila: Record<string, unknown>, key: string, fotos: FotosCelda) => {
    if (!fotos.urls.length) return;
    fila[llave_miniatura(key)] = fotos.minis[0] || fotos.urls[0];
    fila[llave_foto(key)] = fotos.urls.length > 1 ? fotos.urls : fotos.urls[0];
  };
  return nodo("nox.table", {
    columns: columnas.flatMap((c) => {
      if (TIPOS_FOTO.has(c.tipo)) return [de_imagen(c.clave, c.etiqueta)];
      if (con_foto_de_enlace(c)) return [{ key: c.clave, label: c.etiqueta }, de_imagen(clave_foto_enlace(c.clave), `Foto · ${c.etiqueta}`)];
      return [{ key: c.clave, label: c.etiqueta }];
    }),
    rows: filas.map((f) => {
      const fila: Record<string, unknown> = {};
      for (const c of columnas) {
        const raw = f.valores[c.clave] ?? "";
        fila[c.clave] = presentar(c, f, p);
        if (c.tipo === "foto" && es_foto_guardada(raw)) {
          // Una columna que fue «Varias fotos» trae varias: «Foto» enseña la primera.
          const url = lista_de(raw)[0]!;
          fila[llave_miniatura(c.clave)] = partir(f.miniaturas?.[c.clave])[0] || url;
          fila[llave_foto(c.clave)] = url;
        }
        if (c.tipo === "fotos") poner_fotos(fila, c.clave, fotos_de_registro(f, c.clave));
        if (con_foto_de_enlace(c)) {
          const fotos = p.fotos_enlace(c, f);
          fila[clave_foto_enlace(c.clave)] = cuantas_son(fotos.urls.length);
          poner_fotos(fila, clave_foto_enlace(c.clave), fotos);
        }
      }
      if (destino) fila._href = destino(f);
      return fila;
    }),
    text: vacio,
  });
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
    cerrable: p.cerrable !== false,
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

  "POST /herr-tablas/:id/buscar": async (ctx) => {
    const spec = spec_de_fila(await tabla_activa(ctx, ctx.params.id));
    const body = await ctx.body<{ q?: string }>();
    const registros = await registros_de(ctx, spec.id);
    const presentacion = presentacion_de(await enlaces_de(ctx.data, spec));
    const por_registro = new Map(registros.map((r) => [String(r.id), r]));
    const data = coincidencias(spec, filas_recalculadas(spec, registros), presentacion, texto(body.q)).map(
      (id) => por_registro.get(id)!,
    );
    return { data, total_elementos: data.length };
  },
});
