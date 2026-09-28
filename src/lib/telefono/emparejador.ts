import { normalizar, texto } from "../comun.ts";
import type { Llamante } from "./decision.ts";

/** Un contacto con teléfono, como lo guarda `herr_telefono_contactos`. */
export type Contacto = {
  clave: string;
  nombre: string;
  telefono?: string;
};

/** Nombre en minúsculas, sin acentos y con un solo espacio entre palabras. */
export function nombre_comparable(value: unknown): string {
  return normalizar(value).replace(/\s+/g, " ");
}

/** «+52 55 1234 5678», «5512345678», «(55) 1234-5678». */
export function parece_numero(value: string): boolean {
  return /^\+?\d+$/.test(value.replace(/[\s().-]/g, ""));
}

/** Solo los dígitos, y de ellos los 10 últimos: «+52 1 55 1234 5678» y «5512345678» casan. */
export function telefono_comparable(value: unknown): string {
  return texto(value).replace(/\D/g, "").slice(-10);
}

/**
 * Identifica a quien llama por WhatsApp a partir del título de la notificación.
 *
 * WhatsApp no expone el número, solo el nombre con el que la persona está
 * guardada (o el número crudo si no lo está), así que se cruza por nombre y no
 * por número. Un título con pinta de número es alguien fuera de la agenda; un
 * nombre que no está se conserva igual, porque es el mejor texto para locutar.
 */
export function identificar_por_nombre(titulo: unknown, contactos: Contacto[]): Llamante {
  const nombre = texto(titulo);
  if (!nombre) return { conocido: false };
  if (parece_numero(nombre)) return { conocido: false, numero: nombre };
  const buscado = nombre_comparable(nombre);
  const contacto = contactos.find((c) => nombre_comparable(c.nombre) === buscado);
  if (!contacto) return { conocido: false, nombre };
  return { conocido: true, clave: contacto.clave, nombre: contacto.nombre, numero: contacto.telefono };
}
