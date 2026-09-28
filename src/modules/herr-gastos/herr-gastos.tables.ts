import type { KirletTableDecl } from "@opus-perpetuus/imperium-core-kit";

export const herr_gastos_tables: KirletTableDecl[] = [
  {
    /**
     * Gastos del reparto y de dónde salió el dinero. Fuente «cobros»: sale
     * del efectivo cobrado y la liquidación lo descuenta. Fuente «caja»: caja
     * dio el dinero y el registro es la constancia; nace descontado.
     */
    name: "herr_gastos",
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
      { name: "motivo", type: "text" },
      { name: "cantidad", type: "real" },
      /** `cobros` | `caja`. */
      { name: "fuente", type: "text", default: "cobros" },
      /** Foto del ticket (id/URL de archivo). */
      { name: "ticket", type: "text" },
      { name: "jornada_id", type: "text" },
      { name: "descontado", type: "boolean", default: false },
      { name: "liquidacion", type: "text" },
      /** Lo escribe el módulo de recargas (id `gasto_recarga_<recarga_id>`). */
      { name: "recarga_id", type: "text" },
    ],
    indexes: [
      { name: "idx_herr_gastos_name", columns: ["name"] },
      { name: "idx_herr_gastos_active", columns: ["is_active"] },
      { name: "idx_herr_gastos_jornada", columns: ["jornada_id"] },
    ],
  },
];
