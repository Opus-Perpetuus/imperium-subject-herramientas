import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  create_kirlet_test_context,
  define_subject,
  sign_kirlet_identity_v2,
  type KirletIdentity,
  type NoxPageDescriptor,
  type NoxUiNode,
} from "@opus-perpetuus/imperium-core-kit";
import { GASTOS } from "../../lib/formulas/plantillas.ts";
import { herr_cierres_module } from "../herr-cierres/herr-cierres.routes.ts";
import { herr_registros_module } from "../herr-registros/herr-registros.routes.ts";
import { herr_tablas_module } from "./herr-tablas.routes.ts";

const SECRETO = "secreto-de-prueba";
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
  server = create_kirlet_test_context(SUBJECT, { gateway_secret: SECRETO });
});
afterEach(() => server.stop());

function identidad(escribe: boolean): KirletIdentity {
  const grant = (resource: string) => ({ resource, c: escribe, r: true, u: escribe, d: escribe });
  return {
    user_id: escribe ? "u-escribe" : "u-lee",
    email: escribe ? "escribe@x.mx" : "lee@x.mx",
    is_admin: false,
    kirlet_id: SUBJECT.technical_id,
    grants: [grant("kirlet.herramientas.herr-tablas"), grant("kirlet.herramientas.herr-registros")],
    user_type: "internal",
    realm: "internal",
  };
}

/** Sin cabeceras la app usa el admin sintético: así se arman los datos. */
async function call(method: string, path: string, body?: unknown) {
  const res = await server.fetch(
    new Request(`http://t${path}`, {
      method,
      headers: body === undefined ? {} : { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  );
  const json = (await res.json()) as { data?: Record<string, unknown> };
  return { status: res.status, data: json.data ?? {} };
}

async function pagina_como(escribe: boolean, path: string): Promise<NoxPageDescriptor> {
  const res = await server.fetch(new Request(`http://t${path}`, { headers: sign_kirlet_identity_v2(identidad(escribe), SECRETO) }));
  expect(res.status).toBe(200);
  return (await res.json()) as NoxPageDescriptor;
}

function nodos(doc: NoxPageDescriptor): Array<{ component: string; props: Record<string, unknown> }> {
  const out: Array<{ component: string; props: Record<string, unknown> }> = [];
  const visita = (nodo: NoxUiNode) => {
    out.push({ component: String(nodo.component), props: (nodo.props ?? {}) as Record<string, unknown> });
    for (const hijo of (nodo.children ?? []) as NoxUiNode[]) visita(hijo);
  };
  visita(doc.page as NoxUiNode);
  return out;
}

function botones(doc: NoxPageDescriptor): string[] {
  return nodos(doc)
    .filter((n) => n.component === "nox.button")
    .map((n) => String(n.props.text ?? ""));
}

async function gastos_con_un_registro(): Promise<string> {
  const tabla = await call("POST", "/herr-tablas/desde-plantilla", { plantilla_id: GASTOS });
  expect(tabla.status).toBe(201);
  const id = String(tabla.data.id);
  const registro = await call("POST", "/herr-registros", {
    tabla_id: id,
    valores: { fecha: "2026-10-01", concepto: "Pan", monto: "35" },
  });
  expect(registro.status).toBe(201);
  return id;
}

describe("quien solo lee no ve lo que acabaría en 403", () => {
  test("Ver tabla: sin nuevo registro, diseñar, imprimir ni hacer cierre, y filas sin enlace a editar", async () => {
    const id = await gastos_con_un_registro();
    const lee = await pagina_como(false, `/pages/herramientas.herr-tabla?id=${id}`);
    expect(botones(lee)).toEqual(["Cierres"]);
    const filas = nodos(lee).find((n) => n.component === "nox.table")?.props.rows as Record<string, unknown>[];
    expect(filas).toHaveLength(1);
    expect(filas[0]?._href).toBeUndefined();

    const escribe = await pagina_como(true, `/pages/herramientas.herr-tabla?id=${id}`);
    expect(botones(escribe)).toEqual(["Nuevo registro", "Diseñar", "Imprimir", "Cierres", "Hacer cierre"]);
    const filas_escribe = nodos(escribe).find((n) => n.component === "nox.table")?.props.rows as Record<string, unknown>[];
    expect(String(filas_escribe[0]?._href)).toContain("/internal/herr-registro?tabla=");
  });

  test("pedir por la URL un modo que escribe enseña la tabla", async () => {
    const id = await gastos_con_un_registro();
    for (const modo of ["disenar", "campo&campo=monto", "imprimir", "cerrar"]) {
      const doc = await pagina_como(false, `/pages/herramientas.herr-tabla?id=${id}&modo=${modo}`);
      expect(nodos(doc).some((n) => n.component === "nox.form")).toBe(false);
      expect(nodos(doc).some((n) => n.component === "nox.table")).toBe(true);
    }
  });

  test("Mis tablas: las tablas sí, crear una no", async () => {
    await gastos_con_un_registro();
    const lee = await pagina_como(false, "/pages/herramientas.herr-tabla");
    expect(nodos(lee).some((n) => n.component === "nox.form")).toBe(false);
    expect(botones(lee)).not.toContain("Usar plantilla");
    const escribe = await pagina_como(true, "/pages/herramientas.herr-tabla");
    expect(nodos(escribe).some((n) => n.component === "nox.form")).toBe(true);
  });

  test("Cierres: la lista sí; cerrar, comparar y renombrar no", async () => {
    const id = await gastos_con_un_registro();
    const cierre = await call("POST", `/herr-tablas/${id}/cerrar`, { nombre: "Octubre", fecha: "2026-10-01" });
    expect(cierre.status).toBe(200);
    await call("POST", "/herr-registros", { tabla_id: id, valores: { fecha: "2026-10-02", concepto: "Leche", monto: "28" } });

    const lista = await pagina_como(false, `/pages/herramientas.herr-tabla?id=${id}&modo=cierres`);
    expect(botones(lista)).toEqual(["Volver a la tabla"]);
    expect(nodos(lista).some((n) => n.component === "nox.form")).toBe(false);
    expect(nodos(lista).some((n) => n.component === "nox.table")).toBe(true);

    const uno = await pagina_como(false, `/pages/herramientas.herr-tabla?id=${id}&modo=cierre&cierre=${cierre.data.cierre}`);
    expect(nodos(uno).some((n) => n.component === "nox.form")).toBe(false);
    expect(botones(uno)).toContain("Comparar con lo actual");
  });
});
