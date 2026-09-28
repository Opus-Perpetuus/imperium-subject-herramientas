import {
  build_feature_shell_page,
  type FeatureShellFieldDescriptor,
  type FeatureShellFieldOption,
  type KirletPageDecl,
  type NoxUiNode,
} from "@opus-perpetuus/imperium-core-kit";
import { texto } from "../../lib/comun.ts";

const API = "api://m/subject-herramientas";
const PERMISO = "subject.herramientas.herr-telefono.read";

const SI_NO: FeatureShellFieldOption[] = [
  { value: true, label: "Sí" },
  { value: false, label: "No" },
];

const CAMPOS_BASE: FeatureShellFieldDescriptor[] = [
  { name: "name", component: "input-text", label: "Nombre", required: true },
  { name: "description", component: "input-textarea", label: "Descripción", column_span: "full" },
];

function interruptor(name: string, label: string, help?: string): FeatureShellFieldDescriptor {
  return { name, component: "input-switch", label, options: SI_NO, ...(help ? { help } : {}) };
}

/** Página de lista → detalle → edición de un recurso de esta herramienta. */
function pagina_crud(input: {
  id: string;
  path: string;
  basePath: string;
  title: string;
  subtitle: string;
  singular: string;
  plural: string;
  empty: string;
  columns: Array<{ key: string; label: string }>;
  fields?: FeatureShellFieldDescriptor[];
  editable?: boolean;
}): KirletPageDecl {
  const url = `${API}/${input.basePath}`;
  const editable = input.editable !== false;
  return {
    id: input.id,
    path: input.path,
    permission: PERMISO,
    build: () =>
      build_feature_shell_page({
        id: input.id,
        owner: "subject-herramientas",
        title: input.title,
        props: {
          basePath: input.basePath,
          idKey: "id",
          nameKey: "name",
          view: {
            title: input.title,
            subtitle: input.subtitle,
            pluralLabel: input.plural,
            singularLabel: input.singular,
            emptyTitle: `Sin ${input.plural}`,
            emptyDescription: input.empty,
          },
          data: {
            list: url,
            record: `${url}/:id`,
            ...(editable
              ? {
                  create: { method: "POST", action: url },
                  update: { method: "PATCH", action: `${url}/:id` },
                  delete: { method: "DELETE", action: `${url}/:id` },
                }
              : {}),
          },
          table: {
            columns: input.columns.map((c, i) => ({ ...c, sortable: true, priority: i === 0 ? 1 : i < 3 ? 2 : 3 })),
            fillHeight: true,
            serverQuery: true,
          },
          ...(input.fields ? { form: { fields: input.fields } } : {}),
        },
      }),
  };
}

const perfil = pagina_crud({
  id: "herramientas.herr-telefono",
  path: "herr-telefono",
  basePath: "herr-telefono",
  title: "Contestador automático",
  subtitle: "Perfiles de reglas; el marcado como vigente es el que usa el teléfono",
  singular: "perfil",
  plural: "perfiles",
  empty: "Crea un perfil y márcalo como vigente",
  columns: [
    { key: "name", label: "Perfil" },
    { key: "es_activa", label: "Vigente" },
    { key: "activo", label: "Contestador" },
    { key: "ambito", label: "Contesta a" },
    { key: "accion_desconocidos", label: "Desconocidos" },
    { key: "conduciendo_activo", label: "Conduciendo" },
  ],
  fields: [
    ...CAMPOS_BASE,
    interruptor("es_activa", "Perfil vigente", "Solo un perfil está vigente; al marcar este, los demás dejan de estarlo"),
    interruptor("activo", "Contestador encendido", "Apagado, solo se aplican los contactos rechazados y la acción para desconocidos"),
    {
      name: "ambito",
      component: "input-menu",
      label: "Contesta a",
      options: [
        { value: "nadie", label: "Nadie: solo filtra y locuta, no descuelga" },
        { value: "contactos", label: "Cualquiera de la agenda" },
        { value: "seleccionados", label: "Solo los contactos seleccionados" },
        { value: "todos", label: "Todo el mundo" },
      ],
    },
    {
      name: "accion_desconocidos",
      component: "input-menu",
      label: "Números fuera de la agenda",
      options: [
        { value: "permitir", label: "Dejar entrar" },
        { value: "rechazar", label: "Rechazar" },
        { value: "silenciar", label: "Dejar entrar en silencio" },
      ],
    },
    { name: "retardo_s", component: "input-number", label: "Segundos antes de descolgar", min: 0, max: 60, step: 1, help: "Da tiempo a oír la locución y a cancelar a mano" },
    interruptor("anuncio_activo", "Locutar quién llama"),
    { name: "anuncio_plantilla", component: "input-text", label: "Plantilla de la locución", help: "«{nombre}» se sustituye por el contacto o por el número" },
    { name: "anuncio_repeticiones", component: "input-number", label: "Repeticiones de la locución", min: 1, max: 10, step: 1 },
    interruptor("anunciar_desconocidos", "Locutar también a desconocidos", "Lee los dígitos del número"),
    { name: "anuncio_idioma", component: "input-text", label: "Idioma de la voz", placeholder: "es-MX" },
    interruptor("whatsapp_activo", "Atender llamadas de WhatsApp"),
    { name: "whatsapp_plantilla", component: "input-text", label: "Plantilla para WhatsApp" },
    interruptor("conduciendo_activo", "Modo conduciendo", "En marcha se enciende el contestador y se rechazan los desconocidos; al parar vuelve todo como estaba"),
  ],
});

const contactos = pagina_crud({
  id: "herramientas.herr-telefono-contactos",
  path: "herr-telefono-contactos",
  basePath: "herr-telefono/contactos",
  title: "Contactos del contestador",
  subtitle: "A quién descolgar (seleccionados) y a quién rechazar siempre",
  singular: "contacto",
  plural: "contactos",
  empty: "Agrega un contacto y elige si se le contesta o se le rechaza",
  columns: [
    { key: "name", label: "Contacto" },
    { key: "modo", label: "Modo" },
    { key: "telefono", label: "Teléfono" },
    { key: "regla_id", label: "Perfil" },
  ],
  fields: [
    { name: "name", component: "input-text", label: "Nombre", required: true },
    {
      name: "regla_id",
      component: "input-datalist",
      label: "Perfil",
      required: true,
      optionsSource: `${API}/herr-telefono?as=options&limite=1000`,
    },
    {
      name: "modo",
      component: "input-menu",
      label: "Modo",
      options: [
        { value: "seleccionado", label: "Seleccionado: se le contesta" },
        { value: "rechazado", label: "Rechazado: nunca entra" },
      ],
    },
    { name: "telefono", component: "input-text", label: "Teléfono", type: "tel" },
    { name: "clave", component: "input-text", label: "Clave en la agenda del teléfono", help: "La pone la app Android; si va vacía se usa el nombre" },
    { name: "description", component: "input-textarea", label: "Notas", column_span: "full" },
  ],
});

const llamadas = pagina_crud({
  id: "herramientas.herr-telefono-llamadas",
  path: "herr-telefono-llamadas",
  basePath: "herr-telefono/llamadas",
  title: "Registro de llamadas",
  subtitle: "Lo que el contestador decidió con cada llamada",
  singular: "llamada",
  plural: "llamadas",
  empty: "Las llamadas aparecen aquí conforme el teléfono las atiende",
  editable: false,
  columns: [
    { key: "fecha_hora", label: "Cuándo" },
    { key: "decision", label: "Decisión" },
    { key: "contacto_nombre", label: "Contacto" },
    { key: "numero", label: "Número" },
    { key: "origen", label: "Origen" },
    { key: "motivo", label: "Motivo" },
    { key: "conduciendo", label: "Conduciendo" },
  ],
});

const COLUMNAS_LLAMADAS = [
  { key: "fecha_hora", label: "Cuándo" },
  { key: "decision", label: "Decisión" },
  { key: "quien", label: "Quién" },
  { key: "origen", label: "Origen" },
  { key: "motivo", label: "Motivo" },
];

const EXPLICACION = `## Qué hace el teléfono con estas reglas

La app Android de Imperium es la que **filtra, contesta y locuta**: aquí solo se
configuran las reglas y se guarda el registro.

1. Al entrar una llamada, la app cruza el número con la agenda del teléfono y pide
   la decisión a \`POST /herr-telefono/decidir\` con el perfil vigente.
2. Un contacto de la lista de **rechazados** se rechaza siempre, esté o no
   encendido el contestador.
3. Un número fuera de la agenda sigue la acción para **desconocidos**: entrar,
   rechazar o entrar en silencio.
4. Con el contestador **encendido**, el timbre va callado, se locuta quién llama
   y se descuelga según **a quién se contesta** tras los segundos de espera.
5. En modo **conduciendo**, mientras el teléfono detecta que va en marcha, se
   enciende el contestador y se rechazan los desconocidos; al parar vuelve todo
   como estaba.

Las llamadas de WhatsApp se identifican por el nombre de la notificación, no por
el número.`;

/** Página propia: qué hace el teléfono y las últimas 20 llamadas. */
const android: KirletPageDecl = {
  id: "herramientas.herr-telefono-android",
  path: "herr-telefono-android",
  permission: PERMISO,
  build: async ({ data }) => {
    const activo = await data.findOne("herr_telefono", { es_activa: true, is_active: true });
    const ultimas = await data.findMany("herr_telefono_llamadas", {
      where: { is_active: true },
      orderBy: { fecha_hora: "desc" },
      limit: 20,
    });
    const filas = ultimas.map((l) => ({
      fecha_hora: texto(l.fecha_hora).replace("T", " ").slice(0, 16),
      decision: texto(l.decision),
      quien: texto(l.contacto_nombre) || texto(l.numero) || "número oculto",
      origen: texto(l.origen),
      motivo: texto(l.motivo),
    }));
    const aviso: NoxUiNode = activo
      ? { component: "nox.alert", props: { tone: "info", description: `Perfil vigente: ${texto(activo.name)}` }, text: "El contestador se ejecuta en el teléfono" }
      : { component: "nox.alert", props: { tone: "warning", description: "Marca un perfil como vigente en «Contestador» para que el teléfono lo use." }, text: "No hay un perfil vigente" };
    return {
      id: "herramientas.herr-telefono-android",
      owner: "subject-herramientas",
      title: "El contestador en el teléfono",
      page: {
        component: "nox.stack",
        props: { gap: "md" },
        children: [
          aviso,
          { component: "nox.markdown-view", props: { content: EXPLICACION } },
          { component: "nox.link", props: { href: "/internal/herr-telefono", text: "Editar las reglas" }, text: "Editar las reglas" },
          filas.length
            ? { component: "nox.table", props: { columns: COLUMNAS_LLAMADAS, rows: filas } }
            : { component: "nox.empty", props: { description: "Las llamadas aparecen aquí conforme el teléfono las atiende." }, text: "Sin llamadas todavía" },
        ],
      },
    };
  },
};

export const herr_telefono_pages: KirletPageDecl[] = [perfil, contactos, llamadas, android];
