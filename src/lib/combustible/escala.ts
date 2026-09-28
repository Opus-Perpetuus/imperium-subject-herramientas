/**
 * La forma de un medidor de nivel y cuánto vale cada posición de la aguja.
 * Una sola vez, para que lo dibujado y lo contabilizado no discrepen.
 */
export type Forma = {
  /** Marcas **impresas** en el tablero, de vacío a lleno. */
  marcas: number;
  /** En cuántas partes se corta cada sección al capturar (1 = barritas). */
  divisiones: number;
  /** La aguja baja de la primera marca y sube de la última: el depósito se reparte entre marcas + 2. */
  aguja_fuera: boolean;
};

/** Secciones del recorrido **físico**: las impresas, más las dos de fuera si las hay. */
export const secciones = (f: Forma) => (f.aguja_fuera ? f.marcas + 2 : f.marcas);

/** Posición del tope inferior, en marcas impresas. */
export const minimo = (f: Forma) => (f.aguja_fuera ? -1 : 0);

/** Posición del tope superior, en marcas impresas. */
export const maximo = (f: Forma) => (f.aguja_fuera ? f.marcas + 1 : f.marcas);

/** Salto entre posiciones capturables. */
export const incremento = (f: Forma) => 1 / Math.max(1, f.divisiones);

const acotar = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

/** Redondea a la división más cercana y no deja salirse del recorrido. */
export function ajustar(f: Forma, crudo: number): number {
  const paso = incremento(f);
  return acotar(Math.round(crudo / paso) * paso, minimo(f), maximo(f));
}

/**
 * Fracción del depósito [0..1] para una posición en marcas impresas. Con la
 * aguja fuera, la marca de vacío **no es vacío**: es una sección sobre el fondo.
 */
export function fraccion(f: Forma, marcas: number): number {
  return acotar((marcas - minimo(f)) / secciones(f), 0, 1);
}

/** ¿La calibración aprendida para `vieja` sigue describiendo `nueva`? Solo si no cambió el número de secciones. */
export const calibracion_sobrevive = (vieja: Forma, nueva: Forma) => secciones(vieja) === secciones(nueva);
