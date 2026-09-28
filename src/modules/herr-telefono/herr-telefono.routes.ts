import {
  define_crud,
  define_module,
  now_iso,
  type CrudFieldSpec,
  type DomainRow,
  type KirletCtx,
} from "@opus-perpetuus/imperium-core-kit";
import { campo_busqueda, con_defecto, filas_de, normalizar, sin_vacios, texto } from "../../lib/comun.ts";
import { ACCIONES_DESCONOCIDOS, AMBITOS, ORIGENES, REGLAS_POR_DEFECTO } from "../../lib/telefono/decision.ts";
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

/** Valores de un perfil nuevo; también los que toma un campo NOT NULL que llega vacío. */
const PERFIL_POR_DEFECTO = { ...REGLAS_POR_DEFECTO, es_activa: false };

/**
 * El autor lo fija el servidor: lo que mande el cliente se ignora al crear y no
 * se puede cambiar. Las columnas NOT NULL sin valor por defecto que llegan
 * vacías conservan lo guardado.
 */
function sin_autor(patch: DomainRow, no_nulas: readonly string[]): DomainRow {
  const { created_by: _, ...resto } = patch;
  return sin_vacios(resto, ["name", "is_active", ...no_nulas]);
}

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
    activo: { type: "boolean", normalize: con_defecto(PERFIL_POR_DEFECTO.activo) },
    ambito: {
      type: "string",
      normalize: con_defecto(PERFIL_POR_DEFECTO.ambito),
      validate: opcion_de(AMBITOS, "ambito"),
    },
    accion_desconocidos: {
      type: "string",
      normalize: con_defecto(PERFIL_POR_DEFECTO.accion_desconocidos),
      validate: opcion_de(ACCIONES_DESCONOCIDOS, "accion_desconocidos"),
    },
    retardo_s: { type: "number", normalize: con_defecto(PERFIL_POR_DEFECTO.retardo_s) },
    anuncio_activo: { type: "boolean", normalize: con_defecto(PERFIL_POR_DEFECTO.anuncio_activo) },
    anuncio_plantilla: { type: "string", normalize: con_defecto(PERFIL_POR_DEFECTO.anuncio_plantilla) },
    anuncio_repeticiones: { type: "number", normalize: con_defecto(PERFIL_POR_DEFECTO.anuncio_repeticiones) },
    anunciar_desconocidos: { type: "boolean", normalize: con_defecto(PERFIL_POR_DEFECTO.anunciar_desconocidos) },
    anuncio_idioma: { type: "string" },
    whatsapp_activo: { type: "boolean", normalize: con_defecto(PERFIL_POR_DEFECTO.whatsapp_activo) },
    whatsapp_plantilla: { type: "string", normalize: con_defecto(PERFIL_POR_DEFECTO.whatsapp_plantilla) },
    conduciendo_activo: { type: "boolean", normalize: con_defecto(PERFIL_POR_DEFECTO.conduciendo_activo) },
    es_activa: { type: "boolean", normalize: con_defecto(PERFIL_POR_DEFECTO.es_activa) },
  },
  options_map: { value: "id", label: "name" },
  hooks: {
    before_create: (ctx, row) => ({
      ...PERFIL_POR_DEFECTO,
      ...row,
      is_active: row.is_active ?? true,
      created_by: ctx.actor,
      search_field: campo_busqueda(row.name, row.description, row.ambito),
    }),
    after_create: async (ctx, row) => {
      if (row.es_activa === true) await desactivar_otros(ctx, String(row.id));
    },
    before_update: (_ctx, _id, patch, existing) => {
      const cambios = sin_autor(patch, []);
      const fila = { ...existing, ...cambios };
      return { ...cambios, search_field: campo_busqueda(fila.name, fila.description, fila.ambito) };
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
    modo: { type: "string", normalize: con_defecto("seleccionado"), validate: opcion_de(MODOS, "modo") },
  },
  options_map: { value: "id", label: "name" },
  hooks: {
    before_create: (ctx, row) => ({
      modo: "seleccionado",
      ...row,
      is_active: row.is_active ?? true,
      created_by: ctx.actor,
      // Sin clave de la agenda del teléfono, el nombre normalizado identifica al contacto.
      clave: texto(row.clave) || normalizar(row.name),
      search_field: campo_busqueda(row.name, row.telefono, row.modo),
    }),
    before_update: (_ctx, _id, patch, existing) => {
      const cambios = sin_autor(patch, ["regla_id"]);
      const fila = { ...existing, ...cambios };
      if ("clave" in cambios && !texto(cambios.clave)) cambios.clave = normalizar(fila.name);
      return { ...cambios, search_field: campo_busqueda(fila.name, fila.telefono, fila.modo) };
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
    origen: { type: "string", normalize: con_defecto("telefono"), validate: opcion_de(ORIGENES, "origen") },
    conduciendo: { type: "boolean", normalize: con_defecto(false) },
  },
  options_map: { value: "id", label: "name" },
  hooks: {
    before_create: (ctx, row) => {
      const llamante = { conocido: false, nombre: texto(row.contacto_nombre), numero: texto(row.numero) };
      const fila: DomainRow = {
        origen: "telefono",
        conduciendo: false,
        ...row,
        is_active: row.is_active ?? true,
        fecha_hora: texto(row.fecha_hora) || row.created_at,
        created_by: ctx.actor,
      };
      fila.name = texto(row.name) || nombre_llamada(texto(row.decision), llamante);
      fila.search_field = campo_busqueda(fila.name, fila.numero, fila.contacto_nombre, fila.motivo);
      return fila;
    },
    before_update: (_ctx, _id, patch) => sin_autor(patch, ["decision", "fecha_hora"]),
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
