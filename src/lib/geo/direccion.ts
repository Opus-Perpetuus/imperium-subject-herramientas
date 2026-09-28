import { texto } from "../comun.ts";

/**
 * Lo que devuelve un geocodificador inverso, ya en forma plana. Lo resuelve el
 * cliente (Android o un proveedor futuro); aquí solo se reparte en los campos
 * del directorio, que es la parte con esquinas.
 */
export type DireccionCruda = {
  /** Vía: «Calle Morelos». */
  calle?: string | null;
  /** Número exterior. */
  numero?: string | null;
  /** Colonia o barrio. */
  colonia?: string | null;
  /** Ciudad o municipio; suple a la colonia cuando falta. */
  localidad?: string | null;
  /** Nombre del lugar: a veces el número, a veces un comercio. */
  lugar?: string | null;
};

export type DireccionMapeada = {
  calle: string;
  numero: string;
  colonia: string;
  /** Nombre corto propuesto para el domicilio: «Morelos 45». */
  alias: string;
};

/** Cuántos caracteres puede tener algo que aún parezca un número de casa. */
const LARGO_MAX_NUMERO = 8;

export function mapear_direccion(cruda: DireccionCruda | null | undefined): DireccionMapeada | null {
  if (!cruda) return null;
  const calle = texto(cruda.calle);
  const colonia = texto(cruda.colonia) || texto(cruda.localidad);
  // Sin calle ni colonia no hay dirección que valga la pena guardar.
  if (!calle && !colonia) return null;

  // `lugar` trae el número cuando falta `numero`, pero también puede traer el
  // nombre de un comercio: sin la guarda quedaría «Morelos Farmacia del Ahorro».
  const lugar = texto(cruda.lugar);
  const numero =
    texto(cruda.numero) || (/\d/.test(lugar) && lugar.length <= LARGO_MAX_NUMERO ? lugar : "");

  const alias = [calle, numero].filter(Boolean).join(" ") || colonia;
  return { calle, numero, colonia, alias };
}

/**
 * Mezcla lo geocodificado con lo ya capturado **sin pisar nada**: lo tecleado
 * manda siempre, y un campo en blanco cuenta como hueco.
 */
export function rellenar_huecos<T extends Record<string, unknown>>(
  actual: T,
  mapeada: DireccionMapeada | null,
): T {
  if (!mapeada) return actual;
  const out: Record<string, unknown> = { ...actual };
  for (const [clave, valor] of Object.entries(mapeada)) {
    if (valor && !texto(actual[clave])) out[clave] = valor;
  }
  return out as T;
}
