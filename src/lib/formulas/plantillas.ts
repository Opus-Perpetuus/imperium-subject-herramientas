import type { CampoSpec, TablaSpec } from "./esquema.ts";

/**
 * Plantillas de tabla listas para usar. Una tabla vacía con «añadir campo» es
 * un lienzo en blanco; estas dan un punto de partida que se puede modificar entero.
 */

export const JORNADA_MOTO = "jornada_moto";
export const GASTOS = "gastos";
export const DEUDAS = "deudas";
export const INVENTARIO = "inventario";
export const CLIENTES = "clientes";
export const PRESTAMOS = "prestamos";
export const TAREAS = "tareas";
export const COLECCION = "coleccion";

const campo = (
  clave: string,
  etiqueta: string,
  tipo: CampoSpec["tipo"],
  extra: Partial<CampoSpec> = {},
): CampoSpec => ({ clave, etiqueta, tipo, ...extra });

/**
 * Jornada de reparto en moto. Kilómetros y rendimiento son calculados: pedirle
 * una resta a quien acaba un turno de diez horas es pedirle un error. Los
 * guardianes `if(... > 0, ..., 0)` evitan cifras negativas o absurdas a media jornada.
 */
export function jornada_moto(id = JORNADA_MOTO): TablaSpec {
  return {
    id,
    name: "Jornada en moto",
    description: "Kilometraje, gasolina y ruta de cada día de reparto.",
    icono: "fa-gauge",
    plantilla_id: JORNADA_MOTO,
    orden_campo: "fecha",
    orden_desc: true,
    cerrable: true,
    constantes: [],
    resumenes: [],
    campos: [
      campo("fecha", "Fecha", "fecha", { requerido: true, en_resumen: true }),
      campo("km_inicial", "Kilometraje inicial", "numero", { requerido: true, unidad: "km", decimales: 1 }),
      campo("foto_km_inicial", "Foto del odómetro (inicio)", "foto"),
      campo("gasolina_inicial", "Gasolina inicial", "nivel", { unidad: "L", decimales: 2, pasos: 6 }),
      campo("foto_gas_inicial", "Foto del medidor (inicio)", "foto"),
      campo("km_final", "Kilometraje final", "numero", { unidad: "km", decimales: 1 }),
      campo("foto_km_final", "Foto del odómetro (fin)", "foto"),
      campo("gasolina_final", "Gasolina final", "nivel", { unidad: "L", decimales: 2, pasos: 6 }),
      campo("foto_gas_final", "Foto del medidor (fin)", "foto"),
      campo("ruta", "Ruta registrada", "ruta"),
      campo("km_recorridos", "Kilómetros recorridos", "calculado", {
        formula: "if({km_final} > 0, {km_final} - {km_inicial}, 0)",
        unidad: "km",
        decimales: 1,
        en_resumen: true,
      }),
      campo("gasolina_usada", "Gasolina gastada", "calculado", {
        formula: "if({gasolina_final} > 0, {gasolina_inicial} - {gasolina_final}, 0)",
        unidad: "L",
        decimales: 2,
      }),
      campo("rendimiento", "Rendimiento", "calculado", {
        formula: "if({gasolina_usada} > 0, round({km_recorridos} / {gasolina_usada}, 1), 0)",
        unidad: "km/L",
        decimales: 1,
        en_resumen: true,
      }),
      campo("entregas", "Entregas", "entero", { en_resumen: true }),
      campo("ingreso", "Ingreso del día", "dinero", { unidad: "$" }),
      campo("gasto_gasolina", "Gasto en gasolina", "dinero", { unidad: "$" }),
      campo("ganancia_neta", "Ganancia neta", "calculado", {
        formula: "if({ingreso} > 0, {ingreso} - {gasto_gasolina}, 0)",
        unidad: "$",
        decimales: 2,
        en_resumen: true,
      }),
      campo("por_entrega", "Ganancia por entrega", "calculado", {
        formula: "if({entregas} > 0, round({ganancia_neta} / {entregas}, 2), 0)",
        unidad: "$",
        decimales: 2,
      }),
      campo("notas", "Notas del día", "nota"),
    ],
  };
}

export function gastos(id = GASTOS): TablaSpec {
  return {
    id,
    name: "Gastos",
    description: "Registro simple de gastos por categoría.",
    icono: "fa-table",
    plantilla_id: GASTOS,
    orden_campo: "fecha",
    orden_desc: true,
    cerrable: true,
    constantes: [],
    resumenes: [],
    campos: [
      campo("fecha", "Fecha", "fecha", { requerido: true, en_resumen: true }),
      campo("concepto", "Concepto", "texto", { requerido: true, en_resumen: true }),
      campo("categoria", "Categoría", "opcion", {
        opciones: ["Comida", "Transporte", "Vivienda", "Salud", "Ocio", "Otro"],
        en_resumen: true,
      }),
      campo("monto", "Monto", "dinero", { requerido: true, unidad: "$", en_resumen: true }),
      campo("comprobante", "Comprobante", "foto"),
      campo("notas", "Notas", "nota"),
    ],
  };
}

/**
 * Una deuda fija y los abonos que le vas haciendo. La deuda vive como valor
 * fijo (es una sola cifra, no un dato de cada abono) y «Restante» y «Avance»
 * son resúmenes: no varían por fila.
 */
export function deudas(id = DEUDAS): TablaSpec {
  return {
    id,
    name: "Deudas",
    description: "Una deuda fija y los abonos que le vas haciendo.",
    icono: "fa-table",
    plantilla_id: DEUDAS,
    orden_campo: null,
    orden_desc: true,
    cerrable: true,
    constantes: [{ clave: "deuda_a_saldar", etiqueta: "Deuda a saldar", valor: "", unidad: "$", decimales: 2 }],
    campos: [
      campo("fecha", "Fecha", "fecha", { requerido: true, en_resumen: true }),
      campo("acreedor", "A quién", "texto", { en_resumen: true }),
      campo("pagado", "Abono", "dinero", { requerido: true, unidad: "$", en_resumen: true }),
      campo("notas", "Notas", "nota"),
    ],
    resumenes: [
      { clave: "abonado", etiqueta: "Abonado", formula: "{suma:pagado}", unidad: "$", decimales: 2 },
      { clave: "restante", etiqueta: "Restante", formula: "{deuda_a_saldar} - {suma:pagado}", unidad: "$", decimales: 2 },
      {
        clave: "avance",
        etiqueta: "Avance",
        formula: "if({deuda_a_saldar} > 0, round({suma:pagado} / {deuda_a_saldar} * 100, 1), 0)",
        unidad: "%",
        decimales: 1,
      },
    ],
  };
}

/** Catálogo, no bitácora: no se cierra. Avisa sola qué hay que volver a pedir. */
export function inventario(id = INVENTARIO): TablaSpec {
  return {
    id,
    name: "Inventario",
    description: "Productos con existencia, costo y precio; avisa qué hay que reponer.",
    icono: "fa-boxes-stacked",
    plantilla_id: INVENTARIO,
    orden_campo: "producto",
    orden_desc: false,
    cerrable: false,
    constantes: [],
    campos: [
      campo("producto", "Producto", "texto", { requerido: true, en_resumen: true }),
      campo("categoria", "Categoría", "opcion", {
        opciones: ["Abarrotes", "Bebidas", "Limpieza", "Papelería", "Otro"],
      }),
      campo("existencia", "Existencia", "entero", { en_resumen: true, unidad: "pzas", decimales: 0 }),
      campo("minimo", "Existencia mínima", "entero", { unidad: "pzas", decimales: 0 }),
      campo("costo", "Costo", "dinero", { unidad: "$" }),
      campo("precio", "Precio de venta", "dinero", { unidad: "$", en_resumen: true }),
      campo("valor", "Valor en inventario", "calculado", { formula: "{existencia} * {costo}", unidad: "$", decimales: 2 }),
      campo("reponer", "¿Reponer?", "calculado", {
        formula: 'si({existencia} <= {minimo}, "Sí", "No")',
        en_resumen: true,
      }),
      campo("foto", "Foto", "foto"),
    ],
    resumenes: [
      { clave: "valor_total", etiqueta: "Valor del inventario", formula: "{suma:valor}", unidad: "$", decimales: 2 },
      { clave: "piezas", etiqueta: "Piezas en total", formula: "{suma:existencia}", unidad: null, decimales: 0 },
      { clave: "por_reponer", etiqueta: "Por reponer", formula: "cuentasi({existencia} <= {minimo})", unidad: null, decimales: 0 },
    ],
  };
}

export function clientes(id = CLIENTES): TablaSpec {
  return {
    id,
    name: "Clientes",
    description: "Directorio de clientes con sus datos de contacto.",
    icono: "fa-address-book",
    plantilla_id: CLIENTES,
    orden_campo: "nombre",
    orden_desc: false,
    cerrable: false,
    constantes: [],
    resumenes: [],
    campos: [
      campo("nombre", "Nombre", "texto", { requerido: true, en_resumen: true }),
      campo("telefono", "Teléfono", "texto", { en_resumen: true }),
      campo("correo", "Correo", "texto"),
      campo("direccion", "Dirección", "texto", { en_resumen: true }),
      campo("cumpleanos", "Cumpleaños", "fecha"),
      campo("notas", "Notas", "nota"),
    ],
  };
}

/** Cosas prestadas (herramienta, libros, equipo): a quién y si ya volvieron. */
export function prestamos(id = PRESTAMOS): TablaSpec {
  return {
    id,
    name: "Préstamos",
    description: "Qué prestaste, a quién y si ya te lo devolvieron.",
    icono: "fa-handshake",
    plantilla_id: PRESTAMOS,
    orden_campo: "fecha",
    orden_desc: true,
    cerrable: false,
    constantes: [],
    campos: [
      campo("que", "Qué presté", "texto", { requerido: true, en_resumen: true }),
      campo("a_quien", "A quién", "texto", { requerido: true, en_resumen: true }),
      campo("fecha", "Fecha del préstamo", "fecha", { requerido: true, en_resumen: true }),
      campo("devolver", "Devolver el", "fecha"),
      campo("devuelto", "¿Ya lo devolvió?", "booleano", { en_resumen: true }),
      campo("foto", "Foto", "foto"),
      campo("notas", "Notas", "nota"),
    ],
    resumenes: [
      { clave: "pendientes", etiqueta: "Sin devolver", formula: "cuentasi({devuelto} = 0)", unidad: null, decimales: 0 },
    ],
  };
}

export function tareas(id = TAREAS): TablaSpec {
  return {
    id,
    name: "Tareas",
    description: "Pendientes con estado, prioridad y fecha límite.",
    icono: "fa-list-check",
    plantilla_id: TAREAS,
    orden_campo: "fecha_limite",
    orden_desc: false,
    cerrable: false,
    constantes: [],
    campos: [
      campo("tarea", "Tarea", "texto", { requerido: true, en_resumen: true }),
      campo("estado", "Estado", "opcion", {
        opciones: ["Por hacer", "En curso", "Hecha"],
        valor_por_defecto: "Por hacer",
        en_resumen: true,
      }),
      campo("prioridad", "Prioridad", "opcion", { opciones: ["Alta", "Media", "Baja"], en_resumen: true }),
      campo("fecha_limite", "Fecha límite", "fecha", { en_resumen: true }),
      campo("notas", "Notas", "nota"),
    ],
    resumenes: [
      { clave: "pendientes", etiqueta: "Pendientes", formula: 'cuentasi({estado} != "Hecha")', unidad: null, decimales: 0 },
    ],
  };
}

/** Libros, películas, discos… con calificación y reseña. */
export function coleccion(id = COLECCION): TablaSpec {
  return {
    id,
    name: "Colección",
    description: "Libros, películas, discos o juegos con tu calificación y reseña.",
    icono: "fa-book",
    plantilla_id: COLECCION,
    orden_campo: "titulo",
    orden_desc: false,
    cerrable: false,
    constantes: [],
    campos: [
      campo("titulo", "Título", "texto", { requerido: true, en_resumen: true }),
      campo("tipo", "Tipo", "opcion", {
        opciones: ["Libro", "Película", "Serie", "Disco", "Juego", "Otro"],
        en_resumen: true,
      }),
      campo("autor", "Autor", "texto"),
      campo("calificacion", "Calificación", "entero", { unidad: "de 5", decimales: 0, en_resumen: true }),
      campo("terminado", "¿Terminado?", "booleano", { en_resumen: true }),
      campo("portada", "Portada", "foto"),
      campo("resena", "Reseña", "nota"),
    ],
    resumenes: [
      { clave: "promedio", etiqueta: "Calificación promedio", formula: "{promedio:calificacion}", unidad: "de 5", decimales: 1 },
      { clave: "terminados", etiqueta: "Terminados", formula: "{suma:terminado}", unidad: null, decimales: 0 },
    ],
  };
}

export function plantillas(): TablaSpec[] {
  return [gastos(), inventario(), clientes(), deudas(), prestamos(), tareas(), coleccion(), jornada_moto()];
}

export function plantilla_de(id: string): TablaSpec | null {
  return plantillas().find((p) => p.id === id) ?? null;
}
