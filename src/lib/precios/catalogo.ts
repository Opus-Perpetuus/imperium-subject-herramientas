import type { DomainRow, KirletCtx } from "@opus-perpetuus/imperium-core-kit";
import { filas_de, numero, texto } from "../comun.ts";

/**
 * El catálogo de precios leído de las seis tablas `herr_menu_*`, resuelto a
 * mapas planos por id de fila para que el motor no toque la base.
 *
 * Modelo **tamaño × categoría**: cada producto pertenece a una categoría y
 * cada tamaño tiene un precio por columna (`precio_1..3`); la categoría dice
 * de qué columna sale su precio. Un precio vacío en un tamaño significa «no
 * se vende en ese tamaño», nunca cero.
 */

export const COLUMNAS_DE_PRECIO = [1, 2, 3] as const;

export type Tamano = {
  id: string;
  nombre: string;
  /** categoria_id → precio. */
  precios: Record<string, number>;
  /** En cuántas partes admite dividirse (`1,2,4`). */
  divisible: number[];
  orden: number | null;
};

export type Producto = { id: string; nombre: string; categoria_id: string };
export type Extra = { id: string; nombre: string; precio: number };
export type Complemento = { id: string; nombre: string; variante: string; precio: number };
export type Promo = { id: string; nombre: string; descuento_pesos: number; descuento_pct: number };

export type Catalogo = {
  tamanos: Record<string, Tamano>;
  productos: Record<string, Producto>;
  extras: Record<string, Extra>;
  complementos: Record<string, Complemento>;
  promos: Record<string, Promo>;
  /** Lo mal capturado en las tablas, en llano; no depende de ningún pedido. */
  problemas_de_captura: string[];
};

export type FilasCatalogo = {
  categorias: DomainRow[];
  tamanos: DomainRow[];
  productos: DomainRow[];
  extras: DomainRow[];
  complementos: DomainRow[];
  promos: DomainRow[];
};

/** Sin marca explícita se asume activo: crear la fila ya es intención. */
function activa(fila: DomainRow, campo: string): boolean {
  return fila.is_active !== false && fila[campo] !== false;
}

/** «1,2,4» → [1, 2, 4]; sin nada capturado, al menos entera. */
export function parse_divisiones(raw: unknown): number[] {
  const partes = texto(raw)
    .split(",")
    .map((p) => Number(p.trim()))
    .filter((n) => Number.isInteger(n) && n >= 1 && n <= 4);
  const unicas = [...new Set(partes)].sort((a, b) => a - b);
  return unicas.length ? unicas : [1];
}

/** «A», «B» y «C». */
function enumerar(nombres: string[]): string {
  const comillas = nombres.map((n) => `«${n}»`);
  if (comillas.length <= 1) return comillas[0] ?? "";
  return `${comillas.slice(0, -1).join(", ")} y ${comillas[comillas.length - 1]}`;
}

export function catalogo_desde_filas(filas: FilasCatalogo): Catalogo {
  const problemas: string[] = [];

  const columna_por_categoria = new Map<string, number>();
  const nombres_por_columna = new Map<number, string[]>();
  for (const cat of filas.categorias.filter((c) => c.is_active !== false)) {
    const nombre = texto(cat.name) || "Una categoría";
    const columna = numero(cat.columna_precio);
    if (columna == null) {
      problemas.push(
        `«${nombre}» no tiene columna de precio: elígela en Categorías o sus productos no se pueden cotizar.`,
      );
    } else if (!(COLUMNAS_DE_PRECIO as readonly number[]).includes(columna)) {
      problemas.push(
        `«${nombre}» apunta a la columna ${columna} y los tamaños solo llegan a la ${COLUMNAS_DE_PRECIO[COLUMNAS_DE_PRECIO.length - 1]}: sus productos no se pueden cotizar.`,
      );
    } else {
      columna_por_categoria.set(String(cat.id), columna);
      nombres_por_columna.set(columna, [...(nombres_por_columna.get(columna) ?? []), nombre]);
    }
  }
  for (const [columna, nombres] of nombres_por_columna) {
    if (nombres.length > 1) {
      problemas.push(`${enumerar(nombres)} comparten la columna ${columna}: se cobran al mismo precio.`);
    }
  }

  // Una categoría que se llama igual que un tamaño casi siempre es un tamaño
  // capturado en la tabla equivocada: en el pedido se eligen tamaños.
  const nombres_de_tamanos = new Set(
    filas.tamanos.map((t) => texto(t.name).toLowerCase()).filter(Boolean),
  );
  const confundidas = filas.categorias
    .map((c) => texto(c.name))
    .filter((n) => n && nombres_de_tamanos.has(n.toLowerCase()));
  if (confundidas.length) {
    problemas.push(
      `${enumerar(confundidas)} ${confundidas.length === 1 ? "está" : "están"} en Categorías y también en Tamaños. En el pedido se eligen los tamaños; las categorías solo son los escalones de precio.`,
    );
  }

  const tamanos: Record<string, Tamano> = {};
  for (const fila of filas.tamanos.filter((t) => t.is_active !== false)) {
    const precios: Record<string, number> = {};
    for (const [categoria_id, columna] of columna_por_categoria) {
      const precio = numero(fila[`precio_${columna}`]);
      if (precio != null) precios[categoria_id] = precio;
    }
    tamanos[String(fila.id)] = {
      id: String(fila.id),
      nombre: texto(fila.name),
      precios,
      divisible: parse_divisiones(fila.divisible),
      orden: numero(fila.orden),
    };
  }

  const productos: Record<string, Producto> = {};
  for (const fila of filas.productos.filter((p) => activa(p, "activo"))) {
    productos[String(fila.id)] = {
      id: String(fila.id),
      nombre: texto(fila.name),
      categoria_id: texto(fila.categoria_id),
    };
  }

  const extras: Record<string, Extra> = {};
  for (const fila of filas.extras.filter((e) => activa(e, "activo"))) {
    extras[String(fila.id)] = { id: String(fila.id), nombre: texto(fila.name), precio: numero(fila.precio) ?? 0 };
  }

  const complementos: Record<string, Complemento> = {};
  for (const fila of filas.complementos.filter((c) => activa(c, "activo"))) {
    complementos[String(fila.id)] = {
      id: String(fila.id),
      nombre: texto(fila.name),
      variante: texto(fila.variante),
      precio: numero(fila.precio) ?? 0,
    };
  }

  const promos: Record<string, Promo> = {};
  for (const fila of filas.promos.filter((p) => activa(p, "activa"))) {
    promos[String(fila.id)] = {
      id: String(fila.id),
      nombre: texto(fila.name),
      descuento_pesos: numero(fila.descuento_pesos) ?? 0,
      descuento_pct: numero(fila.descuento_pct) ?? 0,
    };
  }

  return { tamanos, productos, extras, complementos, promos, problemas_de_captura: problemas };
}

/**
 * El catálogo leído de las tablas, en cada consulta: corregir un precio se
 * nota en la siguiente captura, que es lo que hace confiable el automático.
 */
export async function catalogo_de(ctx: Pick<KirletCtx, "data">): Promise<Catalogo> {
  const [categorias, tamanos, productos, extras, complementos, promos] = await Promise.all([
    filas_de(ctx, "herr_menu_categorias", { is_active: true }),
    filas_de(ctx, "herr_menu_tamanos", { is_active: true }),
    filas_de(ctx, "herr_menu_productos", { is_active: true }),
    filas_de(ctx, "herr_menu_extras", { is_active: true }),
    filas_de(ctx, "herr_menu_complementos", { is_active: true }),
    filas_de(ctx, "herr_menu_promos", { is_active: true }),
  ]);
  return catalogo_desde_filas({ categorias, tamanos, productos, extras, complementos, promos });
}
