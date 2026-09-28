import { build_feature_shell_page, type KirletPageDecl } from "@opus-perpetuus/imperium-core-kit";

const API = "api://m/subject-herramientas";

export const herr_rutas_pages: KirletPageDecl[] = [
  {
    id: "herramientas.herr-rutas",
    path: "herr-rutas",
    permission: "subject.herramientas.herr-rutas.read",
    build: () =>
      build_feature_shell_page({
        id: "herramientas.herr-rutas",
        owner: "subject-herramientas",
        title: "Rutas GPS",
        props: {
          basePath: "herr-rutas",
          idKey: "id",
          nameKey: "name",
          view: {
            title: "Rutas GPS",
            subtitle: "Trazas del teléfono con distancia, tiempos y paradas detectadas",
            pluralLabel: "rutas",
            singularLabel: "ruta",
            emptyTitle: "Sin rutas",
            emptyDescription: "La app Android inicia una ruta con cada jornada",
          },
          data: {
            list: `${API}/herr-rutas`,
            record: `${API}/herr-rutas/:id`,
            create: { method: "POST", action: `${API}/herr-rutas` },
            update: { method: "PATCH", action: `${API}/herr-rutas/:id` },
            delete: { method: "DELETE", action: `${API}/herr-rutas/:id` },
          },
          table: {
            columns: [
              { key: "name", label: "Ruta", sortable: true, priority: 1 },
              { key: "iniciada", label: "Inicio", sortable: true, priority: 2 },
              { key: "terminada", label: "Fin", sortable: true, priority: 2 },
              { key: "distancia_m", label: "Distancia (m)", sortable: true, priority: 2 },
              { key: "jornada_id", label: "Jornada", sortable: true, priority: 3 },
            ],
            fillHeight: true,
            serverQuery: true,
          },
          form: {
            fields: [
              { name: "name", component: "input-text", label: "Nombre", required: true },
              {
                name: "jornada_id",
                component: "input-datalist",
                label: "Jornada",
                optionsSource: `${API}/herr-jornadas?as=options&limite=1000`,
              },
              { name: "iniciada", component: "input-datetime", label: "Inicio" },
              { name: "terminada", component: "input-datetime", label: "Fin" },
              { name: "distancia_m", component: "input-number", label: "Distancia (m)", read_only: true },
              {
                name: "informe",
                component: "input-object",
                label: "Informe",
                object_read_only: true,
                column_span: "full",
              },
              {
                name: "puntos",
                component: "input-json",
                label: "Puntos GPS",
                help: "[{ t, lat, lon, acc?, spd? }] — los manda el teléfono",
                column_span: "full",
              },
              { name: "description", component: "input-textarea", label: "Notas", column_span: "full" },
            ],
          },
        },
      }),
  },
];
