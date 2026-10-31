/**
 * Motor de fórmulas de los campos calculados, los valores fijos y los resúmenes.
 *
 * ```
 *   {km_final} - {km_inicial}
 *   si({estado} == "pagado", {monto}, 0)
 *   sumasi({monto}, {estado} == "pagado" y {moto} == "Italika")
 *   "Moto: " + {moto}
 *   round({promedio}, 2)
 *   sumasi({monto}, {moto} == {actual:moto})            ← {actual:x}: el registro que se calcula
 *   tabla_suma("Ventas", {cantidad}, {producto} == {actual:nombre} y ({estado} == "pagado" o {credito}))
 *   tabla_buscar("Clientes", {telefono}, {_id} == {actual:cliente})
 *   {cliente.telefono}                                   ← columna del registro enlazado
 * ```
 *
 * Se analiza una vez a un árbol (sin `eval`) y el árbol se evalúa por registro.
 * Las funciones `tabla_*` leen otra tabla: dentro de sus argumentos `{x}` es la
 * columna `x` de ESA tabla y `{actual:x}` la del registro que se calcula.
 *
 * Dos clases de valor, número y texto, y se decide mirando el dato: `"2" + 3` son 5 y
 * `"pagado" == "Pagado"` es cierto. El vacío (`null`) no es lo mismo que `0` aunque
 * sume como cero: `vacio({nota})` tiene que poder distinguirlos.
 */

/** `null` = campo sin capturar. */
export type Valor = null | number | string;

/** Lo que el motor necesita del mundo exterior. `undefined` = la clave no significa nada aquí. */
export type Ambito = {
  valor(clave: string): Valor | undefined;
  /** Un ámbito por registro de la tabla; solo lo usan las funciones por fila. */
  filas?(): Ambito[];
  /** Los registros de otra tabla (por nombre o id) para `tabla_*`; `{ error }` se ve en la celda. */
  tabla?(nombre: string): { filas: Ambito[] } | { error: string };
  /**
   * Resultados de `sumasi`/`tabla_*` que no dependen del registro (sin
   * `{actual:…}`), compartidos entre todos los registros de una misma vista:
   * con él una suma sobre otra tabla se calcula una vez, no una por fila.
   */
  compartido?: Map<object, Valor>;
};

export type Resultado = { ok: true; valor: Valor } | { ok: false; error: string };

const CLAVE_VALIDA = /^[A-Za-z0-9_:.]+$/;
const NIVEL = /^\s*([0-9]+(?:[.,][0-9]+)?)\s*\/\s*([0-9]+)\s*$/;
const NUMERO = /^[+-]?(?:[0-9]+\.?[0-9]*|\.[0-9]+)(?:[eE][+-]?[0-9]+)?$/;

/** Funciones por fila de la misma tabla → qué hacen con lo que casa. */
const FUNCIONES_FILA: Record<string, Agregacion> = {
  sumasi: "suma", sumif: "suma",
  cuentasi: "cuenta", countif: "cuenta",
  promediosi: "promedio", averageif: "promedio",
  minimosi: "minimo", minif: "minimo",
  maximosi: "maximo", maxif: "maximo",
  buscarsi: "buscar", lookupif: "buscar",
  unirsi: "unir", joinif: "unir",
};

/** Funciones sobre otra tabla: el primer argumento es su nombre (o id) entre comillas. */
const FUNCIONES_TABLA: Record<string, Agregacion> = {
  tabla_suma: "suma",
  tabla_cuenta: "cuenta",
  tabla_promedio: "promedio",
  tabla_minimo: "minimo",
  tabla_maximo: "maximo",
  tabla_buscar: "buscar",
  tabla_unir: "unir",
};

type Agregacion = TipoAgregado | "buscar" | "unir";

/** `{actual:x}` dentro de una función por fila o de otra tabla: el registro que se calcula. */
export const PREFIJO_ACTUAL = "actual:";

/** Cada nivel multiplica el trabajo por el número de registros. */
export const MAX_PROFUNDIDAD_FILA = 2;

// #region Agregados de columna: {suma:campo}, {promedio:campo}…

export const TIPOS_AGREGADO = {
  suma: "Suma",
  promedio: "Promedio",
  cuenta: "Cuántos",
  minimo: "Mínimo",
  maximo: "Máximo",
} as const;

export type TipoAgregado = keyof typeof TIPOS_AGREGADO;

/** `"suma:pagado"` → suma sobre `pagado`; `null` si no es una referencia agregada. */
export function parsear_agregado(clave: string): { tipo: TipoAgregado; campo: string } | null {
  const dos_puntos = clave.indexOf(":");
  if (dos_puntos <= 0) return null;
  const prefijo = clave.slice(0, dos_puntos).trim().toLowerCase();
  if (!Object.hasOwn(TIPOS_AGREGADO, prefijo)) return null;
  const campo = clave.slice(dos_puntos + 1).trim();
  return campo ? { tipo: prefijo as TipoAgregado, campo } : null;
}

export function ref_agregado(tipo: TipoAgregado, campo: string): string {
  return `{${tipo}:${campo}}`;
}

/** Sobre una columna vacía todas valen 0: una tabla recién creada no es un error. */
export function calcular_agregado(tipo: TipoAgregado, valores: number[]): number {
  switch (tipo) {
    case "suma":
      return valores.reduce((a, b) => a + b, 0);
    case "promedio":
      return valores.length ? valores.reduce((a, b) => a + b, 0) / valores.length : 0;
    case "cuenta":
      return valores.length;
    case "minimo":
      return valores.length ? Math.min(...valores) : 0;
    case "maximo":
      return valores.length ? Math.max(...valores) : 0;
  }
}

// #endregion

// #region Valores

/** Texto de un número sin decimales inventados: 3.0 → «3», 3.5 → «3.5». */
export function numero_a_texto(n: number): string {
  return Number.isFinite(n) && n === Math.floor(n) && Math.abs(n) < 1e15
    ? String(Math.trunc(n))
    : String(n);
}

/** Número de un texto (acepta coma decimal) o `null` si no lo es. */
export function texto_a_numero(raw: string): number | null {
  const t = raw.trim().replace(/,/g, ".");
  return NUMERO.test(t) ? Number(t) : null;
}

export function a_texto(v: Valor): string {
  if (v === null) return "";
  return typeof v === "number" ? numero_a_texto(v) : v;
}

/** El número que representa, o `null` si el texto no es uno. El vacío vale 0. */
export function a_numero_o_null(v: Valor): number | null {
  if (v === null) return 0;
  if (typeof v === "number") return v;
  return texto_a_numero(v);
}

export function a_numero(v: Valor): number {
  return a_numero_o_null(v) ?? 0;
}

/** Qué cuenta como «cierto» en un `si(...)`: todo salvo cero, vacío y blancos. */
export function es_verdadero(v: Valor): boolean {
  const n = a_numero_o_null(v);
  return n !== null ? n !== 0 : a_texto(v).trim() !== "";
}

/**
 * Valor textual de un campo nivel (o número legado).
 * - `"3/6"` con capacidad 12 → 6 · `"3/6"` sin capacidad → 0.5 · `"6,5"` → 6.5
 */
export function parsear_nivel(raw: string, capacidad: number | null = null): number | null {
  const t = raw.trim();
  if (!t) return null;
  const m = NIVEL.exec(t);
  if (m) {
    const paso = Number(m[1]!.replace(",", "."));
    const pasos = Number(m[2]);
    if (!Number.isFinite(paso) || !(pasos > 0)) return null;
    const fraccion = Math.min(1, Math.max(0, paso / pasos));
    return capacidad != null ? fraccion * capacidad : fraccion;
  }
  return texto_a_numero(t);
}

/** Ámbito sobre un mapa; las filas son opcionales. */
export function ambito_de(valores: Record<string, Valor>, filas: Ambito[] = []): Ambito {
  return {
    valor: (clave) => (Object.hasOwn(valores, clave) ? valores[clave] : undefined),
    filas: () => filas,
  };
}

/** Toda clave vale lo mismo y toda tabla está vacía: sirve para comprobar la sintaxis antes de tener datos. */
export function ambito_sonda(fijo: Valor = 1): Ambito {
  return { valor: () => fijo, filas: () => [], tabla: () => ({ filas: [] }) };
}

/** Una clave que el ámbito no conoce vale vacío, no error: a media captura casi todas lo están. */
export function evaluar(formula: string, ambito: Ambito): Resultado {
  try {
    const arbol = analizar(formula);
    const valor = evaluar_nodo(arbol, ambito, { raiz: ambito, profundidad: 0 });
    if (typeof valor === "number" && !Number.isFinite(valor)) {
      return { ok: false, error: "Resultado no representable" };
    }
    return { ok: true, valor };
  } catch (e) {
    if (e instanceof ErrorFormula) return { ok: false, error: e.message };
    if (e instanceof RangeError) return { ok: false, error: "Fórmula demasiado anidada" };
    throw e;
  }
}

/** El error de sintaxis de la fórmula, o `null` si se puede evaluar. */
export function error_sintaxis(formula: string): string | null {
  try {
    analizar(formula);
    return null;
  } catch (e) {
    if (e instanceof ErrorFormula) return e.message;
    if (e instanceof RangeError) return "Fórmula demasiado anidada";
    throw e;
  }
}

// #endregion

// #region Dependencias

/** Qué lee una fórmula, separado por tabla. */
export type Referencias = {
  /** Claves de la tabla propia (`actual:x` cuenta como `x`; `{cliente.tel}` como `cliente`). */
  propias: Set<string>;
  /** Las de `propias` que se leen del registro mismo, no de las filas de un `sumasi`. */
  directas: Set<string>;
  /** Otra tabla (tal como se escribió) → claves suyas que se leen. */
  tablas: Map<string, Set<string>>;
  /** `{campo_referencia.columna}` de la tabla propia. */
  enlaces: { campo: string; columna: string }[];
  /** Enlaces dentro de otra tabla: tabla → enlaces. */
  enlaces_tablas: Map<string, { campo: string; columna: string }[]>;
};

/**
 * Las claves que lee la fórmula, cada una en su tabla. Usa el mismo recorrido
 * léxico que `mapear_referencias`, así que también sirve con fórmulas a medio escribir.
 */
export function referencias(formula: string): Referencias {
  const r: Referencias = { propias: new Set(), directas: new Set(), tablas: new Map(), enlaces: [], enlaces_tablas: new Map() };
  mapear_referencias(formula, (clave, tabla, en_filas) => {
    if (!CLAVE_VALIDA.test(clave)) return `{${clave}}`;
    const { clave: limpia, actual } = sin_actual(clave);
    const destino = actual ? null : tabla;
    const enlace = partir_enlace(limpia);
    if (destino === null) {
      if (actual || !en_filas) r.directas.add(enlace ? enlace.campo : limpia);
      if (enlace) {
        r.propias.add(enlace.campo);
        r.enlaces.push(enlace);
      } else {
        r.propias.add(limpia);
      }
    } else {
      let claves = r.tablas.get(destino);
      if (!claves) r.tablas.set(destino, (claves = new Set()));
      if (enlace) {
        claves.add(enlace.campo);
        const lista = r.enlaces_tablas.get(destino) ?? [];
        lista.push(enlace);
        r.enlaces_tablas.set(destino, lista);
      } else {
        claves.add(limpia);
      }
    }
    return `{${clave}}`;
  });
  return r;
}

/** Claves de la tabla propia que aparecen en la fórmula (también las agregadas `suma:x`). */
export function claves_referenciadas(formula: string): Set<string> {
  return referencias(formula).propias;
}

/** `actual:x` → `{ clave: "x", actual: true }`. */
export function sin_actual(clave: string): { clave: string; actual: boolean } {
  return clave.toLowerCase().startsWith(PREFIJO_ACTUAL)
    ? { clave: clave.slice(PREFIJO_ACTUAL.length), actual: true }
    : { clave, actual: false };
}

/** `cliente.telefono` → campo de referencia y columna de la tabla enlazada. */
export function partir_enlace(clave: string): { campo: string; columna: string } | null {
  if (parsear_agregado(clave)) return null;
  const punto = clave.indexOf(".");
  if (punto <= 0 || punto === clave.length - 1) return null;
  return { campo: clave.slice(0, punto), columna: clave.slice(punto + 1) };
}

/**
 * Reescribe cada `{clave}` de la fórmula con `cambiar(clave, tabla)`; `tabla` es el
 * nombre entre comillas de la `tabla_*` que la envuelve, o `null` si es de la tabla
 * propia. Respeta las cadenas: `"{x}"` no es una referencia.
 */
export function mapear_referencias(
  formula: string,
  cambiar: (clave: string, tabla: string | null, en_filas: boolean) => string,
  cambiar_tabla?: (tabla: string) => string,
): string {
  type Marco = { funcion: string; argumento: number; tabla: string | null };
  const pila: Marco[] = [];
  let out = "";
  let i = 0;
  const tabla_vigente = (): string | null => {
    for (let k = pila.length - 1; k >= 0; k--) {
      const m = pila[k]!;
      if (Object.hasOwn(FUNCIONES_TABLA, m.funcion) && m.argumento >= 1) return m.tabla;
    }
    return null;
  };
  while (i < formula.length) {
    const c = formula[i]!;
    if (c === '"' || c === "'") {
      let j = i + 1;
      let texto = "";
      while (j < formula.length && formula[j] !== c) {
        if (formula[j] === "\\" && j + 1 < formula.length) {
          texto += formula[j + 1];
          j += 2;
        } else {
          texto += formula[j++];
        }
      }
      const tope = pila[pila.length - 1];
      if (tope && Object.hasOwn(FUNCIONES_TABLA, tope.funcion) && tope.argumento === 0 && tope.tabla === null) {
        tope.tabla = texto.trim();
        if (cambiar_tabla && j < formula.length) {
          const nueva = cambiar_tabla(tope.tabla);
          if (nueva !== tope.tabla) {
            out += JSON.stringify(nueva);
            i = j + 1;
            continue;
          }
        }
      }
      out += formula.slice(i, j + 1);
      i = j + 1;
    } else if (c === "{") {
      const fin = formula.indexOf("}", i);
      if (fin < 0) {
        out += formula.slice(i);
        break;
      }
      const clave = formula.slice(i + 1, fin);
      const en_filas = pila.some((m) => Object.hasOwn(FUNCIONES_FILA, m.funcion) || Object.hasOwn(FUNCIONES_TABLA, m.funcion));
      out += /^[^{}"]*$/.test(clave) ? cambiar(clave, tabla_vigente(), en_filas) : formula.slice(i, fin + 1);
      i = fin + 1;
    } else if (es_letra(c)) {
      let j = i;
      while (j < formula.length && es_letra_o_digito(formula[j]!)) j++;
      let k = j;
      while (k < formula.length && /\s/.test(formula[k]!)) k++;
      if (formula[k] === "(") {
        pila.push({ funcion: formula.slice(i, j).toLowerCase(), argumento: 0, tabla: null });
        out += formula.slice(i, k + 1);
        i = k + 1;
      } else {
        out += formula.slice(i, j);
        i = j;
      }
    } else {
      if (c === "(") pila.push({ funcion: "", argumento: 0, tabla: null });
      else if (c === ")") pila.pop();
      else if (c === ",") {
        const tope = pila[pila.length - 1];
        if (tope) tope.argumento++;
      }
      out += c;
      i++;
    }
  }
  return out;
}

/** Las tablas que nombra la fórmula en sus `tabla_*`. */
export function tablas_referenciadas(formula: string): Set<string> {
  return new Set(referencias(formula).tablas.keys());
}

/** Los nombres de las funciones que leen otra tabla, para la ayuda. */
export const NOMBRES_FUNCIONES_TABLA = Object.keys(FUNCIONES_TABLA);

// #endregion

// #region Árbol

class ErrorFormula extends Error {}

type Nodo =
  | { t: "valor"; v: Valor }
  | { t: "ref"; clave: string; actual: boolean }
  | { t: "neg"; a: Nodo }
  | { t: "op"; op: string; a: Nodo; b: Nodo }
  | { t: "y" | "o"; a: Nodo; b: Nodo }
  | { t: "si"; c: Nodo; a: Nodo; b: Nodo }
  | { t: "fn"; nombre: string; args: Nodo[] }
  | {
      t: "filas";
      nombre: string;
      agregacion: Agregacion;
      /** `null` = las filas de la tabla propia. */
      tabla: string | null;
      valor: Nodo | null;
      condicion: Nodo | null;
      separador: Nodo | null;
      /** Lee `{actual:…}`: depende del registro y no se comparte. */
      usa_actual: boolean;
    };

const CACHE_ARBOLES = new Map<string, Nodo | ErrorFormula>();
const MAX_CACHE_ARBOLES = 2000;

/** El árbol de la fórmula; se guarda por texto porque las mismas fórmulas se evalúan una vez por registro. */
function analizar(formula: string): Nodo {
  let r = CACHE_ARBOLES.get(formula);
  if (r === undefined) {
    try {
      r = new Analizador(formula).analizar_todo();
    } catch (e) {
      if (!(e instanceof ErrorFormula)) throw e;
      r = e;
    }
    if (CACHE_ARBOLES.size >= MAX_CACHE_ARBOLES) CACHE_ARBOLES.delete(CACHE_ARBOLES.keys().next().value!);
    CACHE_ARBOLES.set(formula, r);
  }
  if (r instanceof ErrorFormula) throw r;
  return r;
}

/** Aridad de las funciones simples: [mínimo, máximo]. */
const FUNCIONES: Record<string, [number, number]> = {
  abs: [1, 1], min: [2, Infinity], max: [2, Infinity], sum: [0, Infinity], avg: [0, Infinity],
  round: [1, 2], redondear: [1, 2], floor: [1, 1], ceil: [1, 1], sqrt: [1, 1],
  no: [1, 1], not: [1, 1], texto: [1, 1], text: [1, 1], numero: [1, 1], number: [1, 1],
  concat: [0, Infinity], unir: [0, Infinity],
  contiene: [2, 2], contains: [2, 2], empieza: [2, 2], startswith: [2, 2], termina: [2, 2], endswith: [2, 2],
  largo: [1, 1], length: [1, 1], mayus: [1, 1], upper: [1, 1], minus: [1, 1], lower: [1, 1],
  vacio: [1, 1], empty: [1, 1],
};

const es_digito = (c: string) => c >= "0" && c <= "9";
const es_letra = (c: string) => /\p{L}/u.test(c);
const es_letra_o_digito = (c: string) => /[\p{L}\p{N}_]/u.test(c);

function bool(v: boolean): Valor {
  return v ? 1 : 0;
}

function numeros_iguales(a: number, b: number): boolean {
  return Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));
}

/** Como números si los dos lados lo son; como texto (sin mayúsculas ni espacios de sobra) si no. */
function comparar(op: string, izq: Valor, der: Valor): boolean {
  const a = a_numero_o_null(izq);
  const b = a_numero_o_null(der);
  if (a !== null && b !== null) {
    switch (op) {
      case ">=": return a >= b || numeros_iguales(a, b);
      case "<=": return a <= b || numeros_iguales(a, b);
      case "==": return numeros_iguales(a, b);
      case "!=": return !numeros_iguales(a, b);
      case ">": return a > b && !numeros_iguales(a, b);
      default: return a < b && !numeros_iguales(a, b);
    }
  }
  const x = a_texto(izq).trim().toLowerCase();
  const y = a_texto(der).trim().toLowerCase();
  const c = x < y ? -1 : x > y ? 1 : 0;
  switch (op) {
    case ">=": return c >= 0;
    case "<=": return c <= 0;
    case "==": return c === 0;
    case "!=": return c !== 0;
    case ">": return c > 0;
    default: return c < 0;
  }
}

function usa_actual(n: Nodo | null): boolean {
  if (!n) return false;
  switch (n.t) {
    case "valor": return false;
    case "ref": return n.actual;
    case "neg": return usa_actual(n.a);
    case "op": case "y": case "o": return usa_actual(n.a) || usa_actual(n.b);
    case "si": return usa_actual(n.c) || usa_actual(n.a) || usa_actual(n.b);
    case "fn": return n.args.some(usa_actual);
    case "filas": return n.usa_actual;
  }
}

/** Descenso recursivo que construye el árbol; no evalúa nada. */
class Analizador {
  private pos = 0;
  /** Funciones de filas abiertas alrededor de la posición actual. */
  private anidadas = 0;

  constructor(private readonly src: string) {}

  analizar_todo(): Nodo {
    const nodo = this.expresion();
    this.saltar_espacios();
    if (this.pos < this.src.length) this.fallar(`Sobra «${this.src.slice(this.pos)}»`);
    return nodo;
  }

  private expresion(): Nodo {
    return this.o();
  }

  private o(): Nodo {
    let izq = this.y();
    for (;;) {
      this.saltar_espacios();
      if (!this.palabra("o") && !this.palabra("or") && !this.token("||")) return izq;
      izq = { t: "o", a: izq, b: this.y() };
    }
  }

  private y(): Nodo {
    let izq = this.comparacion();
    for (;;) {
      this.saltar_espacios();
      if (!this.palabra("y") && !this.palabra("and") && !this.token("&&")) return izq;
      izq = { t: "y", a: izq, b: this.comparacion() };
    }
  }

  private comparacion(): Nodo {
    const izq = this.aditiva();
    this.saltar_espacios();
    let op: string;
    if (this.token(">=")) op = ">=";
    else if (this.token("<=")) op = "<=";
    else if (this.token("<>")) op = "!=";
    else if (this.token("==")) op = "==";
    else if (this.token("!=")) op = "!=";
    else if (this.token("=")) op = "==";
    else if (this.token(">")) op = ">";
    else if (this.token("<")) op = "<";
    else return izq;
    return { t: "op", op, a: izq, b: this.aditiva() };
  }

  private aditiva(): Nodo {
    let nodo = this.multiplicativa();
    for (;;) {
      this.saltar_espacios();
      if (this.token("+")) nodo = { t: "op", op: "+", a: nodo, b: this.multiplicativa() };
      else if (this.token("-")) nodo = { t: "op", op: "-", a: nodo, b: this.multiplicativa() };
      else return nodo;
    }
  }

  private multiplicativa(): Nodo {
    let nodo = this.unaria();
    for (;;) {
      this.saltar_espacios();
      let op: string;
      if (this.token("*")) op = "*";
      else if (this.token("/")) op = "/";
      else if (this.token("%")) op = "%";
      else if (this.token("^")) op = "^";
      else return nodo;
      nodo = { t: "op", op, a: nodo, b: this.unaria() };
    }
  }

  private unaria(): Nodo {
    this.saltar_espacios();
    if (this.token("-")) return { t: "neg", a: this.unaria() };
    if (this.token("+")) return { t: "op", op: "+0", a: this.unaria(), b: { t: "valor", v: 0 } };
    return this.primaria();
  }

  private primaria(): Nodo {
    this.saltar_espacios();
    if (this.pos >= this.src.length) this.fallar("Fórmula incompleta");
    const c = this.src[this.pos]!;
    if (c === "(") {
      this.pos++;
      const nodo = this.expresion();
      this.saltar_espacios();
      if (!this.token(")")) this.fallar("Falta «)»");
      return nodo;
    }
    if (c === "{") {
      const fin = this.src.indexOf("}", this.pos);
      if (fin < 0) this.fallar("Falta «}»");
      const { clave, actual } = sin_actual(this.src.slice(this.pos + 1, fin));
      this.pos = fin + 1;
      return { t: "ref", clave, actual };
    }
    if (c === '"' || c === "'") return { t: "valor", v: this.cadena(c) };
    if (es_digito(c) || c === ".") return { t: "valor", v: this.numero() };
    if (es_letra(c)) return this.funcion();
    return this.fallar(`No se entiende «${c}»`);
  }

  private cadena(comilla: string): string {
    this.pos++;
    let out = "";
    while (this.pos < this.src.length) {
      const c = this.src[this.pos]!;
      if (c === "\\" && this.pos + 1 < this.src.length) {
        const s = this.src[this.pos + 1]!;
        out += s === "n" ? "\n" : s === "t" ? "\t" : s;
        this.pos += 2;
      } else if (c === comilla) {
        this.pos++;
        return out;
      } else {
        out += c;
        this.pos++;
      }
    }
    return this.fallar("Falta la comilla de cierre");
  }

  private numero(): number {
    const inicio = this.pos;
    while (this.pos < this.src.length && (es_digito(this.src[this.pos]!) || this.src[this.pos] === ".")) {
      this.pos++;
    }
    const t = this.src.slice(inicio, this.pos);
    const n = NUMERO.test(t) ? Number(t) : NaN;
    if (!Number.isFinite(n)) this.fallar(`Número inválido «${t}»`);
    return n;
  }

  private funcion(): Nodo {
    const inicio = this.pos;
    while (this.pos < this.src.length && es_letra_o_digito(this.src[this.pos]!)) this.pos++;
    const nombre = this.src.slice(inicio, this.pos).toLowerCase();
    this.saltar_espacios();
    if (!this.token("(")) {
      this.fallar(`«${nombre}» necesita paréntesis; si querías el texto, ponlo entre comillas: "${nombre}"`);
    }
    if (Object.hasOwn(FUNCIONES_FILA, nombre)) return this.funcion_filas(nombre, false);
    if (Object.hasOwn(FUNCIONES_TABLA, nombre)) return this.funcion_filas(nombre, true);
    const args = this.argumentos(nombre);
    if (nombre === "si" || nombre === "if") {
      if (args.length !== 3) this.fallar(`«${nombre}» necesita condición, valor y alternativa`);
      return { t: "si", c: args[0]!, a: args[1]!, b: args[2]! };
    }
    const aridad = Object.hasOwn(FUNCIONES, nombre) ? FUNCIONES[nombre] : undefined;
    if (!aridad) this.fallar(`Función desconocida «${nombre}»`);
    const [min, max] = aridad;
    if (args.length < min || args.length > max) {
      if (nombre === "round" || nombre === "redondear") this.fallar("round necesita un valor");
      if (min === max) this.fallar(`«${nombre}» necesita ${min === 1 ? "un argumento" : "dos argumentos"}`);
      this.fallar(`«${nombre}» necesita al menos ${min} argumentos`);
    }
    return { t: "fn", nombre, args };
  }

  private argumentos(nombre: string): Nodo[] {
    const args: Nodo[] = [];
    this.saltar_espacios();
    if (!this.token(")")) {
      do {
        args.push(this.expresion());
        this.saltar_espacios();
      } while (this.token(","));
      if (!this.token(")")) this.fallar(`Falta «)» en «${nombre}»`);
    }
    return args;
  }

  /**
   * `sumasi(valor, condición)` y `tabla_suma("Tabla", valor[, condición])`: dentro,
   * `{x}` es la columna de CADA fila, no del registro que se calcula.
   */
  private funcion_filas(nombre: string, de_tabla: boolean): Nodo {
    this.anidadas++;
    if (this.anidadas > MAX_PROFUNDIDAD_FILA) {
      this.fallar(`«${nombre}»: demasiadas funciones de columna anidadas`);
    }
    const args = this.argumentos(nombre);
    this.anidadas--;
    const agregacion = (de_tabla ? FUNCIONES_TABLA : FUNCIONES_FILA)[nombre]!;
    let tabla: string | null = null;
    if (de_tabla) {
      const primero = args.shift();
      if (!primero || primero.t !== "valor" || typeof primero.v !== "string" || !primero.v.trim()) {
        this.fallar(`«${nombre}» empieza con el nombre de la tabla entre comillas: ${nombre}("Ventas", …)`);
      }
      tabla = primero.v.trim();
    }
    let valor: Nodo | null = null;
    let condicion: Nodo | null = null;
    let separador: Nodo | null = null;
    if (agregacion === "cuenta") {
      if (de_tabla ? args.length > 1 : args.length !== 1) {
        this.fallar(de_tabla ? `«${nombre}» lleva la tabla y, si quieres, una condición` : `«${nombre}» necesita una condición`);
      }
      condicion = args[0] ?? null;
    } else {
      const max = agregacion === "unir" ? 3 : 2;
      const min = de_tabla ? 1 : 2;
      if (args.length < min || args.length > max) {
        this.fallar(
          de_tabla
            ? `«${nombre}» lleva la tabla, el valor y, si quieres, una condición${agregacion === "unir" ? " y un separador" : ""}`
            : `«${nombre}» necesita un valor y una condición${agregacion === "unir" ? " (y, si quieres, un separador)" : ""}`,
        );
      }
      [valor, condicion = null, separador = null] = args as [Nodo, Nodo?, Nodo?];
    }
    return {
      t: "filas", nombre, agregacion, tabla, valor, condicion, separador,
      usa_actual: usa_actual(valor) || usa_actual(condicion) || usa_actual(separador),
    };
  }

  private token(t: string): boolean {
    this.saltar_espacios();
    if (this.src.startsWith(t, this.pos)) {
      this.pos += t.length;
      return true;
    }
    return false;
  }

  /** Como `token`, pero solo si lo que sigue no continúa la palabra: `o` no se come `objetivo(`. */
  private palabra(p: string): boolean {
    this.saltar_espacios();
    if (!this.src.startsWith(p, this.pos)) return false;
    const despues = this.pos + p.length;
    if (despues < this.src.length && es_letra_o_digito(this.src[despues]!)) return false;
    this.pos = despues;
    return true;
  }

  private saltar_espacios(): void {
    while (this.pos < this.src.length && /\s/.test(this.src[this.pos]!)) this.pos++;
  }

  private fallar(mensaje: string): never {
    throw new ErrorFormula(mensaje);
  }
}

// #endregion

// #region Evaluación

type Contexto = {
  /** El registro que se calcula: lo que leen `{actual:x}` y quien resuelve otras tablas. */
  raiz: Ambito;
  profundidad: number;
};

function evaluar_nodo(n: Nodo, ambito: Ambito, ctx: Contexto): Valor {
  switch (n.t) {
    case "valor":
      return n.v;
    case "ref":
      return (n.actual ? ctx.raiz : ambito).valor(n.clave) ?? null;
    case "neg":
      return -a_numero(evaluar_nodo(n.a, ambito, ctx));
    case "o":
      return bool(es_verdadero(evaluar_nodo(n.a, ambito, ctx)) || es_verdadero(evaluar_nodo(n.b, ambito, ctx)));
    case "y":
      return bool(es_verdadero(evaluar_nodo(n.a, ambito, ctx)) && es_verdadero(evaluar_nodo(n.b, ambito, ctx)));
    case "si":
      return es_verdadero(evaluar_nodo(n.c, ambito, ctx)) ? evaluar_nodo(n.a, ambito, ctx) : evaluar_nodo(n.b, ambito, ctx);
    case "op":
      return operar(n.op, evaluar_nodo(n.a, ambito, ctx), evaluar_nodo(n.b, ambito, ctx));
    case "fn":
      return aplicar(n.nombre, n.args.map((a) => evaluar_nodo(a, ambito, ctx)));
    case "filas":
      return evaluar_filas(n, ambito, ctx);
  }
}

function operar(op: string, izq: Valor, der: Valor): Valor {
  switch (op) {
    case "+": return sumar(izq, der);
    case "+0": return izq;
    case "-": return a_numero(izq) - a_numero(der);
    case "*": return a_numero(izq) * a_numero(der);
    case "/": {
      const d = a_numero(der);
      return d === 0 ? 0 : a_numero(izq) / d;
    }
    case "%": {
      const d = a_numero(der);
      return d === 0 ? 0 : a_numero(izq) % d;
    }
    case "^": return Math.pow(a_numero(izq), a_numero(der));
    default: return bool(comparar(op, izq, der));
  }
}

/**
 * Recorre las filas (de la tabla propia o de otra) y agrega las que cumplen. Si el
 * resultado no depende del registro se guarda en `compartido`, así una vista de N
 * registros con `tabla_suma(...)` recorre la otra tabla una vez y no N.
 */
function evaluar_filas(n: Extract<Nodo, { t: "filas" }>, ambito: Ambito, ctx: Contexto): Valor {
  if (ctx.profundidad >= MAX_PROFUNDIDAD_FILA) {
    throw new ErrorFormula(`«${n.nombre}»: demasiadas funciones de columna anidadas`);
  }
  // Las filas propias dependen de quién pregunta salvo en el nivel de arriba.
  const compartible = !n.usa_actual && (n.tabla !== null || ctx.profundidad === 0);
  const compartido = ctx.raiz.compartido;
  if (compartible && compartido?.has(n)) return compartido.get(n)!;

  let filas: Ambito[];
  if (n.tabla === null) {
    filas = ambito.filas?.() ?? [];
  } else {
    const t = ctx.raiz.tabla?.(n.tabla) ?? { error: `No se puede leer la tabla «${n.tabla}» aquí` };
    if ("error" in t) throw new ErrorFormula(t.error);
    filas = t.filas;
  }
  const hijo: Contexto = { raiz: ctx.raiz, profundidad: ctx.profundidad + 1 };
  const numeros: number[] = [];
  const textos: string[] = [];
  let cuenta = 0;
  let encontrado: Valor = null;
  for (const fila of filas) {
    if (n.condicion && !es_verdadero(evaluar_nodo(n.condicion, fila, hijo))) continue;
    cuenta++;
    if (!n.valor) continue;
    const v = evaluar_nodo(n.valor, fila, hijo);
    if (n.agregacion === "buscar") {
      encontrado = v;
      break;
    }
    if (n.agregacion === "unir") {
      const t = a_texto(v).trim();
      if (t) textos.push(t);
      continue;
    }
    const num = a_numero_o_null(v);
    if (num !== null) numeros.push(num);
  }
  let resultado: Valor;
  switch (n.agregacion) {
    case "cuenta": resultado = cuenta; break;
    case "buscar": resultado = encontrado; break;
    case "unir": resultado = textos.join(n.separador ? a_texto(evaluar_nodo(n.separador, ambito, ctx)) : ", "); break;
    default: resultado = calcular_agregado(n.agregacion, numeros);
  }
  if (compartible && compartido && !(n.separador && usa_actual(n.separador))) compartido.set(n, resultado);
  return resultado;
}

function aplicar(nombre: string, args: Valor[]): Valor {
  switch (nombre) {
    case "abs": return Math.abs(a_numero(args[0]!));
    case "min": return Math.min(...args.map(a_numero));
    case "max": return Math.max(...args.map(a_numero));
    case "sum": return calcular_agregado("suma", args.map(a_numero));
    case "avg": return calcular_agregado("promedio", args.map(a_numero));
    case "round": case "redondear": {
      const valor = a_numero(args[0]!);
      const lugares = Math.min(8, Math.max(0, Math.trunc(args[1] === undefined ? 0 : a_numero(args[1]))));
      const factor = Math.pow(10, lugares);
      return Math.round(valor * factor) / factor;
    }
    case "floor": return Math.floor(a_numero(args[0]!));
    case "ceil": return Math.ceil(a_numero(args[0]!));
    case "sqrt": return Math.sqrt(a_numero(args[0]!));
    case "no": case "not": return bool(!es_verdadero(args[0]!));
    case "texto": case "text": return a_texto(args[0]!);
    case "numero": case "number": return a_numero(args[0]!);
    case "concat": case "unir": return args.map(a_texto).join("");
    case "contiene": case "contains":
      return bool(a_texto(args[0]!).toLowerCase().includes(a_texto(args[1]!).toLowerCase()));
    case "empieza": case "startswith":
      return bool(a_texto(args[0]!).toLowerCase().startsWith(a_texto(args[1]!).toLowerCase()));
    case "termina": case "endswith":
      return bool(a_texto(args[0]!).toLowerCase().endsWith(a_texto(args[1]!).toLowerCase()));
    case "largo": case "length": return a_texto(args[0]!).length;
    case "mayus": case "upper": return a_texto(args[0]!).toUpperCase();
    case "minus": case "lower": return a_texto(args[0]!).toLowerCase();
    case "vacio": case "empty": return bool(a_texto(args[0]!).trim() === "");
    default: throw new ErrorFormula(`Función desconocida «${nombre}»`);
  }
}

/** `+` suma si los dos lados son números y concatena si no. */
function sumar(izq: Valor, der: Valor): Valor {
  const a = a_numero_o_null(izq);
  const b = a_numero_o_null(der);
  return a !== null && b !== null ? a + b : a_texto(izq) + a_texto(der);
}

// #endregion
