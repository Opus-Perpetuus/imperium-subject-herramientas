import type { KirletTableDecl } from "@opus-perpetuus/imperium-core-kit";

export const herr_menu_tamanos_tables: KirletTableDecl[] = [
  {
    name: "herr_menu_tamanos",
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
      /** Precio por columna de categoría; vacío = no se vende en este tamaño. */
      { name: "precio_1", type: "real" },
      { name: "precio_2", type: "real" },
      { name: "precio_3", type: "real" },
      /** «1,2,4» = entero, mitades y cuartos. */
      { name: "divisible", type: "text", default: "1,2,4" },
      { name: "orden", type: "integer" },
    ],
    indexes: [
      { name: "idx_herr_menu_tamanos_name", columns: ["name"] },
      { name: "idx_herr_menu_tamanos_active", columns: ["is_active"] },
    ],
  },
];
