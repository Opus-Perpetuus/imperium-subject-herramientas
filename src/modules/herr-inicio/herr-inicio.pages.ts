import type {
  KirletPageDecl,
  NoxPageDescriptor,
  NoxUiNode,
} from "@opus-perpetuus/imperium-core-kit";

/** Una herramienta en la portada: a dónde lleva y qué ofrece. */
export type Herramienta = {
  id: string;
  nombre: string;
  descripcion: string;
  icono: string;
  /**
   * Rutas `/internal/<segmento>`, la primera es la principal: hojas de esta app
   * o la ruta de otra app (`vehicle` es el módulo de la app Vehículos).
   */
  accesos: Array<{ texto: string; segmento: string; icono: string }>;
  /** Lo que solo hace la app Android de Imperium con estos datos (sigue a «Solo en la app Android:»). */
  solo_android?: string;
};

export const HERRAMIENTAS: Herramienta[] = [
  {
    id: "tablas",
    nombre: "Tablas personalizadas",
    descripcion:
      "Bases de datos a tu medida sin programar: escribe las columnas o parte de una plantilla, con totales, cálculos y cierre del día.",
    icono: "fa-table-list",
    accesos: [
      { texto: "Mis tablas", segmento: "herr-tabla", icono: "fa-table" },
      { texto: "Capturar", segmento: "herr-registro", icono: "fa-plus" },
      { texto: "Registros", segmento: "herr-registros", icono: "fa-list" },
      { texto: "Cierres", segmento: "herr-cierres", icono: "fa-box-archive" },
    ],
  },
  {
    id: "reparto",
    nombre: "Reparto a domicilio",
    descripcion:
      "Jornadas con vehículo, pedidos con precio automático, domicilios con mapa, gastos, caja, combustible y rutas GPS.",
    icono: "fa-motorcycle",
    accesos: [
      { texto: "Jornada", segmento: "herr-jornada", icono: "fa-route" },
      { texto: "Pedidos", segmento: "herr-pedidos", icono: "fa-receipt" },
      { texto: "Liquidación", segmento: "herr-liquidacion", icono: "fa-cash-register" },
      { texto: "Domicilios", segmento: "herr-domicilios", icono: "fa-house" },
      { texto: "Vehículos", segmento: "vehicle", icono: "fa-car" },
      { texto: "Ajustes de vehículo", segmento: "herr-vehiculos", icono: "fa-gauge" },
      { texto: "Ruta GPS", segmento: "herramientas/ruta", icono: "fa-location-dot" },
    ],
    solo_android: "el rastreo GPS lo hace el teléfono; aquí se reciben los puntos.",
  },
  {
    id: "telefono",
    nombre: "Teléfono",
    descripcion:
      "Reglas del contestador automático: a quién contestar, rechazar o silenciar, y cómo anunciar la llamada.",
    icono: "fa-phone-volume",
    accesos: [
      { texto: "Contestador", segmento: "herr-telefono", icono: "fa-sliders" },
      { texto: "Contactos", segmento: "herr-telefono-contactos", icono: "fa-address-book" },
      { texto: "Llamadas", segmento: "herr-telefono-llamadas", icono: "fa-phone" },
      { texto: "En este teléfono", segmento: "herramientas/telefono", icono: "fa-mobile-screen" },
    ],
    solo_android: "filtrar, contestar y anunciar llamadas.",
  },
  {
    id: "voz",
    nombre: "Asistente de voz",
    descripcion:
      "Entiende órdenes en español («anota un pedido de 250…») y las ejecuta sobre Reparto; también por escrito.",
    icono: "fa-microphone-lines",
    accesos: [
      { texto: "Asistente", segmento: "herr-asistente", icono: "fa-comment-dots" },
      { texto: "Ajustes", segmento: "herr-voz", icono: "fa-sliders" },
      { texto: "Bitácora", segmento: "herr-voz-bitacora", icono: "fa-clock-rotate-left" },
      { texto: "Hablarle", segmento: "herramientas/voz", icono: "fa-microphone" },
    ],
    solo_android: "escuchar y hablar.",
  },
  {
    id: "agenda",
    nombre: "Agenda",
    descripcion: "Eventos con recordatorio o alarma y una nota en Markdown.",
    icono: "fa-calendar-days",
    accesos: [
      { texto: "Hoy", segmento: "herr-agenda-dia", icono: "fa-calendar-day" },
      { texto: "Eventos", segmento: "herr-agenda", icono: "fa-list" },
      { texto: "Avisos", segmento: "herramientas/avisos", icono: "fa-bell" },
    ],
    solo_android: "programar las alarmas.",
  },
  {
    id: "utilidades",
    nombre: "Utilidades",
    descripcion: "Servicios para otras apps: fórmulas, Markdown, geodesia y análisis de rutas.",
    icono: "fa-screwdriver-wrench",
    accesos: [{ texto: "Ver capacidades", segmento: "herr-utilidades", icono: "fa-book-open" }],
  },
];

function boton(a: Herramienta["accesos"][number]): NoxUiNode {
  return {
    component: "nox.button",
    props: { href: `/internal/${a.segmento}`, text: a.texto, icon: a.icono, variant: "secondary" },
    text: a.texto,
  };
}

function tarjeta(h: Herramienta): NoxUiNode {
  const texto = h.solo_android ? `${h.descripcion}\n\n*Solo en la app Android: ${h.solo_android}*` : h.descripcion;
  return {
    component: "nox.card",
    props: { title: h.nombre },
    text: h.nombre,
    children: [
      { component: "nox.markdown-view", props: { content: texto } },
      { component: "nox.toolbar", props: {}, children: h.accesos.map(boton) },
    ],
  };
}

export function construir_inicio(): NoxPageDescriptor {
  return {
    id: "herramientas.herr-inicio",
    owner: "subject-herramientas",
    title: "Herramientas",
    page: {
      component: "nox.page",
      props: { title: "Herramientas" },
      children: [
        {
          component: "nox.markdown-view",
          props: { content: "Cada herramienta funciona sola; otras apps también pueden usarlas sin abrirlas." },
        },
        { component: "nox.stack", props: { layout: "grid" }, children: HERRAMIENTAS.map(tarjeta) },
      ],
    },
  } as NoxPageDescriptor;
}

export const herr_inicio_pages: KirletPageDecl[] = [
  {
    id: "herramientas.herr-inicio",
    path: "herr-inicio",
    permission: "subject.herramientas.herr-inicio.read",
    build: () => construir_inicio(),
  },
];
