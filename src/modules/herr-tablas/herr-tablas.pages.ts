import {
  build_feature_shell_page,
  type KirletPageDecl,
  type NoxUiNode,
} from "@opus-perpetuus/imperium-core-kit";
import { texto } from "../../lib/comun.ts";
import { valores_resumen } from "../../lib/formulas/calculadora.ts";
import { spec_de_fila } from "../../lib/formulas/esquema.ts";
import { ID_TABLA, href_tabla, migas, pagina_campo, pagina_disenar, pagina_inicio } from "./herr-tablas.disenador.ts";
import { valor_presentado, vista_de_tabla } from "./herr-tablas.flow.ts";
import { pagina_impreso, pagina_imprimir } from "./herr-tablas.impresion.ts";
import { API, OWNER, boton, con_unidad, nodo, pagina } from "./herr-tablas.nox.ts";

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
            subtitle: "Bases de datos a medida. Para crearlas y diseñar sus columnas abre «Ver tabla».",
            pluralLabel: "tablas",
            singularLabel: "tabla",
            emptyTitle: "Sin tablas",
            emptyDescription: "Créala desde «Ver tabla»: en blanco escribiendo sus columnas o desde una plantilla",
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
                name: "cerrable",
                component: "input-checkbox",
                label: "Se puede cerrar el día",
                help: "Las columnas, totales y valores fijos se diseñan en «Ver tabla» → Diseñar.",
              },
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
      const params = url?.searchParams ?? new URLSearchParams();
      const id = texto(params.get("id"));
      const tabla = id ? await data.findOne("herr_tablas", { id }) : null;
      if (!tabla || tabla.is_active === false) return pagina_inicio(data, id ? "La tabla no existe" : "");
      const spec = spec_de_fila(tabla);
      const modo = params.get("modo");
      if (modo === "disenar") return pagina_disenar(data, spec, params);
      if (modo === "campo") return pagina_campo(data, spec, texto(params.get("campo")));
      if (modo === "imprimir") return pagina_imprimir(data, spec, params);
      if (modo === "impreso") return pagina_impreso(data, spec, params);
      const { filas, etiquetas, columnas } = await vista_de_tabla(data, spec);
      const hijos: NoxUiNode[] = [
        migas(["Mis tablas", "/internal/herr-tabla"], [spec.name, href_tabla(spec.id)]),
        nodo("nox.toolbar", {}, [
          boton("Nuevo registro", { href: `/internal/herr-registro?tabla=${spec.id}`, icon: "fa-plus", variant: "primary" }),
          boton("Diseñar", { href: href_tabla(spec.id, { modo: "disenar" }), icon: "fa-pen-ruler", variant: "secondary" }),
          ...(spec.campos.length
            ? [boton("Imprimir", { href: href_tabla(spec.id, { modo: "imprimir" }), icon: "fa-print", variant: "secondary" })]
            : []),
        ]),
      ];
      if (spec.description) hijos.push(nodo("nox.markdown-view", { content: spec.description }));
      if (!spec.campos.length) {
        hijos.push(
          nodo("nox.empty", { text: "Esta tabla aún no tiene columnas", description: "Diséñala: dile qué quieres anotar." }, [
            boton("Diseñar la tabla", { href: href_tabla(spec.id, { modo: "disenar" }), icon: "fa-pen-ruler" }),
          ]),
        );
        return pagina(ID_TABLA, spec.name, hijos);
      }
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
      if (spec.cerrable) {
        hijos.push(
          boton("Cerrar día", {
            variant: "secondary",
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
