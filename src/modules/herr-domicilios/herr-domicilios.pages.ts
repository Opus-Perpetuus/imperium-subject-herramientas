import { build_feature_shell_page, type KirletPageDecl } from "@opus-perpetuus/imperium-core-kit";

const API = "api://m/subject-herramientas";

export const herr_domicilios_pages: KirletPageDecl[] = [
  {
    id: "herramientas.herr-domicilios",
    path: "herr-domicilios",
    permission: "subject.herramientas.herr-domicilios.read",
    build: () =>
      build_feature_shell_page({
        id: "herramientas.herr-domicilios",
        owner: "subject-herramientas",
        title: "Domicilios",
        props: {
          basePath: "herr-domicilios",
          idKey: "id",
          nameKey: "name",
          view: {
            title: "Domicilios",
            subtitle: "Cada dirección a la que ya se ha ido, con su ubicación y sus datos",
            pluralLabel: "domicilios",
            singularLabel: "domicilio",
            emptyTitle: "Sin domicilios",
            emptyDescription: "El directorio se llena solo con cada entrega",
          },
          data: {
            list: `${API}/herr-domicilios`,
            record: `${API}/herr-domicilios/:id`,
            create: { method: "POST", action: `${API}/herr-domicilios` },
            update: { method: "PATCH", action: `${API}/herr-domicilios/:id` },
            delete: { method: "DELETE", action: `${API}/herr-domicilios/:id` },
          },
          table: {
            columns: [
              { key: "name", label: "Domicilio", sortable: true, priority: 1 },
              { key: "calle", label: "Calle", sortable: true, priority: 2 },
              { key: "numero", label: "Número", sortable: true, priority: 3 },
              { key: "colonia", label: "Colonia", sortable: true, priority: 2 },
              { key: "veces", label: "Entregas", sortable: true, priority: 3 },
              { key: "ultima_entrega", label: "Última entrega", sortable: true, priority: 3 },
            ],
            fillHeight: true,
            serverQuery: true,
          },
          form: {
            fields: [
              { name: "name", component: "input-text", label: "Domicilio (alias)", required: true },
              { name: "contacto_nombre", component: "input-text", label: "Nombre del contacto" },
              { name: "telefono", component: "input-mask", label: "Teléfono", mask: "00 0000 0000" },
              { name: "lat", component: "input-number", label: "Latitud", min: -90, max: 90, step: 0.000001 },
              { name: "lon", component: "input-number", label: "Longitud", min: -180, max: 180, step: 0.000001 },
              { name: "calle", component: "input-text", label: "Calle" },
              { name: "numero", component: "input-text", label: "Número" },
              { name: "colonia", component: "input-text", label: "Colonia" },
              { name: "referencia", component: "input-textarea", label: "Referencia", column_span: "full" },
              {
                name: "etiquetas",
                component: "input-checkbox-group",
                label: "Etiquetas",
                optionsSource: `${API}/herr-etiquetas?as=options&limite=1000`,
                column_span: "full",
              },
              { name: "veces", component: "input-number", label: "Entregas", min: 0, step: 1, read_only: true },
              { name: "ultima_entrega", component: "input-datetime", label: "Última entrega", read_only: true },
              { name: "notas", component: "input-textarea", label: "Notas", column_span: "full" },
              { name: "is_active", component: "input-checkbox", label: "Activo" },
            ],
          },
        },
      }),
  },
];
