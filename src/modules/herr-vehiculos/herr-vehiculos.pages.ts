import { build_feature_shell_page, type KirletPageDecl } from "@opus-perpetuus/imperium-core-kit";
import { TANQUES, nombre_tanque } from "../../lib/combustible/tanques.ts";

const API = "api://m/subject-herramientas";
const API_VEHICULOS = "api://m/subject-vehiculos";

export const herr_vehiculos_pages: KirletPageDecl[] = [
  {
    id: "herramientas.herr-vehiculos",
    path: "herr-vehiculos",
    permission: "subject.herramientas.herr-vehiculos.read",
    build: () =>
      build_feature_shell_page({
        id: "herramientas.herr-vehiculos",
        owner: "subject-herramientas",
        title: "Ajustes de reparto por vehículo",
        props: {
          basePath: "herr-vehiculos",
          idKey: "id",
          nameKey: "name",
          view: {
            title: "Vehículos (reparto)",
            subtitle: "Tanque, medidor y GPS de cada vehículo del registro; las jornadas y recargas apuntan al vehículo",
            pluralLabel: "ajustes",
            singularLabel: "ajustes",
            emptyTitle: "Sin ajustes",
            emptyDescription: "Elige un vehículo del registro y captura su tanque y su medidor",
          },
          data: {
            list: `${API}/herr-vehiculos`,
            record: `${API}/herr-vehiculos/:id`,
            create: { method: "POST", action: `${API}/herr-vehiculos` },
            update: { method: "PATCH", action: `${API}/herr-vehiculos/:id` },
            delete: { method: "DELETE", action: `${API}/herr-vehiculos/:id` },
          },
          table: {
            columns: [
              { key: "name", label: "Vehículo", sortable: true, priority: 1 },
              { key: "vehiculo_id", label: "Id del vehículo", sortable: true, priority: 3 },
              { key: "tanque_litros", label: "Tanque (L)", sortable: true, priority: 2 },
              { key: "medidor", label: "Medidor", sortable: true, priority: 2 },
              { key: "solo_gps", label: "Solo GPS", sortable: true, priority: 3 },
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
                help: "Del registro de vehículos (se necesita permiso de lectura en la app Vehículos); un solo juego de ajustes por vehículo",
                optionsSource: `${API_VEHICULOS}/vehicle?as=options&limite=1000`,
                required: true,
              },
              { name: "name", component: "input-text", label: "Nombre", help: "Se toma del vehículo si se deja vacío" },
              { name: "placa", component: "input-text", label: "Placa (copia)" },
              {
                name: "catalogo_tanque_id",
                component: "input-menu",
                label: "Modelo del catálogo",
                help: "Prellena la capacidad del tanque; se puede corregir a mano",
                options: TANQUES.map((m) => ({
                  value: m.id,
                  label: nombre_tanque(m),
                  description: m.tanque_litros == null ? "sin dato" : `${m.tanque_litros} L · ${m.confianza}`,
                })),
              },
              { name: "tanque_litros", component: "input-number", label: "Tanque (litros)", min: 0, step: 0.1 },
              {
                name: "solo_gps",
                component: "input-checkbox",
                label: "Kilómetros solo por GPS",
                help: "El velocímetro no sirve: las jornadas no piden odómetro",
              },
              {
                name: "medidor",
                component: "input-menu",
                label: "Medidor de gasolina",
                options: [
                  { value: "ninguno", label: "Sin medidor" },
                  { value: "barras", label: "Barritas" },
                  { value: "aguja", label: "Aguja" },
                ],
              },
              { name: "marcas", component: "input-number", label: "Marcas del tablero", min: 0, step: 1 },
              {
                name: "divisiones",
                component: "input-number",
                label: "Divisiones por marca",
                help: "1 en barritas; 10 en aguja",
                min: 1,
                step: 1,
              },
              {
                name: "aguja_fuera",
                component: "input-checkbox",
                label: "La aguja se sale de la escala",
                help: "Baja de la marca de vacío y sube de la de lleno",
              },
              {
                name: "litros_por_paso",
                component: "input-json",
                label: "Calibración (litros por sección)",
                help: "Se aprende con cada recarga; vacío = reparto lineal del tanque",
                column_span: "full",
              },
              { name: "notas", component: "input-textarea", label: "Notas", column_span: "full" },
              { name: "description", component: "input-textarea", label: "Descripción", column_span: "full" },
              { name: "is_active", component: "input-checkbox", label: "Activo" },
            ],
          },
        },
      }),
  },
];
