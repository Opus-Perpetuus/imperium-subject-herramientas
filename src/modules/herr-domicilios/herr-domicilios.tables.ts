import type { KirletTableDecl } from "@opus-perpetuus/imperium-core-kit";

export const herr_domicilios_tables: KirletTableDecl[] = [
  {
    name: "herr_domicilios",
    columns: [
      { name: "id", type: "text", primaryKey: true },
      /** Alias del domicilio: «Morelos 45», «la de la reja verde». */
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
      { name: "lat", type: "real" },
      { name: "lon", type: "real" },
      { name: "calle", type: "text" },
      { name: "numero", type: "text" },
      { name: "colonia", type: "text" },
      { name: "referencia", type: "text" },
      { name: "contacto_nombre", type: "text" },
      { name: "telefono", type: "text" },
      /** Ids de `herr_etiquetas`. */
      { name: "etiquetas", type: "json" },
      { name: "veces", type: "integer", default: 0 },
      { name: "ultima_entrega", type: "text" },
      { name: "notas", type: "text" },
    ],
    indexes: [
      { name: "idx_herr_domicilios_name", columns: ["name"] },
      { name: "idx_herr_domicilios_active", columns: ["is_active"] },
      { name: "idx_herr_domicilios_lat", columns: ["lat"] },
    ],
  },
];
