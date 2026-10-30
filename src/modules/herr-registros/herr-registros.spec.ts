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
import { herr_tablas_module } from "../herr-tablas/herr-tablas.routes.ts";
import { herr_registros_module } from "./herr-registros.routes.ts";

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
let nox: MemoryNoxServices;

/** Como el núcleo v13: la URL es la de `/api/media` y cada imagen trae su miniatura. */
function con_miniaturas(n: MemoryNoxServices): MemoryNoxServices {
  const save = n.files.save;
  n.files.save = async (input) => {
    const ref = await save(input);
    return { ...ref, url: `/api/media/${ref.id}`, thumbnail: MINI } as NoxFileRef;
  };
  return n;
}

beforeEach(() => {
  nox = con_miniaturas(new MemoryNoxServices());
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
  // El lanzador pinta `nox.timeline` (también lo usa Tienda); el kit vendorizado aún no lo lista.
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

async function productos(): Promise<string> {
  const r = await call("POST", "/herr-tablas", {
    name: "Productos",
    cerrable: false,
    campos: [
      { clave: "nombre", etiqueta: "Nombre", tipo: "texto", en_resumen: true },
      { clave: "foto", etiqueta: "Foto", tipo: "foto", en_resumen: true },
    ],
  });
  expect(r.status).toBe(201);
  return r.data.id;
}

async function capturar(body: Record<string, unknown>) {
  const r = await call("POST", "/herr-registros/captura", body);
  expect(r.status).toBeLessThan(300);
  return r.data;
}

describe("fotos de un registro", () => {
  test("se guardan como adjunto con su miniatura y Ver tabla las enseña", async () => {
    const tabla_id = await productos();
    const r = await capturar({ tabla_id, nombre: "Mezcal", foto: PNG });
    expect(r.valores.foto).toStartWith("/api/media/");
    expect(r.miniaturas).toEqual({ foto: MINI });

    const doc = await pagina(`/pages/herramientas.herr-tabla?id=${tabla_id}`);
    const [tabla] = nodos(doc, "nox.table");
    expect(tabla!.props!.columns).toEqual([
      { key: "nombre", label: "Nombre" },
      { key: "foto", label: "Foto", image_key: "foto__mini", image_full_key: "foto__url" },
    ]);
    expect(tabla!.props!.rows).toEqual([
      {
        nombre: "Mezcal",
        foto: "Foto",
        foto__mini: MINI,
        foto__url: r.valores.foto,
        _id: r.id,
        _href: `/internal/herr-registro?tabla=${tabla_id}&id=${r.id}`,
      },
    ]);
  });

  test("editar sin tocar la foto conserva su miniatura; quitarla la borra", async () => {
    const tabla_id = await productos();
    const r = await capturar({ tabla_id, nombre: "Mezcal", foto: PNG });
    const igual = await capturar({ tabla_id, id: r.id, nombre: "Mezcal joven", foto: r.valores.foto });
    expect(igual.valores.foto).toBe(r.valores.foto);
    expect(igual.miniaturas).toEqual({ foto: MINI });
    const sin = await capturar({ tabla_id, id: r.id, nombre: "Mezcal joven", foto: "" });
    expect(sin.valores.foto).toBe("");
    expect(sin.miniaturas).toEqual({});
  });

  test("el formulario enseña la miniatura; si vuelve igual, la foto se queda como estaba", async () => {
    const tabla_id = await productos();
    const r = await capturar({ tabla_id, nombre: "Mezcal", foto: PNG });
    const form = await pagina(`/pages/herramientas.herr-registro?tabla=${tabla_id}&id=${r.id}`);
    expect(nodos(form, "nox.input-image")[0]!.props!.value).toBe(MINI);

    const igual = await capturar({ tabla_id, id: r.id, nombre: "Mezcal joven", foto: MINI });
    expect(igual.valores.foto).toBe(r.valores.foto);
    expect(igual.miniaturas).toEqual({ foto: MINI });
    expect(await nox.files.list({ resource: "herr-registros" })).toHaveLength(1);

    const id_adjunto = r.valores.foto.split("/").at(-1);
    await server.data.update("herr_registros", { id: r.id }, { miniaturas: {} });
    const sin_mini = await pagina(`/pages/herramientas.herr-registro?tabla=${tabla_id}&id=${r.id}`);
    expect(nodos(sin_mini, "nox.input-image")[0]!.props!.value).toBe(id_adjunto);
    const por_id = await capturar({ tabla_id, id: r.id, nombre: "Mezcal joven", foto: id_adjunto });
    expect(por_id.valores.foto).toBe(r.valores.foto);
  });

  test("si el servidor no guarda la foto, el registro no se guarda", async () => {
    const tabla_id = await productos();
    nox.files.save = async (input) => ({ id: "x", resource: input.resource }) as NoxFileRef;
    const r = await call("POST", "/herr-registros/captura", { tabla_id, nombre: "Mezcal", foto: PNG });
    expect(r.status).toBe(502);
    expect(String((r.json.error as { message?: string })?.message ?? r.json.message ?? JSON.stringify(r.json))).toContain(
      "No se pudo guardar la foto",
    );
    expect((await call("GET", `/herr-registros?tabla_id=${tabla_id}`)).data).toEqual([]);
  });

  test("una foto «undefined» de antes se lee como vacía", async () => {
    const tabla_id = await productos();
    const r = await capturar({ tabla_id, nombre: "Mezcal" });
    await server.data.update("herr_registros", { id: r.id }, { valores: { nombre: "Mezcal", foto: "undefined" } });

    const doc = await pagina(`/pages/herramientas.herr-tabla?id=${tabla_id}`);
    expect(nodos(doc, "nox.table")[0]!.props!.rows).toEqual([
      { nombre: "Mezcal", foto: "", _id: r.id, _href: `/internal/herr-registro?tabla=${tabla_id}&id=${r.id}` },
    ]);
    const form = await pagina(`/pages/herramientas.herr-registro?tabla=${tabla_id}&id=${r.id}`);
    expect(nodos(form, "nox.input-image")[0]!.props!.value).toBe("");
    const guardado = await capturar({ tabla_id, id: r.id, nombre: "Mezcal", foto: "undefined" });
    expect(guardado.valores.foto).toBe("");
  });

  test("la lista de Registros trae la miniatura como `foto`", async () => {
    const tabla_id = await productos();
    await capturar({ tabla_id, nombre: "Mezcal", foto: PNG });
    await capturar({ tabla_id, nombre: "Tequila" });
    for (const path of ["/herr-registros", `/herr-registros?tabla_id=${tabla_id}`]) {
      const filas = (await call("GET", path)).data as Record<string, unknown>[];
      expect(filas.find((f) => f.name === "Mezcal")?.foto).toBe(MINI);
      expect(filas.find((f) => f.name === "Tequila")?.foto).toBeUndefined();
    }
  });

  test("el datalist de un enlace enseña la foto del registro enlazado", async () => {
    const productos_id = await productos();
    await capturar({ tabla_id: productos_id, nombre: "Mezcal", foto: PNG });
    await capturar({ tabla_id: productos_id, nombre: "Tequila" });
    const bitacora = await call("POST", "/herr-tablas", {
      name: "Bitácora",
      campos: [
        { clave: "producto", etiqueta: "Producto", tipo: "referencia", tabla_ref_id: productos_id, ref_leyenda: "{nombre}", en_resumen: true },
        { clave: "cantidad", etiqueta: "Cantidad", tipo: "entero", en_resumen: true },
      ],
    });
    const form = await pagina(`/pages/herramientas.herr-registro?tabla=${bitacora.data.id}`);
    const opciones = nodos(form, "nox.input-datalist")[0]!.props!.options as Record<string, unknown>[];
    expect(opciones.find((o) => o.label === "Mezcal")?.image).toBe(MINI);
    expect(opciones.find((o) => o.label === "Tequila")).not.toHaveProperty("image");
  });
});

describe("historial de un registro", () => {
  async function bitacora(): Promise<string> {
    const r = await call("POST", "/herr-tablas", {
      name: "Bitácora",
      campos: [
        { clave: "nota", etiqueta: "Nota", tipo: "texto", en_resumen: true },
        { clave: "cantidad", etiqueta: "Cantidad", tipo: "entero", en_resumen: true },
        { clave: "foto", etiqueta: "Foto", tipo: "foto" },
      ],
    });
    return r.data.id;
  }

  test("la captura y cada edición quedan con quién, cuándo y qué cambió", async () => {
    const tabla_id = await bitacora();
    const r = await capturar({ tabla_id, nota: "Entrada", cantidad: "3", foto: PNG });
    await capturar({ tabla_id, id: r.id, nota: "Entrada", cantidad: "5", foto: r.valores.foto });

    const entradas = await nox.history.list({ resource: "kirlet.herramientas.herr-registros", entity_id: r.id });
    expect(entradas.map((e) => e.action).sort()).toEqual(["create", "update"]);
    for (const e of entradas) {
      const payload = e.payload as { after: Record<string, unknown> };
      expect(payload.after).not.toHaveProperty("miniaturas");
    }

    const doc = await pagina(`/pages/herramientas.herr-registro?tabla=${tabla_id}&id=${r.id}&modo=historial`);
    const [linea] = nodos(doc, "nox.timeline");
    const items = linea!.props!.items as Array<{ title: string; description: string; state: string }>;
    expect(items.map((i) => i.title)).toEqual(["Cambió Cantidad", "Se capturó"]);
    expect(items[0]!.description).toBe("Cantidad: 3 → 5");
    expect(items[0]!.state).toBe("current");
    expect(items[1]!.description).toBe("Nota: Entrada · Cantidad: 3 · Foto: Sí");
  });

  test("lo que se edita por el CRUD también queda, y la baja se dice", async () => {
    const tabla_id = await bitacora();
    const r = await capturar({ tabla_id, nota: "Entrada", cantidad: "3" });
    await call("PATCH", `/herr-registros/${r.id}`, { tabla_id, valores: { nota: "Salida", cantidad: "3" } });
    await call("DELETE", `/herr-registros/${r.id}`);
    const doc = await pagina(`/pages/herramientas.herr-registro?tabla=${tabla_id}&id=${r.id}&modo=historial`);
    const items = nodos(doc, "nox.timeline")[0]!.props!.items as Array<{ title: string; description: string }>;
    expect(items.map((i) => i.title)).toEqual(["Se eliminó", "Cambió Nota", "Se capturó"]);
    expect(items[1]!.description).toBe("Nota: Entrada → Salida");
  });

  test("sin cambios guardados lo dice, y la página del registro lleva a su historial", async () => {
    const tabla_id = await bitacora();
    const id = (await server.data.insert("herr_registros", {
      id: "registro_viejo",
      name: "Viejo",
      tabla_id,
      valores: { nota: "Viejo" },
      is_active: true,
      created_at: "2026-09-01T00:00:00.000Z",
      updated_at: "2026-09-01T00:00:00.000Z",
    })).id as string;
    const doc = await pagina(`/pages/herramientas.herr-registro?tabla=${tabla_id}&id=${id}&modo=historial`);
    expect(nodos(doc, "nox.empty")[0]!.props!.text).toBe("Aún no hay cambios guardados");

    const form = await pagina(`/pages/herramientas.herr-registro?tabla=${tabla_id}&id=${id}`);
    const botones = nodos(form, "nox.button").map((b) => b.props!);
    expect(botones.map((b) => b.href)).toContain(`/internal/herr-registro?tabla=${tabla_id}&id=${id}&modo=historial`);
    expect(botones.find((b) => b.method === "DELETE")).toMatchObject({
      action: `api://herr-registros/${id}`,
      then: `herramientas.herr-tabla?id=${tabla_id}`,
    });
  });
});

describe("códigos leídos (QR o barras)", () => {
  const QR = { value: "HERR-0001", format: "qr_code", version: "2", ec_level: "M", source: "camara", engine: "nativo" };

  async function herramientas(mostrar = "ambos"): Promise<string> {
    const r = await call("POST", "/herr-tablas", {
      name: "Herramientas",
      cerrable: false,
      campos: [
        { clave: "nombre", etiqueta: "Nombre", tipo: "texto", en_resumen: true },
        { clave: "codigo", etiqueta: "Código", tipo: "codigo", en_resumen: true, escaner: { formatos: "todos", mostrar } },
      ],
    });
    expect(r.status).toBe(201);
    return r.data.id;
  }

  test("la metadata llega con el código, se guarda limpia y vuelve al editar", async () => {
    const tabla_id = await herramientas();
    const r = await capturar({ tabla_id, nombre: "Taladro", codigo: "HERR-0001", "codigo@codigo": JSON.stringify({ ...QR, raro: "x" }) });
    expect(r.valores).toEqual({ nombre: "Taladro", codigo: "HERR-0001" });
    expect(JSON.parse(r.codigos.codigo)).toEqual(QR);

    const edicion = await pagina(`/pages/herramientas.herr-registro?tabla=${tabla_id}&id=${r.id}`);
    const [scanner] = nodos(edicion, "nox.input-scanner");
    expect(scanner!.props!.scanner).toMatchObject({ display: "ambos", metadata_target: "codigo@codigo" });
    const oculto = nodos(edicion, "nox.input-hidden").find((n) => n.props!.name === "codigo@codigo");
    expect(JSON.parse(String(oculto!.props!.value))).toEqual(QR);

    // Sin la metadata en el envío se queda la que tenía mientras el código sea el mismo.
    const igual = await capturar({ tabla_id, id: r.id, nombre: "Taladro rojo", codigo: "HERR-0001" });
    expect(JSON.parse(igual.codigos.codigo)).toEqual(QR);
    // Escrito a mano otro código, la metadata del anterior ya no le corresponde.
    const otro = await capturar({ tabla_id, id: r.id, nombre: "Taladro rojo", codigo: "HERR-0009", "codigo@codigo": "" });
    expect(otro.codigos).toEqual({});
  });

  test("Ver tabla dibuja el código con su formato cuando la columna lo pide", async () => {
    const tabla_id = await herramientas("codigo");
    const r = await capturar({ tabla_id, nombre: "Taladro", codigo: "HERR-0001", "codigo@codigo": JSON.stringify(QR) });
    const doc = await pagina(`/pages/herramientas.herr-tabla?id=${tabla_id}`);
    const [tabla] = nodos(doc, "nox.table");
    expect(tabla!.props!.columns).toEqual([
      { key: "nombre", label: "Nombre" },
      { key: "codigo", label: "Código", code_display: "codigo", code_meta_key: "codigo__codigo", code_values_key: "codigo__codigos" },
    ]);
    const [fila] = tabla!.props!.rows as Record<string, unknown>[];
    expect(fila).toMatchObject({ codigo: "HERR-0001", codigo__codigos: ["HERR-0001"], _id: r.id });
    expect(JSON.parse(String(fila!.codigo__codigo))).toEqual(QR);
  });

  test("con «valor» la tabla enseña solo el texto, como siempre", async () => {
    const tabla_id = await herramientas("valor");
    await capturar({ tabla_id, nombre: "Taladro", codigo: "HERR-0001" });
    const [tabla] = nodos(await pagina(`/pages/herramientas.herr-tabla?id=${tabla_id}`), "nox.table");
    expect(tabla!.props!.columns).toEqual([
      { key: "nombre", label: "Nombre" },
      { key: "codigo", label: "Código" },
    ]);
  });

  test("un enlace con «elegir escaneando» manda los códigos de cada registro al datalist", async () => {
    const herr_id = await herramientas();
    const taladro = await capturar({ tabla_id: herr_id, nombre: "Taladro", codigo: "HERR-0001" });
    await capturar({ tabla_id: herr_id, nombre: "Sin código" });
    const r = await call("POST", "/herr-tablas", {
      name: "Préstamos",
      cerrable: false,
      campos: [
        { clave: "quien", etiqueta: "Quién", tipo: "texto" },
        { clave: "herramienta", etiqueta: "Herramienta", tipo: "referencia", tabla_ref_id: herr_id, ref_leyenda: "{nombre}" },
      ],
    });
    const prestamos = r.data.id as string;
    const sin = await pagina(`/pages/herramientas.herr-registro?tabla=${prestamos}`);
    expect(nodos(sin, "nox.input-datalist")[0]!.props!.scanner).toBeUndefined();

    const editor = await pagina(`/pages/herramientas.herr-tabla?id=${prestamos}&modo=campo&campo=herramienta`);
    expect(nodos(editor, "nox.input-checkbox").some((n) => n.props!.name === "ref_escaner")).toBe(true);
    expect((await call("PATCH", `/herr-tablas/${prestamos}/campos/herramienta/opcion`, { ref_escaner: true })).status).toBe(200);

    const con = await pagina(`/pages/herramientas.herr-registro?tabla=${prestamos}`);
    const [datalist] = nodos(con, "nox.input-datalist");
    expect(datalist!.props!.scanner).toEqual({ history: false });
    const opciones = datalist!.props!.options as { value: string; label: string; codes?: string[] }[];
    expect(opciones.find((o) => o.value === taladro.id)).toMatchObject({ label: "Taladro", codes: ["HERR-0001"] });
    expect(opciones.find((o) => o.label === "Sin código")?.codes).toBeUndefined();

    await call("PATCH", `/herr-tablas/${prestamos}/campos/herramienta/opcion`, { ref_escaner: false });
    expect((await call("GET", `/herr-tablas/${prestamos}`)).data.campos[1].ref_escaner).toBeUndefined();
  });
});
