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
      /** Las miniaturas de las fotos del registro archivado. */
      { name: "miniaturas", type: "json" },
    ],
    indexes: [
      { name: "idx_herr_cierres_tabla", columns: ["tabla_id"] },
      { name: "idx_herr_cierres_cierre", columns: ["cierre_id"] },
      { name: "idx_herr_cierres_active", columns: ["is_active"] },
    ],
  },
  {
    /** Un cierre hecho: su nombre (`name`), fecha, datos del formulario y totales del momento. */
    name: "herr_cierres_encabezados",
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
      { name: "tabla_id", type: "text", notNull: true },
      /** El de las filas archivadas en `herr_cierres` (único junto con `tabla_id`). */
      { name: "cierre_id", type: "text", notNull: true },
      /** `AAAA-MM-DD` que eligió quien cerró; `cerrado_at` es cuándo se hizo. */
      { name: "fecha", type: "text" },
      { name: "cerrado_at", type: "text" },
      /** clave de `campos_cierre` → valor capturado. */
      { name: "campos", type: "json" },
      /** clave de cada resumen de la tabla → su texto al cerrar. */
      { name: "resumenes", type: "json" },
      { name: "filas", type: "integer" },
    ],
    indexes: [
      { name: "idx_herr_cierres_encabezados_tabla", columns: ["tabla_id"] },
      { name: "idx_herr_cierres_encabezados_active", columns: ["is_active"] },
    ],
  },
];
