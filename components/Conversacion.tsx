"use client";

import { useEffect, useRef, useState } from "react";
import type { Etapa, Lead, Mensaje } from "@/lib/agente";
import type { Extraccion } from "@/lib/interpretar";
import type { Presupuesto } from "@/lib/presupuestos";
import type { PayloadRef } from "@/lib/whatsapp";

const ars = (n: number) => `$ ${n.toLocaleString("es-AR")}`;
const hora = () =>
  new Date().toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });

const SUGERENCIAS = [
  "¿Cuánto sale el service de un Gol Trend 2016?",
  "¿Y la VTV?",
  "Quiero sacar turno",
  "Me chillan los frenos de la Hilux",
  "Quiero hablar con alguien",
];

interface Burbuja extends Mensaje {
  hora: string;
}

export interface EstadoChat {
  burbujas: Burbuja[];
  historial: Mensaje[];
  previo: Extraccion | null;
  lead: Lead | null;
  etapas: Etapa[];
  presupuesto: Presupuesto | null;
  payload: PayloadRef | null;
  validacion: string;
  rechazados: number[];
  motor: string;
}

export const estadoInicial = (): EstadoChat => ({
  burbujas: [{
    rol: "asistente",
    texto: "¡Hola! Soy el asistente de AutoService. Te puedo pasar presupuestos, sacar turno de VTV o verificación, y agendar service. ¿Qué necesitás?",
    hora: "",
  }],
  historial: [],
  previo: null, lead: null, etapas: [], presupuesto: null, payload: null,
  validacion: "", rechazados: [], motor: "",
});

/** *negrita* de WhatsApp → <strong>, sin permitir HTML del modelo. */
function conNegrita(texto: string) {
  return texto.split(/(\*[^*\n]+\*)/g).map((parte, i) =>
    parte.startsWith("*") && parte.endsWith("*") && parte.length > 2
      ? <strong key={i} className="font-semibold">{parte.slice(1, -1)}</strong>
      : <span key={i}>{parte}</span>
  );
}

export default function Conversacion({
  estado, setEstado,
}: {
  estado: EstadoChat;
  setEstado: React.Dispatch<React.SetStateAction<EstadoChat>>;
}) {
  const [entrada, setEntrada] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [verPayload, setVerPayload] = useState(false);
  const hiloRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    hiloRef.current?.scrollTo({ top: hiloRef.current.scrollHeight, behavior: "smooth" });
  }, [estado.burbujas, ocupado]);

  async function enviar(texto: string) {
    if (!texto.trim() || ocupado) return;
    setOcupado(true);
    setEntrada("");
    setEstado((s) => ({
      ...s,
      burbujas: [...s.burbujas, { rol: "cliente", texto, hora: hora() }],
      etapas: [], validacion: "", rechazados: [],
    }));

    try {
      const r = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mensaje: texto,
          historial: estado.historial,
          previo: estado.previo,
          lead: estado.lead,
        }),
      });
      if (!r.ok) throw new Error(String(r.status));
      const d = await r.json();

      setEstado((s) => ({
        ...s,
        burbujas: [...s.burbujas, { rol: "asistente", texto: d.respuesta.texto, hora: hora() }],
        historial: ([
          ...s.historial,
          { rol: "cliente", texto },
          { rol: "asistente", texto: d.respuesta.texto },
        ] satisfies Mensaje[]).slice(-24),
        previo: d.extraccion,
        lead: d.lead,
        etapas: d.etapas,
        presupuesto: d.presupuesto,
        payload: d.payload,
        validacion: d.respuesta.validacion,
        rechazados: d.respuesta.numerosRechazados ?? [],
        motor: d.respuesta.motor,
      }));
    } catch {
      setEstado((s) => ({
        ...s,
        burbujas: [...s.burbujas, {
          rol: "asistente",
          texto: "Se cortó la conexión. Probá de nuevo en unos segundos.",
          hora: hora(),
        }],
      }));
    } finally {
      setOcupado(false);
    }
  }

  const l = estado.lead;
  const claveSector = (l?.sector ?? "OTRO").toLowerCase();
  const colorSector =
    claveSector.includes("servicio") ? "bg-orange-50 text-orange-700"
    : claveSector.includes("verific") ? "bg-violet-50 text-violet-700"
    : claveSector.includes("ventas") ? "bg-blue-50 text-blue-700"
    : "bg-slate-100 text-gris";

  return (
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_400px]">
      {/* ---------------- teléfono ---------------- */}
      <div className="flex h-[min(74vh,640px)] flex-col overflow-hidden rounded-xl border border-linea bg-wa-chat sombra-tarjeta">
        <div className="flex items-center gap-3 bg-wa px-4 py-2.5 text-white">
          <div className="grid h-9 w-9 place-items-center rounded-full bg-[#128c7e] text-sm font-semibold">
            AS
          </div>
          <div>
            <div className="text-[14.5px] font-semibold leading-tight">
              AutoService · Turnos y presupuestos
            </div>
            <div className="text-[11.5px] opacity-85">
              {ocupado ? "escribiendo…" : "en línea"}
            </div>
          </div>
        </div>

        <div ref={hiloRef} className="hilo flex flex-1 flex-col gap-2 overflow-y-auto px-3.5 py-4">
          {estado.burbujas.map((b, i) => (
            <div
              key={i}
              className={`surge max-w-[85%] whitespace-pre-wrap break-words rounded-lg px-3 pb-1.5 pt-2 text-[14.2px] leading-snug shadow-sm ${
                b.rol === "cliente"
                  ? "self-end rounded-tr-sm bg-wa-burbuja"
                  : "self-start rounded-tl-sm bg-white"
              }`}
            >
              {conNegrita(b.texto)}
              {b.hora && (
                <span className="ml-2 float-right mt-1.5 text-[10.5px] text-[#667781]">
                  {b.hora}
                </span>
              )}
            </div>
          ))}
          {ocupado && (
            <div className="flex gap-1 self-start rounded-lg rounded-tl-sm bg-white px-3.5 py-3 shadow-sm">
              {[0, 1, 2].map((i) => (
                <i
                  key={i}
                  className="punto-tipeo block h-[7px] w-[7px] rounded-full bg-[#93a1a8]"
                  style={{ animationDelay: `${i * 0.18}s` }}
                />
              ))}
            </div>
          )}
        </div>

        <div className="flex flex-wrap gap-1.5 px-3.5 pt-2.5">
          {SUGERENCIAS.map((s, i) => (
            <button
              key={s}
              onClick={() => enviar(s)}
              disabled={ocupado}
              className={`rounded-full border border-black/10 bg-white/90 px-2.5 py-1 text-[12.5px] text-tinta3 transition hover:border-wa hover:bg-white hover:text-wa disabled:opacity-50 ${
                i >= 3 ? "hidden sm:block" : ""
              }`}
            >
              {s}
            </button>
          ))}
        </div>

        <form
          onSubmit={(e) => { e.preventDefault(); enviar(entrada); }}
          className="flex gap-2 border-t border-black/5 bg-[#f0f0f0] p-2.5"
        >
          <input
            value={entrada}
            onChange={(e) => setEntrada(e.target.value)}
            placeholder="Escribí un mensaje"
            maxLength={500}
            className="flex-1 rounded-full px-4 py-2.5 text-[14.2px] outline-none"
          />
          <button
            type="submit"
            disabled={ocupado || !entrada.trim()}
            aria-label="Enviar"
            className="grid h-10 w-10 place-items-center rounded-full bg-wa text-lg text-white disabled:opacity-45"
          >
            ➤
          </button>
        </form>
      </div>

      {/* ---------------- panel CRM ---------------- */}
      <aside className="flex flex-col gap-3 lg:sticky lg:top-[76px]">
        <Caja titulo="Ficha del lead">
          {!l ? (
            <p className="px-4 pb-4 text-[13.5px] leading-relaxed text-gris2">
              Todavía no hay conversación. Escribí un mensaje y la ficha se arma sola.
            </p>
          ) : (
            <div className="surge px-4 pb-4">
              <div className="mb-3 flex items-center gap-2.5">
                <div className="grid h-9 w-9 place-items-center rounded-full bg-tinta text-sm font-semibold text-white">
                  {(l.nombre || "C").split(" ").map((p) => p[0]).slice(0, 2).join("")}
                </div>
                <div>
                  <div className="text-[14.5px] font-semibold leading-tight">{l.nombre}</div>
                  <div className="font-mono text-xs text-gris">
                    {l.telefono || "sin identificar"}
                  </div>
                </div>
              </div>
              <dl className="grid gap-1.5 text-[13px]">
                <Fila k="Origen" v={l.origen} />
                <Fila k="Sector" v={
                  <span className={`inline-block rounded-full px-2.5 py-0.5 text-[11.5px] font-semibold ${colorSector}`}>
                    {l.sectorEtiqueta}
                  </span>
                } />
                {l.vehiculo && <Fila k="Vehículo" v={l.vehiculo} />}
                {l.servicio && <Fila k="Servicio" v={l.servicio} />}
                <Fila k="Estado" v={
                  <span className={`inline-block rounded-full px-2.5 py-0.5 text-[11.5px] font-semibold ${
                    l.estado === "REQUIERE_HUMANO"
                      ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"
                  }`}>
                    {l.estado === "REQUIERE_HUMANO" ? "Requiere humano" : "Atiende el bot"}
                  </span>
                } />
                {typeof l.origenDetalle?.patente === "string" && (
                  <Fila k="Patente" v={l.origenDetalle.patente} />
                )}
              </dl>
            </div>
          )}
        </Caja>

        {estado.etapas.length > 0 && (
          <Caja titulo="Pipeline">
            <div className="flex flex-col px-4 pb-3.5">
              {estado.etapas.map((e, i) => (
                <div key={i} className="surge flex gap-2.5 py-1.5 text-[12.8px]">
                  <span className={`mt-0.5 grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full text-[10px] font-bold text-white ${
                    e.nombre === "Cotizando" ? "bg-acento"
                    : e.nombre === "Validando"
                      ? (e.resultado === "rechazado" ? "bg-red-600" : "bg-ok")
                      : "bg-gris2"
                  }`}>
                    {e.nombre === "Cotizando" ? "=" : e.nombre === "Validando" ? "✓" : i + 1}
                  </span>
                  <span className="leading-snug text-tinta3">
                    <b className="block text-[12.5px] font-semibold text-tinta">{e.nombre}</b>
                    {e.detalle}
                    {e.traza && (
                      <div className="mt-1.5 overflow-hidden rounded-md bg-tinta">
                        {e.traza.map((t, j) => (
                          <div key={j} className="flex items-baseline justify-between gap-2 border-b border-white/5 px-2.5 py-1.5 last:border-0">
                            <span className="font-mono text-[10.5px] text-sky-300">{t.formula}</span>
                            <span className="shrink-0 font-mono text-[10.5px] font-semibold text-lime-300">{t.resultado}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </span>
                </div>
              ))}
            </div>
            <div className="px-4 pb-4">
              <div className={`flex items-start gap-2.5 rounded-lg border px-3 py-2.5 text-[12.8px] leading-snug ${
                estado.validacion === "ok" ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                : estado.validacion === "rechazado" ? "border-red-200 bg-red-50 text-red-900"
                : "border-linea bg-slate-50 text-gris"
              }`}>
                <span>{estado.validacion === "ok" ? "🔒" : estado.validacion === "rechazado" ? "⛔" : "⚙️"}</span>
                <span>
                  {estado.validacion === "ok"
                    ? "Todos los importes del mensaje coinciden con la lista de precios."
                    : estado.validacion === "rechazado"
                      ? `El modelo escribió un importe que no salió de la lista (${estado.rechazados.map(ars).join(", ")}). Mensaje descartado: se envió el presupuesto del sistema.`
                      : "Respuesta determinística, generada sin modelo."}
                </span>
              </div>
            </div>
          </Caja>
        )}

        {estado.presupuesto && (
          <Caja titulo="Presupuesto adjunto">
            <div className="px-4 pb-4 text-[12.8px]">
              {estado.presupuesto.items.map((i, k) => (
                <div key={k} className="flex justify-between gap-3 border-b border-slate-100 py-1">
                  <span className="text-tinta3">
                    {i.detalle}{i.tipo === "repuesto" && i.cantidad > 1 ? ` ×${i.cantidad}` : ""}
                  </span>
                  <span className="shrink-0 font-medium tabular-nums">{ars(i.subtotal)}</span>
                </div>
              ))}
              {estado.presupuesto.iva > 0 && (
                <div className="flex justify-between gap-3 border-b border-slate-100 py-1">
                  <span className="text-tinta3">IVA</span>
                  <span className="shrink-0 font-medium tabular-nums">{ars(estado.presupuesto.iva)}</span>
                </div>
              )}
              <div className="mt-1.5 flex justify-between border-t-2 border-tinta pt-2 text-[15px] font-bold">
                <span>Total</span>
                <span className="tabular-nums">{ars(estado.presupuesto.total)}</span>
              </div>
              {estado.presupuesto.nota && (
                <p className="mt-2 text-xs italic text-gris">{estado.presupuesto.nota}</p>
              )}
            </div>
          </Caja>
        )}

        {estado.payload && (
          <Caja titulo="Payload de Meta">
            <button
              onClick={() => setVerPayload((v) => !v)}
              className="block px-4 pb-3 text-xs font-medium text-acento hover:underline"
            >
              {verPayload ? "Ocultar JSON del webhook ▴" : "Ver JSON del webhook ▾"}
            </button>
            {verPayload && (
              <div className="px-4 pb-4">
                <span className="mb-2 inline-block rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-semibold text-gris">
                  {estado.payload.titulo}
                </span>
                <pre className="max-h-[320px] overflow-auto rounded-lg bg-tinta p-3 text-[10.5px] leading-relaxed text-slate-200">
                  {JSON.stringify(estado.payload.cuerpo, null, 2)}
                </pre>
              </div>
            )}
          </Caja>
        )}
      </aside>
    </div>
  );
}

function Caja({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="overflow-hidden rounded-xl border border-linea bg-white sombra-tarjeta">
      <h3 className="px-4 pt-3 text-[11px] font-semibold uppercase tracking-wider text-gris2">
        {titulo}
      </h3>
      <div className="pt-2.5">{children}</div>
    </section>
  );
}

function Fila({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[80px_1fr] items-baseline gap-2">
      <dt className="text-xs text-gris">{k}</dt>
      <dd className="font-medium">{v}</dd>
    </div>
  );
}
