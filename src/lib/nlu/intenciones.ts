import { contiene_frase, normalizar_ligero } from "./normalizador.ts";

/**
 * Registro de intenciones: frases clave (límite de palabra, gana la más
 * larga) y expresiones regulares que además capturan datos (contacto, app,
 * búsqueda, domicilio). Se casa sobre el texto con normalización ligera, sin
 * expandir números, para que las frases se escriban como se dicen.
 */

export type Datos = Record<string, string>;

export type Patron =
  | { tipo: "frases"; frases: string[] }
  | { tipo: "regex"; regex: RegExp; grupos: Record<number, string> };

export type Intencion = {
  id: string;
  /** Texto corto para preguntar «¿X o Y?» y para la bitácora. */
  etiqueta: string;
  patrones: Patron[];
  /** Modifica datos de Reparto: pide confirmación si el perfil lo exige. */
  escribe: boolean;
  /** Lo ejecuta el teléfono (llamadas, apps, pausa del GPS), no el servidor. */
  telefono?: boolean;
  /** Datos sin los cuales la orden no se entiende (`llama a…` sin contacto). */
  requiere?: string[];
  /** Resumen para confirmar antes de ejecutar. */
  resumen: (datos: Datos) => string;
};

/** Cómo se nombra cada dato al pedirlo o al quejarse de que falta. */
export const ETIQUETAS_DATOS: Record<string, string> = {
  cantidad: "la cantidad",
  hora: "la hora",
  numero: "el número",
  nombre: "el nombre",
  contacto: "el contacto o número",
  app: "la aplicación",
  vehiculo: "el vehículo",
  domicilio: "el domicilio",
  motivo: "el motivo",
  busqueda: "qué buscar",
};

const frases = (...lista: string[]): Patron => ({ tipo: "frases", frases: lista });
const regex = (re: RegExp, grupos: Record<number, string>): Patron => ({ tipo: "regex", regex: re, grupos });

const con_cantidad = (verbo: string) => (d: Datos) =>
  d.cantidad ? `${verbo} por ${d.cantidad} pesos.` : `${verbo}.`;

export const INTENCIONES: Intencion[] = [
  {
    id: "llamada_rechazar",
    etiqueta: "rechazar la llamada",
    patrones: [
      frases(
        "no contestar", "no contestes", "no contesta", "rechaza la llamada",
        "rechazar la llamada", "rechaza", "rechazar", "cuelga", "colgar",
      ),
    ],
    escribe: false,
    telefono: true,
    resumen: () => "Rechazo la llamada.",
  },
  {
    id: "llamada_contestar",
    etiqueta: "contestar la llamada",
    patrones: [
      frases(
        "responde la llamada", "contesta la llamada", "contestar la llamada",
        "descolgar", "contestar", "contesta",
      ),
    ],
    escribe: false,
    telefono: true,
    resumen: () => "Contesto la llamada.",
  },
  {
    id: "llamar",
    etiqueta: "llamar",
    patrones: [
      regex(/(?:llama|llamar|marca|marcar)(?: a| al)? (.+)/, { 1: "contacto" }),
      frases("hacer una llamada", "realizar llamada"),
    ],
    escribe: false,
    telefono: true,
    requiere: ["contacto"],
    resumen: (d) => `Voy a llamar a ${d.contacto}.`,
  },
  {
    id: "abrir_app",
    etiqueta: "abrir una app",
    patrones: [
      regex(/(?:abre|abrir|abre la app|abre aplicacion) (.+)/, { 1: "app" }),
      frases("abrir aplicacion", "abrir app"),
    ],
    escribe: false,
    telefono: true,
    requiere: ["app"],
    resumen: (d) => `Abro ${d.app}.`,
  },
  {
    id: "jornada_iniciar",
    etiqueta: "iniciar jornada",
    patrones: [
      frases(
        "iniciar jornada", "inicia la jornada", "arrancar jornada", "empezar jornada",
        "iniciar dia de trabajo", "iniciar el dia", "empieza la jornada",
        "inicio jornada", "empiezo la jornada", "comenzar jornada",
      ),
      regex(/(?:iniciar|inicia|empezar|empieza|arrancar|arranca)(?: la)? jornada (?:con|en)(?: la| el)? (.+)/, { 1: "vehiculo" }),
    ],
    escribe: true,
    resumen: (d) => (d.vehiculo ? `Inicio la jornada con ${d.vehiculo}.` : "Inicio la jornada."),
  },
  {
    id: "jornada_cambiar_vehiculo",
    etiqueta: "cambiar de vehículo",
    patrones: [
      frases("cambiar de moto", "cambiar moto", "cambia de moto", "cambiar la moto", "cambiar de vehiculo", "cambio de moto"),
      regex(/(?:cambiar|cambia|cambio)(?: de| la| a la| a)? (?:moto|vehiculo) (?:a|por)(?: la| el)? (.+)/, { 1: "vehiculo" }),
    ],
    escribe: true,
    resumen: (d) => (d.vehiculo ? `Cambio a ${d.vehiculo}.` : "Cambio de vehículo."),
  },
  {
    id: "jornada_elegir_vehiculo",
    etiqueta: "elegir vehículo",
    patrones: [
      frases("elegir moto", "escoger moto", "seleccionar moto", "elige moto", "escojo moto"),
      regex(/(?:elige|elegir|escoge|escoger|selecciona)(?: la)? moto (.+)/, { 1: "vehiculo" }),
    ],
    escribe: true,
    resumen: (d) => (d.vehiculo ? `Elijo ${d.vehiculo}.` : "Elijo el vehículo."),
  },
  {
    id: "jornada_terminar",
    etiqueta: "terminar jornada",
    patrones: [
      frases(
        "terminar jornada", "termina la jornada", "cerrar jornada", "finalizar jornada",
        "acabar jornada", "fin de jornada", "cierra la jornada", "termino la jornada",
        "ya termine la jornada",
      ),
    ],
    escribe: true,
    resumen: () => "Termino la jornada.",
  },
  {
    id: "jornada_pausar",
    etiqueta: "pausar jornada",
    patrones: [frases("pausar jornada", "pausa la jornada", "pausar", "pon en pausa")],
    escribe: false,
    telefono: true,
    resumen: () => "Pauso la jornada.",
  },
  {
    id: "jornada_reanudar",
    etiqueta: "reanudar jornada",
    patrones: [frases("reanudar jornada", "reanuda la jornada", "continuar jornada", "sigue la jornada")],
    escribe: false,
    telefono: true,
    resumen: () => "Reanudo la jornada.",
  },
  {
    id: "pedido_registrar",
    etiqueta: "registrar pedido",
    patrones: [
      frases(
        "registrar pedido", "anotar pedido", "nuevo pedido", "anade pedido",
        "agregar pedido", "apunta pedido", "toma pedido", "anota un pedido",
        "anotar un pedido", "registra un pedido", "apunta un pedido", "pedido de",
      ),
      regex(/pedido (?:de |por )?(?:\$ ?)?\d+(?:[.,]\d+)? ?(?:pesos )?(?:en|para|a)(?: la| el| los| las)? (.+)/, { 1: "domicilio" }),
    ],
    escribe: true,
    resumen: (d) => {
      const monto = d.cantidad ? ` por ${d.cantidad} pesos` : "";
      const lugar = d.domicilio ? ` en ${d.domicilio}` : "";
      return `Registro el pedido${monto}${lugar}.`;
    },
  },
  {
    id: "gasto_registrar",
    etiqueta: "registrar gasto",
    patrones: [
      frases(
        "registrar gasto", "anotar gasto", "nuevo gasto", "anade gasto", "apunta gasto",
        "gaste", "gasto de", "anota un gasto", "un gasto de",
      ),
      regex(/(?:gasto|gaste|pague) (?:de |por )?(?:\$ ?)?\d+(?:[.,]\d+)? ?(?:pesos )?(?:de|en|por)(?: la| el| los| las)? ([a-z][a-z ]*)$/, { 1: "motivo" }),
    ],
    escribe: true,
    resumen: (d) => {
      const monto = d.cantidad ? ` de ${d.cantidad} pesos` : "";
      const motivo = d.motivo ? ` de ${d.motivo}` : "";
      return `Registro el gasto${monto}${motivo}.`;
    },
  },
  {
    id: "entrega_registrar",
    etiqueta: "marcar entregado",
    patrones: [
      frases("entregado", "entregue", "ya entregue", "listo el pedido", "pedido entregado", "ya lo entregue"),
      regex(/(?:entregado|entregue|entregado el pedido|entregue el pedido) (?:en|de|a)(?: la| el| los| las)? (.+)/, { 1: "domicilio" }),
    ],
    escribe: true,
    resumen: (d) => (d.domicilio ? `Marco entregado el pedido de ${d.domicilio}.` : "Marco la entrega."),
  },
  {
    id: "caja_retiro",
    etiqueta: "cambio de caja",
    patrones: [
      frases(
        "saque cambio", "tome cambio", "cambio de caja", "caja me dio cambio",
        "me dieron cambio", "saque de cambio", "tome de cambio", "retiro de cambio",
      ),
    ],
    escribe: true,
    resumen: con_cantidad("Anoto el cambio de caja"),
  },
  {
    id: "caja_aporte",
    etiqueta: "dinero propio",
    patrones: [
      frases("puse dinero mio", "puse de mi dinero", "pague de mi bolsa", "puse mi dinero", "dinero mio", "puse de mi bolsa", "de mi bolsa"),
    ],
    escribe: true,
    resumen: con_cantidad("Anoto tu dinero"),
  },
  {
    id: "pendiente_registrar",
    etiqueta: "anotar pendiente",
    patrones: [
      frases("anotar pendiente", "registrar pendiente", "nuevo pendiente", "deja pendiente", "marca pendiente", "anota un pendiente"),
      regex(/pendiente (?:de |por )?(?:\$ ?)?\d+(?:[.,]\d+)? ?(?:pesos )?(?:en|para|a)(?: la| el| los| las)? (.+)/, { 1: "domicilio" }),
    ],
    escribe: true,
    resumen: con_cantidad("Anoto el pendiente"),
  },
  {
    id: "pendiente_surtir",
    etiqueta: "surtir pendiente",
    patrones: [
      frases("surtir pendiente", "surtir el pendiente", "entrega pendiente", "completar pendiente", "marcar entregado", "surti el pendiente"),
    ],
    escribe: true,
    resumen: con_cantidad("Surto el pendiente"),
  },
  {
    id: "recarga_registrar",
    etiqueta: "carga de gasolina",
    patrones: [
      frases(
        "registrar carga de gasolina", "cargar gasolina", "recarga gasolina",
        "anotar gasolina", "carga de combustible", "llene el tanque", "cargue gasolina",
        "eche gasolina", "gasolina",
      ),
    ],
    escribe: true,
    resumen: con_cantidad("Registro la carga de gasolina"),
  },
  {
    id: "cobro_registrar",
    etiqueta: "entregar el cobro",
    patrones: [
      frases("entregar el cobro", "registrar cobro", "anotar cobro", "entrega cobro", "liquidar cobro", "cobro de caja", "entregue el cobro", "liquidar"),
    ],
    escribe: true,
    resumen: () => "Registro la entrega del cobro.",
  },
  {
    id: "consulta_hoy",
    etiqueta: "resumen de hoy",
    patrones: [frases("cuanto llevo hoy", "cuanto he ganado hoy", "resumen de hoy", "como voy hoy", "balance de hoy", "cuanto llevo")],
    escribe: false,
    resumen: () => "Consulta del día.",
  },
  {
    id: "consulta_pedidos",
    etiqueta: "cuántos pedidos",
    patrones: [frases("cuantos pedidos", "cuantos pedidos llevo", "numero de pedidos", "pedidos de hoy")],
    escribe: false,
    resumen: () => "Consulta de pedidos.",
  },
  {
    id: "consulta_gastos",
    etiqueta: "cuánto he gastado",
    patrones: [frases("cuanto he gastado", "cuantos gastos", "gastos de hoy", "total de gastos")],
    escribe: false,
    resumen: () => "Consulta de gastos.",
  },
  {
    id: "buscar",
    etiqueta: "buscar",
    patrones: [
      regex(/(?:busca|buscar|encuentra|localiza)(?: la| el)? (.+)/, { 1: "busqueda" }),
      frases("busca domicilio", "busca el domicilio", "busca la calle"),
    ],
    escribe: false,
    requiere: ["busqueda"],
    resumen: (d) => `Busco ${d.busqueda}.`,
  },
  {
    id: "cerrar_dia",
    etiqueta: "cerrar el día",
    patrones: [frases("cerrar el dia", "cerrar dia", "cierre de dia", "archivo del dia", "cerrar el dia de trabajo")],
    escribe: true,
    resumen: () => "Cierro el día.",
  },
];

export const intencion_por_id = (id: string) => INTENCIONES.find((i) => i.id === id) ?? null;

export const etiqueta_de = (id: string) => intencion_por_id(id)?.etiqueta ?? id.replace(/_/g, " ");

function casar_patron(patron: Patron, texto: string): { datos: Datos; puntos: number } | null {
  if (patron.tipo === "frases") {
    let mejor = "";
    for (const cruda of patron.frases) {
      const frase = normalizar_ligero(cruda);
      if (frase && frase.length > mejor.length && contiene_frase(texto, frase)) mejor = frase;
    }
    return mejor ? { datos: {}, puntos: mejor.length } : null;
  }
  const m = patron.regex.exec(texto);
  if (!m) return null;
  const datos: Datos = {};
  for (const [grupo, clave] of Object.entries(patron.grupos)) {
    const v = (m[Number(grupo)] ?? "").trim();
    if (v) datos[clave] = v;
  }
  return { datos, puntos: m[0].length };
}

/**
 * Intención cuyo patrón casa con más caracteres, con sus datos capturados.
 * Un regex y una frase de la misma intención se suman (datos del regex).
 */
export function casar_intencion(
  texto: string,
  activas: string[] = [],
): { intencion: string; datos: Datos } | null {
  const n = normalizar_ligero(texto);
  type Casada = { intencion: string; datos: Datos; puntos: number };
  const por_intencion = new Map<string, Casada>();
  for (const intencion of INTENCIONES) {
    if (activas.length && !activas.includes(intencion.id)) continue;
    for (const patron of intencion.patrones) {
      const hit = casar_patron(patron, n);
      if (!hit) continue;
      const previa = por_intencion.get(intencion.id);
      por_intencion.set(intencion.id, {
        intencion: intencion.id,
        datos: { ...previa?.datos, ...hit.datos },
        puntos: Math.max(previa?.puntos ?? 0, hit.puntos),
      });
    }
  }
  let mejor: Casada | null = null;
  for (const c of por_intencion.values()) {
    if (!mejor || c.puntos > mejor.puntos) mejor = c;
  }
  return mejor ? { intencion: mejor.intencion, datos: mejor.datos } : null;
}
