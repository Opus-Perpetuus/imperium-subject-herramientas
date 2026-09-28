import type { ReglasTelefono } from "./decision.ts";

/**
 * Modo conduciendo: en marcha no se puede atender el teléfono, así que se
 * enciende el contestador y se rechazan los desconocidos. El perfil guardado
 * no se toca: el ajuste vive solo en la decisión de esa llamada, y al parar
 * todo vuelve como estaba sin nada que restaurar.
 */
export function reglas_conduciendo(reglas: ReglasTelefono): ReglasTelefono {
  return { ...reglas, activo: true, accion_desconocidos: "rechazar" };
}

/** Las reglas que aplican ahora: las del perfil, o las de conducir si va en marcha y lo tiene activado. */
export function aplicar_conduciendo(reglas: ReglasTelefono, conduciendo: boolean): ReglasTelefono {
  return conduciendo && reglas.conduciendo_activo ? reglas_conduciendo(reglas) : reglas;
}
