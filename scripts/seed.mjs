/**
 * Genera data/radar.json en tiempo de build.
 *
 * Sintetiza una flota de 25.000 vehículos con la misma forma que la base del
 * cliente, calcula los agregados del radar y guarda sólo el resultado (unos
 * pocos KB) más una muestra para la campaña. La flota completa no hace falta en
 * runtime, y así el bundle serverless queda chico.
 *
 *     node scripts/seed.mjs
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const HOY = new Date("2026-08-20T00:00:00Z");
const TOTAL = 25_000;

/** PRNG con semilla: la misma base en cada build. */
let semilla = 20260820;
const rnd = () => {
  semilla = (semilla * 1664525 + 1013904223) % 4294967296;
  return semilla / 4294967296;
};
const entre = (a, b) => Math.floor(rnd() * (b - a + 1)) + a;
const elegir = (xs) => xs[Math.floor(rnd() * xs.length)];
/** Aproximación normal por suma de uniformes (Irwin–Hall). */
const gauss = (mu, sigma) => {
  let s = 0;
  for (let i = 0; i < 6; i++) s += rnd();
  return mu + (s - 3) * sigma;
};
/** Triangular: pico cerca de `moda`. */
const triangular = (lo, hi, moda) => {
  const u = rnd();
  const c = (moda - lo) / (hi - lo);
  return u < c
    ? lo + Math.sqrt(u * (hi - lo) * (moda - lo))
    : hi - Math.sqrt((1 - u) * (hi - lo) * (hi - moda));
};

const MODELOS = [
  ["Volkswagen", "Gol Trend", 2008, 2019], ["Volkswagen", "Amarok", 2010, 2026],
  ["Volkswagen", "Suran", 2006, 2019], ["Volkswagen", "T-Cross", 2019, 2026],
  ["Chevrolet", "Corsa Classic", 2000, 2016], ["Chevrolet", "Onix", 2016, 2026],
  ["Chevrolet", "S10", 2012, 2026], ["Chevrolet", "Tracker", 2013, 2026],
  ["Fiat", "Cronos", 2018, 2026], ["Fiat", "Palio", 2000, 2017],
  ["Fiat", "Toro", 2016, 2026], ["Fiat", "Strada", 2000, 2026],
  ["Ford", "Fiesta", 2002, 2019], ["Ford", "EcoSport", 2004, 2022],
  ["Ford", "Ranger", 2005, 2026], ["Ford", "Ka", 2011, 2021],
  ["Toyota", "Hilux", 2005, 2026], ["Toyota", "Corolla", 2004, 2026],
  ["Toyota", "Etios", 2013, 2024], ["Toyota", "SW4", 2006, 2026],
  ["Renault", "Sandero", 2008, 2026], ["Renault", "Duster", 2011, 2026],
  ["Renault", "Kangoo", 2000, 2026], ["Peugeot", "208", 2012, 2026],
  ["Peugeot", "Partner", 2003, 2026], ["Citroen", "C3", 2003, 2026],
  ["Honda", "Civic", 2006, 2026], ["Nissan", "Frontier", 2010, 2026],
  ["Nissan", "Kicks", 2016, 2026],
];

const NOMBRES = ["Martín", "Sofía", "Diego", "Valentina", "Nicolás", "Camila",
  "Lucas", "Julieta", "Matías", "Agustina", "Federico", "Micaela", "Sebastián",
  "Rocío", "Gonzalo", "Florencia", "Ezequiel", "Carla", "Ramiro", "Luciana"];
const APELLIDOS = ["Gómez", "Rodríguez", "Fernández", "López", "Martínez",
  "Pérez", "García", "Sánchez", "Romero", "Sosa", "Torres", "Álvarez", "Ruiz",
  "Benítez", "Acosta", "Medina", "Herrera", "Aguirre", "Pereyra", "Giménez"];
const L = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

/** Formato viejo AAA123 hasta 2015, Mercosur AB123CD desde 2016. */
const patente = (anio) =>
  anio < 2016
    ? `${elegir(L)}${elegir(L)}${elegir(L)}${entre(100, 999)}`
    : `${elegir(L)}${elegir(L)}${entre(100, 999)}${elegir(L)}${elegir(L)}`;

const iso = (d) => d.toISOString().slice(0, 10);
const sumarDias = (d, n) => new Date(d.getTime() + n * 86_400_000);

const flota = [];
for (let i = 0; i < TOTAL; i++) {
  const [marca, modelo, desde, hasta] = elegir(MODELOS);
  const anio = entre(desde, Math.min(hasta, 2026));
  const edad = Math.max(2026 - anio, 0);
  const km = Math.max(Math.min(Math.round(gauss(edad * 14_000 + 12_000, 22_000)), 480_000), 1_500);

  // VTV: obligatoria desde los 3 años de antigüedad, vence anualmente.
  const vtv = edad >= 3 ? iso(sumarDias(HOY, entre(-420, 400))) : null;

  // Último service: pico en los primeros meses y cola larga de abandonados.
  let ultimoService = null;
  if (rnd() < 0.88) ultimoService = iso(sumarDias(HOY, -Math.round(triangular(10, 1000, 90))));

  flota.push({
    cliente: `${elegir(NOMBRES)} ${elegir(APELLIDOS)}`,
    telefono: `549${elegir(["11", "221", "261", "341", "351", "381"])}${entre(1_000_000, 9_999_999)}`,
    marca, modelo, anio, patente: patente(anio), km,
    vtvVence: vtv, ultimoService,
    verificacionPendiente: rnd() < 0.06,
  });
}

const hoy = iso(HOY);
const limite60 = iso(sumarDias(HOY, 60));
const hace12m = iso(sumarDias(HOY, -365));

const vtvVencidas = flota.filter((v) => v.vtvVence && v.vtvVence < hoy).length;
const vtv60 = flota.filter((v) => v.vtvVence && v.vtvVence >= hoy && v.vtvVence <= limite60);
const serviceVencido = flota.filter((v) => !v.ultimoService || v.ultimoService < hace12m).length;
const verificacion = flota.filter((v) => v.verificacionPendiente).length;

const TICKETS = { vtv: 108_000, service: 385_000, verificacion: 55_000 };
// Conversión por segmento, no un número único: un recordatorio de VTV convierte
// muy distinto a un "volvé al taller" genérico, porque la VTV es obligatoria y
// tiene fecha. Los tres valores se muestran en pantalla.
const CONVERSION = { vtv: 0.22, service: 0.04, verificacion: 0.15 };

const miles = (n) => n.toLocaleString("es-AR");

const bloque = (clave, titulo, cantidad, detalle, porque) => ({
  clave, titulo, cantidad,
  ticketPromedio: TICKETS[clave],
  conversion: CONVERSION[clave],
  recuperable: Math.round(cantidad * TICKETS[clave] * CONVERSION[clave]),
  detalle, porque,
});

const segmentos = [
  bloque("vtv", "VTV venciendo en los próximos 60 días", vtv60.length,
    `${miles(vtvVencidas)} ya vencidas, además de estas`,
    "Es obligatoria y tiene fecha: la hacen sí o sí en algún lado"),
  bloque("service", "Sin service hace más de 12 meses", serviceVencido,
    `${miles(flota.filter((v) => v.ultimoService && v.km > 10_000).length)} con más de 10.000 km recorridos`,
    "Recordatorio sin urgencia legal: la conversión es baja por definición"),
  bloque("verificacion", "Verificación policial pendiente", verificacion,
    "Trámites iniciados sin turno asignado",
    "Trámite ya empezado: sólo falta que saquen el turno"),
];

// Tarifas Meta para Argentina (agosto 2026), USD por conversación.
const TARIFA_UTILITY = 0.012;
const TARIFA_MARKETING = 0.0618;

const radar = {
  generado: hoy,
  totalRegistros: TOTAL,
  segmentos,
  recuperableTotal: segmentos.reduce((a, s) => a + s.recuperable, 0),
  campana: {
    contactos: vtv60.length,
    tarifaUtility: TARIFA_UTILITY,
    tarifaMarketing: TARIFA_MARKETING,
    costoUtility: +(vtv60.length * TARIFA_UTILITY).toFixed(2),
    costoMarketing: +(vtv60.length * TARIFA_MARKETING).toFixed(2),
  },
  // Muestra para la campaña: casos reales de la base, ordenados por vencimiento.
  muestraVtv: vtv60
    .sort((a, b) => a.vtvVence.localeCompare(b.vtvVence))
    .slice(0, 25),
};

mkdirSync(join(RAIZ, "data"), { recursive: true });
writeFileSync(join(RAIZ, "data", "radar.json"), JSON.stringify(radar, null, 2), "utf8");

console.log(`radar.json generado · ${miles(TOTAL)} vehículos sintetizados`);
for (const s of segmentos) {
  console.log(`  ${s.titulo}: ${miles(s.cantidad)} → $ ${miles(s.recuperable)}`);
}
console.log(`  recuperable total: $ ${miles(radar.recuperableTotal)}`);
console.log(`  campaña ${miles(radar.campana.contactos)} contactos:`
  + ` USD ${radar.campana.costoUtility} utility vs USD ${radar.campana.costoMarketing} marketing`);
