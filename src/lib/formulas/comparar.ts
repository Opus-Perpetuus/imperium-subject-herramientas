import { formatear, numero_de } from "./calculadora.ts";
import { decimales_de, type CampoSpec, type Registro, type TablaSpec } from "./esquema.ts";
import { texto_a_numero } from "./motor.ts";

/**
 * Comparar cierres entre sí o contra lo que hay sin cerrar: cada «periodo» es
 * una columna. Las filas son el conteo, los totales de la tabla, la suma de
 * cada columna numérica y los datos del formulario del cierre; aparte, el
 * desglose por una columna (el producto, la categoría…) con la suma de otra.
 */

export type Periodo = {
  titulo: string;
  filas: Registro[];
  /** Totales de la tabla al cerrar (o ahora): clave → texto. */
  resumenes: Record<string, string>;
  /** Lo capturado en el formulario del cierre: clave → valor. */
  datos: Record<string, string>;
  /** Cómo se llama el grupo de una fila: un enlace por su título (el del momento del cierre). */
  grupo_de: (fila: Registro) => string;
};

export type FilaComparada = { dato: string; valores: string[]; diferencia: string };

const MEDIBLES = new Set(["numero", "dinero", "entero", "calculado", "nivel"]);
const AGRUPABLES = ["referencia", "opcion", "texto", "booleano", "fecha"];

export function columnas_medibles(spec: TablaSpec): CampoSpec[] {
  return spec.campos.filter((c) => MEDIBLES.has(c.tipo));
}

export function columnas_agrupables(spec: TablaSpec): CampoSpec[] {
  return spec.campos.filter((c) => AGRUPABLES.includes(c.tipo) && !c.multiple);
}

/** El primer enlace; si no hay, la primera lista de opciones; si no, el primer texto. */
export function agrupacion_por_defecto(spec: TablaSpec): CampoSpec | null {
  const agrupables = columnas_agrupables(spec);
  for (const tipo of ["referencia", "opcion", "texto"]) {
    const campo = agrupables.find((c) => c.tipo === tipo);
    if (campo) return campo;
  }
  return agrupables[0] ?? null;
}

const decimales = (c: CampoSpec) => (c.tipo === "entero" ? 0 : decimales_de(c));

/** El último menos el primero, con signo; vacío si falta alguno. */
function diferencia(valores: (number | null)[], dec: number): string {
  const primero = valores[0];
  const ultimo = valores.at(-1);
  if (valores.length < 2 || primero == null || ultimo == null) return "";
  const d = ultimo - primero;
  return d > 0 ? `+${formatear(d, dec)}` : formatear(d, dec);
}

export function comparar_totales(spec: TablaSpec, periodos: Periodo[]): FilaComparada[] {
  const conteo = periodos.map((p) => p.filas.length);
  const out: FilaComparada[] = [{ dato: "Registros", valores: conteo.map(String), diferencia: diferencia(conteo, 0) }];
  for (const r of spec.resumenes) {
    const textos = periodos.map((p) => p.resumenes[r.clave] ?? "");
    out.push({
      dato: r.etiqueta,
      valores: textos.map((t) => t || "—"),
      diferencia: diferencia(textos.map(texto_a_numero), decimales_de(r)),
    });
  }
  for (const c of columnas_medibles(spec)) {
    const sumas = periodos.map((p) => p.filas.reduce((total, f) => total + (numero_de(spec, f.valores, c.clave) ?? 0), 0));
    out.push({
      dato: `Suma de ${c.etiqueta}`,
      valores: sumas.map((n) => formatear(n, decimales(c))),
      diferencia: diferencia(sumas, decimales(c)),
    });
  }
  for (const d of spec.campos_cierre ?? []) {
    const crudos = periodos.map((p) => p.datos[d.clave] ?? "");
    const presentar = (raw: string) => {
      if (d.tipo === "booleano") return raw === "true" ? "Sí" : "No";
      const n = MEDIBLES.has(d.tipo) ? texto_a_numero(raw) : null;
      return n === null ? raw : formatear(n, decimales(d));
    };
    out.push({
      dato: d.etiqueta,
      valores: crudos.map((t) => (t ? presentar(t) : "—")),
      diferencia: MEDIBLES.has(d.tipo) ? diferencia(crudos.map(texto_a_numero), decimales(d)) : "",
    });
  }
  return out;
}

/** Sin `medir` cuenta registros por grupo. Un grupo que falta en un periodo vale 0 ahí. */
export function comparar_grupos(spec: TablaSpec, periodos: Periodo[], medir: CampoSpec | null): FilaComparada[] {
  const por_grupo = new Map<string, number[]>();
  periodos.forEach((p, i) => {
    for (const f of p.filas) {
      const grupo = p.grupo_de(f) || "(sin dato)";
      const valores = por_grupo.get(grupo) ?? periodos.map(() => 0);
      valores[i]! += medir ? (numero_de(spec, f.valores, medir.clave) ?? 0) : 1;
      por_grupo.set(grupo, valores);
    }
  });
  const dec = medir ? decimales(medir) : 0;
  return [...por_grupo]
    .sort(([a], [b]) => a.localeCompare(b, "es"))
    .map(([grupo, valores]) => ({
      dato: grupo,
      valores: valores.map((v) => formatear(v, dec)),
      diferencia: diferencia(valores, dec),
    }));
}
