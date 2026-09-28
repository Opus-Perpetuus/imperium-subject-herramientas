import type { KirletDataClient, NoxServices } from "@opus-perpetuus/imperium-core-kit";

/**
 * Herramientas no siembra datos: cada herramienta arranca vacía y ofrece sus
 * propias plantillas/ejemplos por ruta (`/herr-tablas/plantillas`, catálogo de
 * ejemplo del menú). Así una instalación nunva no aparece con datos ajenos.
 */
export async function seed_demo(_ctx: {
  data: KirletDataClient;
  nox: NoxServices;
  technical_id: string;
}): Promise<void> {
  return;
}
