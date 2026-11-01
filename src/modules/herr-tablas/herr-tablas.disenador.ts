import { es_calculado } from "../../lib/formulas/automatico.ts";
import type { DomainRow, KirletCtx, KirletIdentity, NoxPageDescriptor, NoxUiNode } from "@opus-perpetuus/imperium-core-kit";
import { filas_de, puede, texto } from "../../lib/comun.ts";
import { valores_resumen } from "../../lib/formulas/calculadora.ts";
import {
  CON_PLANTILLA,
  FOTO_AUTOMATICA,
  OPERACIONES,
  ORDEN_TIPOS,
  PARTES_UI,
  SIN_COLUMNA,
  TIPOS_UI,
  TIPO_AUTOMATICO,
  TOTALES,
  TOTAL_REGISTROS,
  TIPOS_NUMERICOS,
  formula_con_etiquetas,
  opciones_numericas,
} from "../../lib/formulas/disenio.ts";
import {
  PARTES_REF,
  SIN_FOTO,
  TIPOS_CAMPO_CIERRE,
  TIPOS_FOTO,
  TIPOS_FUENTE_UNIDAD,
  TIPOS_UNIDAD_DE_COLUMNA,
  TIPOS_UNIDAD_POR_REGISTRO,
  spec_de_fila,
  type CampoSpec,
  type ResumenTabla,
  type TablaSpec,
} from "../../lib/formulas/esquema.ts";
import { ESCANER_VACIO, FORMATOS_ESCANER, MOSTRAR_ESCANER, TIPOS_DESTINO_ESCANER } from "../../lib/formulas/escaner.ts";
import { ACCIONES_ESCANEO, TIPOS_COLUMNA_ESCANEO, columna_de_escaneo } from "../../lib/formulas/escaneo.ts";
import {
  ACCIONES_REGLA,
  DESTINOS_REGLA,
  MAX_REGLAS,
  MODOS_SUBTABLA,
  TIPOS_CANTIDAD,
  TIPOS_CODIGO_REGLA,
  tabla_destino_de,
  type DestinoRegla,
  type ReglaEscaneo,
} from "../../lib/formulas/reglas.ts";
import { MODOS_REF_SUBTABLA, TIPOS_SUBCOLUMNA, columnas_de, spec_de_subtabla } from "../../lib/formulas/subtabla.ts";
import { parsear_agregado } from "../../lib/formulas/motor.ts";
import { COMPARADORES, HUECO, MAX_CONDICIONES, QUE_HACER, UNIONES, opciones_columnas, opciones_enlace, opciones_origen, subtablas_de } from "../../lib/formulas/constructor.ts";
import { columna_unica, plantilla_con_etiquetas } from "../../lib/formulas/plantilla.ts";
import { plantillas } from "../../lib/formulas/plantillas.ts";
import { filas_recalculadas, opciones_referencia, registros_de } from "./herr-tablas.flow.ts";
import { boton, con_unidad, enlace, nodo, pagina } from "./herr-tablas.nox.ts";

/**
 * Diseñador de tablas: inicio (mis tablas + crear), diseño por secciones y
 * editor de una columna. Todo son modos de la página `herr-tabla`
 * (`?id=…&modo=disenar|campo`): el lanzador solo conoce las hojas que declara
 * el monorepo, así que una pantalla nueva aquí no tendría a dónde navegar.
 *
 * Un `nox.form` no esconde campos según lo que se elige en otro, así que lo
 * que depende del tipo se pinta después de guardar el tipo (el servidor
 * decide si hace falta ese segundo paso).
 */

type Datos = KirletCtx["data"];

export const ID_TABLA = "herramientas.herr-tabla";
const HOJA = "/internal/herr-tabla";

export function href_tabla(id: string, extra: Record<string, string> = {}): string {
  return `${HOJA}?${new URLSearchParams({ id, ...extra })}`;
}

const href_captura = (id: string) => `/internal/herr-registro?tabla=${id}`;

export function href_registro(tabla_id: string, id: string, extra: Record<string, string> = {}): string {
  return `/internal/herr-registro?${new URLSearchParams({ tabla: tabla_id, id, ...extra })}`;
}

/** A dónde sigue un formulario del diseñador según lo que responde la ruta. */
const THEN_DISENO = `${ID_TABLA}?id={id}&modo={modo}&campo={campo}&v={v}`;

function titulo(t: string): NoxUiNode {
  return nodo("nox.markdown-view", { content: `### ${t}` });
}

export function migas(...partes: Array<[string, string]>): NoxUiNode {
  return nodo(
    "nox.toolbar",
    { block: "migas" },
    partes.map(([t, href]) => enlace(t, href)),
  );
}

function menu(name: string, label: string, options: Array<{ value: string; label: string }>, extra: Record<string, unknown> = {}): NoxUiNode {
  return nodo("nox.input-menu", { name, label, options, ...extra });
}

function opciones_tipo(con_automatico: boolean, en_subtabla = false): Array<{ value: string; label: string }> {
  return [
    ...(con_automatico ? [{ value: TIPO_AUTOMATICO, label: "Que se adivine por el nombre" }] : []),
    ...ORDEN_TIPOS.filter((t) => !en_subtabla || TIPOS_SUBCOLUMNA.has(t)).map((t) => ({
      value: t,
      label: `${TIPOS_UI[t].nombre} — ${TIPOS_UI[t].ayuda}`,
    })),
  ];
}

function lista_corta(nombres: string[], max = 6): string {
  return nombres.length > max ? `${nombres.slice(0, max).join(", ")} y ${nombres.length - max} más` : nombres.join(", ");
}

// #region Inicio: mis tablas y crear una

async function tarjeta_tabla(data: Datos, fila: DomainRow): Promise<NoxUiNode> {
  const spec = spec_de_fila(fila);
  const registros = await data.count("herr_registros", { tabla_id: spec.id, is_active: true });
  const resumen = `${spec.campos.length} ${spec.campos.length === 1 ? "columna" : "columnas"} · ${registros} ${registros === 1 ? "registro" : "registros"}`;
  return nodo("nox.card", { title: spec.name }, [
    nodo("nox.markdown-view", { content: spec.description ? `${resumen}\n\n${spec.description}` : resumen }),
    nodo("nox.toolbar", {}, [
      boton("Abrir", { href: href_tabla(spec.id), icon: "fa-table" }),
      boton("Capturar", { href: href_captura(spec.id), icon: "fa-plus" }),
      boton("Diseñar", { href: href_tabla(spec.id, { modo: "disenar" }), icon: "fa-pen-ruler", variant: "ghost" }),
    ]),
  ]);
}

export async function pagina_inicio(data: Datos, aviso: string, identity: KirletIdentity | null): Promise<NoxPageDescriptor> {
  const tablas = await filas_de({ data }, "herr_tablas", { is_active: true });
  const hijos: NoxUiNode[] = [];
  if (aviso) hijos.push(nodo("nox.alert", { text: aviso }));
  hijos.push(
    nodo("nox.markdown-view", {
      content:
        "Anota lo que quieras en tablas a tu medida: gastos, clientes, inventario, préstamos… " +
        "Crea una escribiendo sus columnas o parte de una plantilla; todo se puede cambiar después.",
    }),
  );
  if (tablas.length) {
    hijos.push(titulo("Tus tablas"));
    hijos.push(nodo("nox.stack", { layout: "grid" }, await Promise.all(tablas.map((t) => tarjeta_tabla(data, t)))));
  }
  if (!puede(identity, "herr-tablas", "create")) return pagina(ID_TABLA, "Mis tablas", hijos);
  hijos.push(titulo("Crear una tabla"));
  hijos.push(
    nodo("nox.card", { title: "Empezar en blanco" }, [
      nodo(
        "nox.form",
        { method: "POST", action: "api://herr-tablas/nueva", then: `${ID_TABLA}?id={id}&modo=disenar&nuevo=1` },
        [
          nodo("nox.input-text", {
            name: "name",
            label: "Nombre de la tabla",
            placeholder: "Ej.: Ventas de la tienda",
            required: true,
          }),
          nodo("nox.input-textarea", {
            name: "columnas",
            label: "¿Qué quieres anotar de cada registro?",
            placeholder: "Fecha\nCliente\nMonto\n¿Pagado?\nCategoría: Comida, Transporte, Otro",
            help: "Una columna por renglón, por ejemplo: Fecha · Cliente · Monto · ¿Pagado? · Categoría: Comida, Transporte. El tipo se adivina por el nombre y «Nombre: a, b» crea una lista de opciones. Puedes dejarlo vacío y agregarlas después.",
          }),
          boton("Crear tabla", { icon: "fa-plus" }),
        ],
      ),
    ]),
  );
  hijos.push(titulo("O parte de una plantilla"));
  hijos.push(
    nodo(
      "nox.stack",
      { layout: "grid" },
      plantillas().map((p) =>
        nodo("nox.card", { title: p.name }, [
          nodo("nox.markdown-view", {
            content: `${p.description}\n\n**Columnas:** ${lista_corta(p.campos.map((c) => c.etiqueta), 4)}`,
          }),
          // Secundario: en la página ya manda «Crear tabla», y ocho botones de color competían con él.
          boton("Usar plantilla", {
            variant: "secondary",
            method: "POST",
            action: "api://herr-tablas/desde-plantilla",
            body: { plantilla_id: p.plantilla_id },
            then: `${ID_TABLA}?id={id}&modo=disenar&nuevo=1`,
            icon: "fa-wand-magic-sparkles",
          }),
        ]),
      ),
    ),
  );
  return pagina(ID_TABLA, "Mis tablas", hijos);
}

// #endregion

// #region Diseño de una tabla

const SECCIONES = [
  { id: "columnas", nombre: "Columnas" },
  { id: "totales", nombre: "Totales" },
  { id: "fijos", nombre: "Valores fijos" },
  { id: "cierre", nombre: "Cierre" },
  { id: "reglas", nombre: "Reglas al escanear" },
  { id: "ajustes", nombre: "Ajustes" },
] as const;

type Seccion = (typeof SECCIONES)[number]["id"];

function describir_tipo(campo: CampoSpec, spec: TablaSpec): string {
  const nombre = TIPOS_UI[campo.tipo]?.nombre ?? campo.tipo;
  const extra = campo.multiple && ["opcion", "referencia"].includes(campo.tipo) ? " (varias)" : "";
  const ref = campo.unidad_de ? spec.campos.find((c) => c.clave === campo.unidad_de!.split(":")[0]) : undefined;
  const unidad = ref
    ? `· unidad de ${ref.etiqueta}`
    : campo.unidad_por_registro
      ? "· unidad de cada registro"
      : campo.unidad
        ? `· ${campo.unidad}`
        : null;
  return con_unidad(`${nombre}${extra}`, unidad);
}

function detalle_columna(spec: TablaSpec, campo: CampoSpec, tablas: Map<string, TablaSpec>): Array<{ label: string; value: string }> {
  const items = [{ label: "Tipo", value: describir_tipo(campo, spec) }];
  if (es_calculado(campo)) {
    items.push({ label: "Cálculo", value: campo.formula === "0" ? "Sin configurar: toca Editar" : formula_con_etiquetas(spec, campo.formula ?? "", [...tablas.values()]) });
  }
  if (campo.tipo === "opcion") {
    items.push({ label: "Opciones", value: campo.opciones?.length ? campo.opciones.join(" · ") : "Sin opciones: toca Editar" });
  }
  if (campo.tipo === "referencia") {
    const destino = campo.tabla_ref_id ? tablas.get(campo.tabla_ref_id) : undefined;
    const sola = destino?.campos.find((c) => c.clave === columna_unica(campo.ref_leyenda))?.etiqueta;
    const mostrar = destino && campo.ref_leyenda ? (sola ?? plantilla_con_etiquetas(destino, campo.ref_leyenda)) : "";
    items.push({
      label: "Enlaza con",
      value: destino ? (mostrar ? `${destino.name} › ${mostrar}` : destino.name) : "Sin tabla: toca Editar",
    });
  }
  if (campo.tipo === "subtabla") {
    const cols = columnas_de(campo);
    items.push({ label: "Columnas", value: cols.length ? lista_corta(cols.map((c) => c.etiqueta)) : "Sin columnas: toca Editar" });
  }
  if (campo.tipo === "referencia" && campo.ref_subtabla) {
    const destino = campo.tabla_ref_id ? tablas.get(campo.tabla_ref_id) : undefined;
    const sub = destino?.campos.find((c) => c.clave === campo.ref_subtabla);
    items.push({ label: "Elige", value: `${MODOS_REF_SUBTABLA[campo.ref_subtabla_modo ?? "whole"]}: «${sub?.etiqueta ?? campo.ref_subtabla}»` });
  }
  const marcas = [campo.requerido ? "Obligatoria" : "", campo.en_resumen ? "Se ve en la lista" : ""].filter(Boolean);
  if (marcas.length) items.push({ label: "Captura", value: marcas.join(" · ") });
  return items;
}

function seccion_columnas(spec: TablaSpec, tablas: Map<string, TablaSpec>): NoxUiNode[] {
  const base = `api://herr-tablas/${spec.id}/campos`;
  const out: NoxUiNode[] = [];
  if (!spec.campos.length) {
    out.push(
      nodo("nox.empty", {
        text: "Aún no hay columnas",
        description: "Agrega la primera abajo: escribe su nombre (Fecha, Cliente, Monto…) y elige qué guarda.",
      }),
    );
  }
  const celdas: NoxUiNode[] = [];
  for (const campo of spec.campos) {
    celdas.push(
      nodo("nox.detail", { text: campo.etiqueta, items: detalle_columna(spec, campo, tablas) }, [
        nodo("nox.toolbar", {}, [
          boton("Editar", { href: href_tabla(spec.id, { modo: "campo", campo: campo.clave }), icon: "fa-pen" }),
          boton("Quitar", {
            method: "DELETE",
            action: `${base}/${campo.clave}`,
            confirm: `¿Quitar la columna «${campo.etiqueta}»? Lo ya capturado en ella deja de verse.`,
            icon: "fa-trash",
            variant: "ghost",
          }),
        ]),
      ]),
    );
  }
  if (celdas.length) out.push(nodo("nox.stack", { layout: "grid" }, celdas));
  out.push(
    nodo("nox.card", { title: "Agregar columna" }, [
      nodo("nox.form", { method: "POST", action: base, then: THEN_DISENO }, [
        nodo("nox.input-text", {
          name: "etiqueta",
          label: "Nombre de la columna",
          placeholder: "Ej.: Precio, Fecha de entrega, ¿Pagado?",
          required: true,
          help: "Varias a la vez: sepáralas con comas.",
        }),
        menu("tipo", "¿Qué guarda?", opciones_tipo(true), { value: TIPO_AUTOMATICO }),
        boton("Agregar", { icon: "fa-plus" }),
      ]),
    ]),
  );
  return out;
}

const QUE_CALCULA: Record<keyof typeof TOTALES, string> = {
  suma: "Suma de",
  promedio: "Promedio de",
  cuenta: "Registros con",
  minimo: "El más bajo de",
  maximo: "El más alto de",
};

/** «Suma de «Monto»» si es un total guiado; la fórmula con nombres si no. */
function describir_total(spec: TablaSpec, r: ResumenTabla, otras: TablaSpec[] = []): string {
  const solo = /^\{([^{}]+)\}$/.exec(r.formula.trim());
  const agregado = solo ? parsear_agregado(solo[1]!) : null;
  const campo = agregado ? spec.campos.find((c) => c.clave === agregado.campo) : undefined;
  if (agregado && campo) return `${QUE_CALCULA[agregado.tipo]} «${campo.etiqueta}»`;
  return r.formula.trim() === TOTAL_REGISTROS.formula ? TOTAL_REGISTROS.nombre : formula_con_etiquetas(spec, r.formula, otras);
}

async function seccion_totales(data: Datos, spec: TablaSpec): Promise<NoxUiNode[]> {
  const base = `api://herr-tablas/${spec.id}/resumenes`;
  const otras = [...(await tablas_por_id(data)).values()];
  const out: NoxUiNode[] = [
    nodo("nox.markdown-view", { content: "Cifras de toda la tabla que se ven encima de la lista: cuánto llevas gastado, el promedio, el más alto…" }),
  ];
  if (spec.resumenes.length) {
    const filas = await filas_recalculadas({ data }, spec, await registros_de({ data }, spec.id));
    out.push(
      nodo("nox.stats", {
        text: "Así se ven hoy",
        items: valores_resumen(spec, filas).map(({ resumen, texto: t }) => ({
          id: resumen.clave,
          label: resumen.etiqueta,
          value: con_unidad(t, resumen.unidad) || "—",
        })),
      }),
    );
  }
  const celdas: NoxUiNode[] = spec.resumenes.map((r) =>
    nodo("nox.detail", { text: r.etiqueta, items: [{ label: "Qué calcula", value: describir_total(spec, r, otras) }] }, [
      boton("Quitar", {
        method: "DELETE",
        action: `${base}/${r.clave}`,
        confirm: `¿Quitar el total «${r.etiqueta}»?`,
        icon: "fa-trash",
        variant: "ghost",
      }),
    ]),
  );
  if (celdas.length) out.push(nodo("nox.stack", { layout: "grid" }, celdas));
  const numericas = opciones_numericas({ ...spec, constantes: [] });
  const que = numericas.length
    ? [...Object.entries(TOTALES).map(([value, label]) => ({ value, label })), { value: TOTAL_REGISTROS.valor, label: TOTAL_REGISTROS.nombre }]
    : [{ value: TOTAL_REGISTROS.valor, label: TOTAL_REGISTROS.nombre }];
  out.push(
    nodo("nox.card", { title: "Agregar total" }, [
      nodo("nox.form", { method: "POST", action: base }, [
        menu("tipo", "Qué calcular", que, { value: que[0]!.value }),
        menu("campo", "De la columna", numericas, {
          value: numericas[0]?.value ?? "",
          help: numericas.length ? "" : "Para sumar o promediar agrega antes una columna de número, dinero o sí/no.",
        }),
        nodo("nox.input-text", { name: "etiqueta", label: "Nombre (opcional)", placeholder: "Se propone solo: «Total de Monto»" }),
        boton("Agregar total", { icon: "fa-plus" }),
      ]),
    ]),
    nodo("nox.card", { title: "Total con fórmula" }, [
      nodo("nox.form", { method: "POST", action: base }, [
        nodo("nox.input-text", { name: "etiqueta", label: "Nombre", placeholder: "Ej.: Lo que falta", required: true }),
        nodo("nox.input-text", {
          name: "formula",
          label: "Fórmula",
          placeholder: "{Deuda a saldar} - {suma:Abono}",
          required: true,
          help: ayuda_formula(spec, "Para una columna entera usa {suma:Nombre}, {promedio:Nombre}, {minimo:Nombre}, {maximo:Nombre} o {cuenta:Nombre}.", undefined, otras),
        }),
        boton("Agregar total", { icon: "fa-plus" }),
      ]),
    ]),
  );
  return out;
}

function ayuda_formula(spec: TablaSpec, extra = "", excepto?: string, otras: TablaSpec[] = []): string {
  const nombres = [...spec.campos.filter((c) => c.clave !== excepto), ...spec.constantes].map((c) => `{${c.etiqueta}}`);
  const tablas = otras.filter((t) => t.id !== spec.id).map((t) => `"${t.name}"`);
  return [
    "Escribe los nombres entre llaves y opera con + − × ÷.",
    nombres.length ? `Puedes usar: ${lista_corta(nombres, 12)}.` : "",
    extra,
    "Condiciones (anídalas con y / o y paréntesis): si({Estado} = \"Pagado\" y ({Moto} = \"Italika\" o {Monto} > 100), {Monto}, 0).",
    "Solo las filas que cumplen: sumasi({Monto}, {Estado} = \"Pagado\"); también cuentasi, promediosi, minimosi, maximosi, buscarsi y unirsi.",
    "De otra tabla: tabla_suma(\"Ventas\", {Cantidad}, {Producto} = {actual:Nombre}) — dentro, {Columna} es de esa tabla y {actual:Columna} de este registro; también tabla_cuenta, tabla_promedio, tabla_minimo, tabla_maximo, tabla_buscar y tabla_unir.",
    "De un enlace: {Cliente.Teléfono}.",
    ...subtablas_de(spec).map(ayuda_subtabla),
    tablas.length ? `Otras tablas: ${lista_corta(tablas, 8)}.` : "",
  ]
    .filter(Boolean)
    .join(" ");
}

/**
 * Lo que se puede escribir de UNA subtabla, con sus columnas de verdad:
 * `{Productos}`, `{Productos.Cantidad}`, `{Productos.ultima.Cantidad}` y `sub_*`.
 */
export function ayuda_subtabla(sub: CampoSpec): string {
  const cols = columnas_de(sub);
  const n = sub.etiqueta;
  const numerica = cols.find((c) => TIPOS_NUMERICOS.has(c.tipo)) ?? cols[0];
  const otra = cols.find((c) => c !== numerica) ?? numerica;
  const ej = numerica ? numerica.etiqueta : "Columna";
  const cond = otra ? `{${otra.etiqueta}} = "X"` : `{Columna} = "X"`;
  return [
    `De la subtabla ${n}: {${n}} es cuántas filas tiene;`,
    cols.length ? `sus columnas ${lista_corta(cols.map((c) => `{${n}.${c.etiqueta}}`), 12)} (los números se suman, los textos se juntan);` : "",
    `una fila: {${n}.ultima.${ej}}, {${n}.primera.${ej}} o {${n}.1.${ej}};`,
    `con condiciones: sub_suma("${n}", {${ej}}, ${cond} y ({${ej}} > 10 o vacio({${ej}})))` +
      ` — dentro, {Columna} es de cada fila y {actual:Columna} de este registro; también sub_cuenta("${n}", ${cond}), sub_unir("${n}", {${otra?.etiqueta ?? "Columna"}}, ${cond}, " / "), sub_promedio, sub_minimo, sub_maximo y sub_buscar.`,
  ]
    .filter(Boolean)
    .join(" ");
}

/** Las referencias de cada subtabla, a la vista (no solo en la ayuda): se copian tal cual a la fórmula. */
function referencias_subtablas(spec: TablaSpec, excepto?: string): NoxUiNode[] {
  const subs = subtablas_de(spec).filter((s) => s.clave !== excepto);
  if (!subs.length) return [];
  const bloque = (sub: CampoSpec) => {
    const n = sub.etiqueta;
    const cols = columnas_de(sub);
    const ej = (cols.find((c) => TIPOS_NUMERICOS.has(c.tipo)) ?? cols[0])!.etiqueta;
    return [
      `**${n}**`,
      `- \`{${n}}\` — cuántas filas tiene`,
      ...cols.map((c) => `- \`{${n}.${c.etiqueta}}\` — ${TIPOS_NUMERICOS.has(c.tipo) ? "suma de" : "junta"} la columna ${c.etiqueta}`),
      `- \`{${n}.ultima.${ej}}\`, \`{${n}.primera.${ej}}\`, \`{${n}.2.${ej}}\` — una fila`,
      `- \`sub_suma("${n}", {${ej}}, condición)\`, \`sub_cuenta("${n}", condición)\`, \`sub_unir("${n}", {Columna}, condición, ", ")\` — solo las filas que cumplen; dentro, \`{Columna}\` es de cada fila`,
    ].join("\n");
  };
  return [
    titulo("Columnas de las subtablas"),
    nodo("nox.markdown-view", {
      content:
        subs.map(bloque).join("\n\n") +
        "\n\nLas condiciones se anidan con `y`, `o` y paréntesis: `{Tipo} = \"X\" y ({Precio} > 10 o {Urgente})`.",
    }),
  ];
}

function seccion_fijos(spec: TablaSpec): NoxUiNode[] {
  const base = `api://herr-tablas/${spec.id}/constantes`;
  const out: NoxUiNode[] = [
    nodo("nox.markdown-view", {
      content:
        "Un valor fijo se escribe una sola vez y vale para todos los registros: una meta, una deuda, el precio del litro. " +
        "Úsalo en los cálculos por su nombre, por ejemplo `{Meta} - {suma:Monto}`.",
    }),
  ];
  const celdas: NoxUiNode[] = spec.constantes.map((c) =>
    nodo("nox.card", { title: c.etiqueta }, [
      nodo("nox.form", { method: "PATCH", action: `${base}/${c.clave}` }, [
        nodo("nox.input-text", { name: "valor", label: con_unidad("Valor", c.unidad ? `(${c.unidad})` : null), value: c.valor ?? "" }),
        boton("Guardar", { icon: "fa-floppy-disk" }),
      ]),
      boton("Quitar", {
        method: "DELETE",
        action: `${base}/${c.clave}`,
        confirm: `¿Quitar el valor fijo «${c.etiqueta}»?`,
        icon: "fa-trash",
        variant: "ghost",
      }),
    ]),
  );
  if (celdas.length) out.push(nodo("nox.stack", { layout: "grid" }, celdas));
  out.push(
    nodo("nox.card", { title: "Agregar valor fijo" }, [
      nodo("nox.form", { method: "POST", action: base }, [
        nodo("nox.input-text", { name: "etiqueta", label: "Nombre", placeholder: "Ej.: Meta del mes", required: true }),
        nodo("nox.input-text", { name: "valor", label: "Valor", placeholder: "Ej.: 5000" }),
        nodo("nox.input-text", { name: "unidad", label: "Unidad (opcional)", placeholder: "$, km, L, %…" }),
        boton("Agregar", { icon: "fa-plus" }),
      ]),
    ]),
  );
  return out;
}

function seccion_cierre(spec: TablaSpec): NoxUiNode[] {
  const base = `api://herr-tablas/${spec.id}/campos-cierre`;
  const out: NoxUiNode[] = [
    nodo("nox.markdown-view", {
      content:
        "Al hacer un cierre se pide su **nombre** y su **fecha**. Agrega aquí lo demás que quieras anotar en cada cierre: " +
        "el efectivo contado, quién cerró, una observación… Sirve después para compararlos.",
    }),
  ];
  if (!spec.cerrable) {
    out.push(nodo("nox.alert", { text: "Esta tabla no se cierra", description: "Actívalo en Ajustes («Permitir cierres»)." }));
  }
  const datos = spec.campos_cierre ?? [];
  if (datos.length) {
    out.push(
      nodo(
        "nox.stack",
        { layout: "grid" },
        datos.map((c) =>
          nodo(
            "nox.detail",
            {
              text: c.etiqueta,
              items: [
                { label: "Tipo", value: TIPOS_UI[c.tipo]?.nombre ?? c.tipo },
                ...(c.tipo === "opcion" ? [{ label: "Opciones", value: (c.opciones ?? []).join(" · ") }] : []),
                ...(c.requerido ? [{ label: "Captura", value: "Obligatorio" }] : []),
              ],
            },
            [
            boton("Quitar", {
              method: "DELETE",
              action: `${base}/${c.clave}`,
              confirm: `¿Quitar «${c.etiqueta}» del cierre? Lo ya anotado en cierres hechos se queda.`,
              icon: "fa-trash",
              variant: "ghost",
            }),
            ],
          ),
        ),
      ),
    );
  }
  out.push(
    nodo("nox.card", { title: "Agregar dato al cierre" }, [
      nodo("nox.form", { method: "POST", action: base, then: `${ID_TABLA}?id={id}&modo=disenar&seccion=cierre&v={v}` }, [
        nodo("nox.input-text", { name: "etiqueta", label: "Nombre del dato", placeholder: "Ej.: Efectivo contado", required: true }),
        menu(
          "tipo",
          "¿Qué guarda?",
          TIPOS_CAMPO_CIERRE.map((t) => ({ value: t, label: `${TIPOS_UI[t].nombre} — ${TIPOS_UI[t].ayuda}` })),
          { value: "texto" },
        ),
        nodo("nox.input-textarea", {
          name: "opciones",
          label: "Opciones",
          help: "Solo para «Lista de opciones»: una por renglón o separadas por comas.",
        }),
        nodo("nox.input-checkbox", { name: "requerido", label: "Obligatorio", value: false }),
        boton("Agregar", { icon: "fa-plus" }),
      ]),
    ]),
  );
  return out;
}

/** «Al escanear»: la acción (extensible en ACCIONES_ESCANEO) y la columna que recibe el código. */
function tarjeta_al_escanear(spec: TablaSpec): NoxUiNode {
  const columnas = spec.campos.filter((c) => TIPOS_COLUMNA_ESCANEO.has(c.tipo) && (c.tipo !== "referencia" || c.tabla_ref_id));
  const descripcion =
    "Pon un escáner en «Ver tabla»: al leer un QR o código de barras se abre la captura con el código ya puesto en la columna que elijas. " +
    "Si la columna es un enlace a otra tabla, se busca el registro de esa tabla que tenga el código en su columna «Código» (o de texto) y queda elegido.";
  if (!columnas.length) {
    return nodo("nox.card", { title: "Al escanear un código" }, [
      nodo("nox.markdown-view", { content: `${descripcion}\n\nPrimero agrega una columna «Código», de texto o un enlace a otra tabla.` }),
    ]);
  }
  const actual = columna_de_escaneo(spec);
  return nodo("nox.card", { title: "Al escanear un código" }, [
    nodo("nox.markdown-view", { content: descripcion }),
    nodo(
      "nox.form",
      { method: "PATCH", action: `api://herr-tablas/${spec.id}/escaneo`, then: `${ID_TABLA}?id={id}&modo=disenar&seccion=ajustes` },
      [
        menu(
          "escaneo_accion",
          "Qué hacer",
          [
            { value: "ninguna", label: "Nada (sin escáner en «Ver tabla»)" },
            ...Object.entries(ACCIONES_ESCANEO).map(([value, a]) => ({ value, label: a.label })),
          ],
          { value: actual ? spec.escaneo!.accion : "ninguna" },
        ),
        menu(
          "escaneo_columna",
          "Columna que recibe el código",
          columnas.map((c) => ({
            value: c.clave,
            label: c.tipo === "referencia" ? `${c.etiqueta} (busca el registro con ese código)` : c.etiqueta,
          })),
          { value: actual?.clave ?? columnas.find((c) => c.tipo === "codigo")?.clave ?? columnas[0]!.clave },
        ),
        boton("Guardar", { icon: "fa-floppy-disk" }),
      ],
    ),
  ]);
}

/** Cómo se lee una regla: «Si el código es de Productos: +12 Botellas en un registro nuevo de Inventario». */
export function describir_regla(regla: ReglaEscaneo, spec: TablaSpec, tablas: Map<string, TablaSpec>): string {
  const t = (id: string | null) => (id ? (id === spec.id ? spec : tablas.get(id)) : undefined);
  const col = (tabla: TablaSpec | undefined, clave: string | null) => (clave ? (tabla?.campos.find((c) => c.clave === clave)?.etiqueta ?? clave) : "");
  const enlace = spec.campos.find((c) => c.clave === regla.enlace);
  const destino = t(tabla_destino_de(regla, { actual: spec, tabla: (id) => t(id) ?? null })?.id ?? null);
  const cuando = [
    regla.codigo ? `el código es «${regla.codigo}»` : "",
    regla.tabla_origen ? `el código es de «${t(regla.tabla_origen)?.name ?? "otra tabla"}»` : "",
  ].filter(Boolean);
  const cantidad = regla.cantidad_de
    ? `${regla.cantidad} × «${col(t(regla.tabla_origen), regla.cantidad_de)}» del código`
    : String(regla.cantidad);
  const donde: Record<DestinoRegla, string> = {
    actual: "el registro abierto",
    padre: `el registro de «${enlace?.etiqueta ?? regla.enlace}»`,
    nuevo_padre: `un registro nuevo de «${destino?.name ?? "la tabla padre"}»`,
    nuevo: `un registro nuevo de «${destino?.name ?? "otra tabla"}»`,
    existente_o_nuevo: `el registro de «${destino?.name ?? "otra tabla"}» con ese código (o uno nuevo)`,
    subtabla: "",
  };
  if (regla.destino === "subtabla") {
    const sub = spec.campos.find((c) => c.clave === regla.subtabla);
    const sc = (clave: string | null) => (clave ? (columnas_de(sub ?? { columnas: [] }).find((c) => c.clave === clave)?.etiqueta ?? clave) : "");
    const origen = t(regla.tabla_origen);
    const copias = (regla.copiar ?? []).map((c) => `«${col(origen, c.de)}» → «${sc(c.a)}»`);
    const como =
      regla.modo_subtabla === "agregar" || !regla.columna_codigo
        ? "agrega una fila"
        : `si ya hay una fila con ese código en «${sc(regla.columna_codigo)}», ${ACCIONES_REGLA[regla.accion].split(" ")[0]!.toLowerCase()} ${cantidad} en su «${sc(regla.columna)}»; si no, agrega una fila`;
    const detalles = [
      regla.columna_codigo ? `el código va en «${sc(regla.columna_codigo)}»` : "",
      origen ? "copia las columnas de igual nombre del registro del código" : "",
      copias.length ? `y también ${copias.join(", ")}` : "",
    ].filter(Boolean);
    return (
      `${cuando.length ? `Si ${cuando.join(" y ")}` : "Con cualquier código"}: en la subtabla «${sub?.etiqueta ?? regla.subtabla}» del registro abierto ${como}` +
      (detalles.length ? ` (${detalles.join("; ")})` : "") +
      "."
    );
  }
  const extra = [
    regla.columna_codigo ? `el código va en «${col(destino, regla.columna_codigo)}»` : "",
    regla.enlace_actual ? `«${col(destino, regla.enlace_actual)}» apunta al registro abierto` : "",
  ].filter(Boolean);
  return (
    `${cuando.length ? `Si ${cuando.join(" y ")}` : "Con cualquier código"}: ` +
    `${ACCIONES_REGLA[regla.accion].split(" ")[0]} ${cantidad} en «${col(destino, regla.columna)}» de ${donde[regla.destino]}` +
    (extra.length ? ` (${extra.join("; ")})` : "") +
    "."
  );
}

/** Reglas al escanear: la lista, para quitar, y el formulario para agregar otra. */
function seccion_reglas(spec: TablaSpec, tablas: Map<string, TablaSpec>): NoxUiNode[] {
  const todas = [spec, ...[...tablas.values()].filter((t) => t.id !== spec.id)];
  const columnas = (filtro: (c: CampoSpec, t: TablaSpec) => boolean) =>
    todas.flatMap((t) => t.campos.filter((c) => filtro(c, t)).map((c) => ({ value: `${t.id}.${c.clave}`, label: `${t.name} · ${c.etiqueta}` })));
  const subtablas = spec.campos.filter((c) => c.tipo === "subtabla");
  /** Columnas de las subtablas de esta tabla (destino «subtabla»): `<tabla>.<subtabla>.<columna>`. */
  const subcolumnas = (filtro: (c: CampoSpec) => boolean) =>
    subtablas.flatMap((sub) =>
      columnas_de(sub)
        .filter(filtro)
        .map((c) => ({ value: `${spec.id}.${sub.clave}.${c.clave}`, label: `${sub.etiqueta} › ${c.etiqueta}` })),
    );
  const ninguna = (label: string) => [{ value: "", label }];
  const out: NoxUiNode[] = [
    nodo("nox.markdown-view", {
      content:
        "Con un registro abierto (o desde «Ver tabla» si en Ajustes eliges «Aplicar las reglas»), cada código leído aplica **todas** las reglas que le coinciden: " +
        "suma, resta o pone una cantidad en el registro abierto, en el registro padre (el de un enlace), en uno nuevo de la tabla padre o en otra tabla. " +
        "Ejemplo: al escanear una caja de «Productos», sumar 12 en «Botellas» de un registro nuevo de «Inventario».",
    }),
  ];
  for (const regla of spec.reglas ?? []) {
    out.push(
      nodo("nox.card", { title: regla.nombre || "Regla" }, [
        nodo("nox.markdown-view", { content: describir_regla(regla, spec, tablas) }),
        boton("Quitar", {
          method: "DELETE",
          action: `api://herr-tablas/${spec.id}/reglas/${regla.id}`,
          confirm: `¿Quitar la regla «${regla.nombre || "Regla"}»?`,
          icon: "fa-trash",
          variant: "ghost",
        }),
      ]),
    );
  }
  if ((spec.reglas?.length ?? 0) >= MAX_REGLAS) return out;
  out.push(
    nodo("nox.card", { title: "Agregar una regla" }, [
      nodo(
        "nox.form",
        { method: "POST", action: `api://herr-tablas/${spec.id}/reglas`, then: `${ID_TABLA}?id={id}&modo=disenar&seccion=reglas` },
        [
          nodo("nox.input-text", { name: "nombre", label: "Nombre", help: "Para reconocerla: «Cajas de botellas»." }),
          titulo("Cuándo"),
          nodo("nox.input-text", { name: "codigo", label: "Código", help: "Vacío = cualquier código. Usa * como comodín: CAJA-*." }),
          menu("tabla_origen", "El código es de un registro de", [...ninguna("Cualquier tabla (o ninguna)"), ...todas.map((t) => ({ value: t.id, label: t.name }))], {
            value: "",
            help: "Se busca en sus columnas «Código» y luego en las de texto. Si no está, la regla no aplica.",
          }),
          titulo("Qué hacer"),
          menu("accion", "Acción", Object.entries(ACCIONES_REGLA).map(([value, label]) => ({ value, label })), { value: "sumar" }),
          nodo("nox.input-number", { name: "cantidad", label: "Cantidad", value: 1, required: true }),
          menu("cantidad_de", "Multiplicar por esta columna del código", [...ninguna("No: solo la cantidad"), ...columnas((c) => TIPOS_CANTIDAD.has(c.tipo))], {
            value: "",
            help: "Por ejemplo «Piezas por caja» de la tabla de origen.",
          }),
          titulo("Dónde"),
          menu("destino", "Registro", Object.entries(DESTINOS_REGLA).map(([value, label]) => ({ value, label })), { value: "actual" }),
          menu(
            "enlace",
            "Enlace a la tabla padre",
            [...ninguna("— (solo para el registro padre)"), ...spec.campos.filter((c) => c.tipo === "referencia" && c.tabla_ref_id).map((c) => ({ value: c.clave, label: c.etiqueta }))],
            { value: "" },
          ),
          menu("tabla_destino", "Otra tabla", [...ninguna("— (solo para otra tabla)"), ...todas.map((t) => ({ value: t.id, label: t.name }))], { value: "" }),
          ...(subtablas.length
            ? [
                menu("subtabla", "Subtabla del registro abierto", [...ninguna("— (solo para una subtabla)"), ...subtablas.map((c) => ({ value: c.clave, label: c.etiqueta }))], {
                  value: "",
                  help: "Con «Una fila de una subtabla»: cada código agrega una fila (o cambia la cantidad de la que ya lo tiene) sin perder lo que no has guardado.",
                }),
                menu("modo_subtabla", "Si la fila ya está", Object.entries(MODOS_SUBTABLA).map(([value, label]) => ({ value, label })), { value: "sumar_o_agregar" }),
              ]
            : []),
          menu("columna", "Columna de la cantidad", [...columnas((c) => TIPOS_CANTIDAD.has(c.tipo)), ...subcolumnas((c) => TIPOS_CANTIDAD.has(c.tipo))], { required: true }),
          menu("columna_codigo", "Anotar el código en", [...ninguna("En ninguna columna"), ...columnas((c) => TIPOS_CODIGO_REGLA.has(c.tipo)), ...subcolumnas((c) => TIPOS_CODIGO_REGLA.has(c.tipo))], {
            value: "",
            help: "En un registro nuevo; con «el que ya tenga ese código», es por donde se busca. Un enlace guarda el registro del código.",
          }),
          menu(
            "enlace_actual",
            "Enlazar el registro nuevo al abierto con",
            [...ninguna("No enlazar"), ...columnas((c, t) => t.id !== spec.id && c.tipo === "referencia" && c.tabla_ref_id === spec.id)],
            { value: "" },
          ),
          ...(subtablas.length
            ? [
                titulo("Fila nueva de la subtabla"),
                nodo("nox.markdown-view", {
                  content:
                    "La fila nueva toma del registro del código las columnas que se llaman igual (Nombre, Precio…). Si alguna se llama distinto, elígela aquí.",
                }),
                ...[1, 2, 3].flatMap((n) => [
                  menu(`copiar_de_${n}`, `Copiar ${n}: esta columna del código…`, [...ninguna("—"), ...columnas((c, t) => t.id !== spec.id && c.tipo !== "subtabla")], { value: "" }),
                  menu(`copiar_a_${n}`, `…a esta columna de la fila`, [...ninguna("—"), ...subcolumnas((c) => !es_calculado(c))], { value: "" }),
                ]),
              ]
            : []),
          boton("Agregar regla", { icon: "fa-plus" }),
        ],
      ),
    ]),
  );
  return out;
}

function seccion_ajustes(spec: TablaSpec): NoxUiNode[] {
  return [
    nodo("nox.form", { method: "PATCH", action: `api://herr-tablas/${spec.id}` }, [
      nodo("nox.input-text", { name: "name", label: "Nombre de la tabla", value: spec.name, required: true }),
      nodo("nox.input-textarea", { name: "description", label: "Descripción", value: spec.description ?? "" }),
      nodo("nox.input-icon", { name: "icono", label: "Ícono", value: spec.icono ?? "fa-table" }),
      menu(
        "orden_campo",
        "Ordenar la lista por",
        [
          { value: "", label: "Lo último que se capturó" },
          ...spec.campos.filter((c) => !["foto", "fotos", "nota", "ruta", "geo"].includes(c.tipo)).map((c) => ({ value: c.clave, label: c.etiqueta })),
        ],
        { value: spec.orden_campo ?? "" },
      ),
      nodo("nox.input-checkbox", {
        name: "orden_desc",
        label: "Primero lo más grande o lo más nuevo",
        value: spec.orden_desc !== false,
      }),
      nodo("nox.input-checkbox", {
        name: "cerrable",
        label: "Permitir cierres",
        help: "Un cierre archiva los registros con un nombre y una fecha y deja la tabla vacía: sirve para jornadas, cortes de caja o inventarios, no para catálogos.",
        value: spec.cerrable !== false,
      }),
      boton("Guardar ajustes", { icon: "fa-floppy-disk" }),
    ]),
    tarjeta_al_escanear(spec),
    nodo("nox.card", { title: "Eliminar la tabla" }, [
      nodo("nox.markdown-view", { content: "La tabla y sus registros dejan de verse." }),
      boton("Eliminar tabla", {
        method: "DELETE",
        action: `api://herr-tablas/${spec.id}`,
        confirm: `¿Eliminar la tabla «${spec.name}»?`,
        then: ID_TABLA,
        icon: "fa-trash",
        variant: "ghost",
      }),
    ]),
  ];
}

async function tablas_por_id(data: Datos): Promise<Map<string, TablaSpec>> {
  const filas = await filas_de({ data }, "herr_tablas", { is_active: true });
  return new Map(filas.map((f) => [String(f.id), spec_de_fila(f)]));
}

export async function pagina_disenar(data: Datos, spec: TablaSpec, params: URLSearchParams): Promise<NoxPageDescriptor> {
  const pedida = texto(params.get("seccion"));
  const seccion: Seccion = SECCIONES.some((s) => s.id === pedida) ? (pedida as Seccion) : "columnas";
  const cuantos: Record<Seccion, number | undefined> = {
    columnas: spec.campos.length,
    totales: spec.resumenes.length,
    fijos: spec.constantes.length,
    cierre: spec.campos_cierre?.length,
    reglas: spec.reglas?.length,
    ajustes: undefined,
  };
  const hijos: NoxUiNode[] = [migas(["Mis tablas", HOJA], [spec.name, href_tabla(spec.id)])];
  if (params.get("nuevo")) {
    hijos.push(
      nodo("nox.alert", {
        text: "¡Tu tabla está lista!",
        description:
          "Revisa las columnas: con «Editar» cambias su nombre, tipo u orden. Agrega las que falten y cuando quieras pulsa «Capturar datos».",
      }),
    );
  }
  hijos.push(
    nodo("nox.tabs", {
      text: "Partes de la tabla",
      items: SECCIONES.map((s) => ({
        id: s.id,
        label: s.nombre,
        href: href_tabla(spec.id, { modo: "disenar", seccion: s.id }),
        active: s.id === seccion,
        ...(cuantos[s.id] ? { count: cuantos[s.id] } : {}),
      })),
    }),
  );
  if (seccion === "columnas") hijos.push(...seccion_columnas(spec, await tablas_por_id(data)));
  if (seccion === "totales") hijos.push(...(await seccion_totales(data, spec)));
  if (seccion === "fijos") hijos.push(...seccion_fijos(spec));
  if (seccion === "cierre") hijos.push(...seccion_cierre(spec));
  if (seccion === "reglas") hijos.push(...seccion_reglas(spec, await tablas_por_id(data)));
  if (seccion === "ajustes") hijos.push(...seccion_ajustes(spec));
  hijos.push(
    nodo("nox.toolbar", {}, [
      boton("Capturar datos", { href: href_captura(spec.id), icon: "fa-pen-to-square", variant: "primary" }),
      boton("Ver la tabla", { href: href_tabla(spec.id), icon: "fa-table" }),
    ]),
  );
  return pagina(ID_TABLA, `Diseñar · ${spec.name}`, hijos);
}

// #endregion

// #region Editor de una columna

function numero_o_vacio(n: number | null | undefined): number | "" {
  return typeof n === "number" && Number.isFinite(n) ? n : "";
}

/** Valor del menú «¿De dónde sale la unidad?»: la misma para todos. */
const UNIDAD_FIJA = "fija";
const UNIDAD_REGISTRO = "registro";
const UNIDAD_ENLACE = "enlace:";
/** «La que diga su columna X»: una columna de texto u opción de la misma tabla (o de la misma fila de la subtabla). */
const UNIDAD_COLUMNA = "columna:";

/** Columnas de la tabla enlazada que pueden dar una unidad: un número con unidad o un texto como «Unidad». */
function fuentes_de_unidad(destino: TablaSpec): CampoSpec[] {
  return destino.campos.filter(
    (c) =>
      ["texto", "opcion"].includes(c.tipo) ||
      (["numero", "entero", "dinero", "calculado", "nivel"].includes(c.tipo) && (c.unidad || c.unidad_por_registro)),
  );
}

/**
 * El menú de dónde sale la unidad de un número. En una bitácora que enlaza
 * productos, la cantidad se lee en la unidad de cada producto: «La del
 * Producto elegido».
 */
function menu_fuente_unidad(spec: TablaSpec, campo: CampoSpec, tablas: Map<string, TablaSpec>): NoxUiNode | null {
  const opciones = [{ value: UNIDAD_FIJA, label: "La misma para todos los registros (la de arriba)" }];
  if (TIPOS_UNIDAD_POR_REGISTRO.has(campo.tipo)) {
    opciones.push({ value: UNIDAD_REGISTRO, label: "Cada registro escribe la suya (kg, L, piezas…)" });
  }
  if (TIPOS_UNIDAD_DE_COLUMNA.has(campo.tipo)) {
    for (const c of spec.campos) {
      if (c.clave === campo.clave || !TIPOS_FUENTE_UNIDAD.has(c.tipo)) continue;
      opciones.push({ value: `${UNIDAD_COLUMNA}${c.clave}`, label: `La que diga la columna «${c.etiqueta}» de esta tabla` });
    }
  }
  for (const ref of spec.campos) {
    const destino = ref.tipo === "referencia" && ref.tabla_ref_id ? tablas.get(ref.tabla_ref_id) : undefined;
    if (!destino) continue;
    for (const fuente of fuentes_de_unidad(destino)) {
      opciones.push({
        value: `${UNIDAD_ENLACE}${ref.clave}:${fuente.clave}`,
        label: `La del ${ref.etiqueta} elegido: su «${fuente.etiqueta}»`,
      });
    }
  }
  if (opciones.length === 1) return null;
  const actual = campo.unidad_columna
    ? `${UNIDAD_COLUMNA}${campo.unidad_columna}`
    : campo.unidad_de
      ? `${UNIDAD_ENLACE}${campo.unidad_de}`
      : campo.unidad_por_registro
        ? UNIDAD_REGISTRO
        : UNIDAD_FIJA;
  return menu("unidad_fuente", "¿De dónde sale la unidad?", opciones, {
    value: opciones.some((o) => o.value === actual) ? actual : UNIDAD_FIJA,
    help: "Si cambia de un registro a otro, la de arriba es la que se propone o la que queda cuando falta.",
  });
}

function entradas_de_tipo(spec: TablaSpec, campo: CampoSpec, tablas: Map<string, TablaSpec>): NoxUiNode[] {
  const fuente = menu_fuente_unidad(spec, campo, tablas);
  const unidad = (placeholder: string) => [
    nodo("nox.input-text", { name: "unidad", label: "Unidad (opcional)", placeholder, value: campo.unidad ?? "" }),
    ...(fuente ? [fuente] : []),
  ];
  const decimales = nodo("nox.input-number", {
    name: "decimales",
    label: "Decimales",
    min: 0,
    max: 6,
    step: 1,
    value: numero_o_vacio(campo.decimales),
  });
  switch (campo.tipo) {
    case "opcion":
      return [
        nodo("nox.input-textarea", {
          name: "opciones",
          label: "Opciones",
          placeholder: "Pendiente\nEn camino\nEntregado",
          help: "Una por renglón, por ejemplo: Pendiente · En camino · Entregado.",
          value: (campo.opciones ?? []).join("\n"),
          required: true,
        }),
        nodo("nox.input-checkbox", { name: "multiple", label: "Se pueden elegir varias", value: campo.multiple === true }),
      ];
    case "referencia":
      return [
        menu("enlace", "Elegir de la tabla", [...tablas.values()].map((t) => ({ value: t.id, label: t.name })), {
          value: campo.tabla_ref_id ?? "",
          required: true,
          help: "Al capturar se elige un registro de esa tabla. Al guardar decides qué se ve de cada uno.",
        }),
        nodo("nox.input-checkbox", { name: "multiple", label: "Se pueden elegir varios", value: campo.multiple === true }),
        ...menus_ref_subtabla(campo, tablas),
      ];
    case "subtabla":
      return [];
    case "calculado": {
      const datos = opciones_numericas(spec, campo.clave);
      const otras = [...tablas.values()];
      const formula = campo.formula && campo.formula !== "0" ? formula_con_etiquetas(spec, campo.formula, otras) : "";
      return [
        menu(
          "operacion",
          "Cómo se calcula",
          [
            { value: ESCRITA, label: "Escribo yo la fórmula (abajo)" },
            ...Object.entries(OPERACIONES).map(([value, op]) => ({ value, label: op.nombre })),
          ],
          { value: ESCRITA },
        ),
        menu("dato_a", "Dato A", datos),
        menu("dato_b", "Dato B", datos),
        nodo("nox.input-number", { name: "numero_b", label: "…o B es este número", placeholder: "Ej.: 1.16" }),
        nodo("nox.input-text", {
          name: "formula",
          label: "Fórmula",
          value: formula,
          placeholder: "{Precio} × {Cantidad}",
          help: ayuda_formula(spec, "", campo.clave, otras),
        }),
        ...referencias_subtablas(spec, campo.clave),
        ...constructor_de_formula(spec, campo, otras),
        ...unidad("$, km, %…"),
        decimales,
      ];
    }
    case "numero":
      return [...unidad("km, L, kg…"), decimales];
    case "dinero":
      return [nodo("nox.input-text", { name: "unidad", label: "Unidad (opcional)", placeholder: "$", value: campo.unidad ?? "" }), decimales];
    case "entero":
      return unidad("piezas, personas…");
    case "codigo": {
      const e = campo.escaner ?? ESCANER_VACIO;
      const destinos = spec.campos.filter((c) => c.clave !== campo.clave && TIPOS_DESTINO_ESCANER.has(c.tipo));
      return [
        menu(
          "escaner_formatos",
          "Qué lee",
          Object.entries(FORMATOS_ESCANER).map(([value, label]) => ({ value, label })),
          { value: e.formatos },
        ),
        menu(
          "escaner_mostrar",
          "Qué se ve",
          Object.entries(MOSTRAR_ESCANER).map(([value, label]) => ({ value, label })),
          {
            value: e.mostrar ?? "valor",
            help: "Al capturar, en la lista y en la tabla. El código se vuelve a dibujar con el mismo formato que se leyó (versión y corrección del QR incluidas).",
          },
        ),
        nodo("nox.input-checkbox", { name: "multiple", label: "Varios códigos en el mismo registro", value: campo.multiple === true }),
        nodo("nox.input-checkbox", { name: "escaner_continuo", label: "La cámara sigue abierta para leer uno tras otro", value: e.continuo }),
        nodo("nox.input-checkbox", {
          name: "escaner_notas",
          label: "Una nota por código",
          help: "Solo con «Varios códigos»: junto a cada código se puede escribir una nota.",
          value: e.notas === true,
        }),
        titulo("Después de leer"),
        menu("escaner_destino", "Copiar el código también a", [{ value: "", label: "A ninguna otra columna" }, ...destinos.map((c) => ({ value: c.clave, label: c.etiqueta }))], {
          value: e.destino ?? "",
        }),
        nodo("nox.input-text", {
          name: "escaner_plantilla",
          label: "Abrir esta dirección",
          placeholder: "https://ejemplo.mx/consulta?codigo={valor}",
          help: "Pon {valor} donde va el código. Solo http://, https:// o una ruta del sistema que empiece con «/». Vacío: no abre nada.",
          value: e.plantilla ?? "",
        }),
        nodo("nox.input-checkbox", {
          name: "escaner_abrir_url",
          label: "Si el código es una dirección web, ofrecer abrirla",
          help: "Pregunta antes de abrir y enseña a qué sitio lleva.",
          value: e.abrir_url,
        }),
        nodo("nox.input-checkbox", { name: "escaner_buscar", label: "Buscar el código en los registros de esta tabla", value: e.buscar }),
      ];
    }
    case "nivel":
      return [
        nodo("nox.input-number", { name: "pasos", label: "Rayas del medidor", min: 0, step: 1, value: numero_o_vacio(campo.pasos) }),
        nodo("nox.input-number", { name: "capacidad", label: "Capacidad total", value: numero_o_vacio(campo.capacidad) }),
        nodo("nox.input-text", { name: "unidad", label: "Unidad (opcional)", placeholder: "L", value: campo.unidad ?? "" }),
        decimales,
      ];
    default:
      return [];
  }
}

/**
 * Si la tabla enlazada tiene subtablas: elegir el registro con su subtabla
 * completa o una sola fila suya (`<registro>~<fila>`).
 */
function menus_ref_subtabla(campo: CampoSpec, tablas: Map<string, TablaSpec>): NoxUiNode[] {
  const destino = campo.tabla_ref_id ? tablas.get(campo.tabla_ref_id) : undefined;
  const subs = destino?.campos.filter((c) => c.tipo === "subtabla") ?? [];
  if (!subs.length) return [];
  return [
    menu("ref_subtabla", "Su subtabla", [{ value: "", label: "No: solo el registro" }, ...subs.map((c) => ({ value: c.clave, label: c.etiqueta }))], {
      value: campo.ref_subtabla ?? "",
      help: "Para usar en cálculos sus columnas: {Enlace.Columna}.",
    }),
    menu("ref_subtabla_modo", "Qué se elige", Object.entries(MODOS_REF_SUBTABLA).map(([value, label]) => ({ value, label })), {
      value: campo.ref_subtabla_modo ?? "whole",
      help: "«Una fila»: al capturar se elige un renglón de la subtabla de algún registro (p. ej. un producto de una venta).",
    }),
  ];
}

/**
 * «Tomar de otra tabla o con condiciones»: arma `tabla_suma(…)` o `sumasi(…)`
 * sin escribirlos. Lo armado reemplaza la fórmula (o entra en su `{?}`); para
 * anidar más se edita la fórmula que queda.
 */
function constructor_de_formula(spec: TablaSpec, campo: CampoSpec, otras: TablaSpec[]): NoxUiNode[] {
  const columnas = opciones_columnas(spec, otras, campo.clave);
  const enlaces = opciones_enlace(spec, otras);
  const propias = [
    { value: "_id", label: "Este registro (para comparar con un enlace hacia esta tabla)" },
    ...[...spec.campos.filter((c) => c.clave !== campo.clave), ...spec.constantes].map((c) => ({ value: c.clave, label: c.etiqueta })),
  ];
  const ninguna = { value: "", label: "—" };
  const condiciones: NoxUiNode[] = [];
  for (let n = 1; n <= MAX_CONDICIONES; n++) {
    condiciones.push(
      menu(`ext_c${n}_columna`, `Condición ${n}: la columna`, [ninguna, ...columnas], { value: "" }),
      menu(`ext_c${n}_op`, `Condición ${n}: comparación`, Object.entries(COMPARADORES).map(([value, label]) => ({ value, label })), { value: "=" }),
      nodo("nox.input-text", { name: `ext_c${n}_valor`, label: `Condición ${n}: con este valor`, placeholder: "Ej.: Pagado, 100" }),
      menu(`ext_c${n}_actual`, `Condición ${n}: …o con esta columna de este registro`, [ninguna, ...propias], { value: "" }),
    );
  }
  return [
    titulo("Tomar de otra tabla o con condiciones (opcional)"),
    nodo("nox.markdown-view", {
      content:
        "Suma, cuenta o trae valores de los registros (de esta u otra tabla) que cumplan las condiciones. " +
        "Para comparar con este registro elige su columna en «…o con esta columna»: así se suman, por ejemplo, las ventas del producto de cada fila. " +
        `Lo armado reemplaza la fórmula de arriba; si la fórmula lleva \`${HUECO}\`, entra en ese lugar (por ejemplo \`{Precio} × ${HUECO}\`). ` +
        "Las columnas de las subtablas salen como «Subtabla … › Columna»; las de la subtabla de otra tabla, como «Tabla › Subtabla › Columna» " +
        "(se toman las filas de todos sus registros). " +
        "Para tomar solo de los registros hijos (los que enlazan a este), elige su enlace en «Solo los que enlazan a este registro». " +
        "Un cálculo puede usar otros cálculos: de este registro, de sus subtablas, de la tabla padre (por su enlace) o de las hijas y sus subtablas. " +
        "Para más condiciones u otras formas de anidarlas, edita después la fórmula.",
    }),
    menu("ext_que", "Qué hacer", [{ value: "", label: "No usar" }, ...Object.entries(QUE_HACER).map(([value, label]) => ({ value, label }))], { value: "" }),
    menu("ext_tabla", "De qué tabla", opciones_origen(spec, otras), {
      value: spec.id,
      ...(subtablas_de(spec).length
        ? { help: "Elige una subtabla para sumar, contar o juntar solo SUS filas que cumplan las condiciones (sale sub_suma, sub_cuenta…)." }
        : {}),
    }),
    menu("ext_columna", "Qué columna", [ninguna, ...columnas], { value: "", help: "De la tabla elegida. Para «Contar» no hace falta." }),
    ...(enlaces.length
      ? [
          menu("ext_enlace", "Solo los que enlazan a este registro", [{ value: "", label: "Todos los registros" }, ...enlaces], {
            value: "",
            help: "Por ejemplo, de «Pedidos» solo los que en su columna «Cliente» tienen a este cliente.",
          }),
        ]
      : []),
    menu("ext_union", "Las condiciones se cumplen", Object.entries(UNIONES).map(([value, label]) => ({ value, label })), { value: "y" }),
    ...condiciones,
  ];
}

/** Cualquier valor que no sea una operación deja mandar la fórmula escrita; este además se ve elegido. */
const ESCRITA = "escrita";

const CON_VALOR_INICIAL = new Set(["texto", "numero", "dinero", "entero", "opcion"]);

/** Lo que da el cálculo con el último registro: se ve si la fórmula hace lo que se quería. */
async function vista_previa(data: Datos, spec: TablaSpec, campo: CampoSpec): Promise<NoxUiNode | null> {
  if (!es_calculado(campo) || !campo.formula || campo.formula === "0") return null;
  const filas = await filas_recalculadas({ data }, spec, await registros_de({ data }, spec.id));
  const ultima = filas.reduce<(typeof filas)[number] | null>(
    (a, f) => (!a || texto(f.created_at) >= texto(a.created_at) ? f : a),
    null,
  );
  if (!ultima) {
    return nodo("nox.alert", { text: "Vista previa", description: "Captura un registro para ver qué da este cálculo." });
  }
  const unidad = campo.unidad_columna ? ultima.valores[campo.unidad_columna] || campo.unidad : campo.unidad;
  const valor = con_unidad(ultima.valores[campo.clave] ?? "", unidad) || "vacío";
  return nodo("nox.detail", { text: "Vista previa", items: [{ label: "Con el último registro da", value: valor, emphasis: true }] });
}

/** Las cuatro partes de la opción con el último registro de la tabla enlazada. */
async function vista_opcion(data: Datos, spec: TablaSpec, campo: CampoSpec, destino: TablaSpec): Promise<NoxUiNode> {
  const ultima = (await registros_de({ data }, destino.id)).reduce<DomainRow | null>(
    (a, f) => (!a || texto(f.created_at) >= texto(a.created_at) ? f : a),
    null,
  );
  if (!ultima) {
    return nodo("nox.alert", { text: "Vista previa", description: `Captura un registro en «${destino.name}» para ver cómo queda.` });
  }
  const opcion = (await opciones_referencia(data, { ...spec, campos: [campo] })).get(campo.clave)?.get(String(ultima.id));
  return nodo("nox.detail", {
    text: "Así se ve el último registro",
    items: PARTES_REF.map((p) => ({
      label: PARTES_UI[p.campo],
      value: opcion?.[p.opcion] || "—",
      ...(p.opcion === "label" ? { emphasis: true } : {}),
    })),
  });
}

/**
 * Qué se ve de cada registro de la tabla enlazada al elegirlo en la captura.
 * Elegir una columna y escribir una plantilla son dos formularios: cada uno
 * guarda lo que enseña, sin adivinar cuál de los dos se quiso.
 */
async function seccion_opcion(data: Datos, spec: TablaSpec, campo: CampoSpec, destino: TablaSpec, ruta = campo.clave): Promise<NoxUiNode[]> {
  const action = `api://herr-tablas/${spec.id}/campos/${ruta}/opcion`;
  const columnas = destino.campos.filter((c) => !TIPOS_FOTO.has(c.tipo));
  const fotos = destino.campos.filter((c) => TIPOS_FOTO.has(c.tipo));
  const nombres = columnas.map((c) => `{${c.etiqueta}}`);
  return [
    titulo("Cómo se ve cada opción"),
    nodo("nox.markdown-view", {
      content:
        `Al capturar eliges un registro de «${destino.name}». Cada opción tiene un título, algo junto al título ` +
        "y dos descripciones: pon una columna en cada parte o escribe una plantilla con texto y columnas.",
    }),
    await vista_opcion(data, spec, campo, destino),
    nodo("nox.card", { title: "Elegir columnas" }, [
      nodo("nox.form", { method: "PATCH", action, then: THEN_DISENO }, [
        ...PARTES_REF.map(({ campo: parte }) => {
          const plantilla = campo[parte] ?? "";
          // Más que una columna (o una que ya no existe) se ve como su plantilla.
          const sola = columnas.find((c) => c.clave === columna_unica(plantilla))?.clave;
          const opciones = [
            { value: SIN_COLUMNA, label: parte === "ref_leyenda" ? "El nombre del registro" : "Nada" },
            ...columnas.map((c) => ({ value: c.clave, label: c.etiqueta })),
          ];
          if (plantilla && !sola) {
            opciones.push({ value: CON_PLANTILLA, label: `La plantilla «${plantilla_con_etiquetas(destino, plantilla)}»` });
          }
          return menu(`columna_${parte}`, PARTES_UI[parte], opciones, {
            value: sola ?? (plantilla ? CON_PLANTILLA : SIN_COLUMNA),
          });
        }),
        boton("Guardar columnas", { icon: "fa-floppy-disk" }),
      ]),
    ]),
    nodo("nox.card", { title: "Escribir plantillas" }, [
      nodo("nox.markdown-view", {
        content:
          "Escribe texto y pon los nombres de las columnas entre llaves, como en los cálculos. " +
          (nombres.length ? `Puedes usar: ${lista_corta(nombres, 12)}.` : ""),
      }),
      nodo("nox.form", { method: "PATCH", action, then: THEN_DISENO }, [
        ...PARTES_REF.map((p, i) => {
          const ejemplo = columnas[i % columnas.length]?.etiqueta;
          return nodo("nox.input-text", {
            name: `plantilla_${p.campo}`,
            label: PARTES_UI[p.campo],
            value: plantilla_con_etiquetas(destino, campo[p.campo]),
            placeholder: !ejemplo ? "" : i === 0 ? `Ej.: {${ejemplo}}` : `Ej.: ${ejemplo}: {${ejemplo}}`,
          });
        }),
        boton("Guardar plantillas", { icon: "fa-floppy-disk" }),
      ]),
    ]),
    ...(fotos.length
      ? [
          nodo("nox.card", { title: "Foto" }, [
            nodo("nox.markdown-view", {
              content:
                `La foto de cada registro de «${destino.name}» acompaña la opción al elegirla. ` +
                "Puedes enseñarla también en la lista de esta tabla y al imprimirla, por ejemplo la foto de cada producto en una bitácora.",
            }),
            nodo("nox.form", { method: "PATCH", action, then: THEN_DISENO }, [
              menu(
                "ref_foto",
                "Qué foto",
                [
                  { value: FOTO_AUTOMATICA, label: "La primera que tenga" },
                  ...fotos.map((c) => ({ value: c.clave, label: c.etiqueta })),
                  { value: SIN_FOTO, label: "Ninguna" },
                ],
                { value: campo.ref_foto ?? FOTO_AUTOMATICA },
              ),
              nodo("nox.input-checkbox", {
                name: "ref_foto_en_tabla",
                label: "Enseñarla en la lista y al imprimir",
                value: campo.ref_foto_en_tabla === true,
              }),
              boton("Guardar foto", { icon: "fa-floppy-disk" }),
            ]),
          ]),
        ]
      : []),
    tarjeta_escanear(action, campo, destino),
  ];
}

/** Elegir el registro enlazado leyendo con la cámara un código de sus columnas «Código». */
function tarjeta_escanear(action: string, campo: CampoSpec, destino: TablaSpec): NoxUiNode {
  const codigos = destino.campos.filter((c) => c.tipo === "codigo");
  const cuales = codigos.map((c) => `«${c.etiqueta}»`).join(", ");
  return nodo("nox.card", { title: "Elegir escaneando" }, [
    nodo("nox.markdown-view", {
      content:
        (codigos.length
          ? `Al capturar, un botón abre la cámara: lee el QR o código de barras guardado en ${cuales} y elige ese registro de «${destino.name}». `
          : `«${destino.name}» aún no tiene una columna «Código»: sin ella solo se elige leyendo el título de la opción. `) +
        (campo.multiple ? "Como el enlace es de varios registros, cada código leído agrega (marca) su registro a la lista." : ""),
    }),
    nodo("nox.form", { method: "PATCH", action, then: THEN_DISENO }, [
      nodo("nox.input-checkbox", {
        name: "ref_escaner",
        label: "Elegir el registro escaneando su código",
        value: campo.ref_escaner === true,
      }),
      boton("Guardar", { icon: "fa-floppy-disk" }),
    ]),
  ]);
}

/** Las columnas de una subtabla: cada una con su editor, y el formulario para agregar otra. */
function seccion_subtabla(spec: TablaSpec, sub: CampoSpec, tablas: Map<string, TablaSpec>): NoxUiNode[] {
  const base = `api://herr-tablas/${spec.id}/campos`;
  const sspec = spec_de_subtabla(spec, sub);
  const columnas = columnas_de(sub);
  return [
    titulo("Columnas de la subtabla"),
    nodo("nox.markdown-view", {
      content:
        "Cada registro tiene sus propias filas con estas columnas (texto, números, dinero, listas, enlaces, cálculos…). " +
        "Un cálculo de la subtabla se hace en cada fila: {Cantidad} × {Precio}. En los cálculos del registro: " +
        `{${sub.etiqueta}.Columna} junta la columna y sub_suma("${sub.etiqueta}", …) suma con condiciones.`,
    }),
    nodo(
      "nox.stack",
      { layout: "grid" },
      columnas.map((c) =>
        nodo("nox.detail", { text: c.etiqueta, items: detalle_columna(sspec, c, tablas) }, [
          nodo("nox.toolbar", {}, [
            boton("Editar", { href: href_tabla(spec.id, { modo: "campo", campo: `${sub.clave}.${c.clave}` }), icon: "fa-pen" }),
            boton("Quitar", {
              method: "DELETE",
              action: `${base}/${sub.clave}.${c.clave}`,
              then: THEN_DISENO,
              confirm: `¿Quitar la columna «${c.etiqueta}» de «${sub.etiqueta}»?`,
              icon: "fa-trash",
              variant: "ghost",
            }),
          ]),
        ]),
      ),
    ),
    nodo("nox.card", { title: `Agregar columna a «${sub.etiqueta}»` }, [
      nodo("nox.form", { method: "POST", action: base, then: THEN_DISENO }, [
        nodo("nox.input-hidden", { name: "subtabla", value: sub.clave }),
        nodo("nox.input-text", {
          name: "etiqueta",
          label: "Nombre de la columna",
          placeholder: "Ej.: Producto, Cantidad, Precio",
          required: true,
          help: "Varias a la vez: sepáralas con comas.",
        }),
        menu("tipo", "¿Qué guarda?", opciones_tipo(true, true), { value: TIPO_AUTOMATICO }),
        boton("Agregar", { icon: "fa-plus" }),
      ]),
    ]),
  ];
}

export async function pagina_campo(data: Datos, spec_tabla: TablaSpec, clave: string): Promise<NoxPageDescriptor> {
  // `subtabla.columna`: una columna de una subtabla, editada con el mismo editor.
  const punto = clave.indexOf(".");
  const sub = punto > 0 ? spec_tabla.campos.find((c) => c.tipo === "subtabla" && c.clave === clave.slice(0, punto)) : undefined;
  const spec = sub ? spec_de_subtabla(spec_tabla, sub) : spec_tabla;
  const lista = sub ? columnas_de(sub) : spec_tabla.campos;
  const campo = lista.find((c) => c.clave === (sub ? clave.slice(punto + 1) : clave));
  const ruta = sub && campo ? `${sub.clave}.${campo.clave}` : (campo?.clave ?? clave);
  const disenar = href_tabla(spec_tabla.id, { modo: "disenar" });
  const hijos: NoxUiNode[] = [
    migas(
      ["Mis tablas", HOJA],
      [spec_tabla.name, href_tabla(spec_tabla.id)],
      ["Diseñar", disenar],
      ...(sub ? [[sub.etiqueta, href_tabla(spec_tabla.id, { modo: "campo", campo: sub.clave })] as [string, string]] : []),
    ),
  ];
  if (!campo) {
    hijos.push(nodo("nox.empty", { text: "La columna ya no existe" }, [boton("Volver al diseño", { href: disenar, icon: "fa-arrow-left" })]));
    return pagina(ID_TABLA, spec.name, hijos);
  }
  const tipo = TIPOS_UI[campo.tipo];
  hijos.push(nodo("nox.markdown-view", { content: `**${tipo?.nombre ?? campo.tipo}**: ${tipo?.ayuda ?? ""}` }));
  const previa = sub ? null : await vista_previa(data, spec, campo);
  if (previa) hijos.push(previa);
  const otras = lista.filter((c) => c.clave !== campo.clave);
  const tablas = await tablas_por_id(data);
  const entradas: NoxUiNode[] = [
    nodo("nox.input-text", { name: "etiqueta", label: "Nombre", value: campo.etiqueta, required: true }),
    menu("tipo", "Qué guarda", opciones_tipo(false, !!sub), {
      value: campo.tipo,
      help: "Si cambias el tipo, al guardar verás sus ajustes.",
    }),
    ...entradas_de_tipo(spec, campo, tablas),
  ];
  if (CON_VALOR_INICIAL.has(campo.tipo) && !es_calculado(campo)) {
    entradas.push(
      nodo("nox.input-text", {
        name: "valor_por_defecto",
        label: "Valor inicial (opcional)",
        help: "Aparece ya escrito al capturar; se puede cambiar.",
        value: campo.valor_por_defecto ?? "",
      }),
    );
  }
  if (!es_calculado(campo)) {
    entradas.push(nodo("nox.input-checkbox", { name: "requerido", label: "Obligatoria: no se guarda sin ella", value: campo.requerido === true }));
  }
  entradas.push(
    nodo("nox.input-checkbox", {
      name: "en_resumen",
      label: sub ? `Se ve en el resumen de «${sub.etiqueta}» en la lista` : "Se ve en la lista de registros",
      value: campo.en_resumen === true,
    }),
  );
  if (otras.length) {
    entradas.push(
      menu(
        "posicion",
        "Posición",
        Array.from({ length: otras.length + 1 }, (_, p) => ({
          value: String(p),
          label: p === 0 ? "Al principio" : `Después de «${otras[p - 1]!.etiqueta}»`,
        })),
        { value: String(lista.indexOf(campo)) },
      ),
    );
  }
  hijos.push(
    nodo(
      "nox.form",
      { method: "PATCH", action: `api://herr-tablas/${spec_tabla.id}/campos/${ruta}`, then: THEN_DISENO },
      [...entradas, boton("Guardar columna", { icon: "fa-floppy-disk" })],
    ),
  );
  if (campo.tipo === "subtabla") hijos.push(...seccion_subtabla(spec_tabla, campo, tablas));
  const destino = campo.tipo === "referencia" && campo.tabla_ref_id ? tablas.get(campo.tabla_ref_id) : undefined;
  if (destino) hijos.push(...(await seccion_opcion(data, spec_tabla, campo, destino, ruta)));
  const volver = sub ? href_tabla(spec_tabla.id, { modo: "campo", campo: sub.clave }) : disenar;
  hijos.push(
    nodo("nox.toolbar", {}, [
      boton("Volver", { href: volver, icon: "fa-arrow-left" }),
      boton("Quitar columna", {
        method: "DELETE",
        action: `api://herr-tablas/${spec_tabla.id}/campos/${ruta}`,
        confirm: `¿Quitar la columna «${campo.etiqueta}»? Lo ya capturado en ella deja de verse.`,
        then: sub ? `${ID_TABLA}?id=${spec_tabla.id}&modo=campo&campo=${sub.clave}` : `${ID_TABLA}?id=${spec_tabla.id}&modo=disenar`,
        icon: "fa-trash",
        variant: "ghost",
      }),
    ]),
  );
  return pagina(ID_TABLA, `${campo.etiqueta} · ${spec_tabla.name}`, hijos);
}

// #endregion
