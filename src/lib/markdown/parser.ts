import type { Bloque, ElementoLista, Tarea, Tramo } from "./ast.ts";

/**
 * Analizador de Markdown propio: CommonMark en lo habitual más las extensiones
 * de las notas (tareas, tablas, `==resaltado==`, `[[enlaces]]`, `#etiquetas` y
 * metadatos YAML al inicio). No pretende ser CommonMark completo.
 */

const ENCABEZADO = /^#{1,6}\s+.*$/;
const VINETA = /^[-*+]\s+(.*)$/;
const NUMERADA = /^(\d+)[.)]\s+(.*)$/;
const TAREA = /^[-*+]\s+\[([ xX])\]\s+(.*)$/;

export function analizar(fuente: string): Bloque[] {
  const lineas = fuente.replace(/\r\n/g, "\n").split("\n");
  const bloques: Bloque[] = [];
  let i = 0;

  // Los metadatos solo cuentan si abren el documento. Un `---` en medio del
  // texto es una regla horizontal.
  if (lineas[0]?.trim() === "---") {
    const fin = lineas.findIndex((l, n) => n > 0 && l.trim() === "---");
    if (fin > 0) {
      bloques.push(metadatos(lineas.slice(1, fin)));
      i = fin + 1;
    }
  }

  while (i < lineas.length) {
    const linea = lineas[i]!;
    const recortada = linea.trim();

    if (recortada === "") {
      i++;
    } else if (recortada.startsWith("```") || recortada.startsWith("~~~")) {
      const valla = recortada.slice(0, 3);
      const lenguaje = recortada.slice(3).trim() || null;
      const cuerpo: string[] = [];
      i++;
      while (i < lineas.length && !lineas[i]!.trim().startsWith(valla)) {
        cuerpo.push(lineas[i]!);
        i++;
      }
      // Un bloque sin cerrar llega hasta el final en vez de descartarse.
      if (i < lineas.length) i++;
      bloques.push({ tipo: "codigo", lenguaje, codigo: cuerpo.join("\n") });
    } else if (es_regla(recortada)) {
      bloques.push({ tipo: "regla" });
      i++;
    } else if (ENCABEZADO.test(recortada)) {
      const almohadillas = recortada.match(/^#+/)![0];
      bloques.push({
        tipo: "encabezado",
        nivel: Math.min(almohadillas.length, 6),
        contenido: analizar_tramos(recortada.slice(almohadillas.length).trim()),
      });
      i++;
    } else if (recortada.startsWith(">")) {
      const citadas: string[] = [];
      while (i < lineas.length && lineas[i]!.trim().startsWith(">")) {
        citadas.push(lineas[i]!.trim().slice(1).replace(/^ /, ""));
        i++;
      }
      bloques.push({ tipo: "cita", hijos: analizar(citadas.join("\n")) });
    } else if (TAREA.test(recortada)) {
      const elementos: Tarea[] = [];
      let m: RegExpMatchArray | null;
      while (i < lineas.length && (m = lineas[i]!.trim().match(TAREA))) {
        elementos.push({
          hecha: m[1]!.toLowerCase() === "x",
          contenido: analizar_tramos(m[2]!),
          linea: i,
        });
        i++;
      }
      bloques.push({ tipo: "tareas", elementos });
    } else if (VINETA.test(recortada)) {
      const elementos: ElementoLista[] = [];
      let m: RegExpMatchArray | null;
      while (
        i < lineas.length &&
        !TAREA.test(lineas[i]!.trim()) &&
        (m = lineas[i]!.trim().match(VINETA))
      ) {
        elementos.push({ contenido: analizar_tramos(m[1]!) });
        i++;
      }
      bloques.push({ tipo: "vinetas", elementos });
    } else if (NUMERADA.test(recortada)) {
      const inicio = Number(recortada.match(NUMERADA)![1]) || 1;
      const elementos: ElementoLista[] = [];
      let m: RegExpMatchArray | null;
      while (i < lineas.length && (m = lineas[i]!.trim().match(NUMERADA))) {
        elementos.push({ contenido: analizar_tramos(m[2]!) });
        i++;
      }
      bloques.push({ tipo: "numerada", inicio, elementos });
    } else if (es_inicio_tabla(lineas, i)) {
      const cabecera = dividir_fila(lineas[i]!);
      i += 2; // cabecera + separadora
      const filas: string[][] = [];
      while (i < lineas.length && lineas[i]!.trim().startsWith("|")) {
        filas.push(dividir_fila(lineas[i]!));
        i++;
      }
      bloques.push({ tipo: "tabla", cabecera, filas });
    } else {
      const parrafo: string[] = [];
      while (i < lineas.length && lineas[i]!.trim() !== "" && !empieza_bloque(lineas, i)) {
        parrafo.push(lineas[i]!.trim());
        i++;
      }
      if (parrafo.length) {
        bloques.push({ tipo: "parrafo", contenido: analizar_tramos(parrafo.join(" ")) });
      } else {
        i++;
      }
    }
  }
  return bloques;
}

// ── Bloques: reconocimiento ─────────────────────────────────────────────────

function es_regla(linea: string): boolean {
  return linea.length >= 3 && /^(?:-+|\*+|_+)$/.test(linea);
}

function empieza_bloque(lineas: string[], i: number): boolean {
  const t = lineas[i]!.trim();
  return (
    ENCABEZADO.test(t) ||
    t.startsWith(">") ||
    t.startsWith("```") ||
    t.startsWith("~~~") ||
    es_regla(t) ||
    TAREA.test(t) ||
    VINETA.test(t) ||
    NUMERADA.test(t) ||
    es_inicio_tabla(lineas, i)
  );
}

/** Una tabla necesita cabecera Y fila separadora; si no, cualquier párrafo con `|` sería tabla. */
function es_inicio_tabla(lineas: string[], i: number): boolean {
  if (!lineas[i]!.trim().startsWith("|")) return false;
  const siguiente = lineas[i + 1]?.trim();
  if (siguiente === undefined) return false;
  return siguiente.startsWith("|") && /^[|\-: \t]*$/.test(siguiente) && siguiente.includes("-");
}

function dividir_fila(linea: string): string[] {
  return linea
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((c) => c.trim());
}

function metadatos(lineas: string[]): Bloque {
  const entradas: Record<string, string> = {};
  for (const linea of lineas) {
    const idx = linea.indexOf(":");
    if (idx > 0) entradas[linea.slice(0, idx).trim()] = linea.slice(idx + 1).trim();
  }
  return { tipo: "metadatos", entradas };
}

// ── Tramos ──────────────────────────────────────────────────────────────────

/**
 * Recorrido lineal con acumulador: al hallar un delimitador busca su pareja y,
 * si no la halla, lo trata como texto literal (`**negrita` a medio teclear).
 */
export function analizar_tramos(texto: string): Tramo[] {
  const out: Tramo[] = [];
  let buffer = "";
  let i = 0;

  const vaciar = () => {
    if (buffer) {
      out.push({ tipo: "texto", valor: buffer });
      buffer = "";
    }
  };
  const literal = () => {
    buffer += texto[i];
    i++;
  };
  const delimitado = (token: string, envolver: (hijos: Tramo[]) => Tramo) => {
    const inicio_contenido = i + token.length;
    let fin = texto.indexOf(token, inicio_contenido);
    if (fin < 0 || fin === inicio_contenido) {
      literal();
      return;
    }
    // Si el cierre forma parte de una tirada más larga del mismo carácter, se
    // alinea al FINAL de la tirada: así `**fuerte *y torcido***` cierra la
    // negrita con los dos últimos asteriscos y la cursiva conserva el suyo.
    const marca = token[0]!;
    if ([...token].every((c) => c === marca)) {
      let fin_tirada = fin;
      while (fin_tirada < texto.length && texto[fin_tirada] === marca) fin_tirada++;
      if (fin_tirada - fin > token.length) fin = fin_tirada - token.length;
    }
    vaciar();
    out.push(envolver(analizar_tramos(texto.slice(inicio_contenido, fin))));
    i = fin + token.length;
  };

  while (i < texto.length) {
    if (texto.startsWith("`", i)) {
      const fin = texto.indexOf("`", i + 1);
      if (fin > i) {
        vaciar();
        out.push({ tipo: "codigo", valor: texto.slice(i + 1, fin) });
        i = fin + 1;
      } else literal();
    } else if (texto.startsWith("![", i)) {
      const enlace = analizar_enlace(texto, i, true);
      if (enlace) {
        vaciar();
        out.push(enlace[0]);
        i = enlace[1];
      } else literal();
    } else if (texto.startsWith("[[", i)) {
      const fin = texto.indexOf("]]", i + 2);
      if (fin > i) {
        vaciar();
        const interior = texto.slice(i + 2, fin);
        const barra = interior.indexOf("|");
        out.push(
          barra >= 0
            ? { tipo: "wiki", destino: interior.slice(0, barra), alias: interior.slice(barra + 1) }
            : { tipo: "wiki", destino: interior, alias: null },
        );
        i = fin + 2;
      } else literal();
    } else if (texto.startsWith("[", i)) {
      const enlace = analizar_enlace(texto, i, false);
      if (enlace) {
        vaciar();
        out.push(enlace[0]);
        i = enlace[1];
      } else literal();
    } else if (texto.startsWith("**", i)) {
      delimitado("**", (hijos) => ({ tipo: "negrita", hijos }));
    } else if (texto.startsWith("__", i)) {
      delimitado("__", (hijos) => ({ tipo: "negrita", hijos }));
    } else if (texto.startsWith("~~", i)) {
      delimitado("~~", (hijos) => ({ tipo: "tachado", hijos }));
    } else if (texto.startsWith("==", i)) {
      delimitado("==", (hijos) => ({ tipo: "resaltado", hijos }));
    } else if (texto.startsWith("*", i)) {
      delimitado("*", (hijos) => ({ tipo: "cursiva", hijos }));
    } else if (texto.startsWith("_", i)) {
      delimitado("_", (hijos) => ({ tipo: "cursiva", hijos }));
    } else if (texto.startsWith("#", i) && es_inicio_etiqueta(texto, i)) {
      let fin = i + 1;
      while (fin < texto.length && /[\p{L}\p{N}\-_/]/u.test(texto[fin]!)) fin++;
      vaciar();
      out.push({ tipo: "etiqueta", nombre: texto.slice(i + 1, fin) });
      i = fin;
    } else literal();
  }
  vaciar();
  return out;
}

/** Una etiqueta solo cuenta al principio o tras un espacio, y necesita una letra después. */
function es_inicio_etiqueta(texto: string, i: number): boolean {
  if (i > 0 && !/\s/.test(texto[i - 1]!)) return false;
  const siguiente = texto[i + 1];
  return siguiente !== undefined && /\p{L}/u.test(siguiente);
}

/** `[texto](url)` y `![alt](url)`. Devuelve el tramo y la posición siguiente. */
function analizar_enlace(texto: string, inicio: number, imagen: boolean): [Tramo, number] | null {
  const abre = imagen ? inicio + 1 : inicio;
  const cierra = texto.indexOf("]", abre);
  if (cierra < 0 || texto[cierra + 1] !== "(") return null;
  const cierra_paren = texto.indexOf(")", cierra + 2);
  if (cierra_paren < 0) return null;
  const etiqueta = texto.slice(abre + 1, cierra);
  const url = texto.slice(cierra + 2, cierra_paren);
  const tramo: Tramo = imagen
    ? { tipo: "imagen", alt: etiqueta, url }
    : { tipo: "enlace", texto: etiqueta, url };
  return [tramo, cierra_paren + 1];
}
