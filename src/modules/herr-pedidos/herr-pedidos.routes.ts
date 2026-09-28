import { define_crud, define_module, type DomainRow, type KirletCtx } from "@opus-perpetuus/imperium-core-kit";
import { booleano, campo_busqueda, falla, fecha_hoy, filas_de, hora_ahora, numero, texto } from "../../lib/comun.ts";
import { jornada_activa } from "../../lib/jornadas/jornada.ts";
import { ESTADOS, siguiente_orden } from "../../lib/pedidos/estado.ts";
import { catalogo_de } from "../../lib/precios/catalogo.ts";
import { cotizar, lineas_desde } from "../../lib/precios/motor.ts";
import { herr_pedidos_flow } from "./herr-pedidos.flow.ts";
import { herr_pedidos_pages } from "./herr-pedidos.pages.ts";
import { herr_pedidos_tables } from "./herr-pedidos.tables.ts";

/** Un recibido en blanco es «aún no cobrado», no cero: el formulario manda "". */
const vacio_a_null = (v: unknown) => (v === "" ? null : v);

/**
 * Lo que se deriva de una fila completa. Con `productos_json` se cotiza y se
 * reescribe la prosa; `cobrar` solo se rellena cuando nadie lo tecleó: en
 * cuanto se corrige a mano, manda la mano. Un JSON roto o vacío no toca nada
 * («si se borra, no pasa nada»).
 */
async function derivados(
  ctx: KirletCtx,
  fila: DomainRow,
  opts: { cotizar: boolean; rellenar_cobrar: boolean },
): Promise<DomainRow> {
  const out: DomainRow = {};
  if (opts.cotizar && fila.productos_json != null) {
    const { lineas, promo_id } = lineas_desde(fila.productos_json);
    if (lineas.length) {
      const q = cotizar(lineas, await catalogo_de(ctx), promo_id);
      out.productos = q.productos;
      if (opts.rellenar_cobrar) out.cobrar = q.total;
    }
  }
  const cobrar = numero(out.cobrar ?? fila.cobrar) ?? 0;
  const recibido = numero(fila.recibido);
  out.propina = recibido == null ? 0 : Math.max(0, recibido - cobrar);
  const estado = booleano(fila.cobrado) ? "cobrado" : texto(fila.estado) || "capturado";
  if (!(ESTADOS as readonly string[]).includes(estado)) falla(400, "Estado de pedido no válido", "validation_error");
  out.estado = estado;
  const domicilio = texto(fila.domicilio_texto);
  out.name = domicilio ? `Pedido ${fila.orden} · ${domicilio}` : `Pedido ${fila.orden}`;
  out.search_field = campo_busqueda(
    out.name,
    fila.contacto_nombre,
    fila.telefono,
    out.productos ?? fila.productos,
    fila.detalle,
    fila.fecha,
  );
  return out;
}

export const herr_pedidos_module = define_module({
  resource: "herr-pedidos",
  labels: {
    singular: "Pedido",
    plural: "Pedidos",
    read: "Ver pedidos",
    write: "Editar pedidos",
  },
  routes: [
    ...herr_pedidos_flow,
    ...define_crud({
      resource: "herr-pedidos",
      table: "herr_pedidos",
      soft_delete: true,
      soft_delete_field: "is_active",
      history: true,
      default_sort: "created_at:desc",
      id_prefix: "pedido",
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
        orden: { type: "number", normalize: vacio_a_null },
        cobrar: { type: "number", normalize: vacio_a_null },
        recibido: { type: "number", normalize: vacio_a_null },
        propina: { type: "number", normalize: vacio_a_null },
        domicilio_texto: { type: "string", search: true },
        domicilio_id: { type: "string" },
        contacto_nombre: { type: "string", search: true },
        telefono: { type: "string", search: true },
        detalle: { type: "string", search: true },
        productos: { type: "string", search: true },
        productos_json: { type: "json" },
        papelito: { type: "string" },
        jornada_id: { type: "string" },
        cobrado: { type: "boolean" },
        estado: { type: "string" },
        hora_surtido: { type: "string" },
        hora_entrega: { type: "string" },
        liquidacion: { type: "string" },
      },
      options_map: { value: "id", label: "name" },
      hooks: {
        before_create: async (ctx: KirletCtx, row: DomainRow) => {
          const fila: DomainRow = {
            ...row,
            fecha: texto(row.fecha) || fecha_hoy(),
            hora: texto(row.hora) || hora_ahora(),
            orden: numero(row.orden) ?? siguiente_orden(await filas_de(ctx, "herr_pedidos", { is_active: true })),
            jornada_id: texto(row.jornada_id) || ((await jornada_activa(ctx))?.id ?? null),
            cobrado: booleano(row.cobrado),
          };
          return { ...fila, ...(await derivados(ctx, fila, { cotizar: true, rellenar_cobrar: numero(row.cobrar) == null })) };
        },
        // Un JSON nuevo sin `cobrar` tecleado vuelve a cotizar; con `cobrar`, manda la mano.
        before_update: async (ctx: KirletCtx, _id: string, patch: DomainRow, existing: DomainRow) => ({
          ...patch,
          ...(await derivados(ctx, { ...existing, ...patch }, { cotizar: "productos_json" in patch, rellenar_cobrar: !("cobrar" in patch) })),
        }),
      },
    }),
  ],
  tables: herr_pedidos_tables,
  pages: herr_pedidos_pages,
  menu: [
    {
      id: "herramientas.herr-pedidos",
      label: "Pedidos",
      order: 20,
      pageId: "herramientas.herr-pedidos",
      path: "herr-pedidos",
      permission: "subject.herramientas.herr-pedidos.read",
      icon: "fa-receipt",
    },
  ],
});
