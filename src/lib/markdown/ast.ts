/**
 * Árbol de un documento Markdown.
 *
 * Se separa en bloques y en tramos porque son dos problemas distintos: los
 * bloques se reconocen línea a línea y los tramos requieren recorrer
 * caracteres dentro de una línea.
 */

/** Tramo dentro de una línea. */
export type Tramo =
  | { tipo: "texto"; valor: string }
  | { tipo: "negrita"; hijos: Tramo[] }
  | { tipo: "cursiva"; hijos: Tramo[] }
  | { tipo: "tachado"; hijos: Tramo[] }
  | { tipo: "resaltado"; hijos: Tramo[] }
  | { tipo: "codigo"; valor: string }
  | { tipo: "enlace"; texto: string; url: string }
  | { tipo: "imagen"; alt: string; url: string }
  /** Enlace interno: `[[nota]]` o `[[nota|alias]]`. */
  | { tipo: "wiki"; destino: string; alias: string | null }
  /** Etiqueta `#etiqueta`. */
  | { tipo: "etiqueta"; nombre: string };

export type ElementoLista = { contenido: Tramo[] };

/** `linea` es el índice de la línea de origen: permite marcar la casilla reescribiendo solo esa línea. */
export type Tarea = { hecha: boolean; contenido: Tramo[]; linea: number };

export type Bloque =
  | { tipo: "encabezado"; nivel: number; contenido: Tramo[] }
  | { tipo: "parrafo"; contenido: Tramo[] }
  | { tipo: "cita"; hijos: Bloque[] }
  | { tipo: "codigo"; lenguaje: string | null; codigo: string }
  | { tipo: "vinetas"; elementos: ElementoLista[] }
  | { tipo: "numerada"; inicio: number; elementos: ElementoLista[] }
  | { tipo: "tareas"; elementos: Tarea[] }
  /** Tabla GFM; las celdas se guardan como texto crudo. */
  | { tipo: "tabla"; cabecera: string[]; filas: string[][] }
  | { tipo: "regla" }
  /** Metadatos YAML (clave: valor) al inicio del documento. */
  | { tipo: "metadatos"; entradas: Record<string, string> };
