/**
 * Motor de presupuestos DETERMINÍSTICO.
 *
 * El modelo de lenguaje nunca calcula un precio. Extrae parámetros
 * (marca, modelo, año, servicio) y este módulo hace el resto: búsquedas en la
 * lista de precios y aritmética. Cada presupuesto viaja con la traza del
 * cálculo para poder mostrarla en pantalla.
 */
import {
  COMPOSICION, FACTORES, PARAMETROS, REPUESTOS, type ModeloVehiculo,
  type Segmento, type Servicio, buscarServicio,
} from "./catalogo";

const REDONDEO = 100; // los presupuestos se redondean al centenar de pesos

const redondear = (v: number) => Math.round(v / REDONDEO) * REDONDEO;

export interface ItemPresupuesto {
  tipo: "mano_obra" | "repuesto" | "arancel" | "servicio";
  detalle: string;
  cantidad: number;
  unitario: number;
  subtotal: number;
}

export interface PasoCalculo {
  etiqueta: string;
  formula: string;
  resultado: string;
}

export interface Presupuesto {
  codigo: string;
  nombre: string;
  sector: string;
  descripcion: string;
  vehiculo: string;
  segmento: Segmento;
  items: ItemPresupuesto[];
  subtotal: number;
  iva: number;
  total: number;
  moneda: string;
  vigenciaDias: number;
  fechaListaPrecios: string;
  nota: string;
  traza: PasoCalculo[];
}

export const ars = (n: number) => `$ ${n.toLocaleString("es-AR")}`;

/**
 * Los trámites de Verificaciones (VTV, verificación policial, grabado) se
 * cobran a arancel oficial: ese precio ya es final y NO lleva IVA encima.
 * Los servicios de taller con precio cerrado sí lo llevan.
 */
const esArancel = (s: Servicio) =>
  s.precioFijo !== null && s.sector === "VERIFICACIONES";

/** Servicios que se cotizan sin conocer el vehículo: el arancel es fijo. */
export const requiereVehiculo = (s: Servicio) => s.precioFijo === null;

export function cotizar(
  codigo: string,
  vehiculo: ModeloVehiculo | null,
  anio?: number
): Presupuesto | null {
  const srv = buscarServicio(codigo);
  if (!srv) return null;
  if (requiereVehiculo(srv) && !vehiculo) return null;

  const segmento: Segmento = vehiculo?.segmento ?? "chico";
  const f = FACTORES[segmento];
  const items: ItemPresupuesto[] = [];
  const traza: PasoCalculo[] = [];

  const etiqueta = vehiculo
    ? `${vehiculo.marca} ${vehiculo.modelo}${anio ? ` ${anio}` : ""}`
    : "";

  const arancel = esArancel(srv);

  if (srv.precioFijo !== null) {
    const neto = redondear(srv.precioFijo);
    items.push({
      tipo: arancel ? "arancel" : "servicio",
      detalle: srv.nombre, cantidad: 1, unitario: neto, subtotal: neto,
    });
    traza.push({
      etiqueta: "Arancel fijo",
      formula: `servicios[${srv.codigo}].precioFijo`,
      resultado: ars(neto),
    });
  } else {
    if (srv.horas > 0) {
      const unitario = redondear(PARAMETROS.valorHoraManoObra * f.manoObra);
      const total = redondear(unitario * srv.horas);
      items.push({
        tipo: "mano_obra",
        detalle: `Mano de obra (${srv.horas} h · ${segmento})`,
        cantidad: srv.horas, unitario, subtotal: total,
      });
      traza.push({
        etiqueta: "Mano de obra",
        formula: `${srv.horas} h × ${ars(PARAMETROS.valorHoraManoObra)} × ${f.manoObra.toFixed(2)} (${segmento})`,
        resultado: ars(total),
      });
    }
    for (const [sku, cantidad] of COMPOSICION[srv.codigo] ?? []) {
      const r = REPUESTOS[sku];
      if (!r) continue;
      const unitario = redondear(r.precioBase * f.repuestos);
      items.push({
        tipo: "repuesto",
        detalle: `${r.nombre} [${sku}]`,
        cantidad, unitario, subtotal: unitario * cantidad,
      });
      traza.push({
        etiqueta: r.nombre,
        formula: `${ars(r.precioBase)} × ${f.repuestos.toFixed(2)}${cantidad > 1 ? ` × ${cantidad}` : ""}`,
        resultado: ars(unitario * cantidad),
      });
    }
  }

  if (items.length === 0) return null;

  const subtotal = items.reduce((a, i) => a + i.subtotal, 0);
  const iva = arancel ? 0 : redondear(subtotal * PARAMETROS.iva);

  traza.push({
    etiqueta: "Subtotal",
    formula: items.map((i) => i.subtotal.toLocaleString("es-AR")).join(" + "),
    resultado: ars(subtotal),
  });
  traza.push({
    etiqueta: arancel ? "IVA" : `IVA (${(PARAMETROS.iva * 100).toFixed(0)}%)`,
    formula: arancel ? "arancel oficial · precio final" : `${subtotal.toLocaleString("es-AR")} × ${PARAMETROS.iva}`,
    resultado: ars(iva),
  });

  return {
    codigo: srv.codigo, nombre: srv.nombre, sector: srv.sector,
    descripcion: srv.descripcion, vehiculo: etiqueta, segmento,
    items, subtotal, iva, total: subtotal + iva,
    moneda: PARAMETROS.moneda,
    vigenciaDias: PARAMETROS.vigenciaPresupuestoDias,
    fechaListaPrecios: PARAMETROS.fechaListaPrecios,
    nota: arancel ? "Arancel oficial, precio final." : "",
    traza,
  };
}

/** Todo número que el modelo puede mencionar sin estar inventando. */
export function valoresPermitidos(p: Presupuesto): Set<number> {
  const ok = new Set<number>([p.subtotal, p.iva, p.total, p.vigenciaDias]);
  for (const i of p.items) {
    ok.add(i.unitario);
    ok.add(i.subtotal);
    ok.add(Math.round(i.cantidad));
  }
  ok.delete(0);
  return ok;
}

/** Texto plano: lo que ve el cliente final en WhatsApp. */
export function textoPresupuesto(p: Presupuesto): string {
  const lineas: string[] = [
    p.vehiculo ? `*${p.nombre}* · ${p.vehiculo}` : `*${p.nombre}*`,
    "",
  ];
  for (const i of p.items) {
    const cant = i.tipo === "repuesto" && i.cantidad > 1 ? ` ×${i.cantidad}` : "";
    lineas.push(`• ${i.detalle}${cant}: ${ars(i.subtotal)}`);
  }
  lineas.push("");
  if (p.iva) {
    lineas.push(`Subtotal: ${ars(p.subtotal)}`);
    lineas.push(`IVA: ${ars(p.iva)}`);
  }
  lineas.push(`*TOTAL: ${ars(p.total)}*`);
  lineas.push("");
  if (p.nota) lineas.push(p.nota);
  lineas.push(`Presupuesto válido por ${p.vigenciaDias} días.`);
  return lineas.join("\n");
}
