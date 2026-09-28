import {
  build_feature_shell_page,
  type KirletPageDecl,
  type NoxPageDescriptor,
  type NoxUiNode,
} from "@opus-perpetuus/imperium-core-kit";
import { filas_de, texto } from "../../lib/comun.ts";
import { formatear, valores_resumen } from "../../lib/formulas/calculadora.ts";
import { decimales_de, spec_de_fila, type CampoSpec } from "../../lib/formulas/esquema.ts";
import { texto_a_numero } from "../../lib/formulas/motor.ts";
import { parsear } from "../../lib/formulas/multivalor.ts";
import { ordenar } from "../../lib/formulas/orden.ts";
import { etiquetas_referencia, filas_recalculadas, registros_de } from "./herr-tablas.flow.ts";

export const API = "api://m/subject-herramientas";
export const OWNER = "subject-herramientas";

export function nodo(component: string, props: Record<string, unknown> = {}, children?: NoxUiNode[]): NoxUiNode {
  return { component, props, ...(children?.length ? { children } : {}) };
}

export function enlace(text: string, href: string): NoxUiNode {
  return { component: "nox.link", props: { href, text }, text };
}

export function boton(text: string, props: Record<string, unknown> = {}): NoxUiNode {
  return { component: "nox.button", props: { ...props, text }, text };
}

export function pagina(id: string, title: string, hijos: NoxUiNode[]): NoxPageDescriptor {
  return { id, owner: OWNER, title, page: nodo("nox.page", {}, hijos) };
}

const NUMERICOS = new Set(["numero", "dinero", "entero", "calculado"]);

function con_unidad(valor: string, unidad?: string | null): string {
  return valor && unidad ? `${valor} ${unidad}` : valor;
}

/** El valor de un campo como se lee en la lista: números con sus decimales y unidad, referencias por etiqueta. */
export function valor_presentado(
  campo: CampoSpec,
  raw: string,
  etiquetas: Map<string, Map<string, string>>,
): string {
  if (!raw) return "";
  if (campo.tipo === "foto") return "Foto";
  if (campo.tipo === "booleano") return raw === "true" ? "Sí" : "No";
  if (campo.tipo === "referencia") {
    const de = etiquetas.get(campo.clave);
    return (campo.multiple ? parsear(raw) : [raw]).map((id) => de?.get(id) ?? "—").join(" · ");
  }
  if (campo.multiple) return parsear(raw).join(" · ");
  if (NUMERICOS.has(campo.tipo)) {
    const n = texto_a_numero(raw);
    const valor = n === null ? raw : formatear(n, campo.tipo === "entero" ? 0 : decimales_de(campo));
    return con_unidad(valor, campo.unidad);
  }
  return con_unidad(raw, campo.unidad);
}

const ID_TABLA = "herramientas.herr-tabla";

export const herr_tablas_pages: KirletPageDecl[] = [
  {
    id: "herramientas.herr-tablas",
    path: "herr-tablas",
    permission: "subject.herramientas.herr-tablas.read",
    build: () =>
      build_feature_shell_page({
        id: "herramientas.herr-tablas",
        owner: OWNER,
        title: "Tablas personalizadas",
        props: {
          basePath: "herr-tablas",
          idKey: "id",
          nameKey: "name",
          view: {
            title: "Tablas personalizadas",
            subtitle: "Bases de datos a medida: campos, valores fijos, resúmenes y fórmulas",
            pluralLabel: "tablas",
            singularLabel: "tabla",
            emptyTitle: "Sin tablas",
            emptyDescription: "Crea la primera o parte de una plantilla (Jornada en moto, Gastos, Deudas)",
          },
          data: {
            list: `${API}/herr-tablas`,
            record: `${API}/herr-tablas/:id`,
            create: { method: "POST", action: `${API}/herr-tablas` },
            update: { method: "PATCH", action: `${API}/herr-tablas/:id` },
            delete: { method: "DELETE", action: `${API}/herr-tablas/:id` },
          },
          table: {
            columns: [
              { key: "name", label: "Nombre", sortable: true, priority: 1 },
              { key: "plantilla_id", label: "Plantilla", sortable: true, priority: 2 },
              { key: "cerrable", label: "Cerrable", sortable: true, priority: 3 },
              { key: "version_esquema", label: "Versión", sortable: true, priority: 3 },
              { key: "updated_at", label: "Actualizada", sortable: true, priority: 2 },
            ],
            fillHeight: true,
            serverQuery: true,
          },
          form: {
            fields: [
              { name: "name", component: "input-text", label: "Nombre", required: true },
              { name: "description", component: "input-textarea", label: "Descripción" },
              { name: "icono", component: "input-icon", label: "Ícono" },
              {
                name: "campos",
                component: "input-json",
                label: "Campos",
                help: "Lista JSON de { clave, etiqueta, tipo, requerido, formula, unidad, decimales, en_resumen, opciones… }",
                column_span: "full",
              },
              {
                name: "constantes",
                component: "input-json",
                label: "Valores fijos",
                help: "Lista JSON de { clave, etiqueta, valor, unidad, decimales }",
                column_span: "full",
              },
              {
                name: "resumenes",
                component: "input-json",
                label: "Resúmenes",
                help: "Lista JSON de { clave, etiqueta, formula, unidad, decimales }",
                column_span: "full",
              },
              { name: "orden_campo", component: "input-text", label: "Ordenar por (clave del campo)" },
              {
                name: "orden_desc",
                component: "input-switch",
                label: "Sentido",
                options: [
                  { value: true, label: "Descendente" },
                  { value: false, label: "Ascendente" },
                ],
              },
              { name: "cerrable", component: "input-checkbox", label: "Se puede cerrar el día" },
            ],
          },
        },
      }),
  },
  {
    id: ID_TABLA,
    path: "herr-tabla",
    permission: "subject.herramientas.herr-tablas.read",
    build: async ({ url, data }) => {
      const id = texto(url?.searchParams.get("id"));
      const tabla = id ? await data.findOne("herr_tablas", { id }) : null;
      if (!tabla || tabla.is_active === false) {
        const tablas = await filas_de({ data }, "herr_tablas", { is_active: true });
        return pagina(ID_TABLA, "Tablas personalizadas", [
          nodo(
            "nox.empty",
            { text: id ? "La tabla no existe" : "Elige una tabla", description: "Abre una de tus tablas:" },
            tablas.map((t) => enlace(texto(t.name), `/internal/herr-tabla?id=${t.id}`)),
          ),
        ]);
      }
      const spec = spec_de_fila(tabla);
      const filas = ordenar(spec, filas_recalculadas(spec, await registros_de({ data }, spec.id)));
      const etiquetas = await etiquetas_referencia(data, spec);
      const columnas = spec.campos.some((c) => c.en_resumen)
        ? spec.campos.filter((c) => c.en_resumen)
        : spec.campos;
      const hijos: NoxUiNode[] = [];
      if (spec.description) hijos.push(nodo("nox.markdown-view", { content: spec.description }));
      if (spec.resumenes.length) {
        hijos.push(
          nodo("nox.stats", {
            items: valores_resumen(spec, filas).map(({ resumen, texto: t }) => ({
              id: resumen.clave,
              label: resumen.etiqueta,
              value: con_unidad(t, resumen.unidad) || "—",
            })),
          }),
        );
      }
      hijos.push(
        nodo("nox.table", {
          columns: columnas.map((c) => ({ key: c.clave, label: c.etiqueta })),
          rows: filas.map((f) =>
            Object.fromEntries(columnas.map((c) => [c.clave, valor_presentado(c, f.valores[c.clave] ?? "", etiquetas)])),
          ),
          text: "Sin registros",
        }),
      );
      hijos.push(enlace("Nuevo registro", `/internal/herr-registro?tabla=${spec.id}`));
      if (spec.cerrable) {
        hijos.push(
          boton("Cerrar día", {
            method: "POST",
            action: `api://herr-tablas/${spec.id}/cerrar`,
            confirm: "¿Cerrar el día? Los registros se archivan en Cierres y la tabla queda vacía.",
            icon: "fa-box-archive",
          }),
        );
      }
      return pagina(ID_TABLA, spec.name, hijos);
    },
  },
];
