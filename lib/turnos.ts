/** Disponibilidad de turnos. Determinística: el modelo no inventa horarios. */
import type { Sector } from "./catalogo";

export interface Turno {
  fecha: string;
  hora: string;
  etiqueta: string;
}

/** Agenda del taller. En producción sale de la tabla de turnos del cliente. */
const HORARIOS: Record<string, string[]> = {
  VERIFICACIONES: ["08:30", "10:00", "11:30", "14:00", "15:30"],
  SERVICIO_TECNICO: ["08:00", "09:30", "13:30", "16:00"],
  VENTAS: ["10:00", "12:00", "16:00"],
};

const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

export function proximosTurnos(sector: Sector, cantidad = 3, desde = new Date()): Turno[] {
  const horarios = HORARIOS[sector] ?? HORARIOS.SERVICIO_TECNICO;
  const salida: Turno[] = [];
  const dia = new Date(desde);
  for (let i = 0; i < 14 && salida.length < cantidad; i++) {
    dia.setDate(dia.getDate() + 1);
    const dow = dia.getDay();
    if (dow === 0 || dow === 6) continue; // sólo días hábiles
    for (const h of horarios) {
      if (salida.length >= cantidad) break;
      const dd = String(dia.getDate()).padStart(2, "0");
      const mm = String(dia.getMonth() + 1).padStart(2, "0");
      salida.push({
        fecha: `${dia.getFullYear()}-${mm}-${dd}`,
        hora: h,
        etiqueta: `${DIAS[dow]} ${dd}/${mm} a las ${h}`,
      });
    }
  }
  return salida;
}

export const textoTurnos = (t: Turno[]) =>
  t.map((x, i) => `${i + 1}. ${x.etiqueta}`).join("\n");
