import type { KirletTableDecl } from "@opus-perpetuus/imperium-core-kit";

/**
 * Ajustes de reparto por vehículo. El registro del vehículo es la app
 * `subject-vehiculos` (tabla `vehicle`); aquí solo va lo que el reparto
 * necesita saber de él, con `vehiculo_id` como clave.
 */
export const herr_vehiculos_tables: KirletTableDecl[] = [
  {
    name: "herr_vehiculos",
    columns: [
      { name: "id", type: "text", primaryKey: true },
      /** Snapshot del nombre del vehículo externo. */
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
      /** Id del `vehicle` de subject-vehiculos. Un solo juego de ajustes por vehículo. */
      { name: "vehiculo_id", type: "text", notNull: true, unique: true },
      /** Snapshot opcional de las placas. */
      { name: "placa", type: "text" },
      { name: "tanque_litros", type: "real" },
      { name: "velocimetro", type: "boolean", default: true },
      { name: "medidor", type: "text" },
      { name: "marcas", type: "integer" },
      { name: "divisiones", type: "integer" },
      { name: "aguja_fuera", type: "boolean" },
      { name: "solo_gps", type: "boolean" },
      { name: "catalogo_tanque_id", type: "text" },
      /** Calibración aprendida: litros por sección del medidor. Se recalcula con cada recarga. */
      { name: "litros_por_paso", type: "json" },
      { name: "notas", type: "text" },
    ],
    indexes: [
      { name: "idx_herr_vehiculos_name", columns: ["name"] },
      { name: "idx_herr_vehiculos_active", columns: ["is_active"] },
    ],
  },
];
