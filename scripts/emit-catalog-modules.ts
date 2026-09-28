/**
 * Emite los `modules[]` de esta app para `modular/catalog.json` del monorepo a
 * partir del esquema real (`SUBJECT.schema()`) y de los módulos definidos.
 *
 *   bun run scripts/emit-catalog-modules.ts > /tmp/modules.json
 *
 * Un módulo con tabla propia produce una entrada con sus columnas (sin las
 * base); un módulo sin tabla (utilidades, inicio) produce una entrada sin
 * columnas para que el núcleo le dé menú y grants.
 */
import { SUBJECT } from "../src/subject.ts";

const BASE = new Set([
  "id",
  "name",
  "description",
  "is_active",
  "ref",
  "search_field",
  "created_by",
  "custom_data",
  "payload",
  "created_at",
  "updated_at",
]);

const CRUD: Record<string, string> = {
  text: "string",
  integer: "number",
  real: "number",
  boolean: "boolean",
  json: "json",
};
const COMPONENT: Record<string, string> = {
  text: "input-text",
  integer: "input-number",
  real: "input-number",
  boolean: "input-checkbox",
  json: "input-json",
};

const tables = new Map(SUBJECT.schema().tables.map((t) => [t.name, t]));
const icons = new Map<string, string>();
for (const mod of SUBJECT.modules) {
  const leaf = (mod.menu ?? []).find((m) => m.path === mod.resource);
  if (leaf?.icon) icons.set(mod.resource, leaf.icon);
}

const out = SUBJECT.modules.map((mod) => {
  const table_name = mod.resource.replace(/-/g, "_");
  const table = tables.get(table_name);
  const columns = (table?.columns ?? [])
    .filter((c) => !BASE.has(c.name))
    .map((c) => ({
      name: c.name,
      mongo: c.name,
      pg: c.type,
      crud: CRUD[c.type] ?? "string",
      component: COMPONENT[c.type] ?? "input-text",
      label: c.name.replace(/_/g, " "),
    }));
  return {
    resource: mod.resource,
    table: table ? table_name : "",
    name: mod.labels.plural,
    path: `/${mod.resource}`,
    collection: mod.resource,
    model_file: `subjects/herramientas/${mod.resource}`,
    menu_ref: `herramientas-${mod.resource}`,
    icon: icons.get(mod.resource) ?? "fa-toolbox",
    columns,
  };
});

console.log(JSON.stringify(out, null, 2));
