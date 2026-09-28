import { campo_de, type Registro, type TablaSpec } from "./esquema.ts";
import { texto_a_numero } from "./motor.ts";

/** Tipos cuyo valor es un número aunque se guarde como texto. */
const NUMERICOS = new Set(["entero", "numero", "dinero"]);

/**
 * Sin campo de orden manda lo más reciente. Con campo, el orden lo decide su
 * tipo: un numérico se compara como número (`"10" < "2"` como texto colaba la
 * columna 10 entre la 1 y la 2). Lo que no tiene valor se va al final.
 */
export function ordenar(spec: TablaSpec | null, filas: Registro[]): Registro[] {
  const clave = spec?.orden_campo;
  if (!spec || !clave) {
    return [...filas].sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""));
  }
  const es_numerico = NUMERICOS.has(campo_de(spec, clave)?.tipo ?? "");
  const crudo = (f: Registro) => f.valores[clave] ?? "";
  const numero = (f: Registro) => texto_a_numero(crudo(f)) ?? Number.MAX_VALUE;
  const ordenadas = [...filas].sort((a, b) => {
    if (es_numerico) {
      const d = numero(a) - numero(b);
      if (d) return d;
    }
    return crudo(a) < crudo(b) ? -1 : crudo(a) > crudo(b) ? 1 : 0;
  });
  return spec.orden_desc !== false ? ordenadas.reverse() : ordenadas;
}
