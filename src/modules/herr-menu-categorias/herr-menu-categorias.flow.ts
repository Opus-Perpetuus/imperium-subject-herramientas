import { define_routes, new_id, now_iso, type DomainRow, type KirletCtx } from "@opus-perpetuus/imperium-core-kit";
import { campo_busqueda, falla, filas_de } from "../../lib/comun.ts";
import { CATALOGO_EJEMPLO } from "../../lib/precios/ejemplo.ts";

function fila(ctx: KirletCtx, prefijo: string, name: string, extra: DomainRow): DomainRow {
  const ts = now_iso();
  return {
    id: new_id(prefijo),
    name,
    description: "",
    is_active: true,
    created_by: ctx.actor,
    search_field: campo_busqueda(name, extra.variante),
    ...extra,
    created_at: ts,
    updated_at: ts,
  };
}

export const herr_menu_categorias_flow = define_routes({
  /** Carga el catálogo de ejemplo, una sola vez: con categorías ya capturadas no toca nada. */
  "POST /herr-menu-categorias/ejemplo": async (ctx) => {
    const existentes = await filas_de(ctx, "herr_menu_categorias", { is_active: true });
    if (existentes.length) falla(409, "Ya hay categorías capturadas; el ejemplo no se carga encima", "conflict");

    const categorias = CATALOGO_EJEMPLO.categorias.map((c) =>
      fila(ctx, "mcat", c.name, { columna_precio: c.columna_precio }),
    );
    const tamanos = CATALOGO_EJEMPLO.tamanos.map((t) =>
      fila(ctx, "mtam", t.name, {
        precio_1: t.precio_1,
        precio_2: t.precio_2,
        precio_3: t.precio_3,
        divisible: t.divisible,
        orden: t.orden,
      }),
    );
    const productos = CATALOGO_EJEMPLO.productos.map((p) =>
      fila(ctx, "mprod", p.name, { categoria_id: categorias[p.categoria]!.id, ingredientes: "", activo: true }),
    );
    const extras = CATALOGO_EJEMPLO.extras.map((e) => fila(ctx, "mext", e.name, { precio: e.precio, activo: true }));
    const complementos = CATALOGO_EJEMPLO.complementos.map((c) =>
      fila(ctx, "mcomp", c.name, { variante: c.variante, precio: c.precio, activo: true }),
    );

    await ctx.data.batch([
      ...categorias.map((row) => ({ op: "insert", table: "herr_menu_categorias", row })),
      ...tamanos.map((row) => ({ op: "insert", table: "herr_menu_tamanos", row })),
      ...productos.map((row) => ({ op: "insert", table: "herr_menu_productos", row })),
      ...extras.map((row) => ({ op: "insert", table: "herr_menu_extras", row })),
      ...complementos.map((row) => ({ op: "insert", table: "herr_menu_complementos", row })),
    ]);
    return ctx.created({
      categorias: categorias.length,
      tamanos: tamanos.length,
      productos: productos.length,
      extras: extras.length,
      complementos: complementos.length,
    });
  },
});
