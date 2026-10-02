import { define_routes, type KirletCtx, type NoxPageDescriptor, type NoxUiNode } from "@opus-perpetuus/imperium-core-kit";
import { booleano, dia_legible, falla, fecha_hoy, hora_ahora, texto, zona_valida } from "../../lib/comun.ts";
import { spec_de_fila, type Registro, type TablaSpec } from "../../lib/formulas/esquema.ts";
import { pdf_de, png_de, medida } from "../../lib/impresion/archivos.ts";
import { componer, type Impreso } from "../../lib/impresion/composicion.ts";
import { escapar } from "../../lib/markdown/html.ts";
import { ID_TABLA, href_tabla, migas } from "./herr-tablas.disenador.ts";
import { coincidencias, tabla_activa, valor_presentado, vista_de_tabla } from "./herr-tablas.flow.ts";
import { boton, nodo, pagina } from "./herr-tablas.nox.ts";

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
type Pedido = { tabla_id: string; formato: Formato; ids: string[] | null; q: string; nombre: string; vence: number };

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
  if (!q) return vista.filas;
  const si = new Set(coincidencias(spec, vista.filas, vista.etiquetas, q));
  return vista.filas.filter((f) => si.has(f.id));
}

function celdas(vista: Vista, fila: Registro): string[] {
  return vista.columnas.map((c) => valor_presentado(c, fila.valores[c.clave] ?? "", vista.etiquetas));
}

/** Cómo se nombra un registro en la casilla para elegirlo: sus primeras columnas con dato. */
function nombre_de_fila(vista: Vista, fila: Registro): string {
  return celdas(vista, fila).filter(Boolean).slice(0, 3).join(" · ") || "Registro sin datos";
}

/** «3 registros», o «2000 de 5321 registros» si se recortó. */
function cuantos(n: number, de: number): string {
  return `${n}${de > n ? ` de ${de}` : ""} ${de === 1 ? "registro" : "registros"}`;
}

function impreso_de(titulo: string, vista: Vista, filas: Registro[], de: number, detalle: string): Impreso {
  const zona = zona_valida();
  const dia = dia_legible(fecha_hoy(zona));
  return {
    titulo,
    subtitulo: [`Impreso el ${dia} a las ${hora_ahora(zona)}`, detalle].filter(Boolean).join(" · "),
    columnas: vista.columnas.map((c) => ({ titulo: c.etiqueta, derecha: NUMERICOS.has(c.tipo), imagen: c.tipo === "foto" })),
    // Una foto va como su miniatura: en el impreso se dibuja.
    filas: filas.map((f) =>
      vista.columnas.map((c) =>
        c.tipo === "foto" ? (f.miniaturas?.[c.clave] ?? "") : valor_presentado(c, f.valores[c.clave] ?? "", vista.etiquetas),
      ),
    ),
    total: `Total: ${cuantos(filas.length, de)}`,
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
        "Sale con el nombre que le pongas, los títulos de las columnas, las fotos y el total de registros. " +
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
  const hojas = componer(impreso_de(nombre, vista, filas, elegidas.length, detalle), await medida());
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
   * búsqueda con que se eligió) y una casilla `r_<id>` por registro. Sin
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
    });
    return { data: { id: spec.id, t } };
  },
});
