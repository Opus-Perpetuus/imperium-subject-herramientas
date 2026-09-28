import {
  build_feature_shell_page,
  type DomainRow,
  type KirletPageBuildArgs,
  type KirletPageDecl,
  type NoxPageDescriptor,
  type NoxUiNode,
} from "@opus-perpetuus/imperium-core-kit";
import { filas_de, numero, texto } from "../../lib/comun.ts";
import { jornada_activa } from "../../lib/jornadas/jornada.ts";
import { vista_previa, type Parte } from "../../lib/liquidacion/liquidacion.ts";
import { ETIQUETA_ESTADO, es_abierto, es_entregado, estado_de, type Estado } from "../../lib/pedidos/estado.ts";

const API = "api://m/subject-herramientas";
const OWNER = "subject-herramientas";

function nodo(component: string, props: Record<string, unknown> = {}, children?: NoxUiNode[]): NoxUiNode {
  return children ? { component, props, children } : { component, props };
}

const pesos = (n: number) => `$${n.toFixed(2)}`;
const km = (n: number) => `${n.toFixed(1)} km`;

/** Botón que escribe en la app; la ruta es relativa a la app, el anfitrión pone la base. */
function boton(text: string, path: string, extra: { confirm?: string; variant?: string } = {}): NoxUiNode {
  return {
    component: "nox.button",
    props: { text, invoke: { method: "POST", action: `api://${path}` }, body: {}, ...extra },
    text,
  };
}

function enlace(text: string, href: string): NoxUiNode {
  return { component: "nox.link", props: { text, href }, text };
}

/** La jornada pedida por la URL (`?id=` / `?jornada=`), o null si no viene o no existe. */
async function jornada_pedida(args: KirletPageBuildArgs, ...params: string[]): Promise<DomainRow | null> {
  for (const p of params) {
    const id = texto(args.url?.searchParams.get(p));
    if (id) {
      const fila = await args.data.findOne("herr_jornadas", { id });
      if (fila && fila.is_active !== false) return fila;
    }
  }
  return null;
}

function pagina(id: string, title: string, hijos: NoxUiNode[]): NoxPageDescriptor {
  return { id, owner: OWNER, title, page: nodo("nox.page", { title }, hijos) };
}

async function pagina_jornada(args: KirletPageBuildArgs): Promise<NoxPageDescriptor> {
  const activa = await jornada_activa(args);
  const jornada = (await jornada_pedida(args, "id")) ?? activa;
  // Sin jornada abierta siempre se ofrece iniciar, aunque se esté mirando una cerrada.
  const iniciar = activa ? [] : [boton("Iniciar jornada", "herr-jornadas/iniciar", { variant: "primary" })];
  if (!jornada) {
    return pagina("herramientas.herr-jornada", "Jornada", [
      nodo("nox.empty", { title: "Sin jornada abierta", description: "Inicia una para registrar pedidos, gastos y caja." }),
      ...iniciar,
    ]);
  }
  const id = String(jornada.id);
  const abierta = jornada.estado === "abierta";
  const [pedidos, vp] = await Promise.all([
    filas_de(args, "herr_pedidos", { jornada_id: id, is_active: true }),
    vista_previa(args, id),
  ]);
  const entregas = pedidos.filter((p) => es_entregado(estado_de(p))).length;
  const abiertos = pedidos
    .filter((p) => es_abierto(estado_de(p)))
    .sort((a, b) => (numero(a.orden) ?? 0) - (numero(b.orden) ?? 0));
  const titulo = `Jornada ${texto(jornada.fecha)}${jornada.vehiculo_nombre ? ` · ${texto(jornada.vehiculo_nombre)}` : ""}`;

  return pagina("herramientas.herr-jornada", titulo, [
    nodo("nox.stats", {
      items: [
        { label: "Entregas", value: String(entregas) },
        { label: "Kilómetros", value: km(numero(jornada.km_recorridos) ?? 0) },
        { label: "Cobros del día", value: pesos(vp.pedidos_de_hoy.total) },
        { label: "Disponible", value: pesos(vp.disponible) },
      ],
    }),
    nodo("nox.detail", {
      items: [
        { label: "Estado", value: abierta ? "Abierta" : "Cerrada" },
        { label: "Inicio", value: texto(jornada.hora_inicio) || "—" },
        { label: "Fin", value: texto(jornada.hora_fin) || (texto(jornada.fin_programado) ? `Programado ${texto(jornada.fin_programado)}` : "—") },
        { label: "En curso", value: String(vp.en_curso) },
      ],
    }),
    abiertos.length
      ? nodo("nox.table", {
          columns: [
            { key: "orden", label: "Orden" },
            { key: "domicilio", label: "Domicilio" },
            { key: "cobrar", label: "A cobrar" },
            { key: "estado", label: "Estado" },
          ],
          rows: abiertos.map((p) => ({
            orden: numero(p.orden) ?? "",
            domicilio: texto(p.domicilio_texto) || texto(p.name),
            cobrar: pesos(numero(p.cobrar) ?? 0),
            estado: ETIQUETA_ESTADO[estado_de(p) as Estado] ?? texto(p.estado),
          })),
        })
      : nodo("nox.empty", { title: "Sin pedidos abiertos", description: "Los pedidos capturados, surtidos o en ruta aparecen aquí." }),
    nodo("nox.toolbar", {}, [
      ...(abierta
        ? [boton("Terminar jornada", `herr-jornadas/${id}/terminar`, { confirm: "¿Terminar la jornada?", variant: "primary" })]
        : []),
      ...iniciar,
      enlace("Ver liquidación", `/internal/herr-liquidacion?jornada=${encodeURIComponent(id)}`),
    ]),
  ]);
}

function parte(p: Parte): string {
  const fechas = p.fechas.length ? ` (${p.fechas.join(", ")})` : "";
  return `${p.registros} · ${pesos(p.total)}${fechas}`;
}

async function pagina_liquidacion(args: KirletPageBuildArgs): Promise<NoxPageDescriptor> {
  const jornada = (await jornada_pedida(args, "jornada", "id")) ?? (await jornada_activa(args));
  if (!jornada) {
    return pagina("herramientas.herr-liquidacion", "Liquidación", [
      nodo("nox.empty", { title: "Sin jornada", description: "Abre una jornada o elige una con ?jornada=." }),
    ]);
  }
  const id = String(jornada.id);
  const vp = await vista_previa(args, id);
  const hijos: NoxUiNode[] = [
    nodo("nox.stats", {
      items: [
        { label: vp.neto < 0 ? "Te devuelven" : "Entregas", value: pesos(Math.abs(vp.neto)) },
        { label: "A caja", value: pesos(vp.a_caja) },
        { label: "Propinas", value: pesos(vp.propinas) },
        { label: "Faltante", value: pesos(vp.faltante) },
      ],
    }),
    nodo("nox.detail", {
      items: [
        { label: "Cambio de caja", value: pesos(vp.cambio_de_caja) },
        { label: "Me debe caja", value: pesos(vp.me_debe_caja) },
        { label: "Gastos sin cubrir", value: pesos(vp.gastos_sin_cubrir) },
        { label: "Pedidos de hoy", value: parte(vp.pedidos_de_hoy) },
        { label: "Pedidos de otras jornadas", value: parte(vp.pedidos_de_otras_jornadas) },
        { label: "Gastos de hoy", value: parte(vp.gastos_de_hoy) },
        { label: "Gastos de otras jornadas", value: parte(vp.gastos_de_otras_jornadas) },
        { label: "Caja de hoy", value: parte(vp.caja_de_hoy) },
        { label: "Caja de otras jornadas", value: parte(vp.caja_de_otras_jornadas) },
        { label: "En curso", value: String(vp.en_curso) },
        { label: "Neto", value: pesos(vp.neto), emphasis: true },
      ],
    }),
  ];
  if (vp.invalidos.length) {
    hijos.push(nodo("nox.alert", { title: "Registros con monto inválido", description: `Revisa: ${vp.invalidos.join(", ")}` }));
  }
  hijos.push(
    vp.nada_que_cobrar
      ? nodo("nox.alert", { title: "Nada que liquidar", description: "No hay pedidos cobrables ni movimientos de caja pendientes." })
      : boton("Entregar cobros", `herr-jornadas/${id}/liquidar`, {
          confirm: `¿Entregar ${pesos(Math.abs(vp.neto))} a caja? Se marcan cobrados los pedidos y descontados los gastos.`,
          variant: "primary",
        }),
  );
  return pagina("herramientas.herr-liquidacion", `Liquidación · Jornada ${texto(jornada.fecha)}`, hijos);
}

export const herr_jornadas_pages: KirletPageDecl[] = [
  {
    id: "herramientas.herr-jornadas",
    path: "herr-jornadas",
    permission: "subject.herramientas.herr-jornadas.read",
    build: () =>
      build_feature_shell_page({
        id: "herramientas.herr-jornadas",
        owner: OWNER,
        title: "Jornadas",
        props: {
          basePath: "herr-jornadas",
          idKey: "id",
          nameKey: "name",
          view: {
            title: "Jornadas",
            subtitle: "Cada jornada de reparto queda aquí y se puede corregir o completar",
            pluralLabel: "jornadas",
            singularLabel: "jornada",
            emptyTitle: "Sin jornadas",
            emptyDescription: "Inicia la primera desde «Jornada de hoy»",
          },
          data: {
            list: `${API}/herr-jornadas`,
            record: `${API}/herr-jornadas/:id`,
            create: { method: "POST", action: `${API}/herr-jornadas` },
            update: { method: "PATCH", action: `${API}/herr-jornadas/:id` },
            delete: { method: "DELETE", action: `${API}/herr-jornadas/:id` },
          },
          table: {
            columns: [
              { key: "fecha", label: "Fecha", sortable: true, priority: 1 },
              { key: "vehiculo_nombre", label: "Vehículo", sortable: true, priority: 1 },
              { key: "estado", label: "Estado", sortable: true, priority: 1, cell: "badge" },
              { key: "km_recorridos", label: "Km", sortable: true, priority: 2 },
              { key: "entregas", label: "Entregas", sortable: true, priority: 2 },
              { key: "ganancia_neta", label: "Ganancia neta", sortable: true, priority: 3 },
            ],
            fillHeight: true,
            serverQuery: true,
          },
          form: {
            fields: [
              { name: "fecha", component: "input-date", label: "Fecha", required: true },
              {
                name: "estado",
                component: "input-menu",
                label: "Estado",
                options: [
                  { value: "abierta", label: "Abierta" },
                  { value: "cerrada", label: "Cerrada" },
                ],
              },
              { name: "vehiculo_id", component: "input-datalist", label: "Vehículo", optionsSource: "api://m/subject-vehiculos/vehicle?as=options&limite=1000" },
              { name: "vehiculo_nombre", component: "input-text", label: "Nombre del vehículo" },
              { name: "hora_inicio", component: "input-time", label: "Hora de inicio" },
              { name: "hora_fin", component: "input-time", label: "Hora de fin" },
              { name: "km_inicial", component: "input-number", label: "Kilometraje inicial", min: 0, step: 0.1 },
              { name: "km_final", component: "input-number", label: "Kilometraje final", min: 0, step: 0.1 },
              { name: "km_gps", component: "input-number", label: "Kilómetros por GPS", min: 0, step: 0.1 },
              { name: "solo_gps", component: "input-checkbox", label: "El velocímetro no sirve · medir km con GPS" },
              { name: "gasolina_inicial", component: "input-text", label: "Gasolina inicial", placeholder: "3/6 o litros" },
              { name: "gasolina_final", component: "input-text", label: "Gasolina final", placeholder: "1/6 o litros" },
              { name: "entregas", component: "input-number", label: "Entregas", min: 0, step: 1 },
              { name: "ingreso", component: "input-money", label: "Ingreso del día" },
              { name: "gasto_gasolina", component: "input-money", label: "Gasto en gasolina" },
              { name: "km_recorridos", component: "input-number", label: "Kilómetros recorridos", read_only: true },
              { name: "gasolina_usada", component: "input-number", label: "Gasolina gastada", read_only: true },
              { name: "rendimiento", component: "input-number", label: "Rendimiento (km/L)", read_only: true },
              { name: "ganancia_neta", component: "input-money", label: "Ganancia neta", read_only: true },
              { name: "por_entrega", component: "input-money", label: "Ganancia por entrega", read_only: true },
              { name: "fin_programado", component: "input-time", label: "Fin programado" },
              { name: "ruta_id", component: "input-datalist", label: "Ruta", optionsSource: `${API}/herr-rutas?as=options&limite=1000` },
              { name: "tramos", component: "input-json", label: "Tramos por vehículo", column_span: "full" },
              { name: "notas", component: "input-textarea", label: "Notas del día", column_span: "full" },
            ],
          },
        },
      }),
  },
  {
    id: "herramientas.herr-jornada",
    path: "herr-jornada",
    permission: "subject.herramientas.herr-jornadas.read",
    build: pagina_jornada,
  },
  {
    id: "herramientas.herr-liquidacion",
    path: "herr-liquidacion",
    permission: "subject.herramientas.herr-jornadas.read",
    build: pagina_liquidacion,
  },
];
