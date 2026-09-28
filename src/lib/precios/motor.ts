import { centavos, texto } from "../comun.ts";
import type { Catalogo } from "./catalogo.ts";

/**
 * El precio de un pedido a partir del catálogo. Puro y sin base: la
 * aritmética que decide cuánto se cobra en la puerta se prueba entera aquí.
 */

export type LineaProducto = {
  tipo: "producto";
  cantidad?: number;
  tamano_id: string;
  /** Ids de producto, una por parte (una sola = entero). */
  partes: string[];
  extras?: string[];
  /** Describen qué lleva; no cobran. */
  ingredientes?: string[];
  nota?: string;
};

export type LineaComplemento = {
  tipo: "complemento";
  cantidad?: number;
  complemento_id: string;
  nota?: string;
};

export type Linea = LineaProducto | LineaComplemento;

export type Cotizacion = {
  subtotal: number;
  descuento: number;
  total: number;
  lineas: { descripcion: string; precio: number; cantidad: number }[];
  /** La prosa del pedido: lo que se guarda en `productos`, se busca y se lee. */
  productos: string;
  problemas: string[];
};

function cantidad_de(linea: Linea): number {
  const n = Number(linea.cantidad ?? 1);
  return Number.isInteger(n) && n > 0 ? n : 1;
}

/**
 * Lee `productos_json` como se guardó, sin lanzar nunca: vive en una columna
 * que una persona puede editar, y si se rompe cuesta volver a capturar, no
 * dinero (el precio ya quedó congelado en `cobrar`).
 */
export function lineas_desde(raw: unknown): { lineas: Linea[]; promo_id: string | null } {
  let valor = raw;
  if (typeof valor === "string") {
    try {
      valor = JSON.parse(valor);
    } catch {
      return { lineas: [], promo_id: null };
    }
  }
  const objeto = valor && typeof valor === "object" && !Array.isArray(valor)
    ? (valor as Record<string, unknown>)
    : { lineas: valor };
  const lineas = Array.isArray(objeto.lineas)
    ? objeto.lineas.filter(
        (l): l is Linea =>
          !!l && typeof l === "object" &&
          ((l as Linea).tipo === "producto" || (l as Linea).tipo === "complemento"),
      )
    : [];
  return { lineas, promo_id: texto(objeto.promo_id) || null };
}

/**
 * Precio unitario de un producto: **el máximo de los precios de sus partes**
 * más los extras. Máximo de precios y no «la categoría más alta», para que un
 * catálogo con las categorías en otro orden no elija el precio equivocado.
 */
function precio_producto(linea: LineaProducto, catalogo: Catalogo, problemas: string[]): number {
  const tamano = catalogo.tamanos[linea.tamano_id];
  if (!tamano) {
    problemas.push(`Sin precio: no hay un tamaño «${linea.tamano_id}» en el catálogo`);
    return 0;
  }
  const partes = linea.partes?.length ? linea.partes : [""];
  if (partes.length > 1 && !tamano.divisible.includes(partes.length)) {
    problemas.push(`«${tamano.nombre}» no admite dividirse en ${partes.length}`);
  }
  const precios: number[] = [];
  for (const parte_id of partes) {
    const producto = catalogo.productos[parte_id];
    if (!producto) {
      problemas.push(`Sin precio: no hay un producto «${parte_id}» en el catálogo`);
      continue;
    }
    const precio = tamano.precios[producto.categoria_id];
    if (precio == null) {
      problemas.push(`Sin precio para ${tamano.nombre} · ${producto.nombre}`);
      continue;
    }
    precios.push(precio);
  }
  const base = precios.length ? Math.max(...precios) : 0;
  let extras = 0;
  for (const id of linea.extras ?? []) {
    const extra = catalogo.extras[id];
    if (!extra) {
      problemas.push("Sin precio para un extra del pedido");
      continue;
    }
    extras += extra.precio;
  }
  return base + extras;
}

function describir_producto(linea: LineaProducto, catalogo: Catalogo): string {
  const tamano = catalogo.tamanos[linea.tamano_id]?.nombre ?? linea.tamano_id;
  const partes = (linea.partes ?? []).map((id) => catalogo.productos[id]?.nombre ?? id);
  const cuerpo =
    partes.length === 0 ? tamano
    : partes.length === 1 ? `${tamano} ${partes[0]}`
    : `${tamano} dividida: ${partes.join(" / ")}`;
  const extras = (linea.extras ?? [])
    .map((id) => catalogo.extras[id]?.nombre.toLowerCase())
    .filter((n): n is string => !!n);
  const anadidos = [...extras, ...(linea.ingredientes ?? []).map((i) => texto(i).toLowerCase())].filter(Boolean);
  const con = anadidos.length ? ` con ${anadidos.join(", ")}` : "";
  const cantidad = cantidad_de(linea);
  const prefijo = cantidad > 1 ? `${cantidad} ` : "";
  const nota = texto(linea.nota) ? ` (${texto(linea.nota)})` : "";
  return `${prefijo}${cuerpo}${con}${nota}`;
}

function describir_complemento(linea: LineaComplemento, catalogo: Catalogo): string {
  const complemento = catalogo.complementos[linea.complemento_id];
  const nombre = complemento
    ? [complemento.nombre, complemento.variante].filter(Boolean).join(" ")
    : linea.complemento_id;
  const cantidad = cantidad_de(linea);
  const prefijo = cantidad > 1 ? `${cantidad} ` : "";
  const nota = texto(linea.nota) ? ` (${texto(linea.nota)})` : "";
  return `${prefijo}${nombre}${nota}`;
}

/** Una línea por renglón, como la diría una persona. */
export function describir(lineas: Linea[], catalogo: Catalogo): string {
  return lineas
    .map((l) => (l.tipo === "producto" ? describir_producto(l, catalogo) : describir_complemento(l, catalogo)))
    .join("\n");
}

export function cotizar(lineas: Linea[], catalogo: Catalogo, promo_id?: string | null): Cotizacion {
  const problemas: string[] = [];
  const detalle: Cotizacion["lineas"] = [];
  let subtotal = 0;

  for (const linea of lineas) {
    const cantidad = cantidad_de(linea);
    let precio = 0;
    if (linea.tipo === "producto") {
      precio = precio_producto(linea, catalogo, problemas);
      detalle.push({ descripcion: describir_producto(linea, catalogo), precio, cantidad });
    } else {
      const complemento = catalogo.complementos[linea.complemento_id];
      if (!complemento) problemas.push("Sin precio para un complemento del pedido");
      precio = complemento?.precio ?? 0;
      detalle.push({ descripcion: describir_complemento(linea, catalogo), precio, cantidad });
    }
    subtotal += precio * cantidad;
  }

  const promo = promo_id ? catalogo.promos[promo_id] : undefined;
  if (promo_id && !promo) problemas.push("La promoción no existe o está inactiva");
  // Pesos primero y porcentaje después, sobre lo que de verdad se va a cobrar.
  const tras_pesos = Math.max(0, subtotal - (promo?.descuento_pesos ?? 0));
  // Redondeado aquí y no al pintar: el total acaba en «A cobrar» y se liquida.
  const total = centavos(Math.max(0, tras_pesos * (1 - (promo?.descuento_pct ?? 0) / 100)));
  const subtotal_c = centavos(subtotal);

  return {
    subtotal: subtotal_c,
    // Sobre los ya redondeados, para que subtotal − descuento cuadre al centavo.
    descuento: centavos(subtotal_c - total),
    total,
    lineas: detalle,
    productos: detalle.map((l) => l.descripcion).join("\n"),
    problemas,
  };
}
