import {
  build_feature_shell_page,
  type FeatureShellFieldOption,
  type KirletPageDecl,
  type NoxUiNode,
} from "@opus-perpetuus/imperium-core-kit";
import { numero, sello_ahora, solo_dia, texto } from "../../lib/comun.ts";
import { ADELANTOS, fecha_valida, hoy_en_zona, ordenar_eventos, zona_valida } from "../../lib/agenda/recordatorio.ts";
import { zona_de } from "./herr-agenda.flow.ts";

const API = "api://m/subject-herramientas";
const PERMISO = "subject.herramientas.herr-agenda.read";
const DIA_MS = 86_400_000;

const SI_NO: FeatureShellFieldOption[] = [
  { value: true, label: "Sí" },
  { value: false, label: "No" },
];

const eventos: KirletPageDecl = {
  id: "herramientas.herr-agenda",
  path: "herr-agenda",
  permission: PERMISO,
  build: () =>
    build_feature_shell_page({
      id: "herramientas.herr-agenda",
      owner: "subject-herramientas",
      title: "Agenda",
      props: {
        basePath: "herr-agenda",
        idKey: "id",
        nameKey: "name",
        view: {
          title: "Agenda",
          subtitle: "Eventos con aviso o alarma; las alarmas las programa el teléfono",
          pluralLabel: "eventos",
          singularLabel: "evento",
          emptyTitle: "Sin eventos",
          emptyDescription: "Crea el primer evento",
        },
        data: {
          list: `${API}/herr-agenda`,
          record: `${API}/herr-agenda/:id`,
          create: { method: "POST", action: `${API}/herr-agenda` },
          update: { method: "PATCH", action: `${API}/herr-agenda/:id` },
          delete: { method: "DELETE", action: `${API}/herr-agenda/:id` },
        },
        table: {
          columns: [
            { key: "fecha", label: "Fecha", sortable: true, priority: 1 },
            { key: "name", label: "Título", sortable: true, priority: 1 },
            { key: "inicio_minuto", label: "Inicio (min)", sortable: true, priority: 2 },
            { key: "hecho", label: "Hecho", sortable: true, priority: 2 },
            { key: "alarma", label: "Alarma", sortable: true, priority: 3 },
            { key: "recordatorio_min", label: "Aviso (min antes)", sortable: true, priority: 3 },
          ],
          fillHeight: true,
          serverQuery: true,
        },
        form: {
          fields: [
            { name: "name", component: "input-text", label: "Título", required: true },
            { name: "fecha", component: "input-date", label: "Fecha", required: true },
            {
              name: "inicio_minuto",
              component: "input-number",
              label: "Inicio (minutos desde medianoche)",
              min: 0,
              max: 1439,
              step: 5,
              help: "Vacío = todo el día (avisa a las 08:00). 570 = 09:30",
            },
            { name: "duracion_min", component: "input-number", label: "Duración (min)", min: 0, step: 5 },
            {
              name: "recordatorio_min",
              component: "input-menu",
              label: "Aviso",
              options: ADELANTOS.map((a) => ({ value: a.value, label: a.label })),
            },
            { name: "alarma", component: "input-switch", label: "Sonar como alarma", options: SI_NO, help: "Suena aunque el teléfono esté en silencio" },
            { name: "hecho", component: "input-switch", label: "Hecho", options: SI_NO },
            { name: "nota", component: "input-markdown", label: "Nota", column_span: "full" },
            { name: "description", component: "input-textarea", label: "Descripción", column_span: "full" },
          ],
        },
      },
    }),
};

function hora_de(minuto: number | null): string {
  if (minuto === null) return "Todo el día";
  return `${String(Math.floor(minuto / 60)).padStart(2, "0")}:${String(minuto % 60).padStart(2, "0")}`;
}

function enlace(text: string, href: string): NoxUiNode {
  return { component: "nox.link", props: { href, text }, text };
}

function dia_desplazado(fecha: string, dias: number): string {
  return new Date(Date.parse(`${fecha}T00:00:00Z`) + dias * DIA_MS).toISOString().slice(0, 10);
}

/** Página propia: los eventos de un día (`?fecha=`, hoy en la zona `?tz=` por defecto) con navegación entre días. */
const dia: KirletPageDecl = {
  id: "herramientas.herr-agenda-dia",
  path: "herr-agenda-dia",
  permission: PERMISO,
  build: async ({ url, data }) => {
    const pedida = texto(solo_dia(url?.searchParams.get("fecha")));
    const fecha = fecha_valida(pedida) ? pedida : hoy_en_zona(zona_valida(url?.searchParams.get("tz")));
    const filas = ordenar_eventos(
      await data.findMany("herr_agenda", { where: { is_active: true, fecha }, limit: 500 }),
    );
    const rows = filas.map((e) => ({
      hora: hora_de(numero(e.inicio_minuto)),
      titulo: texto(e.name),
      duracion: `${numero(e.duracion_min) ?? 60} min`,
      aviso: texto(e.recordatorio_en) ? sello_ahora(zona_de(e), new Date(texto(e.recordatorio_en))) : "Sin aviso",
      hecho: e.hecho === true ? "Sí" : "No",
    }));
    return {
      id: "herramientas.herr-agenda-dia",
      owner: "subject-herramientas",
      title: `Agenda del ${fecha}`,
      page: {
        component: "nox.stack",
        props: { gap: "md" },
        children: [
          {
            component: "nox.stack",
            props: { gap: "sm" },
            children: [
              enlace("← Día anterior", `/internal/herr-agenda-dia?fecha=${dia_desplazado(fecha, -1)}`),
              enlace("Hoy", "/internal/herr-agenda-dia"),
              enlace("Día siguiente →", `/internal/herr-agenda-dia?fecha=${dia_desplazado(fecha, 1)}`),
              enlace("Todos los eventos", "/internal/herr-agenda"),
            ],
          },
          rows.length
            ? {
                component: "nox.table",
                props: {
                  columns: [
                    { key: "hora", label: "Hora" },
                    { key: "titulo", label: "Evento" },
                    { key: "duracion", label: "Duración" },
                    { key: "aviso", label: "Aviso" },
                    { key: "hecho", label: "Hecho" },
                  ],
                  rows,
                },
              }
            : { component: "nox.empty", props: { description: "Nada agendado para este día." }, text: "Sin eventos" },
        ],
      },
    };
  },
};

export const herr_agenda_pages: KirletPageDecl[] = [eventos, dia];
