import { describe, expect, test } from "bun:test";
import type { DomainRow } from "@opus-perpetuus/imperium-core-kit";
import { catalogo_desde_filas, parse_divisiones, type Catalogo } from "./catalogo.ts";
import { cotizar, describir, lineas_desde, type Linea } from "./motor.ts";

/**
 * El modelo es tamaño × categoría y la regla del producto dividido es «se
 * cobra la parte más cara», implementada como el máximo de los precios.
 */
const catalogo: Catalogo = {
  tamanos: {
    grande: { id: "grande", nombre: "Grande", precios: { sencilla: 210, especial: 250, premium: 290 }, divisible: [1, 2, 4], orden: 3 },
    familiar: { id: "familiar", nombre: "Familiar", precios: { sencilla: 260, especial: 310, premium: 360 }, divisible: [1, 2, 4], orden: 4 },
    chica: { id: "chica", nombre: "Chica", precios: { sencilla: 110, especial: 130, premium: 150 }, divisible: [1], orden: 1 },
  },
  productos: {
    hawaiana: { id: "hawaiana", nombre: "Hawaiana", categoria_id: "sencilla" },
    mexicana: { id: "mexicana", nombre: "Mexicana", categoria_id: "especial" },
    suprema: { id: "suprema", nombre: "Suprema", categoria_id: "premium" },
  },
  extras: { orilla: { id: "orilla", nombre: "Orilla rellena", precio: 45 } },
  complementos: {
    alitas6: { id: "alitas6", nombre: "Alitas", variante: "6 pzas", precio: 95 },
    refresco2l: { id: "refresco2l", nombre: "Refresco", variante: "2 L", precio: 45 },
  },
  promos: {
    martes: { id: "martes", nombre: "Martes 2x1", descuento_pesos: 0, descuento_pct: 50 },
    cupon: { id: "cupon", nombre: "Cupón $30", descuento_pesos: 30, descuento_pct: 0 },
    gordo: { id: "gordo", nombre: "Cortesía", descuento_pesos: 500, descuento_pct: 0 },
    treinta: { id: "treinta", nombre: "30 %", descuento_pesos: 0, descuento_pct: 30 },
  },
  problemas_de_captura: [],
};

function producto(partes: string[], opts: { tamano?: string; orilla?: boolean; cantidad?: number } = {}): Linea {
  return {
    tipo: "producto",
    tamano_id: opts.tamano ?? "grande",
    partes,
    extras: opts.orilla ? ["orilla"] : [],
    cantidad: opts.cantidad,
  };
}

describe("cotizar", () => {
  test("un producto entero cuesta lo de su categoría", () => {
    const q = cotizar([producto(["hawaiana"])], catalogo);
    expect(q.total).toBe(210);
    expect(q.problemas).toEqual([]);
    expect(cotizar([producto(["suprema"])], catalogo).total).toBe(290);
  });

  test("dividido: manda la parte más cara, en cualquier orden y en cuartos", () => {
    expect(cotizar([producto(["hawaiana", "mexicana"])], catalogo).total).toBe(250);
    expect(cotizar([producto(["hawaiana", "mexicana"], { orilla: true })], catalogo).total).toBe(295);
    expect(cotizar([producto(["suprema", "hawaiana"])], catalogo).total).toBe(
      cotizar([producto(["hawaiana", "suprema"])], catalogo).total,
    );
    expect(cotizar([producto(["hawaiana", "hawaiana", "mexicana", "suprema"])], catalogo).total).toBe(290);
  });

  test("partir un tamaño que no admite división avisa y cobra la más cara", () => {
    const q = cotizar([producto(["hawaiana", "mexicana"], { tamano: "chica" })], catalogo);
    expect(q.problemas.some((p) => p.includes("Chica"))).toBe(true);
    expect(q.total).toBe(130);
  });

  test("los extras cuestan lo mismo en cualquier tamaño y los complementos suman por cantidad", () => {
    expect(cotizar([producto(["hawaiana"], { orilla: true })], catalogo).total).toBe(255);
    expect(cotizar([producto(["hawaiana"], { tamano: "chica", orilla: true })], catalogo).total).toBe(155);
    const q = cotizar(
      [
        producto(["hawaiana"]),
        { tipo: "complemento", complemento_id: "alitas6", cantidad: 2 },
        { tipo: "complemento", complemento_id: "refresco2l" },
      ],
      catalogo,
    );
    expect(q.total).toBe(210 + 190 + 45);
    expect(q.lineas[1]).toEqual({ descripcion: "2 Alitas 6 pzas", precio: 95, cantidad: 2 });
  });

  test("los ingredientes sueltos describen pero no cobran", () => {
    const q = cotizar(
      [{ tipo: "producto", tamano_id: "grande", partes: ["hawaiana"], ingredientes: ["Doble queso", "Piña extra"] }],
      catalogo,
    );
    expect(q.total).toBe(210);
    expect(q.productos).toBe("Grande Hawaiana con doble queso, piña extra");
  });

  test("promos: pesos primero, porcentaje después, nunca negativo", () => {
    expect(cotizar([producto(["hawaiana"])], catalogo, "cupon").total).toBe(180);
    expect(cotizar([producto(["hawaiana"])], catalogo, "martes").total).toBe(105);
    const chico = cotizar([{ tipo: "complemento", complemento_id: "refresco2l" }], catalogo, "gordo");
    expect(chico.total).toBe(0);
    expect(chico.descuento).toBe(45);
  });

  test("un descuento porcentual devuelve dinero redondeado a centavos", () => {
    // 360 × 0.7 = 251.99999999999997 en coma flotante: eso NO se cobra.
    const q = cotizar([producto(["suprema"], { tamano: "familiar" })], catalogo, "treinta");
    expect(q.total).toBe(252);
    expect(q.descuento).toBe(108);
    expect(q.subtotal).toBe(360);
    for (let precio = 100; precio <= 1000; precio += 5) {
      for (const pct of [5, 10, 15, 20, 25, 30, 33, 40, 45, 50]) {
        const cat: Catalogo = {
          ...catalogo,
          tamanos: { x: { id: "x", nombre: "X", precios: { sencilla: precio }, divisible: [1], orden: null } },
          promos: { p: { id: "p", nombre: "P", descuento_pesos: 0, descuento_pct: pct } },
        };
        const total = cotizar([producto(["hawaiana"], { tamano: "x" })], cat, "p").total;
        expect(Math.round(total * 100) / 100).toBe(total);
      }
    }
  });

  test("catálogo incompleto: avisar, nunca cobrar de menos en silencio", () => {
    const q = cotizar([producto(["hawaiana"], { tamano: "gigante" })], catalogo);
    expect(q.total).toBe(0);
    expect(q.problemas.length).toBeGreaterThan(0);

    const sin_precio: Catalogo = {
      ...catalogo,
      tamanos: { ...catalogo.tamanos, familiar: { ...catalogo.tamanos.familiar!, precios: { sencilla: 260 } } },
    };
    const r = cotizar([producto(["suprema"], { tamano: "familiar" })], sin_precio);
    expect(r.problemas.some((p) => p.includes("Familiar") && p.includes("Suprema"))).toBe(true);
    expect(cotizar([producto(["hawaiana"])], catalogo, "no-existe").problemas.length).toBe(1);
  });

  test("un pedido vacío cuesta cero y no es un error", () => {
    const q = cotizar([], catalogo);
    expect(q.total).toBe(0);
    expect(q.problemas).toEqual([]);
    expect(q.productos).toBe("");
  });
});

describe("describir", () => {
  test("se lee como lo diría una persona", () => {
    const texto = describir(
      [producto(["hawaiana", "mexicana"], { orilla: true }), { tipo: "complemento", complemento_id: "alitas6", cantidad: 2, nota: "sin salsa" }],
      catalogo,
    );
    expect(texto).toBe("Grande dividida: Hawaiana / Mexicana con orilla rellena\n2 Alitas 6 pzas (sin salsa)");
  });
});

describe("lineas_desde", () => {
  test("acepta objeto, arreglo y texto JSON; lo roto queda vacío", () => {
    expect(lineas_desde({ lineas: [producto(["hawaiana"])], promo_id: "cupon" })).toEqual({
      lineas: [producto(["hawaiana"])],
      promo_id: "cupon",
    });
    expect(lineas_desde([producto(["hawaiana"])]).lineas.length).toBe(1);
    expect(lineas_desde(JSON.stringify({ lineas: [{ tipo: "complemento", complemento_id: "x" }] })).lineas.length).toBe(1);
    expect(lineas_desde("{no json")).toEqual({ lineas: [], promo_id: null });
    expect(lineas_desde({ lineas: [{ tipo: "otro" }, null, 3] }).lineas).toEqual([]);
    expect(lineas_desde(null).lineas).toEqual([]);
  });
});

describe("catalogo_desde_filas", () => {
  const categorias = [
    { id: "cat-1", name: "Sencilla", columna_precio: 1 },
    { id: "cat-2", name: "Especial", columna_precio: 2 },
    { id: "cat-3", name: "Premium", columna_precio: 3 },
  ];
  const tamanos = [
    { id: "tam-g", name: "Grande", precio_1: 210, precio_2: 250, precio_3: 290, divisible: "1,2,4" },
    { id: "tam-c", name: "Chica", precio_1: "110", precio_2: null, precio_3: "", divisible: "1" },
  ];
  const productos = [
    { id: "esp-h", name: "Hawaiana", categoria_id: "cat-1", activo: true },
    { id: "esp-m", name: "Mexicana", categoria_id: "cat-2" },
    { id: "esp-vieja", name: "Descatalogada", categoria_id: "cat-1", activo: false },
    { id: "esp-borrada", name: "Borrada", categoria_id: "cat-1", is_active: false },
  ];
  const extras = [{ id: "ext-o", name: "Orilla rellena", precio: 45 }];
  const complementos = [{ id: "com-a6", name: "Alitas", variante: "6 pzas", precio: "95" }];
  const promos = [{ id: "promo-1", name: "Cupón", descuento_pesos: 30, activa: true }];
  const leer = (cats: DomainRow[] = categorias) =>
    catalogo_desde_filas({ categorias: cats, tamanos, productos, extras, complementos, promos });

  test("cada categoría lee su columna; una columna vacía no es cero", () => {
    const cat = leer();
    expect(cat.tamanos["tam-g"]!.precios).toEqual({ "cat-1": 210, "cat-2": 250, "cat-3": 290 });
    expect(cat.tamanos["tam-c"]!.precios).toEqual({ "cat-1": 110 });
    expect(cat.tamanos["tam-g"]!.divisible).toEqual([1, 2, 4]);
    expect(cat.complementos["com-a6"]!.precio).toBe(95);
    expect(cat.promos["promo-1"]!.descuento_pct).toBe(0);
    expect(cat.problemas_de_captura).toEqual([]);
  });

  test("lo desactivado o borrado no se ofrece; sin marca se asume activo", () => {
    const cat = leer();
    expect(Object.keys(cat.productos).sort()).toEqual(["esp-h", "esp-m"]);
  });

  test("una columna inexistente, repetida o una categoría con nombre de tamaño se reportan", () => {
    const cat = leer([
      { id: "c1", name: "Rara", columna_precio: 5 },
      { id: "c2", name: "Sin columna", columna_precio: null },
      { id: "c3", name: "A", columna_precio: 1 },
      { id: "c4", name: "B", columna_precio: 1 },
      { id: "c5", name: "Grande", columna_precio: 2 },
    ]);
    expect(cat.problemas_de_captura.length).toBe(4);
    expect(cat.problemas_de_captura.join(" ")).toContain("«A» y «B» comparten la columna 1");
    expect(cat.tamanos["tam-g"]!.precios).toEqual({ c3: 210, c4: 210, c5: 250 });
  });

  test("parse_divisiones", () => {
    expect(parse_divisiones("1,2,4")).toEqual([1, 2, 4]);
    expect(parse_divisiones("4, 2, x, 9")).toEqual([2, 4]);
    expect(parse_divisiones("")).toEqual([1]);
    expect(parse_divisiones(null)).toEqual([1]);
  });
});
