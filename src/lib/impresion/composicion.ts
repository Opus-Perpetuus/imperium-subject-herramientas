/**
 * Una tabla compuesta en hojas tamaño carta para imprimirla: título, columnas,
 * filas con su texto ya presentado y el total. Todo va en puntos (1/72 de
 * pulgada) con el origen arriba a la izquierda; el PDF y el PNG solo dibujan
 * estas páginas, así que los dos salen iguales.
 */

export type ColumnaImpresa = { titulo: string; derecha?: boolean };

export type Impreso = {
  titulo: string;
  subtitulo: string;
  columnas: ColumnaImpresa[];
  filas: string[][];
  total: string;
};

/** Ancho en puntos de un texto con la fuente del impreso. */
export type Medida = (texto: string, tamano: number, negrita: boolean) => number;

/** `y` es la línea base; el texto siempre se ancla a la izquierda (lo alineado a la derecha ya trae su `x`). */
export type Texto = { texto: string; x: number; y: number; tamano: number; negrita: boolean; color: string };
export type Raya = { x1: number; y1: number; x2: number; y2: number; color: string };
export type Relleno = { x: number; y: number; ancho: number; alto: number; color: string };
export type Pagina = { ancho: number; alto: number; textos: Texto[]; rayas: Raya[]; rellenos: Relleno[] };

const CARTA = { corto: 612, largo: 792 };
const MARGEN = 36;
const RELLENO_X = 4;
const RELLENO_Y = 3;
const INTERLINEA = 1.25;
const MAX_LINEAS = 4;
const TAMANOS = [9, 8, 7];
const TITULO = 15;
const SUBTITULO = 9;
const PIE = 7.5;
const RESERVA_PIE = 16;

export const COLORES = {
  texto: "#1f2430",
  tenue: "#5f6673",
  raya: "#c9ced6",
  cabecera: "#e9ecf2",
  par: "#f5f6f8",
} as const;

const suma = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

/** Líneas de un texto que caben en `ancho`; las palabras más largas que el ancho se cortan. */
export function partir(texto: string, ancho: number, tamano: number, negrita: boolean, medir: Medida): string[] {
  const lineas: string[] = [];
  for (const parrafo of texto.split(/\r?\n/)) {
    let actual = "";
    for (const palabra of parrafo.split(/\s+/).filter(Boolean)) {
      const junto = actual ? `${actual} ${palabra}` : palabra;
      if (medir(junto, tamano, negrita) <= ancho) {
        actual = junto;
        continue;
      }
      if (actual) lineas.push(actual);
      actual = "";
      let resto = palabra;
      while (medir(resto, tamano, negrita) > ancho && resto.length > 1) {
        let n = resto.length - 1;
        while (n > 1 && medir(resto.slice(0, n), tamano, negrita) > ancho) n--;
        lineas.push(resto.slice(0, n));
        resto = resto.slice(n);
      }
      actual = resto;
    }
    if (actual || !lineas.length) lineas.push(actual);
  }
  return lineas;
}

/** Hasta `max` líneas; si sobra texto, la última termina en «…» sin pasarse del ancho. */
function recortar(lineas: string[], max: number, ancho: number, tamano: number, negrita: boolean, medir: Medida): string[] {
  if (lineas.length <= max) return lineas;
  let ultima = lineas[max - 1]!;
  while (ultima && medir(`${ultima}…`, tamano, negrita) > ancho) ultima = ultima.slice(0, -1);
  return [...lineas.slice(0, max - 1), `${ultima.trimEnd()}…`];
}

/**
 * Anchos de columna que llenan `util`. Si sobra espacio se reparte en
 * proporción. Si falta, ceden primero las más anchas (casi siempre notas o
 * descripciones): se busca un tope común y las que caben debajo de él se
 * quedan enteras, sin partirse.
 */
export function repartir(naturales: number[], minimos: number[], util: number): number[] {
  const total = suma(naturales);
  if (total <= util) return naturales.map((n) => n + ((util - total) * n) / total);
  const con_tope = (tope: number) => naturales.map((n, i) => Math.max(minimos[i]!, Math.min(n, tope)));
  if (suma(minimos) > util) {
    const total_minimo = suma(minimos);
    return minimos.map((m) => (m * util) / total_minimo);
  }
  let bajo = 0;
  let alto = Math.max(...naturales);
  for (let i = 0; i < 50; i++) {
    const tope = (bajo + alto) / 2;
    if (suma(con_tope(tope)) > util) alto = tope;
    else bajo = tope;
  }
  return con_tope(bajo);
}

/** En NFC y sin guion suave: pdf-lib no coloca los acentos combinantes y la fuente no trae U+00AD. */
const limpio = (texto: string) => texto.normalize("NFC").replace(/­/g, "");

export function componer(original: Impreso, medir: Medida): Pagina[] {
  const impreso: Impreso = {
    titulo: limpio(original.titulo),
    subtitulo: limpio(original.subtitulo),
    columnas: original.columnas.map((c) => ({ ...c, titulo: limpio(c.titulo) })),
    filas: original.filas.map((f) => f.map(limpio)),
    total: limpio(original.total),
  };
  const { columnas, filas } = impreso;
  const naturales = (tamano: number) =>
    columnas.map(
      (c, i) =>
        Math.max(medir(c.titulo, tamano, true), ...filas.map((f) => medir(f[i] ?? "", tamano, false))) + 2 * RELLENO_X,
    );
  const minimos = (tamano: number) => naturales(tamano).map((n) => Math.min(n, tamano * 6 + 2 * RELLENO_X));

  const vertical = suma(naturales(TAMANOS[0]!)) <= CARTA.corto - 2 * MARGEN;
  const [ancho, alto] = vertical ? [CARTA.corto, CARTA.largo] : [CARTA.largo, CARTA.corto];
  const util = ancho - 2 * MARGEN;
  const tamano = TAMANOS.find((t) => suma(minimos(t)) <= util) ?? TAMANOS.at(-1)!;
  const anchos = columnas.length ? repartir(naturales(tamano), minimos(tamano), util) : [];
  const xs = anchos.map((_, i) => MARGEN + suma(anchos.slice(0, i)));
  const linea = tamano * INTERLINEA;
  const limite = alto - MARGEN - RESERVA_PIE;

  const paginas: Pagina[] = [];
  let pagina: Pagina = { ancho, alto, textos: [], rayas: [], rellenos: [] };
  let y = MARGEN;

  const fila = (celdas: string[], negrita: boolean, fondo: string | null) => {
    const lineas = celdas.map((c, i) =>
      recortar(partir(c, anchos[i]! - 2 * RELLENO_X, tamano, negrita, medir), MAX_LINEAS, anchos[i]! - 2 * RELLENO_X, tamano, negrita, medir),
    );
    const alto_fila = Math.max(1, ...lineas.map((l) => l.length)) * linea + 2 * RELLENO_Y;
    return {
      alto: alto_fila,
      dibujar: () => {
        if (fondo) pagina.rellenos.push({ x: MARGEN, y, ancho: util, alto: alto_fila, color: fondo });
        lineas.forEach((ls, i) =>
          ls.forEach((texto, k) => {
            const base = y + RELLENO_Y + tamano * 0.85 + k * linea;
            const x = columnas[i]!.derecha
              ? xs[i]! + anchos[i]! - RELLENO_X - medir(texto, tamano, negrita)
              : xs[i]! + RELLENO_X;
            if (texto) pagina.textos.push({ texto, x, y: base, tamano, negrita, color: COLORES.texto });
          }),
        );
        y += alto_fila;
        pagina.rayas.push({ x1: MARGEN, y1: y, x2: MARGEN + util, y2: y, color: COLORES.raya });
      },
    };
  };
  const cabecera = fila(
    columnas.map((c) => c.titulo),
    true,
    COLORES.cabecera,
  );
  const nueva_pagina = () => {
    paginas.push(pagina);
    pagina = { ancho, alto, textos: [], rayas: [], rellenos: [] };
    y = MARGEN;
    cabecera.dibujar();
  };

  pagina.textos.push({ texto: impreso.titulo, x: MARGEN, y: y + TITULO * 0.85, tamano: TITULO, negrita: true, color: COLORES.texto });
  y += TITULO * 1.4;
  if (impreso.subtitulo) {
    pagina.textos.push({ texto: impreso.subtitulo, x: MARGEN, y: y + SUBTITULO * 0.85, tamano: SUBTITULO, negrita: false, color: COLORES.tenue });
    y += SUBTITULO * 2;
  }
  if (columnas.length) cabecera.dibujar();
  filas.forEach((celdas, i) => {
    const f = fila(celdas, false, i % 2 ? COLORES.par : null);
    if (y + f.alto > limite) nueva_pagina();
    f.dibujar();
  });
  if (y + linea * 2 > limite) {
    paginas.push(pagina);
    pagina = { ancho, alto, textos: [], rayas: [], rellenos: [] };
    y = MARGEN;
  }
  pagina.textos.push({ texto: impreso.total, x: MARGEN, y: y + linea + tamano * 0.85, tamano, negrita: true, color: COLORES.texto });
  paginas.push(pagina);

  paginas.forEach((p, i) => {
    const base = p.alto - MARGEN / 2;
    const numero = `Página ${i + 1} de ${paginas.length}`;
    p.textos.push({ texto: impreso.titulo, x: MARGEN, y: base, tamano: PIE, negrita: false, color: COLORES.tenue });
    p.textos.push({ texto: numero, x: p.ancho - MARGEN - medir(numero, PIE, false), y: base, tamano: PIE, negrita: false, color: COLORES.tenue });
  });
  return paginas;
}
