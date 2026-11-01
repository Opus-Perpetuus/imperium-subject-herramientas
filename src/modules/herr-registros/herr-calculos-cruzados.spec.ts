import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  MemoryNoxServices,
  create_kirlet_test_context,
  define_subject,
  validate_page_descriptor_renderable,
  walk_ui_tree,
  type NoxPageDescriptor,
  type NoxUiNode,
} from "@opus-perpetuus/imperium-core-kit";
import { herr_cierres_module } from "../herr-cierres/herr-cierres.routes.ts";
import { herr_tablas_module } from "../herr-tablas/herr-tablas.routes.ts";
import { herr_registros_module } from "./herr-registros.routes.ts";

const SUBJECT = define_subject({
  id: "SUBJECT-herramientas",
  name: "Herramientas",
  compat: { nox: ">=0.5.0", kit: "^0.5.0" },
  storage_files: true,
  modules: [herr_tablas_module, herr_registros_module, herr_cierres_module],
});

let server: ReturnType<typeof create_kirlet_test_context>;
beforeEach(() => {
  server = create_kirlet_test_context(SUBJECT, { nox: new MemoryNoxServices() });
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

async function pagina(path: string): Promise<NoxPageDescriptor> {
  const res = await server.fetch(new Request(`http://t${path}`));
  expect(res.status).toBe(200);
  const doc = (await res.json()) as NoxPageDescriptor;
  const ok = validate_page_descriptor_renderable(doc);
  const problemas = ok.ok ? [] : ok.issues.filter((i) => i.component !== "nox.timeline");
  if (problemas.length) throw new Error(JSON.stringify(problemas));
  return doc;
}

function nodos(page: NoxPageDescriptor, component: string): NoxUiNode[] {
  const out: NoxUiNode[] = [];
  walk_ui_tree(page.page, (n) => {
    if (n.component === component) out.push(n);
  });
  return out;
}

const filas_de = (doc: NoxPageDescriptor) => nodos(doc, "nox.table")[0]!.props!.rows as Record<string, unknown>[];

async function tabla(name: string, campos: unknown[]): Promise<string> {
  const r = await call("POST", "/herr-tablas", { name, cerrable: false, campos });
  expect(r.status).toBe(201);
  return r.data.id;
}

async function capturar(body: Record<string, unknown>) {
  const r = await call("POST", "/herr-registros/captura", body);
  expect(r.status).toBeLessThan(300);
  return r.data;
}

type Fila = Record<string, string>;

describe("unidad tomada de otra columna", () => {
  test("un entero o decimal enseña la unidad que dice la columna de texto de su fila", async () => {
    const t = await tabla("Inventario", [
      { clave: "nombre", etiqueta: "Nombre", tipo: "texto", en_resumen: true },
      { clave: "unidad", etiqueta: "Unidad", tipo: "texto" },
      { clave: "existencia", etiqueta: "Existencia", tipo: "numero", decimales: 1, unidad: "u", en_resumen: true },
      { clave: "minimo", etiqueta: "Mínimo", tipo: "entero", en_resumen: true },
    ]);
    const editor = await pagina(`/pages/herramientas.herr-tabla?id=${t}&modo=campo&campo=existencia`);
    const fuente = nodos(editor, "nox.input-menu").find((m) => m.props!.name === "unidad_fuente")!;
    expect(fuente.props!.options).toContainEqual({ value: "columna:unidad", label: "La que diga la columna «Unidad» de esta tabla" });
    expect((await call("PATCH", `/herr-tablas/${t}/campos/existencia`, { unidad_fuente: "columna:unidad" })).status).toBe(200);
    expect((await call("PATCH", `/herr-tablas/${t}/campos/minimo`, { unidad_fuente: "columna:unidad" })).status).toBe(200);
    // Ni de sí misma ni de una columna de números.
    expect((await call("PATCH", `/herr-tablas/${t}/campos/minimo`, { unidad_fuente: "columna:existencia" })).status).toBe(400);
    const spec = (await call("GET", `/herr-tablas/${t}`)).data;
    expect(spec.campos.find((c: { clave: string }) => c.clave === "existencia")).toMatchObject({ unidad_columna: "unidad" });
    const editado = await pagina(`/pages/herramientas.herr-tabla?id=${t}&modo=campo&campo=existencia`);
    expect(nodos(editado, "nox.input-menu").find((m) => m.props!.name === "unidad_fuente")!.props!.value).toBe("columna:unidad");

    const harina = await capturar({ tabla_id: t, nombre: "Harina", unidad: "kg", existencia: 20, minimo: 5 });
    await capturar({ tabla_id: t, nombre: "Tornillo", existencia: 300, minimo: 50 });
    const lista = await pagina(`/pages/herramientas.herr-tabla?id=${t}`);
    expect(filas_de(lista).map((f) => `${f.nombre}: ${f.existencia} / ${f.minimo}`)).toContainAllValues([
      "Harina: 20.0 kg / 5 kg",
      "Tornillo: 300.0 u / 50",
    ]);
    // Al editar, la etiqueta no promete una unidad fija.
    const form = await pagina(`/pages/herramientas.herr-registro?tabla=${t}&id=${harina.id}`);
    expect(nodos(form, "nox.input-number").map((n) => n.props?.label)).toContain("Existencia");

    // La columna de la que sale la unidad no se quita mientras alguien la use.
    const quitar = await call("DELETE", `/herr-tablas/${t}/campos/unidad`);
    expect(quitar.status).toBe(409);
    expect(JSON.stringify(quitar.json)).toContain("Existencia");
    // Volver a unidad fija la suelta.
    expect((await call("PATCH", `/herr-tablas/${t}/campos/existencia`, { unidad_fuente: "fija" })).status).toBe(200);
    expect((await call("PATCH", `/herr-tablas/${t}/campos/minimo`, { unidad_fuente: "fija" })).status).toBe(200);
    expect((await call("DELETE", `/herr-tablas/${t}/campos/unidad`)).status).toBe(200);
  });

  test("en una subtabla la unidad sale de otra columna de la misma fila", async () => {
    const t = await tabla("Receta", [
      { clave: "nombre", etiqueta: "Nombre", tipo: "texto", en_resumen: true },
      {
        clave: "ingredientes", etiqueta: "Ingredientes", tipo: "subtabla", en_resumen: true,
        columnas: [
          { clave: "insumo", etiqueta: "Insumo", tipo: "texto" },
          { clave: "medida", etiqueta: "Medida", tipo: "texto" },
          { clave: "cantidad", etiqueta: "Cantidad", tipo: "numero", decimales: 1 },
        ],
      },
    ]);
    expect((await call("PATCH", `/herr-tablas/${t}/campos/ingredientes.cantidad`, { unidad_fuente: "columna:medida" })).status).toBe(200);
    expect((await call("PATCH", `/herr-tablas/${t}/campos/ingredientes.cantidad`, { unidad_fuente: "columna:no_existe" })).status).toBe(400);
    await capturar({
      tabla_id: t,
      nombre: "Pan",
      ingredientes: [
        { insumo: "Harina", medida: "kg", cantidad: 1 },
        { insumo: "Agua", medida: "L", cantidad: 0.6 },
      ],
    });
    const lista = JSON.stringify(filas_de(await pagina(`/pages/herramientas.herr-tabla?id=${t}`)));
    expect(lista).toContain("1.0 kg");
    expect(lista).toContain("0.6 L");
    expect((await call("DELETE", `/herr-tablas/${t}/campos/ingredientes.medida`)).status).toBe(409);
  });
});

describe("entero sin fórmula", () => {
  test("un entero que se llenaba solo (0.17.2) pasa a capturarse y conserva su valor", async () => {
    const t = await tabla("Pedidos", [
      { clave: "folio", etiqueta: "Folio", tipo: "texto", en_resumen: true },
      { clave: "piezas", etiqueta: "Piezas", tipo: "entero", en_resumen: true },
    ]);
    const r = await capturar({ tabla_id: t, folio: "P-1" });
    // Así quedó en 0.17.2: la fórmula en el entero y su valor en `calculados`.
    const fila = await server.data.findOne("herr_tablas", { id: t });
    const campos = (fila!.campos as Record<string, unknown>[]).map((c) => (c.clave === "piezas" ? { ...c, formula: "2 + 5" } : c));
    await server.data.update("herr_tablas", { id: t }, { campos });
    await server.data.update("herr_registros", { id: r.id }, { valores: { folio: "P-1" }, calculados: { piezas: "7" } });

    // El editor del entero ya no ofrece fórmula, y un registro nuevo no se llena solo.
    const editor = await pagina(`/pages/herramientas.herr-tabla?id=${t}&modo=campo&campo=piezas`);
    expect(nodos(editor, "nox.input-text").some((n) => n.props?.name === "formula")).toBe(false);
    expect((await capturar({ tabla_id: t, folio: "P-2" })).valores.piezas ?? "").toBe("");
    const form = await pagina(`/pages/herramientas.herr-registro?tabla=${t}&id=${r.id}`);
    expect(nodos(form, "nox.input-number").map((n) => n.props?.name)).toContain("piezas");
    // Se edita otra cosa: el 7 no se pierde y ya vive en lo capturado.
    const editado = await call("PATCH", `/herr-registros/${r.id}`, { valores: { folio: "P-1b" } });
    expect(editado.status).toBe(200);
    expect(editado.data.valores).toMatchObject({ folio: "P-1b", piezas: "7" });
    expect(editado.data.calculados.piezas).toBeUndefined();
    // Y se cambia a mano como cualquier entero.
    const a_mano = await call("PATCH", `/herr-registros/${r.id}`, { valores: { folio: "P-1b", piezas: "9" } });
    expect(a_mano.data.valores.piezas).toBe("9");
    const lista = await pagina(`/pages/herramientas.herr-tabla?id=${t}`);
    expect(filas_de(lista).map((f) => f.piezas)).toContainAllValues(["9", ""]);
  });
});

describe("cálculos que usan otros cálculos", () => {
  test("una columna de la subtabla usa un cálculo del registro que a su vez suma la subtabla", async () => {
    const t = await tabla("Ventas", [
      { clave: "folio", etiqueta: "Folio", tipo: "texto", en_resumen: true },
      { clave: "descuento", etiqueta: "Descuento", tipo: "numero" },
      {
        clave: "partidas", etiqueta: "Partidas", tipo: "subtabla",
        columnas: [
          { clave: "cantidad", etiqueta: "Cantidad", tipo: "entero" },
          { clave: "precio", etiqueta: "Precio", tipo: "dinero" },
          { clave: "importe", etiqueta: "Importe", tipo: "calculado", formula: "{cantidad} * {precio}", decimales: 2 },
        ],
      },
      { clave: "total", etiqueta: "Total", tipo: "calculado", formula: "{partidas.importe}", decimales: 2 },
      { clave: "neto", etiqueta: "Neto", tipo: "calculado", formula: "{total} - {descuento}", decimales: 2 },
    ]);
    // La parte de cada fila en el total: la columna lee un cálculo del registro, por su nombre visible.
    const col = await call("POST", `/herr-tablas/${t}/campos`, { subtabla: "partidas", etiqueta: "Parte", tipo: "calculado" });
    expect(col.status).toBe(200);
    let spec = (await call("GET", `/herr-tablas/${t}`)).data;
    const parte = spec.campos.find((c: { clave: string }) => c.clave === "partidas").columnas.find((c: { etiqueta: string }) => c.etiqueta === "Parte");
    const f = await call("PATCH", `/herr-tablas/${t}/campos/partidas.${parte.clave}`, { formula: "{Importe} / {Total} * 100", decimales: 1 });
    expect(f.status).toBe(200);
    // Y otra lee el neto, que lee el total, que suma la subtabla.
    expect((await call("POST", `/herr-tablas/${t}/campos`, { subtabla: "partidas", etiqueta: "Neto de la fila", tipo: "calculado" })).status).toBe(200);
    spec = (await call("GET", `/herr-tablas/${t}`)).data;
    const neto_fila = spec.campos.find((c: { clave: string }) => c.clave === "partidas").columnas.find((c: { etiqueta: string }) => c.etiqueta === "Neto de la fila");
    expect((await call("PATCH", `/herr-tablas/${t}/campos/partidas.${neto_fila.clave}`, { formula: "{Importe} * {actual:Neto} / {Total}" })).status).toBe(200);
    // El total del registro ahora suma una columna que depende del total: ciclo, con un mensaje claro.
    const ciclo = await call("PATCH", `/herr-tablas/${t}/campos/total`, { formula: `{Partidas.Parte}` });
    expect(ciclo.status).toBe(400);
    expect(JSON.stringify(ciclo.json)).toContain("Ciclo de cálculo: Ventas.Partidas › Parte → Ventas.Total → Ventas.Partidas › Parte. Quita una de esas referencias.");

    const r = await capturar({
      tabla_id: t,
      folio: "V-1",
      descuento: 10,
      partidas: [
        { cantidad: 2, precio: 15 },
        { cantidad: 1, precio: 70 },
      ],
    });
    expect(r.calculados).toMatchObject({ total: "100.00", neto: "90.00" });
    const filas = JSON.parse(r.valores.partidas) as Fila[];
    expect(filas.map((x) => x[parte.clave])).toEqual(["30.0", "70.0"]);
    expect(filas.map((x) => x[neto_fila.clave])).toEqual(["27.00", "63.00"]);
    // Se recalcula al cambiar lo que lee: otro descuento cambia el neto de cada fila.
    const otro = await capturar({ tabla_id: t, id: r.id, folio: "V-1", descuento: 50, partidas: JSON.parse(r.valores.partidas) });
    expect((JSON.parse(otro.valores.partidas) as Fila[]).map((x) => x[neto_fila.clave])).toEqual(["15.00", "35.00"]);
  });

  test("de la tabla padre a las hijas y las subtablas de las hijas, y de vuelta", async () => {
    const clientes = await tabla("Clientes", [
      { clave: "nombre", etiqueta: "Nombre", tipo: "texto", en_resumen: true },
      { clave: "credito", etiqueta: "Crédito", tipo: "dinero" },
      { clave: "limite", etiqueta: "Límite", tipo: "calculado", formula: "{credito} * 2", decimales: 2, en_resumen: true },
      { clave: "comprado", etiqueta: "Comprado", tipo: "calculado", formula: "0", decimales: 2, en_resumen: true },
      { clave: "piezas", etiqueta: "Piezas", tipo: "calculado", formula: "0", decimales: 0, en_resumen: true },
      { clave: "disponible", etiqueta: "Disponible", tipo: "calculado", formula: "{limite} - {comprado}", decimales: 2, en_resumen: true },
    ]);
    const pedidos = await tabla("Pedidos", [
      { clave: "folio", etiqueta: "Folio", tipo: "texto", en_resumen: true },
      { clave: "cliente", etiqueta: "Cliente", tipo: "referencia", tabla_ref_id: clientes, ref_leyenda: "{nombre}" },
      {
        clave: "partidas", etiqueta: "Partidas", tipo: "subtabla",
        columnas: [
          { clave: "tipo", etiqueta: "Tipo", tipo: "texto" },
          { clave: "cantidad", etiqueta: "Cantidad", tipo: "entero" },
          { clave: "precio", etiqueta: "Precio", tipo: "dinero" },
          { clave: "importe", etiqueta: "Importe", tipo: "calculado", formula: "{cantidad} * {precio}", decimales: 2 },
          // Una columna de la hija lee un cálculo del padre por el enlace del registro.
          { clave: "del_limite", etiqueta: "% del límite", tipo: "calculado", formula: "{importe} / {cliente.limite} * 100", decimales: 1 },
        ],
      },
      { clave: "total", etiqueta: "Total", tipo: "calculado", formula: "{partidas.importe}", decimales: 2 },
      { clave: "limite_cliente", etiqueta: "Límite del cliente", tipo: "calculado", formula: "{cliente.limite}", decimales: 2, en_resumen: true },
    ]);
    // El constructor ofrece la subtabla de la hija y el enlace que apunta al padre.
    const editor = await pagina(`/pages/herramientas.herr-tabla?id=${clientes}&modo=campo&campo=comprado`);
    const menus = nodos(editor, "nox.input-menu");
    const opciones = (name: string) => (menus.find((m) => m.props?.name === name)!.props!.options as { value: string; label: string }[]);
    expect(opciones("ext_tabla")).toContainEqual({ value: `hija:${pedidos}:partidas`, label: "Pedidos › subtabla Partidas (las filas de sus registros)" });
    expect(opciones("ext_columna")).toContainEqual({ value: `hija:${pedidos}:partidas|importe`, label: "Pedidos › Partidas › Importe" });
    expect(opciones("ext_enlace")).toContainEqual({ value: `${pedidos}|cliente`, label: "Pedidos › Cliente" });
    // Lo comprado: la suma del importe (un cálculo) de las partidas de sus pedidos.
    const comprado = await call("PATCH", `/herr-tablas/${clientes}/campos/comprado`, {
      formula: "", ext_que: "suma", ext_tabla: `hija:${pedidos}:partidas`, ext_columna: `hija:${pedidos}:partidas|importe`,
      ext_enlace: `${pedidos}|cliente`,
    });
    expect(comprado.status).toBe(200);
    // Las piezas de tipo X, contando filas de las subtablas de sus pedidos.
    const piezas = await call("PATCH", `/herr-tablas/${clientes}/campos/piezas`, {
      formula: "", ext_que: "cuenta", ext_tabla: `hija:${pedidos}:partidas`,
      ext_c1_columna: `hija:${pedidos}:partidas|tipo`, ext_c1_valor: "X", ext_enlace: `${pedidos}|cliente`,
    });
    expect(piezas.status).toBe(200);
    const spec = (await call("GET", `/herr-tablas/${clientes}`)).data;
    const por = (k: string) => spec.campos.find((c: { clave: string }) => c.clave === k);
    expect(por("comprado").formula).toBe(`tabla_suma("${pedidos}", sub_suma("partidas", {importe}), {cliente} == {actual:_id})`);
    expect(por("piezas").formula).toBe(`tabla_suma("${pedidos}", sub_cuenta("partidas", {tipo} == "X"), {cliente} == {actual:_id})`);
    // El diseñador lo enseña con nombres.
    const visto = await pagina(`/pages/herramientas.herr-tabla?id=${clientes}&modo=campo&campo=comprado`);
    expect(nodos(visto, "nox.input-code-editor").find((n) => n.props?.name === "formula")!.props!.value).toBe(
      'tabla_suma("Pedidos", sub_suma("Partidas", {Importe}), {Cliente} == {actual:_id})',
    );

    const ana = await capturar({ tabla_id: clientes, nombre: "Ana", credito: 500 });
    const beto = await capturar({ tabla_id: clientes, nombre: "Beto", credito: 100 });
    const p1 = await capturar({
      tabla_id: pedidos, folio: "P-1", cliente: ana.id,
      partidas: [{ tipo: "X", cantidad: 2, precio: 50 }, { tipo: "Y", cantidad: 1, precio: 100 }],
    });
    await capturar({ tabla_id: pedidos, folio: "P-2", cliente: ana.id, partidas: [{ tipo: "X", cantidad: 3, precio: 100 }] });
    await capturar({ tabla_id: pedidos, folio: "P-3", cliente: beto.id, partidas: [{ tipo: "X", cantidad: 1, precio: 20 }] });
    // La hija ve el cálculo del padre, en el registro y en cada fila de su subtabla.
    expect(p1.calculados).toMatchObject({ total: "200.00", limite_cliente: "1000.00" });
    expect((JSON.parse(p1.valores.partidas) as Fila[]).map((x) => x.del_limite)).toEqual(["10.0", "10.0"]);

    // El padre suma los cálculos de las subtablas de sus hijas y otro cálculo usa esa suma.
    const lista = filas_de(await pagina(`/pages/herramientas.herr-tabla?id=${clientes}`));
    const de = (n: string) => lista.find((f) => f.nombre === n)!;
    expect(de("Ana")).toMatchObject({ comprado: "500.00", piezas: "2", disponible: "500.00" });
    expect(de("Beto")).toMatchObject({ comprado: "20.00", piezas: "1", disponible: "180.00" });

    // Cambia lo que lee y la siguiente vista ya lo trae.
    await capturar({ tabla_id: clientes, id: ana.id, nombre: "Ana", credito: 1000 });
    const otra = filas_de(await pagina(`/pages/herramientas.herr-tabla?id=${clientes}`));
    expect(otra.find((f) => f.nombre === "Ana")!.disponible).toBe("1500.00");
    const hijos = filas_de(await pagina(`/pages/herramientas.herr-tabla?id=${pedidos}`));
    expect(hijos.find((f) => f.folio === "P-1")!.limite_cliente).toBe("2000.00");

    // Un ciclo entre tablas (el padre suma un importe que lee lo comprado por el padre) se rechaza.
    const ciclo = await call("PATCH", `/herr-tablas/${pedidos}/campos/partidas.importe`, { formula: "{Cantidad} * {Precio} + {Cliente.Comprado}" });
    expect(ciclo.status).toBe(400);
    expect(JSON.stringify(ciclo.json)).toContain("Ciclo de cálculo");
  });

  test("un cálculo lee los calculados de las demás filas de su tabla ya recalculados", async () => {
    const t = await tabla("Ventas", [
      { clave: "folio", etiqueta: "Folio", tipo: "texto", en_resumen: true },
      { clave: "cantidad", etiqueta: "Cantidad", tipo: "entero" },
      { clave: "precio", etiqueta: "Precio", tipo: "dinero" },
      { clave: "importe", etiqueta: "Importe", tipo: "calculado", formula: "{cantidad} * {precio}", decimales: 2 },
      { clave: "parte", etiqueta: "Parte", tipo: "calculado", formula: "{importe} / {suma:importe} * 100", decimales: 1, en_resumen: true },
    ]);
    await capturar({ tabla_id: t, folio: "A", cantidad: 1, precio: 25 });
    await capturar({ tabla_id: t, folio: "B", cantidad: 3, precio: 25 });
    const lista = filas_de(await pagina(`/pages/herramientas.herr-tabla?id=${t}`));
    expect(lista.map((f) => `${f.folio}: ${f.parte}`)).toContainAllValues(["A: 25.0", "B: 75.0"]);
  });
});
