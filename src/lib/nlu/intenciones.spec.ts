import { describe, expect, test } from "bun:test";
import { INTENCIONES, casar_intencion } from "./intenciones.ts";

describe("registro de intenciones", () => {
  test("son 24, con ids únicos, etiqueta y resumen", () => {
    expect(INTENCIONES.length).toBe(24);
    expect(new Set(INTENCIONES.map((i) => i.id)).size).toBe(24);
    for (const i of INTENCIONES) {
      expect(i.etiqueta.length).toBeGreaterThan(0);
      expect(i.resumen({ cantidad: "10", contacto: "x", app: "x", busqueda: "x" })).toMatch(/\.$/);
    }
  });

  test("gana la frase más larga: «no contestar» no cae en «contestar»", () => {
    expect(casar_intencion("no contestar")?.intencion).toBe("llamada_rechazar");
    expect(casar_intencion("No contestar la llamada")?.intencion).toBe("llamada_rechazar");
    expect(casar_intencion("rechaza")?.intencion).toBe("llamada_rechazar");
    expect(casar_intencion("contesta")?.intencion).toBe("llamada_contestar");
    expect(casar_intencion("contesta la llamada")?.intencion).toBe("llamada_contestar");
    expect(casar_intencion("contestar")?.intencion).toBe("llamada_contestar");
  });

  test("límite de palabra: no casa dentro de otra palabra", () => {
    expect(casar_intencion("xcontestay")).toBeNull();
  });

  test("los regex capturan datos", () => {
    expect(casar_intencion("llama a maria")).toEqual({ intencion: "llamar", datos: { contacto: "maria" } });
    expect(casar_intencion("abre whatsapp")).toEqual({ intencion: "abrir_app", datos: { app: "whatsapp" } });
    expect(casar_intencion("busca la calle morelos")?.datos.busqueda).toBe("calle morelos");
    expect(casar_intencion("anota un pedido de 250 en la calle 5")?.datos.domicilio).toBe("calle 5");
    expect(casar_intencion("gasté 80 pesos de refacciones")?.datos.motivo).toBe("refacciones");
    expect(casar_intencion("inicia la jornada con la italika")?.datos.vehiculo).toBe("italika");
  });

  test("moto: cambiar y elegir", () => {
    expect(casar_intencion("cambiar de moto")?.intencion).toBe("jornada_cambiar_vehiculo");
    expect(casar_intencion("elegir moto")?.intencion).toBe("jornada_elegir_vehiculo");
  });

  test("solo las activas", () => {
    expect(casar_intencion("iniciar jornada", ["consulta_hoy"])).toBeNull();
  });
});
