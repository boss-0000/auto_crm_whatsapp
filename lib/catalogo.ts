/**
 * Catálogo y lista de precios.
 *
 * Son datos, no lógica: se reemplazan por la lista real del cliente sin tocar
 * una línea del motor de presupuestos. Valores de referencia del mercado
 * argentino, agosto 2026.
 */

export type Segmento = "chico" | "mediano" | "suv" | "pickup" | "utilitario";
export type Sector = "VENTAS" | "VERIFICACIONES" | "SERVICIO_TECNICO" | "OTRO";

export interface ModeloVehiculo {
  marca: string;
  modelo: string;
  desde: number;
  hasta: number;
  segmento: Segmento;
}

export interface Servicio {
  codigo: string;
  nombre: string;
  sector: Sector;
  horas: number;
  precioFijo: number | null;
  descripcion: string;
}

export interface Repuesto {
  sku: string;
  nombre: string;
  precioBase: number;
}

/** Parámetros del taller. En producción salen de la tabla de configuración. */
export const PARAMETROS = {
  valorHoraManoObra: 32_000,
  iva: 0.21,
  moneda: "ARS",
  vigenciaPresupuestoDias: 7,
  fechaListaPrecios: "2026-08-01",
} as const;

/** Factores por segmento: mano de obra y repuestos escalan distinto. */
export const FACTORES: Record<Segmento, { manoObra: number; repuestos: number }> = {
  chico: { manoObra: 1.0, repuestos: 1.0 },
  mediano: { manoObra: 1.15, repuestos: 1.15 },
  suv: { manoObra: 1.35, repuestos: 1.3 },
  pickup: { manoObra: 1.5, repuestos: 1.45 },
  utilitario: { manoObra: 1.25, repuestos: 1.2 },
};

export const MODELOS: ModeloVehiculo[] = [
  { marca: "Volkswagen", modelo: "Gol Trend", desde: 2008, hasta: 2019, segmento: "chico" },
  { marca: "Volkswagen", modelo: "Gol", desde: 2000, hasta: 2013, segmento: "chico" },
  { marca: "Volkswagen", modelo: "Suran", desde: 2006, hasta: 2019, segmento: "mediano" },
  { marca: "Volkswagen", modelo: "Voyage", desde: 2009, hasta: 2022, segmento: "mediano" },
  { marca: "Volkswagen", modelo: "Amarok", desde: 2010, hasta: 2026, segmento: "pickup" },
  { marca: "Volkswagen", modelo: "Vento", desde: 2007, hasta: 2021, segmento: "mediano" },
  { marca: "Volkswagen", modelo: "Polo", desde: 2018, hasta: 2026, segmento: "chico" },
  { marca: "Volkswagen", modelo: "T-Cross", desde: 2019, hasta: 2026, segmento: "suv" },
  { marca: "Chevrolet", modelo: "Corsa Classic", desde: 2000, hasta: 2016, segmento: "chico" },
  { marca: "Chevrolet", modelo: "Onix", desde: 2016, hasta: 2026, segmento: "chico" },
  { marca: "Chevrolet", modelo: "Prisma", desde: 2013, hasta: 2019, segmento: "mediano" },
  { marca: "Chevrolet", modelo: "Cruze", desde: 2011, hasta: 2026, segmento: "mediano" },
  { marca: "Chevrolet", modelo: "S10", desde: 2012, hasta: 2026, segmento: "pickup" },
  { marca: "Chevrolet", modelo: "Tracker", desde: 2013, hasta: 2026, segmento: "suv" },
  { marca: "Fiat", modelo: "Palio", desde: 2000, hasta: 2017, segmento: "chico" },
  { marca: "Fiat", modelo: "Cronos", desde: 2018, hasta: 2026, segmento: "mediano" },
  { marca: "Fiat", modelo: "Argo", desde: 2017, hasta: 2026, segmento: "chico" },
  { marca: "Fiat", modelo: "Toro", desde: 2016, hasta: 2026, segmento: "pickup" },
  { marca: "Fiat", modelo: "Strada", desde: 2000, hasta: 2026, segmento: "pickup" },
  { marca: "Ford", modelo: "Fiesta", desde: 2002, hasta: 2019, segmento: "chico" },
  { marca: "Ford", modelo: "Focus", desde: 2004, hasta: 2019, segmento: "mediano" },
  { marca: "Ford", modelo: "Ka", desde: 2011, hasta: 2021, segmento: "chico" },
  { marca: "Ford", modelo: "EcoSport", desde: 2004, hasta: 2022, segmento: "suv" },
  { marca: "Ford", modelo: "Ranger", desde: 2005, hasta: 2026, segmento: "pickup" },
  { marca: "Toyota", modelo: "Etios", desde: 2013, hasta: 2024, segmento: "chico" },
  { marca: "Toyota", modelo: "Corolla", desde: 2004, hasta: 2026, segmento: "mediano" },
  { marca: "Toyota", modelo: "Hilux", desde: 2005, hasta: 2026, segmento: "pickup" },
  { marca: "Toyota", modelo: "SW4", desde: 2006, hasta: 2026, segmento: "suv" },
  { marca: "Toyota", modelo: "Yaris", desde: 2018, hasta: 2026, segmento: "chico" },
  { marca: "Renault", modelo: "Clio", desde: 2000, hasta: 2016, segmento: "chico" },
  { marca: "Renault", modelo: "Sandero", desde: 2008, hasta: 2026, segmento: "chico" },
  { marca: "Renault", modelo: "Logan", desde: 2007, hasta: 2026, segmento: "mediano" },
  { marca: "Renault", modelo: "Duster", desde: 2011, hasta: 2026, segmento: "suv" },
  { marca: "Renault", modelo: "Kangoo", desde: 2000, hasta: 2026, segmento: "utilitario" },
  { marca: "Peugeot", modelo: "206", desde: 2000, hasta: 2012, segmento: "chico" },
  { marca: "Peugeot", modelo: "208", desde: 2012, hasta: 2026, segmento: "chico" },
  { marca: "Peugeot", modelo: "308", desde: 2012, hasta: 2022, segmento: "mediano" },
  { marca: "Peugeot", modelo: "Partner", desde: 2003, hasta: 2026, segmento: "utilitario" },
  { marca: "Citroen", modelo: "C3", desde: 2003, hasta: 2026, segmento: "chico" },
  { marca: "Citroen", modelo: "Berlingo", desde: 2003, hasta: 2026, segmento: "utilitario" },
  { marca: "Honda", modelo: "Civic", desde: 2006, hasta: 2026, segmento: "mediano" },
  { marca: "Honda", modelo: "Fit", desde: 2009, hasta: 2020, segmento: "chico" },
  { marca: "Nissan", modelo: "Frontier", desde: 2010, hasta: 2026, segmento: "pickup" },
  { marca: "Nissan", modelo: "Kicks", desde: 2016, hasta: 2026, segmento: "suv" },
  { marca: "Nissan", modelo: "March", desde: 2011, hasta: 2022, segmento: "chico" },
];

export const REPUESTOS: Record<string, Repuesto> = Object.fromEntries(
  (
    [
      ["ACE-5W30", "Aceite sintético 5W30 (litro)", 22_000],
      ["FIL-ACE", "Filtro de aceite", 28_000],
      ["FIL-AIR", "Filtro de aire", 32_000],
      ["FIL-HAB", "Filtro de habitáculo", 35_000],
      ["FIL-COM", "Filtro de combustible", 45_000],
      ["BUJIA", "Bujía de encendido", 18_000],
      ["PAST-DEL", "Pastillas de freno delanteras (juego)", 145_000],
      ["DISC-DEL", "Discos de freno delanteros (par)", 280_000],
      ["PAST-TRA", "Pastillas de freno traseras (juego)", 128_000],
      ["DISC-TRA", "Discos de freno traseros (par)", 245_000],
      ["KIT-DIST", "Kit correa de distribución", 320_000],
      ["BOM-AGUA", "Bomba de agua", 185_000],
      ["AMORT-DEL", "Amortiguador delantero (unidad)", 175_000],
      ["BATERIA", "Batería 12V 60Ah", 260_000],
      ["KIT-EMB", "Kit de embrague", 620_000],
      ["LIQ-FRE", "Líquido de frenos DOT4", 25_000],
      ["REFRIG", "Refrigerante (litro)", 30_000],
      ["GAS-R134", "Gas refrigerante R134a (carga)", 95_000],
    ] as const
  ).map(([sku, nombre, precioBase]) => [sku, { sku, nombre, precioBase }])
);

export const SERVICIOS: Servicio[] = [
  { codigo: "SRV10", nombre: "Service de 10.000 km", sector: "SERVICIO_TECNICO", horas: 1.5, precioFijo: null,
    descripcion: "Cambio de aceite y filtro, revisión de niveles y 20 puntos de control." },
  { codigo: "SRV20", nombre: "Service de 20.000 km", sector: "SERVICIO_TECNICO", horas: 2.5, precioFijo: null,
    descripcion: "Aceite, filtros de aceite, aire y habitáculo, revisión general." },
  { codigo: "SRV40", nombre: "Service mayor de 40.000 km", sector: "SERVICIO_TECNICO", horas: 4, precioFijo: null,
    descripcion: "Service completo con bujías, todos los filtros y líquido de frenos." },
  { codigo: "ACEITE", nombre: "Cambio de aceite y filtro", sector: "SERVICIO_TECNICO", horas: 1, precioFijo: null,
    descripcion: "Aceite sintético y filtro de aceite." },
  { codigo: "FRENOS_D", nombre: "Frenos delanteros", sector: "SERVICIO_TECNICO", horas: 2, precioFijo: null,
    descripcion: "Pastillas y discos delanteros, purgado de circuito." },
  { codigo: "FRENOS_T", nombre: "Frenos traseros", sector: "SERVICIO_TECNICO", horas: 2, precioFijo: null,
    descripcion: "Pastillas y discos traseros, purgado de circuito." },
  { codigo: "DISTRIB", nombre: "Cambio de correa de distribución", sector: "SERVICIO_TECNICO", horas: 5, precioFijo: null,
    descripcion: "Kit de distribución completo más bomba de agua." },
  { codigo: "EMBRAGUE", nombre: "Cambio de embrague", sector: "SERVICIO_TECNICO", horas: 6, precioFijo: null,
    descripcion: "Kit de embrague completo, incluye desmontaje de caja." },
  { codigo: "AMORT_D", nombre: "Amortiguadores delanteros", sector: "SERVICIO_TECNICO", horas: 3, precioFijo: null,
    descripcion: "Par de amortiguadores delanteros con alineación posterior." },
  { codigo: "BATERIA_C", nombre: "Cambio de batería", sector: "SERVICIO_TECNICO", horas: 0.5, precioFijo: null,
    descripcion: "Batería nueva con chequeo de alternador." },
  { codigo: "ALINEACION", nombre: "Alineación y balanceo", sector: "SERVICIO_TECNICO", horas: 0, precioFijo: 78_000,
    descripcion: "Alineación computarizada de las 4 ruedas y balanceo." },
  { codigo: "AIRE_AC", nombre: "Carga de aire acondicionado", sector: "SERVICIO_TECNICO", horas: 1, precioFijo: null,
    descripcion: "Carga de gas R134a y test de estanqueidad." },
  { codigo: "VTV", nombre: "VTV · Verificación Técnica Vehicular", sector: "VERIFICACIONES", horas: 0, precioFijo: 108_000,
    descripcion: "Inspección técnica obligatoria para vehículos livianos." },
  { codigo: "VERIF_POL", nombre: "Verificación policial del automotor", sector: "VERIFICACIONES", horas: 0, precioFijo: 55_000,
    descripcion: "Verificación de números de chasis y motor para transferencia." },
  { codigo: "GRABADO", nombre: "Grabado de autopartes", sector: "VERIFICACIONES", horas: 0, precioFijo: 48_000,
    descripcion: "Grabado obligatorio de cristales y autopartes." },
  { codigo: "PRE_VTV", nombre: "Pre-VTV (chequeo previo)", sector: "VERIFICACIONES", horas: 1, precioFijo: null,
    descripcion: "Revisión de los puntos que evalúa la VTV antes del turno oficial." },
];

/** Repuestos que consume cada servicio. */
export const COMPOSICION: Record<string, Array<[string, number]>> = {
  SRV10: [["ACE-5W30", 4], ["FIL-ACE", 1]],
  SRV20: [["ACE-5W30", 4], ["FIL-ACE", 1], ["FIL-AIR", 1], ["FIL-HAB", 1]],
  SRV40: [["ACE-5W30", 5], ["FIL-ACE", 1], ["FIL-AIR", 1], ["FIL-HAB", 1], ["FIL-COM", 1], ["BUJIA", 4], ["LIQ-FRE", 1]],
  ACEITE: [["ACE-5W30", 4], ["FIL-ACE", 1]],
  FRENOS_D: [["PAST-DEL", 1], ["DISC-DEL", 1], ["LIQ-FRE", 1]],
  FRENOS_T: [["PAST-TRA", 1], ["DISC-TRA", 1], ["LIQ-FRE", 1]],
  DISTRIB: [["KIT-DIST", 1], ["BOM-AGUA", 1], ["REFRIG", 2]],
  EMBRAGUE: [["KIT-EMB", 1]],
  AMORT_D: [["AMORT-DEL", 2]],
  BATERIA_C: [["BATERIA", 1]],
  AIRE_AC: [["GAS-R134", 1]],
  PRE_VTV: [],
};

export const SECTOR_ETIQUETA: Record<Sector, string> = {
  VENTAS: "Ventas",
  VERIFICACIONES: "Verificaciones",
  SERVICIO_TECNICO: "Servicio Técnico",
  OTRO: "Sin clasificar",
};

export function sinAcentos(texto: string): string {
  return (texto || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

export function buscarServicio(codigo: string): Servicio | undefined {
  return SERVICIOS.find((s) => s.codigo === codigo);
}

/** Resuelve texto libre contra el catálogo. null si no hay match claro. */
export function buscarModelo(marca?: string, modelo?: string): ModeloVehiculo | null {
  const objetivo = sinAcentos(`${marca ?? ""} ${modelo ?? ""}`);
  if (!objetivo.trim()) return null;
  // Modelo más largo primero: "Gol Trend" tiene que ganarle a "Gol".
  const ordenados = [...MODELOS].sort((a, b) => b.modelo.length - a.modelo.length);
  for (const m of ordenados) {
    if (objetivo.includes(sinAcentos(m.modelo))) return m;
  }
  return null;
}
