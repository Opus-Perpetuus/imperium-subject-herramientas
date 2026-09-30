import { clave_desde_etiqueta, normalizar, texto } from "../comun.ts";
import { parsear_agregado, TIPOS_AGREGADO, type TipoAgregado } from "./motor.ts";
import type { CampoSpec, ResumenTabla, TablaSpec, TipoCampo } from "./esquema.ts";

/**
 * Diseñador de tablas para quien no programa: tipos con nombre de todos los
 * días, tipo adivinado por el nombre de la columna, columnas desde texto libre
 * y fórmulas escritas con los nombres visibles. La clave interna nunca se
 * enseña ni se pide.
 */

export type TipoUi = { nombre: string; icono: string; ayuda: string };

export const TIPOS_UI: Record<TipoCampo, TipoUi> = {
  texto: { nombre: "Texto", icono: "fa-font", ayuda: "Nombres, teléfonos, frases cortas" },
  numero: { nombre: "Número", icono: "fa-hashtag", ayuda: "Medidas con decimales: 12.5 km" },
  dinero: { nombre: "Dinero", icono: "fa-dollar-sign", ayuda: "Precios, cobros, gastos" },
  fecha: { nombre: "Fecha", icono: "fa-calendar-days", ayuda: "Un día del calendario" },
  booleano: { nombre: "Sí / No", icono: "fa-square-check", ayuda: "Casilla: pagado, entregado" },
  opcion: { nombre: "Lista de opciones", icono: "fa-list-ul", ayuda: "Elegir de una lista: categoría, estado" },
  foto: { nombre: "Foto", icono: "fa-image", ayuda: "Imagen de la cámara o la galería" },
  nota: { nombre: "Nota larga", icono: "fa-align-left", ayuda: "Texto largo con formato" },
  calculado: { nombre: "Cálculo", icono: "fa-calculator", ayuda: "Se calcula solo con otras columnas" },
  entero: { nombre: "Número entero", icono: "fa-arrow-up-1-9", ayuda: "Piezas, conteos: 3" },
  hora: { nombre: "Hora", icono: "fa-clock", ayuda: "Hora del día" },
  fecha_hora: { nombre: "Fecha y hora", icono: "fa-calendar-check", ayuda: "Un momento exacto" },
  referencia: { nombre: "Enlace a otra tabla", icono: "fa-diagram-project", ayuda: "Elegir un registro de otra tabla" },
  geo: { nombre: "Ubicación", icono: "fa-location-dot", ayuda: "Un punto en el mapa" },
  nivel: { nombre: "Medidor", icono: "fa-gauge", ayuda: "Nivel de un tanque: 3 de 6 rayas" },
  ruta: { nombre: "Ruta GPS", icono: "fa-route", ayuda: "Una ruta registrada con el teléfono" },
};

/** Valor del selector de tipo que deja que el nombre decida. */
export const TIPO_AUTOMATICO = "auto";

/** Los tipos se ofrecen en este orden: los de todos los días primero. */
export const ORDEN_TIPOS = Object.keys(TIPOS_UI) as TipoCampo[];

/** Tipos cuyos valores entran en sumas, promedios y operaciones. */
export const TIPOS_NUMERICOS: ReadonlySet<TipoCampo> = new Set([
  "numero",
  "dinero",
  "entero",
  "nivel",
  "calculado",
  "booleano",
]);

// #region Tipo adivinado por el nombre

/** El orden importa: «Fecha de pago» es fecha y «Método de pago» es lista, aunque digan «pago». */
const PISTAS: Array<[RegExp, TipoCampo]> = [
  [/\bfecha y hora\b|\bcuando\b/, "fecha_hora"],
  [/\b(fecha|dia|cumpleanos|vence|vencimiento|nacimiento|caducidad)\b/, "fecha"],
  [/\b(hora|horario)\b/, "hora"],
  [/\b(fotos?|imagen|imagenes|comprobante|ticket|recibo|evidencia|portada)\b/, "foto"],
  [/\b(notas?|observaciones?|comentarios?|descripcion|detalles?|resena)\b/, "nota"],
  [/\b(ubicacion|coordenadas|gps)\b/, "geo"],
  [/\b(categoria|tipo|estado|estatus|prioridad|talla|genero|metodo|forma de pago|clasificacion|etapa)\b/, "opcion"],
  [/^(es|esta|tiene|pagado|pagada|entregado|entregada|hecho|hecha|listo|lista|activo|activa|completado|completada|vendido|vendida|urgente|devuelto|devuelta|leido|leida)\b/, "booleano"],
  [/\b(precio|costo|monto|importe|total|saldo|sueldo|salario|abono|gasto|ingreso|cobro|venta|deuda|pago|dinero|propina|ganancia|presupuesto|prestamo|interes)\b/, "dinero"],
  [/\b(cantidad|piezas|unidades|existencia|existencias|stock|entregas|edad|veces|personas|dias|paginas|repeticiones|calificacion)\b/, "entero"],
  [/\b(km|kilometros?|kilometraje|litros?|peso|kg|metros?|distancia|temperatura|calorias|altura|horas|minutos|porcentaje|medida)\b/, "numero"],
];

const MONEDAS = new Set(["$", "mxn", "pesos", "usd", "dolares", "eur", "euros"]);

/**
 * Tipo y unidad a partir de cómo se llama la columna. `Distancia (km)` es
 * número en km; `Monto ($)` es dinero; `¿Pagado?` es sí/no.
 */
export function inferir_tipo(etiqueta_cruda: string): { etiqueta: string; tipo: TipoCampo; unidad: string | null } {
  let etiqueta = limpiar_etiqueta(etiqueta_cruda);
  let unidad: string | null = null;
  const parentesis = /\(([^()]{1,12})\)\s*$/.exec(etiqueta);
  if (parentesis) {
    unidad = parentesis[1]!.trim() || null;
    etiqueta = etiqueta.slice(0, parentesis.index).trim() || etiqueta;
  }
  const pregunta = etiqueta.startsWith("¿") || etiqueta.endsWith("?");
  const nombre = normalizar(etiqueta.replace(/[¿?]/g, ""));
  let tipo: TipoCampo = "texto";
  if (pregunta) tipo = "booleano";
  else if (unidad && MONEDAS.has(normalizar(unidad))) tipo = "dinero";
  else tipo = PISTAS.find(([re]) => re.test(nombre))?.[1] ?? (unidad ? "numero" : "texto");
  if (tipo === "dinero" && !unidad) unidad = "$";
  return { etiqueta, tipo, unidad };
}

// #endregion

// #region Columnas desde texto libre

export type ColumnaPropuesta = {
  etiqueta: string;
  tipo: TipoCampo;
  unidad: string | null;
  opciones: string[];
};

/** Tope de columnas por tabla creada de golpe: más allá casi siempre es un pegado equivocado. */
export const MAX_COLUMNAS = 60;

/**
 * Columnas escritas como las diría una persona: una por renglón o separadas por
 * comas. `Categoría: Comida, Transporte` es una lista con esas opciones.
 */
export function columnas_desde_texto(entrada: string): ColumnaPropuesta[] {
  const renglones = entrada.split(/\r?\n/).map((r) => r.trim()).filter(Boolean);
  const partes =
    renglones.length === 1 && !renglones[0]!.includes(":") ? renglones[0]!.split(/[,;]/) : renglones;
  const vistas = new Set<string>();
  const out: ColumnaPropuesta[] = [];
  for (const parte of partes) {
    const limpia = parte.replace(/^\s*(?:[-*•·]|\d+[.)])\s*/, "").trim();
    if (!limpia) continue;
    const dos_puntos = limpia.indexOf(":");
    const cabeza = dos_puntos > 0 ? limpia.slice(0, dos_puntos) : limpia;
    const opciones = dos_puntos > 0 ? lista_opciones(limpia.slice(dos_puntos + 1)) : [];
    const propuesta = inferir_tipo(cabeza);
    if (!propuesta.etiqueta || vistas.has(normalizar(propuesta.etiqueta))) continue;
    vistas.add(normalizar(propuesta.etiqueta));
    out.push({ ...propuesta, tipo: opciones.length ? "opcion" : propuesta.tipo, opciones });
    if (out.length === MAX_COLUMNAS) break;
  }
  return out;
}

function unicas(opciones: string[]): string[] {
  const vistas = new Set<string>();
  return opciones
    .map((o) => o.trim())
    .filter((o) => {
      const k = normalizar(o);
      if (!k || vistas.has(k)) return false;
      vistas.add(k);
      return true;
    });
}

/** Opciones separadas por coma, punto y coma, barra o renglón; sin repetidas. */
export function lista_opciones(entrada: string): string[] {
  return unicas(entrada.split(/[,;/|\n]/));
}

/** Las del editor de columna: una por renglón («Tarjeta/Débito» es una); en un solo renglón, separadas. */
export function opciones_desde_texto(valor: unknown): string[] {
  if (Array.isArray(valor)) return unicas(valor.map(String));
  const renglones = texto(valor).split(/\r?\n/);
  return renglones.length > 1 ? unicas(renglones) : lista_opciones(renglones[0] ?? "");
}

// #endregion

// #region Claves y etiquetas

/** Llaves y comillas partirían las fórmulas que la nombran. */
export function limpiar_etiqueta(etiqueta: string): string {
  return texto(etiqueta).replace(/[{}"]/g, "").replace(/\s+/g, " ").trim();
}

/** Clave nueva que no choca con ninguna de `usadas`: `Precio` → `precio`, `precio_2`… */
export function clave_libre(etiqueta: string, usadas: ReadonlySet<string>): string {
  let base = clave_desde_etiqueta(etiqueta).slice(0, 40).replace(/_+$/, "") || "columna";
  if (!/^[a-z]/.test(base)) base = `c_${base}`;
  let clave = base;
  for (let n = 2; usadas.has(clave); n++) clave = `${base}_${n}`;
  return clave;
}

/** Claves ocupadas: campos y valores fijos comparten espacio en las fórmulas. */
export function claves_usadas(spec: TablaSpec): Set<string> {
  return new Set([...spec.campos.map((c) => c.clave), ...spec.constantes.map((c) => c.clave)]);
}

/** Campo con los valores por defecto que ya pondría la normalización del esquema. */
export function campo_nuevo(
  spec: TablaSpec,
  propuesta: Pick<ColumnaPropuesta, "etiqueta" | "tipo"> & Partial<ColumnaPropuesta>,
  usadas = claves_usadas(spec),
): CampoSpec {
  const tipo = propuesta.tipo;
  return {
    clave: clave_libre(propuesta.etiqueta, usadas),
    etiqueta: propuesta.etiqueta,
    tipo,
    requerido: false,
    opciones: propuesta.opciones ?? [],
    // El motor exige fórmula en un cálculo; «0» lo deja válido hasta que se configure.
    formula: tipo === "calculado" ? "0" : null,
    unidad: propuesta.unidad ?? null,
    decimales: tipo === "entero" ? 0 : 2,
    en_resumen: false,
    pasos: tipo === "nivel" ? 6 : 0,
    capacidad: null,
    tabla_ref_id: null,
    clave_ref_display: null,
    multiple: false,
  };
}

/**
 * Columnas nuevas para una tabla. Las seis primeras que se leen bien en una
 * fila (no fotos, notas ni rutas) salen en la lista.
 */
export function campos_desde_propuestas(spec: TablaSpec, propuestas: ColumnaPropuesta[]): CampoSpec[] {
  const usadas = claves_usadas(spec);
  const en_lista = spec.campos.filter((c) => c.en_resumen).length;
  let libres = Math.max(0, 6 - en_lista);
  return propuestas.map((p) => {
    const campo = campo_nuevo(spec, p, usadas);
    usadas.add(campo.clave);
    if (libres > 0 && !["foto", "nota", "ruta", "geo"].includes(campo.tipo)) {
      campo.en_resumen = true;
      libres--;
    }
    return campo;
  });
}

/** Si al elegir este tipo hace falta un segundo paso para que la columna sirva. */
export function necesita_ajustes(campo: CampoSpec): boolean {
  if (campo.tipo === "opcion") return !campo.opciones?.length;
  if (campo.tipo === "calculado") return !campo.formula || campo.formula === "0";
  if (campo.tipo === "referencia") return !campo.tabla_ref_id;
  return false;
}

// #endregion

// #region Fórmulas con nombres visibles

const LLAVE = /\{([^{}"]+)\}/g;

/** Aplica `fn` solo fuera de los textos entre comillas. */
function fuera_de_comillas(formula: string, fn: (parte: string) => string): string {
  return formula
    .split('"')
    .map((parte, i) => (i % 2 === 0 ? fn(parte) : parte))
    .join('"');
}

function traducir_llaves(formula: string, resolver: (nombre: string) => string): string {
  return fuera_de_comillas(formula, (parte) =>
    parte.replace(LLAVE, (_todo, dentro: string) => {
      const agregado = parsear_agregado(dentro);
      return agregado ? `{${agregado.tipo}:${resolver(agregado.campo)}}` : `{${resolver(dentro.trim())}}`;
    }),
  );
}

/**
 * `{Precio} × {Cantidad}` → `{precio} * {cantidad}`. Acepta el nombre visible
 * (sin importar mayúsculas ni acentos) o la clave; lo que no reconoce lo deja
 * igual para que la validación diga qué nombre no existe.
 */
export function formula_con_claves(spec: TablaSpec, entrada: string): string {
  const por_nombre = new Map<string, string>();
  for (const c of [...spec.campos, ...spec.constantes]) {
    por_nombre.set(normalizar(c.etiqueta), c.clave);
    por_nombre.set(c.clave, c.clave);
  }
  const con_signos = fuera_de_comillas(texto(entrada), (p) => p.replace(/×/g, "*").replace(/÷/g, "/"));
  return traducir_llaves(con_signos, (nombre) => por_nombre.get(nombre) ?? por_nombre.get(normalizar(nombre)) ?? nombre);
}

/** La inversa, para enseñar una fórmula guardada: `{suma:pagado}` → `{suma:Abono}`. */
export function formula_con_etiquetas(spec: TablaSpec, formula: string): string {
  const etiquetas = new Map([...spec.campos, ...spec.constantes].map((c) => [c.clave, c.etiqueta]));
  return traducir_llaves(texto(formula), (clave) => etiquetas.get(clave) ?? clave);
}

/** Mensajes de validación con los nombres que ve la persona, no las claves. */
export function mensajes_legibles(spec: TablaSpec, errores: string[]): string {
  const etiquetas = new Map(
    [...spec.campos, ...spec.constantes, ...spec.resumenes].map((c) => [c.clave, c.etiqueta]),
  );
  return errores
    .map((e) => e.replace(/«([^«»]+)»/g, (todo, clave: string) => (etiquetas.has(clave) ? `«${etiquetas.get(clave)}»` : todo)))
    .join("; ");
}

// #endregion

// #region Fórmula guiada

export const OPERACIONES = {
  suma: { nombre: "Sumar (A + B)", armar: (a: string, b: string) => `${a} + ${b}` },
  resta: { nombre: "Restar (A − B)", armar: (a: string, b: string) => `${a} - ${b}` },
  multiplica: { nombre: "Multiplicar (A × B)", armar: (a: string, b: string) => `${a} * ${b}` },
  divide: { nombre: "Dividir (A ÷ B)", armar: (a: string, b: string) => `${a} / ${b}` },
  porcentaje: { nombre: "Qué porcentaje es A de B", armar: (a: string, b: string) => `${a} / ${b} * 100` },
} as const;

export type Operacion = keyof typeof OPERACIONES;

export function es_operacion(v: string): v is Operacion {
  return Object.hasOwn(OPERACIONES, v);
}

/** Operando de una fórmula guiada: la clave de una columna o valor fijo, o un número escrito. */
export function operando(spec: TablaSpec, clave: string, numero?: number | null): string | null {
  if (numero != null && Number.isFinite(numero)) return String(numero);
  const existe = spec.campos.some((c) => c.clave === clave) || spec.constantes.some((c) => c.clave === clave);
  return existe ? `{${clave}}` : null;
}

/** Columnas y valores fijos que pueden entrar en una operación (sin la propia columna). */
export function opciones_numericas(spec: TablaSpec, excepto?: string): Array<{ value: string; label: string }> {
  return [
    ...spec.campos
      .filter((c) => c.clave !== excepto && TIPOS_NUMERICOS.has(c.tipo))
      .map((c) => ({ value: c.clave, label: c.etiqueta })),
    ...spec.constantes.map((c) => ({ value: c.clave, label: `${c.etiqueta} (valor fijo)` })),
  ];
}

// #endregion

// #region Totales guiados

export const TOTALES: Record<TipoAgregado, string> = {
  suma: "Total",
  promedio: "Promedio",
  cuenta: "Cuántos tienen dato",
  minimo: "El más bajo",
  maximo: "El más alto",
};

export function es_total(v: string): v is TipoAgregado {
  return Object.hasOwn(TIPOS_AGREGADO, v);
}

/** Total que no depende de ninguna columna: cuántas filas tiene la tabla. */
export const TOTAL_REGISTROS = { valor: "registros", nombre: "Cuántos registros hay", formula: "cuentasi(1)" } as const;

/** Precios y costos son por unidad: sumarlos no dice nada. */
const POR_UNIDAD = /\b(precio|costo|tarifa|unitario)\b/;

/** El total que se pone solo al crear una tabla con montos: casi siempre es lo primero que se quiere saber. */
export function totales_por_defecto(campos: CampoSpec[]): ResumenTabla[] {
  return campos
    .filter((c) => c.tipo === "dinero" && !POR_UNIDAD.test(normalizar(c.etiqueta)))
    .slice(0, 2)
    .map((c) => ({
      clave: clave_libre(nombre_total("suma", c), new Set()),
      etiqueta: nombre_total("suma", c),
      formula: `{suma:${c.clave}}`,
      unidad: c.unidad ?? null,
      decimales: c.decimales ?? 2,
    }));
}

/** Nombre que se propone para un total: «Total de Monto», «Promedio de Km». */
export function nombre_total(tipo: TipoAgregado, campo: CampoSpec): string {
  return `${TOTALES[tipo]} de ${campo.etiqueta}`;
}

// #endregion
