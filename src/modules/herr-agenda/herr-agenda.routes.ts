import { define_crud, define_module, type DomainRow } from "@opus-perpetuus/imperium-core-kit";
import { campo_busqueda, con_defecto, numero, sin_vacios, solo_dia } from "../../lib/comun.ts";
import {
  ADELANTO_POR_DEFECTO,
  DURACION_POR_DEFECTO,
  adelanto_valido,
  evento_desde,
  fecha_valida,
  recordatorio_en,
} from "../../lib/agenda/recordatorio.ts";
import { herr_agenda_flow, zona_de } from "./herr-agenda.flow.ts";
import { herr_agenda_pages } from "./herr-agenda.pages.ts";
import { herr_agenda_tables } from "./herr-agenda.tables.ts";

/** Lo que se deriva de la fila completa: el instante del aviso y la búsqueda. */
function derivados(fila: DomainRow): DomainRow {
  return {
    recordatorio_en: recordatorio_en(evento_desde(fila), zona_de(fila)),
    search_field: campo_busqueda(fila.name, fila.fecha, fila.nota, fila.description),
  };
}

const eventos = define_crud({
  resource: "herr-agenda",
  table: "herr_agenda",
  soft_delete: true,
  soft_delete_field: "is_active",
  history: true,
  default_sort: "fecha:desc",
  id_prefix: "herr-agenda",
  fields: {
    name: { type: "string", required: true, search: true },
    description: { type: "string", search: true },
    is_active: { type: "boolean" },
    ref: { type: "string" },
    search_field: { type: "string", search: true },
    created_by: { type: "string" },
    custom_data: { type: "json" },
    payload: { type: "json" },
    fecha: {
      type: "string",
      required: true,
      normalize: solo_dia,
      validate: (v) => (v == null || v === "" || fecha_valida(v) ? null : "fecha debe ser AAAA-MM-DD"),
    },
    inicio_minuto: {
      type: "number",
      normalize: (v) => (v === "" ? null : v),
      validate: (v) => {
        const n = numero(v);
        return v == null || (n !== null && Number.isInteger(n) && n >= 0 && n < 1440)
          ? null
          : "inicio_minuto debe ser un entero entre 0 y 1439";
      },
    },
    duracion_min: {
      type: "number",
      normalize: con_defecto(DURACION_POR_DEFECTO),
      validate: (v) => (v == null || (numero(v) ?? -1) >= 0 ? null : "duracion_min no puede ser negativa"),
    },
    recordatorio_min: {
      type: "number",
      normalize: con_defecto(ADELANTO_POR_DEFECTO),
      validate: (v) => (v == null || adelanto_valido(numero(v)) ? null : "recordatorio_min no es una antelación válida"),
    },
    alarma: { type: "boolean", normalize: con_defecto(false) },
    nota: { type: "string", search: true },
    hecho: { type: "boolean", normalize: con_defecto(false) },
    proveedor_evento_id: { type: "string" },
    // Calculado en el hook: lo que mande el cliente (p. ej. el documento completo en un PUT) se pisa.
    recordatorio_en: { type: "string" },
  },
  options_map: { value: "id", label: "name" },
  hooks: {
    before_create: (ctx, row) => {
      const fila: DomainRow = {
        inicio_minuto: null,
        duracion_min: DURACION_POR_DEFECTO,
        recordatorio_min: ADELANTO_POR_DEFECTO,
        alarma: false,
        nota: "",
        hecho: false,
        ...row,
        is_active: row.is_active ?? true,
        created_by: ctx.actor,
      };
      return { ...fila, ...derivados(fila) };
    },
    before_update: (_ctx, _id, patch, existing) => {
      const { created_by: _, ...resto } = patch;
      const cambios = sin_vacios(resto, ["name", "fecha", "is_active"]);
      return { ...cambios, ...derivados({ ...existing, ...cambios }) };
    },
  },
});

export const herr_agenda_module = define_module({
  resource: "herr-agenda",
  labels: {
    singular: "Evento",
    plural: "Agenda",
    read: "Ver agenda",
    write: "Editar agenda",
  },
  // Literales primero: `/rango` y `/recordatorios` caerían en el `/:id` del CRUD.
  routes: [...herr_agenda_flow, ...eventos],
  tables: herr_agenda_tables,
  pages: herr_agenda_pages,
  menu: [
    {
      id: "herramientas-nav-agenda",
      label: "Agenda",
      order: 50,
      icon: "fa-calendar",
      children: [
        {
          id: "herramientas-herr-agenda",
          label: "Eventos",
          order: 10,
          pageId: "herramientas.herr-agenda",
          path: "/herr-agenda",
          permission: "subject.herramientas.herr-agenda.read",
          icon: "fa-calendar-days",
        },
        {
          id: "herramientas-herr-agenda-dia",
          label: "Hoy",
          order: 20,
          pageId: "herramientas.herr-agenda-dia",
          path: "/herr-agenda-dia",
          permission: "subject.herramientas.herr-agenda.read",
          icon: "fa-calendar-day",
        },
      ],
    },
  ],
});
