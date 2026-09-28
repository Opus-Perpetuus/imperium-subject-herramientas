import { describe, expect, test } from "bun:test";
import {
  FRASES_ACTIVACION,
  avanzar_bot,
  contiene_activacion,
  numero_de_opcion,
  pedir_opcion,
  quitar_activacion,
  respuesta_si_no,
  type EstadoBot,
} from "./bot.ts";

describe("activación", () => {
  test("variantes de la frase de activación", () => {
    expect(contiene_activacion("Hola Imperium")).toBe(true);
    expect(contiene_activacion("oye imperium, iniciar jornada")).toBe(true);
    expect(contiene_activacion("buenos días")).toBe(false);
    expect(contiene_activacion("hola asistente", FRASES_ACTIVACION)).toBe(false);
  });

  test("quitar la activación deja la orden", () => {
    expect(quitar_activacion("Hola Imperium iniciar jornada")).toBe("iniciar jornada");
    expect(quitar_activacion("oye imperium")).toBe("");
    expect(quitar_activacion("hola jefe", ["hola jefe"])).toBe("");
  });
});

describe("sí o no", () => {
  const r = (t: string) => respuesta_si_no(t);

  test("un sí pelado y sus formas de la calle", () => {
    for (const t of ["sí", "si", "claro", "correcto", "exacto", "ese", "dale", "va", "simón", "ajá", "ok"]) {
      expect(r(t)).toBe(true);
    }
  });

  test("un no y sus formas", () => {
    for (const t of ["no", "nel", "cancela", "otro", "negativo", "todavía no"]) expect(r(t)).toBe(false);
  });

  test("el no gana cuando la frase lleva las dos cosas", () => {
    expect(r("no, ese es otro")).toBe(false);
    expect(r("no, dale al siguiente")).toBe(false);
  });

  test("lo que no responde no se adivina; nunca por prefijo", () => {
    expect(r("espérame tantito")).toBeNull();
    expect(r("cuánto llevo hoy")).toBeNull();
    expect(r("")).toBeNull();
    expect(r("sitio")).toBeNull();
    expect(r("nomás tantito")).toBeNull();
  });
});

describe("opción numerada", () => {
  test("dígitos, palabras y ordinales dentro del rango", () => {
    expect(numero_de_opcion("el dos", 5)).toBe(2);
    expect(numero_de_opcion("uno", 3)).toBe(1);
    expect(numero_de_opcion("opción 3", 5)).toBe(3);
    expect(numero_de_opcion("la segunda", 3)).toBe(2);
    expect(numero_de_opcion("nueve", 3)).toBeNull();
  });
});

describe("máquina del bot", () => {
  const inactivo: EstadoBot = { fase: "inactivo" };

  test("sin activación no pasa nada; activación sola pide la orden", () => {
    expect(avanzar_bot(inactivo, "iniciar jornada")).toMatchObject({ estado: inactivo, decir: null, ejecutar: null });
    const p = avanzar_bot(inactivo, "hola imperium");
    expect(p.estado.fase).toBe("esperando_orden");
    expect(p.decir).toBe("Te escucho.");
  });

  test("activación más orden resuelve y no locuta éxito antes de ejecutar", () => {
    const p = avanzar_bot(inactivo, "Oye Imperium terminar jornada");
    expect(p.ejecutar?.intencion).toBe("jornada_terminar");
    expect(p.decir).toBeNull();
    expect(p.fallo).toBe(false);
    expect(p.estado.fase).toBe("inactivo");
  });

  test("orden desconocida falla con motivo, sin ejecutar", () => {
    const p = avanzar_bot({ fase: "esperando_orden" }, "haz un café");
    expect(p.fallo).toBe(true);
    expect(p.decir).toContain("No pude");
    expect(p.ejecutar).toBeNull();
  });

  test("confirmación: sí ejecuta lo ya resuelto, no lo cancela, dudar repregunta una vez", () => {
    const confirmar = () => "¿Morelos 45?";
    const pregunta = avanzar_bot({ fase: "esperando_orden" }, "entregado", { confirmar });
    expect(pregunta.estado.fase).toBe("esperando_confirmacion");
    expect(pregunta.decir).toBe("¿Morelos 45?");
    expect(pregunta.ejecutar).toBeNull();

    const si = avanzar_bot(pregunta.estado, "sí", { confirmar });
    expect(si.ejecutar?.intencion).toBe("entrega_registrar");
    expect(si.estado.fase).toBe("inactivo");

    const no = avanzar_bot(pregunta.estado, "no, ese es otro", { confirmar });
    expect(no.ejecutar).toBeNull();
    expect(no.decir).toContain("De acuerdo");

    const duda = avanzar_bot(pregunta.estado, "espérame", { confirmar });
    expect(duda.estado.fase).toBe("esperando_confirmacion");
    expect(duda.decir).toBe("¿Morelos 45?");
    const abandona = avanzar_bot(duda.estado, "mmm", { confirmar });
    expect(abandona.estado.fase).toBe("inactivo");
    expect(abandona.ejecutar).toBeNull();
  });

  test("elección numerada completa el dato que faltaba", () => {
    const opciones = [
      { id: "v1", etiqueta: "Italika" },
      { id: "v2", etiqueta: "Boxer" },
      { id: "v3", etiqueta: "Pulsar" },
    ];
    const ask = pedir_opcion({ intencion: "jornada_iniciar", datos: {} }, "vehiculo_id", opciones, "¿Con qué moto?");
    expect(ask.decir).toContain("1: Italika.");
    expect(ask.decir).toContain("2: Boxer.");

    const mal = avanzar_bot(ask.estado, "la verde");
    expect(mal.estado.fase).toBe("esperando_opcion");
    expect(mal.decir).toContain("1 o 2 o 3");

    const pick = avanzar_bot(ask.estado, "2");
    expect(pick.ejecutar).toEqual({ intencion: "jornada_iniciar", datos: { vehiculo_id: "v2" } });
    expect(pick.estado.fase).toBe("inactivo");
  });
});
