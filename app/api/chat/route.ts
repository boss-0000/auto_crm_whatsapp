import { NextResponse } from "next/server";
import { procesar, type Lead, type Mensaje } from "@/lib/agente";
import { type Extraccion } from "@/lib/interpretar";
import { payloadEntrante } from "@/lib/whatsapp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_MENSAJE = 500;
const MAX_TURNOS = 12;

/**
 * Endpoint sin estado: el navegador manda el historial y la última extracción.
 * Así no hace falta memoria compartida entre invocaciones serverless.
 */
export async function POST(req: Request) {
  let body: {
    mensaje?: string;
    historial?: Mensaje[];
    previo?: Extraccion | null;
    lead?: Lead | null;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const mensaje = (body.mensaje ?? "").slice(0, MAX_MENSAJE).trim();
  if (!mensaje) {
    return NextResponse.json({ error: "mensaje vacío" }, { status: 400 });
  }

  // El cliente controla el payload: se acota antes de usarlo.
  const historial = (body.historial ?? []).slice(-MAX_TURNOS * 2);

  const r = await procesar(mensaje, historial, body.previo ?? null, body.lead ?? null);

  return NextResponse.json({
    ...r,
    payload: payloadEntrante(mensaje),
  });
}
