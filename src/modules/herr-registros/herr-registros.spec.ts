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
import { MAX_CODIGOS_IMPRESOS, codigos_impresos } from "../herr-tablas/herr-tablas.impresion.ts";
import type { CampoSpec, Registro } from "../../lib/formulas/esquema.ts";
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

  async function herramientas(mostrar = "ambos", notas = false): Promise<string> {
    const r = await call("POST", "/herr-tablas", {
      name: "Herramientas",
      cerrable: false,
      campos: [
        { clave: "nombre", etiqueta: "Nombre", tipo: "texto", en_resumen: true },
        { clave: "codigo", etiqueta: "Código", tipo: "codigo", en_resumen: true, escaner: { formatos: "todos", mostrar, notas } },
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

  test("con notas por código, «Ver tabla» enseña la nota junto a cada código", async () => {
    const tabla_id = await herramientas("valor", true);
    await capturar({ tabla_id, nombre: "Taladro", codigo: "HERR-0001", "codigo@codigo": JSON.stringify({ ...QR, note: "frágil" }) });
    await capturar({ tabla_id, nombre: "Pinzas", codigo: "HERR-0002" });
    const [tabla] = nodos(await pagina(`/pages/herramientas.herr-tabla?id=${tabla_id}`), "nox.table");
    const filas = tabla!.props!.rows as Record<string, unknown>[];
    expect(filas.map((f) => f.codigo).sort()).toEqual(["HERR-0001 (frágil)", "HERR-0002"]);
  });

  test("el impreso dibuja el código en su formato (y su texto con «ambos»); con «valor» solo el texto con su nota", async () => {
    const pdf_de_tabla = async (tabla_id: string) => {
      const r = await call("POST", `/herr-tablas/${tabla_id}/imprimir`, { formato: "pdf", q: "" });
      expect(r.status).toBe(200);
      const doc = await pagina(`/pages/herramientas.herr-tabla?id=${tabla_id}&modo=impreso&t=${r.data.t}`);
      const html = String(nodos(doc, "nox.html")[0]!.props!.html);
      return Buffer.from(/data:application\/pdf;base64,([^"]+)"/.exec(html)![1]!, "base64").toString("latin1");
    };
    // Cada PNG va con su máscara de transparencia: dos imágenes por código dibujado.
    const imagenes = (pdf: string) => (pdf.match(/\/Subtype \/Image/g)?.length ?? 0) / 2;
    for (const [mostrar, dibujos] of [["ambos", 2], ["codigo", 2], ["valor", 0]] as const) {
      const tabla_id = await herramientas(mostrar, true);
      await capturar({ tabla_id, nombre: "Taladro", codigo: "HERR-0001", "codigo@codigo": JSON.stringify({ ...QR, note: "frágil" }) });
      await capturar({ tabla_id, nombre: "Pinzas", codigo: "7501031311309", "codigo@codigo": JSON.stringify({ value: "7501031311309", format: "ean_13" }) });
      expect([mostrar, imagenes(await pdf_de_tabla(tabla_id))]).toEqual([mostrar, dibujos]);
    }
  });

  test("codigos_impresos: QR y EAN en su formato, lo que su formato no acepta va en QR, y hay un tope", async () => {
    const campo = { clave: "codigo", etiqueta: "Código", tipo: "codigo", escaner: { formatos: "todos", mostrar: "codigo" } } as unknown as CampoSpec;
    const fila = (id: string, codigo: string, format: string) =>
      ({ id, valores: { codigo }, codigos: { codigo: JSON.stringify({ value: codigo, format }) } }) as unknown as Registro;
    const { dibujos, faltan } = await codigos_impresos([campo], [fila("a", "HERR-1", "qr_code"), fila("b", "no-es-ean", "ean_13")]);
    expect(faltan).toBe(0);
    expect(dibujos.get("a|codigo")).toStartWith("data:image/png;base64,");
    expect(dibujos.get("b|codigo")).toStartWith("data:image/png;base64,");
    const muchas = Array.from({ length: MAX_CODIGOS_IMPRESOS + 3 }, (_, i) => fila(`f${i}`, `C-${i}`, "code_128"));
    expect((await codigos_impresos([campo], muchas)).faltan).toBe(3);
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

describe("un enlace de varios registros, llenado escaneando", () => {
  test("cada código agrega su registro a la lista del formulario abierto, sin guardar ni repetir", async () => {
    const herr = await call("POST", "/herr-tablas", {
      name: "Herramientas",
      cerrable: false,
      campos: [
        { clave: "nombre", etiqueta: "Nombre", tipo: "texto" },
        { clave: "codigo", etiqueta: "Código", tipo: "codigo", escaner: { formatos: "todos", mostrar: "valor" } },
      ],
    });
    const taladro = await capturar({ tabla_id: herr.data.id, nombre: "Taladro", codigo: "HERR-0001" });
    const pinzas = await capturar({ tabla_id: herr.data.id, nombre: "Pinzas", codigo: "HERR-0002" });
    const r = await call("POST", "/herr-tablas", {
      name: "Préstamos",
      cerrable: false,
      campos: [
        { clave: "quien", etiqueta: "Quién", tipo: "texto" },
        { clave: "herramientas", etiqueta: "Herramientas", tipo: "referencia", multiple: true, tabla_ref_id: herr.data.id, ref_leyenda: "{nombre}" },
      ],
    });
    const prestamos = r.data.id as string;
    const sin = await pagina(`/pages/herramientas.herr-registro?tabla=${prestamos}`);
    expect(nodos(sin, "nox.input-scanner")).toHaveLength(0);
    await call("PATCH", `/herr-tablas/${prestamos}/campos/herramientas/opcion`, { ref_escaner: true });

    const con = await pagina(`/pages/herramientas.herr-registro?tabla=${prestamos}`);
    const [escaner] = nodos(con, "nox.input-scanner");
    expect(escaner!.props).toMatchObject({
      name: "__enlace_herramientas",
      on_scan: { method: "POST", action: "api://herr-registros/escanear-enlace" },
      scanner: { history: false },
    });
    const escanear = (formulario: Record<string, unknown>, codigo: string) =>
      call("POST", "/herr-registros/escanear-enlace", { campo: "__enlace_herramientas", codigo, formulario: { tabla_id: prestamos, ...formulario } });
    const uno = await escanear({ quien: "Ana", herramientas: [] }, "HERR-0001");
    expect(uno.status).toBe(200);
    expect(uno.data.set).toEqual({ herramientas: [taladro.id] });
    const dos = await escanear({ herramientas: [taladro.id] }, "HERR-0002");
    expect(dos.data.set).toEqual({ herramientas: [taladro.id, pinzas.id] });
    const repetido = await escanear({ herramientas: [taladro.id, pinzas.id] }, "HERR-0001");
    expect(repetido.data.set).toEqual({ herramientas: [taladro.id, pinzas.id] });
    expect(String(repetido.json.message)).toContain("ya estaba");
    expect((await escanear({}, "NO-EXISTE")).status).toBe(404);
    // La captura ignora el escáner del enlace.
    const guardado = await call("POST", "/herr-registros/captura", {
      tabla_id: prestamos,
      quien: "Ana",
      herramientas: [taladro.id, pinzas.id],
      __enlace_herramientas: "HERR-0002",
    });
    expect(guardado.status).toBe(201);
    expect(guardado.data.valores.herramientas).toBe(`${taladro.id}|${pinzas.id}`);
  });
});

describe("al escanear un código en «Ver tabla»", () => {
  async function tabla(name: string, campos: unknown[]): Promise<string> {
    const r = await call("POST", "/herr-tablas", { name, cerrable: false, campos });
    expect(r.status).toBe(201);
    return r.data.id;
  }
  const valor_de = (doc: NoxPageDescriptor, name: string) =>
    [...nodos(doc, "nox.input-scanner"), ...nodos(doc, "nox.input-datalist"), ...nodos(doc, "nox.input-text")].find(
      (n) => n.props!.name === name,
    )?.props!.value;
  const avisos = (doc: NoxPageDescriptor) => nodos(doc, "nox.markdown-view").map((n) => String(n.props!.content));

  test("sin configurar no hay escáner y la captura ignora `escaneo`", async () => {
    const id = await tabla("Herramientas", [{ clave: "codigo", etiqueta: "Código", tipo: "codigo" }]);
    const ver = await pagina(`/pages/herramientas.herr-tabla?id=${id}`);
    expect(nodos(ver, "nox.input-scanner")).toEqual([]);
    const nueva = await pagina(`/pages/herramientas.herr-registro?tabla=${id}&escaneo=HERR-1`);
    expect(valor_de(nueva, "codigo")).toBe("");
  });

  test("se configura en Ajustes y «Ver tabla» abre la captura con el código puesto", async () => {
    const id = await tabla("Herramientas", [
      { clave: "nombre", etiqueta: "Nombre", tipo: "texto" },
      { clave: "codigo", etiqueta: "Código", tipo: "codigo" },
      { clave: "foto", etiqueta: "Foto", tipo: "foto" },
    ]);
    const ajustes = await pagina(`/pages/herramientas.herr-tabla?id=${id}&modo=disenar&seccion=ajustes`);
    const columna = nodos(ajustes, "nox.input-menu").find((n) => n.props!.name === "escaneo_columna")!;
    expect((columna.props!.options as { value: string }[]).map((o) => o.value)).toEqual(["nombre", "codigo"]);
    expect(columna.props!.value).toBe("codigo");
    const accion = nodos(ajustes, "nox.input-menu").find((n) => n.props!.name === "escaneo_accion")!;
    expect((accion.props!.options as { value: string }[]).map((o) => o.value)).toEqual(["ninguna", "nuevo", "abrir_o_nuevo", "reglas"]);

    expect((await call("PATCH", `/herr-tablas/${id}/escaneo`, { escaneo_accion: "nuevo", escaneo_columna: "foto" })).status).toBe(400);
    expect((await call("PATCH", `/herr-tablas/${id}/escaneo`, { escaneo_accion: "borrar", escaneo_columna: "codigo" })).status).toBe(400);
    const ok = await call("PATCH", `/herr-tablas/${id}/escaneo`, { escaneo_accion: "nuevo", escaneo_columna: "codigo" });
    expect(ok.status).toBe(200);
    expect((await call("GET", `/herr-tablas/${id}`)).data.escaneo).toEqual({ accion: "nuevo", columna: "codigo" });

    const ver = await pagina(`/pages/herramientas.herr-tabla?id=${id}`);
    const [escaner] = nodos(ver, "nox.input-scanner");
    expect(escaner!.props!.scanner).toEqual({
      actions: [{ kind: "abrir_plantilla", template: `/internal/herr-registro?tabla=${id}&escaneo={valor}`, new_tab: false }],
      history: false,
    });

    const nueva = await pagina(`/pages/herramientas.herr-registro?tabla=${id}&escaneo=${encodeURIComponent("HERR 7")}`);
    expect(valor_de(nueva, "codigo")).toBe("HERR 7");
    expect(nodos(nueva, "nox.input-hidden").some((n) => n.props!.name === "id")).toBe(false);

    // «Nada» lo apaga y quitar la columna también.
    await call("PATCH", `/herr-tablas/${id}/escaneo`, { escaneo_accion: "ninguna" });
    expect((await call("GET", `/herr-tablas/${id}`)).data.escaneo).toBeNull();
    await call("PATCH", `/herr-tablas/${id}/escaneo`, { escaneo_accion: "nuevo", escaneo_columna: "codigo" });
    expect((await call("DELETE", `/herr-tablas/${id}/campos/codigo`)).status).toBe(200);
    expect((await call("GET", `/herr-tablas/${id}`)).data.escaneo).toBeNull();
  });

  test("«abrir o anotar» abre el registro que ya tiene el código", async () => {
    const id = await tabla("Herramientas", [
      { clave: "nombre", etiqueta: "Nombre", tipo: "texto" },
      { clave: "codigo", etiqueta: "Código", tipo: "codigo" },
    ]);
    await call("PATCH", `/herr-tablas/${id}/escaneo`, { escaneo_accion: "abrir_o_nuevo", escaneo_columna: "codigo" });
    const r = await capturar({ tabla_id: id, nombre: "Taladro", codigo: "HERR-0001" });

    const abierta = await pagina(`/pages/herramientas.herr-registro?tabla=${id}&escaneo=herr-0001`);
    expect(nodos(abierta, "nox.input-hidden").find((n) => n.props!.name === "id")?.props!.value).toBe(r.id);
    expect(valor_de(abierta, "nombre")).toBe("Taladro");
    expect(avisos(abierta).some((a) => a.includes("Ya había un registro"))).toBe(true);

    const nueva = await pagina(`/pages/herramientas.herr-registro?tabla=${id}&escaneo=HERR-0002`);
    expect(nodos(nueva, "nox.input-hidden").some((n) => n.props!.name === "id")).toBe(false);
    expect(valor_de(nueva, "codigo")).toBe("HERR-0002");
  });

  test("en un enlace busca y elige el registro de la otra tabla con ese código", async () => {
    const herr = await tabla("Herramientas", [
      { clave: "nombre", etiqueta: "Nombre", tipo: "texto" },
      { clave: "codigo", etiqueta: "Código", tipo: "codigo" },
    ]);
    const taladro = await capturar({ tabla_id: herr, nombre: "Taladro", codigo: "HERR-0001" });
    const sierra = await capturar({ tabla_id: herr, nombre: "Sierra" });
    const prestamos = await tabla("Préstamos", [
      { clave: "quien", etiqueta: "Quién", tipo: "texto" },
      { clave: "herramienta", etiqueta: "Herramienta", tipo: "referencia", tabla_ref_id: herr, ref_leyenda: "{nombre}" },
    ]);
    await call("PATCH", `/herr-tablas/${prestamos}/escaneo`, { escaneo_accion: "abrir_o_nuevo", escaneo_columna: "herramienta" });

    const por_codigo = await pagina(`/pages/herramientas.herr-registro?tabla=${prestamos}&escaneo=HERR-0001`);
    expect(valor_de(por_codigo, "herramienta")).toBe(taladro.id);
    // Sin columna «Código» que coincida, vale el texto del registro.
    const por_nombre = await pagina(`/pages/herramientas.herr-registro?tabla=${prestamos}&escaneo=sierra`);
    expect(valor_de(por_nombre, "herramienta")).toBe(sierra.id);

    const nada = await pagina(`/pages/herramientas.herr-registro?tabla=${prestamos}&escaneo=NO-EXISTE`);
    expect(valor_de(nada, "herramienta")).toBe("");
    expect(avisos(nada).some((a) => a.includes("Ningún registro de «Herramientas»"))).toBe(true);

    // Con un préstamo ya anotado de esa herramienta, se abre ese.
    const prestamo = await capturar({ tabla_id: prestamos, quien: "Ana", herramienta: taladro.id });
    const abierta = await pagina(`/pages/herramientas.herr-registro?tabla=${prestamos}&escaneo=HERR-0001`);
    expect(nodos(abierta, "nox.input-hidden").find((n) => n.props!.name === "id")?.props!.value).toBe(prestamo.id);
  });
});

describe("reglas al escanear", () => {
  async function tabla(name: string, campos: unknown[]): Promise<string> {
    const r = await call("POST", "/herr-tablas", { name, cerrable: false, campos });
    expect(r.status).toBe(201);
    return r.data.id;
  }
  async function regla(tabla_id: string, body: Record<string, unknown>) {
    const r = await call("POST", `/herr-tablas/${tabla_id}/reglas`, body);
    expect(r.status).toBe(200);
  }
  const escanear = (tabla_id: string, codigo: string, id?: string) => call("POST", "/herr-registros/escanear", { tabla_id, codigo, id });
  const valores = async (id: string) => (await call("GET", `/herr-registros/${id}`)).data.valores as Record<string, string>;

  test("borrar una columna o una tabla quita las reglas que la usaban (de esa tabla y de las demás)", async () => {
    const prod = await tabla("Productos", [
      { clave: "codigo", etiqueta: "Código", tipo: "codigo" },
      { clave: "piezas", etiqueta: "Piezas por caja", tipo: "entero" },
    ]);
    const inv = await tabla("Inventario", [
      { clave: "nota", etiqueta: "Nota", tipo: "texto" },
      { clave: "botellas", etiqueta: "Botellas", tipo: "entero" },
    ]);
    const mov = await tabla("Movimientos", [
      { clave: "quien", etiqueta: "Quién", tipo: "texto" },
      { clave: "cuenta", etiqueta: "Cuenta", tipo: "entero" },
      { clave: "inventario", etiqueta: "Inventario", tipo: "referencia", tabla_ref_id: inv, ref_leyenda: "{nota}" },
    ]);
    const base = { accion: "sumar", cantidad: "1" };
    await regla(mov, { ...base, nombre: "Cajas", tabla_origen: prod, destino: "padre", enlace: "inventario", cantidad_de: `${prod}.piezas`, columna: `${inv}.botellas` });
    await regla(mov, { ...base, nombre: "Contar", destino: "actual", columna: `${mov}.cuenta` });
    await regla(mov, { ...base, nombre: "Nuevo", destino: "nuevo", tabla_destino: inv, columna: `${inv}.botellas` });
    const nombres = async () => ((await call("GET", `/herr-tablas/${mov}`)).data.reglas ?? []).map((r: { nombre: string }) => r.nombre);
    expect(await nombres()).toEqual(["Cajas", "Contar", "Nuevo"]);

    const piezas = await call("DELETE", `/herr-tablas/${prod}/campos/piezas`);
    expect(piezas.status).toBe(200);
    expect(String(piezas.json.message)).toContain("se quitó 1 regla");
    expect(await nombres()).toEqual(["Contar", "Nuevo"]);

    const cuenta = await call("DELETE", `/herr-tablas/${mov}/campos/cuenta`);
    expect(String(cuenta.json.message)).toContain("se quitó 1 regla");
    expect(await nombres()).toEqual(["Nuevo"]);

    expect((await call("DELETE", `/herr-tablas/${inv}`)).status).toBeLessThan(300);
    expect(await nombres()).toEqual([]);
  });

  test("12 botellas por caja en un registro nuevo de la tabla padre, enlazado al abierto", async () => {
    const prod = await tabla("Productos", [
      { clave: "nombre", etiqueta: "Nombre", tipo: "texto" },
      { clave: "codigo", etiqueta: "Código", tipo: "codigo" },
      { clave: "piezas", etiqueta: "Piezas por caja", tipo: "entero" },
    ]);
    await capturar({ tabla_id: prod, nombre: "Agua", codigo: "CAJA-AGUA", piezas: "12" });
    const inv = await tabla("Inventario", [
      { clave: "nota", etiqueta: "Nota", tipo: "texto" },
      { clave: "botellas", etiqueta: "Botellas", tipo: "entero" },
    ]);
    const mov = await tabla("Movimientos", [
      { clave: "quien", etiqueta: "Quién", tipo: "texto" },
      { clave: "inventario", etiqueta: "Inventario", tipo: "referencia", tabla_ref_id: inv, ref_leyenda: "{nota}" },
    ]);
    await regla(mov, {
      nombre: "Cajas",
      tabla_origen: prod,
      destino: "nuevo_padre",
      enlace: "inventario",
      accion: "sumar",
      cantidad: "1",
      cantidad_de: `${prod}.piezas`,
      columna: `${inv}.botellas`,
    });
    const abierto = await capturar({ tabla_id: mov, quien: "Ana" });

    // El escáner de reglas va dentro del formulario de captura y no lo envía: `on_scan` consulta sin recargar.
    const doc = await pagina(`/pages/herramientas.herr-registro?tabla=${mov}&id=${abierto.id}`);
    const captura = nodos(doc, "nox.form").find((f) => f.props!.action === "api://herr-registros/captura")!;
    const escaner = (captura.children ?? []).find((n) => n.props?.name === "__reglas")!;
    expect(escaner.component).toBe("nox.input-scanner");
    expect(escaner.props!.on_scan).toEqual({ method: "POST", action: "api://herr-registros/escanear" });
    expect(escaner.props!.scanner).toEqual({ history: true, history_scope: `herr-registro:${abierto.id}:reglas` });
    // Guardar con el escáner en el formulario no se queja de «__reglas».
    expect((await call("POST", "/herr-registros/captura", { tabla_id: mov, id: abierto.id, quien: "Ana", __reglas: "X" })).status).toBe(200);

    const r = await escanear(mov, "caja-agua", abierto.id);
    expect(r.status).toBe(200);
    expect(String(r.json.message)).toContain("+12 Botellas en registro nuevo de «Inventario»");
    const padre_id = (await valores(abierto.id)).inventario!;
    expect(padre_id).toBeTruthy();
    expect((await valores(padre_id)).botellas).toBe("12");
    expect((await valores(abierto.id)).quien).toBe("Ana");

    // Un código que no es de Productos no aplica la regla.
    expect((await escanear(mov, "OTRA-COSA", abierto.id)).status).toBe(404);
  });

  test("con el formulario: lo del registro abierto vuelve en `set` sin guardarse y no pisa lo no guardado", async () => {
    const ped = await tabla("Pedidos", [
      { clave: "folio", etiqueta: "Folio", tipo: "texto" },
      { clave: "total", etiqueta: "Total", tipo: "entero" },
    ]);
    const lin = await tabla("Líneas", [
      { clave: "nota", etiqueta: "Nota", tipo: "texto" },
      { clave: "pedido", etiqueta: "Pedido", tipo: "referencia", tabla_ref_id: ped, ref_leyenda: "{folio}" },
      { clave: "cajas", etiqueta: "Cajas", tipo: "entero" },
    ]);
    await regla(lin, { nombre: "Caja", destino: "actual", accion: "sumar", cantidad: "1", columna: `${lin}.cajas` });
    await regla(lin, { nombre: "Total", destino: "padre", enlace: "pedido", accion: "sumar", cantidad: "12", columna: `${ped}.total` });
    await regla(lin, { nombre: "Nuevo pedido", codigo: "NUEVO", destino: "nuevo_padre", enlace: "pedido", accion: "poner", cantidad: "1", columna: `${ped}.total` });
    const pedido = await capturar({ tabla_id: ped, folio: "P-1" });
    const linea = await capturar({ tabla_id: lin, nota: "guardada", cajas: "3" });

    // En pantalla: nota cambiada, pedido elegido y 5 cajas, nada guardado aún.
    const formulario = { tabla_id: lin, id: linea.id, nota: "sin guardar", pedido: pedido.id, cajas: 5, __reglas: "CAJA" };
    const r = await call("POST", "/herr-registros/escanear", { formulario, codigo: "CAJA" });
    expect(r.status).toBe(200);
    expect(r.data.set).toEqual({ cajas: 6 });
    expect(await valores(linea.id)).toMatchObject({ nota: "guardada", cajas: "3" });
    expect((await valores(pedido.id)).total).toBe("12");

    // Un registro nuevo (sin id) también: el padre nuevo vuelve como enlace en `set`.
    const nuevo = await call("POST", "/herr-registros/escanear", { formulario: { tabla_id: lin, nota: "a medias" }, codigo: "NUEVO" });
    expect(nuevo.status).toBe(200);
    expect(nuevo.data.set.cajas).toBe(1);
    expect(await valores(String(nuevo.data.set.pedido))).toMatchObject({ total: "1" });
    expect(String(nuevo.json.message)).toContain("No se aplicó Total");
  });

  test("el registro abierto y su padre; el patrón; sin registro abierto no se aplican", async () => {
    const ped = await tabla("Pedidos", [
      { clave: "folio", etiqueta: "Folio", tipo: "texto" },
      { clave: "total", etiqueta: "Total", tipo: "entero" },
    ]);
    const lin = await tabla("Líneas", [
      { clave: "pedido", etiqueta: "Pedido", tipo: "referencia", tabla_ref_id: ped, ref_leyenda: "{folio}" },
      { clave: "cajas", etiqueta: "Cajas", tipo: "entero" },
    ]);
    await regla(lin, { nombre: "Caja", codigo: "CAJA-*", destino: "actual", accion: "sumar", cantidad: "1", columna: `${lin}.cajas` });
    await regla(lin, { nombre: "Botellas", codigo: "CAJA-*", destino: "padre", enlace: "pedido", accion: "sumar", cantidad: "12", columna: `${ped}.total` });
    const pedido = await capturar({ tabla_id: ped, folio: "P-1" });
    const linea = await capturar({ tabla_id: lin, pedido: pedido.id });

    expect((await escanear(lin, "CAJA-9", linea.id)).status).toBe(200);
    expect((await escanear(lin, "CAJA-9", linea.id)).status).toBe(200);
    expect((await valores(linea.id)).cajas).toBe("2");
    expect((await valores(pedido.id)).total).toBe("24");
    expect((await escanear(lin, "BOTELLA", linea.id)).status).toBe(404);
    const sin = await escanear(lin, "CAJA-9");
    expect(sin.status).toBe(409);
    expect(String(sin.json.message ?? JSON.stringify(sin.json))).toContain("abre un registro");

    // Quitar una regla.
    const spec = (await call("GET", `/herr-tablas/${lin}`)).data;
    const [primera] = spec.reglas as { id: string }[];
    expect((await call("DELETE", `/herr-tablas/${lin}/reglas/${primera!.id}`)).status).toBe(200);
    expect(((await call("GET", `/herr-tablas/${lin}`)).data.reglas as unknown[]).length).toBe(1);
  });

  test("desde «Ver tabla»: el registro de otra tabla con ese código, o uno nuevo", async () => {
    const prod = await tabla("Productos", [
      { clave: "nombre", etiqueta: "Nombre", tipo: "texto" },
      { clave: "codigo", etiqueta: "Código", tipo: "codigo" },
    ]);
    const agua = await capturar({ tabla_id: prod, nombre: "Agua", codigo: "AGUA" });
    const stock = await tabla("Existencias", [
      { clave: "producto", etiqueta: "Producto", tipo: "referencia", tabla_ref_id: prod, ref_leyenda: "{nombre}" },
      { clave: "cantidad", etiqueta: "Cantidad", tipo: "entero" },
    ]);
    const entradas = await tabla("Entradas", [{ clave: "nota", etiqueta: "Nota", tipo: "texto" }]);
    expect(
      (await call("POST", `/herr-tablas/${entradas}/reglas`, { destino: "existente_o_nuevo", tabla_destino: stock, cantidad: "5", columna: `${stock}.cantidad` }))
        .status,
    ).toBe(400);
    await regla(entradas, {
      tabla_origen: prod,
      destino: "existente_o_nuevo",
      tabla_destino: stock,
      accion: "sumar",
      cantidad: "5",
      columna: `${stock}.cantidad`,
      columna_codigo: `${stock}.producto`,
    });
    await call("PATCH", `/herr-tablas/${entradas}/escaneo`, { escaneo_accion: "reglas" });
    const ver = await pagina(`/pages/herramientas.herr-tabla?id=${entradas}`);
    expect(nodos(ver, "nox.form").some((f) => f.props!.action === "api://herr-registros/escanear")).toBe(true);
    const diseno = await pagina(`/pages/herramientas.herr-tabla?id=${entradas}&modo=disenar&seccion=reglas`);
    expect(nodos(diseno, "nox.markdown-view").some((n) => String(n.props!.content).includes("«Existencias» con ese código"))).toBe(true);

    expect((await escanear(entradas, "AGUA")).status).toBe(200);
    expect((await escanear(entradas, "agua")).status).toBe(200);
    const filas = (await call("GET", `/herr-registros?tabla_id=${stock}`)).data as { valores: Record<string, string> }[];
    expect(filas.length).toBe(1);
    expect(filas[0]!.valores).toMatchObject({ producto: agua.id, cantidad: "10" });
  });
});
