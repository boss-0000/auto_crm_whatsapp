/**
 * Interpretación del mensaje: sector, intención y parámetros.
 *
 * Hay dos motores. El de reglas corre siempre y no necesita ninguna key: es lo
 * que hace que el demo funcione desplegado sin configurar nada. Si hay una key
 * de Gemini, el modelo lo reemplaza y entiende frases que las reglas no cubren.
 */
import {
  MODELOS, SERVICIOS, type Sector, buscarServicio, sinAcentos,
} from "./catalogo";

export type Intencion =
  | "PRESUPUESTO" | "TURNO" | "CONSULTA" | "ESCALAR" | "SALUDO" | "CIERRE";

export interface Extraccion {
  sector: Sector;
  intencion: Intencion;
  servicioCodigo: string;
  marca: string;
  modelo: string;
  anio: number;
  km: number;
  patente: string;
  motor: "reglas" | "llm" | "campana";
}

export const extraccionVacia = (): Extraccion => ({
  sector: "OTRO", intencion: "CONSULTA", servicioCodigo: "",
  marca: "", modelo: "", anio: 0, km: 0, patente: "", motor: "reglas",
});

/** Orden importa: lo más específico primero ("service mayor" antes que "service"). */
const PALABRAS: Array<[string, string[]]> = [
  ["VTV", ["vtv", "verificacion tecnica", "revision tecnica"]],
  ["VERIF_POL", ["verificacion policial", "transferencia", "numero de motor", "grabado de chasis"]],
  ["GRABADO", ["grabado", "autopartes"]],
  ["SRV10", ["service de 10", "10.000 km", "10000 km"]],
  ["SRV40", ["service mayor", "40.000 km", "40000 km"]],
  ["SRV20", ["service", "20.000 km", "20000 km"]],
  ["ACEITE", ["aceite"]],
  ["FRENOS_D", ["freno", "frenos", "pastilla", "disco", "chillan"]],
  ["DISTRIB", ["distribucion", "correa"]],
  ["EMBRAGUE", ["embrague", "clutch"]],
  ["AMORT_D", ["amortiguador", "suspension"]],
  ["BATERIA_C", ["bateria", "no arranca"]],
  ["ALINEACION", ["alineacion", "balanceo", "tren delantero"]],
  ["AIRE_AC", ["aire acondicionado", "climatizador", "no enfria"]],
];

const ESCALAR = ["hablar con", "una persona", "un humano", "asesor", "reclamo",
  "queja", "gerente", "encargado", "me estafaron", "denuncia"];
const TURNO = ["turno", "cuando puedo", "horario", "agenda", "reservar"];
const PRECIO = ["cuanto sale", "cuanto cuesta", "cuanto es", "precio",
  "presupuesto", "cotiza", "vale", "sale"];
const CIERRE = ["gracias", "perfecto", "barbaro", "listo", "buenisimo", "dale gracias"];
const SALUDO = ["hola", "buenas", "buen dia", "que tal", "hey", "holis"];

export function interpretarPorReglas(
  mensaje: string,
  previo?: Extraccion | null
): Extraccion {
  const txt = sinAcentos(mensaje);
  const e = extraccionVacia();

  if (previo) {
    e.marca = previo.marca; e.modelo = previo.modelo;
    e.anio = previo.anio; e.km = previo.km; e.patente = previo.patente;
    // Sector y servicio persisten hasta que el cliente cambie de tema:
    // "¿y la VTV?" → "dale, sacame turno" tiene que agendar en Verificaciones.
    e.sector = previo.sector; e.servicioCodigo = previo.servicioCodigo;
  }

  if (ESCALAR.some((k) => txt.includes(k))) {
    e.intencion = "ESCALAR";
    return e;
  }

  for (const [codigo, claves] of PALABRAS) {
    if (claves.some((k) => txt.includes(k))) {
      const srv = buscarServicio(codigo);
      if (srv) {
        e.servicioCodigo = codigo;
        e.sector = srv.sector;
        e.intencion = "PRESUPUESTO";
      }
      break;
    }
  }

  // Modelo más largo primero: "Gol Trend" le gana a "Gol".
  for (const m of [...MODELOS].sort((a, b) => b.modelo.length - a.modelo.length)) {
    if (txt.includes(sinAcentos(m.modelo))) {
      e.marca = m.marca; e.modelo = m.modelo;
      break;
    }
  }

  const anio = txt.match(/\b(19[89]\d|20[0-2]\d)\b/);
  if (anio) e.anio = parseInt(anio[1], 10);
  const km = txt.match(/\b(\d{2,3})\.?(\d{3})\s*(?:km|kilometros)/);
  if (km) e.km = parseInt(km[1] + km[2], 10);
  const pat = txt.match(/\b([a-z]{3}\d{3}|[a-z]{2}\d{3}[a-z]{2})\b/);
  if (pat) e.patente = pat[1].toUpperCase();

  if (TURNO.some((k) => txt.includes(k))) e.intencion = "TURNO";
  else if (PRECIO.some((k) => txt.includes(k))) e.intencion = "PRESUPUESTO";
  else if (txt.length <= 30 && CIERRE.some((k) => txt.includes(k))) e.intencion = "CIERRE";
  else if (e.intencion === "CONSULTA" && txt.length <= 25 &&
           SALUDO.some((k) => txt.startsWith(k))) e.intencion = "SALUDO";

  return e;
}

/** Esquema que se le pide al modelo cuando hay key. */
export function esquemaExtraccion() {
  return {
    type: "object",
    properties: {
      sector: { type: "string", enum: ["VENTAS", "VERIFICACIONES", "SERVICIO_TECNICO", "OTRO"] },
      intencion: { type: "string", enum: ["PRESUPUESTO", "TURNO", "CONSULTA", "ESCALAR", "SALUDO", "CIERRE"] },
      servicioCodigo: { type: "string", enum: [...SERVICIOS.map((s) => s.codigo), ""] },
      marca: { type: "string" },
      modelo: { type: "string" },
      anio: { type: "integer" },
      km: { type: "integer" },
      patente: { type: "string" },
    },
    required: ["sector", "intencion", "servicioCodigo", "marca", "modelo", "anio", "km", "patente"],
  };
}

export const SISTEMA_EXTRACCION = `Sos el clasificador de un taller y centro de \
verificación automotor en Argentina. Recibís un mensaje de WhatsApp y devolvés \
datos estructurados.

Reglas:
- Nunca inventes precios, plazos ni disponibilidad. Tu única tarea es extraer datos.
- servicioCodigo tiene que salir de la lista provista. Si ninguno corresponde \
claramente, devolvé cadena vacía.
- VERIFICACIONES cubre VTV, verificación policial y grabado de autopartes. \
SERVICIO_TECNICO cubre el taller. VENTAS cubre consultas comerciales y repuestos.
- Si el cliente pide hablar con una persona, se queja o reclama, intencion = ESCALAR.
- Considerá el historial: si el modelo o el año ya se dijeron antes, repetilos.
- Si un dato no está, devolvé cadena vacía o 0. No adivines.`;

export function catalogoParaPrompt(): string {
  return SERVICIOS.map(
    (s) => `- ${s.codigo} (${s.sector}): ${s.nombre}. ${s.descripcion}`
  ).join("\n");
}
