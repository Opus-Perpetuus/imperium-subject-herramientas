import { describe, expect, test } from "bun:test";
import { calculados_en_orden, resuelve_clave, spec_de_fila, validar_esquema, type TablaSpec } from "./esquema.ts";
import { jornada_moto } from "./plantillas.ts";

const spec: TablaSpec = {
  id: "t",
  name: "Abonos",
  constantes: [{ clave: "meta", etiqueta: "Meta", valor: "1000" }],
  resumenes: [],
  campos: [
    { clave: "pagado", etiqueta: "Abono", tipo: "dinero" },
    { clave: "falta", etiqueta: "Falta", tipo: "calculado", formula: "{meta} - {suma:pagado}" },
  ],
};

describe("orden de los calculados", () => {
  test("los campos calculados se ordenan por dependencia", () => {
    const orden = calculados_en_orden(jornada_moto()).map((c) => c.clave);
    expect(orden.indexOf("km_recorridos")).toBeLessThan(orden.indexOf("rendimiento"));
    expect(orden.indexOf("gasolina_usada")).toBeLessThan(orden.indexOf("rendimiento"));
    expect(orden.indexOf("ganancia_neta")).toBeLessThan(orden.indexOf("por_entrega"));
  });

  test("un ciclo no cuelga y deja ambos campos", () => {
    const ciclo: TablaSpec = {
      ...spec,
      campos: [
        { clave: "a", etiqueta: "A", tipo: "calculado", formula: "{b} + 1" },
        { clave: "b", etiqueta: "B", tipo: "calculado", formula: "{a} + 1" },
      ],
    };
    expect(calculados_en_orden(ciclo).map((c) => c.clave).sort()).toEqual(["a", "b"]);
  });
});

describe("claves", () => {
  test("el esquema reconoce las tres familias de referencia", () => {
    expect(resuelve_clave(spec, "pagado")).toBe(true);
    expect(resuelve_clave(spec, "meta")).toBe(true);
    expect(resuelve_clave(spec, "suma:pagado")).toBe(true);
    expect(resuelve_clave(spec, "suma:inventado")).toBe(false);
    expect(resuelve_clave(spec, "inventado")).toBe(false);
  });

  test("un esquema sano no tiene avisos", () => {
    expect(validar_esquema(spec)).toEqual([]);
    expect(validar_esquema(jornada_moto())).toEqual([]);
  });

  test("claves inválidas o repetidas, tipos desconocidos, fórmulas rotas", () => {
    const malo: TablaSpec = {
      ...spec,
      campos: [
        { clave: "Pagado", etiqueta: "Abono", tipo: "dinero" },
        { clave: "meta", etiqueta: "Choca con el fijo", tipo: "texto" },
        { clave: "raro", etiqueta: "Raro", tipo: "cosa" as never },
        { clave: "sin", etiqueta: "Sin fórmula", tipo: "calculado" },
        { clave: "rota", etiqueta: "Rota", tipo: "calculado", formula: "{nada} + (1" },
      ],
      resumenes: [{ clave: "r", etiqueta: "R", formula: "{suma:nada}" }],
    };
    const errores = validar_esquema(malo);
    expect(errores).toContain("Campo: clave inválida «Pagado»");
    expect(errores).toContain("Valor fijo: clave repetida «meta»");
    expect(errores).toContain("«raro»: tipo desconocido «cosa»");
    expect(errores).toContain("«sin»: falta la fórmula");
    expect(errores).toContain("«rota»: «nada» no existe");
    expect(errores.some((e) => e.startsWith("«rota»: Falta"))).toBe(true);
    expect(errores).toContain("«r»: «suma:nada» no existe");
  });
});

describe("lectura desde una fila", () => {
  test("las columnas json pueden venir como texto y se normalizan", () => {
    const s = spec_de_fila({
      id: "t1",
      name: "Mía",
      campos: JSON.stringify([{ clave: "x", tipo: "numero", decimales: "1", requerido: true }]),
      constantes: [{ clave: "k", valor: 5 }],
      resumenes: "no es json",
      cerrable: false,
    });
    expect(s.campos).toEqual([
      {
        clave: "x",
        etiqueta: "x",
        tipo: "numero",
        requerido: true,
        valor_por_defecto: null,
        opciones: [],
        formula: null,
        unidad: null,
        decimales: 1,
        en_resumen: false,
        pasos: 0,
        capacidad: null,
        tabla_ref_id: null,
        clave_ref_display: null,
        multiple: false,
      },
    ]);
    expect(s.constantes[0]).toMatchObject({ clave: "k", etiqueta: "k", valor: "5", decimales: 2 });
    expect(s.resumenes).toEqual([]);
    expect(s.cerrable).toBe(false);
    expect(s.orden_desc).toBe(true);
  });
});
