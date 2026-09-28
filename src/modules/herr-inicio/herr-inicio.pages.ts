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
  /** Hojas del lanzador (`/internal/<segmento>`), la primera es la principal. */
  accesos: Array<{ texto: string; segmento: string }>;
  /** Lo que solo hace la app Android de Imperium con estos datos. */
  solo_android?: string;
};

export const HERRAMIENTAS: Herramienta[] = [
  {
    id: "tablas",
    nombre: "Tablas personalizadas",
    descripcion:
      "Bases de datos a la medida: campos tipados, constantes, resúmenes y fórmulas; plantillas listas y cierre que archiva las filas.",
    icono: "fa-table-list",
    accesos: [
      { texto: "Tablas", segmento: "herr-tablas" },
      { texto: "Registros", segmento: "herr-registros" },
      { texto: "Cierres", segmento: "herr-cierres" },
    ],
  },
  {
    id: "reparto",
    nombre: "Reparto a domicilio",
    descripcion:
      "Jornadas con vehículo (de la app Vehículos), pedidos con precio automático, domicilios con mapa, gastos, caja y liquidación, combustible y rutas GPS.",
    icono: "fa-motorcycle",
    accesos: [
      { texto: "Jornada en curso", segmento: "herr-jornada" },
      { texto: "Pedidos", segmento: "herr-pedidos" },
      { texto: "Liquidación", segmento: "herr-liquidacion" },
      { texto: "Domicilios", segmento: "herr-domicilios" },
      { texto: "Vehículos (app Vehículos)", segmento: "vehicle" },
      { texto: "Ajustes de vehículo", segmento: "herr-vehiculos" },
    ],
    solo_android: "El rastreo GPS de la ruta lo hace el teléfono; aquí se reciben los puntos.",
  },
  {
    id: "telefono",
    nombre: "Teléfono",
    descripcion:
      "Reglas del contestador automático: a quién contestar, rechazar o silenciar, y cómo anunciar la llamada.",
    icono: "fa-phone-volume",
    accesos: [
      { texto: "Contestador", segmento: "herr-telefono" },
      { texto: "Contactos", segmento: "herr-telefono-contactos" },
      { texto: "Llamadas", segmento: "herr-telefono-llamadas" },
    ],
    solo_android: "Filtrar, contestar y anunciar llamadas es de la app Android.",
  },
  {
    id: "voz",
    nombre: "Asistente de voz",
    descripcion:
      "Entiende órdenes en español («anota un pedido de 250…») y las ejecuta sobre Reparto; también por escrito.",
    icono: "fa-microphone-lines",
    accesos: [
      { texto: "Asistente", segmento: "herr-asistente" },
      { texto: "Ajustes", segmento: "herr-voz" },
      { texto: "Bitácora", segmento: "herr-voz-bitacora" },
    ],
    solo_android: "Escuchar y hablar es de la app Android.",
  },
  {
    id: "agenda",
    nombre: "Agenda",
    descripcion: "Eventos con recordatorio o alarma y una nota en Markdown.",
    icono: "fa-calendar-days",
    accesos: [
      { texto: "Hoy", segmento: "herr-agenda-dia" },
      { texto: "Eventos", segmento: "herr-agenda" },
    ],
    solo_android: "Las alarmas las programa la app Android.",
  },
  {
    id: "utilidades",
    nombre: "Utilidades",
    descripcion:
      "Servicios para otras apps: fórmulas, Markdown, geodesia y análisis de rutas.",
    icono: "fa-screwdriver-wrench",
    accesos: [{ texto: "Ver capacidades", segmento: "herr-utilidades" }],
  },
];

function enlace(texto: string, segmento: string): NoxUiNode {
  return {
    component: "nox.link",
    props: { href: `/internal/${segmento}`, text: texto },
    text: texto,
  };
}

function tarjeta(h: Herramienta): NoxUiNode {
  const children: NoxUiNode[] = [
    { component: "nox.markdown-view", props: { content: h.descripcion } },
    ...h.accesos.map((a) => enlace(a.texto, a.segmento)),
  ];
  if (h.solo_android) {
    children.push({
      component: "nox.badge",
      props: { color: "info" },
      text: `Android: ${h.solo_android}`,
    });
  }
  return {
    component: "nox.card",
    props: { title: h.nombre, icon: h.icono },
    text: h.nombre,
    children,
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
          props: {
            content:
              "Herramientas misceláneas de Imperium. Cada una funciona sola y otras apps pueden usarlas sin abrirlas.",
          },
        },
        {
          component: "nox.stack",
          props: { direction: "column", gap: "md" },
          children: HERRAMIENTAS.map(tarjeta),
        },
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
