import {
  build_feature_shell_page,
  type KirletPageDecl,
  type NoxUiNode,
} from "@opus-perpetuus/imperium-core-kit";
import { puede, texto } from "../../lib/comun.ts";
import { valores_resumen } from "../../lib/formulas/calculadora.ts";
import { spec_de_fila } from "../../lib/formulas/esquema.ts";
import { ID_TABLA, href_registro, href_tabla, migas, pagina_campo, pagina_disenar, pagina_inicio } from "./herr-tablas.disenador.ts";
import { filtrar_filas, registros_paginados, tabla_de_registros, vista_de_tabla } from "./herr-tablas.flow.ts";
import { pagina_cerrar, pagina_cierre, pagina_cierres, pagina_comparar } from "./herr-tablas.cierres.ts";
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
    build: async ({ url, data, identity }) => {
      const params = url?.searchParams ?? new URLSearchParams();
      const id = texto(params.get("id"));
      const tabla = id ? await data.findOne("herr_tablas", { id }) : null;
      if (!tabla || tabla.is_active === false) return pagina_inicio(data, id ? "La tabla no existe" : "", identity);
      const spec = spec_de_fila(tabla);
      const anotar = puede(identity, "herr-registros", "create");
      const disenar = puede(identity, "herr-tablas", "update");
      const operar = puede(identity, "herr-tablas", "create");
      const modo = modo_posible(params.get("modo"), { disenar, operar });
      if (modo === "disenar") return pagina_disenar(data, spec, params);
      if (modo === "campo") return pagina_campo(data, spec, texto(params.get("campo")));
      if (modo === "imprimir") return pagina_imprimir(data, spec, params);
      if (modo === "impreso") return pagina_impreso(data, spec, params);
      if (modo === "cerrar") return pagina_cerrar(data, spec);
      if (modo === "cierres") return pagina_cierres(data, spec, identity);
      if (modo === "cierre") return pagina_cierre(data, spec, params, identity);
      if (modo === "comparar") return pagina_comparar(data, spec, params);
      const { filas, columnas, presentacion } = await vista_de_tabla(data, spec);
      const herramientas = [
        ...(anotar
          ? [boton("Nuevo registro", { href: `/internal/herr-registro?tabla=${spec.id}`, icon: "fa-plus", variant: "primary" })]
          : []),
        ...(disenar
          ? [boton("Diseñar", { href: href_tabla(spec.id, { modo: "disenar" }), icon: "fa-pen-ruler", variant: "secondary" })]
          : []),
        ...(operar && spec.campos.length
          ? [boton("Imprimir", { href: href_tabla(spec.id, { modo: "imprimir" }), icon: "fa-print", variant: "secondary" })]
          : []),
        ...(spec.cerrable
          ? [boton("Cierres", { href: href_tabla(spec.id, { modo: "cierres" }), icon: "fa-box-archive", variant: "secondary" })]
          : []),
      ];
      const hijos: NoxUiNode[] = [migas(["Mis tablas", "/internal/herr-tabla"], [spec.name, href_tabla(spec.id)])];
      if (herramientas.length) hijos.push(nodo("nox.toolbar", {}, herramientas));
      if (spec.description) hijos.push(nodo("nox.markdown-view", { content: spec.description }));
      if (!spec.campos.length) {
        hijos.push(
          nodo(
            "nox.empty",
            { text: "Esta tabla aún no tiene columnas", description: "Diséñala: dile qué quieres anotar." },
            disenar ? [boton("Diseñar la tabla", { href: href_tabla(spec.id, { modo: "disenar" }), icon: "fa-pen-ruler" })] : [],
          ),
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
        ...registros_paginados(params, filas.length, filtrar_filas(spec, filas, presentacion, texto(params.get("q"))), (visibles, vacio) =>
          tabla_de_registros(columnas, visibles, presentacion, anotar ? (f) => href_registro(spec.id, f.id) : undefined, vacio),
        ),
      );
      if (operar && spec.cerrable && filas.length) {
        hijos.push(boton("Hacer cierre", { href: href_tabla(spec.id, { modo: "cerrar" }), icon: "fa-box-archive", variant: "secondary" }));
      }
      return pagina(ID_TABLA, spec.name, hijos);
    },
  },
];

const MODOS_DE_DISENO = new Set(["disenar", "campo"]);
const MODOS_QUE_ESCRIBEN = new Set(["imprimir", "cerrar"]);

/** A quien no puede escribir se le enseña la tabla, no un formulario que acabaría en 403. */
function modo_posible(modo: string | null, puede_hacer: { disenar: boolean; operar: boolean }): string | null {
  if (modo && MODOS_DE_DISENO.has(modo) && !puede_hacer.disenar) return null;
  if (modo && MODOS_QUE_ESCRIBEN.has(modo) && !puede_hacer.operar) return null;
  return modo;
}
