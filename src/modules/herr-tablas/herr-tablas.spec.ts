import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  MemoryKirletDataClient,
  create_kirlet_test_context,
  define_subject,
  validate_page_descriptor_renderable,
  walk_ui_tree,
  type NoxPageDescriptor,
  type NoxUiNode,
} from "@opus-perpetuus/imperium-core-kit";
import { LIMITE_FILAS } from "../../lib/comun.ts";
import { validar_esquema } from "../../lib/formulas/esquema.ts";
import { plantillas } from "../../lib/formulas/plantillas.ts";
import { herr_cierres_module } from "../herr-cierres/herr-cierres.routes.ts";
import { herr_registros_module } from "../herr-registros/herr-registros.routes.ts";
import { nombre_archivo } from "./herr-tablas.impresion.ts";
import { herr_tablas_module } from "./herr-tablas.routes.ts";

const SUBJECT = define_subject({
  id: "SUBJECT-herramientas",
  name: "Herramientas",
  compat: { nox: ">=0.5.0", kit: "^0.5.0" },
  storage_files: true,
  modules: [herr_tablas_module, herr_registros_module, herr_cierres_module],
});

type Server = ReturnType<typeof create_kirlet_test_context>;
let server: Server;

beforeEach(() => {
  server = create_kirlet_test_context(SUBJECT);
});
afterEach(() => server.stop());

async function call(method: string, path: string, body?: unknown) {
  const res = await server.fetch(
    new Request(`http://t${path}`, {
      method,
      headers: body === undefined ? {} : { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  );
  const json = (await res.json()) as Record<string, unknown>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { status: res.status, json, data: json.data as any };
}

async function tabla_de_plantilla(plantilla_id: string, name?: string) {
  const r = await call("POST", "/herr-tablas/desde-plantilla", { plantilla_id, name });
  expect(r.status).toBe(201);
  return r.data as Record<string, unknown>;
}

const JORNADA = {
  fecha: "2026-08-07",
  km_inicial: "1180.5",
  km_final: "1310.5",
  gasolina_inicial: "8",
  gasolina_final: "4",
  entregas: "24",
  ingreso: "760",
  gasto_gasolina: "180",
};

function componentes(page: NoxPageDescriptor): string[] {
  const ids: string[] = [];
  walk_ui_tree(page.page, (n) => {
    ids.push(n.component);
  });
  return ids;
}

/** Las celdas de las filas de un nox.table, sin el destino de la fila ni las llaves de sus fotos. */
function celdas_de(rows: unknown): Record<string, unknown>[] {
  return (rows as Record<string, unknown>[]).map((r) =>
    Object.fromEntries(Object.entries(r).filter(([k]) => k !== "_href" && !k.includes("__"))),
  );
}

function nodos(page: NoxPageDescriptor, component: string): NoxUiNode[] {
  const out: NoxUiNode[] = [];
  walk_ui_tree(page.page, (n) => {
    if (n.component === component) out.push(n);
  });
  return out;
}

async function pagina(path: string): Promise<NoxPageDescriptor> {
  const res = await server.fetch(new Request(`http://t${path}`));
  expect(res.status).toBe(200);
  const doc = (await res.json()) as NoxPageDescriptor;
  const ok = validate_page_descriptor_renderable(doc);
  if (!ok.ok) throw new Error(JSON.stringify(ok.issues));
  return doc;
}

describe("plantillas", () => {
  test("se listan y crean una tabla lista para usar", async () => {
    const lista = await call("GET", "/herr-tablas/plantillas");
    expect(lista.status).toBe(200);
    expect(lista.data.map((p: { id: string }) => p.id)).toEqual([
      "gastos",
      "inventario",
      "clientes",
      "deudas",
      "prestamos",
      "tareas",
      "coleccion",
      "jornada_moto",
    ]);
    expect(lista.data[0].nombre).toBe("Gastos");

    const tabla = await tabla_de_plantilla("jornada_moto", "Mi moto");
    expect(tabla.name).toBe("Mi moto");
    expect(tabla.plantilla_id).toBe("jornada_moto");
    expect(tabla.version_esquema).toBe(1);
    expect((tabla.campos as unknown[]).length).toBe(19);

    const inexistente = await call("POST", "/herr-tablas/desde-plantilla", { plantilla_id: "nada" });
    expect(inexistente.status).toBe(404);
  });

  test("todas son válidas y los catálogos no se cierran", async () => {
    for (const p of plantillas()) expect([p.id, validar_esquema(p)]).toEqual([p.id, []]);
    expect((await tabla_de_plantilla("inventario")).cerrable).toBe(false);
    expect((await tabla_de_plantilla("gastos")).cerrable).toBe(true);
  });
});

describe("esquema por CRUD", () => {
  test("se valida al guardar y la versión sube cuando cambia", async () => {
    const creada = await call("POST", "/herr-tablas", {
      name: "Abonos",
      campos: [{ clave: "pagado", etiqueta: "Abono", tipo: "dinero" }],
      constantes: [{ clave: "meta", etiqueta: "Meta", valor: "1000" }],
    });
    expect(creada.status).toBe(201);
    expect(creada.data.version_esquema).toBe(1);
    expect(creada.data.campos[0].decimales).toBe(2);

    const rota = await call("PATCH", `/herr-tablas/${creada.data.id}`, {
      campos: [{ clave: "Pagado", etiqueta: "Abono", tipo: "dinero" }],
    });
    expect(rota.status).toBe(400);
    expect(String(rota.json.message)).toContain("clave inválida");

    const sin_cambio = await call("PATCH", `/herr-tablas/${creada.data.id}`, { description: "otra" });
    expect(sin_cambio.data.version_esquema).toBe(1);

    const con_cambio = await call("PATCH", `/herr-tablas/${creada.data.id}`, {
      campos: [
        { clave: "pagado", etiqueta: "Abono", tipo: "dinero" },
        { clave: "falta", etiqueta: "Falta", tipo: "calculado", formula: "{meta} - {suma:pagado}" },
      ],
    });
    expect(con_cambio.status).toBe(200);
    expect(con_cambio.data.version_esquema).toBe(2);
  });

  test("created_by lo fija el servidor", async () => {
    const creada = await call("POST", "/herr-tablas", { name: "Abonos", created_by: "intruso" });
    expect(creada.status).toBe(201);
    expect(creada.data.created_by).not.toBe("intruso");
    const editada = await call("PATCH", `/herr-tablas/${creada.data.id}`, { created_by: "intruso" });
    expect(editada.data.created_by).toBe(creada.data.created_by);
  });
});

describe("registros", () => {
  test("se calculan los campos calculados, el nombre y la búsqueda", async () => {
    const tabla = await tabla_de_plantilla("jornada_moto");
    const r = await call("POST", "/herr-registros", { tabla_id: tabla.id, valores: JORNADA });
    expect(r.status).toBe(201);
    expect(r.data.calculados).toEqual({
      km_recorridos: "130.0",
      gasolina_usada: "4.00",
      rendimiento: "32.5",
      ganancia_neta: "580.00",
      por_entrega: "24.17",
    });
    expect(r.data.name).toBe("2026-08-07");
    expect(r.data.search_field).toContain("32.5");

    const leido = await call("GET", `/herr-registros/${r.data.id}`);
    expect(leido.data.valores.km_final).toBe("1310.5");
  });

  test("valida tabla, claves y requeridos", async () => {
    const tabla = await tabla_de_plantilla("gastos");
    expect((await call("POST", "/herr-registros", { tabla_id: "no-existe", valores: {} })).status).toBe(404);
    const ajena = await call("POST", "/herr-registros", {
      tabla_id: tabla.id,
      valores: { fecha: "2026-01-01", concepto: "x", monto: "1", inventado: "y" },
    });
    expect(ajena.status).toBe(400);
    expect(String(ajena.json.message)).toContain("inventado");
    const falta = await call("POST", "/herr-registros", {
      tabla_id: tabla.id,
      valores: { fecha: "2026-01-01", concepto: "Tacos" },
    });
    expect(falta.status).toBe(400);
    expect(String(falta.json.message)).toContain("Monto");
  });

  test("los agregados ven las demás filas y la lista filtra por tabla", async () => {
    const tabla = await tabla_de_plantilla("deudas");
    await call("PATCH", `/herr-tablas/${tabla.id}`, {
      constantes: [{ clave: "deuda_a_saldar", etiqueta: "Deuda a saldar", valor: "12000", unidad: "$" }],
    });
    const otra = await tabla_de_plantilla("gastos");
    await call("POST", "/herr-registros", { tabla_id: otra.id, valores: { fecha: "2026-01-01", concepto: "Tacos", monto: "80" } });
    await call("POST", "/herr-registros", { tabla_id: tabla.id, valores: { fecha: "2026-01-02", pagado: "3000" } });
    await call("POST", "/herr-registros", { tabla_id: tabla.id, valores: { fecha: "2026-01-03", pagado: "1500" } });

    const resumen = await call("GET", `/herr-tablas/${tabla.id}/resumen`);
    expect(resumen.status).toBe(200);
    expect(resumen.data.total_filas).toBe(2);
    expect(resumen.data.resumenes).toEqual([
      { clave: "abonado", etiqueta: "Abonado", valor: 4500, texto: "4500.00" },
      { clave: "restante", etiqueta: "Restante", valor: 7500, texto: "7500.00" },
      { clave: "avance", etiqueta: "Avance", valor: 37.5, texto: "37.5" },
    ]);
    expect(resumen.data.agregados.pagado).toEqual({ suma: 4500, promedio: 2250, cuenta: 2, minimo: 1500, maximo: 3000 });

    const filtrada = await call("GET", `/herr-registros?tabla_id=${tabla.id}`);
    expect(filtrada.data.length).toBe(2);
    expect(filtrada.json.total_elementos).toBe(2);
    const opciones = await call("GET", `/herr-registros?tabla_id=${tabla.id}&as=options`);
    expect(opciones.data.map((o: { label: string }) => o.label).sort()).toEqual(["2026-01-02", "2026-01-03"]);
    expect((await call("GET", "/herr-registros")).data.length).toBe(3);
  });

  test("los calculados de un registro cuentan al propio registro, como el resumen", async () => {
    const tabla = await call("POST", "/herr-tablas", {
      name: "Abonos",
      campos: [
        { clave: "pagado", etiqueta: "Abono", tipo: "dinero" },
        { clave: "n", etiqueta: "N", tipo: "calculado", formula: "cuentasi(1)", decimales: 0 },
        { clave: "acum", etiqueta: "Acumulado", tipo: "calculado", formula: "{suma:pagado}", decimales: 0 },
      ],
    });
    const a = await call("POST", "/herr-registros", { tabla_id: tabla.data.id, valores: { pagado: "100" } });
    expect(a.data.calculados).toEqual({ n: "1", acum: "100" });
    const b = await call("POST", "/herr-registros", { tabla_id: tabla.data.id, valores: { pagado: "50" } });
    expect(b.data.calculados).toEqual({ n: "2", acum: "150" });
    const b2 = await call("PATCH", `/herr-registros/${b.data.id}`, { valores: { pagado: "60" } });
    expect(b2.data.calculados).toEqual({ n: "2", acum: "160" });
    const resumen = await call("GET", `/herr-tablas/${tabla.data.id}/resumen`);
    expect(resumen.data.agregados.n.maximo).toBe(2);
    expect(resumen.data.agregados.acum.maximo).toBe(160);
  });

  test("created_by lo fija el servidor", async () => {
    const tabla = await tabla_de_plantilla("gastos");
    const valores = { fecha: "2026-01-01", concepto: "x", monto: "1" };
    const r = await call("POST", "/herr-registros", { tabla_id: tabla.id, valores, created_by: "intruso" });
    expect(r.status).toBe(201);
    expect(r.data.created_by).not.toBe("intruso");
    const editado = await call("PATCH", `/herr-registros/${r.data.id}`, { created_by: "intruso" });
    expect(editado.data.created_by).toBe(r.data.created_by);
  });

  test("las fotos se guardan como adjunto y en la fila queda su URL", async () => {
    const tabla = await tabla_de_plantilla("gastos");
    const r = await call("POST", "/herr-registros", {
      tabla_id: tabla.id,
      valores: { fecha: "2026-01-01", concepto: "x", monto: "1", comprobante: "data:image/png;base64,iVBORw0KGgo=" },
    });
    expect(r.status).toBe(201);
    const url = r.data.valores.comprobante as string;
    expect(url.startsWith("/api/p/files/")).toBe(true);
    const editado = await call("PATCH", `/herr-registros/${r.data.id}`, {
      valores: { ...r.data.valores, concepto: "y" },
    });
    expect(editado.data.valores.comprobante).toBe(url);
    const pdf = await call("POST", "/herr-registros", {
      tabla_id: tabla.id,
      valores: { fecha: "2026-01-01", concepto: "x", monto: "1", comprobante: "data:application/pdf;base64,JVBERg==" },
    });
    expect(pdf.status).toBe(400);
  });

  test("fecha se guarda como día y fecha y hora en la hora del negocio", async () => {
    const tabla = await call("POST", "/herr-tablas", {
      name: "Visitas",
      campos: [
        { clave: "dia", etiqueta: "Día", tipo: "fecha" },
        { clave: "llegada", etiqueta: "Llegada", tipo: "fecha_hora" },
      ],
    });
    const r = await call("POST", "/herr-registros/captura", {
      tabla_id: tabla.data.id,
      dia: "2026-08-07T06:00:00.000Z",
      llegada: "2026-08-08T04:00:00.000Z",
    });
    expect(r.data.valores).toEqual({ dia: "2026-08-07", llegada: "2026-08-07T22:00" });
    const tal_cual = await call("POST", "/herr-registros/captura", {
      tabla_id: tabla.data.id,
      dia: "2026-08-07",
      llegada: "2026-08-07T22:00",
    });
    expect(tal_cual.data.valores).toEqual({ dia: "2026-08-07", llegada: "2026-08-07T22:00" });
  });

  test("una fecha y hora con forma ISO pero imposible es 400, no 500", async () => {
    const tabla = await call("POST", "/herr-tablas", {
      name: "Visitas",
      campos: [{ clave: "llegada", etiqueta: "Llegada", tipo: "fecha_hora" }],
    });
    const r = await call("POST", "/herr-registros/captura", { tabla_id: tabla.data.id, llegada: "2026-13-45T25:99Z" });
    expect(r.status).toBe(400);
    expect(String(r.json.message)).toContain("«Llegada» no es una fecha y hora válida");
  });

  test("captura plana desde el formulario: alta y edición", async () => {
    const tabla = await tabla_de_plantilla("gastos");
    const alta = await call("POST", "/herr-registros/captura", {
      tabla_id: tabla.id,
      fecha: "2026-02-01",
      concepto: "Gasolina",
      categoria: "Transporte",
      monto: 350,
      comprobante: "",
      notas: "",
    });
    expect(alta.status).toBe(201);
    expect(alta.data.tabla_id).toBe(tabla.id);
    expect(alta.data.valores.monto).toBe("350");

    const edicion = await call("POST", "/herr-registros/captura", {
      tabla_id: tabla.id,
      id: alta.data.id,
      fecha: "2026-02-01",
      concepto: "Gasolina Pemex",
      monto: "360",
    });
    expect(edicion.status).toBe(200);
    expect(edicion.data.valores.concepto).toBe("Gasolina Pemex");
    expect((await call("GET", `/herr-registros?tabla_id=${tabla.id}`)).data.length).toBe(1);
  });

  test("buscar por prefijos y por recencia", async () => {
    const tabla = await tabla_de_plantilla("gastos");
    await call("POST", "/herr-registros", { tabla_id: tabla.id, valores: { fecha: "2026-01-01", concepto: "Tacos al pastor", monto: "80" } });
    await call("POST", "/herr-registros", { tabla_id: tabla.id, valores: { fecha: "2026-01-02", concepto: "Gasolina Pémex", monto: "350" } });
    const pem = await call("POST", `/herr-tablas/${tabla.id}/buscar`, { q: "pem" });
    expect(pem.data.map((r: { name: string }) => r.name)).toEqual(["2026-01-02"]);
    const todos = await call("POST", `/herr-tablas/${tabla.id}/buscar`, { q: "" });
    expect(todos.data.length).toBe(2);
    expect((await call("POST", `/herr-tablas/${tabla.id}/buscar`, { q: "nada" })).data).toEqual([]);
  });
});

describe("cierre", () => {
  test("archiva las filas con resúmenes, fijos y calculados al día, y vacía la tabla", async () => {
    const tabla = await tabla_de_plantilla("deudas");
    await call("PATCH", `/herr-tablas/${tabla.id}`, {
      constantes: [{ clave: "deuda_a_saldar", etiqueta: "Deuda a saldar", valor: "5000" }],
      campos: [
        ...(tabla.campos as unknown[]),
        { clave: "acumulado", etiqueta: "Acumulado", tipo: "calculado", formula: "{suma:pagado}" },
      ],
    });
    await call("POST", "/herr-registros", { tabla_id: tabla.id, valores: { fecha: "2026-01-02", pagado: "3000" } });
    await call("POST", "/herr-registros", { tabla_id: tabla.id, valores: { fecha: "2026-01-03", pagado: "1500" } });

    const cierre = await call("POST", `/herr-tablas/${tabla.id}/cerrar`);
    expect(cierre.status).toBe(200);
    expect(cierre.data.filas).toBe(2);
    expect(String(cierre.data.cierre_id).startsWith("cierre-")).toBe(true);

    expect((await call("GET", `/herr-registros?tabla_id=${tabla.id}`)).data.length).toBe(0);
    const archivados = await call("GET", "/herr-cierres");
    expect(archivados.data.length).toBe(2);
    const uno = archivados.data.find((c: { name: string }) => c.name === "2026-01-02");
    expect(uno.tabla_id).toBe(tabla.id);
    expect(uno.cierre_id).toBe(cierre.data.cierre_id);
    expect(uno.valores).toMatchObject({
      fecha: "2026-01-02",
      pagado: "3000",
      // Guardado valía "3000.00" (la segunda fila aún no existía); al cerrar se reevalúa con la tabla entera.
      acumulado: "4500.00",
      abonado: "4500.00",
      restante: "500.00",
      deuda_a_saldar: "5000",
      cierre_id: cierre.data.cierre_id,
    });
    expect(uno.custom_data.registro_id).toBeDefined();

    expect((await call("POST", `/herr-tablas/${tabla.id}/cerrar`)).status).toBe(409);
  });

  test("con más filas que LIMITE_FILAS cierra todas, sin recortar", async () => {
    server.stop();
    const data = new MemoryKirletDataClient(SUBJECT.schema());
    server = create_kirlet_test_context(SUBJECT, { data });
    const tabla = await call("POST", "/herr-tablas", {
      name: "Notas",
      campos: [{ clave: "nota", etiqueta: "Nota", tipo: "texto" }],
    });
    const total = LIMITE_FILAS + 3;
    for (let i = 0; i < total; i++) {
      await data.insert("herr_registros", {
        id: `registro-${String(i).padStart(5, "0")}`,
        name: `n${i}`,
        tabla_id: tabla.data.id,
        valores: { nota: `n${i}` },
        is_active: true,
        created_at: "t",
        updated_at: "t",
      });
    }
    expect((await call("GET", `/herr-tablas/${tabla.data.id}/resumen`)).data.total_filas).toBe(total);
    const cierre = await call("POST", `/herr-tablas/${tabla.data.id}/cerrar`);
    expect(cierre.status).toBe(200);
    expect(cierre.data.filas).toBe(total);
    expect(await data.count("herr_registros", { tabla_id: tabla.data.id, is_active: true })).toBe(0);
    expect(await data.count("herr_cierres", { cierre_id: cierre.data.cierre_id })).toBe(total);
  });

  test("una tabla no cerrable da 409", async () => {
    const tabla = await tabla_de_plantilla("gastos");
    await call("PATCH", `/herr-tablas/${tabla.id}`, { cerrable: false });
    await call("POST", "/herr-registros", { tabla_id: tabla.id, valores: { fecha: "2026-01-01", concepto: "x", monto: "1" } });
    expect((await call("POST", `/herr-tablas/${tabla.id}/cerrar`)).status).toBe(409);
  });

  test("los cierres son de solo lectura por el CRUD", async () => {
    expect((await call("POST", "/herr-cierres", { name: "x" })).status).toBe(400);
    expect((await call("PATCH", "/herr-cierres/nada", { name: "x" })).status).toBe(400);
    expect((await call("PUT", "/herr-cierres", { id: "nada", name: "x" })).status).toBe(400);
    expect((await call("PUT", "/herr-cierres/batch", [{ id: "nada", name: "x" }])).status).toBe(400);
    expect((await call("DELETE", "/herr-cierres/nada")).status).toBe(400);
    expect((await call("DELETE", "/herr-cierres/id/nada")).status).toBe(400);
  });
});

describe("páginas", () => {
  test("las feature-shell de los tres CRUD son válidas", async () => {
    for (const id of ["herramientas.herr-tablas", "herramientas.herr-registros", "herramientas.herr-cierres"]) {
      const doc = await pagina(`/pages/${id}`);
      expect(doc.page.component).toBe("nox.feature-shell");
    }
  });

  test("la tabla enseña resúmenes, filas, alta y cierre", async () => {
    const tabla = await tabla_de_plantilla("deudas");
    await call("PATCH", `/herr-tablas/${tabla.id}`, {
      constantes: [{ clave: "deuda_a_saldar", etiqueta: "Deuda a saldar", valor: "5000" }],
    });
    const registro = (
      await call("POST", "/herr-registros", { tabla_id: tabla.id, valores: { fecha: "2026-01-02", acreedor: "Banco", pagado: "3000" } })
    ).data;

    const doc = await pagina(`/pages/herramientas.herr-tabla?id=${tabla.id}`);
    expect(doc.title).toBe("Deudas");
    expect(componentes(doc)).toEqual(expect.arrayContaining(["nox.toolbar", "nox.stats", "nox.table", "nox.button"]));
    const [stats] = nodos(doc, "nox.stats");
    expect(stats!.props!.items).toEqual([
      { id: "abonado", label: "Abonado", value: "3000.00 $" },
      { id: "restante", label: "Restante", value: "2000.00 $" },
      { id: "avance", label: "Avance", value: "60.0 %" },
    ]);
    const [table] = nodos(doc, "nox.table");
    expect((table!.props!.columns as { key: string }[]).map((c) => c.key)).toEqual(["fecha", "acreedor", "pagado"]);
    expect(table!.props!.rows).toEqual([
      {
        fecha: "2026-01-02",
        acreedor: "Banco",
        pagado: "3000.00 $",
        _href: `/internal/herr-registro?tabla=${tabla.id}&id=${registro.id}`,
      },
    ]);
    const botones = nodos(doc, "nox.button").map((b) => b.props!);
    expect(botones.map((b) => b.href)).toContain(`/internal/herr-registro?tabla=${tabla.id}`);
    expect(botones.map((b) => b.href)).toContain(`/internal/herr-tabla?id=${tabla.id}&modo=disenar`);
    expect(botones.map((b) => b.href)).toContain(`/internal/herr-tabla?id=${tabla.id}&modo=cierres`);
    expect(botones.map((b) => b.href)).toContain(`/internal/herr-tabla?id=${tabla.id}&modo=cerrar`);

    const sin_id = await pagina("/pages/herramientas.herr-tabla");
    expect(sin_id.title).toBe("Mis tablas");
    expect(nodos(sin_id, "nox.button").map((b) => b.props!.href)).toContain(`/internal/herr-tabla?id=${tabla.id}`);
  });

  test("el formulario de registro tiene un input por campo capturable y carga el valor al editar", async () => {
    const tabla = await tabla_de_plantilla("jornada_moto");
    const nuevo = await pagina(`/pages/herramientas.herr-registro?tabla=${tabla.id}`);
    const [form] = nodos(nuevo, "nox.form");
    expect(form!.props).toMatchObject({
      method: "POST",
      action: "api://herr-registros/captura",
      then: `herramientas.herr-tabla?id=${tabla.id}`,
    });
    const inputs = form!.children!.filter((c) => c.component.startsWith("nox.input-"));
    const por_nombre = new Map(inputs.map((i) => [i.props!.name as string, i.component]));
    expect(por_nombre.get("tabla_id")).toBe("nox.input-hidden");
    expect(por_nombre.has("id")).toBe(false);
    expect(por_nombre.has("km_recorridos")).toBe(false);
    expect(por_nombre.get("fecha")).toBe("nox.input-date");
    expect(por_nombre.get("km_inicial")).toBe("nox.input-number");
    expect(por_nombre.get("gasolina_inicial")).toBe("nox.input-number");
    expect(por_nombre.get("foto_km_inicial")).toBe("nox.input-image");
    expect(por_nombre.get("ingreso")).toBe("nox.input-money");
    expect(por_nombre.get("notas")).toBe("nox.input-markdown");
    expect(inputs.length).toBe(1 + 14);
    expect(form!.children!.at(-1)!.component).toBe("nox.button");

    const registro = await call("POST", "/herr-registros", { tabla_id: tabla.id, valores: JORNADA });
    const editar = await pagina(`/pages/herramientas.herr-registro?tabla=${tabla.id}&id=${registro.data.id}`);
    const [form_edit] = nodos(editar, "nox.form");
    const valor = (name: string) => form_edit!.children!.find((c) => c.props!.name === name)!.props!.value;
    expect(valor("id")).toBe(registro.data.id);
    expect(valor("km_final")).toBe(1310.5);
    expect(valor("fecha")).toBe("2026-08-07");

    const sin_tabla = await pagina("/pages/herramientas.herr-registro");
    expect(componentes(sin_tabla)).toContain("nox.empty");
  });

  test("las referencias salen con sus etiquetas y como opciones", async () => {
    const motos = await call("POST", "/herr-tablas", {
      name: "Motos",
      cerrable: false,
      campos: [{ clave: "nombre", etiqueta: "Nombre", tipo: "texto", en_resumen: true }],
    });
    const italika = await call("POST", "/herr-registros", { tabla_id: motos.data.id, valores: { nombre: "Italika 150" } });
    const jornadas = await call("POST", "/herr-tablas", {
      name: "Jornadas",
      campos: [
        { clave: "fecha", etiqueta: "Fecha", tipo: "fecha", en_resumen: true },
        { clave: "moto", etiqueta: "Moto", tipo: "referencia", tabla_ref_id: motos.data.id, clave_ref_display: "nombre", en_resumen: true },
      ],
    });
    await call("POST", "/herr-registros", { tabla_id: jornadas.data.id, valores: { fecha: "2026-03-01", moto: italika.data.id } });

    const doc = await pagina(`/pages/herramientas.herr-tabla?id=${jornadas.data.id}`);
    expect(celdas_de(nodos(doc, "nox.table")[0]!.props!.rows)).toEqual([{ fecha: "2026-03-01", moto: "Italika 150" }]);

    const por_etiqueta = await call("POST", `/herr-tablas/${jornadas.data.id}/buscar`, { q: "italika" });
    expect(por_etiqueta.data.map((r: { name: string }) => r.name)).toEqual(["2026-03-01"]);

    const form = await pagina(`/pages/herramientas.herr-registro?tabla=${jornadas.data.id}`);
    const moto = nodos(form, "nox.input-datalist")[0]!;
    expect(moto.props!.options).toEqual([{ value: italika.data.id, label: "Italika 150" }]);
  });

  test("un enlace llega como la opción entera del datalist: se guarda su id, y lo ya guardado así se lee", async () => {
    server.stop();
    const data = new MemoryKirletDataClient(SUBJECT.schema());
    server = create_kirlet_test_context(SUBJECT, { data });
    const productos = await call("POST", "/herr-tablas", {
      name: "Productos",
      cerrable: false,
      campos: [{ clave: "nombre", etiqueta: "Nombre", tipo: "texto", en_resumen: true }],
    });
    const vino = await call("POST", "/herr-registros", { tabla_id: productos.data.id, valores: { nombre: "Vino tinto" } });
    const bitacora = await call("POST", "/herr-tablas", {
      name: "Bitácora",
      campos: [
        { clave: "producto", etiqueta: "Producto", tipo: "referencia", tabla_ref_id: productos.data.id, en_resumen: true },
        { clave: "cantidad", etiqueta: "Cantidad", tipo: "entero", en_resumen: true },
      ],
    });
    const opcion = { _id: vino.data.id, name: "Vino tinto" };
    const nueva = await call("POST", "/herr-registros/captura", { tabla_id: bitacora.data.id, producto: opcion, cantidad: 35 });
    expect(nueva.status).toBe(201);
    expect(nueva.data.valores.producto).toBe(vino.data.id);

    const ts = "2026-10-01T12:00:00.000Z";
    await data.insert("herr_registros", {
      id: "registro_guardado_como_opcion",
      name: JSON.stringify(opcion),
      tabla_id: bitacora.data.id,
      valores: { producto: JSON.stringify(opcion), cantidad: "12" },
      calculados: {},
      is_active: true,
      created_at: ts,
      updated_at: ts,
    });

    const lista = await pagina(`/pages/herramientas.herr-tabla?id=${bitacora.data.id}`);
    expect(celdas_de(nodos(lista, "nox.table")[0]!.props!.rows)).toContainAllValues([
      { producto: "Vino tinto", cantidad: "35" },
      { producto: "Vino tinto", cantidad: "12" },
    ]);
    const encontrados = await call("POST", `/herr-tablas/${bitacora.data.id}/buscar`, { q: "vino" });
    expect(encontrados.data).toHaveLength(2);
    const editar = await pagina(`/pages/herramientas.herr-registro?tabla=${bitacora.data.id}&id=registro_guardado_como_opcion`);
    expect(nodos(editar, "nox.input-datalist")[0]!.props!.value).toBe(vino.data.id);
  });
});

describe("diseñador", () => {
  async function nueva(name: string, columnas = "") {
    const r = await call("POST", "/herr-tablas/nueva", { name, columnas });
    expect(r.status).toBe(201);
    return r.data as { id: string; campos: { clave: string; tipo: string; etiqueta: string }[] } & Record<string, unknown>;
  }

  test("crear en blanco con las columnas escritas como texto", async () => {
    const t = await nueva("Ventas", "Fecha\nCliente\nMonto\n¿Pagado?\nForma de pago: Contado, Crédito");
    expect(t.campos.map((c) => [c.clave, c.tipo])).toEqual([
      ["fecha", "fecha"],
      ["cliente", "texto"],
      ["monto", "dinero"],
      ["pagado", "booleano"],
      ["forma_de_pago", "opcion"],
    ]);
    expect(t.resumenes).toEqual([
      { clave: "total_de_monto", etiqueta: "Total de Monto", formula: "{suma:monto}", unidad: "$", decimales: 2 },
    ]);
    expect(t).toMatchObject({ orden_campo: "fecha", cerrable: false, version_esquema: 1 });

    expect((await call("POST", "/herr-tablas/nueva", { name: " " })).status).toBe(400);
    expect((await nueva("Vacía")).campos).toEqual([]);
  });

  test("agregar, configurar, mover y quitar columnas sin claves ni JSON", async () => {
    const t = await nueva("Pedidos");
    const url = `/herr-tablas/${t.id}/campos`;

    const precio = await call("POST", url, { etiqueta: "Precio", tipo: "auto" });
    expect(precio.data).toMatchObject({ id: t.id, modo: "disenar", campo: "precio", v: "2" });
    expect(String(precio.json.message)).toContain("«Precio»");

    const estado = await call("POST", url, { etiqueta: "Estado", tipo: "opcion" });
    expect(estado.data).toMatchObject({ modo: "campo", campo: "estado" });
    const con_opciones = await call("PATCH", `${url}/estado`, { opciones: "Pendiente\nPagado/Parcial", multiple: false });
    expect(con_opciones.data.modo).toBe("disenar");

    await call("POST", url, { etiqueta: "Cantidad" });
    const importe = await call("POST", url, { etiqueta: "Importe", tipo: "calculado" });
    expect(importe.data.modo).toBe("campo");
    const guiada = await call("PATCH", `${url}/importe`, { operacion: "multiplica", dato_a: "precio", dato_b: "cantidad" });
    expect(guiada.status).toBe(200);
    expect(guiada.data.modo).toBe("disenar");

    let fila = (await call("GET", `/herr-tablas/${t.id}`)).data;
    const por_clave = (clave: string) => fila.campos.find((c: { clave: string }) => c.clave === clave);
    expect(por_clave("estado").opciones).toEqual(["Pendiente", "Pagado/Parcial"]);
    expect(por_clave("cantidad").tipo).toBe("entero");
    expect(por_clave("importe").formula).toBe("{precio} * {cantidad}");

    const reg = await call("POST", "/herr-registros/captura", { tabla_id: t.id, precio: "12.5", cantidad: "4", estado: "Pendiente" });
    expect(reg.data.calculados.importe).toBe("50.00");

    const escrita = await call("PATCH", `${url}/importe`, { operacion: "escrita", formula: "{Precio} × {cantidad} × 2" });
    expect(escrita.status).toBe(200);
    const rota = await call("PATCH", `${url}/importe`, { operacion: "", formula: "{Nada} + 1" });
    expect(rota.status).toBe(400);
    expect(String(rota.json.message)).toBe("«Importe»: «Nada» no existe");

    const en_uso = await call("DELETE", `${url}/precio`);
    expect(en_uso.status).toBe(409);
    expect(String(en_uso.json.message)).toContain("«Importe»");

    await call("PATCH", `${url}/cantidad`, { etiqueta: "Piezas" });
    await call("PATCH", `${url}/precio`, { posicion: "99" });
    await call("PATCH", `${url}/cantidad`, { posicion: "0" });
    const cambio_tipo = await call("PATCH", `${url}/estado`, { tipo: "texto" });
    expect(cambio_tipo.data.modo).toBe("campo");
    expect((await call("DELETE", `${url}/estado`)).status).toBe(200);

    fila = (await call("GET", `/herr-tablas/${t.id}`)).data;
    expect(fila.campos.map((c: { clave: string }) => c.clave)).toEqual(["cantidad", "importe", "precio"]);
    expect(por_clave("cantidad").etiqueta).toBe("Piezas");
    expect(por_clave("importe").formula).toBe("{precio} * {cantidad} * 2");
    expect(fila.version_esquema).toBeGreaterThan(5);

    expect((await call("PATCH", `${url}/nada`, { etiqueta: "X" })).status).toBe(404);
    expect((await call("POST", url, { etiqueta: "X", tipo: "magia" })).status).toBe(400);
  });

  test("totales guiados y valores fijos", async () => {
    const t = await nueva("Abonos", "Fecha\nAbono ($)");
    const base = `/herr-tablas/${t.id}`;
    const meta = await call("POST", `${base}/constantes`, { etiqueta: "Deuda a saldar", valor: "1000", unidad: "$" });
    expect(meta.status).toBe(200);
    expect((await call("PATCH", `${base}/constantes/deuda_a_saldar`, { valor: "2000" })).status).toBe(200);

    expect((await call("POST", `${base}/resumenes`, { tipo: "promedio", campo: "abono" })).status).toBe(200);
    expect((await call("POST", `${base}/resumenes`, { tipo: "registros" })).status).toBe(200);
    const falta = await call("POST", `${base}/resumenes`, { etiqueta: "Falta", formula: "{Deuda a saldar} - {suma:Abono}" });
    expect(falta.status).toBe(200);
    expect((await call("POST", `${base}/resumenes`, { tipo: "suma" })).status).toBe(400);

    await call("POST", "/herr-registros/captura", { tabla_id: t.id, fecha: "2026-09-01", abono: "500" });
    await call("POST", "/herr-registros/captura", { tabla_id: t.id, fecha: "2026-09-02", abono: "300" });
    const resumen = await call("GET", `${base}/resumen`);
    expect(resumen.data.resumenes.map((r: { etiqueta: string; texto: string }) => [r.etiqueta, r.texto])).toEqual([
      ["Total de Abono", "800.00"],
      ["Promedio de Abono", "400.00"],
      ["Registros", "2"],
      ["Falta", "1200.00"],
    ]);

    expect((await call("DELETE", `${base}/constantes/deuda_a_saldar`)).status).toBe(409);
    expect((await call("DELETE", `${base}/resumenes/falta`)).status).toBe(200);
    expect((await call("DELETE", `${base}/constantes/deuda_a_saldar`)).status).toBe(200);
  });

  test("qué se ve de un enlace: una columna o una plantilla por cada parte de la opción", async () => {
    const motos = await nueva("Motos", "Nombre\nPlacas\nColor: Rojo, Negro\nKilometraje (km)");
    const italika = await call("POST", "/herr-registros/captura", {
      tabla_id: motos.id,
      nombre: "Italika 150",
      placas: "JAL-123",
      color: "Rojo",
      kilometraje: "1500",
    });
    const jornadas = await nueva("Jornadas", "Fecha");
    const url = `/herr-tablas/${jornadas.id}/campos`;
    expect((await call("POST", url, { etiqueta: "Moto", tipo: "referencia" })).data.modo).toBe("campo");
    const sin_tabla = await call("PATCH", `${url}/moto/opcion`, { columna_ref_leyenda: "nombre" });
    expect(sin_tabla.status).toBe(409);
    expect((await call("PATCH", `${url}/moto`, { enlace: motos.id })).data.modo).toBe("campo");

    const opcion = `${url}/moto/opcion`;
    const columnas = await call("PATCH", opcion, {
      columna_ref_leyenda: "nombre",
      columna_ref_leyenda_secundaria: "(ninguna)",
      columna_ref_descripcion: "color",
      columna_ref_descripcion_secundaria: "(ninguna)",
    });
    expect(columnas.data).toMatchObject({ modo: "campo", campo: "moto" });
    const plantillas_escritas = await call("PATCH", opcion, {
      plantilla_ref_leyenda: "{Nombre}",
      plantilla_ref_leyenda_secundaria: "Placas {placas}",
      plantilla_ref_descripcion: "{Color}",
      plantilla_ref_descripcion_secundaria: "{KILOMETRAJE} recorridos",
    });
    expect(plantillas_escritas.status).toBe(200);
    const moto = (await call("GET", `/herr-tablas/${jornadas.id}`)).data.campos[1];
    expect(moto).toMatchObject({
      ref_leyenda: "{nombre}",
      ref_leyenda_secundaria: "Placas {placas}",
      ref_descripcion: "{color}",
      ref_descripcion_secundaria: "{kilometraje} recorridos",
    });

    const captura = await pagina(`/pages/herramientas.herr-registro?tabla=${jornadas.id}`);
    expect(nodos(captura, "nox.input-datalist")[0]!.props!.options).toEqual([
      {
        value: italika.data.id,
        label: "Italika 150",
        leyend_secondary: "Placas JAL-123",
        description: "Rojo",
        description_secondary: "1500.00 km recorridos",
      },
    ]);

    await call("PATCH", opcion, { plantilla_ref_leyenda: "{Nombre} ({Color})" });
    await call("POST", "/herr-registros/captura", { tabla_id: jornadas.id, fecha: "2026-03-01", moto: italika.data.id });
    const lista = await pagina(`/pages/herramientas.herr-tabla?id=${jornadas.id}`);
    expect(celdas_de(nodos(lista, "nox.table")[0]!.props!.rows)).toEqual([{ fecha: "2026-03-01", moto: "Italika 150 (Rojo)" }]);

    // Renombrar una columna de la otra tabla no rompe la plantilla: se guarda con la clave.
    await call("PATCH", `/herr-tablas/${motos.id}/campos/placas`, { etiqueta: "Matrícula" });
    const editor = await pagina(`/pages/herramientas.herr-tabla?id=${jornadas.id}&modo=campo&campo=moto`);
    const props = (name: string) =>
      [...nodos(editor, "nox.input-menu"), ...nodos(editor, "nox.input-text")].find((n) => n.props!.name === name)!.props!;
    expect(props("columna_ref_leyenda").value).toBe("(plantilla)");
    expect(props("columna_ref_leyenda").options).toContainEqual({ value: "(plantilla)", label: "La plantilla «{Nombre} ({Color})»" });
    expect(props("columna_ref_descripcion").value).toBe("color");
    expect(props("plantilla_ref_leyenda_secundaria").value).toBe("Placas {Matrícula}");
    const [previa] = nodos(editor, "nox.detail");
    expect(previa!.props!.items).toEqual([
      { label: "Título", value: "Italika 150 (Rojo)", emphasis: true },
      { label: "Junto al título", value: "Placas JAL-123" },
      { label: "Descripción", value: "Rojo" },
      { label: "Segunda descripción", value: "1500.00 km recorridos" },
    ]);

    const desconocidas = await call("PATCH", opcion, { plantilla_ref_descripcion: "{Placa} de {Marca}" });
    expect(desconocidas.status).toBe(400);
    expect(String(desconocidas.json.message)).toBe("«Descripción»: «Placa», «Marca» no son columnas de «Motos»");
    expect((await call("PATCH", opcion, { columna_ref_descripcion: "marca" })).status).toBe(400);
    expect((await call("PATCH", `${url}/fecha/opcion`, { columna_ref_leyenda: "nombre" })).status).toBe(409);

    // Otra tabla: las plantillas nombraban columnas de la de antes.
    const otra = await nueva("Bicis", "Modelo");
    await call("PATCH", `${url}/moto`, { enlace: otra.id });
    expect((await call("GET", `/herr-tablas/${jornadas.id}`)).data.campos[1]).toMatchObject({
      tabla_ref_id: otra.id,
      ref_leyenda: null,
      ref_leyenda_secundaria: null,
      ref_descripcion: null,
      ref_descripcion_secundaria: null,
    });
  });

  test("imprimir: todos, los de una búsqueda o solo los marcados, en PDF o PNG con columnas y total", async () => {
    const t = await nueva("Bitácora", "Producto\nCantidad");
    const url = `/herr-tablas/${t.id}`;
    const capturados = [];
    for (const [producto, cantidad] of [["Vino tinto", "35"], ["Mezcal", "12"], ["Vino blanco", "7"]]) {
      capturados.push((await call("POST", "/herr-registros/captura", { tabla_id: t.id, producto, cantidad })).data);
    }
    const ver = await pagina(`/pages/herramientas.herr-tabla?id=${t.id}`);
    expect(nodos(ver, "nox.button").some((b) => b.props!.href === `/internal/herr-tabla?id=${t.id}&modo=imprimir`)).toBe(true);

    const elegir = await pagina(`/pages/herramientas.herr-tabla?id=${t.id}&modo=imprimir`);
    const [form] = nodos(elegir, "nox.form");
    expect(form!.props).toMatchObject({ method: "POST", action: `api://herr-tablas/${t.id}/imprimir` });
    const casillas = nodos(elegir, "nox.input-checkbox");
    expect(casillas.map((c) => c.props!.label).sort()).toEqual(["Mezcal · 12", "Vino blanco · 7", "Vino tinto · 35"]);
    const con_q = await pagina(`/pages/herramientas.herr-tabla?id=${t.id}&modo=imprimir&q=vino`);
    expect(nodos(con_q, "nox.input-checkbox")).toHaveLength(2);

    const impreso = async (body: Record<string, unknown>) => {
      const r = await call("POST", `${url}/imprimir`, body);
      expect(r.status).toBe(200);
      expect(r.data.id).toBe(t.id);
      return pagina(`/pages/herramientas.herr-tabla?id=${t.id}&modo=impreso&t=${r.data.t}`);
    };
    const resumen = (doc: NoxPageDescriptor) => String(nodos(doc, "nox.markdown-view")[0]!.props!.content);
    const enlaces = (doc: NoxPageDescriptor) => String(nodos(doc, "nox.html")[0]!.props!.html);

    const todos = await impreso({ formato: "pdf", q: "" });
    expect(resumen(todos)).toStartWith("**3 registros** · 1 hoja");
    const html = enlaces(todos);
    expect(html).toContain(`download="Bitacora `);
    const pdf = Buffer.from(/data:application\/pdf;base64,([^"]+)"/.exec(html)![1]!, "base64");
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");

    const busqueda = await impreso({ formato: "pdf", q: "vino" });
    expect(resumen(busqueda)).toStartWith("**2 registros**");

    const marcados = await impreso({ formato: "png", q: "", [`r_${capturados[1].id}`]: true, [`r_${capturados[0].id}`]: false });
    expect(resumen(marcados)).toStartWith("**1 registro** · 1 hoja");
    expect(enlaces(marcados)).toContain("data:image/png;base64,");
    expect(nodos(marcados, "nox.image-viewer")[0]!.props!.images).toHaveLength(1);

    expect(nombre_archivo("Bitácoras Cava: año/2026", "pdf", "2026-10-01")).toBe("Bitacoras Cava ano 2026 2026-10-01.pdf");
    expect(nombre_archivo("😀", "png", "2026-10-01")).toBe("Tabla 2026-10-01.png");

    const vencido = await pagina(`/pages/herramientas.herr-tabla?id=${t.id}&modo=impreso&t=no-existe`);
    expect(nodos(vencido, "nox.empty")[0]!.props!.text).toBe("Esta impresión ya no está");
    expect((await call("POST", `${url}/imprimir`, { formato: "docx" })).status).toBe(400);
  });

  test("un enlace de la tabla enlazada se lee por su título, y dos tablas que se enlazan entre sí no se persiguen", async () => {
    const personas = await nueva("Personas", "Nombre");
    const motos = await nueva("Motos", "Nombre");
    const enlazar = async (tabla: string, etiqueta: string, clave: string, destino: string, titulo: string) => {
      await call("POST", `/herr-tablas/${tabla}/campos`, { etiqueta, tipo: "referencia" });
      await call("PATCH", `/herr-tablas/${tabla}/campos/${clave}`, { enlace: destino });
      return call("PATCH", `/herr-tablas/${tabla}/campos/${clave}/opcion`, { plantilla_ref_leyenda: titulo });
    };
    expect((await enlazar(personas.id, "Moto favorita", "moto_favorita", motos.id, "{Nombre}")).status).toBe(200);
    expect((await enlazar(motos.id, "Dueño", "dueno", personas.id, "{Nombre} ({Moto favorita})")).status).toBe(200);
    const moto_favorita = { plantilla_ref_leyenda: "{Nombre} de {Dueño}" };
    expect((await call("PATCH", `/herr-tablas/${personas.id}/campos/moto_favorita/opcion`, moto_favorita)).status).toBe(200);
    const ana = await call("POST", "/herr-registros/captura", { tabla_id: personas.id, nombre: "Ana" });
    const italika = await call("POST", "/herr-registros/captura", { tabla_id: motos.id, nombre: "Italika", dueno: ana.data.id });
    await call("POST", "/herr-registros/captura", { tabla_id: personas.id, id: ana.data.id, nombre: "Ana", moto_favorita: italika.data.id });

    const captura = await pagina(`/pages/herramientas.herr-registro?tabla=${personas.id}`);
    expect(nodos(captura, "nox.input-datalist")[0]!.props!.options).toEqual([
      { value: italika.data.id, label: "Italika de Ana (—)" },
    ]);
  });
});

/**
 * Lo que el lanzador sí pinta (`public-landing-node.component.html`). La
 * validación del kit acepta todo su catálogo; un nodo fuera de esta lista sale
 * en pantalla como una etiqueta gris sin que nada falle.
 */
const RENDERIZABLES = new Set([
  "nox.page", "nox.stack", "nox.link", "nox.image-viewer", "nox.carousel", "nox.stats", "nox.collapsible",
  "nox.card", "nox.form", "nox.markdown-view", "nox.html", "nox.button", "nox.alert", "nox.empty",
  "nox.catalog-grid", "nox.search", "nox.tabs", "nox.filters", "nox.split", "nox.paginator", "nox.detail",
  "nox.timeline", "nox.status-progress", "nox.toolbar", "nox.table", "nox.badge", "nox.tag",
]);

/** Hojas `kind: page` de Herramientas que el lanzador conoce (`launcher-leaf.ts`). */
const HOJAS = new Set(["herr-tabla", "herr-registro"]);

function problemas_de_render(nodo: NoxUiNode, padre = ""): string[] {
  const p = nodo.props ?? {};
  const out: string[] = [];
  if (nodo.component.startsWith("nox.input-")) {
    if (padre !== "nox.form") out.push(`${nodo.component} fuera de un nox.form`);
  } else if (!RENDERIZABLES.has(nodo.component)) out.push(`${nodo.component} no lo pinta el lanzador`);
  const action = typeof p.action === "string" ? p.action : "";
  if (action && !/^api:\/\/herr-/.test(action)) out.push(`action no relativa: ${action}`);
  const href = typeof p.href === "string" ? p.href : "";
  if (href && !HOJAS.has(href.replace(/^\/internal\//, "").split("?")[0]!)) out.push(`href sin hoja: ${href}`);
  const then = typeof p.then === "string" ? p.then : "";
  if (then && !["herramientas.herr-tabla", "herramientas.herr-registro"].includes(then.split("?")[0]!)) {
    out.push(`then sin hoja: ${then}`);
  }
  for (const item of (Array.isArray(p.items) ? p.items : []) as Record<string, unknown>[]) {
    const h = typeof item.href === "string" ? item.href : "";
    if (h && !HOJAS.has(h.replace(/^\/internal\//, "").split("?")[0]!)) out.push(`href sin hoja: ${h}`);
  }
  for (const hijo of nodo.children ?? []) out.push(...problemas_de_render(hijo, nodo.component));
  return out;
}

describe("páginas del diseñador", () => {
  test("todas las pantallas usan solo nodos que el lanzador pinta y rutas relativas", async () => {
    const otra = await tabla_de_plantilla("clientes");
    const t = (await call("POST", "/herr-tablas/nueva", { name: "Todo", columnas: "Fecha\nMonto" })).data;
    const url = `/herr-tablas/${t.id}/campos`;
    for (const tipo of ["texto", "numero", "entero", "booleano", "hora", "fecha_hora", "opcion", "foto", "nota", "ruta", "nivel", "geo", "calculado", "referencia"]) {
      expect((await call("POST", url, { etiqueta: `Col ${tipo}`, tipo })).status).toBe(200);
    }
    await call("PATCH", `${url}/col_referencia`, { enlace: otra.id });
    await call("PATCH", `${url}/col_referencia/opcion`, { columna_ref_leyenda: "nombre" });
    await call("PATCH", `${url}/col_calculado`, { formula: "{Monto} * 2" });
    await call("POST", `/herr-tablas/${t.id}/constantes`, { etiqueta: "Meta", valor: "10" });
    await call("POST", "/herr-registros/captura", { tabla_id: t.id, fecha: "2026-09-01", monto: "5" });
    const fila = (await call("GET", `/herr-tablas/${t.id}`)).data;

    const rutas = [
      "/pages/herramientas.herr-tabla",
      `/pages/herramientas.herr-tabla?id=${t.id}`,
      `/pages/herramientas.herr-tabla?id=${t.id}&modo=disenar&nuevo=1`,
      ...["columnas", "totales", "fijos", "ajustes"].map((s) => `/pages/herramientas.herr-tabla?id=${t.id}&modo=disenar&seccion=${s}`),
      ...fila.campos.map((c: { clave: string }) => `/pages/herramientas.herr-tabla?id=${t.id}&modo=campo&campo=${c.clave}`),
      `/pages/herramientas.herr-tabla?id=${t.id}&modo=campo&campo=no_existe`,
      `/pages/herramientas.herr-tabla?id=${(await call("POST", "/herr-tablas/nueva", { name: "Sin columnas" })).data.id}`,
      "/pages/herramientas.herr-registro",
      `/pages/herramientas.herr-tabla?id=${t.id}&modo=imprimir`,
      `/pages/herramientas.herr-tabla?id=${t.id}&modo=imprimir&q=nada-coincide`,
      ...(await Promise.all(
        ["pdf", "png"].map(async (formato) => {
          const r = await call("POST", `/herr-tablas/${t.id}/imprimir`, { formato });
          return `/pages/herramientas.herr-tabla?id=${t.id}&modo=impreso&t=${r.data.t}`;
        }),
      )),
      `/pages/herramientas.herr-tabla?id=${t.id}&modo=impreso&t=vencido`,
    ];
    for (const ruta of rutas) {
      const doc = await pagina(ruta);
      expect([ruta, problemas_de_render(doc.page)]).toEqual([ruta, []]);
    }

    const calculo = await pagina(`/pages/herramientas.herr-tabla?id=${t.id}&modo=campo&campo=col_calculado`);
    const [previa] = nodos(calculo, "nox.detail");
    expect(previa!.props!.items).toEqual([{ label: "Con el último registro da", value: "10.00", emphasis: true }]);
    const formula = nodos(calculo, "nox.input-text").find((n) => n.props!.name === "formula")!;
    expect(formula.props!.value).toBe("{Monto} * 2");

    const disenar = await pagina(`/pages/herramientas.herr-tabla?id=${t.id}&modo=disenar`);
    const visibles = nodos(disenar, "nox.detail").flatMap((d) => [
      d.props!.text,
      ...(d.props!.items as { label: string; value: string }[]).flatMap((i) => [i.label, i.value]),
    ]);
    expect(visibles).toContain("Clientes › Nombre");
    expect(visibles.filter((v) => /col_|\{[a-z_]+\}/.test(String(v)))).toEqual([]);
  });
});
