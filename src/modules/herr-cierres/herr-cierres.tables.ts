import type { KirletTableDecl } from "@opus-perpetuus/imperium-core-kit";

export const herr_cierres_tables: KirletTableDecl[] = [
  {
    name: "herr_cierres",
    columns: [
      { name: "id", type: "text", primaryKey: true },
      { name: "name", type: "text", notNull: true },
      { name: "description", type: "text" },
      { name: "is_active", type: "boolean", notNull: true, default: true },
      { name: "ref", type: "text", unique: true },
      { name: "search_field", type: "text" },
      { name: "created_by", type: "text" },
      /** `{ registro_id }`: la fila de `herr_registros` que se archivó. */
      { name: "custom_data", type: "json" },
      { name: "payload", type: "json" },
      { name: "created_at", type: "text", notNull: true },
      { name: "updated_at", type: "text", notNull: true },
      { name: "tabla_id", type: "text" },
      { name: "cierre_id", type: "text" },
      { name: "cerrado_at", type: "text" },
      /** Valores congelados: capturados, calculados, resúmenes y fijos del momento, `cierre` y `cierre_id`. */
      { name: "valores", type: "json" },
    ],
    indexes: [
      { name: "idx_herr_cierres_tabla", columns: ["tabla_id"] },
      { name: "idx_herr_cierres_cierre", columns: ["cierre_id"] },
      { name: "idx_herr_cierres_active", columns: ["is_active"] },
    ],
  },
];
