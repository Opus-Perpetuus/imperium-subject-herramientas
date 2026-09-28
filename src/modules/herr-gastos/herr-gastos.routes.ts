import { define_crud, define_module, type DomainRow, type KirletCtx } from "@opus-perpetuus/imperium-core-kit";
import { booleano, falla, guardar_imagen, numero, solo_dia, texto } from "../../lib/comun.ts";
import {
  exigir_disponible,
  exigir_no_liquidada,
  fuente_gasto,
  nombre_y_busqueda_gasto,
  preparar_gasto,
} from "../../lib/reparto/servicios.ts";
import { herr_gastos_pages } from "./herr-gastos.pages.ts";
import { herr_gastos_tables } from "./herr-gastos.tables.ts";

export const herr_gastos_module = define_module({
  resource: "herr-gastos",
  labels: {
    singular: "Gasto",
    plural: "Gastos",
    read: "Ver gastos",
    write: "Editar gastos",
  },
  routes: define_crud({
    resource: "herr-gastos",
    table: "herr_gastos",
    soft_delete: true,
    soft_delete_field: "is_active",
    history: true,
    default_sort: "created_at:desc",
    id_prefix: "gasto",
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
      motivo: { type: "string", required: true, search: true },
      cantidad: { type: "number", required: true, validate: (v) => (Number(v) < 0 ? "La cantidad no puede ser negativa" : null) },
      fuente: { type: "string" },
      ticket: { type: "string" },
      jornada_id: { type: "string" },
      descontado: { type: "boolean" },
      liquidacion: { type: "string" },
      recarga_id: { type: "string" },
    },
    options_map: { value: "id", label: "name" },
    hooks: {
      before_create: async (ctx: KirletCtx, row: DomainRow) => {
        // Esos ids los reserva herr-recargas para el gasto de cada recarga.
        if (String(row.id).startsWith("gasto_recarga_")) {
          falla(400, "Ese id está reservado para el gasto de una recarga", "validation_error");
        }
        const fila = { ...row };
        if ("ticket" in row) fila.ticket = await guardar_imagen(ctx, "herr-gastos", String(row.id), row.ticket);
        return preparar_gasto(ctx, fila);
      },
      // Subir la cantidad (o pasar el gasto a «cobros») vuelve a exigir dinero disponible.
      before_update: async (ctx: KirletCtx, id: string, patch: DomainRow, existing: DomainRow) => {
        const { created_by: _autor, liquidacion: _sello, ...resto } = patch;
        exigir_no_liquidada(existing, resto);
        if ("fuente" in resto) resto.fuente = fuente_gasto(resto.fuente);
        const fila = { ...existing, ...resto };
        if (fila.fuente === "caja") resto.descontado = fila.descontado = true;
        const cambia = ["cantidad", "fuente", "descontado"].some((k) => k in resto && resto[k] !== existing[k]);
        if (cambia && texto(fila.fuente) === "cobros" && !booleano(fila.descontado)) {
          await exigir_disponible(ctx, numero(fila.cantidad) ?? 0, id);
        }
        if ("ticket" in resto) resto.ticket = await guardar_imagen(ctx, "herr-gastos", id, resto.ticket);
        return { ...resto, ...nombre_y_busqueda_gasto(fila) };
      },
      before_delete: (_ctx: KirletCtx, existing: DomainRow) => exigir_no_liquidada(existing),
    },
  }),
  tables: herr_gastos_tables,
  pages: herr_gastos_pages,
  menu: [
    {
      id: "herramientas.herr-gastos",
      label: "Gastos",
      order: 30,
      pageId: "herramientas.herr-gastos",
      path: "herr-gastos",
      permission: "subject.herramientas.herr-gastos.read",
      icon: "fa-money-bill-wave",
    },
  ],
});
