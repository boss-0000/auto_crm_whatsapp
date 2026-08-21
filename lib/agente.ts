/**
 * Orquestador: decide QUÉ responder (ruteo determinístico) y delega el CÓMO.
 *
 * Es puro: recibe el historial que manda el navegador y devuelve el turno
 * siguiente. No guarda estado, así que corre igual en una función serverless
 * sin memoria compartida entre invocaciones.
 */
import { SECTOR_ETIQUETA, buscarModelo, buscarServicio, type Sector } from "./catalogo";
import {
  SISTEMA_EXTRACCION, catalogoParaPrompt, esquemaExtraccion, extraccionVacia,
  interpretarPorReglas, type Extraccion,
} from "./interpretar";
import * as llm from "./llm";
import { cotizar, requiereVehiculo, type Presupuesto } from "./presupuestos";
import {
  SISTEMA_REDACCION, datosParaModelo, permitidos, plantilla, validar,
  type Respuesta, type TipoRespuesta,
} from "./redactar";
import { proximosTurnos, type Turno } from "./turnos";

export interface Mensaje {
  rol: "cliente" | "asistente";
  texto: string;
}

export interface Lead {
  telefono: string;
  nombre: string;
  origen: string;
  origenDetalle: Record<string, unknown>;
  sector: Sector;
  sectorEtiqueta: string;
  intencion: string;
  vehiculo: string;
  servicio: string;
  estado: "BOT" | "REQUIERE_HUMANO";
}

export interface Etapa {
  nombre: string;
  detalle: string;
  traza?: { etiqueta: string; formula: string; resultado: string }[];
  resultado?: string;
}

export interface Turno_Resultado {
  respuesta: Respuesta;
  extraccion: Extraccion;
  presupuesto: Presupuesto | null;
  turnos: Turno[] | null;
  lead: Lead;
  tipo: TipoRespuesta;
  etapas: Etapa[];
}

export const leadVacio = (): Lead => ({
  telefono: "", nombre: "Cliente", origen: "Simulador web", origenDetalle: {},
  sector: "OTRO", sectorEtiqueta: SECTOR_ETIQUETA.OTRO, intencion: "",
  vehiculo: "", servicio: "", estado: "BOT",
});

async function interpretar(
  mensaje: string,
  historial: Mensaje[],
  previo: Extraccion | null
): Promise<Extraccion> {
  if (!llm.hayModelo()) return interpretarPorReglas(mensaje, previo);

  const contexto = historial.length
    ? `\n\nHistorial reciente:\n${historial.slice(-8).map((h) => `${h.rol}: ${h.texto}`).join("\n")}`
    : "";
  const prompt =
    `Catálogo de servicios disponibles:\n${catalogoParaPrompt()}` +
    `${contexto}\n\nMensaje nuevo del cliente:\n${mensaje}`;

  const datos = await llm.generarJSON<Partial<Extraccion>>(
    SISTEMA_EXTRACCION, prompt, esquemaExtraccion()
  );
  if (!datos) return interpretarPorReglas(mensaje, previo);

  const e: Extraccion = { ...extraccionVacia(), ...datos, motor: "llm" };
  // El modelo puede omitir datos que ya estaban en la conversación.
  if (previo) {
    e.marca ||= previo.marca;
    e.modelo ||= previo.modelo;
    e.anio ||= previo.anio;
    e.km ||= previo.km;
    e.patente ||= previo.patente;
    if (e.sector === "OTRO") e.sector = previo.sector;
  }
  return e;
}

export async function procesar(
  mensaje: string,
  historial: Mensaje[] = [],
  previo: Extraccion | null = null,
  leadPrevio: Lead | null = null
): Promise<Turno_Resultado> {
  const etapas: Etapa[] = [];

  etapas.push({
    nombre: "Clasificando",
    detalle: llm.hayModelo()
      ? "El modelo interpreta el mensaje y extrae parámetros"
      : "Reglas locales interpretan el mensaje (sin modelo)",
  });
  const ext = await interpretar(mensaje, historial, previo);

  const srv = ext.servicioCodigo ? buscarServicio(ext.servicioCodigo) : undefined;
  let presupuesto: Presupuesto | null = null;
  let turnos: Turno[] | null = null;
  let tipo: TipoRespuesta;

  if (ext.intencion === "ESCALAR") tipo = "escalar";
  else if (ext.intencion === "SALUDO") tipo = "saludo";
  else if (ext.intencion === "CIERRE") tipo = "cierre";
  else if (ext.intencion === "TURNO") {
    let sector = ext.sector;
    if (sector === "OTRO" && leadPrevio) sector = leadPrevio.sector;
    turnos = proximosTurnos(sector === "OTRO" ? "SERVICIO_TECNICO" : sector);
    tipo = "turno";
  } else if (ext.intencion === "PRESUPUESTO" && srv) {
    const vehiculo = buscarModelo(ext.marca, ext.modelo);
    if (requiereVehiculo(srv) && !vehiculo) {
      tipo = "faltan_datos";
    } else {
      presupuesto = cotizar(srv.codigo, vehiculo, ext.anio || undefined);
      tipo = presupuesto ? "presupuesto" : "fuera_de_alcance";
    }
  } else {
    tipo = "fuera_de_alcance";
  }

  if (presupuesto) {
    etapas.push({
      nombre: "Cotizando",
      detalle: "Precio calculado con la lista de precios. El modelo no interviene.",
      traza: presupuesto.traza,
    });
  } else if (turnos) {
    etapas.push({
      nombre: "Agenda",
      detalle: "Turnos leídos de la agenda, no generados por el modelo",
    });
  }

  // Redacción
  const respaldo = plantilla(tipo, ext, presupuesto, turnos, srv?.nombre);
  let respuesta: Respuesta = {
    texto: respaldo, tipo, motor: "plantilla",
    validacion: "sin_validar", numerosRechazados: [],
  };

  if (llm.hayModelo()) {
    etapas.push({
      nombre: "Redactando",
      detalle: "El modelo redacta usando solamente los datos del sistema",
    });
    const contexto = historial.length
      ? `\n\nConversación hasta ahora:\n${historial.slice(-6).map((h) => `${h.rol}: ${h.texto}`).join("\n")}`
      : "";
    const texto = await llm.generarTexto(
      SISTEMA_REDACCION,
      `DATOS:\n${datosParaModelo(tipo, ext, presupuesto, turnos)}${contexto}\n\nRedactá el próximo mensaje del asistente.`
    );
    if (texto) {
      const { importes, generales } = permitidos(presupuesto, ext);
      const { ok, malos } = validar(texto, importes, generales);
      respuesta = ok
        ? { texto, tipo, motor: "llm", validacion: "ok", numerosRechazados: [] }
        : { texto: respaldo, tipo, motor: "plantilla", validacion: "rechazado", numerosRechazados: malos };
    }
  }

  etapas.push({
    nombre: "Validando",
    detalle:
      respuesta.validacion === "ok"
        ? "Todos los importes coinciden con la lista de precios"
        : respuesta.validacion === "rechazado"
          ? `Se detectó un importe fuera de la lista (${respuesta.numerosRechazados.join(", ")}). Mensaje descartado.`
          : "Respuesta determinística, generada sin modelo",
    resultado: respuesta.validacion,
  });

  // Ficha del lead
  const lead: Lead = { ...(leadPrevio ?? leadVacio()) };
  if (ext.sector !== "OTRO") lead.sector = ext.sector;
  lead.sectorEtiqueta = SECTOR_ETIQUETA[lead.sector];
  lead.intencion = ext.intencion;
  if (ext.marca || ext.modelo) {
    lead.vehiculo = `${ext.marca} ${ext.modelo} ${ext.anio || ""}`.trim();
  }
  if (srv) lead.servicio = srv.nombre;
  if (tipo === "escalar") lead.estado = "REQUIERE_HUMANO";

  return { respuesta, extraccion: ext, presupuesto, turnos, lead, tipo, etapas };
}
