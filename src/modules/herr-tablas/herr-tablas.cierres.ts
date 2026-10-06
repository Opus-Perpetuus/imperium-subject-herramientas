import {
  define_routes,
  new_id,
  now_iso,
  type DomainRow,
  type KirletCtx,
  type KirletIdentity,
  type NoxPageDescriptor,
  type NoxUiNode,
} from "@opus-perpetuus/imperium-core-kit";
import {
  LIMITE_FILAS,
  booleano,
  campo_busqueda,
  dia_legible,
  falla,
  fecha_hoy,
  momento_legible,
  puede,
  solo_dia,
  texto,
} from "../../lib/comun.ts";
import { calculados_de, valores_resumen } from "../../lib/formulas/calculadora.ts";
import { claves_resumen_archivo, planear_cierre } from "../../lib/formulas/cierre.ts";
import {
  agrupacion_por_defecto,
  columnas_agrupables,
  columnas_medibles,
  comparar_grupos,
  comparar_totales,
  type FilaComparada,
  type Periodo,
} from "../../lib/formulas/comparar.ts";
import { clave_libre, limpiar_etiqueta, opciones_desde_texto } from "../../lib/formulas/disenio.ts";
import { TIPOS_CAMPO_CIERRE, spec_de_fila, type CampoSpec, type Registro, type TablaSpec } from "../../lib/formulas/esquema.ts";
import { ordenar } from "../../lib/formulas/orden.ts";
import { valores_capturados } from "../herr-registros/herr-registros.flow.ts";
import { nodo_entrada } from "../herr-registros/herr-registros.pages.ts";
import { ID_TABLA, href_tabla, migas } from "./herr-tablas.disenador.ts";
import {
  columnas_de_lista,
  enlaces_de,
  etiquetas_de,
  etiquetas_referencia,
  filas_recalculadas,
  filtrar_filas,
  ids_referencia,
  objeto,
  presentacion_de,
  registro_como_fila,
  registros_de,
  registros_paginados,
  tabla_activa,
  tabla_de_registros,
  unidad_en_fila,
  valor_presentado,
  type Enlaces,
  type Etiquetas,
  type Presentacion,
} from "./herr-tablas.flow.ts";
import { boton, con_unidad, nodo, pagina } from "./herr-tablas.nox.ts";

/**
 * Cierres con nombre: el formulario para cerrar (nombre, fecha y los datos que
 * pida la tabla), la lista de cierres, uno abierto y la comparación de varios
 * entre sí o contra lo que hay sin cerrar. Son modos de la hoja `herr-tabla`
 * (`cerrar`, `cierres`, `cierre`, `comparar`): el lanzador solo navega a las
 * hojas que declara el monorepo.
 */

type Datos = KirletCtx["data"];

const ENCABEZADOS = "herr_cierres_encabezados";
/** Claves del formulario de cierre que no son datos de la tabla. */
const RESERVADAS = new Set(["nombre", "fecha", "id", "tabla_id"]);
/** Casillas para elegir qué comparar; los más viejos se ven abriendo cada uno. */
const MAX_ELEGIBLES = 30;
const MAX_EN_COMPARACION = 8;
/** `medir` que cuenta registros en vez de sumar una columna. */
const CONTAR = "_registros";

const HOJA = "/internal/herr-tabla";
const href_cierres = (tabla_id: string) => href_tabla(tabla_id, { modo: "cierres" });
const href_cierre = (tabla_id: string, id: string) => href_tabla(tabla_id, { modo: "cierre", cierre: id });

function json_de(v: unknown): Record<string, unknown> {
  let o = v;
  if (typeof v === "string") {
    try {
      o = JSON.parse(v);
    } catch {
      o = null;
    }
  }
  return o && typeof o === "object" && !Array.isArray(o) ? (o as Record<string, unknown>) : {};
}

// #region Datos

/** Nombre y fecha (con sus valores por defecto) y los datos que pide la tabla, ya validados. */
function datos_de_cierre(spec: TablaSpec, body: Record<string, unknown>) {
  const pedida = texto(solo_dia(body.fecha));
  const fecha = /^\d{4}-\d{2}-\d{2}$/.test(pedida) ? pedida : fecha_hoy();
  const nombre = (texto(body.nombre) || `Cierre del ${dia_legible(fecha)}`).slice(0, 200);
  const entrada = Object.fromEntries(Object.entries(body).filter(([k]) => !RESERVADAS.has(k)));
  const campos = valores_capturados({ ...spec, campos: spec.campos_cierre ?? [] }, entrada);
  return { nombre, fecha, campos };
}

async function encabezado(data: Datos, spec: TablaSpec, id: string): Promise<DomainRow | null> {
  const fila = id ? await data.findOne(ENCABEZADOS, { id }) : null;
  return fila && fila.is_active !== false && fila.tabla_id === spec.id ? fila : null;
}

/** Las filas archivadas de un cierre y los títulos de sus enlaces tal como eran al cerrar. */
async function archivo_de(data: Datos, spec: TablaSpec, cab: DomainRow): Promise<{ filas: Registro[]; etiquetas: Etiquetas }> {
  const filas: DomainRow[] = [];
  for (;;) {
    const pagina_filas = await data.findMany("herr_cierres", {
      where: { tabla_id: spec.id, cierre_id: texto(cab.cierre_id), is_active: true },
      orderBy: { id: "asc" },
      limit: LIMITE_FILAS,
      offset: filas.length,
    });
    filas.push(...pagina_filas);
    if (pagina_filas.length < LIMITE_FILAS) break;
  }
  const etiquetas: Etiquetas = new Map();
  for (const f of filas) {
    for (const [clave, de] of Object.entries(json_de(json_de(f.custom_data).etiquetas))) {
      const mapa = etiquetas.get(clave) ?? new Map<string, string>();
      for (const [id, label] of Object.entries(objeto(de))) mapa.set(id, label);
      etiquetas.set(clave, mapa);
    }
  }
  const registros = filas.map((f) => ({
    id: String(f.id),
    valores: objeto(f.valores),
    miniaturas: objeto(f.miniaturas),
    unidades: objeto(json_de(f.custom_data).unidades),
    created_at: texto(f.created_at),
    updated_at: texto(f.updated_at),
  }));
  return { filas: ordenar(spec, registros), etiquetas };
}

/**
 * Un archivo se lee como se cerró: títulos de enlaces y unidades de entonces.
 * Las fotos de lo enlazado sí son las de hoy: congelarlas engordaría cada fila.
 */
function presentacion_archivo(etiquetas: Etiquetas, vivos: Enlaces): Presentacion {
  return {
    ...presentacion_de(vivos),
    etiquetas,
    unidad: (campo, fila) => fila.unidades?.[campo.clave] || campo.unidad || null,
  };
}

/** La unidad que tenía cada número de unidad variable al cerrar, para no depender de cómo siga el enlace. */
function unidades_de_fila(spec: TablaSpec, fila: Registro, enlaces: Enlaces): Record<string, string> {
  const out: Record<string, string> = {};
  for (const campo of spec.campos) {
    if (!campo.unidad_de && !campo.unidad_por_registro) continue;
    const unidad = unidad_en_fila(campo, fila, enlaces);
    if (unidad) out[campo.clave] = unidad;
  }
  return out;
}

/** Los títulos de los enlaces que usa una fila, para que el archivo no dependa de cómo sigan las otras tablas. */
function etiquetas_de_fila(etiquetas: Etiquetas, valores: Record<string, string>): Record<string, Record<string, string>> {
  const out: Record<string, Record<string, string>> = {};
  for (const [clave, de] of etiquetas) {
    const usadas = Object.fromEntries(
      ids_referencia(valores[clave] ?? "")
        .filter((id) => de.has(id))
        .map((id) => [id, de.get(id)!]),
    );
    if (Object.keys(usadas).length) out[clave] = usadas;
  }
  return out;
}

// #endregion

// #region Formularios

function entradas_de_cierre(spec: TablaSpec, valores: { nombre: string; fecha: string; campos: Record<string, string> }): NoxUiNode[] {
  return [
    nodo("nox.input-text", { name: "nombre", label: "Nombre del cierre", value: valores.nombre, required: true }),
    nodo("nox.input-date", { name: "fecha", label: "Fecha", value: valores.fecha, required: true }),
    ...(spec.campos_cierre ?? []).map((c) => nodo_entrada(c, valores.campos[c.clave] ?? c.valor_por_defecto ?? "")),
  ];
}

// #endregion

// #region Hojas

export async function pagina_cerrar(data: Datos, spec: TablaSpec): Promise<NoxPageDescriptor> {
  const hijos: NoxUiNode[] = [
    migas(["Mis tablas", HOJA], [spec.name, href_tabla(spec.id)], ["Cierres", href_cierres(spec.id)]),
  ];
  const volver = nodo("nox.toolbar", {}, [boton("Volver a la tabla", { href: href_tabla(spec.id), icon: "fa-arrow-left" })]);
  if (!spec.cerrable) {
    hijos.push(nodo("nox.alert", { text: "Esta tabla no se cierra", description: "Actívalo en Diseñar › Ajustes («Permitir cierres»)." }), volver);
    return pagina(ID_TABLA, `Hacer cierre · ${spec.name}`, hijos);
  }
  const registros = await registros_de({ data }, spec.id);
  if (!registros.length) {
    hijos.push(nodo("nox.empty", { text: "No hay registros que cerrar", description: "Captura alguno y vuelve." }), volver);
    return pagina(ID_TABLA, `Hacer cierre · ${spec.name}`, hijos);
  }
  const filas = filas_recalculadas(spec, registros);
  const n = filas.length;
  hijos.push(
    nodo("nox.markdown-view", {
      content:
        `Se archivan **${n} ${n === 1 ? "registro" : "registros"}** con este nombre y esta fecha, y la tabla queda vacía para empezar de nuevo. ` +
        "Después podrás abrir el cierre o compararlo con otros.",
    }),
  );
  if (spec.resumenes.length) {
    hijos.push(
      nodo("nox.stats", {
        text: "Así cierra",
        items: valores_resumen(spec, filas).map(({ resumen, texto: t }) => ({
          id: resumen.clave,
          label: resumen.etiqueta,
          value: con_unidad(t, resumen.unidad) || "—",
        })),
      }),
    );
  }
  const hoy = fecha_hoy();
  hijos.push(
    nodo(
      "nox.form",
      { method: "POST", action: `api://herr-tablas/${spec.id}/cerrar`, then: `${ID_TABLA}?id={id}&modo=cierre&cierre={cierre}` },
      [
        ...entradas_de_cierre(spec, { nombre: `Cierre del ${dia_legible(hoy)}`, fecha: hoy, campos: {} }),
        boton("Cerrar y archivar", { icon: "fa-box-archive" }),
      ],
    ),
  );
  if (!spec.campos_cierre?.length) {
    hijos.push(
      nodo("nox.markdown-view", {
        content: "¿Quieres anotar algo más en cada cierre, como el efectivo contado o quién cerró? Agrégalo en Diseñar › Cierre.",
      }),
    );
  }
  hijos.push(
    nodo("nox.toolbar", {}, [
      boton("Datos del cierre", { href: href_tabla(spec.id, { modo: "disenar", seccion: "cierre" }), icon: "fa-pen-ruler", variant: "secondary" }),
      boton("Volver a la tabla", { href: href_tabla(spec.id), icon: "fa-arrow-left" }),
    ]),
  );
  return pagina(ID_TABLA, `Hacer cierre · ${spec.name}`, hijos);
}

/** Para ordenar cierres: por la fecha elegida y, en la misma fecha, por cuándo se hicieron. */
const orden_de_cierre = (f: DomainRow) => `${texto(f.fecha)} ${texto(f.cerrado_at)}`;

export async function pagina_cierres(data: Datos, spec: TablaSpec, identity: KirletIdentity | null): Promise<NoxPageDescriptor> {
  const operar = puede(identity, "herr-tablas", "create");
  const lista = (await data.findMany(ENCABEZADOS, { where: { tabla_id: spec.id, is_active: true }, limit: LIMITE_FILAS })).sort(
    (a, b) => orden_de_cierre(b).localeCompare(orden_de_cierre(a)),
  );
  const sin_cerrar = await data.count("herr_registros", { tabla_id: spec.id, is_active: true });
  const hijos: NoxUiNode[] = [migas(["Mis tablas", HOJA], [spec.name, href_tabla(spec.id)])];
  hijos.push(
    nodo("nox.toolbar", {}, [
      ...(operar && spec.cerrable && sin_cerrar
        ? [boton("Hacer cierre", { href: href_tabla(spec.id, { modo: "cerrar" }), icon: "fa-box-archive", variant: "primary" })]
        : []),
      boton("Volver a la tabla", { href: href_tabla(spec.id), icon: "fa-arrow-left" }),
    ]),
  );
  if (!lista.length) {
    hijos.push(
      nodo("nox.empty", {
        text: "Aún no hay cierres",
        description: "Un cierre archiva los registros con un nombre y una fecha, y deja la tabla vacía para empezar de nuevo.",
      }),
    );
    return pagina(ID_TABLA, `Cierres · ${spec.name}`, hijos);
  }
  hijos.push(
    nodo("nox.table", {
      columns: [
        { key: "nombre", label: "Cierre" },
        { key: "fecha", label: "Fecha" },
        { key: "filas", label: "Registros" },
        ...spec.resumenes.map((r) => ({ key: `r_${r.clave}`, label: r.etiqueta })),
      ],
      rows: lista.map((cab) => {
        const resumenes = objeto(cab.resumenes);
        return {
          nombre: texto(cab.name),
          fecha: dia_legible(texto(cab.fecha)),
          filas: String(Number(cab.filas ?? 0)),
          ...Object.fromEntries(spec.resumenes.map((r) => [`r_${r.clave}`, con_unidad(resumenes[r.clave] ?? "", r.unidad) || "—"])),
          _href: href_cierre(spec.id, String(cab.id)),
        };
      }),
      text: "Sin cierres",
    }),
  );
  if (!operar) return pagina(ID_TABLA, `Cierres · ${spec.name}`, hijos);
  const elegibles = lista.slice(0, MAX_ELEGIBLES);
  const preseleccion = new Set(sin_cerrar ? elegibles.slice(0, 1).map((c) => String(c.id)) : elegibles.slice(0, 2).map((c) => String(c.id)));
  hijos.push(
    nodo("nox.markdown-view", {
      content: "### Comparar\nMarca dos o más cierres, o uno o varios y lo que llevas sin cerrar.",
    }),
    nodo(
      "nox.form",
      {
        method: "POST",
        action: `api://herr-tablas/${spec.id}/cierres/comparar`,
        then: `${ID_TABLA}?id={id}&modo=comparar&c={c}&actual={actual}`,
      },
      [
        ...(sin_cerrar
          ? [nodo("nox.input-checkbox", { name: "actual", label: `Lo actual (${sin_cerrar} sin cerrar)`, value: true })]
          : []),
        ...elegibles.map((cab) =>
          nodo("nox.input-checkbox", {
            name: `c_${cab.id}`,
            label: `${texto(cab.name)} · ${dia_legible(texto(cab.fecha))}`,
            value: preseleccion.has(String(cab.id)),
          }),
        ),
        boton("Comparar", { icon: "fa-code-compare" }),
      ],
    ),
  );
  if (lista.length > MAX_ELEGIBLES) {
    hijos.push(
      nodo("nox.alert", {
        text: `Para comparar se ofrecen los ${MAX_ELEGIBLES} más recientes`,
        description: "Para uno más viejo ábrelo y usa «Comparar con lo actual».",
      }),
    );
  }
  return pagina(ID_TABLA, `Cierres · ${spec.name}`, hijos);
}

export async function pagina_cierre(
  data: Datos,
  spec: TablaSpec,
  params: URLSearchParams,
  identity: KirletIdentity | null,
): Promise<NoxPageDescriptor> {
  const cab = await encabezado(data, spec, texto(params.get("cierre")));
  const hijos: NoxUiNode[] = [migas(["Mis tablas", HOJA], [spec.name, href_tabla(spec.id)], ["Cierres", href_cierres(spec.id)])];
  if (!cab) {
    hijos.push(
      nodo("nox.empty", { text: "Este cierre no existe" }, [
        boton("Ver los cierres", { href: href_cierres(spec.id), icon: "fa-box-archive" }),
      ]),
    );
    return pagina(ID_TABLA, `Cierre · ${spec.name}`, hijos);
  }
  const nombre = texto(cab.name);
  const campos = objeto(cab.campos);
  const resumenes = objeto(cab.resumenes);
  const { filas, etiquetas } = await archivo_de(data, spec, cab);
  const presentacion = presentacion_archivo(etiquetas, await enlaces_de(data, spec));
  hijos.push(
    nodo("nox.detail", {
      text: nombre,
      items: [
        { label: "Fecha", value: dia_legible(texto(cab.fecha)) },
        { label: "Se cerró", value: momento_legible(texto(cab.cerrado_at)) },
        { label: "Registros", value: String(filas.length) },
        ...(spec.campos_cierre ?? []).map((c) => ({ label: c.etiqueta, value: valor_presentado(c, campos[c.clave] ?? "", new Map()) || "—" })),
        ...spec.resumenes.map((r) => ({ label: r.etiqueta, value: con_unidad(resumenes[r.clave] ?? "", r.unidad) || "—", emphasis: true })),
      ],
    }),
    nodo("nox.toolbar", {}, [
      boton("Comparar con lo actual", {
        href: href_tabla(spec.id, { modo: "comparar", c: String(cab.id), actual: "1" }),
        icon: "fa-code-compare",
        variant: "primary",
      }),
      boton("Todos los cierres", { href: href_cierres(spec.id), icon: "fa-box-archive" }),
    ]),
    ...registros_paginados(
      params,
      filas.length,
      filtrar_filas(spec, filas, presentacion, texto(params.get("q"))),
      (visibles, vacio) => tabla_de_registros(columnas_de_lista(spec), visibles, presentacion, undefined, vacio),
      "Este cierre no tiene registros",
    ),
  );
  if (!puede(identity, "herr-tablas", "update")) return pagina(ID_TABLA, `${nombre} · ${spec.name}`, hijos);
  hijos.push(
    nodo("nox.card", { title: "Cambiar nombre, fecha o datos" }, [
      nodo(
        "nox.form",
        {
          method: "PATCH",
          action: `api://herr-tablas/${spec.id}/cierres/${cab.id}`,
          then: `${ID_TABLA}?id={id}&modo=cierre&cierre={cierre}&v={v}`,
        },
        [...entradas_de_cierre(spec, { nombre, fecha: texto(cab.fecha), campos }), boton("Guardar cambios", { icon: "fa-floppy-disk" })],
      ),
    ]),
  );
  return pagina(ID_TABLA, `${nombre} · ${spec.name}`, hijos);
}

function tabla_comparada(periodos: Periodo[], filas: FilaComparada[], titulo_dato: string, vacio: string): NoxUiNode {
  return nodo("nox.table", {
    columns: [
      { key: "dato", label: titulo_dato },
      ...periodos.map((p, i) => ({ key: `p${i}`, label: p.titulo })),
      { key: "diferencia", label: "Diferencia" },
    ],
    rows: filas.map((f) => ({
      dato: f.dato,
      ...Object.fromEntries(f.valores.map((v, i) => [`p${i}`, v])),
      diferencia: f.diferencia,
    })),
    text: vacio,
  });
}

export async function pagina_comparar(data: Datos, spec: TablaSpec, params: URLSearchParams): Promise<NoxPageDescriptor> {
  const hijos: NoxUiNode[] = [migas(["Mis tablas", HOJA], [spec.name, href_tabla(spec.id)], ["Cierres", href_cierres(spec.id)])];
  const ids = [...new Set(texto(params.get("c")).split(",").map(texto).filter(Boolean))].slice(0, MAX_EN_COMPARACION);
  const actual = params.get("actual") === "1";
  const cabs = (await Promise.all(ids.map((id) => encabezado(data, spec, id))))
    .filter((c): c is DomainRow => c !== null)
    .sort((a, b) => orden_de_cierre(a).localeCompare(orden_de_cierre(b)));
  if (cabs.length + (actual ? 1 : 0) < 2) {
    hijos.push(
      nodo("nox.alert", { text: "Elige al menos dos", description: "Dos cierres, o un cierre y lo que llevas sin cerrar." }),
      nodo("nox.toolbar", {}, [boton("Ver los cierres", { href: href_cierres(spec.id), icon: "fa-box-archive" })]),
    );
    return pagina(ID_TABLA, `Comparar · ${spec.name}`, hijos);
  }

  const agrupables = columnas_agrupables(spec);
  const medibles = columnas_medibles(spec);
  const agrupar = agrupables.find((c) => c.clave === params.get("agrupar")) ?? agrupacion_por_defecto(spec);
  const pedida = texto(params.get("medir"));
  const medir = pedida === CONTAR ? null : (medibles.find((c) => c.clave === pedida) ?? medibles[0] ?? null);

  const vivas = await etiquetas_referencia(data, spec);
  const periodos: Periodo[] = [];
  const fechas: string[] = [];
  for (const cab of cabs) {
    const archivo = await archivo_de(data, spec, cab);
    // Un enlace se llama como hoy si el registro sigue: con el título de cuando se cerró,
    // un producto que cambió de nombre saldría en dos grupos.
    const etiquetas: Etiquetas = new Map(
      [...new Set([...archivo.etiquetas.keys(), ...vivas.keys()])].map((clave) => [
        clave,
        new Map([...(archivo.etiquetas.get(clave) ?? []), ...(vivas.get(clave) ?? [])]),
      ]),
    );
    periodos.push({
      titulo: texto(cab.name),
      filas: archivo.filas,
      resumenes: objeto(cab.resumenes),
      datos: objeto(cab.campos),
      grupo_de: (f) => (agrupar ? valor_presentado(agrupar, f.valores[agrupar.clave] ?? "", etiquetas) : ""),
    });
    fechas.push(texto(cab.fecha));
  }
  if (actual) {
    const filas = filas_recalculadas(spec, await registros_de({ data }, spec.id));
    periodos.push({
      titulo: "Lo actual",
      filas,
      resumenes: Object.fromEntries(valores_resumen(spec, filas).map((r) => [r.resumen.clave, r.texto])),
      datos: {},
      grupo_de: (f) => (agrupar ? valor_presentado(agrupar, f.valores[agrupar.clave] ?? "", vivas) : ""),
    });
    fechas.push("");
  }
  // Dos cierres con el mismo nombre se distinguen por su fecha.
  const repetidos = periodos.map((p) => p.titulo).filter((t, i, todos) => todos.indexOf(t) !== i);
  periodos.forEach((p, i) => {
    if (repetidos.includes(p.titulo) && fechas[i]) p.titulo = `${p.titulo} · ${dia_legible(fechas[i]!)}`;
  });

  hijos.push(
    nodo("nox.markdown-view", { content: `### Totales\n«Diferencia» es ${periodos.at(-1)!.titulo} menos ${periodos[0]!.titulo}.` }),
    tabla_comparada(periodos, comparar_totales(spec, periodos), "Dato", "Sin datos"),
  );
  if (agrupar) {
    const que = medir ? `suma de «${medir.etiqueta}»` : "registros";
    hijos.push(
      nodo("nox.markdown-view", { content: `### Por ${agrupar.etiqueta}\nEn cada uno, ${que}.` }),
      tabla_comparada(periodos, comparar_grupos(spec, periodos, medir), agrupar.etiqueta, "Sin registros"),
    );
  }
  if (agrupables.length) {
    hijos.push(
      nodo("nox.card", { title: "Desglosar de otra forma" }, [
        nodo(
          "nox.form",
          {
            method: "POST",
            action: `api://herr-tablas/${spec.id}/cierres/comparar`,
            then: `${ID_TABLA}?id={id}&modo=comparar&c={c}&actual={actual}&agrupar={agrupar}&medir={medir}`,
          },
          [
            ...cabs.map((cab) => nodo("nox.input-hidden", { name: `c_${cab.id}`, value: "true" })),
            nodo("nox.input-hidden", { name: "actual", value: actual ? "true" : "" }),
            nodo("nox.input-menu", {
              name: "agrupar",
              label: "Por",
              options: agrupables.map((c) => ({ value: c.clave, label: c.etiqueta })),
              value: agrupar?.clave ?? "",
            }),
            nodo("nox.input-menu", {
              name: "medir",
              label: "Contar",
              options: [
                ...medibles.map((c) => ({ value: c.clave, label: `La suma de ${c.etiqueta}` })),
                { value: CONTAR, label: "Cuántos registros" },
              ],
              value: medir?.clave ?? CONTAR,
            }),
            boton("Desglosar", { icon: "fa-layer-group" }),
          ],
        ),
      ]),
    );
  }
  hijos.push(
    nodo("nox.toolbar", {}, [
      boton("Todos los cierres", { href: href_cierres(spec.id), icon: "fa-box-archive" }),
      boton("Volver a la tabla", { href: href_tabla(spec.id), icon: "fa-arrow-left" }),
    ]),
  );
  return pagina(ID_TABLA, `Comparar · ${spec.name}`, hijos);
}

// #endregion

export const herr_tablas_cierres = define_routes({
  /**
   * Archiva las filas en `herr_cierres` (con resúmenes, fijos, miniaturas y el
   * título de cada enlace del momento) bajo un encabezado con nombre, fecha y
   * los datos que pida la tabla, y la deja vacía. Sin cuerpo cierra con el
   * nombre y la fecha de hoy.
   */
  "POST /herr-tablas/:id/cerrar": async (ctx) => {
    const spec = spec_de_fila(await tabla_activa(ctx, ctx.params.id));
    if (!spec.cerrable) falla(409, "Esta tabla no se cierra: es un catálogo", "conflict");
    const body = await ctx.body<Record<string, unknown>>().catch(() => ({}));
    const datos = datos_de_cierre(spec, body ?? {});
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
    const id = new_id("cierre");
    // Con solo el milisegundo, dos cierres a la vez compartirían id y mezclarían sus filas.
    const cierre_id = `cierre-${Date.parse(cerrado_at)}-${id.slice(-8)}`;
    const plan = planear_cierre(spec, filas, cerrado_at, calculados_por_fila, cierre_id)!;
    const enlaces = await enlaces_de(ctx.data, spec);
    const etiquetas = etiquetas_de(enlaces);
    const por_id = new Map(registros.map((r) => [String(r.id), r]));
    await ctx.data.batch([
      {
        op: "insert",
        table: ENCABEZADOS,
        row: {
          id,
          name: datos.nombre,
          description: "",
          is_active: true,
          created_by: ctx.actor,
          search_field: campo_busqueda(datos.nombre, datos.fecha, ...Object.values(datos.campos)),
          tabla_id: spec.id,
          cierre_id: plan.cierre_id,
          fecha: datos.fecha,
          cerrado_at,
          campos: datos.campos,
          resumenes: resumen,
          filas: plan.filas_archivadas.length,
          created_at: cerrado_at,
          updated_at: cerrado_at,
        },
      },
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
            miniaturas: objeto(r.miniaturas),
            custom_data: {
              registro_id: f.id,
              etiquetas: etiquetas_de_fila(etiquetas, objeto(r.valores)),
              unidades: unidades_de_fila(spec, registro_como_fila(r), enlaces),
            },
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
    return { data: { id: spec.id, cierre: id, cierre_id: plan.cierre_id, filas: plan.filas_archivadas.length } };
  },

  "PATCH /herr-tablas/:id/cierres/:cierre": async (ctx) => {
    const spec = spec_de_fila(await tabla_activa(ctx, ctx.params.id));
    const cab = await encabezado(ctx.data, spec, texto(ctx.params.cierre));
    if (!cab) falla(404, "El cierre no existe", "not_found");
    const datos = datos_de_cierre(spec, await ctx.body<Record<string, unknown>>());
    await ctx.data.update(
      ENCABEZADOS,
      { id: String(cab.id) },
      {
        name: datos.nombre,
        fecha: datos.fecha,
        campos: datos.campos,
        search_field: campo_busqueda(datos.nombre, datos.fecha, ...Object.values(datos.campos)),
        updated_at: now_iso(),
      },
    );
    return { data: { id: spec.id, cierre: String(cab.id), v: Date.now() } };
  },

  /** Qué comparar: una casilla `c_<id>` por cierre y `actual`; responde los parámetros de la hoja. */
  "POST /herr-tablas/:id/cierres/comparar": async (ctx) => {
    const spec = spec_de_fila(await tabla_activa(ctx, ctx.params.id));
    const body = await ctx.body<Record<string, unknown>>();
    const ids = Object.entries(body)
      .filter(([k, v]) => k.startsWith("c_") && booleano(v))
      .map(([k]) => k.slice(2));
    const actual = booleano(body.actual);
    if (ids.length + (actual ? 1 : 0) < 2) {
      falla(400, "Elige al menos dos: dos cierres, o un cierre y lo actual", "validation_error");
    }
    if (ids.length > MAX_EN_COMPARACION) falla(400, `Se comparan hasta ${MAX_EN_COMPARACION} cierres a la vez`, "validation_error");
    return {
      data: {
        id: spec.id,
        c: ids.join(","),
        actual: actual ? "1" : "",
        agrupar: texto(body.agrupar),
        medir: texto(body.medir),
      },
    };
  },

  /** Diseñador: un dato más en el formulario del cierre. */
  "POST /herr-tablas/:id/campos-cierre": async (ctx) => {
    const fila = await tabla_activa(ctx, ctx.params.id);
    const spec = spec_de_fila(fila);
    const body = await ctx.body<Record<string, unknown>>();
    const etiqueta = limpiar_etiqueta(texto(body.etiqueta));
    if (!etiqueta) falla(400, "Escribe el nombre del dato", "validation_error");
    const tipo = (texto(body.tipo) || "texto") as CampoSpec["tipo"];
    if (!(TIPOS_CAMPO_CIERRE as readonly string[]).includes(tipo)) falla(400, `Un cierre no pide datos de tipo «${tipo}»`, "validation_error");
    const opciones = tipo === "opcion" ? opciones_desde_texto(body.opciones) : [];
    if (tipo === "opcion" && !opciones.length) falla(400, "Escribe las opciones de la lista", "validation_error");
    const actuales = spec.campos_cierre ?? [];
    const usadas = new Set([...actuales.map((c) => c.clave), ...RESERVADAS]);
    const campo: CampoSpec = {
      clave: clave_libre(etiqueta, usadas),
      etiqueta,
      tipo,
      requerido: booleano(body.requerido),
      ...(opciones.length ? { opciones } : {}),
    };
    await ctx.data.update(
      "herr_tablas",
      { id: spec.id },
      { campos_cierre: [...actuales, campo], updated_at: now_iso() },
    );
    return { data: { id: spec.id, v: Date.now() } };
  },

  "DELETE /herr-tablas/:id/campos-cierre/:clave": async (ctx) => {
    const spec = spec_de_fila(await tabla_activa(ctx, ctx.params.id));
    const actuales = spec.campos_cierre ?? [];
    if (!actuales.some((c) => c.clave === ctx.params.clave)) falla(404, "Ese dato del cierre no existe", "not_found");
    await ctx.data.update(
      "herr_tablas",
      { id: spec.id },
      { campos_cierre: actuales.filter((c) => c.clave !== ctx.params.clave), updated_at: now_iso() },
    );
    return { data: { id: spec.id, v: Date.now() } };
  },
});
