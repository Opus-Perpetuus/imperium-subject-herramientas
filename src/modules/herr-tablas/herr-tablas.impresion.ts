import { define_routes, type KirletCtx, type NoxPageDescriptor, type NoxUiNode } from "@opus-perpetuus/imperium-core-kit";
import { booleano, dia_legible, falla, fecha_hoy, hora_ahora, texto, zona_valida } from "../../lib/comun.ts";
import { valores_resumen } from "../../lib/formulas/calculadora.ts";
import { TIPOS_FOTO, spec_de_fila, type CampoSpec, type Registro, type TablaSpec } from "../../lib/formulas/esquema.ts";
import { lista_de, partir } from "../../lib/formulas/fotos.ts";
import { pdf_de, png_de, medida } from "../../lib/impresion/archivos.ts";
import { componer, type AnexoImpreso, type ColumnaImpresa, type Impreso } from "../../lib/impresion/composicion.ts";
import { escapar } from "../../lib/markdown/html.ts";
import { ID_TABLA, href_tabla, migas } from "./herr-tablas.disenador.ts";
import { con_foto_de_enlace, dibuja_codigo, filtrar_filas, presentar, tabla_activa, vista_de_tabla } from "./herr-tablas.flow.ts";
import { codigos_con_notas, codigos_de, metadatas_de_codigos } from "../../lib/formulas/escaner.ts";
import { png_de_codigo } from "../../lib/impresion/codigos.ts";
import { boton, con_unidad, nodo, pagina } from "./herr-tablas.nox.ts";

/**
 * Imprimir una tabla en PDF o PNG: todos los registros, los que encuentra una
 * búsqueda o solo los que se marcan. Son dos modos de la hoja `herr-tabla`:
 * `imprimir` (elegir) e `impreso` (el archivo). El lanzador no descarga lo que
 * responde una acción, así que el formulario solo guarda el pedido y la hoja
 * siguiente entrega el archivo como enlace `data:` con `download`.
 */

type Datos = KirletCtx["data"];

const FORMATOS = { pdf: "PDF", png: "Imagen PNG (una por hoja)" } as const;
type Formato = keyof typeof FORMATOS;

/** Casillas que se ofrecen a la vez; con más registros se busca primero. */
const MAX_ELEGIBLES = 200;
/**
 * Lo que cabe en el plazo de 4 s que da el núcleo a una hoja, con margen para
 * un servidor lento: 2000 registros son ~0.7 s de PDF en una máquina rápida y ~3 s con media CPU.
 * Cada hoja PNG viaja además como imagen dentro de la página.
 */
const MAX_FILAS = 2000;
const MAX_HOJAS_PNG = 5;

const NUMERICOS = new Set(["numero", "dinero", "entero", "calculado"]);

// #region Pedidos

/** Lo que se pidió, entre el formulario y la hoja que entrega el archivo. `ids` nulo es «todos». */
type Pedido = {
  tabla_id: string;
  formato: Formato;
  ids: string[] | null;
  q: string;
  nombre: string;
  /** Sin fotos el PDF pesa poco y cabe más por hoja. */
  fotos: boolean;
  /** Además de las columnas de la lista: todos los calculados, los valores fijos y los totales. */
  completo: boolean;
  vence: number;
};

/**
 * En memoria: el pedido vive lo que tarda el lanzador en abrir la hoja
 * siguiente (y un rato más, por si se recarga). Si la app se reinicia en
 * medio, la hoja pide volver a elegir.
 */
const PEDIDOS = new Map<string, Pedido>();
const VIGENCIA_MS = 30 * 60_000;
const MAX_PEDIDOS = 200;

function guardar_pedido(pedido: Omit<Pedido, "vence">): string {
  const ahora = Date.now();
  for (const [t, p] of PEDIDOS) if (p.vence < ahora) PEDIDOS.delete(t);
  while (PEDIDOS.size >= MAX_PEDIDOS) PEDIDOS.delete(PEDIDOS.keys().next().value!);
  const t = crypto.randomUUID();
  PEDIDOS.set(t, { ...pedido, vence: ahora + VIGENCIA_MS });
  return t;
}

function pedido_de(t: string, tabla_id: string): Pedido | null {
  const p = PEDIDOS.get(t);
  return p && p.tabla_id === tabla_id && p.vence >= Date.now() ? p : null;
}

// #endregion

// #region Qué se imprime

type Vista = Awaited<ReturnType<typeof vista_de_tabla>>;

function filtrar(spec: TablaSpec, vista: Vista, q: string): Registro[] {
  return filtrar_filas(spec, vista.filas, vista.presentacion, q);
}

function celdas(vista: Vista, fila: Registro): string[] {
  return vista.columnas.map((c) => presentar(c, fila, vista.presentacion));
}

/** Cómo se nombra un registro en la casilla para elegirlo: sus primeras columnas con dato. */
function nombre_de_fila(vista: Vista, fila: Registro): string {
  return celdas(vista, fila).filter(Boolean).slice(0, 3).join(" · ") || "Registro sin datos";
}

/** «3 registros», o «2000 de 5321 registros» si se recortó. */
function cuantos(n: number, de: number): string {
  return `${n}${de > n ? ` de ${de}` : ""} ${de === 1 ? "registro" : "registros"}`;
}

/** Las miniaturas de las fotos de una celda, unidas como las dibuja la composición. */
function miniaturas_de(fila: Registro, clave: string): string {
  const minis = partir(fila.miniaturas?.[clave]);
  return lista_de(fila.valores[clave])
    .map((_, i) => minis[i] ?? "")
    .filter(Boolean)
    .join("|");
}

/** Las columnas de la lista y, con `completo`, también los calculados que la lista no enseña, en el orden del diseño. */
export function columnas_impresas(spec: TablaSpec, vista: Vista, completo: boolean): CampoSpec[] {
  if (!completo) return vista.columnas;
  const en_lista = new Set(vista.columnas.map((c) => c.clave));
  return spec.campos.filter((c) => en_lista.has(c.clave) || c.tipo === "calculado");
}

/** Valores fijos y totales (los resúmenes de la tabla calculados sobre los registros impresos). */
export function anexos_de(spec: TablaSpec, filas: Registro[]): AnexoImpreso[] {
  return [
    {
      titulo: "Valores fijos",
      renglones: spec.constantes.map((c) => ({ etiqueta: c.etiqueta, valor: con_unidad(c.valor ?? "", c.unidad) })),
    },
    {
      titulo: "Totales",
      renglones: valores_resumen(spec, filas).map(({ resumen, texto: t }) => ({ etiqueta: resumen.etiqueta, valor: con_unidad(t, resumen.unidad) })),
    },
  ];
}

/** Códigos que se dibujan por impreso: cada uno es una imagen y el núcleo da 4 s a la hoja. */
export const MAX_CODIGOS_IMPRESOS = 300;

/** `<fila>|<columna>` → los códigos dibujados de la celda (data URLs unidas por `|`). */
type Dibujos = Map<string, string>;
const llave_dibujo = (f: Registro, clave: string) => `${f.id}|${clave}`;

/**
 * Dibuja los códigos de las columnas «Código» que piden enseñarlo (solo o con
 * su texto), en su formato leído. Con más de `MAX_CODIGOS_IMPRESOS`, los demás
 * quedan solo como texto y `faltan` lo dice.
 */
export async function codigos_impresos(columnas: CampoSpec[], filas: Registro[]): Promise<{ dibujos: Dibujos; faltan: number }> {
  const dibujos: Dibujos = new Map();
  let hechos = 0;
  let faltan = 0;
  for (const c of columnas.filter(dibuja_codigo)) {
    const solo_barras = c.escaner?.formatos === "barras";
    for (const f of filas) {
      const metas = metadatas_de_codigos(f.codigos?.[c.clave]);
      const urls: string[] = [];
      for (const codigo of codigos_de(c, f.valores[c.clave] ?? "")) {
        if (hechos >= MAX_CODIGOS_IMPRESOS) {
          faltan++;
          continue;
        }
        hechos++;
        const url = await png_de_codigo(codigo, texto(metas.get(codigo)?.format) || undefined, solo_barras);
        if (url) urls.push(url);
      }
      if (urls.length) dibujos.set(llave_dibujo(f, c.clave), urls.join("|"));
    }
  }
  return { dibujos, faltan };
}

/** El texto de una celda: las columnas «Código» con notas llevan la nota de cada código. */
function texto_de_celda(c: CampoSpec, f: Registro, vista: Vista): string {
  if (c.tipo === "codigo" && c.escaner?.notas) return codigos_con_notas(c, f.valores[c.clave] ?? "", f.codigos?.[c.clave]);
  return presentar(c, f, vista.presentacion);
}

/**
 * Columnas y celdas del impreso. Una foto va como su miniatura (en el impreso
 * se dibuja) y la de lo enlazado, en su columna junto al enlace. Sin `fotos`
 * no sale ninguna columna de imagen.
 */
function impreso_de(
  spec: TablaSpec,
  titulo: string,
  vista: Vista,
  filas: Registro[],
  de: number,
  detalle: string,
  pedido: { fotos: boolean; completo: boolean },
  dibujos: Dibujos = new Map(),
): Impreso {
  const { fotos, completo } = pedido;
  const zona = zona_valida();
  const dia = dia_legible(fecha_hoy(zona));
  const partes: Array<{ columna: ColumnaImpresa; celda: (f: Registro) => string }> = [];
  for (const c of columnas_impresas(spec, vista, completo)) {
    if (TIPOS_FOTO.has(c.tipo)) {
      if (fotos) partes.push({ columna: { titulo: c.etiqueta, imagen: true }, celda: (f) => miniaturas_de(f, c.clave) });
      continue;
    }
    // Un código dibujado: solo la imagen («codigo») o el texto y la imagen al lado («ambos»).
    const mostrar = dibuja_codigo(c) ? c.escaner!.mostrar : "valor";
    if (mostrar !== "codigo") {
      partes.push({ columna: { titulo: c.etiqueta, derecha: NUMERICOS.has(c.tipo) }, celda: (f) => texto_de_celda(c, f, vista) });
    }
    if (mostrar !== "valor") {
      partes.push({
        columna: { titulo: mostrar === "ambos" ? `Código · ${c.etiqueta}` : c.etiqueta, imagen: true },
        celda: (f) => dibujos.get(llave_dibujo(f, c.clave)) ?? "",
      });
    }
    if (fotos && con_foto_de_enlace(c)) {
      partes.push({
        columna: { titulo: `Foto · ${c.etiqueta}`, imagen: true },
        celda: (f) => vista.presentacion.fotos_enlace(c, f).minis.filter((m) => m.startsWith("data:")).join("|"),
      });
    }
  }
  return {
    titulo,
    subtitulo: [`Impreso el ${dia} a las ${hora_ahora(zona)}`, detalle].filter(Boolean).join(" · "),
    columnas: partes.map((p) => p.columna),
    filas: filas.map((f) => partes.map((p) => p.celda(f))),
    total: `Total: ${cuantos(filas.length, de)}`,
    ...(completo ? { anexos: anexos_de(spec, filas) } : {}),
  };
}

/** En ASCII (Chrome ignora el nombre con acentos de un enlace `data:`) y sin signos que un disco no acepte. */
export function nombre_archivo(nombre: string, extension: string, dia = fecha_hoy()): string {
  const base =
    nombre
      .normalize("NFD")
      .replace(/\p{M}/gu, "")
      .replace(/[^\x20-\x7e]+/g, "")
      .replace(/[\\/:*?"<>|]+/g, " ")
      .replace(/\s+/g, " ")
      .trim() || "Tabla";
  return `${base} ${dia}.${extension}`;
}

function peso(bytes: number): string {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function enlace_descarga(bytes: Uint8Array, tipo: string, archivo: string, texto_enlace: string, icono: string): string {
  const href = `data:${tipo};base64,${Buffer.from(bytes).toString("base64")}`;
  return `<p><a href="${href}" download="${escapar(archivo)}"><i class="fas ${icono}"></i> ${escapar(texto_enlace)}</a> <small>(${peso(bytes.length)})</small></p>`;
}

// #endregion

// #region Hojas

export async function pagina_imprimir(data: Datos, spec: TablaSpec, params: URLSearchParams): Promise<NoxPageDescriptor> {
  const q = texto(params.get("q"));
  const vista = await vista_de_tabla(data, spec);
  const visibles = filtrar(spec, vista, q);
  const hijos: NoxUiNode[] = [
    migas(["Mis tablas", "/internal/herr-tabla"], [spec.name, href_tabla(spec.id)]),
    nodo("nox.markdown-view", {
      content:
        "Sale con el nombre que le pongas, los títulos de las columnas, las fotos (si las quieres) y el total de registros; si lo pides, también los valores fijos, los calculados y los totales. " +
        "**Si no marcas ninguno, se imprimen todos los de abajo.**",
    }),
    nodo("nox.search", { label: "Buscar registros", value: q }),
  ];
  if (!visibles.length) {
    hijos.push(
      nodo(
        "nox.empty",
        q
          ? { text: "La búsqueda no encontró registros", description: "Prueba con otras palabras o bórrala para ver todos." }
          : { text: "Aún no hay registros que imprimir" },
      ),
    );
  } else {
    const elegibles = visibles.slice(0, MAX_ELEGIBLES);
    const n = visibles.length;
    hijos.push(
      nodo("nox.markdown-view", {
        content: q ? `**${n}** ${n === 1 ? "registro coincide" : "registros coinciden"} con «${q}».` : `**${n}** ${n === 1 ? "registro" : "registros"} en la tabla.`,
      }),
      nodo(
        "nox.form",
        { method: "POST", action: `api://herr-tablas/${spec.id}/imprimir`, then: `${ID_TABLA}?id={id}&modo=impreso&t={t}` },
        [
          nodo("nox.input-text", {
            name: "nombre",
            label: "Nombre del reporte",
            value: spec.name,
            required: true,
            help: "Sale como título del reporte y como nombre del archivo.",
          }),
          nodo("nox.input-menu", {
            name: "formato",
            label: "Formato",
            options: Object.entries(FORMATOS).map(([value, label]) => ({ value, label })),
            value: "pdf",
          }),
          nodo("nox.input-checkbox", {
            name: "fotos",
            label: "Con fotos",
            help: "Las de la tabla y las de lo enlazado que se ven en la lista. Sin ellas el archivo pesa menos.",
            value: true,
          }),
          nodo("nox.input-checkbox", {
            name: "completo",
            label: "Con valores fijos, calculados y totales",
            help: "Agrega las columnas calculadas que la lista no enseña y, al final, los valores fijos y los totales de lo impreso.",
            value: false,
          }),
          nodo("nox.input-hidden", { name: "q", value: q }),
          ...elegibles.map((f) => nodo("nox.input-checkbox", { name: `r_${f.id}`, label: nombre_de_fila(vista, f), value: false })),
          boton("Generar", { icon: "fa-print" }),
        ],
      ),
    );
    if (n > MAX_ELEGIBLES) {
      hijos.push(
        nodo("nox.alert", {
          text: `Se muestran ${MAX_ELEGIBLES} de ${n} para marcar`,
          description: "Busca para encontrar los que quieres. Sin marcar ninguno se imprimen los " + n + ".",
        }),
      );
    }
  }
  hijos.push(nodo("nox.toolbar", {}, [boton("Volver a la tabla", { href: href_tabla(spec.id), icon: "fa-arrow-left" })]));
  return pagina(ID_TABLA, `Imprimir · ${spec.name}`, hijos);
}

export async function pagina_impreso(data: Datos, spec: TablaSpec, params: URLSearchParams): Promise<NoxPageDescriptor> {
  const pedido = pedido_de(texto(params.get("t")), spec.id);
  const elegir = (q = "") => href_tabla(spec.id, { modo: "imprimir", ...(q ? { q } : {}) });
  const hijos: NoxUiNode[] = [migas(["Mis tablas", "/internal/herr-tabla"], [spec.name, href_tabla(spec.id)])];
  if (!pedido) {
    hijos.push(
      nodo("nox.empty", { text: "Esta impresión ya no está", description: "Vuelve a elegir qué imprimir." }, [
        boton("Elegir qué imprimir", { href: elegir(), icon: "fa-print" }),
      ]),
    );
    return pagina(ID_TABLA, `Imprimir · ${spec.name}`, hijos);
  }
  const vista = await vista_de_tabla(data, spec);
  const ids = pedido.ids ? new Set(pedido.ids) : null;
  const elegidas = ids ? vista.filas.filter((f) => ids.has(f.id)) : filtrar(spec, vista, pedido.q);
  const filas = elegidas.slice(0, MAX_FILAS);
  const detalle = ids ? "Registros elegidos" : pedido.q ? `Búsqueda: «${pedido.q}»` : "";
  const nombre = pedido.nombre || spec.name;
  const { dibujos, faltan } = await codigos_impresos(columnas_impresas(spec, vista, pedido.completo), filas);
  const hojas = componer(impreso_de(spec, nombre, vista, filas, elegidas.length, detalle, pedido, dibujos), await medida());
  if (faltan) {
    hijos.push(
      nodo("nox.alert", {
        text: `Se dibujan los primeros ${MAX_CODIGOS_IMPRESOS} códigos`,
        description: `Otros ${faltan} salen solo como texto en las columnas que lo enseñan: imprime menos registros para verlos dibujados.`,
      }),
    );
  }
  const resumen = `**${cuantos(filas.length, elegidas.length)}** · ${hojas.length} ${hojas.length === 1 ? "hoja" : "hojas"}`;
  if (elegidas.length > filas.length) {
    hijos.push(
      nodo("nox.alert", {
        text: `Se imprimen los primeros ${MAX_FILAS}`,
        description: `Son ${elegidas.length} registros: para los demás, búscalos o márcalos.`,
      }),
    );
  }
  if (pedido.formato === "pdf") {
    const pdf = await pdf_de(hojas, nombre);
    hijos.push(
      nodo("nox.markdown-view", { content: `${resumen} · PDF listo.` }),
      nodo("nox.html", { html: enlace_descarga(pdf, "application/pdf", nombre_archivo(nombre, "pdf"), "Descargar PDF", "fa-file-pdf") }),
    );
  } else {
    const pngs = await png_de(hojas.slice(0, MAX_HOJAS_PNG));
    const urls = pngs.map((png) => `data:image/png;base64,${Buffer.from(png).toString("base64")}`);
    hijos.push(nodo("nox.markdown-view", { content: `${resumen} · ${pngs.length === 1 ? "Imagen lista" : "Imágenes listas"}.` }));
    if (hojas.length > MAX_HOJAS_PNG) {
      hijos.push(
        nodo("nox.alert", {
          text: `Solo las primeras ${MAX_HOJAS_PNG} hojas en PNG`,
          description: `Son ${hojas.length} hojas: para todas, elige PDF o imprime menos registros.`,
        }),
      );
    }
    const varias = pngs.length > 1;
    hijos.push(
      nodo("nox.html", {
        html: pngs
          .map((png, i) =>
            enlace_descarga(
              png,
              "image/png",
              nombre_archivo(nombre, varias ? `hoja-${i + 1}.png` : "png"),
              varias ? `Descargar hoja ${i + 1}` : "Descargar imagen",
              "fa-file-image",
            ),
          )
          .join(""),
      }),
      nodo("nox.image-viewer", { images: urls, alt: nombre }),
    );
  }
  hijos.push(
    nodo("nox.toolbar", {}, [
      boton("Elegir otros", { href: elegir(pedido.q), icon: "fa-print" }),
      boton("Volver a la tabla", { href: href_tabla(spec.id), icon: "fa-arrow-left" }),
    ]),
  );
  return pagina(ID_TABLA, `Imprimir · ${spec.name}`, hijos);
}

// #endregion

export const herr_tablas_impresion = define_routes({
  /**
   * Guarda qué imprimir: `nombre` del reporte, `formato` (pdf | png), `q` (la
   * búsqueda con que se eligió), `fotos`, `completo` (fijos, calculados y
   * totales; apagado si no viene) y una casilla `r_<id>` por registro. Sin
   * casillas marcadas son todos los que encuentra la búsqueda.
   */
  "POST /herr-tablas/:id/imprimir": async (ctx) => {
    const spec = spec_de_fila(await tabla_activa(ctx, ctx.params.id));
    const body = await ctx.body<Record<string, unknown>>();
    const formato = texto(body.formato) || "pdf";
    if (!Object.hasOwn(FORMATOS, formato)) falla(400, "Elige PDF o PNG", "validation_error");
    const marcados = Object.entries(body)
      .filter(([k, v]) => k.startsWith("r_") && booleano(v))
      .map(([k]) => k.slice(2));
    const t = guardar_pedido({
      tabla_id: spec.id,
      formato: formato as Formato,
      ids: marcados.length ? marcados : null,
      q: texto(body.q),
      nombre: texto(body.nombre).slice(0, 120),
      // Un formulario anterior no manda la casilla: salía con fotos.
      fotos: !("fotos" in body) || booleano(body.fotos),
      completo: booleano(body.completo),
    });
    return { data: { id: spec.id, t } };
  },
});
