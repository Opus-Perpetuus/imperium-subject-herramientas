import { build_feature_shell_page, type KirletPageDecl } from "@opus-perpetuus/imperium-core-kit";
import { API, OWNER } from "../herr-tablas/herr-tablas.pages.ts";

export const herr_cierres_pages: KirletPageDecl[] = [
  {
    id: "herramientas.herr-cierres",
    path: "herr-cierres",
    permission: "subject.herramientas.herr-cierres.read",
    build: () =>
      build_feature_shell_page({
        id: "herramientas.herr-cierres",
        owner: OWNER,
        title: "Cierres",
        props: {
          basePath: "herr-cierres",
          idKey: "id",
          nameKey: "name",
          view: {
            title: "Cierres",
            subtitle: "Filas archivadas al cerrar el día de una tabla",
            pluralLabel: "cierres",
            singularLabel: "cierre",
            emptyTitle: "Sin cierres",
            emptyDescription: "Se llenan al cerrar el día de una tabla personalizada",
          },
          data: {
            list: `${API}/herr-cierres`,
            record: `${API}/herr-cierres/:id`,
          },
          table: {
            columns: [
              { key: "name", label: "Registro", sortable: true, priority: 1 },
              { key: "tabla_id", label: "Tabla", sortable: true, priority: 2 },
              { key: "cierre_id", label: "Cierre", sortable: true, priority: 2 },
              { key: "cerrado_at", label: "Cerrado", sortable: true, priority: 1 },
            ],
            fillHeight: true,
            serverQuery: true,
          },
          form: {
            fields: [
              { name: "name", component: "input-text", label: "Registro", read_only: true },
              { name: "tabla_id", component: "input-text", label: "Tabla", read_only: true },
              { name: "cierre_id", component: "input-text", label: "Cierre", read_only: true },
              { name: "cerrado_at", component: "input-datetime", label: "Cerrado", read_only: true },
              {
                name: "valores",
                component: "input-code-editor",
                label: "Valores congelados",
                code_editor_language: "json",
                read_only: true,
                column_span: "full",
              },
            ],
          },
        },
      }),
  },
];
