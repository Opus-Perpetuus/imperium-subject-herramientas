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
import { herr_cierres_module } from "../herr-cierres/herr-cierres.routes.ts";
import { herr_registros_module } from "../herr-registros/herr-registros.routes.ts";
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
    expect(lista.data.map((p: { id: string }) => p.id)).toEqual(["jornada_moto", "gastos", "deudas"]);
    expect(lista.data[0].nombre).toBe("Jornada en moto");

    const tabla = await tabla_de_plantilla("jornada_moto", "Mi moto");
    expect(tabla.name).toBe("Mi moto");
    expect(tabla.plantilla_id).toBe("jornada_moto");
    expect(tabla.version_esquema).toBe(1);
    expect((tabla.campos as unknown[]).length).toBe(19);

    const inexistente = await call("POST", "/herr-tablas/desde-plantilla", { plantilla_id: "nada" });
    expect(inexistente.status).toBe(404);
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
    await call("POST", "/herr-registros", { tabla_id: tabla.id, valores: { fecha: "2026-01-02", acreedor: "Banco", pagado: "3000" } });

    const doc = await pagina(`/pages/herramientas.herr-tabla?id=${tabla.id}`);
    expect(doc.title).toBe("Deudas");
    expect(componentes(doc)).toEqual(expect.arrayContaining(["nox.stats", "nox.table", "nox.link", "nox.button"]));
    const [stats] = nodos(doc, "nox.stats");
    expect(stats!.props!.items).toEqual([
      { id: "abonado", label: "Abonado", value: "3000.00 $" },
      { id: "restante", label: "Restante", value: "2000.00 $" },
      { id: "avance", label: "Avance", value: "60.0 %" },
    ]);
    const [table] = nodos(doc, "nox.table");
    expect((table!.props!.columns as { key: string }[]).map((c) => c.key)).toEqual(["fecha", "acreedor", "pagado"]);
    expect(table!.props!.rows).toEqual([{ fecha: "2026-01-02", acreedor: "Banco", pagado: "3000.00 $" }]);
    const [link] = nodos(doc, "nox.link");
    expect(link!.props!.href).toBe(`/internal/herr-registro?tabla=${tabla.id}`);
    const [button] = nodos(doc, "nox.button");
    expect(button!.props).toMatchObject({ method: "POST", action: `api://herr-tablas/${tabla.id}/cerrar` });
    expect(String(button!.props!.confirm)).not.toBe("");

    const sin_id = await pagina("/pages/herramientas.herr-tabla");
    expect(nodos(sin_id, "nox.link").map((l) => l.props!.href)).toEqual([`/internal/herr-tabla?id=${tabla.id}`]);
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
    expect(nodos(doc, "nox.table")[0]!.props!.rows).toEqual([{ fecha: "2026-03-01", moto: "Italika 150" }]);

    const por_etiqueta = await call("POST", `/herr-tablas/${jornadas.data.id}/buscar`, { q: "italika" });
    expect(por_etiqueta.data.map((r: { name: string }) => r.name)).toEqual(["2026-03-01"]);

    const form = await pagina(`/pages/herramientas.herr-registro?tabla=${jornadas.data.id}`);
    const moto = nodos(form, "nox.input-datalist")[0]!;
    expect(moto.props!.options).toEqual([{ value: italika.data.id, label: "Italika 150" }]);
  });
});
