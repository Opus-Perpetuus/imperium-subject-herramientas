import type { KirletTableDecl } from "@opus-perpetuus/imperium-core-kit";

export const herr_caja_tables: KirletTableDecl[] = [
  {
    /**
     * Movimientos de caja: el cambio que presta la caja y el dinero propio
     * que uno pone. Tabla aparte de gastos: no compran nada y `fuente ==
     * "cobros"` es el invariante de la liquidación.
     */
    name: "herr_caja",
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
      { name: "hora", type: "text" },
      /** `retiro_cambio` | `aporte_propio`. */
      { name: "tipo", type: "text" },
      { name: "cantidad", type: "real" },
      { name: "motivo", type: "text" },
      { name: "foto", type: "text" },
      { name: "jornada_id", type: "text" },
      /** La devolución no es otra fila: es este flag de la que ya existe. */
      { name: "saldado", type: "boolean", default: false },
      { name: "liquidacion", type: "text" },
    ],
    indexes: [
      { name: "idx_herr_caja_name", columns: ["name"] },
      { name: "idx_herr_caja_active", columns: ["is_active"] },
      { name: "idx_herr_caja_jornada", columns: ["jornada_id"] },
    ],
  },
];
