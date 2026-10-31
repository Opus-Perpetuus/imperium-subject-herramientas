import {
  calculados_en_orden,
  campo_de,
  type CampoSpec,
  constante_de,
  decimales_de,
  normalizar_nombre,
  type ConstanteTabla,
  type Registro,
  type ResumenTabla,
  type TablaSpec,
} from "./esquema.ts";
import { ids_referencia } from "./multivalor.ts";
import {
  columna_de,
  columnas_de,
  filas_de_ruta,
  filas_de_subtabla,
  juntar,
  partir_elemento,
  partir_ruta,
  spec_de_subtabla,
  subtabla_de,
  texto_de_subtabla,
  type FilaSubtabla,
} from "./subtabla.ts";
import {
  calcular_agregado,
  evaluar,
  partir_enlace,
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
 *
 * Otras tablas (`tabla_suma("Ventas", …)`, `{cliente.telefono}`) llegan ya
 * cargadas y recalculadas en `ContextoCalculo.externas`; aquí no se lee la base.
 */

/** Otra tabla con sus filas ya recalculadas. */
export type TablaCargada = { spec: TablaSpec; filas: Registro[] };

/** Cómo encontrar otra tabla por el nombre (o id) que se escribió en la fórmula. */
export type Externas = {
  /** Por nombre o id tal como aparece en la fórmula; `{ error }` se ve en la celda. */
  por_nombre(nombre: string): TablaCargada | { error: string };
  /** Por id (el `tabla_ref_id` de un campo referencia); `null` si no se cargó. */
  por_id(id: string): TablaCargada | null;
};

/**
 * Lo que comparten todos los cálculos de una misma vista: las otras tablas y
 * los resultados que no dependen del registro (una `tabla_suma` sin
 * `{actual:…}` se calcula una vez por vista, no una por fila).
 */
export type ContextoCalculo = {
  externas?: Externas;
  compartido?: Map<object, Valor>;
};

const CONTEXTOS = new WeakMap<object, ContextoCalculo>();

/**
 * Recuerda con qué otras tablas se recalcularon estas filas, para que los
 * resúmenes (que reciben solo las filas, a veces filtradas u ordenadas) usen las mismas.
 */
export function asociar_contexto<T extends Registro[]>(filas: T, contexto: ContextoCalculo): T {
  CONTEXTOS.set(filas, contexto);
  for (const f of filas) CONTEXTOS.set(f, contexto);
  return filas;
}

export function contexto_de(filas: Registro[]): ContextoCalculo {
  return CONTEXTOS.get(filas) ?? (filas[0] ? CONTEXTOS.get(filas[0]) : undefined) ?? {};
}

/** Ámbitos de fila y búsqueda por id de cada lista de filas; viven mientras viva la lista. */
const AMBITOS = new WeakMap<Registro[], { filas: Ambito[]; por_id: Map<string, Registro> }>();

/**
 * Evalúa los calculados de un registro en orden de dependencia; cada resultado
 * se inyecta en el mapa para que la siguiente fórmula lo encuentre listo.
 * `filas` son todos los registros de la tabla (agregados y funciones por fila).
 */
export function calcular_valores(
  spec: TablaSpec,
  capturados: Record<string, string>,
  filas: Registro[],
  contexto: ContextoCalculo = {},
  id?: string,
): Record<string, string> {
  const resueltos = { ...capturados };
  const ambito = ambito_tabla(spec, resueltos, filas, contexto, id);
  // Las columnas calculadas de cada subtabla van antes: los calculados del registro las leen.
  for (const campo of spec.campos) {
    if (campo.tipo !== "subtabla" || !campo.columnas?.some((c) => c.tipo === "calculado")) continue;
    const raw = resueltos[campo.clave];
    if (!raw) continue;
    resueltos[campo.clave] = calcular_subtabla(spec, campo, resueltos, contexto, ambito);
  }
  for (const campo of calculados_en_orden(spec)) {
    const formula = campo.formula?.trim();
    if (!formula) continue;
    resueltos[campo.clave] = presentar(evaluar(formula, ambito), decimales_de(campo));
  }
  return resueltos;
}

/**
 * Las columnas calculadas de una subtabla, fila por fila, ya presentadas para
 * guardarse junto a la fila. En su fórmula `{x}` es la columna de la fila (o,
 * si no es de la fila, la del registro capturado), `{actual:x}` el registro y
 * `sumasi` recorre las demás filas de la subtabla.
 */
function calcular_subtabla(
  spec: TablaSpec,
  campo: CampoSpec,
  valores: Record<string, string>,
  contexto: ContextoCalculo,
  padre: Ambito,
): string {
  const calculadas = columnas_de(campo).filter((c) => c.tipo === "calculado" && c.formula?.trim());
  const ambitos = ambitos_subtabla(spec, campo, valores, contexto, padre);
  const filas = filas_de_subtabla(valores[campo.clave]).map((f, i) => {
    const out: FilaSubtabla = { ...f };
    for (const c of calculadas) out[c.clave] = presentar(ambitos[i]!.resultado(c.clave), decimales_de(c));
    return out;
  });
  return texto_de_subtabla(filas);
}

/** Lo del registro que ve una fila de subtabla detrás de sus columnas: lo capturado, sin subtablas. */
function base_de_filas(spec: TablaSpec, valores: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const c of spec.campos) {
    if (c.tipo === "calculado" || c.tipo === "subtabla") continue;
    const v = valores[c.clave];
    if (v !== undefined) out[c.clave] = v;
  }
  return out;
}

type AmbitoDeFila = Ambito & { resultado(clave: string): Resultado };

/**
 * Un ámbito por fila de la subtabla: su columna o, si no es suya, la del
 * registro. Las columnas calculadas se evalúan al leerlas (no se guardan), así
 * también valen en la fila de un registro de otra tabla.
 */
function ambitos_subtabla(
  spec: TablaSpec,
  campo: CampoSpec,
  valores: Record<string, string>,
  contexto: ContextoCalculo,
  padre?: Ambito,
): AmbitoDeFila[] {
  const filas = filas_de_subtabla(valores[campo.clave]);
  if (!filas.length) return [];
  const sspec = spec_de_subtabla(spec, campo);
  const base = base_de_filas(spec, valores);
  // `{actual:x}` es el registro; sin `compartido`: lo de una fila no vale para la de otro registro.
  const raiz: Ambito = padre
    ? { ...padre, compartido: undefined }
    : { valor: (k) => valor_en(spec, valores, k, contexto, undefined), subtabla: subtabla_en(spec, valores, contexto) };
  const formulas = new Map(
    columnas_de(campo)
      .filter((c) => c.tipo === "calculado")
      .map((c) => [c.clave, c.formula?.trim() ?? ""]),
  );
  const lista: AmbitoDeFila[] = [];
  for (const f of filas) {
    const vivos: Record<string, string> = { ...base, ...f };
    for (const k of formulas.keys()) delete vivos[k];
    const hechos = new Map<string, Resultado>();
    const ambito: AmbitoDeFila = {
      valor(clave) {
        if (!formulas.has(clave)) return valor_en(sspec, vivos, clave, contexto, f._id);
        const r = ambito.resultado(clave);
        return r.ok ? r.valor : undefined;
      },
      resultado(clave) {
        let r = hechos.get(clave);
        if (!r) {
          // Un ciclo entre columnas lo rechaza la validación; aquí solo no se cuelga.
          hechos.set(clave, { ok: false, error: `«${clave}» depende de sí misma` });
          const formula = formulas.get(clave) ?? "";
          r = formula ? evaluar(formula, ambito, raiz) : { ok: true, valor: null };
          hechos.set(clave, r);
        }
        return r;
      },
      filas: () => lista,
    };
    lista.push(ambito);
  }
  return lista;
}

/** `sub_*("nombre", …)`: las filas de esa subtabla del registro; `null` si no es una. */
function subtabla_en(spec: TablaSpec, valores: Record<string, string>, contexto: ContextoCalculo) {
  return (nombre: string): Ambito[] | null => {
    const campo = subtabla_de(spec, nombre);
    return campo ? ambitos_subtabla(spec, campo, valores, contexto) : null;
  };
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
  contexto: ContextoCalculo = contexto_de(filas),
): { resumen: ResumenTabla; texto: string }[] {
  const ambito = ambito_tabla(spec, {}, filas, { ...contexto, compartido: new Map() });
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
  contexto: ContextoCalculo,
  id?: string,
): Ambito {
  const agregados = new Map<string, number>();
  const propia: TablaCargada = { spec, filas };
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
      return valor_en(spec, valores_registro, clave, contexto, id);
    },
    filas() {
      return ambitos_de(propia, contexto).filas;
    },
    tabla(nombre) {
      if (nombre === spec.id || normalizar_nombre(nombre) === normalizar_nombre(spec.name)) {
        return { filas: ambitos_de(propia, contexto).filas };
      }
      if (!contexto.externas) return { error: `No se pudo leer la tabla «${nombre}»` };
      const t = contexto.externas.por_nombre(nombre);
      return "error" in t ? t : { filas: ambitos_de(t, contexto).filas };
    },
    subtabla: subtabla_en(spec, valores_registro, contexto),
    compartido: contexto.compartido,
  };
}

function ambitos_de(tabla: TablaCargada, contexto: ContextoCalculo): { filas: Ambito[]; por_id: Map<string, Registro> } {
  let a = AMBITOS.get(tabla.filas);
  if (!a) {
    a = {
      filas: tabla.filas.map((f) => ambito_fila(tabla.spec, f, contexto)),
      por_id: new Map(tabla.filas.map((f) => [f.id, f])),
    };
    AMBITOS.set(tabla.filas, a);
  }
  return a;
}

/** Un registro visto desde dentro: sus campos y los fijos, sin filas (evita el cuadrado). */
function ambito_fila(spec: TablaSpec, fila: Registro, contexto: ContextoCalculo): Ambito {
  return {
    valor: (clave) => valor_en(spec, fila.valores, clave, contexto, fila.id),
    subtabla: subtabla_en(spec, fila.valores, contexto),
  };
}

/** Un campo, un fijo, `_id` o `{referencia.columna}` del registro dado. */
function valor_en(
  spec: TablaSpec,
  valores: Record<string, string>,
  clave: string,
  contexto: ContextoCalculo,
  id: string | undefined,
): Valor | undefined {
  if (clave === "_id") return id ?? null;
  const constante = constante_de(spec, clave);
  if (constante) return valor_constante(constante);
  const directo = valor_de(spec, valores, clave);
  if (directo !== undefined) return directo;
  const enlace = partir_enlace(clave);
  return enlace ? valor_enlazado(spec, valores, enlace, contexto) : undefined;
}

/**
 * `{cliente.telefono}`: la columna del registro al que apunta el campo
 * referencia. Con varios enlazados, los números se suman y los textos se juntan.
 */
function valor_enlazado(
  spec: TablaSpec,
  valores: Record<string, string>,
  enlace: { campo: string; columna: string },
  contexto: ContextoCalculo,
): Valor | undefined {
  const campo = campo_de(spec, enlace.campo);
  if (campo?.tipo === "subtabla") return valor_de_ruta(spec, campo, valores, enlace.columna, contexto);
  if (campo?.tipo !== "referencia" || !campo.tabla_ref_id) return undefined;
  const ids = ids_referencia(valores[campo.clave] ?? "");
  if (!ids.length) return null;
  const destino = contexto.externas?.por_id(campo.tabla_ref_id);
  if (!destino) return undefined;
  const { por_id } = ambitos_de(destino, contexto);
  const sub = campo.ref_subtabla ? campo_de(destino.spec, campo.ref_subtabla) : undefined;
  const subtabla = sub?.tipo === "subtabla" ? sub : undefined;
  const encontrados = ids
    .map((id) => {
      const { registro, fila } = partir_elemento(id);
      const f = por_id.get(registro);
      if (!f) return undefined;
      if (enlace.columna === "_id") return id;
      // Una fila elegida: su columna primero, luego la del registro.
      if (subtabla && fila && columna_de(subtabla, enlace.columna)) {
        const i = filas_de_subtabla(f.valores[subtabla.clave]).findIndex((x) => x._id === fila);
        if (i < 0) return null;
        return ambitos_subtabla(destino.spec, subtabla, f.valores, contexto)[i]!.valor(enlace.columna) ?? null;
      }
      const propio = valor_en(destino.spec, f.valores, enlace.columna, contexto, f.id);
      if (propio !== undefined || !subtabla) return propio;
      // La subtabla completa: la columna de todas sus filas.
      return valor_de_ruta(destino.spec, subtabla, f.valores, enlace.columna, contexto);
    })
    .filter((v): v is Valor => v !== undefined);
  if (!encontrados.length) return null;
  if (encontrados.length === 1) return encontrados[0]!;
  if (encontrados.every((v) => typeof v === "number")) return (encontrados as number[]).reduce((a, b) => a + b, 0);
  return encontrados.map(a_texto).filter(Boolean).join(", ");
}

/** `{items.cantidad}`, `{items.2.cantidad}`, `{items.ultima.cantidad}`: celdas de la subtabla juntas. */
function valor_de_ruta(
  spec: TablaSpec,
  campo: CampoSpec,
  valores: Record<string, string>,
  ruta_texto: string,
  contexto: ContextoCalculo,
): Valor | undefined {
  const ruta = partir_ruta(ruta_texto);
  if (ruta.column !== "_id" && !columna_de(campo, ruta.column)) return undefined;
  const filas = filas_de_ruta(ambitos_subtabla(spec, campo, valores, contexto), ruta);
  const junto = juntar(filas.map((a) => a.valor(ruta.column)));
  // Sin filas, la suma de una columna de números es 0 (un carrito vacío cuesta 0, no «nada»).
  if (junto === null && ruta.row === "all" && NUMERICAS.has(columna_de(campo, ruta.column)?.tipo ?? "texto")) return 0;
  return junto;
}

const NUMERICAS: ReadonlySet<string> = new Set(["numero", "dinero", "entero", "nivel", "calculado"]);

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
  const raw = Object.hasOwn(valores, clave) ? valores[clave] : undefined;
  const campo = campo_de(spec, clave);
  // `{items}`: cuántas filas tiene (0 si aún no tiene ninguna).
  if (campo?.tipo === "subtabla") return filas_de_subtabla(raw ?? "").length;
  if (raw === undefined) return undefined;
  if (raw === "") return null;
  if (raw.startsWith("⚠")) return undefined;
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
    case "codigo":
    case "nota":
    case "opcion":
    case "geo":
      return raw;
    case "referencia":
      return ids_referencia(raw).join("|");
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
