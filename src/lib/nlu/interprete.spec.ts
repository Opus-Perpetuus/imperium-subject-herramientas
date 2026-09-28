import { describe, expect, test } from "bun:test";
import { interpretar } from "./interprete.ts";

/** Frase real → intención y datos esperados, una por cada intención. */
const CASOS: Array<[string, string, Record<string, string>]> = [
  ["anota un pedido de 250 en la calle 5", "pedido_registrar", { cantidad: "250", domicilio: "calle 5" }],
  ["saqué de cambio 200", "caja_retiro", { cantidad: "200" }],
  ["cuánto llevo hoy", "consulta_hoy", {}],
  ["terminar jornada", "jornada_terminar", {}],
  ["iniciar jornada", "jornada_iniciar", {}],
  ["inicia la jornada con la italika", "jornada_iniciar", { vehiculo: "italika" }],
  ["cambiar de moto a la boxer", "jornada_cambiar_vehiculo", { vehiculo: "boxer" }],
  ["elegir moto pulsar", "jornada_elegir_vehiculo", { vehiculo: "pulsar" }],
  ["pausar jornada", "jornada_pausar", {}],
  ["reanudar jornada", "jornada_reanudar", {}],
  ["gasté 80 pesos de refacciones", "gasto_registrar", { cantidad: "80", motivo: "refacciones" }],
  ["ya entregué el pedido de morelos 45", "entrega_registrar", { domicilio: "morelos 45" }],
  ["entregado", "entrega_registrar", {}],
  ["puse de mi bolsa 150", "caja_aporte", { cantidad: "150" }],
  ["anota un pendiente de 120 en juárez 10", "pendiente_registrar", { cantidad: "120", domicilio: "juarez 10" }],
  ["surtir el pendiente recibí 120", "pendiente_surtir", { cantidad: "120" }],
  ["cargué gasolina 200 pesos 4.2 litros", "recarga_registrar", { cantidad: "200", numero: "4.2" }],
  ["entregar el cobro", "cobro_registrar", {}],
  ["cuántos pedidos llevo", "consulta_pedidos", {}],
  ["cuánto he gastado", "consulta_gastos", {}],
  ["busca la calle morelos", "buscar", { busqueda: "calle morelos" }],
  ["cerrar el día", "cerrar_dia", {}],
  ["márcale a ana", "llamar", { contacto: "ana" }],
  ["no contestar", "llamada_rechazar", {}],
  ["contesta la llamada", "llamada_contestar", {}],
  ["abre whatsapp", "abrir_app", { app: "whatsapp" }],
];

describe("intérprete", () => {
  for (const [frase, intencion, datos] of CASOS) {
    test(`«${frase}» → ${intencion}`, () => {
      const r = interpretar(frase);
      expect(r.intencion).toBe(intencion);
      expect(r.ambiguo).toBe(false);
      expect(r.confianza).toBeGreaterThanOrEqual(0.55);
      expect(r.datos).toMatchObject(datos);
    });
  }

  test("todas las intenciones quedan cubiertas por los casos", () => {
    const vistas = new Set(CASOS.map(([, i]) => i));
    expect(vistas.size).toBe(24);
  });

  test("alternativas: las siguientes candidatas, sin la elegida", () => {
    const r = interpretar("terminar jornada");
    expect(r.alternativas.length).toBeGreaterThan(0);
    expect(r.alternativas.some((a) => a.intencion === "jornada_terminar")).toBe(false);
    for (const a of r.alternativas) expect(a.confianza).toBeLessThanOrEqual(r.confianza);
  });

  test("lo que no se entiende no se adivina y nunca repite basura técnica", () => {
    const r = interpretar("haz un café con java.lang.SecurityException pid=1");
    expect(r.intencion).toBeNull();
    expect(r.respuesta.length).toBeGreaterThan(0);
    expect(r.respuesta).not.toContain("SecurityException");
    expect(r.respuesta).not.toContain("pid=");
    expect(interpretar("haz un café").intencion).toBeNull();
    expect(interpretar("xyzzy foobar").intencion).toBeNull();
  });

  test("un dato obligatorio ausente se pide", () => {
    const r = interpretar("hacer una llamada");
    expect(r.intencion).toBeNull();
    expect(r.respuesta).toContain("Falta el contacto");
  });

  test("intenciones activas: fuera de la lista no existe", () => {
    const r = interpretar("iniciar jornada", { activas: ["consulta_hoy", "consulta_gastos"] });
    expect(r.intencion).toBeNull();
  });

  test("el umbral del perfil manda", () => {
    expect(interpretar("márcale a ana", { umbral: 0.99 }).intencion).toBeNull();
  });
});
