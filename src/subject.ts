import { define_subject } from "@opus-perpetuus/imperium-core-kit";
import pkg from "../package.json" with { type: "json" };
import { MODULOS } from "./modules/index.ts";
import { seed_demo } from "./seed.ts";

export const SUBJECT = define_subject({
  id: "SUBJECT-herramientas",
  name: "Herramientas",
  version: pkg.version,
  image: `ghcr.io/opus-perpetuus/subject-herramientas:${pkg.version}`,
  compat: { nox: ">=0.5.0", kit: "^0.5.0" },
  schema_version: 2,
  storage_files: true,
  // El registro de vehículos es la app Vehículos; aquí solo van los ajustes de reparto.
  dependsOn: ["subject-vehiculos"],
  menu_root: {
    id: "herramientas.root",
    label: "Herramientas",
    order: 0,
  },
  modules: MODULOS,
  seed: seed_demo,
});

export const KIRLET = SUBJECT;
