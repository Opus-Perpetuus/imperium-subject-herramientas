import { build_feature_shell_page, type KirletPageDecl } from "@opus-perpetuus/imperium-core-kit";
import { general_option_list_options_source } from "../../general-option-seeds.ts";

const API = "api://m/subject-herramientas";

export const herr_caja_pages: KirletPageDecl[] = [
  {
    id: "herramientas.herr-caja",
    path: "herr-caja",
    permission: "subject.herramientas.herr-caja.read",
    build: () =>
      build_feature_shell_page({
        id: "herramientas.herr-caja",
        owner: "subject-herramientas",
        title: "Movimientos de caja",
        props: {
          basePath: "herr-caja",
          idKey: "id",
          nameKey: "name",
          view: {
            title: "Movimientos de caja",
            subtitle: "Cambio que te presta la caja y dinero tuyo que te tienen que devolver",
            pluralLabel: "movimientos",
            singularLabel: "movimiento",
            emptyTitle: "Sin movimientos",
            emptyDescription: "Registra el primero",
          },
          data: {
            list: `${API}/herr-caja`,
            record: `${API}/herr-caja/:id`,
            create: { method: "POST", action: `${API}/herr-caja` },
            update: { method: "PATCH", action: `${API}/herr-caja/:id` },
            delete: { method: "DELETE", action: `${API}/herr-caja/:id` },
          },
          table: {
            columns: [
              { key: "fecha", label: "Fecha", sortable: true, priority: 1 },
              { key: "tipo", label: "Tipo", sortable: true, priority: 1, cell: "badge" },
              { key: "cantidad", label: "Cantidad", sortable: true, priority: 1 },
              { key: "motivo", label: "Motivo", priority: 2 },
              { key: "saldado", label: "Saldado", sortable: true, priority: 2 },
              { key: "liquidacion", label: "Liquidación", priority: 3 },
            ],
            fillHeight: true,
            serverQuery: true,
          },
          form: {
            fields: [
              {
                name: "tipo",
                component: "input-menu",
                label: "Tipo",
                required: true,
                // Opciones: general-option-list-control (seed en general-option-seeds.ts).
                optionsSource: general_option_list_options_source(
                  "subject-herramientas/herr-caja",
                  "tipo",
                ),
              },
              { name: "cantidad", component: "input-money", label: "Cantidad", required: true, min: 0 },
              { name: "fecha", component: "input-date", label: "Fecha" },
              { name: "hora", component: "input-time", label: "Hora" },
              { name: "motivo", component: "input-text", label: "Motivo", column_span: "full" },
              { name: "jornada_id", component: "input-datalist", label: "Jornada", optionsSource: `${API}/herr-jornadas?as=options&limite=1000` },
              { name: "foto", component: "input-image", label: "Foto" },
              { name: "saldado", component: "input-checkbox", label: "Saldado" },
              { name: "liquidacion", component: "input-text", label: "Liquidación", read_only: true },
            ],
          },
        },
      }),
  },
];
