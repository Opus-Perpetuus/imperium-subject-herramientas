import { booleano, numero, texto } from "../comun.ts";

/**
 * Reglas del contestador automático y la decisión pura sobre una llamada.
 * La ejecución (filtrar, contestar, locutar) es de la app Android; aquí solo
 * se decide qué hacer con una llamada ya cruzada contra la agenda del teléfono.
 */

export const AMBITOS = ["nadie", "contactos", "seleccionados", "todos"] as const;
export type Ambito = (typeof AMBITOS)[number];

export const ACCIONES_DESCONOCIDOS = ["permitir", "rechazar", "silenciar"] as const;
export type AccionDesconocidos = (typeof ACCIONES_DESCONOCIDOS)[number];

export const ORIGENES = ["telefono", "whatsapp"] as const;
export type Origen = (typeof ORIGENES)[number];

export const ACCIONES = ["contestar", "rechazar", "silenciar", "permitir"] as const;
export type Accion = (typeof ACCIONES)[number];

export type ReglasTelefono = {
  activo: boolean;
  ambito: Ambito;
  accion_desconocidos: AccionDesconocidos;
  /** Segundos de espera antes de descolgar (0 a 60): da tiempo a oír la locución. */
  retardo_s: number;
  anuncio_activo: boolean;
  /** `{nombre}` se sustituye por el contacto o por el número. */
  anuncio_plantilla: string;
  anuncio_repeticiones: number;
  anunciar_desconocidos: boolean;
  whatsapp_activo: boolean;
  whatsapp_plantilla: string;
  /** Conduciendo se fuerza el contestador y se rechazan desconocidos. */
  conduciendo_activo: boolean;
};

export const REGLAS_POR_DEFECTO: ReglasTelefono = {
  activo: false,
  ambito: "nadie",
  accion_desconocidos: "permitir",
  retardo_s: 5,
  anuncio_activo: true,
  anuncio_plantilla: "Llamada de {nombre}",
  anuncio_repeticiones: 2,
  anunciar_desconocidos: true,
  whatsapp_activo: true,
  whatsapp_plantilla: "Llamada de WhatsApp de {nombre}",
  conduciendo_activo: false,
};

/** Quién llama, ya cruzado con la agenda del teléfono. */
export type Llamante = {
  conocido: boolean;
  /** Clave del contacto en la agenda; solo si es conocido. */
  clave?: string;
  nombre?: string;
  numero?: string;
};

export type Decision = {
  accion: Accion;
  anunciar: boolean;
  /** El sistema no hace sonar el tono: la única señal es la locución. */
  silenciar_timbre: boolean;
  motivo: string;
};

/** Fila de `herr_telefono` → reglas con los valores por defecto donde falte dato. */
export function reglas_desde(fila: Record<string, unknown>): ReglasTelefono {
  const d = REGLAS_POR_DEFECTO;
  const ambito = texto(fila.ambito) as Ambito;
  const accion = texto(fila.accion_desconocidos) as AccionDesconocidos;
  return {
    activo: booleano(fila.activo),
    ambito: AMBITOS.includes(ambito) ? ambito : d.ambito,
    accion_desconocidos: ACCIONES_DESCONOCIDOS.includes(accion) ? accion : d.accion_desconocidos,
    retardo_s: Math.min(60, Math.max(0, numero(fila.retardo_s) ?? d.retardo_s)),
    anuncio_activo: fila.anuncio_activo == null ? d.anuncio_activo : booleano(fila.anuncio_activo),
    anuncio_plantilla: texto(fila.anuncio_plantilla) || d.anuncio_plantilla,
    anuncio_repeticiones: numero(fila.anuncio_repeticiones) ?? d.anuncio_repeticiones,
    anunciar_desconocidos:
      fila.anunciar_desconocidos == null ? d.anunciar_desconocidos : booleano(fila.anunciar_desconocidos),
    whatsapp_activo: fila.whatsapp_activo == null ? d.whatsapp_activo : booleano(fila.whatsapp_activo),
    whatsapp_plantilla: texto(fila.whatsapp_plantilla) || d.whatsapp_plantilla,
    conduciendo_activo: booleano(fila.conduciendo_activo),
  };
}

const DEJAR_SONAR: Decision = {
  accion: "permitir",
  anunciar: false,
  silenciar_timbre: false,
  motivo: "contestador apagado",
};

/**
 * Decide qué hacer con una llamada, en este orden:
 * 1. un contacto de la lista de rechazo se rechaza siempre, esté o no encendido;
 * 2. un desconocido va según `accion_desconocidos`;
 * 3. con el contestador apagado, lo demás suena como siempre;
 * 4. encendido, se descuelga según el ámbito y el timbre va callado.
 */
export function decidir(
  reglas: ReglasTelefono,
  llamante: Llamante,
  seleccionados: ReadonlySet<string>,
  rechazados: ReadonlySet<string>,
  origen: Origen = "telefono",
): Decision {
  if (origen === "whatsapp" && !reglas.whatsapp_activo) {
    return { ...DEJAR_SONAR, motivo: "whatsapp no atendido" };
  }
  const clave = llamante.clave ?? "";
  if (llamante.conocido && clave && rechazados.has(clave)) {
    return { accion: "rechazar", anunciar: false, silenciar_timbre: false, motivo: "contacto rechazado" };
  }

  if (!llamante.conocido) {
    const anunciar = reglas.anuncio_activo && reglas.anunciar_desconocidos;
    switch (reglas.accion_desconocidos) {
      case "rechazar":
        return { accion: "rechazar", anunciar: false, silenciar_timbre: false, motivo: "desconocido: rechazar" };
      case "silenciar":
        return reglas.activo
          ? { accion: "silenciar", anunciar, silenciar_timbre: true, motivo: "desconocido: silenciar" }
          : DEJAR_SONAR;
      default:
        return reglas.activo
          ? {
              accion: reglas.ambito === "todos" ? "contestar" : "permitir",
              anunciar,
              silenciar_timbre: true,
              motivo: "desconocido: permitir",
            }
          : DEJAR_SONAR;
    }
  }

  if (!reglas.activo) return DEJAR_SONAR;

  const contestar =
    reglas.ambito === "todos" ||
    reglas.ambito === "contactos" ||
    (reglas.ambito === "seleccionados" && !!clave && seleccionados.has(clave));
  return {
    accion: contestar ? "contestar" : "permitir",
    anunciar: reglas.anuncio_activo,
    silenciar_timbre: true,
    motivo: `ámbito: ${reglas.ambito}`,
  };
}

/** Qué se locuta: el nombre, si no el número, y si no, que viene oculto. */
export function nombre_a_anunciar(llamante: Llamante): string {
  return texto(llamante.nombre) || texto(llamante.numero) || "número oculto";
}

/** La locución con la plantilla del origen: la de WhatsApp o la telefónica. */
export function texto_anuncio(reglas: ReglasTelefono, llamante: Llamante, origen: Origen = "telefono"): string {
  const plantilla = origen === "whatsapp" ? reglas.whatsapp_plantilla : reglas.anuncio_plantilla;
  return plantilla.replaceAll("{nombre}", nombre_a_anunciar(llamante));
}
