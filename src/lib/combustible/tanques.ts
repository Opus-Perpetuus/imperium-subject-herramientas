/**
 * Catálogo de tanques por modelo. Semilla verificada: prellena la capacidad,
 * nunca bloquea. `confianza`: official (manual), dealer (ficha de distribuidor),
 * aggregator (ficha de terceros), unknown (sin litros verificados).
 */
export type ModeloTanque = {
  id: string;
  marca: string;
  modelo: string;
  anios: string;
  tanque_litros: number | null;
  reserva_litros: number | null;
  fuente: string;
  confianza: "official" | "dealer" | "aggregator" | "unknown";
};

export const TANQUES: ModeloTanque[] = [
  { id: "italika-ft150", marca: "Italika", modelo: "FT150", anios: "2008–2019", tanque_litros: 12, reserva_litros: 1.4, fuente: "Manual de usuario oficial Italika FT150, Datos Técnicos p.12", confianza: "official" },
  { id: "italika-ft150-g", marca: "Italika", modelo: "FT150 G", anios: "", tanque_litros: 14, reserva_litros: null, fuente: "Ficha Técnica Italika FT 150 G — Galgo México", confianza: "dealer" },
  { id: "italika-ft150-hd", marca: "Italika", modelo: "FT150 Heavy Duty", anios: "", tanque_litros: 14, reserva_litros: null, fuente: "Ficha Técnica Italika FT 150 Heavy Duty — Galgo México", confianza: "dealer" },
  { id: "italika-ft150-ts", marca: "Italika", modelo: "FT150 TS", anios: "", tanque_litros: 13.3, reserva_litros: null, fuente: "motofichas.com.mx — Italika FT150 TS", confianza: "aggregator" },
  { id: "italika-ft150-gts", marca: "Italika", modelo: "FT150 GTS", anios: "", tanque_litros: 19, reserva_litros: null, fuente: "motofichas.com.mx — Italika FT150 GTS", confianza: "aggregator" },
  { id: "italika-dt150", marca: "Italika", modelo: "DT150", anios: "", tanque_litros: 12, reserva_litros: null, fuente: "motofichas.com.mx — Italika DT150", confianza: "aggregator" },
  { id: "italika-ws150", marca: "Italika", modelo: "WS150", anios: "", tanque_litros: 14, reserva_litros: null, fuente: "motofichas.com.mx — Italika WS150", confianza: "aggregator" },
  { id: "italika-rc150", marca: "Italika", modelo: "RC150", anios: "", tanque_litros: 12, reserva_litros: null, fuente: "motofichas.com.mx — Italika RC150", confianza: "aggregator" },
  { id: "italika-vitalia-125", marca: "Italika", modelo: "Vitalia 125", anios: "", tanque_litros: 5.5, reserva_litros: null, fuente: "motofichas.com.mx — Italika Vitalia 125", confianza: "aggregator" },
  { id: "italika-d125", marca: "Italika", modelo: "D125 Delivery", anios: "", tanque_litros: null, reserva_litros: null, fuente: "Sin ficha verificada con litros; solo id de catálogo", confianza: "unknown" },
  { id: "bajaj-boxer-ct100", marca: "Bajaj", modelo: "Boxer CT100", anios: "", tanque_litros: null, reserva_litros: null, fuente: "Ficha Galgo sin tabla numérica verificable", confianza: "unknown" },
  { id: "bajaj-pulsar-ns200", marca: "Bajaj", modelo: "Pulsar NS200", anios: "", tanque_litros: 12, reserva_litros: null, fuente: "motofichas.com.mx — Pulsar NS200 (12 L; Wikipedia lista 13 L)", confianza: "aggregator" },
  { id: "bajaj-platina-100", marca: "Bajaj", modelo: "Platina 100", anios: "", tanque_litros: 11, reserva_litros: null, fuente: "motofichas.com.mx — Bajaj Platina 100", confianza: "aggregator" },
  { id: "honda-xr150l", marca: "Honda", modelo: "XR150L", anios: "", tanque_litros: 12, reserva_litros: null, fuente: "Fichas de distribuidor / motofichas XR150L", confianza: "dealer" },
  { id: "honda-cb125f", marca: "Honda", modelo: "CB125F", anios: "", tanque_litros: 11, reserva_litros: null, fuente: "motofichas.com.mx — Honda CB125F", confianza: "aggregator" },
  { id: "honda-cargo", marca: "Honda", modelo: "Cargo", anios: "", tanque_litros: null, reserva_litros: null, fuente: "Sin capacidad unificada verificada entre variantes Cargo", confianza: "unknown" },
  { id: "yamaha-ybr125", marca: "Yamaha", modelo: "YBR125", anios: "", tanque_litros: 13, reserva_litros: null, fuente: "motofichas.com.mx — Yamaha YBR125", confianza: "aggregator" },
  { id: "yamaha-crypton", marca: "Yamaha", modelo: "Crypton", anios: "", tanque_litros: 4.1, reserva_litros: null, fuente: "motofichas.com.mx — Yamaha Crypton", confianza: "aggregator" },
  { id: "yamaha-xtz125", marca: "Yamaha", modelo: "XTZ125", anios: "", tanque_litros: 11, reserva_litros: null, fuente: "motofichas.com.mx — Yamaha XTZ125", confianza: "aggregator" },
  { id: "suzuki-gn125", marca: "Suzuki", modelo: "GN125", anios: "", tanque_litros: 10, reserva_litros: null, fuente: "motofichas.com.mx — Suzuki GN125", confianza: "aggregator" },
  { id: "suzuki-gd110", marca: "Suzuki", modelo: "GD110", anios: "", tanque_litros: null, reserva_litros: null, fuente: "Sin ficha con litros verificada", confianza: "unknown" },
  { id: "vento-rocketman-250", marca: "Vento", modelo: "Rocketman 250", anios: "", tanque_litros: 14, reserva_litros: null, fuente: "motofichas.com.mx — Vento Rocketman", confianza: "aggregator" },
  { id: "carabela-sm150", marca: "Carabela", modelo: "SM150", anios: "", tanque_litros: null, reserva_litros: null, fuente: "Sin ficha con litros verificada", confianza: "unknown" },
  { id: "keeway-superlight-150", marca: "Keeway", modelo: "Superlight 150", anios: "", tanque_litros: 15, reserva_litros: null, fuente: "motofichas.com.mx — Keeway Superlight 150", confianza: "aggregator" },
  { id: "hero-eco-deluxe", marca: "Hero", modelo: "Eco Deluxe", anios: "", tanque_litros: null, reserva_litros: null, fuente: "Sin ficha con litros verificada", confianza: "unknown" },
  { id: "tvs-sport", marca: "TVS", modelo: "Sport", anios: "", tanque_litros: 10, reserva_litros: null, fuente: "motofichas.com.mx — TVS Sport", confianza: "aggregator" },
];

/** «Italika FT150 (2008–2019)». */
export function nombre_tanque(m: ModeloTanque): string {
  return `${m.marca} ${m.modelo}${m.anios ? ` (${m.anios})` : ""}`;
}

export const tanque_por_id = (id: string) => TANQUES.find((m) => m.id === id) ?? null;
