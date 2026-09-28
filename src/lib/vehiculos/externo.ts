import { call_subject, type CallSubjectOptions, type KirletCtx } from "@opus-perpetuus/imperium-core-kit";
import { texto } from "../comun.ts";

/**
 * El registro de vehículos vive en `subject-vehiculos` (tabla `vehicle`);
 * Herramientas solo guarda encima los ajustes de reparto (`herr_vehiculos`,
 * clave `vehiculo_id`). Lo que necesita del vehículo externo se pide por el
 * gateway y, si no se puede, se usa el snapshot guardado.
 */

export const APP_VEHICULOS = "subject-vehiculos";

export type OpcionesExterno = Pick<CallSubjectOptions, "fetchImpl" | "env" | "timeout_ms">;

/** Corto: la petición que pide el nombre tiene su propio plazo de 4 s con el núcleo. */
const PLAZO_NOMBRE_MS = 1_500;

/**
 * Nombre del vehículo externo. Si el gateway no responde (o no está
 * configurado, como en tests) devuelve `snapshot`, el `name` de los ajustes
 * guardados o, en último caso, el propio id.
 */
export async function nombre_vehiculo(
  ctx: Pick<KirletCtx, "data">,
  vehiculo_id: string,
  snapshot?: unknown,
  opts: OpcionesExterno = {},
): Promise<string> {
  try {
    const remoto = await call_subject<{ name?: unknown } | null>(
      APP_VEHICULOS,
      `GET /vehicle/${encodeURIComponent(vehiculo_id)}`,
      { ...opts, timeout_ms: opts.timeout_ms ?? PLAZO_NOMBRE_MS },
    );
    if (texto(remoto?.name)) return texto(remoto?.name);
  } catch {
    /* sin gateway o vehículo ausente: cae al snapshot */
  }
  if (texto(snapshot)) return texto(snapshot);
  const ajustes = await ctx.data.findOne("herr_vehiculos", { vehiculo_id });
  return texto(ajustes?.name) || vehiculo_id;
}
