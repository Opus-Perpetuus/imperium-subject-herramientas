import { describe, expect, test } from "bun:test";
import { UMBRAL_POR_DEFECTO, puntuar } from "./puntuador.ts";

describe("puntuador", () => {
  test("una orden clara se acepta sobre el umbral", () => {
    const r = puntuar("iniciar jornada");
    expect(r.preguntar).toBe(false);
    expect(r.mejor?.intencion).toBe("jornada_iniciar");
    expect(r.mejor!.confianza).toBeGreaterThanOrEqual(UMBRAL_POR_DEFECTO);
  });

  test("bajo el umbral no adivina: pregunta", () => {
    const r = puntuar("xyzzy foobar", { umbral: 0.9 });
    expect(r.preguntar).toBe(true);
    expect(r.mensaje).toBeTruthy();
    expect(puntuar("asdf qwerty").preguntar).toBe(true);
  });

  test("sinónimo coloquial resuelve llamar", () => {
    const r = puntuar("márcale a ana");
    expect(r.preguntar).toBe(false);
    expect(r.mejor?.intencion).toBe("llamar");
  });

  test("«no contestar» no es contestar", () => {
    expect(puntuar("no contestar").mejor?.intencion).toBe("llamada_rechazar");
  });

  test("el acierto del registro empuja", () => {
    const r = puntuar("jornada", { aciertos: { jornada_iniciar: 0.95 }, umbral: 0.5 });
    expect(r.mejor?.intencion).toBe("jornada_iniciar");
  });

  test("vacío pide repetir", () => {
    const r = puntuar("   ");
    expect(r.preguntar).toBe(true);
    expect(r.mejor).toBeNull();
  });

  test("dos candidatas casi empatadas sobre el umbral son ambiguas", () => {
    // El puntuador no ve frase exacta: dos intenciones con la misma frase
    // quedan empatadas y hay que preguntar.
    const r = puntuar("jornada", {
      aciertos: { jornada_iniciar: 1, jornada_terminar: 1 },
      umbral: 0.5,
    });
    expect(r.ambiguo).toBe(true);
    expect(r.preguntar).toBe(true);
    expect(r.mensaje).toContain(" o ");
  });

  test("solo intenciones activas", () => {
    const r = puntuar("iniciar jornada", { activas: ["consulta_hoy"] });
    expect(r.candidatos.every((c) => c.intencion === "consulta_hoy")).toBe(true);
  });
});
