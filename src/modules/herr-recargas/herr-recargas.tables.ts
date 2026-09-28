import type { KirletTableDecl } from "@opus-perpetuus/imperium-core-kit";

export const herr_recargas_tables: KirletTableDecl[] = [
  {
    name: "herr_recargas",
    columns: [
      { name: "id", type: "text", primaryKey: true },
      /** «Recarga <fecha> · <vehículo>», se rellena solo. */
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
      { name: "vehiculo_id", type: "text" },
      { name: "fecha_hora", type: "text" },
      { name: "km", type: "real" },
      { name: "pesos", type: "real" },
      { name: "precio_litro", type: "real" },
      { name: "litros", type: "real" },
      /** Lectura del medidor «paso/pasos» o litros. */
      { name: "nivel_antes", type: "text" },
      { name: "nivel_despues", type: "text" },
      { name: "tanque_lleno", type: "boolean" },
      { name: "jornada_id", type: "text" },
      /** Litros tecleados, o pesos ÷ precio. */
      { name: "litros_efectivos", type: "real" },
      /** Los litros no se teclearon: salieron de pesos ÷ precio. */
      { name: "aproximado", type: "boolean" },
    ],
    indexes: [
      { name: "idx_herr_recargas_vehiculo", columns: ["vehiculo_id"] },
      { name: "idx_herr_recargas_jornada", columns: ["jornada_id"] },
      { name: "idx_herr_recargas_active", columns: ["is_active"] },
    ],
  },
];
