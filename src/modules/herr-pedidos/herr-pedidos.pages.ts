import { build_feature_shell_page, type KirletPageDecl } from "@opus-perpetuus/imperium-core-kit";
import { ESTADOS, ETIQUETA_ESTADO } from "../../lib/pedidos/estado.ts";

const API = "api://m/subject-herramientas";

export const herr_pedidos_pages: KirletPageDecl[] = [
  {
    id: "herramientas.herr-pedidos",
    path: "herr-pedidos",
    permission: "subject.herramientas.herr-pedidos.read",
    build: () =>
      build_feature_shell_page({
        id: "herramientas.herr-pedidos",
        owner: "subject-herramientas",
        title: "Pedidos",
        props: {
          basePath: "herr-pedidos",
          idKey: "id",
          nameKey: "name",
          view: {
            title: "Pedidos",
            subtitle: "Del papelito al cobro: qué se cobra, qué recibiste y qué es propina",
            pluralLabel: "pedidos",
            singularLabel: "pedido",
            emptyTitle: "Sin pedidos",
            emptyDescription: "Captura el primero",
          },
          data: {
            list: `${API}/herr-pedidos`,
            record: `${API}/herr-pedidos/:id`,
            create: { method: "POST", action: `${API}/herr-pedidos` },
            update: { method: "PATCH", action: `${API}/herr-pedidos/:id` },
            delete: { method: "DELETE", action: `${API}/herr-pedidos/:id` },
          },
          table: {
            columns: [
              { key: "orden", label: "Orden", sortable: true, priority: 1 },
              { key: "domicilio_texto", label: "Domicilio", sortable: true, priority: 1 },
              { key: "cobrar", label: "A cobrar", sortable: true, priority: 1 },
              { key: "estado", label: "Estado", sortable: true, priority: 1, cell: "badge" },
              { key: "fecha", label: "Fecha", sortable: true, priority: 2 },
              { key: "propina", label: "Propina", sortable: true, priority: 3 },
            ],
            fillHeight: true,
            serverQuery: true,
          },
          form: {
            fields: [
              { name: "domicilio_texto", component: "input-text", label: "Domicilio" },
              {
                name: "domicilio_id",
                component: "input-datalist",
                label: "Domicilio del directorio",
                optionsSource: `${API}/herr-domicilios?as=options&limite=1000`,
              },
              { name: "contacto_nombre", component: "input-text", label: "Nombre" },
              { name: "telefono", component: "input-text", label: "Teléfono", type: "tel" },
              { name: "cobrar", component: "input-money", label: "A cobrar", help: "Se rellena solo desde el detalle de productos si lo dejas vacío" },
              { name: "recibido", component: "input-money", label: "Recibido, ya con cambio dado", help: "Vacío = aún no cobrado al cliente" },
              { name: "propina", component: "input-money", label: "Propina", read_only: true },
              {
                name: "estado",
                component: "input-menu",
                label: "Estado",
                options: ESTADOS.map((e) => ({ value: e, label: ETIQUETA_ESTADO[e] })),
              },
              { name: "productos", component: "input-textarea", label: "Productos", column_span: "full" },
              {
                name: "productos_json",
                component: "input-json",
                label: "Detalle de productos (datos) — si se borra, no pasa nada",
                column_span: "full",
              },
              { name: "detalle", component: "input-textarea", label: "Detalle", column_span: "full" },
              { name: "papelito", component: "input-image", label: "Papelito del pedido" },
              { name: "jornada_id", component: "input-datalist", label: "Jornada", optionsSource: `${API}/herr-jornadas?as=options&limite=1000` },
              { name: "fecha", component: "input-date", label: "Fecha" },
              { name: "hora", component: "input-time", label: "Hora" },
              { name: "orden", component: "input-number", label: "Orden de entrega", min: 1, step: 1 },
              { name: "hora_surtido", component: "input-time", label: "Hora de surtido" },
              { name: "hora_entrega", component: "input-time", label: "Hora de entrega" },
              { name: "cobrado", component: "input-checkbox", label: "Cobrado" },
              { name: "liquidacion", component: "input-text", label: "Liquidación", read_only: true },
            ],
          },
        },
      }),
  },
];
