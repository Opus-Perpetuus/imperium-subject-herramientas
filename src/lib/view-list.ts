import { nox_view_list, type NoxUiNode, type NoxViewListColumn, type NoxViewListProps } from "@opus-perpetuus/imperium-core-kit";

/**
 * Las tablas de Herramientas se pintan con el view-list de Imperium (regla de
 * UI: view-list siempre, nunca `nox.table` propio). `nox.table` sigue solo
 * como respaldo para un lanzador que aún no conoce `nox.view-list`.
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

/**
 * `nox.view-list` (paginado y buscado en el navegador) a partir de un nodo
 * `nox.table`, que queda de respaldo. Cada fila lleva `_id` (el suyo o su
 * posición); `_href` se respeta para abrirla.
 */
export function view_list_de_tabla(
  tabla: NoxUiNode,
  extra: Omit<Partial<NoxViewListProps>, "columns" | "rows" | "source"> & { anchor: string },
  respaldo: NoxUiNode[] = [tabla],
): NoxUiNode {
  const props = (tabla.props ?? {}) as Record<string, unknown>;
  const columnas = (Array.isArray(props.columns) ? props.columns : []) as Record<string, unknown>[];
  const filas = (Array.isArray(props.rows) ? props.rows : []) as Record<string, unknown>[];
  const vacio = texto_de(props.text) || texto_de(tabla.text);
  return nox_view_list(
    {
      columns: columnas.map(columna_view_list),
      rows: filas.map((fila, i) => ({ ...fila, _id: String(fila._id ?? fila.id ?? i + 1) })),
      ...(vacio ? { empty: vacio } : {}),
      ...extra,
    },
    respaldo,
  );
}
