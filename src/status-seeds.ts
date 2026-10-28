/**
 * Estatus de herramientas (jornadas + pedidos) para status-option-control.
 * Payload de `POST /api/status-option-control/seed-defaults` con
 * `{ entries: STATUS_OPTION_SEEDS }` (acción `seed_defaults`): solo agrega
 * faltantes. Contrato: kit `descriptors/option-lists.ts`.
 *
 * Valores alineados a `lib/reparto/servicios.ts` (abierta/cerrada/cobrado)
 * y a `lib/pedidos/estado.ts` (ciclo del pedido).
 */
import { ESTADOS, ETIQUETA_ESTADO, type Estado } from "./lib/pedidos/estado.ts";

export const STATUS_OPTION_SEED_PATH = "/api/status-option-control/seed-defaults";

export type StatusOption = { value: string; label: string; color: string; icon?: string };

export type StatusOptionSeed = {
  model_id: string;
  module_name?: string;
  status_fields?: string[];
  options: Array<StatusOption & { field_name: string }>;
};

function seed(model_id: string, field_name: string, options: StatusOption[]): StatusOptionSeed {
  return {
    model_id,
    module_name: model_id,
    status_fields: [field_name],
    options: options.map((o) => ({ ...o, field_name })),
  };
}

/** Escrito en `iniciar_jornada` / `terminar_jornada` (servicios.ts). */
export const JORNADA_ESTADO_OPTIONS: StatusOption[] = [
  { value: "abierta", label: "Abierta", color: "#ffc107", icon: "fas fa-folder-open" },
  { value: "cerrada", label: "Cerrada", color: "#198754", icon: "fas fa-check-circle" },
];

const PEDIDO_STATUS_META: Record<Estado, { color: string; icon: string }> = {
  capturado: { color: "#0d6efd", icon: "fas fa-clipboard" },
  surtido: { color: "#6610f2", icon: "fas fa-box" },
  en_ruta: { color: "#fd7e14", icon: "fas fa-truck" },
  entregado: { color: "#198754", icon: "fas fa-check" },
  cobrado: { color: "#20c997", icon: "fas fa-coins" },
};

/** Ciclo del pedido; `cobrado` lo escribe `liquidar` en servicios.ts. */
export const PEDIDO_ESTADO_OPTIONS: StatusOption[] = ESTADOS.map((value) => ({
  value,
  label: ETIQUETA_ESTADO[value],
  ...PEDIDO_STATUS_META[value],
}));

export const STATUS_OPTION_SEEDS: StatusOptionSeed[] = [
  seed("subject-herramientas/herr-jornadas", "estado", JORNADA_ESTADO_OPTIONS),
  seed("subject-herramientas/herr-pedidos", "estado", PEDIDO_ESTADO_OPTIONS),
];

export type PushStatusSeedsOptions = {
  env?: Record<string, string | undefined>;
  fetchImpl?: typeof fetch;
  timeout_ms?: number;
};

export type PushStatusSeedsResult =
  | { pushed: true; status: number; data: unknown }
  | { pushed: false; reason: string; status?: number };

/**
 * Manda `STATUS_OPTION_SEEDS` al núcleo (`seed_defaults`, idempotente).
 * Nunca lanza: el seed no debe caerse si el núcleo aún no expone la ruta.
 */
export async function push_status_seeds(opts: PushStatusSeedsOptions = {}): Promise<PushStatusSeedsResult> {
  const env = opts.env ?? process.env;
  const base = (env.CORE_DATA_URL?.trim() || env.NOX_DATA_URL?.trim() || "")
    .replace(/\/api\/kirlets\/data\/.*$/, "")
    .replace(/\/+$/, "");
  const caller = env.SUBJECT_TECHNICAL_ID?.trim() || env.KIRLET_TECHNICAL_ID?.trim() || "";
  const secret = env.CORE_SUBJECT_GATEWAY_SECRET?.trim() || env.NOX_KIRLET_GATEWAY_SECRET?.trim() || "";
  if (!base || !caller || !secret) return { pushed: false, reason: "core_not_configured" };
  try {
    const res = await (opts.fetchImpl ?? fetch)(`${base}${STATUS_OPTION_SEED_PATH}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-core-subject-gateway-secret": secret,
        "x-imperium-subject": caller,
      },
      body: JSON.stringify({ entries: STATUS_OPTION_SEEDS }),
      signal: AbortSignal.timeout(opts.timeout_ms ?? 12_000),
    });
    let data: unknown = null;
    try {
      data = await res.json();
    } catch {
      /* sin JSON */
    }
    if (!res.ok) return { pushed: false, reason: "core_refused", status: res.status };
    return { pushed: true, status: res.status, data };
  } catch (err) {
    return { pushed: false, reason: err instanceof Error ? err.message : String(err) };
  }
}
