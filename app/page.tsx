"use client";

import { useState } from "react";
import Arquitectura from "@/components/Arquitectura";
import Conversacion, { estadoInicial, type EstadoChat } from "@/components/Conversacion";
import Radar from "@/components/Radar";
import radar from "@/data/radar.json";
import { SECTOR_ETIQUETA } from "@/lib/catalogo";
import { payloadEntrante } from "@/lib/whatsapp";

type Vista = "radar" | "chat" | "whatsapp";

const VISTAS: Array<[Vista, string]> = [
  ["radar", "Radar"],
  ["chat", "Conversación"],
  ["whatsapp", "WhatsApp"],
];

export default function Pagina() {
  const [vista, setVista] = useState<Vista>("chat");
  const [chat, setChat] = useState<EstadoChat>(estadoInicial);

  /**
   * Dispara la campaña sobre un caso real de la base y salta al chat con el
   * contexto ya cargado: si el cliente contesta "sí, ¿cuánto sale?", el bot
   * tiene que cotizar la VTV de ESE vehículo, no volver a preguntar.
   */
  function lanzarCampana() {
    const v = radar.muestraVtv[Math.floor(Math.random() * radar.muestraVtv.length)];
    const vehiculo = `${v.marca} ${v.modelo} ${v.anio}`;
    const [, mm, dd] = v.vtvVence.split("-");
    const texto =
      `¡Hola ${v.cliente.split(" ")[0]}! Te escribimos de AutoService.\n\n` +
      `La VTV de tu *${vehiculo}* (patente ${v.patente}) vence el ${dd}/${mm}.\n` +
      `Tenemos turnos disponibles esta semana.\n\n` +
      `¿Querés que te reserve uno?`;

    setChat({
      ...estadoInicial(),
      burbujas: [{ rol: "asistente", texto, hora: "" }],
      historial: [{ rol: "asistente", texto }],
      previo: {
        sector: "VERIFICACIONES", intencion: "CONSULTA", servicioCodigo: "VTV",
        marca: v.marca, modelo: v.modelo, anio: v.anio, km: v.km,
        patente: v.patente, motor: "campana",
      },
      lead: {
        telefono: v.telefono, nombre: v.cliente,
        origen: "Campaña VTV (radar)",
        origenDetalle: { patente: v.patente, vtvVence: v.vtvVence, plantilla: "recordatorio_vtv_v1" },
        sector: "VERIFICACIONES",
        sectorEtiqueta: SECTOR_ETIQUETA.VERIFICACIONES,
        intencion: "CONSULTA", vehiculo, servicio: "VTV · Verificación Técnica Vehicular",
        estado: "BOT",
      },
      payload: payloadEntrante(texto, false),
      etapas: [{
        nombre: "Envío saliente",
        detalle: `Plantilla recordatorio_vtv_v1 · categoría UTILITY · APPROVED. Costo de este envío: USD ${radar.campana.tarifaUtility}.`,
      }],
      validacion: "sin_validar",
    });
    setVista("chat");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <>
      <header className="sticky top-0 z-20 flex h-[58px] items-center gap-4 bg-tinta px-4 text-white sm:px-5">
        <div className="flex items-center gap-2.5 font-semibold tracking-tight">
          <span className="h-2.5 w-2.5 rounded-full bg-wa-claro shadow-[0_0_0_3px_rgba(37,211,102,.22)]" />
          AutoCRM
        </div>
        <nav className="ml-auto flex gap-0.5">
          {VISTAS.map(([v, etiqueta]) => (
            <button
              key={v}
              onClick={() => setVista(v)}
              aria-current={vista === v}
              className={`rounded-lg px-3 py-1.5 text-[13.5px] font-medium transition sm:px-4 sm:text-sm ${
                vista === v
                  ? "bg-white/15 text-white"
                  : "text-gris2 hover:bg-white/5 hover:text-white"
              }`}
            >
              {etiqueta}
            </button>
          ))}
        </nav>
      </header>

      <div className="flex items-center gap-2.5 border-b border-amber-200 bg-amber-100 px-4 py-2 text-[13px] text-amber-900 sm:px-5 sm:text-[13.5px]">
        <span aria-hidden>⚠️</span>
        <span>
          <strong className="font-semibold">1 de octubre de 2026:</strong> Meta
          empieza a cobrar los mensajes de servicio dentro de la ventana de
          24&nbsp;h. Esta arquitectura ya está preparada.
        </span>
      </div>

      <main className="mx-auto max-w-[1280px] px-3.5 py-5 pb-14 sm:px-5">
        {vista === "radar" && <Radar onCampana={lanzarCampana} />}
        {vista === "chat" && <Conversacion estado={chat} setEstado={setChat} />}
        {vista === "whatsapp" && <Arquitectura />}
      </main>
    </>
  );
}
