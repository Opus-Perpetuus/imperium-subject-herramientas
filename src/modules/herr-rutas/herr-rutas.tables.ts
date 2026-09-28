import type { KirletTableDecl } from "@opus-perpetuus/imperium-core-kit";

export const herr_rutas_tables: KirletTableDecl[] = [
  {
    name: "herr_rutas",
    columns: [
      { name: "id", type: "text", primaryKey: true },
      /** «Ruta <fecha>». */
      { name: "name", type: "text", notNull: true },
      { name: "description", type: "text" },
      { name: "is_active", type: "boolean", notNull: true, default: true },
      { name: "ref", type: "text", unique: true },
      { name: "search_field", type: "text" },
      { name: "created_by", type: "text" },
      { name: "custom_data", type: "json" },
      { name: "payload", type: "json" },
      { name: "created_at", type: "text", notNull: true },
      { name: "updated_at", type: "text", notNull: true },
      { name: "jornada_id", type: "text" },
      { name: "iniciada", type: "text" },
      { name: "terminada", type: "text" },
      /** `[{ t, lat, lon, acc?, spd? }]` crudos; el analizador descarta los imprecisos. */
      { name: "puntos", type: "json" },
      { name: "distancia_m", type: "real" },
      /** Último informe del analizador. */
      { name: "informe", type: "json" },
    ],
    indexes: [
      { name: "idx_herr_rutas_jornada", columns: ["jornada_id"] },
      { name: "idx_herr_rutas_active", columns: ["is_active"] },
    ],
  },
];
