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
import { POR_PAGINA } from "./herr-tablas.flow.ts";
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

const filas_de = (doc: NoxPageDescriptor) => nodos(doc, "nox.table")[0]!.props!.rows as Record<string, unknown>[];

/** Productos con su existencia en la unidad de cada uno, y una bitácora que los usa. */
async function productos_y_bitacora() {
  const productos = await crear_tabla({
    name: "Productos",
    cerrable: false,
    campos: [
      { clave: "nombre", etiqueta: "Nombre", tipo: "texto", en_resumen: true },
      { clave: "existencia", etiqueta: "Existencia", tipo: "numero", unidad: "piezas", unidad_por_registro: true, en_resumen: true },
      { clave: "foto", etiqueta: "Foto", tipo: "foto" },
    ],
  });
  const bitacora = await crear_tabla({
    name: "Bitácora",
    campos: [
      { clave: "producto", etiqueta: "Producto", tipo: "referencia", tabla_ref_id: productos, ref_leyenda: "{nombre}", en_resumen: true },
      { clave: "cantidad", etiqueta: "Cantidad", tipo: "numero", decimales: 1, unidad_de: "producto:existencia", en_resumen: true },
    ],
  });
  const harina = await capturar({ tabla_id: productos, nombre: "Harina", existencia: 20, "existencia@unidad": "kg", foto: PNG });
  const leche = await capturar({ tabla_id: productos, nombre: "Leche", existencia: 12, "existencia@unidad": "L" });
  const tornillo = await capturar({ tabla_id: productos, nombre: "Tornillo", existencia: 300 });
  return { productos, bitacora, harina, leche, tornillo };
}

describe("unidad de cada registro", () => {
  test("se escribe al capturar, se propone la de la columna y la lista la enseña", async () => {
    const { productos, harina, tornillo } = await productos_y_bitacora();
    expect(harina.unidades).toEqual({ existencia: "kg" });
    expect(tornillo.unidades).toEqual({});

    const lista = await pagina(`/pages/herramientas.herr-tabla?id=${productos}`);
    expect(filas_de(lista).map((f) => [f.nombre, f.existencia])).toContainAllValues([
      ["Harina", "20.00 kg"],
      ["Leche", "12.00 L"],
      ["Tornillo", "300.00 piezas"],
    ]);

    const nuevo = await pagina(`/pages/herramientas.herr-registro?tabla=${productos}`);
    const [form] = nodos(nuevo, "nox.form");
    const nombres = form!.children!.map((c) => c.props?.name);
    expect(nombres.indexOf("existencia@unidad")).toBe(nombres.indexOf("existencia") + 1);
    const unidad = form!.children!.find((c) => c.props?.name === "existencia@unidad")!;
    expect(unidad.props).toMatchObject({ value: "piezas", help: "Ya usadas: kg, L." });
    expect(form!.children!.find((c) => c.props?.name === "existencia")!.props!.label).toBe("Existencia");

    const editar = await pagina(`/pages/herramientas.herr-registro?tabla=${productos}&id=${harina.id}`);
    expect(nodos(editar, "nox.input-text").find((c) => c.props!.name === "existencia@unidad")!.props!.value).toBe("kg");
  });

  test("editar por el CRUD sin unidades conserva las que había; el historial cuenta el cambio", async () => {
    const { productos, harina } = await productos_y_bitacora();
    const crud = await call("PATCH", `/herr-registros/${harina.id}`, { valores: { ...harina.valores, existencia: "25" } });
    expect(crud.data.unidades).toEqual({ existencia: "kg" });

    await capturar({ tabla_id: productos, id: harina.id, nombre: "Harina", existencia: 25, "existencia@unidad": "costales" });
    const historial = await pagina(`/pages/herramientas.herr-registro?tabla=${productos}&id=${harina.id}&modo=historial`);
    const [timeline] = nodos(historial, "nox.timeline");
    const items = timeline!.props!.items as { title: string; description: string }[];
    expect(items[0]!.description).toContain("Unidad de Existencia: kg → costales");
    expect(items[1]!.description).toBe("Existencia: 20.00 kg → 25.00 kg");
    expect(items.at(-1)!.description).toContain("Existencia: 20.00 kg");
  });

  test("en otra tabla la cantidad sale en la unidad del producto elegido, y se congela al cerrar", async () => {
    const { bitacora, harina, leche, tornillo } = await productos_y_bitacora();
    for (const [p, c] of [[harina, 3], [leche, 2.5], [tornillo, 40]] as const) {
      await capturar({ tabla_id: bitacora, producto: p.id, cantidad: c });
    }
    const lista = await pagina(`/pages/herramientas.herr-tabla?id=${bitacora}`);
    const vistas = filas_de(lista).map((f) => `${f.producto}: ${f.cantidad}`);
    expect(vistas).toContainAllValues(["Harina: 3.0 kg", "Leche: 2.5 L", "Tornillo: 40.0 piezas"]);
    const form = await pagina(`/pages/herramientas.herr-registro?tabla=${bitacora}`);
    expect(nodos(form, "nox.input-number")[0]!.props!.label).toBe("Cantidad");

    expect((await call("POST", `/herr-tablas/${bitacora}/cerrar`, { nombre: "Octubre" })).status).toBe(200);
    // Después de cerrar, la harina pasa a costales: el cierre sigue en kg.
    await capturar({ tabla_id: (harina as { tabla_id: string }).tabla_id, id: harina.id, nombre: "Harina", existencia: 20, "existencia@unidad": "costales" });
    const cierres = await pagina(`/pages/herramientas.herr-tabla?id=${bitacora}&modo=cierres`);
    const href = String(filas_de(cierres)[0]!._href);
    const cierre = await pagina(`/pages/${href.replace("/internal/herr-tabla", "herramientas.herr-tabla")}`);
    expect(filas_de(cierre).map((f) => `${f.producto}: ${f.cantidad}`)).toContainAllValues([
      "Harina: 3.0 kg",
      "Leche: 2.5 L",
      "Tornillo: 40.0 piezas",
    ]);
    // Ni pasar la cantidad a unidad fija cambia lo que se congeló.
    await call("PATCH", `/herr-tablas/${bitacora}/campos/cantidad`, { unidad_fuente: "fija", unidad: "u" });
    const igual = await pagina(`/pages/${href.replace("/internal/herr-tabla", "herramientas.herr-tabla")}`);
    expect(filas_de(igual).map((f) => f.cantidad)).toContainAllValues(["3.0 kg", "2.5 L", "40.0 piezas"]);
  });

  test("Ver tabla encuentra por la unidad que se ve y por «sí»", async () => {
    const { bitacora, harina, leche } = await productos_y_bitacora();
    await call("POST", `/herr-tablas/${bitacora}/campos`, { etiqueta: "¿Pagado?", tipo: "booleano" });
    await capturar({ tabla_id: bitacora, producto: harina.id, cantidad: 3, pagado: true });
    await capturar({ tabla_id: bitacora, producto: leche.id, cantidad: 2, pagado: false });
    const por_unidad = await pagina(`/pages/herramientas.herr-tabla?id=${bitacora}&q=kg`);
    expect(filas_de(por_unidad).map((f) => f.producto)).toEqual(["Harina"]);
    const pagados = await pagina(`/pages/herramientas.herr-tabla?id=${bitacora}&q=si`);
    expect(filas_de(pagados).map((f) => f.producto)).toEqual(["Harina"]);
    const por_id = await pagina(`/pages/herramientas.herr-tabla?id=${bitacora}&q=registro`);
    expect(filas_de(por_id)).toHaveLength(0);
  });

  test("también sale de una columna de texto del producto, y sin producto queda la de la columna", async () => {
    const insumos = await crear_tabla({
      name: "Insumos",
      cerrable: false,
      campos: [
        { clave: "nombre", etiqueta: "Nombre", tipo: "texto", en_resumen: true },
        { clave: "unidad", etiqueta: "Unidad", tipo: "texto" },
      ],
    });
    const gas = await capturar({ tabla_id: insumos, nombre: "Gas", unidad: "m³" });
    const uso = await crear_tabla({
      name: "Uso",
      campos: [
        { clave: "insumo", etiqueta: "Insumo", tipo: "referencia", tabla_ref_id: insumos, en_resumen: true },
        { clave: "consumo", etiqueta: "Consumo", tipo: "entero", unidad: "u", unidad_de: "insumo:unidad", en_resumen: true },
      ],
    });
    await capturar({ tabla_id: uso, insumo: gas.id, consumo: 7 });
    await capturar({ tabla_id: uso, consumo: 2 });
    const lista = await pagina(`/pages/herramientas.herr-tabla?id=${uso}`);
    expect(filas_de(lista).map((f) => f.consumo)).toContainAllValues(["7 m³", "2 u"]);
  });

  test("el diseñador elige de dónde sale la unidad y no deja quitar el enlace del que sale", async () => {
    const { bitacora } = await productos_y_bitacora();
    const campo = await pagina(`/pages/herramientas.herr-tabla?id=${bitacora}&modo=campo&campo=cantidad`);
    const fuente = nodos(campo, "nox.input-menu").find((m) => m.props!.name === "unidad_fuente")!;
    expect(fuente.props!.value).toBe("enlace:producto:existencia");
    const valores = (fuente.props!.options as { value: string }[]).map((o) => o.value);
    expect(valores).toEqual(["fija", "registro", "enlace:producto:nombre", "enlace:producto:existencia"]);

    const a_registro = await call("PATCH", `/herr-tablas/${bitacora}/campos/cantidad`, { unidad_fuente: "registro", unidad: "g" });
    expect(a_registro.status).toBe(200);
    let spec = (await call("GET", `/herr-tablas/${bitacora}`)).data;
    expect(spec.campos[1]).toMatchObject({ unidad_por_registro: true, unidad_de: null, unidad: "g" });

    const total = await call("POST", `/herr-tablas/${bitacora}/resumenes`, { tipo: "suma", campo: "cantidad" });
    expect(total.status).toBe(200);
    spec = (await call("GET", `/herr-tablas/${bitacora}`)).data;
    expect(spec.resumenes.at(-1)).toMatchObject({ formula: "{suma:cantidad}", unidad: null });

    expect((await call("PATCH", `/herr-tablas/${bitacora}/campos/cantidad`, { unidad_fuente: "enlace:producto:no_existe" })).status).toBe(400);
    await call("PATCH", `/herr-tablas/${bitacora}/campos/cantidad`, { unidad_fuente: "enlace:producto:existencia" });
    const quitar = await call("DELETE", `/herr-tablas/${bitacora}/campos/producto`);
    expect(quitar.status).toBe(409);
    expect(JSON.stringify(quitar.json)).toContain("Cantidad");

    // Cambiar el enlace a otra tabla deja la cantidad con su unidad fija.
    const otra = await crear_tabla({ name: "Otra", cerrable: false, campos: [{ clave: "x", etiqueta: "X", tipo: "texto" }] });
    expect((await call("PATCH", `/herr-tablas/${bitacora}/campos/producto`, { enlace: otra })).status).toBe(200);
    spec = (await call("GET", `/herr-tablas/${bitacora}`)).data;
    expect(spec.campos.find((c: { clave: string }) => c.clave === "cantidad").unidad_de).toBeNull();
  });

  test("pasar un rato la columna a unidad fija no borra la de cada registro al editarlo", async () => {
    const { productos, harina } = await productos_y_bitacora();
    await call("PATCH", `/herr-tablas/${productos}/campos/existencia`, { unidad_fuente: "fija" });
    const editado = await call("PATCH", `/herr-registros/${harina.id}`, { valores: { ...harina.valores, nombre: "Harina fina" } });
    expect(editado.data.unidades).toEqual({ existencia: "kg" });
    await capturar({ tabla_id: productos, id: harina.id, nombre: "Harina fina", existencia: 20 });
    await call("PATCH", `/herr-tablas/${productos}/campos/existencia`, { unidad_fuente: "registro" });
    const lista = await pagina(`/pages/herramientas.herr-tabla?id=${productos}`);
    expect(filas_de(lista).find((f) => f.nombre === "Harina fina")!.existencia).toBe("20.00 kg");
  });

  test("un total que ya existía pierde su unidad cuando la columna pasa a unidad variable", async () => {
    const { productos } = await productos_y_bitacora();
    await call("PATCH", `/herr-tablas/${productos}/campos/existencia`, { unidad_fuente: "fija" });
    await call("POST", `/herr-tablas/${productos}/resumenes`, { tipo: "suma", campo: "existencia" });
    let spec = (await call("GET", `/herr-tablas/${productos}`)).data;
    expect(spec.resumenes.at(-1).unidad).toBe("piezas");
    await call("PATCH", `/herr-tablas/${productos}/campos/existencia`, { unidad_fuente: "registro" });
    spec = (await call("GET", `/herr-tablas/${productos}`)).data;
    expect(spec.resumenes.at(-1).unidad).toBeNull();
    const [stats] = nodos(await pagina(`/pages/herramientas.herr-tabla?id=${productos}`), "nox.stats");
    expect((stats!.props!.items as { value: string }[]).at(-1)!.value).toBe("332.00");
  });
});

describe("varias fotos", () => {
  async function galeria(): Promise<string> {
    return crear_tabla({
      name: "Galería",
      cerrable: false,
      campos: [
        { clave: "nombre", etiqueta: "Nombre", tipo: "texto", en_resumen: true },
        { clave: "fotos", etiqueta: "Fotos", tipo: "fotos", en_resumen: true },
      ],
    });
  }

  test("se guardan todas con sus miniaturas; editar conserva las que vuelven y sube solo las nuevas", async () => {
    const tabla = await galeria();
    const r = await capturar({ tabla_id: tabla, nombre: "Cava", fotos: [PNG, PNG_2] });
    const urls = String(r.valores.fotos).split("|");
    expect(urls).toHaveLength(2);
    expect(urls.every((u) => u.startsWith("/api/media/"))).toBe(true);
    expect(r.miniaturas.fotos).toBe("data:image/jpeg;base64,MINI1|data:image/jpeg;base64,MINI2");

    const form = await pagina(`/pages/herramientas.herr-registro?tabla=${tabla}&id=${r.id}`);
    const input = nodos(form, "nox.input-image")[0]!;
    expect(input.props).toMatchObject({ multiple: true, image_selection_limit: 10 });
    expect(input.props!.value).toEqual(["data:image/jpeg;base64,MINI1", "data:image/jpeg;base64,MINI2"]);

    // Quita la primera, deja la segunda como volvió del formulario y agrega una nueva.
    const editado = await capturar({ tabla_id: tabla, id: r.id, nombre: "Cava", fotos: ["data:image/jpeg;base64,MINI2", PNG] });
    expect(String(editado.valores.fotos).split("|")).toEqual([urls[1], expect.stringMatching(/^\/api\/media\//)]);
    expect(editado.miniaturas.fotos).toBe("data:image/jpeg;base64,MINI2|data:image/jpeg;base64,MINI3");
    expect(subidas).toBe(3);

    const once = Array.from({ length: 11 }, () => PNG);
    expect((await call("POST", "/herr-registros/captura", { tabla_id: tabla, nombre: "x", fotos: once })).status).toBe(400);
  });

  test("Ver tabla pinta la primera y abre todas; Registros enseña la primera", async () => {
    const tabla = await galeria();
    const r = await capturar({ tabla_id: tabla, nombre: "Cava", fotos: [PNG, PNG_2] });
    const lista = await pagina(`/pages/herramientas.herr-tabla?id=${tabla}`);
    const [fila] = filas_de(lista);
    expect(fila).toMatchObject({
      nombre: "Cava",
      fotos: "2 fotos",
      fotos__mini: "data:image/jpeg;base64,MINI1",
      fotos__url: String(r.valores.fotos).split("|"),
    });
    const registros = await call("GET", `/herr-registros?tabla_id=${tabla}`);
    expect(registros.data[0].foto).toBe("data:image/jpeg;base64,MINI1");
  });
});

describe("cambiar el tipo de una columna de fotos", () => {
  test("de varias a una: la lista y el formulario usan la primera y guardar no vuelve a subir", async () => {
    const tabla = await crear_tabla({
      name: "Galería",
      cerrable: false,
      campos: [
        { clave: "nombre", etiqueta: "Nombre", tipo: "texto", en_resumen: true },
        { clave: "fotos", etiqueta: "Fotos", tipo: "fotos", en_resumen: true },
      ],
    });
    const r = await capturar({ tabla_id: tabla, nombre: "Cava", fotos: [PNG, PNG_2] });
    const [primera] = String(r.valores.fotos).split("|");
    expect((await call("PATCH", `/herr-tablas/${tabla}/campos/fotos`, { tipo: "foto" })).status).toBe(200);
    const lista = await pagina(`/pages/herramientas.herr-tabla?id=${tabla}`);
    expect(filas_de(lista)[0]).toMatchObject({ fotos: "Foto", fotos__mini: "data:image/jpeg;base64,MINI1", fotos__url: primera });
    const form = await pagina(`/pages/herramientas.herr-registro?tabla=${tabla}&id=${r.id}`);
    expect(nodos(form, "nox.input-image")[0]!.props!.value).toBe("data:image/jpeg;base64,MINI1");
    const igual = await capturar({ tabla_id: tabla, id: r.id, nombre: "Cava", fotos: "data:image/jpeg;base64,MINI1" });
    expect(igual.valores.fotos).toBe(primera);
    expect(subidas).toBe(2);
  });
});

describe("fotos de lo enlazado", () => {
  test("se eligen en el diseñador, acompañan la opción y se ven en la lista y al imprimir", async () => {
    const { bitacora, harina, leche } = await productos_y_bitacora();
    await capturar({ tabla_id: bitacora, producto: harina.id, cantidad: 1 });
    await capturar({ tabla_id: bitacora, producto: leche.id, cantidad: 2 });

    const form = await pagina(`/pages/herramientas.herr-registro?tabla=${bitacora}`);
    const opciones = nodos(form, "nox.input-datalist")[0]!.props!.options as { label: string; image?: string }[];
    expect(opciones.find((o) => o.label === "Harina")!.image).toBe("data:image/jpeg;base64,MINI1");

    let lista = await pagina(`/pages/herramientas.herr-tabla?id=${bitacora}`);
    expect((nodos(lista, "nox.table")[0]!.props!.columns as { key: string }[]).map((c) => c.key)).toEqual(["producto", "cantidad"]);

    const disenio = await pagina(`/pages/herramientas.herr-tabla?id=${bitacora}&modo=campo&campo=producto`);
    const menu = nodos(disenio, "nox.input-menu").find((m) => m.props!.name === "ref_foto")!;
    expect((menu.props!.options as { value: string }[]).map((o) => o.value)).toEqual(["(primera)", "foto", "-"]);
    expect(
      (await call("PATCH", `/herr-tablas/${bitacora}/campos/producto/opcion`, { ref_foto: "foto", ref_foto_en_tabla: true })).status,
    ).toBe(200);

    lista = await pagina(`/pages/herramientas.herr-tabla?id=${bitacora}`);
    expect(nodos(lista, "nox.table")[0]!.props!.columns).toContainEqual({
      key: "producto@foto",
      label: "Foto · Producto",
      image_key: "producto@foto__mini",
      image_full_key: "producto@foto__url",
    });
    const harina_fila = filas_de(lista).find((f) => f.producto === "Harina")!;
    expect(harina_fila).toMatchObject({ "producto@foto": "1 foto", "producto@foto__mini": "data:image/jpeg;base64,MINI1" });
    expect(filas_de(lista).find((f) => f.producto === "Leche")!["producto@foto__mini"]).toBeUndefined();

    const imprimir = await call("POST", `/herr-tablas/${bitacora}/imprimir`, { formato: "pdf", q: "" });
    const impreso = await pagina(`/pages/herramientas.herr-tabla?id=${bitacora}&modo=impreso&t=${imprimir.data.t}`);
    expect(String(nodos(impreso, "nox.markdown-view")[0]!.props!.content)).toStartWith("**2 registros**");

    // Imprimir sin fotos quita la de lo enlazado: menos imágenes en la hoja.
    const hojas = async (fotos: boolean) => {
      const r = await call("POST", `/herr-tablas/${bitacora}/imprimir`, { formato: "png", q: "", fotos });
      const doc = await pagina(`/pages/herramientas.herr-tabla?id=${bitacora}&modo=impreso&t=${r.data.t}`);
      return (nodos(doc, "nox.image-viewer")[0]!.props!.images as string[])[0]!;
    };
    expect(await hojas(true)).not.toBe(await hojas(false));

    expect((await call("PATCH", `/herr-tablas/${bitacora}/campos/producto/opcion`, { ref_foto: "-" })).status).toBe(200);
    const sin = await pagina(`/pages/herramientas.herr-registro?tabla=${bitacora}`);
    expect((nodos(sin, "nox.input-datalist")[0]!.props!.options as { image?: string }[]).some((o) => o.image)).toBe(false);
    expect((await call("PATCH", `/herr-tablas/${bitacora}/campos/producto/opcion`, { ref_foto: "nombre" })).status).toBe(400);

    await call("PATCH", `/herr-tablas/${bitacora}/campos/producto/opcion`, { ref_foto: "foto" });
    const insumos = await crear_tabla({ name: "Insumos", cerrable: false, campos: [{ clave: "imagen", etiqueta: "Imagen", tipo: "foto" }] });
    expect((await call("PATCH", `/herr-tablas/${bitacora}/campos/producto`, { enlace: insumos })).status).toBe(200);
    const spec = (await call("GET", `/herr-tablas/${bitacora}`)).data;
    expect(spec.campos.find((c: { clave: string }) => c.clave === "producto").ref_foto).toBeNull();
  });

  test("la opción solo lleva una miniatura en línea; la elegida que ya no existe cae a la primera", async () => {
    const { bitacora, productos, harina } = await productos_y_bitacora();
    // Harina sin miniatura guardada: la opción no debe llevar la URL de /api/media.
    await server.data.update("herr_registros", { id: harina.id }, { miniaturas: {} });
    let form = await pagina(`/pages/herramientas.herr-registro?tabla=${bitacora}`);
    let opciones = nodos(form, "nox.input-datalist")[0]!.props!.options as { label: string; image?: string }[];
    expect(opciones.find((o) => o.label === "Harina")!.image).toBeUndefined();

    await call("PATCH", `/herr-tablas/${bitacora}/campos/producto/opcion`, { ref_foto: "foto" });
    await call("PATCH", `/herr-tablas/${productos}/campos/foto`, { etiqueta: "Imagen" });
    await call("POST", `/herr-tablas/${productos}/campos`, { etiqueta: "Galería", tipo: "fotos" });
    await call("DELETE", `/herr-tablas/${productos}/campos/foto`);
    const leche = (await call("GET", `/herr-registros?tabla_id=${productos}`)).data.find((r: { name: string }) => r.name === "Leche");
    await capturar({ tabla_id: productos, id: leche.id, nombre: "Leche", existencia: 12, "existencia@unidad": "L", galeria: [PNG] });
    form = await pagina(`/pages/herramientas.herr-registro?tabla=${bitacora}`);
    opciones = nodos(form, "nox.input-datalist")[0]!.props!.options as { label: string; image?: string }[];
    expect(opciones.find((o) => o.label === "Leche")!.image).toStartWith("data:image/jpeg");
  });
});

describe("buscar y paginar registros", () => {
  test("Ver tabla y un cierre buscan con el índice y paginan de 50 en 50", async () => {
    const tabla = await crear_tabla({
      name: "Ventas",
      campos: [
        { clave: "cliente", etiqueta: "Cliente", tipo: "texto", en_resumen: true },
        { clave: "n", etiqueta: "N", tipo: "entero", en_resumen: true },
      ],
    });
    for (let i = 1; i <= 120; i++) {
      await capturar({ tabla_id: tabla, cliente: i % 10 === 0 ? `Mostrador ${i}` : `Cliente ${i}`, n: i });
    }
    const base = `/pages/herramientas.herr-tabla?id=${tabla}`;
    const primera = await pagina(base);
    expect(filas_de(primera)).toHaveLength(POR_PAGINA);
    expect(nodos(primera, "nox.search")[0]!.props).toMatchObject({ value: "" });
    expect(nodos(primera, "nox.paginator")[0]!.props).toEqual({ total: 120, page_size: POR_PAGINA, page: 1 });

    const tercera = await pagina(`${base}&page=3`);
    expect(filas_de(tercera)).toHaveLength(20);
    expect(nodos(tercera, "nox.paginator")[0]!.props!.page).toBe(3);
    expect(filas_de(await pagina(`${base}&page=99`))).toHaveLength(20);

    const busqueda = await pagina(`${base}&q=mostr`);
    expect(filas_de(busqueda).map((f) => f.cliente)).toHaveLength(12);
    expect(filas_de(busqueda).every((f) => String(f.cliente).startsWith("Mostrador"))).toBe(true);
    expect(nodos(busqueda, "nox.paginator")).toHaveLength(0);
    expect(String(nodos(busqueda, "nox.markdown-view").at(-1)!.props!.content)).toBe("**12** de 120 registros coinciden con «mostr».");
    const nada = await pagina(`${base}&q=zzz`);
    expect(nodos(nada, "nox.table")[0]!.props!.text).toBe("Ningún registro coincide con la búsqueda");

    expect((await call("POST", `/herr-tablas/${tabla}/cerrar`, { nombre: "Semana" })).status).toBe(200);
    const cierres = await pagina(`${base}&modo=cierres`);
    const href = String(filas_de(cierres)[0]!._href).replace("/internal/herr-tabla", "herramientas.herr-tabla");
    const cierre = await pagina(`/pages/${href}`);
    expect(filas_de(cierre)).toHaveLength(POR_PAGINA);
    expect(nodos(cierre, "nox.paginator")[0]!.props!.total).toBe(120);
    const archivado = await pagina(`/pages/${href}&q=mostrador&page=1`);
    expect(filas_de(archivado)).toHaveLength(12);
  });
});
