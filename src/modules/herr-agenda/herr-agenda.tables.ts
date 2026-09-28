import type { KirletTableDecl } from "@opus-perpetuus/imperium-core-kit";

export const herr_agenda_tables: KirletTableDecl[] = [
  {
    // Un evento de la agenda; `name` es el título.
    name: "herr_agenda",
    columns: [
      { name: "id", type: "text", primaryKey: true },
      { name: "name", type: "text", notNull: true },
      { name: "description", type: "text" },
      { name: "is_active", type: "boolean", notNull: true, default: true },
      { name: "ref", type: "text" },
      { name: "search_field", type: "text" },
      { name: "created_by", type: "text" },
      { name: "custom_data", type: "json" },
      { name: "payload", type: "json" },
      { name: "created_at", type: "text", notNull: true },
      { name: "updated_at", type: "text", notNull: true },
      { name: "fecha", type: "text", notNull: true },
      // Minutos desde medianoche; NULL = todo el día.
      { name: "inicio_minuto", type: "integer" },
      { name: "duracion_min", type: "integer", notNull: true, default: 60 },
      // -1 = sin aviso.
      { name: "recordatorio_min", type: "integer", notNull: true, default: 15 },
      { name: "alarma", type: "boolean", notNull: true, default: false },
      { name: "nota", type: "text" },
      { name: "hecho", type: "boolean", notNull: true, default: false },
      // Id del evento en el calendario del teléfono, para actualizar en vez de duplicar.
      { name: "proveedor_evento_id", type: "text" },
      // Instante ISO del aviso, calculado en la zona del usuario.
      { name: "recordatorio_en", type: "text" },
    ],
    indexes: [
      { name: "idx_herr_agenda_fecha", columns: ["fecha"] },
      { name: "idx_herr_agenda_recordatorio", columns: ["recordatorio_en"] },
    ],
  },
];
