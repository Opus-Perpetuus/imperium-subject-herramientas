import { sello_ahora, zona_valida } from "../comun.ts";
import { constante_de, type CampoSpec, type Registro, type TablaSpec } from "./esquema.ts";

/**
 * Planifica el «cerrar el día» de una tabla: cada fila se copia con todos sus
 * campos y se le estampan además los resúmenes y los valores fijos con su
 * valor al momento del cierre. Los calculados se congelan como número: si se
 * copiaran como calculados, sus fórmulas se reevaluarían contra el archivo.
 *
 * Colisiones de clave: campos y fijos comparten espacio; los resúmenes tienen
 * el suyo. Se desambigua con prefijos `resumen_` / `fijo_` y sufijos numéricos.
 */

export type PlanCierre = {
  esquema_archivo: TablaSpec;
  filas_archivadas: Registro[];
  cierre_id: string;
};

/**
 * Sin filas, o si la tabla no es cerrable, → null. `calculados_por_fila` trae
 * por id los calculados ya evaluados y, bajo su clave, los resúmenes del momento.
 */
export function planear_cierre(
  origen: TablaSpec,
  filas: Registro[],
  cerrado_at: string,
  calculados_por_fila: Record<string, Record<string, string>> = {},
  cierre_id = `cierre-${Date.parse(cerrado_at)}`,
): PlanCierre | null {
  if (origen.cerrable === false) return null;
  if (!filas.length) return null;

  const esquema = esquema_archivo(origen);
  const sello = sello_ahora(zona_valida(), new Date(cerrado_at)).replace(" ", "T");
  const claves_resumen = claves_resumen_archivo(origen);
  const claves_constante = claves_constante_archivo(origen);

  const filas_archivadas = filas.map((fila) => {
    const calculados = calculados_por_fila[fila.id] ?? {};
    const valores: Record<string, string> = {};
    for (const campo of origen.campos) {
      const raw =
        campo.tipo === "calculado"
          ? (calculados[campo.clave] ?? fila.valores[campo.clave])
          : fila.valores[campo.clave];
      if (raw !== undefined) valores[campo.clave] = raw;
    }
    for (const [clave, clave_archivo] of claves_resumen) {
      const raw = calculados[clave_archivo] ?? calculados[clave];
      if (raw !== undefined) valores[clave_archivo] = raw;
    }
    for (const [clave, clave_archivo] of claves_constante) {
      const constante = constante_de(origen, clave);
      if (constante) valores[clave_archivo] = constante.valor ?? "";
    }
    valores.cierre = sello;
    valores.cierre_id = cierre_id;
    return {
      id: fila.id,
      valores,
      created_at: fila.created_at,
      updated_at: cerrado_at,
    };
  });

  return { esquema_archivo: esquema, filas_archivadas, cierre_id };
}

export function id_tabla_archivo(id_origen: string): string {
  return `${id_origen}-cierres`;
}

/** El esquema de la tabla de archivo: campos congelados + resúmenes + fijos + sello. */
export function esquema_archivo(origen: TablaSpec): TablaSpec {
  const ocupadas: string[] = [];
  const campos: CampoSpec[] = [];

  for (const campo of origen.campos) {
    const congelado: CampoSpec =
      campo.tipo === "calculado"
        ? { ...campo, tipo: "numero", formula: null, requerido: false }
        : { ...campo, requerido: false };
    campos.push(congelado);
    ocupadas.push(congelado.clave);
  }
  for (const resumen of origen.resumenes) {
    const clave = desambiguar(resumen.clave, "resumen", ocupadas);
    campos.push({
      clave,
      etiqueta: resumen.etiqueta,
      tipo: "numero",
      unidad: resumen.unidad,
      decimales: resumen.decimales,
    });
    ocupadas.push(clave);
  }
  for (const constante of origen.constantes) {
    const clave = desambiguar(constante.clave, "fijo", ocupadas);
    campos.push({
      clave,
      etiqueta: constante.etiqueta,
      tipo: "texto",
      unidad: constante.unidad,
      decimales: constante.decimales,
      valor_por_defecto: constante.valor,
    });
    ocupadas.push(clave);
  }
  campos.push({ clave: "cierre", etiqueta: "Cierre", tipo: "fecha_hora", en_resumen: true });
  campos.push({ clave: "cierre_id", etiqueta: "Id de cierre", tipo: "texto" });

  return {
    id: id_tabla_archivo(origen.id),
    name: `${origen.name} · Cierres`,
    description: `Archivo de cierres de «${origen.name}». Cada fila es un registro al momento del cierre.`,
    icono: origen.icono,
    campos,
    constantes: [],
    resumenes: [],
    orden_campo: "cierre",
    orden_desc: true,
    cerrable: false,
  };
}

/** Clave original → clave en el archivo de cada resumen. */
export function claves_resumen_archivo(origen: TablaSpec): [string, string][] {
  const ocupadas = origen.campos.map((c) => c.clave);
  return origen.resumenes.map((r) => {
    const clave = desambiguar(r.clave, "resumen", ocupadas);
    ocupadas.push(clave);
    return [r.clave, clave];
  });
}

/** Clave original → clave en el archivo de cada valor fijo. */
export function claves_constante_archivo(origen: TablaSpec): [string, string][] {
  const ocupadas = origen.campos.map((c) => c.clave);
  for (const r of origen.resumenes) ocupadas.push(desambiguar(r.clave, "resumen", ocupadas));
  return origen.constantes.map((c) => {
    const clave = desambiguar(c.clave, "fijo", ocupadas);
    ocupadas.push(clave);
    return [c.clave, clave];
  });
}

/** Libre → tal cual; si choca, `prefijo_base`; si aún choca, sufijo numérico. */
function desambiguar(base: string, prefijo: string, ocupadas: string[]): string {
  if (!ocupadas.includes(base)) return base;
  const preferida = `${prefijo}_${base}`;
  if (!ocupadas.includes(preferida)) return preferida;
  return clave_unica(preferida, preferida, ocupadas);
}

/** Clave estable a partir de una etiqueta, evitando las ocupadas. */
export function clave_unica(etiqueta: string, respaldo: string, ocupadas: string[]): string {
  const base =
    etiqueta.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || respaldo;
  let clave = base;
  let n = 2;
  while (ocupadas.includes(clave)) clave = `${base}_${n++}`;
  return clave;
}
