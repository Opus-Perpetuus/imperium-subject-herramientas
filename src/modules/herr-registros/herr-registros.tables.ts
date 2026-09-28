import type { KirletTableDecl } from "@opus-perpetuus/imperium-core-kit";

export const herr_registros_tables: KirletTableDecl[] = [
  {
    name: "herr_registros",
    columns: [
      { name: "id", type: "text", primaryKey: true },
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
      { name: "tabla_id", type: "text" },
      /** clave → valor en texto tal como se capturó (fotos: id/URL del archivo). */
      { name: "valores", type: "json" },
      /** clave → valor de los campos calculados; los fallos como `⚠ mensaje`. */
      { name: "calculados", type: "json" },
    ],
    indexes: [
      { name: "idx_herr_registros_tabla", columns: ["tabla_id"] },
      { name: "idx_herr_registros_name", columns: ["name"] },
      { name: "idx_herr_registros_active", columns: ["is_active"] },
    ],
  },
];
