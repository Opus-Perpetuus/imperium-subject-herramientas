import type { KirletTableDecl } from "@opus-perpetuus/imperium-core-kit";

export const herr_jornadas_tables: KirletTableDecl[] = [
  {
    name: "herr_jornadas",
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
      { name: "fecha", type: "text" },
      { name: "hora_inicio", type: "text" },
      { name: "hora_fin", type: "text" },
      /** El vehículo actual (el último tramo). */
      { name: "vehiculo_id", type: "text" },
      { name: "vehiculo_nombre", type: "text" },
      /** `abierta` | `cerrada`. */
      { name: "estado", type: "text", default: "abierta" },
      { name: "km_inicial", type: "real" },
      { name: "km_final", type: "real" },
      /** Distancia por GPS del día: respaldo cuando no hay odómetro. */
      { name: "km_gps", type: "real" },
      /** Litros o fracción del medidor («3/6»). */
      { name: "gasolina_inicial", type: "text" },
      { name: "gasolina_final", type: "text" },
      { name: "km_recorridos", type: "real" },
      { name: "gasolina_usada", type: "real" },
      { name: "rendimiento", type: "real" },
      { name: "entregas", type: "integer" },
      { name: "ingreso", type: "real" },
      { name: "gasto_gasolina", type: "real" },
      { name: "ganancia_neta", type: "real" },
      { name: "por_entrega", type: "real" },
      { name: "ruta_id", type: "text" },
      /** El velocímetro no sirve: los km salen del GPS. */
      { name: "solo_gps", type: "boolean", default: false },
      /** Hora de apagado programado (HH:mm); anterior al inicio = día siguiente. */
      { name: "fin_programado", type: "text" },
      /** Tramos por vehículo (ver `lib/jornadas`). */
      { name: "tramos", type: "json" },
      { name: "notas", type: "text" },
    ],
    indexes: [
      { name: "idx_herr_jornadas_name", columns: ["name"] },
      { name: "idx_herr_jornadas_active", columns: ["is_active"] },
      { name: "idx_herr_jornadas_estado", columns: ["estado"] },
      { name: "idx_herr_jornadas_fecha", columns: ["fecha"] },
    ],
  },
];
