import type { KirletTableDecl } from "@opus-perpetuus/imperium-core-kit";

export const herr_menu_categorias_tables: KirletTableDecl[] = [
  {
    name: "herr_menu_categorias",
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
      /** De qué columna `precio_N` del tamaño sale el precio (1..3). */
      { name: "columna_precio", type: "integer" },
    ],
    indexes: [
      { name: "idx_herr_menu_categorias_name", columns: ["name"] },
      { name: "idx_herr_menu_categorias_active", columns: ["is_active"] },
    ],
  },
];
