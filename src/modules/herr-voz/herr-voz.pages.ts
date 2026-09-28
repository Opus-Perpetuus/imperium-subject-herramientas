import {
  build_feature_shell_page,
  type KirletPageDecl,
  type NoxPageDescriptor,
  type NoxUiNode,
} from "@opus-perpetuus/imperium-core-kit";
import { INTENCIONES } from "../../lib/nlu/intenciones.ts";
import { texto } from "../../lib/comun.ts";

const API = "api://m/subject-herramientas";
const PERMISO = "subject.herramientas.herr-voz.read";

const ESTADOS = [
  { value: "interpretado", label: "Interpretado" },
  { value: "ejecutado", label: "Ejecutado" },
  { value: "pendiente_confirmacion", label: "Pendiente de confirmación" },
  { value: "error", label: "Error" },
  { value: "no_entendido", label: "No entendido" },
];

const SI_NO = [
  { value: true, label: "Sí" },
  { value: false, label: "No" },
];

const ajustes_page: KirletPageDecl = {
  id: "herramientas.herr-voz",
  path: "herr-voz",
  permission: PERMISO,
  build: () =>
    build_feature_shell_page({
      id: "herramientas.herr-voz",
      owner: "subject-herramientas",
      title: "Asistente de voz",
      props: {
        basePath: "herr-voz",
        idKey: "id",
        nameKey: "name",
        view: {
          title: "Asistente de voz",
          subtitle: "Ajustes del intérprete de órdenes",
          pluralLabel: "perfiles",
          singularLabel: "perfil",
          emptyTitle: "Sin perfil",
          emptyDescription: "Sin perfil se usan los valores por defecto: «hola imperium», umbral 0.55, todas las órdenes, con confirmación.",
        },
        data: {
          list: `${API}/herr-voz`,
          record: `${API}/herr-voz/:id`,
          create: { method: "POST", action: `${API}/herr-voz` },
          update: { method: "PATCH", action: `${API}/herr-voz/:id` },
          delete: { method: "DELETE", action: `${API}/herr-voz/:id` },
        },
        table: {
          columns: [
            { key: "name", label: "Perfil", sortable: true, priority: 1 },
            { key: "es_activa", label: "En uso", sortable: true, priority: 1 },
            { key: "umbral", label: "Umbral", sortable: true, priority: 2 },
            { key: "confirmar_antes", label: "Confirma antes", sortable: true, priority: 3 },
            { key: "idioma", label: "Idioma", sortable: true, priority: 3 },
          ],
          fillHeight: true,
          mobileCards: true,
          serverQuery: true,
        },
        form: {
          fields: [
            { name: "name", component: "input-text", label: "Perfil", required: true },
            { name: "description", component: "input-textarea", label: "Descripción", column_span: "full" },
            {
              name: "frases_activacion",
              component: "input-json",
              label: "Frases de activación",
              help: 'Lista de frases, p. ej. ["hola imperium", "oye imperium"].',
            },
            {
              name: "intenciones_activas",
              component: "input-json",
              label: "Órdenes activas",
              help: `Lista vacía = todas. Ids: ${INTENCIONES.map((i) => i.id).join(", ")}.`,
            },
            {
              name: "umbral",
              component: "input-number",
              label: "Umbral de confianza",
              help: "Bajo este valor no se adivina: se pide aclaración.",
              min: 0,
              max: 1,
              step: 0.05,
            },
            { name: "idioma", component: "input-text", label: "Idioma", placeholder: "es-MX" },
            {
              name: "confirmar_antes",
              component: "input-switch",
              label: "Confirmar antes de ejecutar",
              options: SI_NO,
              switch_default_value: true,
            },
            { name: "es_activa", component: "input-switch", label: "Perfil en uso", options: SI_NO, switch_default_value: true },
          ],
        },
      },
    }),
};

const bitacora_page: KirletPageDecl = {
  id: "herramientas.herr-voz-bitacora",
  path: "herr-voz-bitacora",
  permission: PERMISO,
  build: () =>
    build_feature_shell_page({
      id: "herramientas.herr-voz-bitacora",
      owner: "subject-herramientas",
      title: "Bitácora del asistente",
      props: {
        basePath: "herr-voz/bitacora",
        idKey: "id",
        nameKey: "name",
        view: {
          title: "Bitácora del asistente",
          subtitle: "Órdenes recibidas, qué se entendió y qué se contestó",
          pluralLabel: "órdenes",
          singularLabel: "orden",
          emptyTitle: "Sin órdenes",
          emptyDescription: "Aquí aparecerá cada orden que reciba el asistente.",
        },
        data: {
          list: `${API}/herr-voz/bitacora`,
          record: `${API}/herr-voz/bitacora/:id`,
        },
        table: {
          columns: [
            { key: "fecha_hora", label: "Cuándo", sortable: true, priority: 2 },
            { key: "name", label: "Orden", sortable: true, priority: 1 },
            { key: "intencion", label: "Intención", sortable: true, priority: 1 },
            { key: "estado", label: "Estado", sortable: true, priority: 1, cell: "badge" },
            { key: "confianza", label: "Confianza", sortable: true, priority: 3 },
            { key: "respuesta", label: "Respuesta", sortable: false, priority: 2 },
          ],
          fillHeight: true,
          mobileCards: true,
          serverQuery: true,
        },
        form: {
          fields: [
            { name: "texto", component: "input-text", label: "Orden", read_only: true, column_span: "full" },
            { name: "intencion", component: "input-text", label: "Intención", read_only: true },
            { name: "estado", component: "input-status", label: "Estado", read_only: true, options: ESTADOS },
            { name: "confianza", component: "input-number", label: "Confianza", read_only: true },
            { name: "ambiguo", component: "input-checkbox", label: "Ambiguo", read_only: true },
            { name: "respuesta", component: "input-textarea", label: "Respuesta", read_only: true, column_span: "full" },
            { name: "datos", component: "input-object", label: "Datos", read_only: true, object_read_only: true },
            { name: "resultado", component: "input-object", label: "Resultado", read_only: true, object_read_only: true },
            { name: "fecha_hora", component: "input-datetime", label: "Cuándo", read_only: true },
          ],
        },
      },
    }),
};

/** Últimas entradas de la bitácora como filas de `nox.table`. */
function filas_bitacora(rows: Array<Record<string, unknown>>): Array<Record<string, unknown>> {
  return rows.map((r) => ({
    texto: texto(r.texto),
    intencion: texto(r.intencion) || "—",
    respuesta: texto(r.respuesta),
    estado: texto(r.estado),
  }));
}

export function construir_asistente(rows: Array<Record<string, unknown>>): NoxPageDescriptor {
  const aviso: NoxUiNode = {
    component: "nox.alert",
    text: "Escribe la orden como la dirías",
    props: {
      description:
        "Escuchar y hablar lo hace la app Android de Imperium; aquí la orden se escribe. Ejemplos: «anota un pedido de 250 en la calle 5», «saqué de cambio 200», «cuánto llevo hoy», «terminar jornada».",
    },
  };
  const formulario: NoxUiNode = {
    component: "nox.form",
    props: {
      // Relativo a la app: el lanzador antepone `/api/m/subject-herramientas`.
      invoke: { method: "POST", action: "api://herr-voz/ejecutar" },
      body: { confirmado: true },
    },
    children: [
      {
        component: "nox.input-text",
        props: { name: "orden", label: "Orden", placeholder: "anota un pedido de 250 en la calle 5", required: true },
      },
      { component: "nox.button", text: "Ejecutar" },
    ],
  };
  const tabla: NoxUiNode = {
    component: "nox.table",
    text: "Sin órdenes todavía",
    props: {
      columns: [
        { key: "texto", label: "Orden" },
        { key: "intencion", label: "Intención" },
        { key: "respuesta", label: "Respuesta" },
        { key: "estado", label: "Estado" },
      ],
      rows: filas_bitacora(rows),
    },
  };
  return {
    id: "herramientas.herr-asistente",
    owner: "subject-herramientas",
    title: "Asistente",
    realms: { internal: { path: "herr-asistente", permission: PERMISO } },
    page: {
      component: "nox.page",
      props: { title: "Asistente" },
      children: [aviso, formulario, tabla],
    },
  };
}

const asistente_page: KirletPageDecl = {
  id: "herramientas.herr-asistente",
  path: "herr-asistente",
  permission: PERMISO,
  build: async ({ data }) =>
    construir_asistente(
      await data.findMany("herr_voz_bitacora", {
        where: { is_active: true },
        orderBy: { fecha_hora: "desc" },
        limit: 15,
      }),
    ),
};

export const herr_voz_pages: KirletPageDecl[] = [ajustes_page, asistente_page, bitacora_page];
