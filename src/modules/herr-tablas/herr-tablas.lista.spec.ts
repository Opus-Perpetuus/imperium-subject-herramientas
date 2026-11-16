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
/** Otra imagen: el núcleo daría otra miniatura. */
const PNG_2 = "data:image/png;base64,iVBORw0KGgo=";

type Server = ReturnType<typeof create_kirlet_test_context>;
let server: Server;
let nox: MemoryNoxServices;
let subidas = 0;

/** Como el núcleo v13: URL de `/api/media` y una miniatura distinta por imagen guardada. */
beforeEach(() => {
  subidas = 0;
  nox = new MemoryNoxServices();
  const save = nox.files.save;
  nox.files.save = async (input) => {
    const ref = await save(input);
    subidas++;
    return { ...ref, url: `/api/media/${ref.id}`, thumbnail: `data:image/jpeg;base64,MINI${subidas}` } as NoxFileRef;
  };
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

async function crear_tabla(body: Record<string, unknown>): Promise<string> {
  const r = await call("POST", "/herr-tablas", body);
  expect(r.status).toBe(201);
  return r.data.id;
}

async function capturar(body: Record<string, unknown>) {
  const r = await call("POST", "/herr-registros/captura", body);
  expect(r.status).toBeLessThan(300);
  return r.data;
}

type Columna = { key: string; label: string; cells?: Record<string, unknown>[] };

async function inventario() {
  const id = await crear_tabla({
    name: "Inventario",
    cerrable: false,
    campos: [
      { clave: "nombre", etiqueta: "Nombre", tipo: "texto", en_resumen: true },
      { clave: "sku", etiqueta: "SKU", tipo: "codigo", en_resumen: true, escaner: { mostrar: "ambos", formatos: "barras" } },
      { clave: "fotos", etiqueta: "Fotos", tipo: "fotos", en_resumen: true },
    ],
  });
  for (let i = 1; i <= 7; i++) {
    await capturar({ tabla_id: id, nombre: `Pieza ${i}`, sku: `75010${i}`, ...(i === 1 ? { fotos: [PNG, PNG_2] } : {}) });
  }
  return id;
}

describe("«Ver tabla» con view-list", () => {
  test("la lista es un nox.view-list con fotos y códigos como celdas, y la tabla de antes de respaldo", async () => {
    const id = await inventario();
    const doc = await pagina(`/pages/herramientas.herr-tabla?id=${id}&q=pieza`);
    const [lista] = nodos(doc, "nox.view-list");
    const props = lista!.props!;
    expect(props.source).toBe(`api://herr-tablas/${id}/vista`);
    expect(props.q).toBe("pieza");
    const columnas = props.columns as Columna[];
    expect(columnas.map((c) => c.key)).toEqual(["nombre", "sku", "fotos"]);
    expect(columnas[1]!.cells).toEqual([{ kind: "code", display: "ambos", meta_key: "sku__codigo", values_key: "sku__codigos", format: "code_128" }]);
    expect(columnas[2]!.cells).toEqual([{ kind: "image", key: "fotos__mini", full_key: "fotos__url" }]);
    // Hay columna de código y no hay «Al escanear»: el escáner de la lista busca y abre.
    expect(props.scanner).toMatchObject({ label: "Buscar por código", open_single: true, config: { allow_manual: true, formats: expect.arrayContaining(["ean_13"]) } });
    // Respaldo para lanzadores sin nox.view-list.
    expect(lista!.children!.map((c) => c.component)).toContain("nox.table");
    // Las acciones de la tabla siguen fuera de la lista.
    expect(nodos(doc, "nox.button").map((b) => b.text)).toEqual(expect.arrayContaining(["Nuevo registro", "Diseñar", "Imprimir"]));
  });

  test("GET …/vista pagina y busca en el servidor con las mismas llaves de fotos y códigos", async () => {
    const id = await inventario();
    const p1 = await call("GET", `/herr-tablas/${id}/vista?page=1&page_size=5`);
    expect(p1.status).toBe(200);
    expect(p1.json.total).toBe(7);
    expect(p1.data).toHaveLength(5);
    const p2 = await call("GET", `/herr-tablas/${id}/vista?page=2&page_size=5`);
    expect(p2.data).toHaveLength(2);
    const todas = [...p1.data, ...p2.data] as Record<string, unknown>[];
    const con_fotos = todas.find((f) => f.nombre === "Pieza 1")!;
    expect(con_fotos.fotos__url).toHaveLength(2);
    expect(String(con_fotos.fotos__mini)).toContain("MINI");
    expect(con_fotos.sku__codigos).toEqual(["750101"]);
    expect(String(con_fotos._href)).toContain(`/internal/herr-registro?tabla=${id}`);

    const buscada = await call("GET", `/herr-tablas/${id}/vista?q=750105`);
    expect(buscada.json.total).toBe(1);
    expect((buscada.data as Record<string, unknown>[])[0]!.nombre).toBe("Pieza 5");
    expect((await call("GET", "/herr-tablas/no-existe/vista")).status).toBe(404);
  });

  test("con «Al escanear» queda su escáner y la lista no pone otro", async () => {
    const id = await inventario();
    const r = await call("PATCH", `/herr-tablas/${id}/escaneo`, { escaneo_accion: "nuevo", escaneo_columna: "sku" });
    expect(r.status).toBe(200);
    const doc = await pagina(`/pages/herramientas.herr-tabla?id=${id}`);
    const [lista] = nodos(doc, "nox.view-list");
    expect(lista!.props!.scanner).toBeUndefined();
    expect(nodos(doc, "nox.input-scanner").map((n) => n.props!.name)).toContain("escanear");
  });
});

describe("«Mis tablas» con view-list", () => {
  test("una fila por tabla con sus acciones y las tarjetas de respaldo", async () => {
    const id = await inventario();
    const doc = await pagina("/pages/herramientas.herr-tabla");
    const [lista] = nodos(doc, "nox.view-list");
    const props = lista!.props!;
    expect((props.columns as Columna[]).find((c) => c.key === "acciones")!.cells).toEqual([{ kind: "links" }]);
    const [fila] = props.rows as Record<string, unknown>[];
    expect(fila).toMatchObject({ _id: id, nombre: "Inventario", columnas: 3, registros: 7, _href: `/internal/herr-tabla?id=${id}` });
    expect((fila!.acciones as { text: string }[]).map((a) => a.text)).toEqual(["Abrir", "Capturar", "Diseñar"]);
    expect(lista!.children![0]!.component).toBe("nox.stack");
  });
});
