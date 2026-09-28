import type { KirletTableDecl } from "@opus-perpetuus/imperium-core-kit";

export const herr_menu_promos_tables: KirletTableDecl[] = [
  {
    name: "herr_menu_promos",
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
      /** Pesos primero y porcentaje después, sobre lo que de verdad se cobra. */
      { name: "descuento_pesos", type: "real" },
      { name: "descuento_pct", type: "real" },
      { name: "activa", type: "boolean", default: true },
    ],
    indexes: [
      { name: "idx_herr_menu_promos_name", columns: ["name"] },
      { name: "idx_herr_menu_promos_active", columns: ["is_active"] },
    ],
  },
];
