import {
  define_crud,
  define_module,
  now_iso,
  type CrudFieldSpec,
  type DomainRow,
  type KirletCtx,
} from "@opus-perpetuus/imperium-core-kit";
import { campo_busqueda, filas_de, normalizar, texto } from "../../lib/comun.ts";
import { ACCIONES_DESCONOCIDOS, AMBITOS, ORIGENES } from "../../lib/telefono/decision.ts";
import { herr_telefono_flow, nombre_llamada } from "./herr-telefono.flow.ts";
import { herr_telefono_pages } from "./herr-telefono.pages.ts";
import { herr_telefono_tables } from "./herr-telefono.tables.ts";

const MODOS = ["seleccionado", "rechazado"] as const;
const DECISIONES = ["contestada", "rechazada", "silenciada", "permitida"] as const;

const BASE_FIELDS: Record<string, CrudFieldSpec> = {
  description: { type: "string", search: true },
  is_active: { type: "boolean" },
  ref: { type: "string" },
  search_field: { type: "string", search: true },
  created_by: { type: "string" },
  custom_data: { type: "json" },
  payload: { type: "json" },
};

/** Valor vacío o uno del catálogo; lo demás es 400. */
function opcion_de(valores: readonly string[], etiqueta: string): CrudFieldSpec["validate"] {
  return (v) => (v == null || v === "" || valores.includes(String(v)) ? null : `${etiqueta} no válido`);
}

/** Al activar un perfil, los demás dejan de serlo: solo hay uno vigente. */
async function desactivar_otros(ctx: KirletCtx, id: string): Promise<void> {
  const otros = (await filas_de(ctx, "herr_telefono", { es_activa: true })).filter((p) => String(p.id) !== id);
  const ts = now_iso();
  for (const p of otros) {
    await ctx.data.update("herr_telefono", { id: String(p.id) }, { es_activa: false, updated_at: ts });
  }
}

const perfiles = define_crud({
  resource: "herr-telefono",
  table: "herr_telefono",
  soft_delete: true,
  soft_delete_field: "is_active",
  history: true,
  default_sort: "name:asc",
  id_prefix: "herr-tel",
  fields: {
    name: { type: "string", required: true, search: true },
    ...BASE_FIELDS,
    activo: { type: "boolean" },
    ambito: { type: "string", validate: opcion_de(AMBITOS, "ambito") },
    accion_desconocidos: { type: "string", validate: opcion_de(ACCIONES_DESCONOCIDOS, "accion_desconocidos") },
    retardo_s: { type: "number" },
    anuncio_activo: { type: "boolean" },
    anuncio_plantilla: { type: "string" },
    anuncio_repeticiones: { type: "number" },
    anunciar_desconocidos: { type: "boolean" },
    anuncio_idioma: { type: "string" },
    whatsapp_activo: { type: "boolean" },
    whatsapp_plantilla: { type: "string" },
    conduciendo_activo: { type: "boolean" },
    es_activa: { type: "boolean" },
  },
  options_map: { value: "id", label: "name" },
  hooks: {
    before_create: (_ctx, row) => ({
      activo: false,
      ambito: "nadie",
      accion_desconocidos: "permitir",
      retardo_s: 5,
      anuncio_activo: true,
      anuncio_plantilla: "Llamada de {nombre}",
      anuncio_repeticiones: 2,
      anunciar_desconocidos: true,
      whatsapp_activo: true,
      whatsapp_plantilla: "Llamada de WhatsApp de {nombre}",
      conduciendo_activo: false,
      es_activa: false,
      ...row,
      search_field: campo_busqueda(row.name, row.description, row.ambito),
    }),
    after_create: async (ctx, row) => {
      if (row.es_activa === true) await desactivar_otros(ctx, String(row.id));
    },
    before_update: (_ctx, _id, patch, existing) => {
      const fila = { ...existing, ...patch };
      return { ...patch, search_field: campo_busqueda(fila.name, fila.description, fila.ambito) };
    },
    after_update: async (ctx, row) => {
      if (row.es_activa === true) await desactivar_otros(ctx, String(row.id));
    },
  },
});

const contactos = define_crud({
  resource: "herr-telefono/contactos",
  table: "herr_telefono_contactos",
  soft_delete: true,
  soft_delete_field: "is_active",
  history: true,
  default_sort: "name:asc",
  id_prefix: "herr-tel-cont",
  fields: {
    name: { type: "string", required: true, search: true },
    ...BASE_FIELDS,
    regla_id: { type: "string", required: true },
    telefono: { type: "string", search: true },
    clave: { type: "string", search: true },
    modo: { type: "string", validate: opcion_de(MODOS, "modo") },
  },
  options_map: { value: "id", label: "name" },
  hooks: {
    before_create: (_ctx, row) => ({
      modo: "seleccionado",
      ...row,
      // Sin clave de la agenda del teléfono, el nombre normalizado identifica al contacto.
      clave: texto(row.clave) || normalizar(row.name),
      search_field: campo_busqueda(row.name, row.telefono, row.modo),
    }),
    before_update: (_ctx, _id, patch, existing) => {
      const fila = { ...existing, ...patch };
      return { ...patch, search_field: campo_busqueda(fila.name, fila.telefono, fila.modo) };
    },
  },
});

const llamadas = define_crud({
  resource: "herr-telefono/llamadas",
  table: "herr_telefono_llamadas",
  soft_delete: true,
  soft_delete_field: "is_active",
  history: false,
  default_sort: "fecha_hora:desc",
  id_prefix: "herr-llam",
  fields: {
    // El alta desde Android no trae nombre: se compone en el hook.
    name: { type: "string", search: true },
    ...BASE_FIELDS,
    numero: { type: "string", search: true },
    contacto_nombre: { type: "string", search: true },
    decision: { type: "string", required: true, validate: opcion_de(DECISIONES, "decision") },
    motivo: { type: "string" },
    fecha_hora: { type: "string" },
    origen: { type: "string", validate: opcion_de(ORIGENES, "origen") },
    conduciendo: { type: "boolean" },
  },
  options_map: { value: "id", label: "name" },
  hooks: {
    before_create: (_ctx, row) => {
      const llamante = { conocido: false, nombre: texto(row.contacto_nombre), numero: texto(row.numero) };
      const fila: DomainRow = {
        origen: "telefono",
        conduciendo: false,
        fecha_hora: row.created_at,
        ...row,
      };
      fila.name = texto(row.name) || nombre_llamada(texto(row.decision), llamante);
      fila.search_field = campo_busqueda(fila.name, fila.numero, fila.contacto_nombre, fila.motivo);
      return fila;
    },
  },
});

export const herr_telefono_module = define_module({
  resource: "herr-telefono",
  labels: {
    singular: "Teléfono",
    plural: "Teléfono",
    read: "Ver contestador",
    write: "Editar contestador",
  },
  // El orden manda: primero las rutas literales, luego los sub-recursos y al
  // final el CRUD del perfil, cuyo `/:id` se comería `/activa` o `/contactos`.
  routes: [...herr_telefono_flow, ...contactos, ...llamadas, ...perfiles],
  tables: herr_telefono_tables,
  pages: herr_telefono_pages,
  menu: [
    {
      id: "herramientas-nav-telefono",
      label: "Teléfono",
      order: 30,
      icon: "fa-phone",
      children: [
        {
          id: "herramientas-herr-telefono",
          label: "Contestador",
          order: 10,
          pageId: "herramientas.herr-telefono",
          path: "/herr-telefono",
          permission: "subject.herramientas.herr-telefono.read",
          icon: "fa-phone-volume",
        },
        {
          id: "herramientas-herr-telefono-contactos",
          label: "Contactos",
          order: 20,
          pageId: "herramientas.herr-telefono-contactos",
          path: "/herr-telefono-contactos",
          permission: "subject.herramientas.herr-telefono.read",
          icon: "fa-address-book",
        },
        {
          id: "herramientas-herr-telefono-llamadas",
          label: "Llamadas",
          order: 30,
          pageId: "herramientas.herr-telefono-llamadas",
          path: "/herr-telefono-llamadas",
          permission: "subject.herramientas.herr-telefono.read",
          icon: "fa-phone-slash",
        },
        {
          id: "herramientas-herr-telefono-android",
          label: "En el teléfono",
          order: 40,
          pageId: "herramientas.herr-telefono-android",
          path: "/herr-telefono-android",
          permission: "subject.herramientas.herr-telefono.read",
          icon: "fa-mobile-screen",
        },
      ],
    },
  ],
});
