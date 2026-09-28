import { define_crud, define_module, type DomainRow } from "@opus-perpetuus/imperium-core-kit";
import { campo_busqueda, falla } from "../../lib/comun.ts";
import { spec_de_fila, validar_esquema } from "../../lib/formulas/esquema.ts";
import { herr_tablas_flow } from "./herr-tablas.flow.ts";
import { herr_tablas_pages } from "./herr-tablas.pages.ts";
import { herr_tablas_tables } from "./herr-tablas.tables.ts";

const ESQUEMA = ["campos", "constantes", "resumenes"] as const;

const huella = (fila: DomainRow) => {
  const s = spec_de_fila(fila);
  return JSON.stringify([s.campos, s.constantes, s.resumenes]);
};

/** Valida el esquema antes de guardarlo, lo deja normalizado y sube `version_esquema` cuando cambia. */
function preparar_tabla(patch: DomainRow, existing: DomainRow | null): DomainRow {
  for (const col of ESQUEMA) {
    if (typeof patch[col] === "string") falla(400, `${col}: JSON inválido`);
  }
  const fila = { ...existing, ...patch };
  const spec = spec_de_fila(fila);
  const errores = validar_esquema(spec);
  if (errores.length) falla(400, errores.join("; "));
  const toca_esquema = !existing || ESQUEMA.some((col) => col in patch);
  if (toca_esquema) {
    patch.campos = spec.campos;
    patch.constantes = spec.constantes;
    patch.resumenes = spec.resumenes;
  }
  if (!existing) patch.version_esquema = 1;
  else if (toca_esquema && huella(fila) !== huella(existing)) {
    patch.version_esquema = Number(existing.version_esquema ?? 0) + 1;
  }
  patch.search_field = campo_busqueda(fila.name, fila.description, ...spec.campos.map((c) => c.etiqueta));
  return patch;
}

export const herr_tablas_module = define_module({
  resource: "herr-tablas",
  labels: {
    singular: "Tabla personalizada",
    plural: "Tablas personalizadas",
    read: "Ver tablas personalizadas",
    write: "Editar tablas personalizadas",
  },
  routes: [
    ...herr_tablas_flow,
    ...define_crud({
      resource: "herr-tablas",
      table: "herr_tablas",
      soft_delete: true,
      soft_delete_field: "is_active",
      history: true,
      default_sort: "updated_at:desc",
      id_prefix: "tabla",
      fields: {
        name: { type: "string", required: true, search: true },
        description: { type: "string", search: true },
        is_active: { type: "boolean" },
        ref: { type: "string" },
        search_field: { type: "string", search: true },
        created_by: { type: "string" },
        custom_data: { type: "json" },
        payload: { type: "json" },
        icono: { type: "string" },
        campos: { type: "json" },
        constantes: { type: "json" },
        resumenes: { type: "json" },
        plantilla_id: { type: "string" },
        orden_campo: { type: "string" },
        orden_desc: { type: "boolean" },
        cerrable: { type: "boolean" },
        version_esquema: { type: "number" },
      },
      options_map: { value: "id", label: "name" },
      hooks: {
        before_create: (_ctx, row) => preparar_tabla(row, null),
        before_update: (_ctx, _id, patch, existing) => preparar_tabla(patch, existing),
      },
    }),
  ],
  tables: herr_tablas_tables,
  pages: herr_tablas_pages,
  menu: [
    {
      id: "herramientas.herr-tablas",
      label: "Tablas personalizadas",
      order: 10,
      pageId: "herramientas.herr-tablas",
      path: "herr-tablas",
      permission: "subject.herramientas.herr-tablas.read",
      icon: "fa-table-list",
    },
    {
      id: "herramientas.herr-tabla",
      label: "Ver tabla",
      order: 11,
      pageId: "herramientas.herr-tabla",
      path: "herr-tabla",
      permission: "subject.herramientas.herr-tablas.read",
      icon: "fa-table",
    },
  ],
});
