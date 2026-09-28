import { define_crud, define_module, type KirletRouteTable } from "@opus-perpetuus/imperium-core-kit";
import { falla } from "../../lib/comun.ts";
import { herr_cierres_pages } from "./herr-cierres.pages.ts";
import { herr_cierres_tables } from "./herr-cierres.tables.ts";

/** Los cierres solo los escribe `POST /herr-tablas/:id/cerrar`; por el CRUD son de lectura. */
const ESCRITURAS = new Set([
  "POST /herr-cierres",
  "PATCH /herr-cierres/:id",
  "PUT /herr-cierres",
  "PUT /herr-cierres/batch",
  "DELETE /herr-cierres/:id",
  "DELETE /herr-cierres/id/:id",
]);

function solo_lectura(rutas: KirletRouteTable): KirletRouteTable {
  for (const ruta of rutas) {
    if (ESCRITURAS.has(ruta.pattern)) {
      ruta.handler = () => falla(400, "Los cierres solo se crean al cerrar el día de una tabla");
    }
  }
  return rutas;
}

export const herr_cierres_module = define_module({
  resource: "herr-cierres",
  labels: {
    singular: "Cierre",
    plural: "Cierres",
    read: "Ver cierres",
    write: "Editar cierres",
  },
  routes: solo_lectura(
    define_crud({
      resource: "herr-cierres",
      table: "herr_cierres",
      soft_delete: true,
      soft_delete_field: "is_active",
      history: true,
      default_sort: "updated_at:desc",
      id_prefix: "cierre",
      fields: {
        name: { type: "string", required: true, search: true },
        description: { type: "string", search: true },
        is_active: { type: "boolean" },
        ref: { type: "string" },
        search_field: { type: "string", search: true },
        created_by: { type: "string" },
        custom_data: { type: "json" },
        payload: { type: "json" },
        tabla_id: { type: "string", search: true },
        cierre_id: { type: "string", search: true },
        cerrado_at: { type: "string" },
        valores: { type: "json" },
      },
      options_map: { value: "id", label: "name" },
    }),
  ),
  tables: herr_cierres_tables,
  pages: herr_cierres_pages,
  menu: [
    {
      id: "herramientas.herr-cierres",
      label: "Cierres",
      order: 30,
      pageId: "herramientas.herr-cierres",
      path: "herr-cierres",
      permission: "subject.herramientas.herr-cierres.read",
      icon: "fa-box-archive",
    },
  ],
});
