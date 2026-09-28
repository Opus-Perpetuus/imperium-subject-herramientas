import { define_crud, define_module, type DomainRow, type KirletCtx } from "@opus-perpetuus/imperium-core-kit";
import { guardar_imagen, solo_dia } from "../../lib/comun.ts";
import { derivados_pedido, exigir_no_liquidada, preparar_pedido } from "../../lib/reparto/servicios.ts";
import { herr_pedidos_flow } from "./herr-pedidos.flow.ts";
import { herr_pedidos_pages } from "./herr-pedidos.pages.ts";
import { herr_pedidos_tables } from "./herr-pedidos.tables.ts";

/** Un recibido en blanco es «aún no cobrado», no cero: el formulario manda "". */
const vacio_a_null = (v: unknown) => (v === "" ? null : v);

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
        fecha: { type: "string", normalize: solo_dia },
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
          const fila = { ...row };
          if ("papelito" in row) fila.papelito = await guardar_imagen(ctx, "herr-pedidos", String(row.id), row.papelito);
          return preparar_pedido(ctx, fila);
        },
        // Un JSON nuevo sin `cobrar` tecleado vuelve a cotizar; con `cobrar`, manda la mano.
        before_update: async (ctx: KirletCtx, id: string, patch: DomainRow, existing: DomainRow) => {
          const { created_by: _autor, liquidacion: _sello, ...resto } = patch;
          exigir_no_liquidada(existing, resto);
          if ("papelito" in resto) resto.papelito = await guardar_imagen(ctx, "herr-pedidos", id, resto.papelito);
          return {
            ...resto,
            ...(await derivados_pedido(ctx, { ...existing, ...resto }, {
              cotizar: "productos_json" in resto,
              rellenar_cobrar: !("cobrar" in resto),
              estado: "estado" in resto || "cobrado" in resto,
            })),
          };
        },
        before_delete: (_ctx: KirletCtx, existing: DomainRow) => exigir_no_liquidada(existing),
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
