import type { KirletDataClient, NoxServices } from "@opus-perpetuus/imperium-core-kit";
import { push_general_option_seeds } from "./general-option-seeds.ts";
import { push_status_seeds } from "./status-seeds.ts";

/**
 * Herramientas no siembra filas de negocio: cada herramienta arranca vacía y
 * ofrece sus propias plantillas/ejemplos por ruta. Solo empuja estatus y
 * listas generales al núcleo (idempotente, no bloquea el boot).
 */
export async function seed_demo(_ctx: {
  data: KirletDataClient;
  nox: NoxServices;
  technical_id: string;
}): Promise<void> {
  void push_status_seeds().then((r) =>
    console.log(JSON.stringify({ scope: "seed", msg: "status_seeds", ...r, data: undefined })),
  );
  void push_general_option_seeds().then((r) =>
    console.log(JSON.stringify({ scope: "seed", msg: "general_option_seeds", ...r, data: undefined })),
  );
}
