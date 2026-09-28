import type { KirletColumnDecl, KirletTableDecl } from "@opus-perpetuus/imperium-core-kit";

const BASE: KirletColumnDecl[] = [
  { name: "id", type: "text", primaryKey: true },
  { name: "name", type: "text", notNull: true },
  { name: "description", type: "text" },
  { name: "is_active", type: "boolean", notNull: true, default: true },
  { name: "ref", type: "text" },
  { name: "search_field", type: "text" },
  { name: "created_by", type: "text" },
  { name: "custom_data", type: "json" },
  { name: "payload", type: "json" },
  { name: "created_at", type: "text", notNull: true },
  { name: "updated_at", type: "text", notNull: true },
];

export const herr_telefono_tables: KirletTableDecl[] = [
  {
    // Un perfil de reglas del contestador; `es_activa` marca el vigente.
    name: "herr_telefono",
    columns: [
      ...BASE,
      { name: "activo", type: "boolean", notNull: true, default: false },
      { name: "ambito", type: "text", notNull: true, default: "nadie" },
      { name: "accion_desconocidos", type: "text", notNull: true, default: "permitir" },
      { name: "retardo_s", type: "integer", notNull: true, default: 5 },
      { name: "anuncio_activo", type: "boolean", notNull: true, default: true },
      { name: "anuncio_plantilla", type: "text", notNull: true, default: "Llamada de {nombre}" },
      { name: "anuncio_repeticiones", type: "integer", notNull: true, default: 2 },
      { name: "anunciar_desconocidos", type: "boolean", notNull: true, default: true },
      { name: "anuncio_idioma", type: "text" },
      { name: "whatsapp_activo", type: "boolean", notNull: true, default: true },
      { name: "whatsapp_plantilla", type: "text", notNull: true, default: "Llamada de WhatsApp de {nombre}" },
      { name: "conduciendo_activo", type: "boolean", notNull: true, default: false },
      { name: "es_activa", type: "boolean", notNull: true, default: false },
    ],
    indexes: [
      { name: "idx_herr_telefono_name", columns: ["name"] },
      { name: "idx_herr_telefono_es_activa", columns: ["es_activa"] },
    ],
  },
  {
    // Contactos elegidos a mano para un perfil: a quién descolgar y a quién rechazar.
    name: "herr_telefono_contactos",
    columns: [
      ...BASE,
      { name: "regla_id", type: "text", notNull: true },
      { name: "telefono", type: "text" },
      { name: "clave", type: "text", notNull: true },
      { name: "modo", type: "text", notNull: true, default: "seleccionado" },
    ],
    indexes: [{ name: "idx_herr_telefono_contactos_regla", columns: ["regla_id"] }],
  },
  {
    // Registro de lo que el contestador decidió con cada llamada.
    name: "herr_telefono_llamadas",
    columns: [
      ...BASE,
      { name: "numero", type: "text" },
      { name: "contacto_nombre", type: "text" },
      { name: "decision", type: "text", notNull: true },
      { name: "motivo", type: "text" },
      { name: "fecha_hora", type: "text", notNull: true },
      { name: "origen", type: "text", notNull: true, default: "telefono" },
      { name: "conduciendo", type: "boolean", notNull: true, default: false },
    ],
    indexes: [{ name: "idx_herr_telefono_llamadas_fecha", columns: ["fecha_hora"] }],
  },
];
