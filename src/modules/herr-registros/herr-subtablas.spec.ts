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

describe("subtablas", () => {
  test("se diseñan en el diseñador: subtabla, sus columnas y un cálculo por fila", async () => {
    const ventas = await tabla("Ventas", [{ clave: "folio", etiqueta: "Folio", tipo: "texto" }]);
    const sub = await call("POST", `/herr-tablas/${ventas}/campos`, { etiqueta: "Artículos", tipo: "subtabla" });
    expect(sub.status).toBe(200);
    let spec = (await call("GET", `/herr-tablas/${ventas}`)).data;
    const items = spec.campos.find((c: { tipo: string }) => c.tipo === "subtabla");
    expect(items.columnas.length).toBe(1);
    const mas = await call("POST", `/herr-tablas/${ventas}/campos`, { subtabla: items.clave, etiqueta: "Cantidad, Precio" });
    expect(mas.status).toBe(200);
    // Una foto no cabe en una subtabla.
    expect((await call("POST", `/herr-tablas/${ventas}/campos`, { subtabla: items.clave, etiqueta: "Imagen", tipo: "foto" })).status).toBe(400);
    spec = (await call("GET", `/herr-tablas/${ventas}`)).data;
    const cols = spec.campos.find((c: { clave: string }) => c.clave === items.clave).columnas as { clave: string; etiqueta: string; tipo: string }[];
    expect(cols.map((c) => c.etiqueta)).toEqual(["Descripción", "Cantidad", "Precio"]);
    const precio = cols.find((c) => c.etiqueta === "Precio")!;
    expect((await call("PATCH", `/herr-tablas/${ventas}/campos/${items.clave}.${precio.clave}`, { tipo: "dinero" })).status).toBe(200);
    expect((await call("POST", `/herr-tablas/${ventas}/campos`, { subtabla: items.clave, etiqueta: "Importe", tipo: "calculado" })).status).toBe(200);
    spec = (await call("GET", `/herr-tablas/${ventas}`)).data;
    const importe = spec.campos.find((c: { clave: string }) => c.clave === items.clave).columnas.find((c: { etiqueta: string }) => c.etiqueta === "Importe");
    const formula = await call("PATCH", `/herr-tablas/${ventas}/campos/${items.clave}.${importe.clave}`, { formula: "{Cantidad} * {Precio}" });
    expect(formula.status).toBe(200);
    // Un total del registro con la subtabla, por su nombre visible.
    expect((await call("POST", `/herr-tablas/${ventas}/campos`, { etiqueta: "Total", tipo: "calculado" })).status).toBe(200);
    spec = (await call("GET", `/herr-tablas/${ventas}`)).data;
    const total = spec.campos.find((c: { etiqueta: string }) => c.etiqueta === "Total");
    expect((await call("PATCH", `/herr-tablas/${ventas}/campos/${total.clave}`, { formula: "{Artículos.Importe}" })).status).toBe(200);

    // Las páginas del diseñador se pintan, con la subtabla y una de sus columnas.
    const de_sub = await pagina(`/pages/herramientas.herr-tabla?id=${ventas}&modo=campo&campo=${items.clave}`);
    expect(nodos(de_sub, "nox.form").some((f) => (f.children ?? []).some((n) => n.props?.name === "subtabla"))).toBe(true);
    await pagina(`/pages/herramientas.herr-tabla?id=${ventas}&modo=campo&campo=${items.clave}.${importe.clave}`);
    // El editor del cálculo del registro enseña las subcolumnas y el constructor arma `sub_suma` con ellas.
    const editor_total = await pagina(`/pages/herramientas.herr-tabla?id=${ventas}&modo=campo&campo=${total.clave}`);
    const menus = nodos(editor_total, "nox.input-menu");
    const opciones = (name: string) => (menus.find((m) => m.props?.name === name)!.props!.options as { value: string; label: string }[]).map((o) => o.value);
    expect(opciones("ext_tabla")).toContain(`sub:${items.clave}`);
    expect(opciones("ext_c1_columna")).toContain(`sub:${items.clave}|${precio.clave}`);
    expect(opciones("dato_a")).toContain(`${items.clave}.${precio.clave}`);
    expect(nodos(editor_total, "nox.markdown-view").some((n) => String(n.props?.content).includes("{Artículos.ultima.Cantidad}"))).toBe(true);
    const caros = await call("PATCH", `/herr-tablas/${ventas}/campos/${total.clave}`, {
      ext_que: "suma", ext_tabla: `sub:${items.clave}`, ext_columna: `sub:${items.clave}|${importe.clave}`,
      ext_c1_columna: `sub:${items.clave}|${precio.clave}`, ext_c1_op: ">", ext_c1_valor: "6",
    });
    expect(caros.status).toBe(200);
    spec = (await call("GET", `/herr-tablas/${ventas}`)).data;
    expect(spec.campos.find((c: { clave: string }) => c.clave === total.clave).formula).toBe(`sub_suma("${items.clave}", {${importe.clave}}, {${precio.clave}} > 6)`);
    expect((await call("PATCH", `/herr-tablas/${ventas}/campos/${total.clave}`, { formula: "{Artículos.Importe}" })).status).toBe(200);

    // Capturar: el formulario trae la subtabla y al guardar se calcula fila por fila.
    const form = await pagina(`/pages/herramientas.herr-registro?tabla=${ventas}`);
    const entrada = nodos(form, "nox.input-subtable")[0]!;
    expect((entrada.props!.columns as NoxUiNode[]).map((c) => c.props!.name)).toEqual(cols.map((c) => c.clave).concat(importe.clave));
    expect((entrada.props!.columns as NoxUiNode[]).at(-1)!.props!.computed).toBe(true);
    const [desc, cant] = cols;
    const r = await capturar({
      tabla_id: ventas,
      folio: "V-1",
      [items.clave]: [
        { [desc!.clave]: "Agua", [cant!.clave]: 2, [precio.clave]: 10 },
        { [desc!.clave]: "Pan", [cant!.clave]: 3, [precio.clave]: 5 },
        {},
      ],
    });
    const guardadas = JSON.parse(r.valores[items.clave]) as Fila[];
    expect(guardadas.length).toBe(2);
    expect(guardadas[0]![importe.clave]).toBe("20.00");
    expect(r.calculados[total.clave]).toBe("35.00");
    // Quitar una columna que el total usa no se puede; una que no, sí.
    expect((await call("DELETE", `/herr-tablas/${ventas}/campos/${items.clave}.${importe.clave}`)).status).toBe(409);
    expect((await call("DELETE", `/herr-tablas/${ventas}/campos/${items.clave}.${desc!.clave}`)).status).toBe(200);
  });

  test("un cálculo cuenta filas de la subtabla con condiciones o registros de otra tabla; el entero ya no lleva fórmula", async () => {
    const pagos = await tabla("Pagos", [
      { clave: "pedido", etiqueta: "Pedido", tipo: "texto" },
      { clave: "monto", etiqueta: "Monto", tipo: "dinero" },
    ]);
    const pedidos = await tabla("Pedidos", [
      { clave: "folio", etiqueta: "Folio", tipo: "texto" },
      {
        clave: "partidas", etiqueta: "Partidas", tipo: "subtabla",
        columnas: [
          { clave: "tipo", etiqueta: "Tipo", tipo: "texto" },
          { clave: "cantidad", etiqueta: "Cantidad", tipo: "entero" },
          { clave: "precio", etiqueta: "Precio", tipo: "dinero" },
        ],
      },
      { clave: "piezas_x", etiqueta: "Piezas X", tipo: "calculado", formula: "0", decimales: 0 },
      { clave: "pagos", etiqueta: "Pagos", tipo: "calculado", formula: "0", decimales: 0 },
      { clave: "piezas", etiqueta: "Piezas", tipo: "entero" },
    ]);
    // El editor del cálculo ofrece la subtabla y sus columnas como «Subtabla › Columna».
    const editor = await pagina(`/pages/herramientas.herr-tabla?id=${pedidos}&modo=campo&campo=piezas_x`);
    const menus = nodos(editor, "nox.input-menu");
    const opciones = (name: string) => (menus.find((m) => m.props?.name === name)!.props!.options as { value: string; label: string }[]);
    expect(opciones("ext_tabla").map((o) => o.value)).toEqual(expect.arrayContaining(["sub:partidas", pagos]));
    expect(opciones("ext_c1_columna")).toContainEqual({ value: "sub:partidas|tipo", label: "Subtabla Partidas › Tipo" });
    expect(nodos(editor, "nox.input-text").some((n) => n.props?.name === "formula")).toBe(true);

    // Contar las filas con Tipo = X y (Precio > 10 o Cantidad ≥ 5); otro entero suma.
    const contar = await call("PATCH", `/herr-tablas/${pedidos}/campos/piezas_x`, {
      etiqueta: "Piezas X", tipo: "calculado", formula: "",
      ext_que: "cuenta", ext_tabla: "sub:partidas", ext_union: "y_o",
      ext_c1_columna: "sub:partidas|tipo", ext_c1_valor: "X",
      ext_c2_columna: "sub:partidas|precio", ext_c2_op: ">", ext_c2_valor: "10",
      ext_c3_columna: "sub:partidas|cantidad", ext_c3_op: ">=", ext_c3_valor: "5",
    });
    expect(contar.status).toBe(200);
    // Contar los pagos de otra tabla cuyo Pedido es el folio de este registro.
    const de_otra = await call("PATCH", `/herr-tablas/${pedidos}/campos/pagos`, {
      formula: "",
      ext_que: "cuenta", ext_tabla: pagos, ext_c1_columna: `${pagos}|pedido`, ext_c1_actual: "folio",
    });
    expect(de_otra.status).toBe(200);
    let spec = (await call("GET", `/herr-tablas/${pedidos}`)).data;
    const por = (k: string) => spec.campos.find((c: { clave: string }) => c.clave === k);
    expect(por("piezas_x")).toMatchObject({ tipo: "calculado", formula: 'sub_cuenta("partidas", ({tipo} == "X") y (({precio} > 10) o ({cantidad} >= 5)))' });
    expect(por("pagos").formula).toBe(`tabla_cuenta("${pagos}", {pedido} == {actual:folio})`);

    // No se capturan: el formulario no los pide y al guardar se llenan solos.
    const form = await pagina(`/pages/herramientas.herr-registro?tabla=${pedidos}`);
    const nombres = [...nodos(form, "nox.input-number"), ...nodos(form, "nox.input-text")].map((n) => n.props?.name);
    expect(nombres).not.toContain("piezas_x");
    await capturar({ tabla_id: pagos, pedido: "P-1", monto: 10 });
    await capturar({ tabla_id: pagos, pedido: "P-1", monto: 20 });
    await capturar({ tabla_id: pagos, pedido: "P-2", monto: 5 });
    const r = await capturar({
      tabla_id: pedidos,
      folio: "P-1",
      partidas: [
        { tipo: "X", cantidad: 2, precio: 15 },
        { tipo: "X", cantidad: 5, precio: 8 },
        { tipo: "Y", cantidad: 1, precio: 50 },
        { tipo: "X", cantidad: 1, precio: 3 },
      ],
    });
    expect(r.calculados.piezas_x).toBe("2");
    expect(r.calculados.pagos).toBe("2");

    // El entero se captura siempre: su editor no ofrece fórmula ni constructor, y una que llegue se descarta.
    const ent = await pagina(`/pages/herramientas.herr-tabla?id=${pedidos}&modo=campo&campo=piezas`);
    expect(nodos(ent, "nox.input-text").some((n) => n.props?.name === "formula")).toBe(false);
    expect(nodos(ent, "nox.input-menu").some((n) => n.props?.name === "ext_que")).toBe(false);
    expect((await call("PATCH", `/herr-tablas/${pedidos}/campos/piezas`, { formula: "{folio}", ext_que: "cuenta", ext_tabla: pagos })).status).toBe(200);
    spec = (await call("GET", `/herr-tablas/${pedidos}`)).data;
    expect(por("piezas").formula ?? null).toBeNull();
    expect(nombres).toContain("piezas");
  });

  test("una regla al escanear agrega la fila o suma su cantidad sin perder lo no guardado", async () => {
    const prod = await tabla("Productos", [
      { clave: "nombre", etiqueta: "Nombre", tipo: "texto" },
      { clave: "codigo", etiqueta: "Código", tipo: "codigo" },
      { clave: "precio", etiqueta: "Precio", tipo: "dinero" },
    ]);
    const agua = await capturar({ tabla_id: prod, nombre: "Agua", codigo: "AGUA", precio: 10 });
    await capturar({ tabla_id: prod, nombre: "Pan", codigo: "PAN", precio: 5 });
    const ventas = await tabla("Ventas", [
      { clave: "cliente", etiqueta: "Cliente", tipo: "texto" },
      {
        clave: "items",
        etiqueta: "Productos",
        tipo: "subtabla",
        columnas: [
          { clave: "producto", etiqueta: "Producto", tipo: "referencia", tabla_ref_id: prod, ref_leyenda: "{nombre}" },
          { clave: "nombre", etiqueta: "Nombre", tipo: "texto" },
          { clave: "codigo", etiqueta: "Código", tipo: "texto" },
          { clave: "cantidad", etiqueta: "Cantidad", tipo: "entero" },
          { clave: "pu", etiqueta: "P. unitario", tipo: "dinero" },
          { clave: "importe", etiqueta: "Importe", tipo: "calculado", formula: "{cantidad} * {pu}" },
        ],
      },
      { clave: "total", etiqueta: "Total", tipo: "calculado", formula: 'sub_suma("items", {importe})' },
    ]);
    const r = await call("POST", `/herr-tablas/${ventas}/reglas`, {
      nombre: "Agregar producto",
      tabla_origen: prod,
      destino: "subtabla",
      accion: "sumar",
      cantidad: "1",
      columna: `${ventas}.items.cantidad`,
      columna_codigo: `${ventas}.items.codigo`,
      copiar_de_1: `${prod}.precio`,
      copiar_a_1: `${ventas}.items.pu`,
    });
    expect(r.status).toBe(200);
    const spec = (await call("GET", `/herr-tablas/${ventas}`)).data;
    expect(spec.reglas[0]).toMatchObject({ destino: "subtabla", subtabla: "items", copiar: [{ de: "precio", a: "pu" }] });

    // En pantalla, sin guardar: cliente escrito y ninguna fila.
    const scan = (formulario: Record<string, unknown>, codigo: string) =>
      call("POST", "/herr-registros/escanear", { formulario: { tabla_id: ventas, ...formulario }, codigo });
    const uno = await scan({ cliente: "Ana" }, "AGUA");
    expect(uno.status).toBe(200);
    const filas1 = uno.data.set.items as Fila[];
    expect(filas1.length).toBe(1);
    expect(filas1[0]).toMatchObject({ producto: agua.id, nombre: "Agua", codigo: "AGUA", cantidad: "1", pu: "10" });
    expect(uno.data.set.cliente).toBeUndefined();
    const dos = await scan({ cliente: "Ana", items: filas1 }, "agua");
    expect((dos.data.set.items as Fila[]).map((f) => f.cantidad)).toEqual(["2"]);
    const tres = await scan({ cliente: "Ana", items: JSON.stringify(dos.data.set.items) }, "PAN");
    const filas3 = tres.data.set.items as Fila[];
    expect(filas3.map((f) => f.nombre)).toEqual(["Agua", "Pan"]);
    expect(filas3[0]!._id).toBe(filas1[0]!._id);
    expect((await scan({}, "NO-EXISTE")).status).toBe(404);
    // Nada se guardó: es el formulario el que guarda.
    expect(((await call("GET", `/herr-registros?tabla_id=${ventas}`)).data as unknown[]).length).toBe(0);

    const venta = await capturar({ tabla_id: ventas, cliente: "Ana", items: filas3 });
    expect(venta.calculados.total).toBe("25.00");
    // Con el registro guardado, escanear desde «Ver tabla» también lo agrega a su subtabla.
    expect((await call("POST", "/herr-registros/escanear", { tabla_id: ventas, codigo: "PAN", id: venta.id })).status).toBe(200);
    const guardado = (await call("GET", `/herr-registros/${venta.id}`)).data;
    expect((JSON.parse(guardado.valores.items) as Fila[]).map((f) => f.cantidad)).toEqual(["2", "2"]);
    const diseno = await pagina(`/pages/herramientas.herr-tabla?id=${ventas}&modo=disenar&seccion=reglas`);
    expect(nodos(diseno, "nox.markdown-view").some((n) => String(n.props!.content).includes("subtabla «Productos»"))).toBe(true);
    // La lista enseña la subtabla resumida.
    const lista = await pagina(`/pages/herramientas.herr-tabla?id=${ventas}`);
    const filas_tabla = nodos(lista, "nox.table")[0]!.props!.rows as Record<string, string>[];
    expect(filas_tabla[0]!.items).toContain("2 filas");
  });

  test("desde otra tabla: la subtabla completa o una de sus filas", async () => {
    const ventas = await tabla("Ventas", [
      { clave: "folio", etiqueta: "Folio", tipo: "texto" },
      {
        clave: "items",
        etiqueta: "Productos",
        tipo: "subtabla",
        columnas: [
          { clave: "nombre", etiqueta: "Nombre", tipo: "texto" },
          { clave: "importe", etiqueta: "Importe", tipo: "dinero" },
        ],
      },
    ]);
    const v = await capturar({ tabla_id: ventas, folio: "V-1", items: [{ nombre: "Agua", importe: 20 }, { nombre: "Pan", importe: 15 }] });
    const filas = JSON.parse(v.valores.items) as Fila[];
    const devol = await tabla("Devoluciones", [
      { clave: "venta", etiqueta: "Venta", tipo: "referencia", tabla_ref_id: ventas, ref_leyenda: "{folio}", ref_subtabla: "items", ref_subtabla_modo: "whole" },
      { clave: "linea", etiqueta: "Línea", tipo: "referencia", tabla_ref_id: ventas, ref_subtabla: "items", ref_subtabla_modo: "element" },
      { clave: "total_venta", etiqueta: "Total venta", tipo: "calculado", formula: "{venta.items.importe}" },
      { clave: "devuelto", etiqueta: "Devuelto", tipo: "calculado", formula: "{linea.importe}" },
    ]);
    const form = await pagina(`/pages/herramientas.herr-registro?tabla=${devol}`);
    const linea = nodos(form, "nox.input-datalist").find((n) => n.props!.name === "linea")!;
    const opciones = linea.props!.options as { value: string; label: string; leyend_secondary?: string }[];
    expect(opciones.map((o) => o.value)).toEqual([`${v.id}~${filas[0]!._id}`, `${v.id}~${filas[1]!._id}`]);
    expect(opciones[1]).toMatchObject({ label: expect.stringContaining("Pan") });
    const d = await capturar({ tabla_id: devol, venta: v.id, linea: `${v.id}~${filas[1]!._id}` });
    expect(d.calculados).toMatchObject({ total_venta: "35.00", devuelto: "15.00" });
    const lista = await pagina(`/pages/herramientas.herr-tabla?id=${devol}`);
    expect(JSON.stringify(nodos(lista, "nox.table")[0]!.props!.rows)).toContain("Pan");
  });
});
