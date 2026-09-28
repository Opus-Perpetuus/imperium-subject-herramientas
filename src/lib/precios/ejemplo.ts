/**
 * Un catálogo de ejemplo para arrancar, con la forma de una pizzería típica.
 *
 * **Nunca se carga solo**: una lista de precios de otro negocio parece
 * capturada, nadie la revisa y el primer pedido sale mal cobrado. Se ofrece
 * por ruta (`POST /herr-menu-categorias/ejemplo`) y se corrige editando filas.
 */
export const CATALOGO_EJEMPLO = {
  /** Nombre → columna de precio del tamaño. */
  categorias: [
    { name: "Sencilla", columna_precio: 1 },
    { name: "Especial", columna_precio: 2 },
    { name: "Premium", columna_precio: 3 },
  ],
  tamanos: [
    // El chico no se parte: no da para dos mitades servibles.
    { name: "Chica", precio_1: 110, precio_2: 130, precio_3: 150, divisible: "1", orden: 1 },
    { name: "Mediana", precio_1: 160, precio_2: 190, precio_3: 220, divisible: "1,2", orden: 2 },
    { name: "Grande", precio_1: 210, precio_2: 250, precio_3: 290, divisible: "1,2,4", orden: 3 },
    { name: "Familiar", precio_1: 260, precio_2: 310, precio_3: 360, divisible: "1,2,4", orden: 4 },
  ],
  /** Nombre → índice de categoría (sobre `categorias`). */
  productos: [
    { name: "Hawaiana", categoria: 0 },
    { name: "Pepperoni", categoria: 0 },
    { name: "Queso", categoria: 0 },
    { name: "Mexicana", categoria: 1 },
    { name: "Carnes frías", categoria: 1 },
    { name: "Vegetariana", categoria: 1 },
    { name: "Suprema", categoria: 2 },
    { name: "Tres carnes", categoria: 2 },
  ],
  /** Precio único: no varía por tamaño. */
  extras: [{ name: "Orilla rellena", precio: 45 }],
  /** Una variante es otra fila del mismo grupo (`name`). */
  complementos: [
    { name: "Alitas", variante: "6 pzas", precio: 95 },
    { name: "Alitas", variante: "12 pzas", precio: 175 },
    { name: "Boneless", variante: "200 g", precio: 110 },
    { name: "Refresco", variante: "600 ml", precio: 25 },
    { name: "Refresco", variante: "2 L", precio: 45 },
  ],
} as const;
