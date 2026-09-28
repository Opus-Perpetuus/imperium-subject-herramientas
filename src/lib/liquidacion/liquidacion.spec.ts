import { describe, expect, test } from "bun:test";
import type { DomainRow } from "@opus-perpetuus/imperium-core-kit";
import { APORTE, RETIRO, disponible, efectivo_en_mano, liquidar, sello, tipo_caja } from "./liquidacion.ts";

/**
 * Cada regla —piso 0, orden de gastos, montos inválidos fuera, fuente caja
 * intocable, caja aparte del reparto— con números verificables a mano.
 */
let seq = 0;

function pedido(o: {
  cobrar: unknown;
  recibido?: unknown;
  cobrado?: unknown;
  jornada?: string;
  fecha?: string;
  id?: string;
}): DomainRow {
  return {
    id: o.id ?? `pedido-${seq++}`,
    fecha: o.fecha ?? "2026-08-05",
    cobrar: o.cobrar,
    recibido: o.recibido,
    cobrado: o.cobrado ?? false,
    jornada_id: o.jornada ?? "day-hoy",
    propina: 999,
  };
}

function gasto(o: {
  cantidad: unknown;
  fuente?: string;
  descontado?: boolean;
  jornada?: string;
  fecha?: string;
  hora?: string;
  creado?: string;
  id?: string;
}): DomainRow {
  return {
    id: o.id ?? `gasto-${seq++}`,
    fecha: o.fecha ?? "2026-08-05",
    hora: o.hora ?? "10:00",
    created_at: o.creado ?? "2026-08-05T10:00:00.000Z",
    cantidad: o.cantidad,
    fuente: o.fuente ?? "cobros",
    descontado: o.descontado ?? false,
    jornada_id: o.jornada ?? "day-hoy",
  };
}

function caja(o: { tipo: string; cantidad: unknown; jornada?: string; saldado?: boolean; id?: string }): DomainRow {
  return {
    id: o.id ?? `caja-${seq++}`,
    fecha: "2026-08-14",
    tipo: o.tipo,
    cantidad: o.cantidad,
    jornada_id: o.jornada ?? "day-hoy",
    saldado: o.saldado ?? false,
  };
}

describe("liquidar", () => {
  test("sin gastos, a caja es la suma de lo cobrable y la propina lo que sobra (de los crudos)", () => {
    const s = liquidar([pedido({ cobrar: 85, recibido: 100 }), pedido({ cobrar: 120, recibido: "120" })], [], "day-hoy");
    expect(s.a_caja).toBe(205);
    expect(s.propinas).toBe(15);
    expect(s.faltante).toBe(0);
    expect(s.pedido_ids.length).toBe(2);
    expect(s.pedidos_de_hoy).toEqual({ registros: 2, total: 205, fechas: [] });
    expect(s.neto).toBe(205);
    expect(s.nada_que_cobrar).toBe(false);
  });

  test("los gastos de cobros pendientes se descuentan de a caja y se marcan", () => {
    const s = liquidar([pedido({ cobrar: 200, recibido: 200 })], [gasto({ cantidad: 80 })], "day-hoy");
    expect(s.a_caja).toBe(120);
    expect(s.gasto_ids.length).toBe(1);
    expect(s.gastos_sin_cubrir).toBe(0);
  });

  test("recibido vacío es pedido en curso y no entra ni estorba", () => {
    const s = liquidar(
      [pedido({ cobrar: 85, recibido: 100 }), pedido({ cobrar: 60 }), pedido({ cobrar: 40, recibido: "" })],
      [],
      "day-hoy",
    );
    expect(s.a_caja).toBe(85);
    expect(s.en_curso).toBe(2);
    expect(s.pedido_ids.length).toBe(1);
  });

  test("un pedido ya cobrado no vuelve a liquidarse", () => {
    const s = liquidar(
      [pedido({ cobrar: 85, recibido: 100, cobrado: true }), pedido({ cobrar: 50, recibido: 50 })],
      [],
      "day-hoy",
    );
    expect(s.a_caja).toBe(50);
    expect(s.pedido_ids.length).toBe(1);
  });

  test("el faltante suma lo que el efectivo no alcanzó", () => {
    const s = liquidar([pedido({ cobrar: 100, recibido: 80 }), pedido({ cobrar: 50, recibido: 60 })], [], "day-hoy");
    expect(s.a_caja).toBe(150);
    expect(s.faltante).toBe(20);
    expect(s.propinas).toBe(10);
  });

  test("piso cero: los gastos se aplican por fecha y hora y solo completos", () => {
    const g1 = gasto({ cantidad: 60, hora: "08:00", id: "g1" });
    const g2 = gasto({ cantidad: 50, hora: "09:00", id: "g2" });
    const g3 = gasto({ cantidad: 30, hora: "10:00", id: "g3" });
    const s = liquidar([pedido({ cobrar: 100, recibido: 100 })], [g3, g1, g2], "day-hoy");
    expect(s.gasto_ids).toEqual(["g1", "g3"]);
    expect(s.a_caja).toBe(10);
    expect(s.gastos_sin_cubrir).toBe(50);
  });

  test("con la misma fecha y hora decide created_at", () => {
    const a = gasto({ cantidad: 70, creado: "2026-08-05T10:00:05.000Z", id: "a" });
    const b = gasto({ cantidad: 70, creado: "2026-08-05T10:00:01.000Z", id: "b" });
    const s = liquidar([pedido({ cobrar: 100, recibido: 100 })], [a, b], "day-hoy");
    expect(s.gasto_ids).toEqual(["b"]);
  });

  test("un gasto de fuente caja jamás entra, aunque el flag se edite a mano", () => {
    const s = liquidar([pedido({ cobrar: 100, recibido: 100 })], [gasto({ cantidad: 40, fuente: "caja", descontado: false })], "day-hoy");
    expect(s.a_caja).toBe(100);
    expect(s.gasto_ids).toEqual([]);
    expect(s.gastos_sin_cubrir).toBe(0);
  });

  test("montos inválidos o negativos quedan fuera y se reportan", () => {
    const s = liquidar(
      [
        pedido({ cobrar: "abc", recibido: 10, id: "p-malo" }),
        pedido({ cobrar: 50, recibido: -5, id: "p-negativo" }),
        pedido({ cobrar: 80, recibido: 80, id: "p-bueno" }),
      ],
      [gasto({ cantidad: "no sé", id: "g-malo" })],
      "day-hoy",
    );
    expect(new Set(s.invalidos)).toEqual(new Set(["p-malo", "p-negativo", "g-malo"]));
    expect(s.pedido_ids).toEqual(["p-bueno"]);
    expect(s.a_caja).toBe(80);
  });

  test("sin pedidos cobrables no hay nada que liquidar y los gastos sobreviven", () => {
    const s = liquidar([], [gasto({ cantidad: 40 })], "day-hoy");
    expect(s.pedido_ids).toEqual([]);
    expect(s.gasto_ids).toEqual([]);
    expect(s.a_caja).toBe(0);
    expect(s.gastos_sin_cubrir).toBe(40);
    expect(s.nada_que_cobrar).toBe(true);
  });

  test("lo de otras jornadas se desglosa con sus fechas, pero suma igual", () => {
    const s = liquidar(
      [pedido({ cobrar: 100, recibido: 100 }), pedido({ cobrar: 70, recibido: 70, jornada: "day-lunes", fecha: "2026-08-03" })],
      [gasto({ cantidad: 10 }), gasto({ cantidad: 20, jornada: "day-lunes", fecha: "2026-08-03", hora: "12:00" })],
      "day-hoy",
    );
    expect(s.pedidos_de_hoy).toEqual({ registros: 1, total: 100, fechas: [] });
    expect(s.pedidos_de_otras_jornadas).toEqual({ registros: 1, total: 70, fechas: ["2026-08-03"] });
    expect(s.gastos_de_hoy.total).toBe(10);
    expect(s.gastos_de_otras_jornadas.total).toBe(20);
    expect(s.a_caja).toBe(140);
  });

  test("la coma decimal se acepta en cualquier monto", () => {
    const s = liquidar([pedido({ cobrar: "85,5", recibido: "100,5" })], [], "day-hoy");
    expect(s.a_caja).toBe(85.5);
    expect(s.propinas).toBe(15);
  });
});

describe("caja", () => {
  test("el cambio de caja aumenta lo que entrego y no es venta ni propina", () => {
    const s = liquidar([pedido({ cobrar: 100, recibido: 100 })], [], "day-hoy", [caja({ tipo: RETIRO, cantidad: 200 })]);
    expect(s.a_caja).toBe(100);
    expect(s.cambio_de_caja).toBe(200);
    expect(s.propinas).toBe(0);
    expect(s.neto).toBe(300);
  });

  test("el dinero mío reduce lo que entrego y no cuenta como propina", () => {
    const s = liquidar([pedido({ cobrar: 100, recibido: 120 })], [], "day-hoy", [caja({ tipo: APORTE, cantidad: 50 })]);
    expect(s.propinas).toBe(20);
    expect(s.me_debe_caja).toBe(50);
    expect(s.neto).toBe(50);
  });

  test("si puse más de lo que cobré, la caja me paga a mí (neto negativo)", () => {
    const s = liquidar([pedido({ cobrar: 40, recibido: 40 })], [], "day-hoy", [caja({ tipo: APORTE, cantidad: 100 })]);
    expect(s.a_caja).toBe(40);
    expect(s.neto).toBe(-60);
  });

  test("los dos movimientos se compensan sin mezclarse", () => {
    const s = liquidar([pedido({ cobrar: 500, recibido: 500 })], [], "day-hoy", [
      caja({ tipo: RETIRO, cantidad: 200 }),
      caja({ tipo: APORTE, cantidad: 80 }),
    ]);
    expect(s.neto).toBe(620);
    expect(s.caja_ids.length).toBe(2);
  });

  test("tipo irreconocible, cantidad negativa y ya saldado quedan fuera", () => {
    const raro = caja({ tipo: "vete_a_saber", cantidad: 100, id: "raro" });
    const malo = caja({ tipo: RETIRO, cantidad: -50, id: "malo" });
    const saldado = caja({ tipo: RETIRO, cantidad: 200, saldado: true });
    const s = liquidar([pedido({ cobrar: 100, recibido: 100 })], [], "day-hoy", [raro, malo, saldado]);
    expect(s.cambio_de_caja).toBe(0);
    expect(s.me_debe_caja).toBe(0);
    expect(new Set(s.invalidos)).toEqual(new Set(["raro", "malo"]));
    expect(tipo_caja(raro)).toBeNull();
  });

  test("un movimiento de otra jornada sigue pendiente y se desglosa aparte", () => {
    const s = liquidar([pedido({ cobrar: 100, recibido: 100 })], [], "day-hoy", [caja({ tipo: APORTE, cantidad: 70, jornada: "day-0" })]);
    expect(s.me_debe_caja).toBe(70);
    expect(s.caja_de_otras_jornadas.registros).toBe(1);
    expect(s.caja_de_hoy.registros).toBe(0);
  });

  test("un día sin pedidos pero con dinero mío sí tiene algo que liquidar", () => {
    const s = liquidar([], [], "day-hoy", [caja({ tipo: APORTE, cantidad: 100 })]);
    expect(s.nada_que_cobrar).toBe(false);
    expect(s.neto).toBe(-100);
  });
});

describe("disponible", () => {
  test("usa el mínimo entre recibido y cobrar", () => {
    expect(disponible([pedido({ cobrar: 100, recibido: 120 }), pedido({ cobrar: 50, recibido: 30 })], [])).toBe(130);
  });

  test("descuenta los gastos de cobros aún pendientes; en curso y cobrados no aportan", () => {
    expect(
      disponible(
        [pedido({ cobrar: 100, recibido: 100 })],
        [gasto({ cantidad: 30 }), gasto({ cantidad: 20, descontado: true }), gasto({ cantidad: 50, fuente: "caja" })],
      ),
    ).toBe(70);
    expect(
      disponible(
        [pedido({ cobrar: 100 }), pedido({ cobrar: 60, recibido: 60, cobrado: true }), pedido({ cobrar: 40, recibido: 40 })],
        [],
      ),
    ).toBe(40);
  });

  test("efectivo en mano suma el cambio prestado sin autorizar gastos", () => {
    const pedidos = [pedido({ cobrar: 100, recibido: 100 })];
    expect(efectivo_en_mano(pedidos, [], [caja({ tipo: RETIRO, cantidad: 200 }), caja({ tipo: APORTE, cantidad: 30 })])).toBe(300);
    expect(disponible(pedidos, [])).toBe(100);
  });

  test("el sello es fecha y hora", () => {
    expect(sello("2026-08-05", "18:30")).toBe("2026-08-05 18:30");
  });
});
