import type {
  CodeCompletionCatalog,
  CodeCompletionItem,
  CodeCompletionKind,
  CodeCompletionScope,
} from "@opus-perpetuus/imperium-core-kit";
import { es_calculado } from "./automatico.ts";
import { formula_con_etiquetas, TIPOS_NUMERICOS, TIPOS_UI } from "./disenio.ts";
import type { CampoSpec, ConstanteTabla, TablaSpec } from "./esquema.ts";
import { columnas_de } from "./subtabla.ts";

/**
 * El autocompletado de las fórmulas y plantillas para el editor de código del
 * lanzador: cada función con su firma, qué hace y un ejemplo, y cada columna
 * con una descripción hecha de su definición (tipo, unidad, de qué tabla es,
 * si es un cálculo y con qué fórmula). Dentro de `tabla_suma("Ventas", …)` y
 * `sub_suma("Productos", …)` se ofrecen las columnas de esa tabla o subtabla.
 */

// #region Funciones

type Funcion = {
  nombre: string;
  alias?: string[];
  firma: string;
  parametros: Array<[string, string]>;
  que_hace: string;
  ejemplo: string;
  /** Snippet de Monaco: `${1:valor}`. */
  insertar: string;
  grupo: "logica" | "numeros" | "texto" | "filas" | "tabla" | "subtabla";
};

const VALOR = ["valor", "Lo que se toma de cada fila que cumple: una columna como {Monto} o una cuenta como {Precio} * {Cantidad}."] as [string, string];
const CONDICION = ["condición", "Qué filas cuentan, por ejemplo {Estado} = \"Pagado\" y {Monto} > 100. Vacía: todas."] as [string, string];
const CONDICION_OPCIONAL = ["condición?", CONDICION[1]] as [string, string];
const TABLA = ["\"Tabla\"", "El nombre de la otra tabla entre comillas."] as [string, string];
const SUBTABLA = ["\"Subtabla\"", "El nombre de una subtabla de este registro entre comillas."] as [string, string];
const SEPARADOR = ["separador?", "Lo que va entre cada valor; sin él, «, »."] as [string, string];

const QUE_AGREGA: Record<string, { nombre: string; que: string }> = {
  suma: { nombre: "suma", que: "Suma el valor de cada fila que cumple la condición." },
  cuenta: { nombre: "cuenta", que: "Cuenta cuántas filas cumplen la condición." },
  promedio: { nombre: "promedio", que: "Promedia el valor de las filas que cumplen la condición." },
  minimo: { nombre: "minimo", que: "El valor más chico entre las filas que cumplen la condición." },
  maximo: { nombre: "maximo", que: "El valor más grande entre las filas que cumplen la condición." },
  buscar: { nombre: "buscar", que: "El valor de la primera fila que cumple la condición (vacío si ninguna)." },
  unir: { nombre: "unir", que: "Junta en un texto los valores (no vacíos) de las filas que cumplen la condición." },
};

const AGREGADAS_FILA: Array<[string, string, string]> = [
  ["sumasi", "sumif", "suma"],
  ["cuentasi", "countif", "cuenta"],
  ["promediosi", "averageif", "promedio"],
  ["minimosi", "minif", "minimo"],
  ["maximosi", "maxif", "maximo"],
  ["buscarsi", "lookupif", "buscar"],
  ["unirsi", "joinif", "unir"],
];

function de_filas(): Funcion[] {
  return AGREGADAS_FILA.map(([nombre, alias, tipo]) => {
    const cuenta = tipo === "cuenta";
    const unir = tipo === "unir";
    const parametros = cuenta ? [CONDICION] : unir ? [VALOR, CONDICION, SEPARADOR] : [VALOR, CONDICION];
    return {
      nombre,
      alias: [alias],
      grupo: "filas",
      firma: `${nombre}(${parametros.map((p) => p[0]).join(", ")})`,
      parametros,
      que_hace: `${QUE_AGREGA[tipo]!.que} Recorre los registros de esta misma tabla; dentro, {Columna} es de cada registro y {actual:Columna} del que se calcula.`,
      ejemplo: cuenta
        ? `cuentasi({Estado} = "Pagado")`
        : unir
          ? `unirsi({Cliente}, {Estado} = "Pendiente", " / ")`
          : `${nombre}({Monto}, {Estado} = "Pagado")`,
      insertar: cuenta ? `${nombre}(\${1:condición})` : `${nombre}(\${1:valor}, \${2:condición})`,
    };
  });
}

const AGREGACIONES = ["suma", "cuenta", "promedio", "minimo", "maximo", "buscar", "unir"] as const;

function de_otra(prefijo: "tabla" | "sub"): Funcion[] {
  const primero = prefijo === "tabla" ? TABLA : SUBTABLA;
  return AGREGACIONES.map((tipo) => {
    const nombre = `${prefijo}_${tipo}`;
    const cuenta = tipo === "cuenta";
    const unir = tipo === "unir";
    const parametros = cuenta
      ? [primero, CONDICION_OPCIONAL]
      : unir
        ? [primero, VALOR, CONDICION_OPCIONAL, SEPARADOR]
        : [primero, VALOR, CONDICION_OPCIONAL];
    const donde =
      prefijo === "tabla"
        ? "Recorre los registros de otra tabla; dentro, {Columna} es de esa tabla y {actual:Columna} de este registro."
        : "Recorre las filas de una subtabla de este registro; dentro, {Columna} es de cada fila y {actual:Columna} del registro.";
    const n = prefijo === "tabla" ? "Ventas" : "Productos";
    const ejemplo = prefijo === "tabla"
      ? cuenta
        ? `tabla_cuenta("Ventas", {Cliente} = {actual:Nombre})`
        : unir
          ? `tabla_unir("Ventas", {Folio}, {Cliente} = {actual:Nombre}, ", ")`
          : `${nombre}("Ventas", {Total}, {Cliente} = {actual:Nombre})`
      : cuenta
        ? `sub_cuenta("Productos", {Cantidad} > 0)`
        : unir
          ? `sub_unir("Productos", {Nombre}, {Cantidad} > 0, " / ")`
          : `${nombre}("Productos", {Cantidad} * {Precio})`;
    return {
      nombre,
      grupo: prefijo === "tabla" ? "tabla" : "subtabla",
      firma: `${nombre}(${parametros.map((p) => p[0]).join(", ")})`,
      parametros,
      que_hace: `${QUE_AGREGA[tipo]!.que} ${donde}`,
      ejemplo,
      insertar: cuenta ? `${nombre}("\${1:${n}}"\${2:, condición})` : `${nombre}("\${1:${n}}", \${2:valor})`,
    };
  });
}

const SIMPLES: Funcion[] = [
  {
    nombre: "si", alias: ["if"], grupo: "logica",
    firma: "si(condición, si_cumple, si_no)",
    parametros: [["condición", "Una comparación: {Estado} = \"Pagado\", {Monto} > 100; se combinan con y / o."], ["si_cumple", "El resultado cuando la condición se cumple."], ["si_no", "El resultado cuando no."]],
    que_hace: "Elige entre dos resultados según una condición. Se pueden anidar.",
    ejemplo: `si({Estado} = "Pagado", {Monto}, 0)`,
    insertar: "si(${1:condición}, ${2:si_cumple}, ${3:si_no})",
  },
  {
    nombre: "no", alias: ["not"], grupo: "logica",
    firma: "no(condición)",
    parametros: [["condición", "Lo que se niega."]],
    que_hace: "Lo contrario: 1 si la condición no se cumple, 0 si se cumple.",
    ejemplo: `no(vacio({Teléfono}))`,
    insertar: "no(${1:condición})",
  },
  {
    nombre: "vacio", alias: ["empty"], grupo: "logica",
    firma: "vacio(valor)",
    parametros: [["valor", "Una columna o un texto."]],
    que_hace: "1 si el valor está vacío (o solo tiene espacios), 0 si tiene algo.",
    ejemplo: `si(vacio({Descuento}), {Precio}, {Precio} - {Descuento})`,
    insertar: "vacio(${1:valor})",
  },
  {
    nombre: "contiene", alias: ["contains"], grupo: "texto",
    firma: "contiene(texto, buscado)",
    parametros: [["texto", "Donde se busca."], ["buscado", "Lo que se busca; sin importar mayúsculas."]],
    que_hace: "1 si el texto contiene lo buscado (sin importar mayúsculas), 0 si no.",
    ejemplo: `contiene({Notas}, "urgente")`,
    insertar: "contiene(${1:texto}, \"${2:buscado}\")",
  },
  {
    nombre: "empieza", alias: ["startswith"], grupo: "texto",
    firma: "empieza(texto, inicio)",
    parametros: [["texto", "El texto que se revisa."], ["inicio", "Con qué debe empezar; sin importar mayúsculas."]],
    que_hace: "1 si el texto empieza con eso, 0 si no.",
    ejemplo: `empieza({Código}, "750")`,
    insertar: "empieza(${1:texto}, \"${2:inicio}\")",
  },
  {
    nombre: "termina", alias: ["endswith"], grupo: "texto",
    firma: "termina(texto, final)",
    parametros: [["texto", "El texto que se revisa."], ["final", "Con qué debe terminar; sin importar mayúsculas."]],
    que_hace: "1 si el texto termina con eso, 0 si no.",
    ejemplo: `termina({Correo}, "@gmail.com")`,
    insertar: "termina(${1:texto}, \"${2:final}\")",
  },
  {
    nombre: "largo", alias: ["length"], grupo: "texto",
    firma: "largo(texto)",
    parametros: [["texto", "El texto que se mide."]],
    que_hace: "Cuántas letras (caracteres) tiene el texto.",
    ejemplo: `largo({Teléfono}) = 10`,
    insertar: "largo(${1:texto})",
  },
  {
    nombre: "mayus", alias: ["upper"], grupo: "texto",
    firma: "mayus(texto)",
    parametros: [["texto", "El texto que se convierte."]],
    que_hace: "El texto en MAYÚSCULAS.",
    ejemplo: `mayus({Placa})`,
    insertar: "mayus(${1:texto})",
  },
  {
    nombre: "minus", alias: ["lower"], grupo: "texto",
    firma: "minus(texto)",
    parametros: [["texto", "El texto que se convierte."]],
    que_hace: "El texto en minúsculas.",
    ejemplo: `minus({Correo})`,
    insertar: "minus(${1:texto})",
  },
  {
    nombre: "unir", alias: ["concat"], grupo: "texto",
    firma: "unir(valor1, valor2, …)",
    parametros: [["valor1", "El primer pedazo."], ["valor2, …", "Los siguientes, pegados sin espacio."]],
    que_hace: "Pega los valores en un solo texto, tal cual (pon \" \" para separarlos).",
    ejemplo: `unir({Nombre}, " ", {Apellido})`,
    insertar: "unir(${1:valor1}, ${2:valor2})",
  },
  {
    nombre: "texto", alias: ["text"], grupo: "texto",
    firma: "texto(valor)",
    parametros: [["valor", "Un número o columna."]],
    que_hace: "El valor como texto, para unirlo o compararlo como texto.",
    ejemplo: `unir("Folio ", texto({Número}))`,
    insertar: "texto(${1:valor})",
  },
  {
    nombre: "numero", alias: ["number"], grupo: "numeros",
    firma: "numero(valor)",
    parametros: [["valor", "Un texto con un número, como \"12.5\"."]],
    que_hace: "El valor como número (0 si no es un número).",
    ejemplo: `numero({Clave}) + 1`,
    insertar: "numero(${1:valor})",
  },
  {
    nombre: "redondear", alias: ["round"], grupo: "numeros",
    firma: "redondear(valor, decimales?)",
    parametros: [["valor", "El número que se redondea."], ["decimales?", "Cuántos decimales quedan; sin él, ninguno."]],
    que_hace: "Redondea al número de decimales pedido.",
    ejemplo: `redondear({Precio} * 1.16, 2)`,
    insertar: "redondear(${1:valor}, ${2:2})",
  },
  {
    nombre: "floor", grupo: "numeros",
    firma: "floor(valor)",
    parametros: [["valor", "El número."]],
    que_hace: "Redondea hacia abajo al entero (3.9 → 3).",
    ejemplo: `floor({Litros} / 20)`,
    insertar: "floor(${1:valor})",
  },
  {
    nombre: "ceil", grupo: "numeros",
    firma: "ceil(valor)",
    parametros: [["valor", "El número."]],
    que_hace: "Redondea hacia arriba al entero (3.1 → 4).",
    ejemplo: `ceil({Personas} / 4)`,
    insertar: "ceil(${1:valor})",
  },
  {
    nombre: "abs", grupo: "numeros",
    firma: "abs(valor)",
    parametros: [["valor", "El número."]],
    que_hace: "El número sin signo (−5 → 5).",
    ejemplo: `abs({Diferencia})`,
    insertar: "abs(${1:valor})",
  },
  {
    nombre: "sqrt", grupo: "numeros",
    firma: "sqrt(valor)",
    parametros: [["valor", "El número."]],
    que_hace: "La raíz cuadrada.",
    ejemplo: `sqrt({Área})`,
    insertar: "sqrt(${1:valor})",
  },
  {
    nombre: "min", grupo: "numeros",
    firma: "min(a, b, …)",
    parametros: [["a", "Un número."], ["b, …", "Los demás (al menos dos en total)."]],
    que_hace: "El más chico de los valores que le das (no de una columna entera: para eso {minimo:Columna}).",
    ejemplo: `min({Precio}, 500)`,
    insertar: "min(${1:a}, ${2:b})",
  },
  {
    nombre: "max", grupo: "numeros",
    firma: "max(a, b, …)",
    parametros: [["a", "Un número."], ["b, …", "Los demás (al menos dos en total)."]],
    que_hace: "El más grande de los valores que le das.",
    ejemplo: `max({Saldo}, 0)`,
    insertar: "max(${1:a}, ${2:b})",
  },
  {
    nombre: "sum", grupo: "numeros",
    firma: "sum(a, b, …)",
    parametros: [["a, b, …", "Los números que se suman."]],
    que_hace: "La suma de los valores que le das.",
    ejemplo: `sum({Lunes}, {Martes}, {Miércoles})`,
    insertar: "sum(${1:a}, ${2:b})",
  },
  {
    nombre: "avg", grupo: "numeros",
    firma: "avg(a, b, …)",
    parametros: [["a, b, …", "Los números que se promedian."]],
    que_hace: "El promedio de los valores que le das.",
    ejemplo: `avg({Examen 1}, {Examen 2})`,
    insertar: "avg(${1:a}, ${2:b})",
  },
];

/** Todas las funciones del lenguaje, en el orden en que se ofrecen. */
export function funciones_formula(): Funcion[] {
  return [...SIMPLES, ...de_filas(), ...de_otra("tabla"), ...de_otra("sub")];
}

function doc_funcion(f: Funcion): string {
  return [
    f.que_hace,
    f.parametros.map(([p, d]) => `- \`${p}\`: ${d}`).join("\n"),
    `Ejemplo: \`${f.ejemplo}\``,
    f.alias?.length ? `También se escribe ${f.alias.map((a) => `\`${a}\``).join(", ")}.` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}

function items_funcion(f: Funcion): CodeCompletionItem[] {
  const parameters = f.parametros.map(([label, documentation]) => ({ label, documentation }));
  const principal: CodeCompletionItem = {
    label: `${f.nombre}(…)`,
    kind: "function",
    insert_text: f.insertar,
    snippet: true,
    detail: f.firma,
    documentation: doc_funcion(f),
    parameters,
    sort_text: `2${f.nombre}`,
  };
  // El alias en inglés hace lo mismo: se explica en una línea y remite a la principal.
  const alias = (f.alias ?? []).map((nombre): CodeCompletionItem => ({
    label: `${nombre}(…)`,
    kind: "function",
    insert_text: f.insertar.replace(f.nombre, nombre),
    snippet: true,
    detail: f.firma.replace(f.nombre, nombre),
    documentation: `Lo mismo que \`${f.nombre}\`: ${f.que_hace}`,
    parameters,
    sort_text: `3${nombre}`,
  }));
  return [principal, ...alias];
}

const PALABRAS: CodeCompletionItem[] = [
  {
    label: "y", kind: "keyword", detail: "condición y condición", sort_text: "1y",
    documentation: "Se cumplen las dos. También `and` o `&&`.\n\nEjemplo: `{Estado} = \"Pagado\" y {Monto} > 100`",
  },
  {
    label: "o", kind: "keyword", detail: "condición o condición", sort_text: "1o",
    documentation: "Se cumple al menos una. También `or` o `||`. Usa paréntesis para mezclar con `y`.\n\nEjemplo: `{Moto} = \"Italika\" o {Moto} = \"Honda\"`",
  },
];

// #endregion

// #region Descripción de una columna

const nombre_tipo = (c: CampoSpec) => TIPOS_UI[c.tipo]?.nombre ?? c.tipo;

function unidad_de_columna(c: CampoSpec, campos: CampoSpec[], todas: TablaSpec[]): string {
  if (c.unidad_columna) {
    const u = campos.find((x) => x.clave === c.unidad_columna);
    return `la que diga la columna «${u?.etiqueta ?? c.unidad_columna}» en cada registro${c.unidad ? ` (si está vacía, ${c.unidad})` : ""}`;
  }
  if (c.unidad_de) {
    const [ref, campo] = c.unidad_de.split(":");
    const r = campos.find((x) => x.clave === ref);
    const destino = r?.tabla_ref_id ? todas.find((t) => t.id === r.tabla_ref_id) : undefined;
    const col = destino?.campos.find((x) => x.clave === campo);
    return `la del registro elegido en «${r?.etiqueta ?? ref}»${col ? ` (su «${col.etiqueta}»)` : ""}`;
  }
  if (c.unidad_por_registro) return `la que se escriba en cada registro${c.unidad ? ` (se propone ${c.unidad})` : ""}`;
  return c.unidad ?? "";
}

/** Qué es una columna, sacado de su definición: tipo, unidad, de qué tabla, si es un cálculo y cómo se usa. */
export function describir_columna(c: CampoSpec, tabla: TablaSpec, todas: TablaSpec[] = [], como = "Columna", breve = false): string {
  const lineas: string[] = [`${como} **${c.etiqueta}** de la tabla «${tabla.name}».`];
  lineas.push(`- Tipo: ${nombre_tipo(c)}${TIPOS_UI[c.tipo] && !breve ? ` — ${TIPOS_UI[c.tipo].ayuda.toLowerCase()}` : ""}.`);
  const unidad = unidad_de_columna(c, tabla.campos, todas);
  if (unidad) lineas.push(`- Unidad: ${unidad}.`);
  if (c.requerido) lineas.push("- Obligatoria al capturar.");
  if (es_calculado(c) && c.formula) {
    let f = c.formula;
    try {
      f = formula_con_etiquetas(tabla, c.formula, todas);
    } catch {
      // La fórmula se enseña tal cual.
    }
    lineas.push(`- Es un cálculo: \`${f}\`.`);
  }
  if (c.tipo === "opcion" && c.opciones?.length) {
    const ops = c.opciones.slice(0, 8).map((o) => `"${o}"`).join(", ");
    lineas.push(`- Opciones: ${ops}${c.opciones.length > 8 ? ` y ${c.opciones.length - 8} más` : ""}${c.multiple ? " (se eligen varias: usa contiene)" : ""}.`);
  }
  if (c.tipo === "referencia") {
    const destino = todas.find((t) => t.id === c.tabla_ref_id);
    lineas.push(
      destino
        ? `- Enlace a un registro de «${destino.name}»${c.multiple ? " (varios)" : ""}: sus columnas se leen con {${c.etiqueta}.Columna}.`
        : "- Enlace a otra tabla.",
    );
  }
  if (c.tipo === "subtabla") {
    const cols = columnas_de(c).map((x) => x.etiqueta);
    lineas.push(`- Subtabla: en una fórmula vale cuántas filas tiene.${cols.length ? ` Sus columnas: ${cols.join(", ")}.` : ""}`);
  }
  if (c.tipo === "booleano") lineas.push("- En una fórmula vale 1 si está marcada y 0 si no.");
  if (breve) return lineas.join("\n");
  lineas.push(
    TIPOS_NUMERICOS.has(c.tipo)
      ? "- En una fórmula es un número: se suma, se multiplica y se compara con > o <."
      : c.tipo === "subtabla"
        ? ""
        : "- En una fórmula es texto: compáralo con = \"…\" o usa contiene().",
  );
  return lineas.filter(Boolean).join("\n");
}

function describir_constante(k: ConstanteTabla, tabla: TablaSpec): string {
  return [
    `Valor fijo **${k.etiqueta}** de la tabla «${tabla.name}»: se escribe una vez y vale para todos los registros.`,
    k.valor ? `- Ahora vale ${k.valor}${k.unidad ? ` ${k.unidad}` : ""}.` : "- Todavía no tiene valor.",
  ].join("\n");
}

// #endregion

// #region Catálogo de una fórmula

const ESCAPAR = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function item(
  label: string,
  kind: CodeCompletionKind,
  detail: string,
  documentation: string,
  scopes: string[] | undefined,
  extra: Partial<CodeCompletionItem> = {},
): CodeCompletionItem {
  return { label, kind, detail, documentation, ...(scopes ? { scopes } : {}), ...extra };
}

export type OpcionesCatalogo = {
  /** La columna que se edita: no se ofrece a sí misma. */
  excepto?: string;
  /** Total de la tabla: `{suma:Columna}` y compañía en vez de las columnas del registro. */
  total?: boolean;
  /**
   * El cálculo es una columna de esta subtabla y `spec` es `spec_de_subtabla`:
   * cada fila ve sus columnas y las del registro, sin totales ni tablas hijas.
   */
  subtabla?: CampoSpec;
};

type Acumulado = { items: CodeCompletionItem[]; scopes: CodeCompletionScope[] };

const SCOPE_FILAS = "filas";
const PATRON_FILAS = `^(${AGREGADAS_FILA.flat().filter((x) => !QUE_AGREGA[x]).join("|")})$`;

/** Las columnas de una tabla como `{Columna}`, con descripción, en estos ámbitos. */
function columnas_como_items(
  tabla: TablaSpec,
  campos: CampoSpec[],
  todas: TablaSpec[],
  scopes: string[] | undefined,
  como = "Columna",
  prefijo = "",
  breve = false,
): CodeCompletionItem[] {
  return campos.map((c) =>
    item(`{${prefijo}${c.etiqueta}}`, "field", `${nombre_tipo(c)}${c.unidad ? ` · ${c.unidad}` : ""} · ${tabla.name}`, describir_columna(c, tabla, todas, como, breve), scopes, {
      sort_text: `0${c.etiqueta}`,
    }),
  );
}

/** `{Sub}`, `{Sub.Col}`, `{Sub.ultima.Col}`… de cada subtabla de `tabla`, y su ámbito para `sub_*`. */
function subtablas(acc: Acumulado, tabla: TablaSpec, todas: TablaSpec[], fuera: string[], padre: string, prefijo_scope: string, breve = false): void {
  for (const sub of tabla.campos.filter((c) => c.tipo === "subtabla")) {
    const n = sub.etiqueta;
    const cols = columnas_de(sub);
    const id = `${prefijo_scope}sub:${sub.clave}`;
    const en_sub = { ...tabla, name: `${tabla.name} › ${n}`, campos: [...cols, ...tabla.campos.filter((c) => c.tipo !== "subtabla")] };
    acc.items.push(
      item(`{${n}}`, "module", `Subtabla · ${cols.length} columnas`, `${describir_columna(sub, tabla, todas, "Subtabla")}\n\nEjemplo: \`{${n}} > 0\``, fuera),
    );
    for (const c of cols) {
      const numerica = TIPOS_NUMERICOS.has(c.tipo);
      const desc = describir_columna(c, en_sub, todas, "Columna", breve);
      const corta = breve ? "" : `\n\n${describir_columna(c, en_sub, todas, "Columna", true)}`;
      acc.items.push(
        item(`{${n}.${c.etiqueta}}`, "field", `${numerica ? "Suma" : "Junta"} · ${n}`, `${numerica ? "La suma" : "Los valores juntos"} de la columna de todas las filas de «${n}».\n\n${desc}`, fuera),
        item(`{${n}.ultima.${c.etiqueta}}`, "field", `Última fila · ${n}`, `«${c.etiqueta}» de la última fila de «${n}».${corta}`, fuera),
        item(`{${n}.primera.${c.etiqueta}}`, "field", `Primera fila · ${n}`, `«${c.etiqueta}» de la primera fila de «${n}».${corta}`, fuera),
        item(`{${n}.N.${c.etiqueta}}`, "field", `Fila número N · ${n}`, `«${c.etiqueta}» de la fila número N de «${n}» (1 es la primera).\n\nEjemplo: \`{${n}.2.${c.etiqueta}}\`${corta}`, fuera, {
          insert_text: `{${n}.\${1:1}.${c.etiqueta}}`,
          snippet: true,
          hover_pattern: `^\\{${ESCAPAR(n)}\\.\\d+\\.${ESCAPAR(c.etiqueta)}\\}$`,
        }),
      );
    }
    for (const argumento of new Set([n, sub.clave])) {
      acc.scopes.push({ id, function_pattern: "^sub_", argument: argumento, parent: padre, label: n });
    }
    acc.items.push(
      item(n, "module", `Subtabla de «${tabla.name}»`, `Las filas de la subtabla «${n}» (${cols.map((c) => c.etiqueta).join(", ") || "sin columnas"}).`, [padre], {
        argument_of: "^sub_",
      }),
      ...columnas_como_items(en_sub, cols, todas, [id], `Columna de cada fila de «${n}»:`, "", breve),
    );
  }
}

/**
 * El catálogo de una fórmula de `spec`: funciones, columnas, valores fijos,
 * enlaces, subtablas, otras tablas y las tablas hijas, todo con descripción.
 */
export function catalogo_formula(spec: TablaSpec, otras: TablaSpec[] = [], opciones: OpcionesCatalogo = {}): CodeCompletionCatalog {
  const todas = otras.some((t) => t.id === spec.id) ? otras : [spec, ...otras];
  const acc: Acumulado = { items: [], scopes: [{ id: SCOPE_FILAS, function_pattern: PATRON_FILAS, label: "Registros de esta tabla" }] };
  const internos: string[] = [SCOPE_FILAS];
  const tabla = spec;
  const visibles = spec.campos.filter((c) => c.clave !== opciones.excepto);
  const arriba = opciones.total ? [SCOPE_FILAS] : ["", SCOPE_FILAS];

  acc.items.push(...columnas_como_items(tabla, visibles, todas, arriba));
  acc.items.push(
    ...spec.constantes.map((k) =>
      item(`{${k.etiqueta}}`, "constant", `Valor fijo${k.valor ? ` = ${k.valor}` : ""}${k.unidad ? ` ${k.unidad}` : ""}`, describir_constante(k, spec), ["", SCOPE_FILAS], { sort_text: `0${k.etiqueta}` }),
    ),
  );

  // Columnas enteras de la tabla: los totales y cualquier cálculo.
  for (const c of opciones.subtabla ? [] : spec.campos.filter((x) => TIPOS_NUMERICOS.has(x.tipo) && x.clave !== opciones.excepto)) {
    for (const [tipo, que] of [
      ["suma", "La suma"],
      ["promedio", "El promedio"],
      ["minimo", "El valor más chico"],
      ["maximo", "El valor más grande"],
      ["cuenta", "Cuántos registros tienen dato en"],
    ] as const) {
      acc.items.push(
        item(`{${tipo}:${c.etiqueta}}`, "reference", `${que} · toda la tabla`, `${que} de la columna «${c.etiqueta}» en todos los registros de «${spec.name}».\n\n${describir_columna(c, spec, todas)}`, [""], {
          sort_text: opciones.total ? `0${tipo}${c.etiqueta}` : `4${tipo}${c.etiqueta}`,
        }),
      );
    }
  }

  // Enlaces: {Cliente.Teléfono} con las columnas de la tabla enlazada.
  for (const r of visibles.filter((c) => c.tipo === "referencia")) {
    const destino = todas.find((t) => t.id === r.tabla_ref_id);
    if (!destino) continue;
    acc.items.push(
      ...columnas_como_items(destino, destino.campos.filter((c) => c.tipo !== "subtabla"), todas, arriba, `Por el enlace «${r.etiqueta}» (tabla «${destino.name}»), la columna`, `${r.etiqueta}.`, true).map((i) => ({
        ...i,
        sort_text: `1${i.label}`,
      })),
    );
  }

  if (!opciones.subtabla) subtablas(acc, spec, todas, arriba, "", "");

  // Otras tablas: tabla_suma("Ventas", …) ve sus columnas.
  for (const t of todas) {
    const id = `tabla:${t.id}`;
    internos.push(id);
    for (const argumento of new Set([t.name, t.id])) acc.scopes.push({ id, function_pattern: "^tabla_", argument: argumento, label: t.name });
    acc.items.push(
      item(t.name, "module", `Tabla · ${t.campos.length} columnas`, `La tabla «${t.name}»${t.description ? `: ${t.description}` : ""}.\n\nColumnas: ${t.campos.map((c) => c.etiqueta).join(", ") || "ninguna"}.`, undefined, {
        argument_of: "^tabla_",
      }),
      ...columnas_como_items(t, t.campos, todas, [id], `Columna de cada registro de «${t.name}»:`, "", t.id !== spec.id),
    );
    subtablas(acc, t, todas, [id], id, `${id}/`, true);
    for (const s of acc.scopes.filter((x) => x.id.startsWith(`${id}/`))) internos.push(s.id);
  }
  for (const s of acc.scopes.filter((x) => x.id.startsWith("sub:"))) internos.push(s.id);

  // {actual:Columna}: el registro que se calcula, dentro de una función que recorre otras filas.
  const scopes_actual = [...new Set(internos)];
  acc.items.push(
    ...visibles.map((c) =>
      item(`{actual:${c.etiqueta}}`, "reference", `Este registro · ${nombre_tipo(c)}`, `Dentro de sumasi, tabla_* o sub_*: la columna «${c.etiqueta}» del registro que se está calculando, no de las filas que se recorren.\n\n${describir_columna(c, tabla, todas)}`, scopes_actual, {
        sort_text: `1${c.etiqueta}`,
      }),
    ),
    item("{actual:_id}", "reference", "Este registro · su id", "El identificador del registro que se calcula. Sirve para encontrar a sus hijos: `{Enlace} = {actual:_id}`.", scopes_actual, { sort_text: "1_id" }),
  );

  // Tablas hijas: las que tienen un enlace a esta.
  for (const hija of todas) {
    for (const enlace of hija.campos.filter((c) => c.tipo === "referencia" && c.tabla_ref_id === spec.id && !opciones.subtabla)) {
      const numerica = hija.campos.find((c) => TIPOS_NUMERICOS.has(c.tipo));
      const condicion = `{${enlace.etiqueta}} = {actual:_id}`;
      const doc = `«${hija.name}» tiene el enlace «${enlace.etiqueta}» a esta tabla: cada registro de aquí puede tener varios de allá.\n\nColumnas de «${hija.name}»: ${hija.campos.map((c) => c.etiqueta).join(", ")}.`;
      acc.items.push(
        item(`Hijos en ${hija.name}: cuántos`, "snippet", `tabla_cuenta("${hija.name}", ${condicion})`, `${doc}\n\nCuenta los registros de «${hija.name}» enlazados a este.`, [""], {
          insert_text: `tabla_cuenta("${hija.name}", ${condicion})`,
          filter_text: `hijos ${hija.name} tabla_cuenta`,
          sort_text: `5${hija.name}1`,
        }),
        item(`Hijos en ${hija.name}: sumar`, "snippet", `tabla_suma("${hija.name}", {${numerica?.etiqueta ?? "Columna"}}, ${condicion})`, `${doc}\n\nSuma una columna de los registros de «${hija.name}» enlazados a este.`, [""], {
          insert_text: `tabla_suma("${hija.name}", {\${1:${numerica?.etiqueta ?? "Columna"}}}, ${condicion})`,
          snippet: true,
          filter_text: `hijos ${hija.name} tabla_suma`,
          sort_text: `5${hija.name}2`,
        }),
      );
    }
  }

  for (const f of funciones_formula()) acc.items.push(...items_funcion(f));
  acc.items.push(...PALABRAS);

  return {
    items: acc.items,
    scopes: acc.scopes,
    documentation: documentacion_formula(spec, todas, opciones),
    documentation_title: "Ayuda: qué puedes escribir en la fórmula",
  };
}

// #endregion

// #region Documentación completa

function documentacion_formula(spec: TablaSpec, todas: TablaSpec[], opciones: OpcionesCatalogo): string {
  const grupos: Array<[Funcion["grupo"], string]> = [
    ["logica", "Condiciones"],
    ["numeros", "Números"],
    ["texto", "Texto"],
    ["filas", "Registros de esta tabla"],
    ["tabla", "Otra tabla"],
    ["subtabla", "Subtablas de este registro"],
  ];
  const funciones = funciones_formula();
  const propias = spec.campos.filter((c) => c.clave !== opciones.excepto);
  const subs = spec.campos.filter((c) => c.tipo === "subtabla");
  const hijas = opciones.subtabla ? [] : todas.flatMap((t) => t.campos.filter((c) => c.tipo === "referencia" && c.tabla_ref_id === spec.id).map((c) => `«${t.name}» (por «${c.etiqueta}»)`));
  const enlaces = spec.campos.filter((c) => c.tipo === "referencia").map((c) => `{${c.etiqueta}.Columna} → «${todas.find((t) => t.id === c.tabla_ref_id)?.name ?? "?"}»`);
  const md: string[] = [
    "Escribe `{` para elegir una columna; empieza a escribir para ver las funciones. Pasa el cursor sobre algo para ver qué es.",
    "**Cómo se escribe**",
    [
      "- Columnas entre llaves: `{Precio}`. Da igual mayúsculas o acentos.",
      "- Operaciones: `+` `-` `*` (o ×) `/` (o ÷) `%` (resto) `^` (potencia) y paréntesis.",
      "- Comparaciones: `=` `!=` `>` `<` `>=` `<=`. Texto entre comillas: `{Estado} = \"Pagado\"`.",
      "- Condiciones con `y` / `o` y paréntesis: `{Estado} = \"Pagado\" y ({Moto} = \"Italika\" o {Monto} > 100)`.",
      opciones.total
        ? "- Columna entera: `{suma:Monto}`, `{promedio:Monto}`, `{minimo:Monto}`, `{maximo:Monto}`, `{cuenta:Monto}`."
        : "- Columna entera de la tabla: `{suma:Monto}`, `{promedio:Monto}`, `{cuenta:Monto}`…",
      "- Dentro de `sumasi`, `tabla_*` y `sub_*`, `{Columna}` es de cada fila que se recorre y `{actual:Columna}` del registro que se calcula.",
    ].join("\n"),
    propias.length ? `**Columnas de «${spec.name}»**${opciones.subtabla ? ` (las de «${opciones.subtabla.etiqueta}» son de esta fila; las demás, del registro)` : ""}\n\n${propias.map((c) => `- \`{${c.etiqueta}}\` — ${nombre_tipo(c)}${es_calculado(c) ? " (cálculo)" : ""}${c.unidad ? `, ${c.unidad}` : ""}`).join("\n")}` : "",
    spec.constantes.length ? `**Valores fijos**\n\n${spec.constantes.map((k) => `- \`{${k.etiqueta}}\`${k.valor ? ` = ${k.valor}` : ""}`).join("\n")}` : "",
    enlaces.length ? `**Enlaces (tablas padre)**\n\n${enlaces.map((e) => `- \`${e}\``).join("\n")}` : "",
    !opciones.subtabla && subs.length
      ? `**Subtablas**\n\n${subs
          .map((s) => {
            const col = columnas_de(s)[0]?.etiqueta ?? "Columna";
            return `- \`{${s.etiqueta}}\` cuántas filas · \`{${s.etiqueta}.${col}}\` toda la columna · \`{${s.etiqueta}.ultima.${col}}\`, \`{${s.etiqueta}.primera.${col}}\`, \`{${s.etiqueta}.2.${col}}\` una fila · \`sub_suma("${s.etiqueta}", {${col}}, condición)\``;
          })
          .join("\n")}`
      : "",
    hijas.length ? `**Tablas hijas** (enlazadas a esta)\n\n${hijas.map((h) => `- ${h}: \`tabla_suma("Hija", {Columna}, {Enlace} = {actual:_id})\``).join("\n")}` : "",
    todas.length > 1 ? `**Otras tablas**: ${todas.filter((t) => t.id !== spec.id).map((t) => `"${t.name}"`).join(", ")}.` : "",
    ...grupos.map(([g, titulo]) => {
      const fs = funciones.filter((f) => f.grupo === g);
      return `**Funciones: ${titulo}**\n\n${fs.map((f) => `- \`${f.firma}\` — ${f.que_hace} Ej.: \`${f.ejemplo}\``).join("\n")}`;
    }),
  ];
  return md.filter(Boolean).join("\n\n");
}

// #endregion

// #region Plantillas

/** `{Nombre} · Tel. {Teléfono}`: solo columnas de `destino`, el resto es texto tal cual. Una línea. */
export function catalogo_plantilla(destino: TablaSpec, todas: TablaSpec[] = []): CodeCompletionCatalog {
  const columnas = destino.campos.filter((c) => c.tipo !== "foto" && c.tipo !== "fotos");
  return {
    items: columnas_como_items(destino, columnas, todas, undefined),
    trigger_characters: ["{"],
    single_line: true,
    documentation_title: "Ayuda: plantillas",
    documentation: [
      `Escribe texto y pon columnas de «${destino.name}» entre llaves; escribe \`{\` para elegirlas. Lo de fuera de las llaves sale tal cual.`,
      "Ejemplo: `{Nombre} · Tel. {Teléfono}`. Si una columna viene vacía se limpia lo que la rodeaba: `{Nombre} ({Apodo})` sin apodo es «Ana».",
      `**Columnas**\n\n${columnas.map((c) => `- \`{${c.etiqueta}}\` — ${nombre_tipo(c)}`).join("\n")}`,
    ].join("\n\n"),
  };
}

/** Un solo marcador, como `{valor}` en la dirección del escáner o `{nombre}` en la locución. */
export function catalogo_marcadores(marcadores: Array<{ nombre: string; que: string }>, documentation: string, titulo = "Ayuda"): CodeCompletionCatalog {
  return {
    items: marcadores.map((m) => ({ label: `{${m.nombre}}`, kind: "variable", detail: m.que, documentation: m.que })),
    trigger_characters: ["{"],
    single_line: true,
    documentation_title: titulo,
    documentation,
  };
}

export const CATALOGO_URL_ESCANER = catalogo_marcadores(
  [{ nombre: "valor", que: "El código que se acaba de leer, listo para ir en una dirección (se escapan espacios y signos)." }],
  [
    "La dirección que se abre al leer un código. Pon `{valor}` donde va el código.",
    "- `https://ejemplo.mx/consulta?codigo={valor}`",
    "- O una ruta del sistema que empiece con `/`.",
    "Solo `http://` o `https://`. Vacío: no se abre nada.",
  ].join("\n"),
  "Ayuda: dirección del escáner",
);

// #endregion
