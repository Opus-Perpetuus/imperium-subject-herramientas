import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  create_kirlet_test_context,
  define_subject,
  validate_page_descriptor_renderable,
  walk_ui_tree,
  type NoxPageDescriptor,
  type NoxUiNode,
} from "@opus-perpetuus/imperium-core-kit";
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

let server: ReturnType<typeof create_kirlet_test_context>;
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

/** Valor de una columna por fila, según la primera columna. */
async function columna(tabla: string, por: string, clave: string): Promise<Record<string, unknown>> {
  const vista = await pagina(`/pages/herramientas.herr-tabla?id=${tabla}`);
  const filas = nodos(vista, "nox.table")[0]!.props!.rows as Record<string, unknown>[];
  return Object.fromEntries(filas.map((f) => [f[por], f[clave]]));
}

async function crear(name: string, campos: unknown[]) {
  const r = await call("POST", "/herr-tablas", { name, campos });
  expect(r.status).toBe(201);
  return r.data.id as string;
}

async function registro(tabla_id: string, valores: Record<string, string>) {
  const r = await call("POST", "/herr-registros", { tabla_id, valores });
  expect(r.status).toBe(201);
  return r.data.id as string;
}

async function montar() {
  const productos = await crear("Productos", [
    { clave: "nombre", etiqueta: "Nombre", tipo: "texto", en_resumen: true },
    { clave: "precio", etiqueta: "Precio", tipo: "dinero", en_resumen: true },
  ]);
  const vino = await registro(productos, { nombre: "Vino", precio: "120" });
  const pan = await registro(productos, { nombre: "Pan", precio: "15" });
  const ventas = await crear("Ventas", [
    { clave: "producto", etiqueta: "Producto", tipo: "referencia", tabla_ref_id: productos, en_resumen: true },
    { clave: "cantidad", etiqueta: "Cantidad", tipo: "entero", en_resumen: true },
    { clave: "estado", etiqueta: "Estado", tipo: "texto", en_resumen: true },
  ]);
  await registro(ventas, { producto: vino, cantidad: "2", estado: "pagado" });
  await registro(ventas, { producto: vino, cantidad: "1", estado: "pendiente" });
  await registro(ventas, { producto: pan, cantidad: "4", estado: "pagado" });
  return { productos, ventas, vino, pan };
}

describe("cálculo con otras tablas", () => {
  test("se escribe con nombres, se guarda con ids y la vista sigue a la tabla origen", async () => {
    const { productos, ventas, vino } = await montar();
    const campos = `/herr-tablas/${productos}/campos`;
    expect((await call("POST", campos, { etiqueta: "Vendido", tipo: "calculado" })).status).toBe(200);
    const puesta = await call("PATCH", `${campos}/vendido`, {
      operacion: "escrita",
      formula: 'tabla_suma("Ventas", {Cantidad}, {Producto} = {actual:_id} y ({Estado} = "pagado" o {Cantidad} > 5))',
      en_resumen: "1",
    });
    expect(puesta.status).toBe(200);
    const fila = (await call("GET", `/herr-tablas/${productos}`)).data;
    expect(fila.campos.find((c: { clave: string }) => c.clave === "vendido").formula).toBe(
      `tabla_suma("${ventas}", {cantidad}, {producto} = {actual:_id} y ({estado} = "pagado" o {cantidad} > 5))`,
    );
    expect(await columna(productos, "nombre", "vendido")).toMatchObject({ Vino: "2.00", Pan: "4.00" });

    await registro(ventas, { producto: vino, cantidad: "9", estado: "pendiente" });
    expect(await columna(productos, "nombre", "vendido")).toMatchObject({ Vino: "11.00", Pan: "4.00" });

    // Renombrar la tabla origen no rompe la fórmula guardada; el editor la enseña con el nombre nuevo.
    await call("PATCH", `/herr-tablas/${ventas}`, { name: "Salidas" });
    expect(await columna(productos, "nombre", "vendido")).toMatchObject({ Vino: "11.00" });
    const editor = await pagina(`/pages/herramientas.herr-tabla?id=${productos}&modo=campo&campo=vendido`);
    const area = nodos(editor, "nox.input-textarea").find((n) => n.props?.name === "formula") ?? nodos(editor, "nox.input-text").find((n) => n.props?.name === "formula");
    expect(String(area?.props?.value)).toStartWith('tabla_suma("Salidas", {Cantidad}');
    const menu = (name: string) => nodos(editor, "nox.input-menu").find((n) => n.props?.name === name)?.props?.options as unknown[];
    expect(menu("ext_c1_actual")).toContainEqual({ value: "_id", label: "Este registro (para comparar con un enlace hacia esta tabla)" });
    expect(menu("ext_c1_actual")).toContainEqual({ value: "nombre", label: "Nombre" });
    expect(menu("ext_columna")).toContainEqual({ value: `${ventas}|cantidad`, label: "Salidas › Cantidad" });
    expect(nodos(editor, "nox.input-menu").find((n) => n.props?.name === "ext_tabla")?.props?.options).toContainEqual({ value: productos, label: "Esta tabla" });
  });

  test("columna del registro enlazado y resumen sobre otra tabla", async () => {
    const { productos, ventas } = await montar();
    await call("POST", `/herr-tablas/${ventas}/campos`, { etiqueta: "Importe", tipo: "calculado" });
    const r = await call("PATCH", `/herr-tablas/${ventas}/campos/importe`, { operacion: "escrita", formula: "{Cantidad} × {Producto.Precio}", en_resumen: "1" });
    expect(r.status).toBe(200);
    expect(Object.values(await columna(ventas, "cantidad", "importe")).sort()).toEqual(["120.00 $", "240.00 $", "60.00 $"]);
    const total = await call("POST", `/herr-tablas/${productos}/resumenes`, { etiqueta: "Ingresos", formula: 'tabla_suma("Ventas", {Importe}, {Estado} = "pagado")' });
    expect(total.status).toBe(200);
    const resumen = await call("GET", `/herr-tablas/${productos}/resumen`);
    expect(resumen.data.resumenes[0].texto).toBe("300.00");
  });

  test("el constructor del diseñador arma la fórmula y la mete en {?}", async () => {
    const { productos, ventas } = await montar();
    await call("POST", `/herr-tablas/${productos}/campos`, { etiqueta: "Pagadas", tipo: "calculado" });
    const r = await call("PATCH", `/herr-tablas/${productos}/campos/pagadas`, {
      operacion: "escrita",
      formula: "{?} × 10",
      en_resumen: "1",
      ext_que: "cuenta",
      ext_tabla: ventas,
      ext_union: "y",
      ext_c1_columna: `${ventas}|producto`,
      ext_c1_op: "=",
      ext_c1_actual: "_id",
      ext_c2_columna: `${ventas}|estado`,
      ext_c2_op: "=",
      ext_c2_valor: "pagado",
    });
    expect(r.status).toBe(200);
    expect(await columna(productos, "nombre", "pagadas")).toMatchObject({ Vino: "10.00", Pan: "10.00" });
  });

  test("columnas o tablas que no existen y ciclos entre tablas se rechazan al guardar", async () => {
    const { productos, ventas } = await montar();
    await call("POST", `/herr-tablas/${productos}/campos`, { etiqueta: "Vendido", tipo: "calculado" });
    const mala = await call("PATCH", `/herr-tablas/${productos}/campos/vendido`, { operacion: "escrita", formula: 'tabla_suma("Ventas", {Nada})' });
    expect(mala.status).toBe(400);
    expect(String(mala.json.message)).toContain("«Nada» no existe en «Ventas»");
    const sin_tabla = await call("PATCH", `/herr-tablas/${productos}/campos/vendido`, { operacion: "escrita", formula: 'tabla_suma("Compras", {x})' });
    expect(sin_tabla.status).toBe(400);

    expect((await call("PATCH", `/herr-tablas/${productos}/campos/vendido`, { operacion: "escrita", formula: 'tabla_suma("Ventas", {Cantidad})' })).status).toBe(200);
    await call("POST", `/herr-tablas/${ventas}/campos`, { etiqueta: "Parte", tipo: "calculado" });
    expect((await call("PATCH", `/herr-tablas/${ventas}/campos/parte`, { operacion: "escrita", formula: "{Cantidad} / 2" })).status).toBe(200);
    expect((await call("PATCH", `/herr-tablas/${productos}/campos/vendido`, { operacion: "escrita", formula: 'tabla_suma("Ventas", {Parte})' })).status).toBe(200);
    const ciclo = await call("PATCH", `/herr-tablas/${ventas}/campos/parte`, { operacion: "escrita", formula: 'tabla_maximo("Productos", {Vendido})' });
    expect(ciclo.status).toBe(400);
    expect(String(ciclo.json.message)).toContain("Ciclo de cálculo");

    // La columna que otra tabla usa no se puede borrar.
    const en_uso = await call("DELETE", `/herr-tablas/${ventas}/campos/parte`);
    expect(en_uso.status).toBe(409);
    expect(String(en_uso.json.message)).toContain("Productos");
  });
});
