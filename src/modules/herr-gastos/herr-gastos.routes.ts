import { define_crud, define_module, type DomainRow, type KirletCtx } from "@opus-perpetuus/imperium-core-kit";
import { booleano, campo_busqueda, falla, fecha_hoy, filas_de, hora_ahora, numero, texto } from "../../lib/comun.ts";
import { jornada_activa } from "../../lib/jornadas/jornada.ts";
import { FUENTES_GASTO, disponible } from "../../lib/liquidacion/liquidacion.ts";
import { herr_gastos_pages } from "./herr-gastos.pages.ts";
import { herr_gastos_tables } from "./herr-gastos.tables.ts";

function fuente_valida(valor: unknown): string {
  const fuente = texto(valor) || "cobros";
  if (!(FUENTES_GASTO as readonly string[]).includes(fuente)) {
    falla(400, `La fuente debe ser ${FUENTES_GASTO.join(" o ")}`, "validation_error");
  }
  return fuente;
}

function nombre_y_busqueda(fila: DomainRow): DomainRow {
  const name = texto(fila.motivo) || "Gasto";
  return { name, search_field: campo_busqueda(name, fila.fuente, fila.fecha) };
}

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
      fecha: { type: "string" },
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
        const fuente = fuente_valida(row.fuente);
        const descontado = fuente === "caja" ? true : booleano(row.descontado);
        if (fuente === "cobros" && !descontado) {
          const [pedidos, gastos] = await Promise.all([
            filas_de(ctx, "herr_pedidos", { is_active: true }),
            filas_de(ctx, "herr_gastos", { is_active: true }),
          ]);
          if ((numero(row.cantidad) ?? 0) > disponible(pedidos, gastos) + 1e-9) {
            falla(400, "No hay dinero de cobros para cubrirlo", "validation_error");
          }
        }
        const fila: DomainRow = {
          ...row,
          fuente,
          descontado,
          fecha: texto(row.fecha) || fecha_hoy(),
          hora: texto(row.hora) || hora_ahora(),
          jornada_id: texto(row.jornada_id) || ((await jornada_activa(ctx))?.id ?? null),
        };
        return { ...fila, ...nombre_y_busqueda(fila) };
      },
      before_update: (_ctx, _id, patch, existing) => {
        if ("fuente" in patch) patch.fuente = fuente_valida(patch.fuente);
        const fila = { ...existing, ...patch };
        if (fila.fuente === "caja") patch.descontado = true;
        return { ...patch, ...nombre_y_busqueda(fila) };
      },
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
