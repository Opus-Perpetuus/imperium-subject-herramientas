import type { CampoSpec, TablaSpec } from "./esquema.ts";

/**
 * Plantillas de tabla listas para usar. Una tabla vacía con «añadir campo» es
 * un lienzo en blanco; estas dan un punto de partida que se puede modificar entero.
 */

export const JORNADA_MOTO = "jornada_moto";
export const GASTOS = "gastos";
export const DEUDAS = "deudas";

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

export function plantillas(): TablaSpec[] {
  return [jornada_moto(), gastos(), deudas()];
}

export function plantilla_de(id: string): TablaSpec | null {
  return plantillas().find((p) => p.id === id) ?? null;
}
