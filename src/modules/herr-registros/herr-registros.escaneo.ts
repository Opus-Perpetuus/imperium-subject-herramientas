import type { DomainRow, KirletDataClient } from "@opus-perpetuus/imperium-core-kit";
import { texto } from "../../lib/comun.ts";
import { spec_de_fila, type TablaSpec } from "../../lib/formulas/esquema.ts";
import { celda_coincide, columna_de_escaneo, registro_por_codigo } from "../../lib/formulas/escaneo.ts";
import { filas_recalculadas, ids_referencia, objeto, registros_de } from "../herr-tablas/herr-tablas.flow.ts";

/** Lo que la captura hace con un código leído en «Ver tabla». */
export type Escaneado = {
  /** El registro que ya tenía el código (con «abrir o anotar»): se abre para editarlo. */
  registro: DomainRow | null;
  /** Para uno nuevo: qué columna se llena y con qué (el texto leído o el id del registro enlazado). */
  prellenar: Record<string, string>;
  /** Qué pasó, para que quien escaneó lo sepa; vacío si todo salió como se esperaba. */
  aviso: string;
};

const md = (s: string) => s.replace(/[\\`*_[\]<>|#]/g, "\\$&");

/**
 * Resuelve el código leído según el «Al escanear» de la tabla. Columna de
 * texto o «Código»: el código tal cual. Enlace: el registro de la otra tabla
 * cuyo «Código» (o texto) es ese. Con `abrir_o_nuevo`, si en esta tabla ya hay
 * un registro con eso en la columna, se abre ese.
 */
export async function resolver_escaneo(data: KirletDataClient, spec: TablaSpec, leido: string): Promise<Escaneado> {
  const codigo = leido.trim();
  const nada: Escaneado = { registro: null, prellenar: {}, aviso: "" };
  if (!codigo || !spec.escaneo || spec.escaneo.accion === "reglas") return nada;
  const campo = columna_de_escaneo(spec);
  if (!campo) return { ...nada, aviso: "La columna que recibía lo escaneado ya no existe: revisa «Al escanear» en el diseño de la tabla." };
  let valor = codigo;
  if (campo.tipo === "referencia") {
    const destino = await data.findOne("herr_tablas", { id: campo.tabla_ref_id! });
    if (!destino || destino.is_active === false) {
      return { ...nada, aviso: `La tabla a la que apunta «${md(campo.etiqueta)}» ya no está.` };
    }
    const dspec = spec_de_fila(destino);
    const hallado = registro_por_codigo(dspec, await filas_recalculadas({ data }, dspec, await registros_de({ data }, dspec.id)), codigo);
    if (!hallado) {
      return { ...nada, aviso: `Ningún registro de «${md(dspec.name)}» tiene el código «${md(codigo)}»: elige uno a mano en «${md(campo.etiqueta)}».` };
    }
    valor = hallado.id;
  }
  if (spec.escaneo.accion === "abrir_o_nuevo") {
    const propios = await registros_de({ data }, spec.id);
    const existente = propios.find((r) => {
      const raw = texto(objeto(r.valores)[campo.clave]);
      return campo.tipo === "referencia" ? ids_referencia(raw).includes(valor) : celda_coincide(campo, raw, codigo);
    });
    if (existente) {
      return { registro: existente, prellenar: {}, aviso: `Ya había un registro con «${md(codigo)}»: se abrió para editarlo.` };
    }
  }
  return { registro: null, prellenar: { [campo.clave]: valor }, aviso: "" };
}
