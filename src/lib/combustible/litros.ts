import { centavos, numero, texto } from "../comun.ts";
import { fraccion, minimo, secciones, type Forma } from "./escala.ts";

/**
 * Conversión de lecturas de combustible a litros, calibración del medidor,
 * rendimiento exacto y litros de una recarga. Se guarda la lectura cruda, no
 * los litros: si mañana se corrige el tanque, el histórico se recalcula solo.
 */

export type LecturaMedidor = { tipo: "medidor"; paso: number; pasos: number };
export type Lectura = { tipo: "litros"; valor: number } | LecturaMedidor;

/** Lo que el cálculo necesita de una fila de `herr_vehiculos`. */
export type VehiculoCombustible = {
  tanque_litros?: unknown;
  marcas?: unknown;
  divisiones?: unknown;
  aguja_fuera?: unknown;
  litros_por_paso?: unknown;
};

/** `aproximado` se propaga hasta la UI: un km/L que salió de barritas no es cifra exacta. */
export type Cantidad = { litros: number; aproximado: boolean };

/** EMA con que cada carga corrige la calibración. */
export const ALFA = 0.35;

const MEDIDOR = /^(-?\d+(?:[.,]\d+)?)\s*\/\s*(\d+)$/;

/** `"3/6"` → medidor; `"5.5"` o `5.5` → litros; otra cosa → null. */
export function leer_lectura(raw: unknown): Lectura | null {
  const m = MEDIDOR.exec(texto(raw));
  if (m) {
    const pasos = Number(m[2]);
    return pasos > 0 ? { tipo: "medidor", paso: numero(m[1])!, pasos } : null;
  }
  const valor = numero(raw);
  return valor == null || valor < 0 ? null : { tipo: "litros", valor };
}

export function texto_lectura(l: Lectura): string {
  return l.tipo === "litros" ? String(l.valor) : `${l.paso}/${l.pasos}`;
}

/**
 * La forma sale del vehículo, no de la lectura, pero solo cuando **coincide el
 * número de marcas**: una lectura vieja tomada con otra configuración se
 * convierte con su propia escala, sin sobrerrecorrido.
 */
function forma_para(v: VehiculoCombustible, pasos: number): Forma {
  if (numero(v.marcas) === pasos) {
    return { marcas: pasos, divisiones: numero(v.divisiones) ?? 1, aguja_fuera: v.aguja_fuera === true };
  }
  return { marcas: pasos, divisiones: 1, aguja_fuera: false };
}

export function calibracion_de(v: VehiculoCombustible): number[] {
  return Array.isArray(v.litros_por_paso)
    ? v.litros_por_paso.map((x) => numero(x) ?? 0)
    : [];
}

/**
 * Suma de `litros_por_paso[0 .. floor(paso))` más la fracción del paso parcial.
 * El índice i es cuántos litros hay entre la sección i y la i+1.
 */
export function litros_calibrados(paso: number, pasos: number, litros_por_paso: number[]): number {
  if (pasos <= 0 || !litros_por_paso.length) return 0;
  const acotado = Math.min(pasos, Math.max(0, paso));
  const entero = Math.floor(acotado);
  const fraccion_paso = acotado - entero;
  let suma = 0;
  for (let i = 0; i < entero; i++) suma += litros_por_paso[i] ?? 0;
  if (fraccion_paso > 0 && entero < pasos) suma += (litros_por_paso[entero] ?? 0) * fraccion_paso;
  return suma;
}

/**
 * Litros equivalentes de una lectura. Litros: exacto. Medidor: calibración
 * aprendida si cubre todas las secciones; si no, lineal sobre el tanque. Una
 * calibración corta no se estira: daría una cifra plausible y falsa.
 */
export function litros(lectura: Lectura, v: VehiculoCombustible): Cantidad | null {
  if (lectura.tipo === "litros") return { litros: lectura.valor, aproximado: false };
  if (lectura.pasos <= 0) return null;
  const forma = forma_para(v, lectura.pasos);
  const n = secciones(forma);
  const calibracion = calibracion_de(v);
  if (calibracion.length >= n) {
    // La calibración se aprende por sección del recorrido físico: el origen es
    // el tope de abajo y no la marca de vacío impresa.
    return { litros: litros_calibrados(lectura.paso - minimo(forma), n, calibracion), aproximado: true };
  }
  const tanque = numero(v.tanque_litros);
  if (tanque == null) return null;
  return { litros: fraccion(forma, lectura.paso) * tanque, aproximado: true };
}

/**
 * Reparte los litros cargados entre las secciones recorridas entre `antes` y
 * `despues` (media móvil con `alfa`). Se aprende por sección del recorrido
 * físico: con la aguja fuera son marcas + 2 entradas, o la lista saldría corta
 * y `litros` la descartaría en cada consulta.
 */
export function actualizar_litros_por_paso(
  v: VehiculoCombustible,
  antes: LecturaMedidor,
  despues: LecturaMedidor,
  litros_cargados: number,
  alfa = ALFA,
): number[] | null {
  if (litros_cargados <= 0) return null;
  if (antes.pasos <= 0 || antes.pasos !== despues.pasos) return null;

  const forma = forma_para(v, antes.pasos);
  const n = secciones(forma);
  const origen = minimo(forma);
  const desde = Math.min(n, Math.max(0, antes.paso - origen));
  const hasta = Math.min(n, Math.max(0, despues.paso - origen));
  if (hasta <= desde) return null;

  const previa = calibracion_de(v);
  let base: number[];
  if (previa.length >= n) {
    base = previa.slice(0, n);
  } else {
    const tanque = numero(v.tanque_litros);
    if (tanque == null) return null;
    base = Array.from({ length: n }, () => tanque / n);
  }

  // Pesos relativos de cada sección tocada (enteras + fracciones en los extremos).
  const pesos = new Array<number>(n).fill(0);
  let cursor = desde;
  while (cursor < hasta) {
    const idx = Math.min(n - 1, Math.floor(cursor));
    const siguiente = Math.min(idx + 1, hasta);
    pesos[idx]! += siguiente - cursor;
    cursor = siguiente;
  }
  const total = pesos.reduce((s, p) => s + p, 0);
  if (total <= 0) return null;
  const por_unidad = litros_cargados / total;
  return base.map((b, i) => (pesos[i]! > 0 ? b * (1 - alfa) + por_unidad * alfa : b));
}

/** km entre dos cargas a tanque lleno ÷ litros de la segunda. */
export function rendimiento_exacto(km_lleno_previo: number, km_lleno_actual: number, litros_carga: number): number | null {
  if (litros_carga <= 0) return null;
  const km = km_lleno_actual - km_lleno_previo;
  return km > 0 ? km / litros_carga : null;
}

/** Litros efectivos de una recarga: explícitos, o pesos ÷ precio si ambos están. */
export function litros_efectivos(r: { litros?: unknown; pesos?: unknown; precio_litro?: unknown }): number | null {
  const l = numero(r.litros);
  if (l != null && l > 0) return l;
  const pesos = numero(r.pesos);
  const precio = numero(r.precio_litro);
  return pesos != null && pesos > 0 && precio != null && precio > 0 ? pesos / precio : null;
}

/** "Gasolina · 4.2 L", o "Gasolina" sin litros. */
export function motivo_gasto(litros_cargados: number | null): string {
  if (litros_cargados == null || litros_cargados <= 0) return "Gasolina";
  return `Gasolina · ${centavos(litros_cargados)} L`;
}
