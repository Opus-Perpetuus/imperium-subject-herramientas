import type { KirletTableDecl } from "@opus-perpetuus/imperium-core-kit";

export const herr_pedidos_tables: KirletTableDecl[] = [
  {
    /**
     * Papelitos y pedidos son una sola colección: se anota al llegar el
     * papel y el estado le sigue la pista hasta el cobro.
     */
    name: "herr_pedidos",
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
      /** Orden de entrega entre los abiertos. */
      { name: "orden", type: "integer" },
      { name: "cobrar", type: "real" },
      /** Lo que queda TRAS dar el cambio; vacío = aún no cobrado al cliente. */
      { name: "recibido", type: "real" },
      { name: "propina", type: "real" },
      { name: "domicilio_texto", type: "text" },
      { name: "domicilio_id", type: "text" },
      { name: "contacto_nombre", type: "text" },
      { name: "telefono", type: "text" },
      { name: "detalle", type: "text" },
      /** La prosa del pedido: fuente de verdad, se busca y se lee. */
      { name: "productos", type: "text" },
      /** `{ lineas, promo_id }` para reabrir la calculadora; si se pierde no cuesta dinero. */
      { name: "productos_json", type: "json" },
      /** Foto del papelito (id/URL de archivo). */
      { name: "papelito", type: "text" },
      { name: "jornada_id", type: "text" },
      { name: "cobrado", type: "boolean", default: false },
      /** capturado | surtido | en_ruta | entregado | cobrado. */
      { name: "estado", type: "text", default: "capturado" },
      { name: "hora_surtido", type: "text" },
      { name: "hora_entrega", type: "text" },
      /** Sello «YYYY-MM-DD HH:mm» de la liquidación que lo cobró. */
      { name: "liquidacion", type: "text" },
    ],
    indexes: [
      { name: "idx_herr_pedidos_name", columns: ["name"] },
      { name: "idx_herr_pedidos_active", columns: ["is_active"] },
      { name: "idx_herr_pedidos_jornada", columns: ["jornada_id"] },
      { name: "idx_herr_pedidos_estado", columns: ["estado"] },
    ],
  },
];
