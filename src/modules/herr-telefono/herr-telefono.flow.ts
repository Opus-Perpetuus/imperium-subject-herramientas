import { define_routes, new_id, now_iso, type DomainRow, type KirletCtx } from "@opus-perpetuus/imperium-core-kit";
import { booleano, campo_busqueda, filas_de, texto } from "../../lib/comun.ts";
import { nombre_comparable, telefono_comparable } from "../../lib/telefono/emparejador.ts";
import { aplicar_conduciendo } from "../../lib/telefono/conduciendo.ts";
import {
  ORIGENES,
  REGLAS_POR_DEFECTO,
  decidir,
  nombre_a_anunciar,
  reglas_desde,
  texto_anuncio,
  type Accion,
  type Llamante,
  type Origen,
} from "../../lib/telefono/decision.ts";

/**
 * Contrato con la app Android: ella filtra, contesta y locuta; aquí viven las
 * reglas, la decisión y el registro. Sin perfil activo el contestador está
 * apagado: todo suena como siempre.
 */

const DECISION_DE: Record<Accion, string> = {
  contestar: "contestada",
  rechazar: "rechazada",
  silenciar: "silenciada",
  permitir: "permitida",
};

/** Perfil vigente con sus contactos repartidos por modo, o `null` si no hay. */
export async function perfil_activo(ctx: Pick<KirletCtx, "data">) {
  const perfil = await ctx.data.findOne("herr_telefono", { es_activa: true, is_active: true });
  if (!perfil) return null;
  const contactos = await filas_de(ctx, "herr_telefono_contactos", { regla_id: String(perfil.id), is_active: true });
  return {
    perfil,
    seleccionados: contactos.filter((c) => c.modo === "seleccionado"),
    rechazados: contactos.filter((c) => c.modo === "rechazado"),
  };
}

/**
 * El contacto del perfil que llama: por la clave de la agenda del teléfono, si
 * no por la que el alta deriva del nombre (contactos dados de alta sin clave) y
 * si no por el teléfono.
 */
function contacto_del_perfil(
  contactos: DomainRow[],
  entrante: { clave: string; nombre: string; numero: string },
): DomainRow | undefined {
  const nombre = nombre_comparable(entrante.nombre);
  const numero = telefono_comparable(entrante.numero);
  return (
    (entrante.clave ? contactos.find((c) => texto(c.clave) === entrante.clave) : undefined) ??
    (nombre ? contactos.find((c) => nombre_comparable(c.clave) === nombre) : undefined) ??
    (numero ? contactos.find((c) => telefono_comparable(c.telefono) === numero) : undefined)
  );
}

export function nombre_llamada(decision: string, llamante: Llamante): string {
  return `${decision} · ${nombre_a_anunciar(llamante)}`;
}

export const herr_telefono_flow = define_routes({
  "GET /herr-telefono/activa": async (ctx) => ({
    data: (await perfil_activo(ctx)) ?? { perfil: null, seleccionados: [], rechazados: [] },
  }),

  "POST /herr-telefono/decidir": async (ctx) => {
    const body = await ctx.body<{
      numero?: string;
      contacto_conocido?: boolean;
      contacto_clave?: string;
      contacto_nombre?: string;
      conduciendo?: boolean;
      origen?: string;
    }>();
    const activo = await perfil_activo(ctx);
    const conduciendo = booleano(body.conduciendo);
    const reglas = aplicar_conduciendo(activo ? reglas_desde(activo.perfil) : REGLAS_POR_DEFECTO, conduciendo);
    const origen: Origen = ORIGENES.includes(texto(body.origen) as Origen) ? (texto(body.origen) as Origen) : "telefono";
    const entrante = { clave: texto(body.contacto_clave), nombre: texto(body.contacto_nombre), numero: texto(body.numero) };
    const contacto = contacto_del_perfil([...(activo?.seleccionados ?? []), ...(activo?.rechazados ?? [])], entrante);
    const llamante: Llamante = {
      conocido: contacto ? true : booleano(body.contacto_conocido),
      clave: (contacto ? texto(contacto.clave) : entrante.clave) || undefined,
      nombre: entrante.nombre || undefined,
      numero: entrante.numero || undefined,
    };
    const claves = (filas: DomainRow[]) => new Set(filas.map((c) => texto(c.clave)));
    const decision = decidir(
      reglas,
      llamante,
      claves(activo?.seleccionados ?? []),
      claves(activo?.rechazados ?? []),
      origen,
    );

    const ts = now_iso();
    const name = nombre_llamada(DECISION_DE[decision.accion], llamante);
    const llamada = await ctx.data.insert("herr_telefono_llamadas", {
      id: new_id("herr-llam"),
      name,
      description: "",
      is_active: true,
      created_by: ctx.actor,
      search_field: campo_busqueda(name, llamante.numero, llamante.nombre, decision.motivo),
      numero: llamante.numero ?? null,
      contacto_nombre: llamante.nombre ?? null,
      decision: DECISION_DE[decision.accion],
      motivo: decision.motivo,
      fecha_hora: ts,
      origen,
      conduciendo,
      created_at: ts,
      updated_at: ts,
    });

    return {
      data: {
        accion: decision.accion,
        anunciar: decision.anunciar,
        texto_anuncio: decision.anunciar ? texto_anuncio(reglas, llamante, origen) : "",
        retardo_s: reglas.retardo_s,
        anuncio_repeticiones: reglas.anuncio_repeticiones,
        silenciar_timbre: decision.silenciar_timbre,
        motivo: decision.motivo,
        llamada_id: llamada.id,
      },
    };
  },
});
