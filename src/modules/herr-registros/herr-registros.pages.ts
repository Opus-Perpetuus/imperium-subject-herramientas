import {
  build_feature_shell_page,
  type DomainRow,
  type KirletDataClient,
  type KirletPageDecl,
  type NoxPageDescriptor,
  type NoxServices,
  type NoxUiNode,
} from "@opus-perpetuus/imperium-core-kit";
import { es_foto_guardada, filas_de, momento_legible, texto } from "../../lib/comun.ts";
import { spec_de_fila, type CampoSpec, type TablaSpec } from "../../lib/formulas/esquema.ts";
import { cambios_de, describir_cambios, titulo_de_cambios } from "../../lib/formulas/historial.ts";
import { texto_a_numero } from "../../lib/formulas/motor.ts";
import { parsear } from "../../lib/formulas/multivalor.ts";
import { href_registro, href_tabla, migas } from "../herr-tablas/herr-tablas.disenador.ts";
import {
  etiquetas_referencia,
  ids_referencia,
  objeto,
  opciones_referencia,
  valor_presentado,
  type OpcionRef,
} from "../herr-tablas/herr-tablas.flow.ts";
import { API, OWNER, boton, nodo, pagina } from "../herr-tablas/herr-tablas.nox.ts";

const ID_REGISTRO = "herramientas.herr-registro";

/** `"lat,lon"` → lo que espera `input-coordinates`. */
function coordenadas(raw: string): { latitude: number; longitude: number } | "" {
  const [lat, lon] = raw.split(",").map((p) => texto_a_numero(p.trim()));
  return lat != null && lon != null ? { latitude: lat, longitude: lon } : "";
}

/** Un `nox.input-*` por tipo de campo, con el valor ya capturado si se edita. */
export function nodo_entrada(campo: CampoSpec, raw: string, opciones?: Map<string, OpcionRef>): NoxUiNode {
  const base = {
    name: campo.clave,
    label: campo.unidad ? `${campo.etiqueta} (${campo.unidad})` : campo.etiqueta,
    required: campo.requerido === true,
  };
  const numero = () => texto_a_numero(raw) ?? "";
  switch (campo.tipo) {
    case "numero":
      return nodo("nox.input-number", { ...base, value: numero() });
    case "entero":
      return nodo("nox.input-number", { ...base, step: 1, value: numero() });
    case "dinero":
      return nodo("nox.input-money", { ...base, value: numero() });
    case "booleano":
      return nodo("nox.input-checkbox", { ...base, value: raw === "true" });
    case "fecha":
      return nodo("nox.input-date", { ...base, value: raw });
    case "hora":
      return nodo("nox.input-time", { ...base, value: raw });
    case "fecha_hora":
      return nodo("nox.input-datetime", { ...base, value: raw });
    case "opcion": {
      const options = (campo.opciones ?? []).map((o) => ({ value: o, label: o }));
      return campo.multiple
        ? nodo("nox.input-checkbox-group", { ...base, options, value: parsear(raw) })
        : nodo("nox.input-menu", { ...base, options, value: raw });
    }
    case "foto":
      return nodo("nox.input-image", { ...base, value: es_foto_guardada(raw) ? raw : "" });
    case "nota":
      return nodo("nox.input-markdown", { ...base, value: raw });
    case "geo":
      return nodo("nox.input-coordinates", { ...base, value: coordenadas(raw) });
    case "nivel":
      return nodo("nox.input-number", {
        ...base,
        value: numero(),
        help: campo.pasos ? `0..${campo.pasos}` : undefined,
      });
    case "referencia": {
      const options = [...(opciones ?? [])].map(([value, opcion]) => ({ value, ...opcion }));
      const ids = ids_referencia(raw);
      return campo.multiple
        ? nodo("nox.input-checkbox-group", { ...base, options, value: ids })
        : nodo("nox.input-datalist", { ...base, options, value: ids[0] ?? "" });
    }
    case "ruta":
      return nodo("nox.input-text", { ...base, value: raw, help: "Id de la ruta registrada" });
    default:
      return nodo("nox.input-text", { ...base, value: raw });
  }
}

type Entrada = Awaited<ReturnType<NoxServices["history"]["list"]>>[number];

/** Lo que dice una entrada del historial: qué pasó, cuándo y quién, y qué cambió. */
function punto_de_historial(spec: TablaSpec, e: Entrada, presentar: (c: CampoSpec, raw: string) => string) {
  const payload = (e.payload ?? {}) as { before?: DomainRow | null; after?: DomainRow | null };
  const antes = objeto(payload.before?.valores);
  const despues = objeto(payload.after?.valores);
  const cuando = [momento_legible(e.created_at), texto(e.actor_label)].filter(Boolean).join(" · ");
  if (e.action === "create") {
    const capturado = cambios_de(spec.campos, {}, despues, presentar);
    return {
      title: "Se capturó",
      when: cuando,
      description: capturado.map((c) => `${c.etiqueta}: ${c.despues}`).join(" · "),
    };
  }
  if (e.action === "delete") return { title: "Se eliminó", when: cuando, description: "" };
  const cambios = cambios_de(spec.campos, antes, despues, presentar);
  return { title: titulo_de_cambios(cambios), when: cuando, description: describir_cambios(cambios) };
}

async function pagina_historial(
  data: KirletDataClient,
  nox: NoxServices,
  spec: TablaSpec,
  registro: DomainRow,
): Promise<NoxPageDescriptor> {
  const id = String(registro.id);
  const entradas = (await nox.history.list({ resource: "herr-registros", entity_id: id, limit: 200 })).sort((a, b) =>
    b.created_at.localeCompare(a.created_at),
  );
  const etiquetas = await etiquetas_referencia(data, spec);
  const presentar = (c: CampoSpec, raw: string) => valor_presentado(c, raw, etiquetas);
  const nombre = texto(registro.name) || "Registro";
  const hijos: NoxUiNode[] = [
    migas(["Mis tablas", "/internal/herr-tabla"], [spec.name, href_tabla(spec.id)], [nombre, href_registro(spec.id, id)]),
  ];
  hijos.push(
    entradas.length
      ? nodo("nox.timeline", {
          text: "Cambios, del más reciente al primero",
          items: entradas.map((e, i) => ({ id: e.id, state: i ? "done" : "current", ...punto_de_historial(spec, e, presentar) })),
        })
      : nodo("nox.empty", {
          text: "Aún no hay cambios guardados",
          description: "Desde ahora cada vez que se capture o edite este registro queda aquí quién lo hizo y qué cambió.",
        }),
  );
  hijos.push(
    nodo("nox.toolbar", {}, [
      boton("Editar registro", { href: href_registro(spec.id, id), icon: "fa-pen", variant: "secondary" }),
      boton("Volver a la tabla", { href: href_tabla(spec.id), icon: "fa-arrow-left" }),
    ]),
  );
  return pagina(ID_REGISTRO, `Historial · ${nombre}`, hijos);
}

export const herr_registros_pages: KirletPageDecl[] = [
  {
    id: "herramientas.herr-registros",
    path: "herr-registros",
    permission: "subject.herramientas.herr-registros.read",
    build: () =>
      build_feature_shell_page({
        id: "herramientas.herr-registros",
        owner: OWNER,
        title: "Registros",
        props: {
          basePath: "herr-registros",
          idKey: "id",
          nameKey: "name",
          view: {
            title: "Registros",
            subtitle: "Filas de las tablas personalizadas",
            pluralLabel: "registros",
            singularLabel: "registro",
            emptyTitle: "Sin registros",
            emptyDescription: "Captura el primero desde una tabla",
          },
          data: {
            list: `${API}/herr-registros`,
            record: `${API}/herr-registros/:id`,
            create: { method: "POST", action: `${API}/herr-registros` },
            update: { method: "PATCH", action: `${API}/herr-registros/:id` },
            delete: { method: "DELETE", action: `${API}/herr-registros/:id` },
          },
          table: {
            columns: [
              { key: "name", label: "Registro", sortable: true, priority: 1 },
              { key: "tabla_id", label: "Tabla", sortable: true, priority: 2 },
              { key: "updated_at", label: "Actualizado", sortable: true, priority: 2 },
            ],
            fillHeight: true,
            serverQuery: true,
          },
          form: {
            fields: [
              {
                name: "tabla_id",
                component: "input-datalist",
                label: "Tabla",
                required: true,
                optionsSource: `${API}/herr-tablas?as=options&limite=1000`,
              },
              {
                name: "valores",
                component: "input-json",
                label: "Valores",
                help: "JSON clave → valor con las claves de los campos de la tabla",
                column_span: "full",
              },
            ],
          },
        },
      }),
  },
  {
    id: ID_REGISTRO,
    path: "herr-registro",
    permission: "subject.herramientas.herr-registros.write",
    build: async ({ url, data, nox }) => {
      const tabla_id = texto(url?.searchParams.get("tabla"));
      const id = texto(url?.searchParams.get("id"));
      const tabla = tabla_id ? await data.findOne("herr_tablas", { id: tabla_id }) : null;
      if (!tabla || tabla.is_active === false) {
        const tablas = await filas_de({ data }, "herr_tablas", { is_active: true });
        return pagina(ID_REGISTRO, "Nuevo registro", [
          nodo(
            "nox.empty",
            tablas.length
              ? { text: "¿En qué tabla anotas?", description: "Elige una de tus tablas." }
              : { text: "Aún no tienes tablas", description: "Crea una en «Mis tablas» y vuelve para anotar." },
            tablas.length
              ? tablas.map((t) => boton(texto(t.name), { href: `/internal/herr-registro?tabla=${t.id}`, icon: "fa-pen-to-square" }))
              : [boton("Crear una tabla", { href: "/internal/herr-tabla", icon: "fa-plus" })],
          ),
        ]);
      }
      const spec = spec_de_fila(tabla);
      const registro = id ? await data.findOne("herr_registros", { id }) : null;
      if (registro && url?.searchParams.get("modo") === "historial") return pagina_historial(data, nox, spec, registro);
      const valores = objeto(registro?.valores);
      const opciones = await opciones_referencia(data, spec);
      const entradas = spec.campos
        .filter((c) => c.tipo !== "calculado")
        .map((c) => nodo_entrada(c, valores[c.clave] ?? c.valor_por_defecto ?? "", opciones.get(c.clave)));
      const form = nodo(
        "nox.form",
        {
          method: "POST",
          action: "api://herr-registros/captura",
          then: `herramientas.herr-tabla?id=${spec.id}`,
        },
        [
          nodo("nox.input-hidden", { name: "tabla_id", value: spec.id }),
          ...(registro ? [nodo("nox.input-hidden", { name: "id", value: String(registro.id) })] : []),
          ...entradas,
          boton(registro ? "Guardar cambios" : "Guardar", { icon: "fa-floppy-disk" }),
        ],
      );
      const acciones = registro
        ? [
            boton("Historial de cambios", {
              href: href_registro(spec.id, String(registro.id), { modo: "historial" }),
              icon: "fa-clock-rotate-left",
              variant: "secondary",
            }),
            boton("Eliminar", {
              method: "DELETE",
              action: `api://herr-registros/${registro.id}`,
              confirm: "¿Eliminar este registro? Deja de verse en la tabla.",
              then: `herramientas.herr-tabla?id=${spec.id}`,
              icon: "fa-trash",
              variant: "ghost",
            }),
          ]
        : [];
      return pagina(ID_REGISTRO, `${registro ? "Editar" : "Nuevo"} · ${spec.name}`, [
        migas(["Mis tablas", "/internal/herr-tabla"], [spec.name, href_tabla(spec.id)]),
        form,
        nodo("nox.toolbar", {}, [...acciones, boton("Volver a la tabla", { href: href_tabla(spec.id), icon: "fa-arrow-left" })]),
      ]);
    },
  },
];
