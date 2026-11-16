import {
  define_routes,
  nox_view_list,
  nox_view_list_page,
  nox_view_list_query,
  type NoxUiNode,
  type NoxViewListColumn,
  type NoxViewListProps,
} from "@opus-perpetuus/imperium-core-kit";
import { puede } from "../../lib/comun.ts";
import { spec_de_fila, type CampoSpec, type TablaSpec } from "../../lib/formulas/esquema.ts";
import { FORMATOS_NUCLEO } from "../../lib/formulas/escaner.ts";
import { href_registro } from "./herr-tablas.disenador.ts";
import { columnas_de_registros, filtrar_filas, fila_de_registros, tabla_activa, vista_de_tabla, POR_PAGINA } from "./herr-tablas.flow.ts";

/**
 * «Ver tabla» con el view-list de Imperium: las mismas columnas de la lista
 * (`columnas_de_registros`), con fotos y códigos como celdas compuestas, y la
 * página que pide el navegador (`GET …/vista`), buscada y paginada aquí.
 */

const texto_de = (v: unknown) => (typeof v === "string" ? v : "");

/** Una columna de `nox.table` (con `image_key` / `code_display`) a columna de `nox.view-list`. */
export function columna_view_list(col: Record<string, unknown>): NoxViewListColumn {
  const key = texto_de(col.key);
  const label = texto_de(col.label) || key;
  if (col.image_key) {
    return { key, label, cells: [{ kind: "image", key: texto_de(col.image_key), full_key: texto_de(col.image_full_key) }] };
  }
  if (col.code_display) {
    return {
      key,
      label,
      cells: [
        {
          kind: "code",
          display: col.code_display === "codigo" ? "codigo" : "ambos",
          meta_key: texto_de(col.code_meta_key),
          values_key: texto_de(col.code_values_key),
          ...(col.code_format ? { format: texto_de(col.code_format) } : {}),
        },
      ],
    };
  }
  return { key, label };
}

export function columnas_view_list(columnas: CampoSpec[]): NoxViewListColumn[] {
  return columnas_de_registros(columnas).map(columna_view_list);
}

/** El escáner de la lista: busca el código leído y, si es un solo registro, lo abre. */
function escaner_de_lista(spec: TablaSpec): NoxViewListProps["scanner"] | undefined {
  // Con «Al escanear» la tabla ya tiene su escáner (abre la captura o aplica reglas).
  if (spec.escaneo) return undefined;
  const codigos = spec.campos.filter((c) => c.tipo === "codigo");
  if (!codigos.length) return undefined;
  // Los formatos de todas las columnas «Código»; si una lee cualquiera, el escáner también.
  const elegidos = codigos.map((c) => c.escaner?.formatos ?? "todos");
  const formatos = elegidos.includes("todos") ? [] : [...new Set(elegidos.flatMap((f) => FORMATOS_NUCLEO[f as Exclude<typeof f, "todos">] ?? []))];
  return {
    label: "Buscar por código",
    help: `Lee un código: se busca en «${codigos.map((c) => c.etiqueta).join("», «")}» y, si es un solo registro, se abre.`,
    config: { allow_manual: true, ...(formatos.length ? { formats: formatos } : {}) },
    open_single: true,
  };
}

/**
 * El `nox.view-list` de «Ver tabla». `respaldo` son los nodos de antes
 * (buscador + `nox.table` + paginador) para un lanzador sin `nox.view-list`.
 */
export function lista_de_registros(spec: TablaSpec, columnas: CampoSpec[], params: URLSearchParams, respaldo: NoxUiNode[]): NoxUiNode {
  const scanner = escaner_de_lista(spec);
  return nox_view_list(
    {
      columns: columnas_view_list(columnas),
      source: `api://herr-tablas/${spec.id}/vista`,
      page_size: POR_PAGINA,
      q: (params.get("q") ?? "").trim(),
      page: Math.max(1, Math.trunc(Number(params.get("page"))) || 1),
      search: "Buscar en los registros",
      ...(scanner ? { scanner } : {}),
      title_key: columnas[0]?.clave ?? "",
      empty: "Sin registros",
      anchor: "herr-tabla-registros",
    },
    respaldo,
  );
}

export const herr_tablas_lista = define_routes({
  "GET /herr-tablas/:id/vista": async (ctx) => {
    const spec = spec_de_fila(await tabla_activa(ctx, ctx.params.id));
    const { filas, columnas, presentacion } = await vista_de_tabla(ctx.data, spec);
    const { q, page, page_size } = nox_view_list_query(ctx.query);
    const abrir = puede(ctx.identity ?? null, "herr-registros", "create");
    const { data, total } = nox_view_list_page(filtrar_filas(spec, filas, presentacion, q), page, page_size);
    return {
      data: data.map((f) => fila_de_registros(columnas, f, presentacion, abrir ? (r) => href_registro(spec.id, r.id) : undefined)),
      total,
    };
  },
});
