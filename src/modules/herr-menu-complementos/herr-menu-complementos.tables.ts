import type { KirletTableDecl } from "@opus-perpetuus/imperium-core-kit";

export const herr_menu_complementos_tables: KirletTableDecl[] = [
  {
    name: "herr_menu_complementos",
    columns: [
      { name: "id", type: "text", primaryKey: true },
      /** El grupo («Alitas»); una variante es otra fila del mismo grupo. */
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
      { name: "variante", type: "text" },
      { name: "precio", type: "real" },
      { name: "activo", type: "boolean", default: true },
    ],
    indexes: [
      { name: "idx_herr_menu_complementos_name", columns: ["name"] },
      { name: "idx_herr_menu_complementos_active", columns: ["is_active"] },
    ],
  },
];
