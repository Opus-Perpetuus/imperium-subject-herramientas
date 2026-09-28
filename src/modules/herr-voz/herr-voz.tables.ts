import type { KirletColumnDecl, KirletTableDecl } from "@opus-perpetuus/imperium-core-kit";

const BASE: KirletColumnDecl[] = [
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
];

export const herr_voz_tables: KirletTableDecl[] = [
  {
    // Ajustes del asistente; una fila activa (`es_activa`). `name` = perfil.
    name: "herr_voz",
    columns: [
      ...BASE,
      { name: "frases_activacion", type: "json" },
      { name: "umbral", type: "real", default: 0.55 },
      { name: "intenciones_activas", type: "json" },
      { name: "confirmar_antes", type: "boolean", default: true },
      { name: "idioma", type: "text", default: "es-MX" },
      { name: "es_activa", type: "boolean", default: true },
    ],
    indexes: [
      { name: "idx_herr_voz_active", columns: ["is_active"] },
      { name: "idx_herr_voz_es_activa", columns: ["es_activa"] },
    ],
  },
  {
    // Cada orden recibida: qué se entendió, qué se hizo y qué se contestó.
    name: "herr_voz_bitacora",
    columns: [
      ...BASE,
      { name: "texto", type: "text" },
      { name: "intencion", type: "text" },
      { name: "confianza", type: "real" },
      { name: "ambiguo", type: "boolean", default: false },
      { name: "datos", type: "json" },
      { name: "resultado", type: "json" },
      { name: "respuesta", type: "text" },
      { name: "estado", type: "text" },
      { name: "fecha_hora", type: "text" },
    ],
    indexes: [
      { name: "idx_herr_voz_bitacora_active", columns: ["is_active"] },
      { name: "idx_herr_voz_bitacora_fecha", columns: ["fecha_hora"] },
    ],
  },
];
