import { build_feature_shell_page, type KirletPageDecl } from "@opus-perpetuus/imperium-core-kit";

const API = "api://m/subject-herramientas";

export const herr_gastos_pages: KirletPageDecl[] = [
  {
    id: "herramientas.herr-gastos",
    path: "herr-gastos",
    permission: "subject.herramientas.herr-gastos.read",
    build: () =>
      build_feature_shell_page({
        id: "herramientas.herr-gastos",
        owner: "subject-herramientas",
        title: "Gastos",
        props: {
          basePath: "herr-gastos",
          idKey: "id",
          nameKey: "name",
          view: {
            title: "Gastos",
            subtitle: "Cada gasto del reparto, con su ticket y de dónde salió el dinero",
            pluralLabel: "gastos",
            singularLabel: "gasto",
            emptyTitle: "Sin gastos",
            emptyDescription: "Registra el primero",
          },
          data: {
            list: `${API}/herr-gastos`,
            record: `${API}/herr-gastos/:id`,
            create: { method: "POST", action: `${API}/herr-gastos` },
            update: { method: "PATCH", action: `${API}/herr-gastos/:id` },
            delete: { method: "DELETE", action: `${API}/herr-gastos/:id` },
          },
          table: {
            columns: [
              { key: "fecha", label: "Fecha", sortable: true, priority: 1 },
              { key: "motivo", label: "Motivo", sortable: true, priority: 1 },
              { key: "cantidad", label: "Cantidad", sortable: true, priority: 1 },
              { key: "fuente", label: "Fuente", sortable: true, priority: 2, cell: "badge" },
              { key: "descontado", label: "Descontado", sortable: true, priority: 2 },
              { key: "liquidacion", label: "Liquidación", priority: 3 },
            ],
            fillHeight: true,
            serverQuery: true,
          },
          form: {
            fields: [
              { name: "motivo", component: "input-text", label: "Motivo", required: true },
              { name: "cantidad", component: "input-money", label: "Cantidad", required: true, min: 0 },
              {
                name: "fuente",
                component: "input-menu",
                label: "De dónde salió",
                options: [
                  { value: "cobros", label: "De los cobros", description: "Se descuenta de lo que se entrega a caja" },
                  { value: "caja", label: "Me lo dio caja", description: "Nace descontado; ninguna liquidación lo toca" },
                ],
              },
              { name: "fecha", component: "input-date", label: "Fecha" },
              { name: "hora", component: "input-time", label: "Hora" },
              { name: "jornada_id", component: "input-datalist", label: "Jornada", optionsSource: `${API}/herr-jornadas?as=options&limite=1000` },
              { name: "ticket", component: "input-image", label: "Ticket" },
              { name: "descontado", component: "input-checkbox", label: "Descontado" },
              { name: "liquidacion", component: "input-text", label: "Liquidación", read_only: true },
              { name: "description", component: "input-textarea", label: "Notas", column_span: "full" },
            ],
          },
        },
      }),
  },
];
