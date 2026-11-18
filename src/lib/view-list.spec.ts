import { describe, expect, test } from "bun:test";
import { view_list_de_tabla } from "./view-list.ts";

describe("view_list_de_tabla (#255: view-list siempre, nox.table solo de respaldo)", () => {
  const tabla = {
    component: "nox.table",
    text: "Sin órdenes",
    props: {
      columns: [{ key: "texto", label: "Orden" }, { key: "foto", label: "Foto", image_key: "foto", image_full_key: "foto_full" }],
      rows: [{ texto: "a" }, { texto: "b", _id: "x9", _href: "/internal/x" }],
    },
  };

  test("pinta nox.view-list con las mismas columnas, filas con _id y la tabla de respaldo", () => {
    const nodo = view_list_de_tabla(tabla, { anchor: "ancla", search: "Buscar" });
    expect(nodo.component).toBe("nox.view-list");
    expect(nodo.props).toMatchObject({
      anchor: "ancla",
      search: "Buscar",
      empty: "Sin órdenes",
      columns: [
        { key: "texto", label: "Orden" },
        { key: "foto", label: "Foto", cells: [{ kind: "image", key: "foto", full_key: "foto_full" }] },
      ],
      rows: [
        { texto: "a", _id: "1" },
        { texto: "b", _id: "x9", _href: "/internal/x" },
      ],
    });
    expect(nodo.children).toEqual([tabla]);
  });

  test("un respaldo propio reemplaza a la tabla", () => {
    const respaldo = [{ component: "nox.paginator", props: {} }];
    expect(view_list_de_tabla(tabla, { anchor: "a" }, respaldo).children).toEqual(respaldo);
  });
});
