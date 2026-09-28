import { define_crud, define_module, now_iso, type DomainRow, type KirletCtx } from "@opus-perpetuus/imperium-core-kit";
import { campo_busqueda, filas_de, numero } from "../../lib/comun.ts";
import { herr_voz_flow } from "./herr-voz.flow.ts";
import { herr_voz_pages } from "./herr-voz.pages.ts";
import { herr_voz_tables } from "./herr-voz.tables.ts";

const BASE_FIELDS = {
  name: { type: "string", required: true, search: true },
  description: { type: "string", search: true },
  is_active: { type: "boolean" },
  ref: { type: "string" },
  search_field: { type: "string", search: true },
  created_by: { type: "string" },
  custom_data: { type: "json" },
  payload: { type: "json" },
} as const;

/** Umbral entre 0 y 1; el campo de búsqueda a partir del nombre. */
function completar_perfil(row: DomainRow): DomainRow {
  const out = { ...row };
  const umbral = numero(out.umbral);
  if (umbral != null) out.umbral = Math.min(1, Math.max(0, umbral));
  if (out.frases_activacion != null && !Array.isArray(out.frases_activacion)) delete out.frases_activacion;
  if (out.intenciones_activas != null && !Array.isArray(out.intenciones_activas)) delete out.intenciones_activas;
  if (typeof out.name === "string") out.search_field = campo_busqueda(out.name, out.description);
  return out;
}

/** Solo un perfil en uso: activar uno apaga los demás. */
async function unico_activo(ctx: KirletCtx, row: DomainRow): Promise<void> {
  if (row.es_activa !== true) return;
  const otros = (await filas_de(ctx, "herr_voz", { es_activa: true })).filter((f) => f.id !== row.id);
  const ts = now_iso();
  for (const f of otros) {
    await ctx.data.update("herr_voz", { id: String(f.id) }, { es_activa: false, updated_at: ts });
  }
}

const ajustes_crud = define_crud({
  resource: "herr-voz",
  table: "herr_voz",
  soft_delete: true,
  soft_delete_field: "is_active",
  history: true,
  default_sort: "name:asc",
  id_prefix: "voz",
  fields: {
    ...BASE_FIELDS,
    frases_activacion: { type: "json" },
    umbral: { type: "number" },
    intenciones_activas: { type: "json" },
    confirmar_antes: { type: "boolean" },
    idioma: { type: "string" },
    es_activa: { type: "boolean" },
  },
  options_map: { value: "id", label: "name" },
  hooks: {
    before_create: (_ctx, row) => completar_perfil({ es_activa: true, ...row }),
    before_update: (_ctx, _id, patch) => completar_perfil(patch),
    after_create: unico_activo,
    after_update: unico_activo,
  },
});

const bitacora_crud = define_crud({
  resource: "herr-voz/bitacora",
  table: "herr_voz_bitacora",
  soft_delete: true,
  soft_delete_field: "is_active",
  history: false,
  default_sort: "created_at:desc",
  id_prefix: "voz-bit",
  fields: {
    ...BASE_FIELDS,
    texto: { type: "string", search: true },
    intencion: { type: "string", search: true },
    confianza: { type: "number" },
    ambiguo: { type: "boolean" },
    datos: { type: "json" },
    resultado: { type: "json" },
    respuesta: { type: "string", search: true },
    estado: { type: "string", search: true },
    fecha_hora: { type: "string" },
  },
  options_map: { value: "id", label: "name" },
});

export const herr_voz_module = define_module({
  resource: "herr-voz",
  labels: {
    singular: "Asistente de voz",
    plural: "Asistente de voz",
    read: "Ver el asistente de voz",
    write: "Editar el asistente de voz",
  },
  // Las rutas literales (`/interpretar`, `/ejecutar`, `/bitacora`) van antes
  // del CRUD de ajustes, o `GET /herr-voz/:id` se las traga.
  routes: [...herr_voz_flow, ...bitacora_crud, ...ajustes_crud],
  tables: herr_voz_tables,
  pages: herr_voz_pages,
  menu: [
    {
      id: "herramientas.herr-asistente",
      label: "Asistente",
      order: 60,
      pageId: "herramientas.herr-asistente",
      path: "herr-asistente",
      permission: "subject.herramientas.herr-voz.read",
      icon: "fa-microphone-lines",
    },
    {
      id: "herramientas.herr-voz",
      label: "Ajustes del asistente",
      order: 61,
      pageId: "herramientas.herr-voz",
      path: "herr-voz",
      permission: "subject.herramientas.herr-voz.read",
      icon: "fa-sliders",
    },
    {
      id: "herramientas.herr-voz-bitacora",
      label: "Bitácora del asistente",
      order: 62,
      pageId: "herramientas.herr-voz-bitacora",
      path: "herr-voz-bitacora",
      permission: "subject.herramientas.herr-voz.read",
      icon: "fa-clock-rotate-left",
    },
  ],
});
