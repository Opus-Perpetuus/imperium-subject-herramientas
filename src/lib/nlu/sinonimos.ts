import { contiene_frase, normalizar_frase } from "./normalizador.ts";

/**
 * Frases canónicas y variantes coloquiales por intención. Se comparan ya
 * normalizadas (números en palabras expandidos: «anota un pedido» casa con
 * «anota 1 pedido»). Al resolver gana la frase más larga que aparezca.
 */
export const SINONIMOS: Record<string, string[]> = {
  llamada_contestar: [
    "contesta", "contestar", "contesta la llamada", "responde", "responder",
    "descolgar", "descolga", "atiende", "atender la llamada",
  ],
  llamada_rechazar: [
    "no contestar", "no contestes", "rechaza", "rechazar", "cuelga", "colgar",
    "ignora la llamada", "rechaza la llamada",
  ],
  llamar: [
    "llama", "llamar", "marca", "marcar", "marcame", "marcale",
    "comunicame con", "comunicame", "hablale a", "hablale",
    "hazle una llamada a", "ponme con", "conectame con",
  ],
  abrir_app: [
    "abre", "abrir", "abre la app", "abre aplicacion", "lanza", "ejecuta",
    "abre la aplicacion", "abrir app",
  ],
  jornada_iniciar: [
    "iniciar jornada", "inicia la jornada", "arrancar jornada", "empezar jornada",
    "iniciar dia", "empieza la jornada", "arranca el dia", "comienzo jornada",
    "inicio jornada", "empiezo la jornada", "comenzar jornada",
  ],
  jornada_terminar: [
    "terminar jornada", "termina la jornada", "cerrar jornada", "finalizar jornada",
    "acabar jornada", "fin de jornada", "cierra la jornada", "termino la jornada",
    "ya termine la jornada",
  ],
  jornada_pausar: ["pausar jornada", "pausa la jornada", "pausar", "pon en pausa"],
  jornada_reanudar: [
    "reanudar jornada", "reanuda la jornada", "continuar jornada", "sigue la jornada",
  ],
  jornada_cambiar_vehiculo: [
    "cambiar de moto", "cambiar moto", "cambia de moto", "cambiar la moto",
    "cambiar de vehiculo", "cambio de moto",
  ],
  jornada_elegir_vehiculo: ["elegir moto", "escoger moto", "seleccionar moto", "elige moto"],
  pedido_registrar: [
    "registrar pedido", "anotar pedido", "nuevo pedido", "anade pedido",
    "agregar pedido", "apunta pedido", "toma pedido", "anota un pedido",
    "anotar un pedido", "registra un pedido", "apunta un pedido", "un pedido de",
    "pedido de",
  ],
  gasto_registrar: [
    "registrar gasto", "anotar gasto", "nuevo gasto", "anade gasto",
    "apunta gasto", "gaste", "hubo un gasto", "anota un gasto", "un gasto de",
    "gasto de",
  ],
  entrega_registrar: [
    "entregado", "entregue", "ya entregue", "listo el pedido", "pedido entregado",
    "ya lo entregue", "ya entregue el pedido",
  ],
  caja_retiro: [
    "saque cambio", "tome cambio", "cambio de caja", "caja me dio cambio",
    "me dieron cambio", "saque de cambio", "tome de cambio", "retiro de cambio",
  ],
  caja_aporte: [
    "puse dinero mio", "puse de mi dinero", "pague de mi bolsa", "puse mi dinero",
    "dinero mio", "puse de mi bolsa", "de mi bolsa",
  ],
  pendiente_registrar: [
    "anotar pendiente", "registrar pendiente", "nuevo pendiente",
    "deja pendiente", "marca pendiente", "anota un pendiente",
  ],
  pendiente_surtir: [
    "surtir pendiente", "surtir", "entrega pendiente", "completar pendiente",
    "marcar entregado", "surtir el pendiente", "surti el pendiente",
  ],
  recarga_registrar: [
    "registrar carga de gasolina", "cargar gasolina", "recarga gasolina",
    "anotar gasolina", "gasolina", "carga de combustible", "llene el tanque",
    "cargue gasolina", "eche gasolina",
  ],
  cobro_registrar: [
    "entregar el cobro", "registrar cobro", "anotar cobro", "entrega cobro",
    "liquidar cobro", "cobro de caja", "entregue el cobro", "liquidar",
  ],
  consulta_hoy: [
    "cuanto llevo hoy", "cuanto he ganado hoy", "resumen de hoy",
    "como voy hoy", "balance de hoy", "cuanto llevo",
  ],
  consulta_pedidos: [
    "cuantos pedidos", "cuantos pedidos llevo", "numero de pedidos", "pedidos de hoy",
  ],
  consulta_gastos: ["cuanto he gastado", "cuantos gastos", "gastos de hoy", "total de gastos"],
  buscar: [
    "busca", "buscar", "encuentra", "localiza", "busca la calle",
    "busca el domicilio", "busca domicilio",
  ],
  cerrar_dia: [
    "cerrar el dia", "cerrar dia", "cierre de dia", "archivo del dia",
    "cerrar el dia de trabajo",
  ],
};

/**
 * Intención cuya frase sinónima más larga aparece en el texto, o null.
 * `activas` restringe las intenciones consideradas (vacío = todas).
 */
export function resolver_sinonimo(
  texto: string,
  activas: string[] = [],
): { intencion: string; frase: string } | null {
  const n = normalizar_frase(texto);
  if (!n) return null;
  let mejor: { intencion: string; frase: string } | null = null;
  for (const [intencion, frases] of Object.entries(SINONIMOS)) {
    if (activas.length && !activas.includes(intencion)) continue;
    for (const cruda of frases) {
      const frase = normalizar_frase(cruda);
      if (!frase || !contiene_frase(n, frase)) continue;
      if (!mejor || frase.length > mejor.frase.length) mejor = { intencion, frase };
    }
  }
  return mejor;
}

export function frases_de(intencion: string): string[] {
  return (SINONIMOS[intencion] ?? []).map(normalizar_frase);
}
