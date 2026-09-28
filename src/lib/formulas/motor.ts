/**
 * Motor de fórmulas de los campos calculados, los valores fijos y los resúmenes.
 *
 * ```
 *   {km_final} - {km_inicial}
 *   si({estado} == "pagado", {monto}, 0)
 *   sumasi({monto}, {estado} == "pagado" y {moto} == "Italika")
 *   "Moto: " + {moto}
 *   round({promedio}, 2)
 * ```
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
};

export type Resultado = { ok: true; valor: Valor } | { ok: false; error: string };

const REFERENCIA = /\{([A-Za-z0-9_:]+)\}/g;
const NIVEL = /^\s*([0-9]+(?:[.,][0-9]+)?)\s*\/\s*([0-9]+)\s*$/;
const NUMERO = /^[+-]?(?:[0-9]+\.?[0-9]*|\.[0-9]+)(?:[eE][+-]?[0-9]+)?$/;

/** Sus argumentos no se evalúan donde aparecen: se reinterpretan una vez por fila. */
const FUNCIONES_FILA = new Set([
  "sumasi", "sumif",
  "cuentasi", "countif",
  "promediosi", "averageif",
  "minimosi", "minif",
  "maximosi", "maxif",
]);

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
    valor: (clave) => (clave in valores ? valores[clave] : undefined),
    filas: () => filas,
  };
}

/** Toda clave vale lo mismo: sirve para comprobar la sintaxis antes de tener datos. */
export function ambito_sonda(fijo: Valor = 1): Ambito {
  return { valor: () => fijo };
}

/** Sustituye el contenido de las cadenas por espacios, conservando posiciones. */
function sin_literales(formula: string): string {
  if (!formula.includes('"') && !formula.includes("'")) return formula;
  let out = "";
  let comilla: string | null = null;
  for (let i = 0; i < formula.length; i++) {
    const c = formula[i]!;
    if (comilla === null && (c === '"' || c === "'")) {
      comilla = c;
      out += " ";
    } else if (comilla === null) {
      out += c;
    } else if (c === "\\" && i + 1 < formula.length) {
      out += "  ";
      i++;
    } else if (c === comilla) {
      comilla = null;
      out += " ";
    } else {
      out += " ";
    }
  }
  return out;
}

/** Claves que aparecen en la fórmula (también las agregadas `suma:x`). */
export function claves_referenciadas(formula: string): Set<string> {
  const claves = new Set<string>();
  for (const m of sin_literales(formula).matchAll(REFERENCIA)) claves.add(m[1]!);
  return claves;
}

/** Una clave que el ámbito no conoce vale vacío, no error: a media captura casi todas lo están. */
export function evaluar(formula: string, ambito: Ambito): Resultado {
  try {
    const valor = new Analizador(formula, ambito).analizar_todo();
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

// #endregion

// #region Analizador (descenso recursivo)

class ErrorFormula extends Error {}

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

class Analizador {
  private pos = 0;
  /** Mientras es > 0 se recorre una expresión para quedarse con su texto, no con su valor. */
  private capturando = 0;

  constructor(
    private readonly src: string,
    private readonly ambito: Ambito,
    private readonly profundidad = 0,
  ) {}

  analizar_todo(): Valor {
    const valor = this.expresion();
    this.saltar_espacios();
    if (this.pos < this.src.length) this.fallar(`Sobra «${this.src.slice(this.pos)}»`);
    return valor;
  }

  private expresion(): Valor {
    return this.o();
  }

  private o(): Valor {
    let izq = this.y();
    for (;;) {
      this.saltar_espacios();
      if (!this.palabra("o") && !this.palabra("or") && !this.token("||")) return izq;
      const der = this.y();
      izq = bool(es_verdadero(izq) || es_verdadero(der));
    }
  }

  private y(): Valor {
    let izq = this.comparacion();
    for (;;) {
      this.saltar_espacios();
      if (!this.palabra("y") && !this.palabra("and") && !this.token("&&")) return izq;
      const der = this.comparacion();
      izq = bool(es_verdadero(izq) && es_verdadero(der));
    }
  }

  private comparacion(): Valor {
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
    const der = this.aditiva();
    return bool(comparar(op, izq, der));
  }

  private aditiva(): Valor {
    let valor = this.multiplicativa();
    for (;;) {
      this.saltar_espacios();
      if (this.token("+")) valor = sumar(valor, this.multiplicativa());
      else if (this.token("-")) valor = a_numero(valor) - a_numero(this.multiplicativa());
      else return valor;
    }
  }

  private multiplicativa(): Valor {
    let valor = this.unaria();
    for (;;) {
      this.saltar_espacios();
      if (this.token("*")) {
        valor = a_numero(valor) * a_numero(this.unaria());
      } else if (this.token("/")) {
        const divisor = a_numero(this.unaria());
        valor = divisor === 0 ? 0 : a_numero(valor) / divisor;
      } else if (this.token("%")) {
        const divisor = a_numero(this.unaria());
        valor = divisor === 0 ? 0 : a_numero(valor) % divisor;
      } else if (this.token("^")) {
        valor = Math.pow(a_numero(valor), a_numero(this.unaria()));
      } else {
        return valor;
      }
    }
  }

  private unaria(): Valor {
    this.saltar_espacios();
    if (this.token("-")) return -a_numero(this.unaria());
    if (this.token("+")) return this.unaria();
    return this.primaria();
  }

  private primaria(): Valor {
    this.saltar_espacios();
    if (this.pos >= this.src.length) this.fallar("Fórmula incompleta");
    const c = this.src[this.pos]!;
    if (c === "(") {
      this.pos++;
      const valor = this.expresion();
      this.saltar_espacios();
      if (!this.token(")")) this.fallar("Falta «)»");
      return valor;
    }
    if (c === "{") {
      const fin = this.src.indexOf("}", this.pos);
      if (fin < 0) this.fallar("Falta «}»");
      const clave = this.src.slice(this.pos + 1, fin);
      this.pos = fin + 1;
      return this.ambito.valor(clave) ?? null;
    }
    if (c === '"' || c === "'") return this.cadena(c);
    if (es_digito(c) || c === ".") return this.numero();
    if (es_letra(c)) return this.funcion();
    return this.fallar(`No se entiende «${c}»`);
  }

  private cadena(comilla: string): Valor {
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

  private numero(): Valor {
    const inicio = this.pos;
    while (this.pos < this.src.length && (es_digito(this.src[this.pos]!) || this.src[this.pos] === ".")) {
      this.pos++;
    }
    const t = this.src.slice(inicio, this.pos);
    const n = NUMERO.test(t) ? Number(t) : NaN;
    if (!Number.isFinite(n)) this.fallar(`Número inválido «${t}»`);
    return n;
  }

  private funcion(): Valor {
    const inicio = this.pos;
    while (this.pos < this.src.length && es_letra_o_digito(this.src[this.pos]!)) this.pos++;
    const nombre = this.src.slice(inicio, this.pos).toLowerCase();
    this.saltar_espacios();
    if (!this.token("(")) {
      this.fallar(`«${nombre}» necesita paréntesis; si querías el texto, ponlo entre comillas: "${nombre}"`);
    }
    if (FUNCIONES_FILA.has(nombre)) return this.funcion_fila(nombre);
    return this.aplicar(nombre, this.argumentos(nombre));
  }

  private argumentos(nombre: string): Valor[] {
    const args: Valor[] = [];
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

  /** `{estado}` dentro de la condición es el estado de ESA fila, no de la que se captura. */
  private funcion_fila(nombre: string): Valor {
    const args: string[] = [];
    this.saltar_espacios();
    if (!this.token(")")) {
      do {
        args.push(this.capturar_expresion());
        this.saltar_espacios();
      } while (this.token(","));
      if (!this.token(")")) this.fallar(`Falta «)» en «${nombre}»`);
    }
    const solo_cuenta = nombre === "cuentasi" || nombre === "countif";
    let valor_src: string | null;
    let condicion_src: string;
    if (solo_cuenta) {
      if (args.length !== 1) this.fallar(`«${nombre}» necesita una condición`);
      valor_src = null;
      condicion_src = args[0]!;
    } else {
      if (args.length !== 2) this.fallar(`«${nombre}» necesita un valor y una condición`);
      valor_src = args[0]!;
      condicion_src = args[1]!;
    }
    if (this.capturando > 0) return 0;
    if (this.profundidad >= MAX_PROFUNDIDAD_FILA) {
      this.fallar(`«${nombre}»: demasiadas funciones de columna anidadas`);
    }
    let cuenta = 0;
    const casan: number[] = [];
    for (const fila of this.ambito.filas?.() ?? []) {
      if (!es_verdadero(new Analizador(condicion_src, fila, this.profundidad + 1).analizar_todo())) continue;
      cuenta++;
      if (valor_src !== null) {
        const n = a_numero_o_null(new Analizador(valor_src, fila, this.profundidad + 1).analizar_todo());
        if (n !== null) casan.push(n);
      }
    }
    switch (nombre) {
      case "cuentasi": case "countif": return cuenta;
      case "sumasi": case "sumif": return calcular_agregado("suma", casan);
      case "promediosi": case "averageif": return calcular_agregado("promedio", casan);
      case "minimosi": case "minif": return calcular_agregado("minimo", casan);
      default: return calcular_agregado("maximo", casan);
    }
  }

  /** Consume una expresión y devuelve su texto en lugar de su valor. */
  private capturar_expresion(): string {
    this.saltar_espacios();
    const inicio = this.pos;
    this.capturando++;
    try {
      this.expresion();
    } finally {
      this.capturando--;
    }
    return this.src.slice(inicio, this.pos).trim();
  }

  private aplicar(nombre: string, args: Valor[]): Valor {
    switch (nombre) {
      case "abs": return Math.abs(a_numero(this.uno(nombre, args)));
      case "min": return Math.min(...this.al_menos(nombre, args, 2).map(a_numero));
      case "max": return Math.max(...this.al_menos(nombre, args, 2).map(a_numero));
      case "sum": return calcular_agregado("suma", args.map(a_numero));
      case "avg": return calcular_agregado("promedio", args.map(a_numero));
      case "round": case "redondear": {
        if (!args.length) this.fallar("round necesita un valor");
        const valor = a_numero(args[0]!);
        const lugares = Math.min(8, Math.max(0, Math.trunc(args[1] === undefined ? 0 : a_numero(args[1]))));
        const factor = Math.pow(10, lugares);
        return Math.round(valor * factor) / factor;
      }
      case "floor": return Math.floor(a_numero(this.uno(nombre, args)));
      case "ceil": return Math.ceil(a_numero(this.uno(nombre, args)));
      case "sqrt": return Math.sqrt(a_numero(this.uno(nombre, args)));
      case "if": case "si":
        if (args.length !== 3) this.fallar(`«${nombre}» necesita condición, valor y alternativa`);
        return es_verdadero(args[0]!) ? args[1]! : args[2]!;
      case "no": case "not": return bool(!es_verdadero(this.uno(nombre, args)));
      case "texto": case "text": return a_texto(this.uno(nombre, args));
      case "numero": case "number": return a_numero(this.uno(nombre, args));
      case "concat": case "unir": return args.map(a_texto).join("");
      case "contiene": case "contains": {
        const [a, b] = this.dos(nombre, args);
        return bool(a_texto(a).toLowerCase().includes(a_texto(b).toLowerCase()));
      }
      case "empieza": case "startswith": {
        const [a, b] = this.dos(nombre, args);
        return bool(a_texto(a).toLowerCase().startsWith(a_texto(b).toLowerCase()));
      }
      case "termina": case "endswith": {
        const [a, b] = this.dos(nombre, args);
        return bool(a_texto(a).toLowerCase().endsWith(a_texto(b).toLowerCase()));
      }
      case "largo": case "length": return a_texto(this.uno(nombre, args)).length;
      case "mayus": case "upper": return a_texto(this.uno(nombre, args)).toUpperCase();
      case "minus": case "lower": return a_texto(this.uno(nombre, args)).toLowerCase();
      case "vacio": case "empty": return bool(a_texto(this.uno(nombre, args)).trim() === "");
      default: return this.fallar(`Función desconocida «${nombre}»`);
    }
  }

  private uno(nombre: string, args: Valor[]): Valor {
    if (args.length !== 1) this.fallar(`«${nombre}» necesita un argumento`);
    return args[0]!;
  }

  private dos(nombre: string, args: Valor[]): [Valor, Valor] {
    if (args.length !== 2) this.fallar(`«${nombre}» necesita dos argumentos`);
    return [args[0]!, args[1]!];
  }

  private al_menos(nombre: string, args: Valor[], n: number): Valor[] {
    if (args.length < n) this.fallar(`«${nombre}» necesita al menos ${n} argumentos`);
    return args;
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

/** `+` suma si los dos lados son números y concatena si no. */
function sumar(izq: Valor, der: Valor): Valor {
  const a = a_numero_o_null(izq);
  const b = a_numero_o_null(der);
  return a !== null && b !== null ? a + b : a_texto(izq) + a_texto(der);
}

// #endregion
