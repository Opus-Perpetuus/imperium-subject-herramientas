import type { KirletModuleDef } from "@opus-perpetuus/imperium-core-kit";
import { herr_inicio_module } from "./herr-inicio/herr-inicio.routes.ts";
import { herr_utilidades_module } from "./herr-utilidades/herr-utilidades.routes.ts";
import { herr_tablas_module } from "./herr-tablas/herr-tablas.routes.ts";
import { herr_registros_module } from "./herr-registros/herr-registros.routes.ts";
import { herr_cierres_module } from "./herr-cierres/herr-cierres.routes.ts";
import { herr_jornadas_module } from "./herr-jornadas/herr-jornadas.routes.ts";
import { herr_pedidos_module } from "./herr-pedidos/herr-pedidos.routes.ts";
import { herr_gastos_module } from "./herr-gastos/herr-gastos.routes.ts";
import { herr_caja_module } from "./herr-caja/herr-caja.routes.ts";
import { herr_menu_categorias_module } from "./herr-menu-categorias/herr-menu-categorias.routes.ts";
import { herr_menu_tamanos_module } from "./herr-menu-tamanos/herr-menu-tamanos.routes.ts";
import { herr_menu_productos_module } from "./herr-menu-productos/herr-menu-productos.routes.ts";
import { herr_menu_extras_module } from "./herr-menu-extras/herr-menu-extras.routes.ts";
import { herr_menu_complementos_module } from "./herr-menu-complementos/herr-menu-complementos.routes.ts";
import { herr_menu_promos_module } from "./herr-menu-promos/herr-menu-promos.routes.ts";
import { herr_vehiculos_module } from "./herr-vehiculos/herr-vehiculos.routes.ts";
import { herr_domicilios_module } from "./herr-domicilios/herr-domicilios.routes.ts";
import { herr_etiquetas_module } from "./herr-etiquetas/herr-etiquetas.routes.ts";
import { herr_recargas_module } from "./herr-recargas/herr-recargas.routes.ts";
import { herr_rutas_module } from "./herr-rutas/herr-rutas.routes.ts";
import { herr_telefono_module } from "./herr-telefono/herr-telefono.routes.ts";
import { herr_voz_module } from "./herr-voz/herr-voz.routes.ts";
import { herr_agenda_module } from "./herr-agenda/herr-agenda.routes.ts";

/**
 * Módulos de la app, agrupados por herramienta. Cada herramienta vive en
 * `modules/herr-<recurso>/` (un módulo por tabla) y su lógica pura en
 * `lib/<tema>/`. El orden aquí es el del menú.
 */
export const MODULOS: KirletModuleDef[] = [herr_inicio_module, herr_tablas_module, herr_registros_module, herr_cierres_module, herr_jornadas_module, herr_pedidos_module, herr_gastos_module, herr_caja_module, herr_menu_categorias_module, herr_menu_tamanos_module, herr_menu_productos_module, herr_menu_extras_module, herr_menu_complementos_module, herr_menu_promos_module, herr_vehiculos_module, herr_domicilios_module, herr_etiquetas_module, herr_recargas_module, herr_rutas_module, herr_telefono_module, herr_voz_module, herr_agenda_module, herr_utilidades_module];
