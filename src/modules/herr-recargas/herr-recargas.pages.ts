import { build_feature_shell_page, type KirletPageDecl } from "@opus-perpetuus/imperium-core-kit";

const API = "api://m/subject-herramientas";

export const herr_recargas_pages: KirletPageDecl[] = [
  {
    id: "herramientas.herr-recargas",
    path: "herr-recargas",
    permission: "subject.herramientas.herr-recargas.read",
    build: () =>
      build_feature_shell_page({
        id: "herramientas.herr-recargas",
        owner: "subject-herramientas",
        title: "Recargas de combustible",
        props: {
          basePath: "herr-recargas",
          idKey: "id",
          nameKey: "name",
          view: {
            title: "Recargas",
            subtitle: "Cada carga de gasolina: con importe es un gasto; con lecturas del medidor, calibra el vehículo",
            pluralLabel: "recargas",
            singularLabel: "recarga",
            emptyTitle: "Sin recargas",
            emptyDescription: "Registra la primera carga de gasolina",
          },
          data: {
            list: `${API}/herr-recargas`,
            record: `${API}/herr-recargas/:id`,
            create: { method: "POST", action: `${API}/herr-recargas` },
            update: { method: "PATCH", action: `${API}/herr-recargas/:id` },
            delete: { method: "DELETE", action: `${API}/herr-recargas/:id` },
          },
          table: {
            columns: [
              { key: "name", label: "Recarga", sortable: true, priority: 1 },
              { key: "fecha_hora", label: "Fecha y hora", sortable: true, priority: 2 },
              { key: "pesos", label: "Pesos", sortable: true, priority: 2 },
              { key: "litros_efectivos", label: "Litros", sortable: true, priority: 2 },
              { key: "km", label: "Km", sortable: true, priority: 3 },
              { key: "tanque_lleno", label: "Lleno", sortable: true, priority: 3 },
            ],
            fillHeight: true,
            serverQuery: true,
          },
          form: {
            fields: [
              {
                name: "vehiculo_id",
                component: "input-datalist",
                label: "Vehículo",
                help: "Del registro de vehículos",
                optionsSource: "api://m/subject-vehiculos/vehicle?as=options&limite=1000",
              },
              { name: "fecha_hora", component: "input-datetime", label: "Fecha y hora" },
              { name: "km", component: "input-number", label: "Odómetro (km)", min: 0, step: 0.1 },
              { name: "pesos", component: "input-money", label: "Importe" },
              { name: "precio_litro", component: "input-money", label: "Precio por litro" },
              {
                name: "litros",
                component: "input-number",
                label: "Litros",
                help: "Si se deja vacío se calculan como importe ÷ precio",
                min: 0,
                step: 0.01,
              },
              {
                name: "nivel_antes",
                component: "input-text",
                label: "Nivel antes",
                help: "Lectura del medidor «paso/pasos» (3/6) o litros",
              },
              { name: "nivel_despues", component: "input-text", label: "Nivel después", help: "Igual que antes" },
              { name: "tanque_lleno", component: "input-checkbox", label: "Tanque lleno" },
              {
                name: "jornada_id",
                component: "input-datalist",
                label: "Jornada",
                optionsSource: `${API}/herr-jornadas?as=options&limite=1000`,
              },
              { name: "name", component: "input-text", label: "Nombre", help: "Se rellena solo si se deja vacío" },
              { name: "litros_efectivos", component: "input-number", label: "Litros efectivos", read_only: true },
              { name: "aproximado", component: "input-checkbox", label: "Litros aproximados", read_only: true },
              { name: "description", component: "input-textarea", label: "Notas", column_span: "full" },
            ],
          },
        },
      }),
  },
];
