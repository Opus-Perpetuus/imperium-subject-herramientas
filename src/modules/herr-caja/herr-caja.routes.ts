import { define_crud, define_module, type DomainRow, type KirletCtx } from "@opus-perpetuus/imperium-core-kit";
import { campo_busqueda, falla, fecha_hoy, guardar_imagen, hora_ahora, solo_dia, texto } from "../../lib/comun.ts";
import { ETIQUETA_TIPO_CAJA, TIPOS_CAJA } from "../../lib/liquidacion/liquidacion.ts";
import { exigir_no_liquidada, jornada_activa } from "../../lib/reparto/servicios.ts";
import { herr_caja_pages } from "./herr-caja.pages.ts";
import { herr_caja_tables } from "./herr-caja.tables.ts";

function tipo_valido(valor: unknown): string {
  const tipo = texto(valor);
  if (!(TIPOS_CAJA as readonly string[]).includes(tipo)) {
    falla(400, `El tipo debe ser ${TIPOS_CAJA.join(" o ")}`, "validation_error");
  }
  return tipo;
}

function nombre_y_busqueda(fila: DomainRow): DomainRow {
  const name = texto(fila.motivo) || ETIQUETA_TIPO_CAJA[texto(fila.tipo)] || "Movimiento de caja";
  return { name, search_field: campo_busqueda(name, fila.tipo, fila.fecha) };
}

export const herr_caja_module = define_module({
  resource: "herr-caja",
  labels: {
    singular: "Movimiento de caja",
    plural: "Movimientos de caja",
    read: "Ver movimientos de caja",
    write: "Editar movimientos de caja",
  },
  routes: define_crud({
    resource: "herr-caja",
    table: "herr_caja",
    soft_delete: true,
    soft_delete_field: "is_active",
    history: true,
    default_sort: "created_at:desc",
    id_prefix: "caja",
    fields: {
      name: { type: "string", search: true },
      description: { type: "string", search: true },
      is_active: { type: "boolean" },
      ref: { type: "string" },
      search_field: { type: "string", search: true },
      created_by: { type: "string" },
      custom_data: { type: "json" },
      payload: { type: "json" },
      fecha: { type: "string", normalize: solo_dia },
      hora: { type: "string" },
      tipo: { type: "string", required: true },
      cantidad: { type: "number", required: true, validate: (v) => (Number(v) < 0 ? "La cantidad no puede ser negativa" : null) },
      motivo: { type: "string", search: true },
      foto: { type: "string" },
      jornada_id: { type: "string" },
      saldado: { type: "boolean" },
      liquidacion: { type: "string" },
    },
    options_map: { value: "id", label: "name" },
    hooks: {
      before_create: async (ctx: KirletCtx, row: DomainRow) => {
        const fila: DomainRow = {
          ...row,
          created_by: ctx.actor,
          liquidacion: null,
          tipo: tipo_valido(row.tipo),
          fecha: texto(row.fecha) || fecha_hoy(),
          hora: texto(row.hora) || hora_ahora(),
          jornada_id: texto(row.jornada_id) || ((await jornada_activa(ctx))?.id ?? null),
          saldado: row.saldado ?? false,
        };
        if ("foto" in row) fila.foto = await guardar_imagen(ctx, "herr-caja", String(row.id), row.foto);
        return { ...fila, ...nombre_y_busqueda(fila) };
      },
      before_update: async (ctx: KirletCtx, id: string, patch: DomainRow, existing: DomainRow) => {
        const { created_by: _autor, liquidacion: _sello, ...resto } = patch;
        exigir_no_liquidada(existing, resto);
        if ("tipo" in resto) resto.tipo = tipo_valido(resto.tipo);
        if ("foto" in resto) resto.foto = await guardar_imagen(ctx, "herr-caja", id, resto.foto);
        return { ...resto, ...nombre_y_busqueda({ ...existing, ...resto }) };
      },
      before_delete: (_ctx: KirletCtx, existing: DomainRow) => exigir_no_liquidada(existing),
    },
  }),
  tables: herr_caja_tables,
  pages: herr_caja_pages,
  menu: [
    {
      id: "herramientas.herr-caja",
      label: "Caja",
      order: 40,
      pageId: "herramientas.herr-caja",
      path: "herr-caja",
      permission: "subject.herramientas.herr-caja.read",
      icon: "fa-cash-register",
    },
  ],
});
