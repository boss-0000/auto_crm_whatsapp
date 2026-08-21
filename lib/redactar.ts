/**
 * Redacción de la respuesta + guardarraíl numérico.
 *
 * El modelo redacta, pero sólo puede usar números que salieron de la lista de
 * precios. Después de generar, se validan todos los importes contra el conjunto
 * de valores permitidos. Si aparece uno que no salió del cálculo, el mensaje NO
 * se envía: se manda el presupuesto determinístico.
 *
 * Se controlan números >= 1000. Los menores son cantidades, horas y días, y no
 * representan riesgo de precio inventado.
 */
import { type Presupuesto, textoPresupuesto, valoresPermitidos } from "./presupuestos";
import { type Extraccion } from "./interpretar";
import { type Turno, textoTurnos } from "./turnos";

const UMBRAL_IMPORTE = 1000;

export type TipoRespuesta =
  | "presupuesto" | "faltan_datos" | "turno" | "escalar"
  | "saludo" | "cierre" | "fuera_de_alcance";

export interface Respuesta {
  texto: string;
  tipo: TipoRespuesta;
  motor: "llm" | "plantilla";
  validacion: "ok" | "sin_validar" | "rechazado";
  numerosRechazados: number[];
}

/**
 * Devuelve [valor, esImporte]. En Argentina el punto es separador de miles.
 *
 * Un número precedido por '$' es un IMPORTE y se valida sólo contra la lista de
 * precios. El resto (kilometrajes, años) se valida contra un conjunto más
 * amplio: "el service de 20.000 km" es legítimo, "$ 20.000 de descuento" no.
 */
export function numerosDe(texto: string): Array<[number, boolean]> {
  const salida: Array<[number, boolean]> = [];
  const re = /\d[\d.]*/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(texto)) !== null) {
    const limpio = m[0].replace(/\.$/, "").replace(/\./g, "");
    if (!/^\d+$/.test(limpio)) continue;
    const antes = texto.slice(Math.max(0, m.index - 12), m.index);
    const despues = texto.slice(m.index + m[0].length, m.index + m[0].length + 10).toLowerCase();
    const esImporte = /[$]\s*$/.test(antes) || /^\s*(peso|ars)/.test(despues);
    salida.push([parseInt(limpio, 10), esImporte]);
  }
  return salida;
}

export function validar(
  texto: string,
  importes: Set<number>,
  generales: Set<number>
): { ok: boolean; malos: number[] } {
  const malos = new Set<number>();
  for (const [valor, esImporte] of numerosDe(texto)) {
    if (valor < UMBRAL_IMPORTE) continue;
    if (!(esImporte ? importes : generales).has(valor)) malos.add(valor);
  }
  return { ok: malos.size === 0, malos: [...malos].sort((a, b) => a - b) };
}

export function permitidos(
  p: Presupuesto | null,
  ext: Extraccion
): { importes: Set<number>; generales: Set<number> } {
  const importes = p ? valoresPermitidos(p) : new Set<number>();
  const generales = new Set(importes);
  if (ext.anio) generales.add(ext.anio);
  if (ext.km) generales.add(ext.km);
  const anio = new Date().getFullYear();
  generales.add(anio);
  generales.add(anio + 1);
  // Kilometrajes que nombran los propios servicios ("service de 20.000 km").
  // Nunca válidos como importe.
  for (const k of [10_000, 20_000, 40_000]) generales.add(k);
  return { importes, generales };
}

/** Plantillas determinísticas: respaldo y referencia para el modelo. */
export function plantilla(
  tipo: TipoRespuesta,
  ext: Extraccion,
  presupuesto: Presupuesto | null,
  turnos: Turno[] | null,
  nombreServicio?: string
): string {
  switch (tipo) {
    case "presupuesto":
      return presupuesto
        ? `${textoPresupuesto(presupuesto)}\n\n¿Querés que te reserve un turno?`
        : "";
    case "faltan_datos": {
      const falta = ext.modelo ? "el año" : "el modelo y el año del vehículo";
      const srv = nombreServicio ? ` para ${nombreServicio.toLowerCase()}` : "";
      return `Para pasarte el presupuesto${srv} necesito ${falta}. ¿Me lo decís?`;
    }
    case "turno":
      return turnos && turnos.length
        ? `Tengo estos turnos disponibles:\n${textoTurnos(turnos)}\n\n¿Cuál te sirve?`
        : "";
    case "escalar":
      return "Te paso con un asesor del equipo. En un rato te escriben por este mismo chat.";
    case "saludo":
      return "¡Hola! Soy el asistente de AutoService. Te puedo pasar presupuestos, sacar turno de VTV o verificación, y agendar service. ¿Qué necesitás?";
    case "cierre":
      return "Dale, cualquier cosa escribime por acá. ¡Buen día!";
    default:
      return "Eso te lo confirma mejor un asesor. ¿Querés que te derive con alguien del equipo?";
  }
}

export const SISTEMA_REDACCION = `Sos el asistente de WhatsApp de un taller y \
centro de verificación automotor en Argentina. Escribís en castellano \
rioplatense, de vos, natural y breve, como escribe una persona del mostrador.

REGLA ABSOLUTA: los únicos números que podés escribir son los que aparecen en \
los DATOS que te paso. No calcules, no estimes, no redondees, no inventes \
precios, plazos ni disponibilidad. Si un dato no está, no lo menciones.

Formato WhatsApp: sin encabezados markdown, sin tablas. Podés usar *negrita* con \
asteriscos simples y viñetas para listar. Máximo 6 líneas salvo que estés \
pasando un presupuesto itemizado.

No saludes de nuevo si la conversación ya empezó. Cerrá con una sola pregunta \
concreta que haga avanzar al cliente.`;

export function datosParaModelo(
  tipo: TipoRespuesta,
  ext: Extraccion,
  presupuesto: Presupuesto | null,
  turnos: Turno[] | null
): string {
  const partes = [`Situación: ${tipo}`, `Sector: ${ext.sector}`];
  if (ext.marca || ext.modelo) {
    partes.push(`Vehículo: ${ext.marca} ${ext.modelo} ${ext.anio || ""}`.trim());
  }
  if (presupuesto) {
    partes.push("Presupuesto calculado por el sistema (usar estos números exactos, no recalcular):");
    partes.push(textoPresupuesto(presupuesto));
  }
  if (turnos?.length) {
    partes.push("Turnos libres (no inventar otros):");
    partes.push(textoTurnos(turnos));
  }
  if (tipo === "faltan_datos") {
    const faltan = [!ext.modelo && "modelo", !ext.anio && "año"].filter(Boolean);
    partes.push(`Faltan estos datos para cotizar: ${faltan.join(", ")}. Pedilos en una sola pregunta.`);
  }
  if (tipo === "escalar") {
    partes.push("Hay que derivar a un asesor humano. Avisale al cliente con naturalidad, sin disculpas largas.");
  }
  if (tipo === "fuera_de_alcance") {
    partes.push("La consulta no la cubre el catálogo. Ofrecé derivar a un asesor. No inventes una respuesta técnica.");
  }
  return partes.join("\n");
}
