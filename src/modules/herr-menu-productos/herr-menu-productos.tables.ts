import type { KirletTableDecl } from "@opus-perpetuus/imperium-core-kit";

export const herr_menu_productos_tables: KirletTableDecl[] = [
  {
    name: "herr_menu_productos",
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
      { name: "categoria_id", type: "text" },
      /** Descriptivos: dicen qué lleva, no qué cuesta. */
      { name: "ingredientes", type: "text" },
      { name: "activo", type: "boolean", default: true },
    ],
    indexes: [
      { name: "idx_herr_menu_productos_name", columns: ["name"] },
      { name: "idx_herr_menu_productos_active", columns: ["is_active"] },
      { name: "idx_herr_menu_productos_categoria", columns: ["categoria_id"] },
    ],
  },
];
