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
import { TIPOS_UNIDAD_POR_REGISTRO, spec_de_fila, type CampoSpec, type TablaSpec } from "../../lib/formulas/esquema.ts";
import { MAX_FOTOS, lista_de, partir } from "../../lib/formulas/fotos.ts";
import { cambios_de, describir_cambios, titulo_de_cambios, type Cambio } from "../../lib/formulas/historial.ts";
import { texto_a_numero } from "../../lib/formulas/motor.ts";
import { parsear } from "../../lib/formulas/multivalor.ts";
import { href_registro, href_tabla, migas } from "../herr-tablas/herr-tablas.disenador.ts";
import {
  enlaces_de,
  etiquetas_de,
  ids_referencia,
  objeto,
  opciones_referencia,
  registros_de,
  unidad_en_fila,
  valor_presentado,
  type OpcionRef,
} from "../herr-tablas/herr-tablas.flow.ts";
import { SUFIJO_UNIDAD } from "./herr-registros.flow.ts";
import { API, OWNER, boton, nodo, pagina } from "../herr-tablas/herr-tablas.nox.ts";

const ID_REGISTRO = "herramientas.herr-registro";

/** `"lat,lon"` → lo que espera `input-coordinates`. */
function coordenadas(raw: string): { latitude: number; longitude: number } | "" {
  const [lat, lon] = raw.split(",").map((p) => texto_a_numero(p.trim()));
  return lat != null && lon != null ? { latitude: lat, longitude: lon } : "";
}

/** Cada foto como la enseña el formulario: su miniatura en línea o, sin ella, el id del adjunto. */
function foto_en_formulario(url: string, miniatura?: string): string {
  return miniatura || (/\/media\/([^/?#]+)$/.exec(url)?.[1] ?? url);
}

/** Un `nox.input-*` por tipo de campo, con el valor ya capturado si se edita. */
export function nodo_entrada(campo: CampoSpec, raw: string, opciones?: Map<string, OpcionRef>, miniatura?: string): NoxUiNode {
  // Con unidad por registro o tomada de un enlace, la de la columna no es la de todos.
  const unidad_fija = campo.unidad && !campo.unidad_por_registro && !campo.unidad_de ? campo.unidad : null;
  const base = {
    name: campo.clave,
    label: unidad_fija ? `${campo.etiqueta} (${unidad_fija})` : campo.etiqueta,
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
      // La miniatura se pinta en línea (desde la APK un `<img>` a `/api/media` sale sin la
      // sesión) y, si vuelve igual, la captura sabe que la foto no cambió. Sin ella, el id del adjunto.
      return nodo("nox.input-image", {
        ...base,
        value: es_foto_guardada(raw) ? foto_en_formulario(lista_de(raw)[0]!, partir(miniatura)[0]) : "",
      });
    case "fotos": {
      const minis = partir(miniatura);
      return nodo("nox.input-image", {
        ...base,
        multiple: true,
        image_selection_limit: MAX_FOTOS,
        help: `Hasta ${MAX_FOTOS} fotos.`,
        value: lista_de(raw).map((url, i) => foto_en_formulario(url, minis[i])),
      });
    }
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

/**
 * La unidad que escribe cada registro va junto a su número. Se sugieren las
 * que ya se usaron en esa columna para que «kg» no acabe también como «Kg».
 */
function nodo_unidad(campo: CampoSpec, unidad: string, usadas: string[]): NoxUiNode {
  return nodo("nox.input-text", {
    name: `${campo.clave}${SUFIJO_UNIDAD}`,
    label: `Unidad de ${campo.etiqueta}`,
    value: unidad,
    placeholder: "kg, L, piezas, cajas…",
    help: usadas.length ? `Ya usadas: ${usadas.slice(0, 8).join(", ")}.` : "",
  });
}

/** Unidades distintas que ya escribieron los registros de la tabla, por columna. */
function unidades_usadas(registros: DomainRow[]): Map<string, string[]> {
  const out = new Map<string, Set<string>>();
  for (const r of registros) {
    for (const [clave, unidad] of Object.entries(objeto(r.unidades))) {
      if (!unidad) continue;
      const de = out.get(clave) ?? new Set<string>();
      de.add(unidad);
      out.set(clave, de);
    }
  }
  return new Map([...out].map(([clave, de]) => [clave, [...de].sort((a, b) => a.localeCompare(b, "es"))]));
}

/** Cambios de la unidad escrita en cada número cuyo valor no cambió: si cambió, su renglón ya la enseña. */
function cambios_de_unidad(campos: CampoSpec[], antes: Record<string, string>, despues: Record<string, string>): Cambio[] {
  return campos
    .filter((c) => c.unidad_por_registro && (antes[c.clave] ?? "") !== (despues[c.clave] ?? ""))
    .map((c) => ({ etiqueta: `Unidad de ${c.etiqueta}`, antes: antes[c.clave] ?? "", despues: despues[c.clave] ?? "" }));
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
  const enlaces = await enlaces_de(data, spec);
  const etiquetas = etiquetas_de(enlaces);
  const nombre = texto(registro.name) || "Registro";
  const hijos: NoxUiNode[] = [
    migas(["Mis tablas", "/internal/herr-tabla"], [spec.name, href_tabla(spec.id)], [nombre, href_registro(spec.id, id)]),
  ];
  hijos.push(
    entradas.length
      ? nodo("nox.timeline", {
          text: "Cambios, del más reciente al primero",
          items: entradas.map((e, i) => {
            const payload = (e.payload ?? {}) as { before?: DomainRow | null; after?: DomainRow | null };
            const antes = objeto(payload.before?.valores);
            const despues = objeto(payload.after?.valores);
            const unidades_despues = objeto(payload.after?.unidades);
            // Cada lado con su unidad: la que tenía el registro antes y la que tiene después.
            const lados = {
              antes: { id, valores: antes, unidades: objeto(payload.before?.unidades) },
              despues: { id, valores: despues, unidades: unidades_despues },
            };
            const presentar = (c: CampoSpec, raw: string, lado: "antes" | "despues") =>
              valor_presentado(c, raw, etiquetas, unidad_en_fila(c, lados[lado], enlaces));
            const base = {
              id: e.id,
              state: i ? "done" : "current",
              when: [momento_legible(e.created_at), texto(e.actor_label)].filter(Boolean).join(" · "),
            };
            if (e.action === "create") {
              const capturado = cambios_de(spec.campos, {}, despues, presentar);
              return { ...base, title: "Se capturó", description: capturado.map((c) => `${c.etiqueta}: ${c.despues}`).join(" · ") };
            }
            if (e.action === "delete") return { ...base, title: "Se eliminó", description: "" };
            const mismo_valor = spec.campos.filter((c) => (antes[c.clave] ?? "") === (despues[c.clave] ?? ""));
            const cambios = [
              ...cambios_de(spec.campos, antes, despues, presentar),
              ...cambios_de_unidad(mismo_valor, lados.antes.unidades, unidades_despues),
            ];
            return { ...base, title: titulo_de_cambios(cambios), description: describir_cambios(cambios) };
          }),
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
      const miniaturas = objeto(registro?.miniaturas);
      const unidades = objeto(registro?.unidades);
      const opciones = await opciones_referencia(data, spec);
      const con_unidad = spec.campos.filter((c) => c.unidad_por_registro && TIPOS_UNIDAD_POR_REGISTRO.has(c.tipo));
      const usadas = con_unidad.length ? unidades_usadas(await registros_de({ data }, spec.id)) : new Map<string, string[]>();
      const entradas = spec.campos
        .filter((c) => c.tipo !== "calculado")
        .flatMap((c) => {
          const entrada = nodo_entrada(c, valores[c.clave] ?? c.valor_por_defecto ?? "", opciones.get(c.clave), miniaturas[c.clave]);
          if (!con_unidad.includes(c)) return [entrada];
          // Sin unidad propia se propone la de la columna: es la que la lista ya le enseña.
          return [entrada, nodo_unidad(c, unidades[c.clave] || c.unidad || "", usadas.get(c.clave) ?? [])];
        });
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
