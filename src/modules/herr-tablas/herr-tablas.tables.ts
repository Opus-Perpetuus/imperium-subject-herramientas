import type { KirletTableDecl } from "@opus-perpetuus/imperium-core-kit";

export const herr_tablas_tables: KirletTableDecl[] = [
  {
    name: "herr_tablas",
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
      { name: "icono", type: "text" },
      /** `CampoSpec[]` (ver lib/formulas/esquema.ts). */
      { name: "campos", type: "json" },
      /** `ConstanteTabla[]`. */
      { name: "constantes", type: "json" },
      /** `ResumenTabla[]`. */
      { name: "resumenes", type: "json" },
      { name: "plantilla_id", type: "text" },
      { name: "orden_campo", type: "text" },
      { name: "orden_desc", type: "boolean" },
      { name: "cerrable", type: "boolean", notNull: true, default: true },
      /** `CampoSpec[]`: lo que pide el formulario de un cierre además del nombre y la fecha. */
      { name: "campos_cierre", type: "json" },
      { name: "version_esquema", type: "integer" },
    ],
    indexes: [
      { name: "idx_herr_tablas_name", columns: ["name"] },
      { name: "idx_herr_tablas_active", columns: ["is_active"] },
    ],
  },
];
