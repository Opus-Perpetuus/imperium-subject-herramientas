import { build_feature_shell_page, type KirletPageDecl } from "@opus-perpetuus/imperium-core-kit";

const API = "api://m/subject-herramientas";

export const herr_etiquetas_pages: KirletPageDecl[] = [
  {
    id: "herramientas.herr-etiquetas",
    path: "herr-etiquetas",
    permission: "subject.herramientas.herr-etiquetas.read",
    build: () =>
      build_feature_shell_page({
        id: "herramientas.herr-etiquetas",
        owner: "subject-herramientas",
        title: "Etiquetas",
        props: {
          basePath: "herr-etiquetas",
          idKey: "id",
          nameKey: "name",
          view: {
            title: "Etiquetas",
            subtitle: "Para clasificar domicilios: «perro», «portón», «da propina»…",
            pluralLabel: "etiquetas",
            singularLabel: "etiqueta",
            emptyTitle: "Sin etiquetas",
            emptyDescription: "Crea la primera para marcar domicilios",
          },
          data: {
            list: `${API}/herr-etiquetas`,
            record: `${API}/herr-etiquetas/:id`,
            create: { method: "POST", action: `${API}/herr-etiquetas` },
            update: { method: "PATCH", action: `${API}/herr-etiquetas/:id` },
            delete: { method: "DELETE", action: `${API}/herr-etiquetas/:id` },
          },
          table: {
            columns: [
              { key: "name", label: "Nombre", sortable: true, priority: 1 },
              { key: "color", label: "Color", sortable: true, priority: 2 },
              { key: "notas", label: "Notas", sortable: false, priority: 3 },
              { key: "is_active", label: "Activa", sortable: true, priority: 3 },
            ],
            fillHeight: true,
            serverQuery: true,
          },
          form: {
            fields: [
              { name: "name", component: "input-text", label: "Nombre", required: true },
              {
                name: "color",
                component: "input-choice",
                label: "Color",
                choice_appearance: "segmented",
                options: [
                  { value: "primario", label: "Primario" },
                  { value: "ok", label: "OK" },
                  { value: "aviso", label: "Aviso" },
                  { value: "peligro", label: "Peligro" },
                  { value: "info", label: "Info" },
                  { value: "neutro", label: "Neutro" },
                ],
              },
              { name: "notas", component: "input-textarea", label: "Notas", column_span: "full" },
              { name: "is_active", component: "input-checkbox", label: "Activa" },
            ],
          },
        },
      }),
  },
];
