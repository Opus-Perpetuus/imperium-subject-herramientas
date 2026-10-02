import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  MemoryNoxServices,
  create_kirlet_test_context,
  define_subject,
  validate_page_descriptor_renderable,
  walk_ui_tree,
  type NoxFileRef,
  type NoxPageDescriptor,
  type NoxUiNode,
} from "@opus-perpetuus/imperium-core-kit";
import { fecha_hoy } from "../../lib/comun.ts";
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

const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const MINI = "data:image/jpeg;base64,MINIATURA";

type Server = ReturnType<typeof create_kirlet_test_context>;
let server: Server;

beforeEach(() => {
  const nox = new MemoryNoxServices();
  const save = nox.files.save;
  nox.files.save = async (input) => ({ ...(await save(input)), thumbnail: MINI }) as NoxFileRef;
  server = create_kirlet_test_context(SUBJECT, { nox });
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
  if (!ok.ok) throw new Error(JSON.stringify(ok.issues));
  return doc;
}

function nodos(page: NoxPageDescriptor, component: string): NoxUiNode[] {
  const out: NoxUiNode[] = [];
  walk_ui_tree(page.page, (n) => {
    if (n.component === component) out.push(n);
  });
  return out;
}

type Fila = Record<string, string>;
const filas_de = (n: NoxUiNode) => n.props!.rows as Fila[];

/** Productos (catálogo con foto) y una bitácora que los enlaza, con dos datos en su cierre. */
async function bitacora() {
  const productos = (
    await call("POST", "/herr-tablas", {
      name: "Productos",
      cerrable: false,
      campos: [
        { clave: "nombre", etiqueta: "Nombre", tipo: "texto", en_resumen: true },
        { clave: "foto", etiqueta: "Foto", tipo: "foto" },
      ],
    })
  ).data.id as string;
  const mezcal = (await call("POST", "/herr-registros/captura", { tabla_id: productos, nombre: "Mezcal", foto: PNG })).data.id;
  const vino = (await call("POST", "/herr-registros/captura", { tabla_id: productos, nombre: "Vino" })).data.id;
  const tabla = (
    await call("POST", "/herr-tablas", {
      name: "Bitácora",
      campos: [
        { clave: "producto", etiqueta: "Producto", tipo: "referencia", tabla_ref_id: productos, ref_leyenda: "{nombre}", en_resumen: true },
        { clave: "cantidad", etiqueta: "Cantidad", tipo: "entero", en_resumen: true },
        { clave: "foto", etiqueta: "Evidencia", tipo: "foto", en_resumen: true },
      ],
    })
  ).data.id as string;
  expect((await call("POST", `/herr-tablas/${tabla}/campos-cierre`, { etiqueta: "Efectivo contado", tipo: "dinero", requerido: true })).status).toBe(200);
  expect((await call("POST", `/herr-tablas/${tabla}/campos-cierre`, { etiqueta: "Responsable", tipo: "opcion", opciones: "Ana\nLuis" })).status).toBe(200);
  const anotar = (producto: string, cantidad: string, extra: Record<string, unknown> = {}) =>
    call("POST", "/herr-registros/captura", { tabla_id: tabla, producto, cantidad, ...extra });
  return { productos, tabla, mezcal, vino, anotar };
}

describe("hacer un cierre", () => {
  test("con nombre, fecha y los datos que pide la tabla; archiva fotos y el título de cada enlace", async () => {
    const { productos, tabla, mezcal, vino, anotar } = await bitacora();
    await anotar(mezcal, "2", { foto: PNG });
    await anotar(vino, "3");

    const falta = await call("POST", `/herr-tablas/${tabla}/cerrar`, { nombre: "Corte", fecha: "2026-10-01", responsable: "Ana" });
    expect(falta.status).toBe(400);
    expect(JSON.stringify(falta.json)).toContain("Efectivo contado");

    const r = await call("POST", `/herr-tablas/${tabla}/cerrar`, {
      nombre: "Corte del jueves",
      fecha: "2026-10-01T06:00:00.000Z",
      efectivo_contado: "1500",
      responsable: "Ana",
    });
    expect(r.status).toBe(200);
    expect(r.data).toMatchObject({ id: tabla, filas: 2 });
    expect(String(r.data.cierre_id)).toStartWith("cierre-");

    const cab = await server.data.findOne("herr_cierres_encabezados", { id: r.data.cierre });
    expect(cab).toMatchObject({
      name: "Corte del jueves",
      fecha: "2026-10-01",
      tabla_id: tabla,
      cierre_id: r.data.cierre_id,
      filas: 2,
      campos: { efectivo_contado: "1500", responsable: "Ana" },
    });
    const archivados = await server.data.findMany("herr_cierres", { where: { cierre_id: r.data.cierre_id } });
    const con_foto = archivados.find((a) => (a.custom_data as { etiquetas: Record<string, Record<string, string>> }).etiquetas.producto?.[mezcal]);
    expect(con_foto?.miniaturas).toEqual({ foto: MINI });
    expect((con_foto?.custom_data as { etiquetas: unknown }).etiquetas).toEqual({ producto: { [mezcal]: "Mezcal" } });
    expect((await call("GET", `/herr-registros?tabla_id=${tabla}`)).data).toEqual([]);

    // El archivo enseña los títulos de cuando se cerró aunque el producto cambie de nombre.
    await call("POST", "/herr-registros/captura", { tabla_id: productos, id: mezcal, nombre: "Mezcal joven", foto: "" });
    const doc = await pagina(`/pages/herramientas.herr-tabla?id=${tabla}&modo=cierre&cierre=${r.data.cierre}`);
    expect(doc.title).toBe("Corte del jueves · Bitácora");
    const detalle = nodos(doc, "nox.detail")[0]!.props!.items as Array<{ label: string; value: string }>;
    expect(detalle).toEqual(
      expect.arrayContaining([
        { label: "Fecha", value: "1 de octubre de 2026" },
        { label: "Registros", value: "2" },
        { label: "Efectivo contado", value: "1500.00" },
        { label: "Responsable", value: "Ana" },
      ]),
    );
    const archivo = filas_de(nodos(doc, "nox.table")[0]!);
    expect(archivo.map((f) => f.producto).sort()).toEqual(["Mezcal", "Vino"]);
    expect(archivo.find((f) => f.producto === "Mezcal")?.foto__mini).toBe(MINI);
  });

  test("sin cuerpo cierra con el nombre y la fecha de hoy", async () => {
    const { tabla, mezcal, anotar } = await bitacora();
    await call("DELETE", `/herr-tablas/${tabla}/campos-cierre/efectivo_contado`);
    await anotar(mezcal, "1");
    const r = await call("POST", `/herr-tablas/${tabla}/cerrar`);
    expect(r.status).toBe(200);
    const cab = await server.data.findOne("herr_cierres_encabezados", { id: r.data.cierre });
    expect(cab?.fecha).toBe(fecha_hoy());
    expect(String(cab?.name)).toStartWith("Cierre del ");
  });

  test("el formulario de cerrar pide nombre, fecha y los datos de la tabla; después se pueden cambiar", async () => {
    const { tabla, mezcal, anotar } = await bitacora();
    await anotar(mezcal, "1");
    const form_doc = await pagina(`/pages/herramientas.herr-tabla?id=${tabla}&modo=cerrar`);
    const [form] = nodos(form_doc, "nox.form");
    expect(form!.props).toMatchObject({
      method: "POST",
      action: `api://herr-tablas/${tabla}/cerrar`,
      then: "herramientas.herr-tabla?id={id}&modo=cierre&cierre={cierre}",
    });
    const nombres = (form!.children ?? []).map((n) => n.props?.name).filter(Boolean);
    expect(nombres).toEqual(["nombre", "fecha", "efectivo_contado", "responsable"]);
    expect(nodos(form_doc, "nox.input-menu")[0]!.props!.options).toEqual([
      { value: "Ana", label: "Ana" },
      { value: "Luis", label: "Luis" },
    ]);

    const r = await call("POST", `/herr-tablas/${tabla}/cerrar`, { nombre: "Uno", fecha: "2026-10-01", efectivo_contado: "10" });
    const cambio = await call("PATCH", `/herr-tablas/${tabla}/cierres/${r.data.cierre}`, {
      nombre: "Corte de octubre",
      fecha: "2026-10-02",
      efectivo_contado: "12",
      responsable: "Luis",
    });
    expect(cambio.status).toBe(200);
    expect(cambio.data).toMatchObject({ id: tabla, cierre: r.data.cierre });
    expect(await server.data.findOne("herr_cierres_encabezados", { id: r.data.cierre })).toMatchObject({
      name: "Corte de octubre",
      fecha: "2026-10-02",
      campos: { efectivo_contado: "12", responsable: "Luis" },
    });
    expect((await call("PATCH", `/herr-tablas/${tabla}/cierres/nada`, { nombre: "x" })).status).toBe(404);
  });
});

describe("comparar cierres", () => {
  async function dos_cierres() {
    const b = await bitacora();
    await b.anotar(b.mezcal, "2");
    await b.anotar(b.vino, "1");
    const lunes = (await call("POST", `/herr-tablas/${b.tabla}/cerrar`, { nombre: "Lunes", fecha: "2026-09-28", efectivo_contado: "300" })).data;
    await b.anotar(b.mezcal, "5");
    const martes = (await call("POST", `/herr-tablas/${b.tabla}/cerrar`, { nombre: "Martes", fecha: "2026-09-29", efectivo_contado: "500" })).data;
    await b.anotar(b.vino, "4");
    return { ...b, lunes, martes };
  }

  test("la lista de cierres abre cada uno y ofrece compararlos", async () => {
    const { tabla, lunes, martes } = await dos_cierres();
    const doc = await pagina(`/pages/herramientas.herr-tabla?id=${tabla}&modo=cierres`);
    const lista = filas_de(nodos(doc, "nox.table")[0]!);
    expect(lista.map((f) => [f.nombre, f.fecha, f.filas])).toEqual([
      ["Martes", "29 de septiembre de 2026", "1"],
      ["Lunes", "28 de septiembre de 2026", "2"],
    ]);
    expect(lista[0]!._href).toBe(`/internal/herr-tabla?id=${tabla}&modo=cierre&cierre=${martes.cierre}`);
    const casillas = nodos(doc, "nox.input-checkbox").map((n) => [n.props!.name, n.props!.value]);
    expect(casillas).toEqual([
      ["actual", true],
      [`c_${martes.cierre}`, true],
      [`c_${lunes.cierre}`, false],
    ]);
  });

  test("elegir qué comparar devuelve los parámetros de la hoja; con menos de dos no", async () => {
    const { tabla, lunes, martes } = await dos_cierres();
    const r = await call("POST", `/herr-tablas/${tabla}/cierres/comparar`, {
      [`c_${lunes.cierre}`]: true,
      [`c_${martes.cierre}`]: "true",
      actual: false,
    });
    expect(r.data).toEqual({ id: tabla, c: `${lunes.cierre},${martes.cierre}`, actual: "", agrupar: "", medir: "" });
    expect((await call("POST", `/herr-tablas/${tabla}/cierres/comparar`, { [`c_${lunes.cierre}`]: true })).status).toBe(400);
    expect(
      (await call("POST", `/herr-tablas/${tabla}/cierres/comparar`, { [`c_${lunes.cierre}`]: true, actual: true })).data.actual,
    ).toBe("1");
  });

  test("dos cierres y lo actual, en orden: totales y desglose por producto", async () => {
    const { tabla, lunes, martes } = await dos_cierres();
    const doc = await pagina(`/pages/herramientas.herr-tabla?id=${tabla}&modo=comparar&c=${martes.cierre},${lunes.cierre}&actual=1`);
    const [totales, grupos] = nodos(doc, "nox.table");
    expect((totales!.props!.columns as Array<{ label: string }>).map((c) => c.label)).toEqual([
      "Dato",
      "Lunes",
      "Martes",
      "Lo actual",
      "Diferencia",
    ]);
    const por_dato = Object.fromEntries(filas_de(totales!).map((f) => [f.dato, [f.p0, f.p1, f.p2, f.diferencia]]));
    expect(por_dato["Registros"]).toEqual(["2", "1", "1", "-1"]);
    expect(por_dato["Suma de Cantidad"]).toEqual(["3", "5", "4", "+1"]);
    expect(por_dato["Efectivo contado"]).toEqual(["300.00", "500.00", "—", ""]);
    expect(filas_de(grupos!).map((f) => [f.dato, f.p0, f.p1, f.p2, f.diferencia])).toEqual([
      ["Mezcal", "2", "5", "0", "-2"],
      ["Vino", "1", "0", "4", "+3"],
    ]);
  });

  test("un producto que cambió de nombre sigue siendo un solo grupo al comparar", async () => {
    const { productos, tabla, mezcal, lunes, martes } = await dos_cierres();
    await call("POST", "/herr-registros/captura", { tabla_id: productos, id: mezcal, nombre: "Mezcal joven", foto: "" });
    const doc = await pagina(`/pages/herramientas.herr-tabla?id=${tabla}&modo=comparar&c=${lunes.cierre},${martes.cierre}&actual=1`);
    expect(filas_de(nodos(doc, "nox.table")[1]!).map((f) => [f.dato, f.p0, f.p1, f.p2])).toEqual([
      ["Mezcal joven", "2", "5", "0"],
      ["Vino", "1", "0", "4"],
    ]);
    const visto = await pagina(`/pages/herramientas.herr-tabla?id=${tabla}&modo=cierre&cierre=${lunes.cierre}`);
    expect(filas_de(nodos(visto, "nox.table")[0]!).map((f) => f.producto).sort()).toEqual(["Mezcal", "Vino"]);
  });

  test("se puede desglosar contando registros, y con uno solo pide elegir otro", async () => {
    const { tabla, lunes, martes } = await dos_cierres();
    const doc = await pagina(
      `/pages/herramientas.herr-tabla?id=${tabla}&modo=comparar&c=${lunes.cierre},${martes.cierre}&agrupar=producto&medir=_registros`,
    );
    const grupos = filas_de(nodos(doc, "nox.table")[1]!);
    expect(grupos.map((f) => [f.dato, f.p0, f.p1])).toEqual([
      ["Mezcal", "1", "1"],
      ["Vino", "1", "0"],
    ]);
    const solo = await pagina(`/pages/herramientas.herr-tabla?id=${tabla}&modo=comparar&c=${lunes.cierre}`);
    expect(nodos(solo, "nox.alert")[0]!.props!.text).toBe("Elige al menos dos");
  });
});

describe("datos del cierre en el diseñador", () => {
  test("se agregan, se validan y se quitan", async () => {
    const { tabla } = await bitacora();
    expect((await call("POST", `/herr-tablas/${tabla}/campos-cierre`, { etiqueta: "Foto", tipo: "foto" })).status).toBe(400);
    expect((await call("POST", `/herr-tablas/${tabla}/campos-cierre`, { etiqueta: "Turno", tipo: "opcion" })).status).toBe(400);
    expect((await call("POST", `/herr-tablas/${tabla}/campos-cierre`, { etiqueta: "" })).status).toBe(400);
    expect((await call("POST", `/herr-tablas/${tabla}/campos-cierre`, { etiqueta: "Nombre" })).status).toBe(200);

    const doc = await pagina(`/pages/herramientas.herr-tabla?id=${tabla}&modo=disenar&seccion=cierre`);
    expect(nodos(doc, "nox.detail").map((n) => n.props!.text)).toEqual(["Efectivo contado", "Responsable", "Nombre"]);
    const tabla_fila = await server.data.findOne("herr_tablas", { id: tabla });
    expect((tabla_fila!.campos_cierre as Array<{ clave: string }>).map((c) => c.clave)).toEqual([
      "efectivo_contado",
      "responsable",
      "nombre_2",
    ]);

    expect((await call("DELETE", `/herr-tablas/${tabla}/campos-cierre/responsable`)).status).toBe(200);
    expect((await call("DELETE", `/herr-tablas/${tabla}/campos-cierre/responsable`)).status).toBe(404);
    expect((await call("PATCH", `/herr-tablas/${tabla}`, { campos_cierre: [{ clave: "x", etiqueta: "X", tipo: "foto" }] })).status).toBe(400);
  });
});
