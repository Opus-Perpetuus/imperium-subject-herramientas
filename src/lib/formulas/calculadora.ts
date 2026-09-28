import {
  calculados_en_orden,
  campo_de,
  constante_de,
  decimales_de,
  type ConstanteTabla,
  type Registro,
  type ResumenTabla,
  type TablaSpec,
} from "./esquema.ts";
import {
  calcular_agregado,
  evaluar,
  parsear_agregado,
  parsear_nivel,
  texto_a_numero,
  a_texto,
  type Ambito,
  type Resultado,
  type Valor,
} from "./motor.ts";

/**
 * Todo el cálculo de una tabla, sin estado: entra un esquema con registros y
 * sale texto ya formateado.
 */

/**
 * Evalúa los calculados de un registro en orden de dependencia; cada resultado
 * se inyecta en el mapa para que la siguiente fórmula lo encuentre listo.
 * `filas` son todos los registros de la tabla (agregados y funciones por fila).
 */
export function calcular_valores(
  spec: TablaSpec,
  capturados: Record<string, string>,
  filas: Registro[],
): Record<string, string> {
  const resueltos = { ...capturados };
  const ambito = ambito_tabla(spec, resueltos, filas);
  for (const campo of calculados_en_orden(spec)) {
    const formula = campo.formula?.trim();
    if (!formula) continue;
    resueltos[campo.clave] = presentar(evaluar(formula, ambito), decimales_de(campo));
  }
  return resueltos;
}

/** Solo los calculados de un mapa ya resuelto (lo que se guarda en `calculados`). */
export function calculados_de(spec: TablaSpec, valores: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    spec.campos.filter((c) => c.tipo === "calculado").map((c) => [c.clave, valores[c.clave] ?? ""]),
  );
}

/**
 * Los resúmenes, formateados. Se evalúan sin registro actual: una clave de
 * campo suelta vale vacío; valen los fijos, los agregados y las funciones por fila.
 */
export function valores_resumen(
  spec: TablaSpec,
  filas: Registro[],
): { resumen: ResumenTabla; texto: string }[] {
  const ambito = ambito_tabla(spec, {}, filas);
  return spec.resumenes.map((resumen) => ({
    resumen,
    texto: presentar(evaluar(resumen.formula, ambito), decimales_de(resumen)),
  }));
}

/** El mundo que ve una fórmula: el registro actual, los fijos, los agregados y un ámbito por fila. */
function ambito_tabla(
  spec: TablaSpec,
  valores_registro: Record<string, string>,
  filas: Registro[],
): Ambito {
  const agregados = new Map<string, number>();
  let ambitos_fila: Ambito[] | null = null;
  return {
    valor(clave) {
      const agregado = parsear_agregado(clave);
      if (agregado) {
        let n = agregados.get(clave);
        if (n === undefined) {
          const valores = filas
            .map((f) => numero_de(spec, f.valores, agregado.campo))
            .filter((v): v is number => v !== null);
          n = calcular_agregado(agregado.tipo, valores);
          agregados.set(clave, n);
        }
        return n;
      }
      const constante = constante_de(spec, clave);
      if (constante) return valor_constante(constante);
      return valor_de(spec, valores_registro, clave);
    },
    filas() {
      ambitos_fila ??= filas.map((f) => ambito_fila(spec, f.valores));
      return ambitos_fila;
    },
  };
}

/** Un registro visto desde dentro: sus campos y los fijos, sin filas (evita el cuadrado). */
function ambito_fila(spec: TablaSpec, valores: Record<string, string>): Ambito {
  return {
    valor(clave) {
      const constante = constante_de(spec, clave);
      if (constante) return valor_constante(constante);
      return valor_de(spec, valores, clave);
    },
  };
}

/** Un fijo entra como lo que parece: número si se lee como número, texto si no. */
function valor_constante(constante: ConstanteTabla): Valor {
  const raw = (constante.valor ?? "").trim();
  if (!raw) return null;
  return texto_a_numero(raw) ?? constante.valor ?? "";
}

/** El error se guarda como texto en el propio valor para que la pantalla lo muestre. */
export function presentar(resultado: Resultado, decimales: number): string {
  if (!resultado.ok) return `⚠ ${resultado.error}`;
  return typeof resultado.valor === "number"
    ? formatear(resultado.valor, decimales)
    : a_texto(resultado.valor);
}

/**
 * Valor crudo de un campo → tipo con el que opera el motor. Booleanos 1/0;
 * fechas y horas como TEXTO (el ISO ordena igual que el calendario).
 */
export function valor_de(
  spec: TablaSpec,
  valores: Record<string, string>,
  clave: string,
): Valor | undefined {
  const raw = valores[clave];
  if (raw === undefined) return undefined;
  if (raw === "") return null;
  if (raw.startsWith("⚠")) return undefined;
  const campo = campo_de(spec, clave);
  switch (campo?.tipo) {
    case "booleano":
      return raw.trim().toLowerCase() === "true" ? 1 : 0;
    case "fecha":
    case "hora":
    case "fecha_hora":
      return raw;
    case "nivel":
      return parsear_nivel(raw, campo.capacidad ?? null) ?? raw;
    case "texto":
    case "nota":
    case "opcion":
    case "geo":
      return raw;
    default:
      return parsear_nivel(raw, campo?.capacidad ?? null) ?? texto_a_numero(raw) ?? raw;
  }
}

/** Como `valor_de`, pero solo si es numérico; para los agregados. */
export function numero_de(
  spec: TablaSpec,
  valores: Record<string, string>,
  clave: string,
): number | null {
  const v = valor_de(spec, valores, clave);
  return typeof v === "number" ? v : null;
}

/** Redondeo mitad hacia arriba con punto decimal, sin depender del locale. */
export function formatear(valor: number, decimales: number): string {
  if (decimales <= 0) return String(Math.trunc(valor));
  const factor = Math.pow(10, decimales);
  const escalado = Math.round(Math.abs(valor) * factor);
  const signo = valor < 0 ? "-" : "";
  const entero = Math.floor(escalado / factor);
  const fraccion = String(escalado % factor).padStart(decimales, "0");
  return `${signo}${entero}.${fraccion}`;
}
