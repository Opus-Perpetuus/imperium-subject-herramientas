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
  formula_con_etiquetas,
  opciones_numericas,
} from "../../lib/formulas/disenio.ts";
import {
  PARTES_REF,
  SIN_FOTO,
  TIPOS_CAMPO_CIERRE,
  TIPOS_FOTO,
  TIPOS_UNIDAD_POR_REGISTRO,
  spec_de_fila,
  type CampoSpec,
  type ResumenTabla,
  type TablaSpec,
} from "../../lib/formulas/esquema.ts";
import { parsear_agregado } from "../../lib/formulas/motor.ts";
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

function opciones_tipo(con_automatico: boolean): Array<{ value: string; label: string }> {
  return [
    ...(con_automatico ? [{ value: TIPO_AUTOMATICO, label: "Que se adivine por el nombre" }] : []),
    ...ORDEN_TIPOS.map((t) => ({ value: t, label: `${TIPOS_UI[t].nombre} — ${TIPOS_UI[t].ayuda}` })),
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
  if (campo.tipo === "calculado") {
    items.push({ label: "Cálculo", value: campo.formula === "0" ? "Sin configurar: toca Editar" : formula_con_etiquetas(spec, campo.formula ?? "") });
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
function describir_total(spec: TablaSpec, r: ResumenTabla): string {
  const solo = /^\{([^{}]+)\}$/.exec(r.formula.trim());
  const agregado = solo ? parsear_agregado(solo[1]!) : null;
  const campo = agregado ? spec.campos.find((c) => c.clave === agregado.campo) : undefined;
  if (agregado && campo) return `${QUE_CALCULA[agregado.tipo]} «${campo.etiqueta}»`;
  return r.formula.trim() === TOTAL_REGISTROS.formula ? TOTAL_REGISTROS.nombre : formula_con_etiquetas(spec, r.formula);
}

async function seccion_totales(data: Datos, spec: TablaSpec): Promise<NoxUiNode[]> {
  const base = `api://herr-tablas/${spec.id}/resumenes`;
  const out: NoxUiNode[] = [
    nodo("nox.markdown-view", { content: "Cifras de toda la tabla que se ven encima de la lista: cuánto llevas gastado, el promedio, el más alto…" }),
  ];
  if (spec.resumenes.length) {
    const filas = filas_recalculadas(spec, await registros_de({ data }, spec.id));
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
    nodo("nox.detail", { text: r.etiqueta, items: [{ label: "Qué calcula", value: describir_total(spec, r) }] }, [
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
          help: ayuda_formula(spec, "Para una columna entera usa {suma:Nombre}, {promedio:Nombre}, {minimo:Nombre}, {maximo:Nombre} o {cuenta:Nombre}."),
        }),
        boton("Agregar total", { icon: "fa-plus" }),
      ]),
    ]),
  );
  return out;
}

function ayuda_formula(spec: TablaSpec, extra = "", excepto?: string): string {
  const nombres = [...spec.campos.filter((c) => c.clave !== excepto), ...spec.constantes].map((c) => `{${c.etiqueta}}`);
  return [
    "Escribe los nombres entre llaves y opera con + − × ÷.",
    nombres.length ? `Puedes usar: ${lista_corta(nombres, 12)}.` : "",
    extra,
    "Condiciones: si({Estado} = \"Pagado\", {Monto}, 0).",
  ]
    .filter(Boolean)
    .join(" ");
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
  const actual = campo.unidad_de ? `${UNIDAD_ENLACE}${campo.unidad_de}` : campo.unidad_por_registro ? UNIDAD_REGISTRO : UNIDAD_FIJA;
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
      ];
    case "calculado": {
      const datos = opciones_numericas(spec, campo.clave);
      const formula = campo.formula && campo.formula !== "0" ? formula_con_etiquetas(spec, campo.formula) : "";
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
          help: ayuda_formula(spec, "", campo.clave),
        }),
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

/** Cualquier valor que no sea una operación deja mandar la fórmula escrita; este además se ve elegido. */
const ESCRITA = "escrita";

const CON_VALOR_INICIAL = new Set(["texto", "numero", "dinero", "entero", "opcion"]);

/** Lo que da el cálculo con el último registro: se ve si la fórmula hace lo que se quería. */
async function vista_previa(data: Datos, spec: TablaSpec, campo: CampoSpec): Promise<NoxUiNode | null> {
  if (campo.tipo !== "calculado" || !campo.formula || campo.formula === "0") return null;
  const filas = filas_recalculadas(spec, await registros_de({ data }, spec.id));
  const ultima = filas.reduce<(typeof filas)[number] | null>(
    (a, f) => (!a || texto(f.created_at) >= texto(a.created_at) ? f : a),
    null,
  );
  if (!ultima) {
    return nodo("nox.alert", { text: "Vista previa", description: "Captura un registro para ver qué da este cálculo." });
  }
  const valor = con_unidad(ultima.valores[campo.clave] ?? "", campo.unidad) || "vacío";
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
async function seccion_opcion(data: Datos, spec: TablaSpec, campo: CampoSpec, destino: TablaSpec): Promise<NoxUiNode[]> {
  const action = `api://herr-tablas/${spec.id}/campos/${campo.clave}/opcion`;
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
  ];
}

export async function pagina_campo(data: Datos, spec: TablaSpec, clave: string): Promise<NoxPageDescriptor> {
  const campo = spec.campos.find((c) => c.clave === clave);
  const disenar = href_tabla(spec.id, { modo: "disenar" });
  const hijos: NoxUiNode[] = [migas(["Mis tablas", HOJA], [spec.name, href_tabla(spec.id)], ["Diseñar", disenar])];
  if (!campo) {
    hijos.push(nodo("nox.empty", { text: "La columna ya no existe" }, [boton("Volver al diseño", { href: disenar, icon: "fa-arrow-left" })]));
    return pagina(ID_TABLA, spec.name, hijos);
  }
  const tipo = TIPOS_UI[campo.tipo];
  hijos.push(nodo("nox.markdown-view", { content: `**${tipo?.nombre ?? campo.tipo}**: ${tipo?.ayuda ?? ""}` }));
  const previa = await vista_previa(data, spec, campo);
  if (previa) hijos.push(previa);
  const otras = spec.campos.filter((c) => c.clave !== campo.clave);
  const tablas = await tablas_por_id(data);
  const entradas: NoxUiNode[] = [
    nodo("nox.input-text", { name: "etiqueta", label: "Nombre", value: campo.etiqueta, required: true }),
    menu("tipo", "Qué guarda", opciones_tipo(false), {
      value: campo.tipo,
      help: "Si cambias el tipo, al guardar verás sus ajustes.",
    }),
    ...entradas_de_tipo(spec, campo, tablas),
  ];
  if (CON_VALOR_INICIAL.has(campo.tipo)) {
    entradas.push(
      nodo("nox.input-text", {
        name: "valor_por_defecto",
        label: "Valor inicial (opcional)",
        help: "Aparece ya escrito al capturar; se puede cambiar.",
        value: campo.valor_por_defecto ?? "",
      }),
    );
  }
  if (campo.tipo !== "calculado") {
    entradas.push(nodo("nox.input-checkbox", { name: "requerido", label: "Obligatoria: no se guarda sin ella", value: campo.requerido === true }));
  }
  entradas.push(nodo("nox.input-checkbox", { name: "en_resumen", label: "Se ve en la lista de registros", value: campo.en_resumen === true }));
  if (otras.length) {
    entradas.push(
      menu(
        "posicion",
        "Posición",
        Array.from({ length: otras.length + 1 }, (_, p) => ({
          value: String(p),
          label: p === 0 ? "Al principio" : `Después de «${otras[p - 1]!.etiqueta}»`,
        })),
        { value: String(spec.campos.indexOf(campo)) },
      ),
    );
  }
  hijos.push(
    nodo(
      "nox.form",
      { method: "PATCH", action: `api://herr-tablas/${spec.id}/campos/${campo.clave}`, then: THEN_DISENO },
      [...entradas, boton("Guardar columna", { icon: "fa-floppy-disk" })],
    ),
  );
  const destino = campo.tipo === "referencia" && campo.tabla_ref_id ? tablas.get(campo.tabla_ref_id) : undefined;
  if (destino) hijos.push(...(await seccion_opcion(data, spec, campo, destino)));
  hijos.push(
    nodo("nox.toolbar", {}, [
      boton("Volver", { href: disenar, icon: "fa-arrow-left" }),
      boton("Quitar columna", {
        method: "DELETE",
        action: `api://herr-tablas/${spec.id}/campos/${campo.clave}`,
        confirm: `¿Quitar la columna «${campo.etiqueta}»? Lo ya capturado en ella deja de verse.`,
        then: `${ID_TABLA}?id=${spec.id}&modo=disenar`,
        icon: "fa-trash",
        variant: "ghost",
      }),
    ]),
  );
  return pagina(ID_TABLA, `${campo.etiqueta} · ${spec.name}`, hijos);
}

// #endregion
