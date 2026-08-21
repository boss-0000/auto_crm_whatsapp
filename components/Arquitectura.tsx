"use client";

import { useState } from "react";
import radar from "@/data/radar.json";
import { VERSION_API, payloadEntrante } from "@/lib/whatsapp";

const usd = (n: number) => `USD ${n.toFixed(2)}`;
const miles = (n: number) => n.toLocaleString("es-AR");

const PIEZAS = [
  {
    titulo: "Verificación del webhook",
    detalle:
      "Meta llama con hub.mode, hub.verify_token y hub.challenge. Hay que devolver el challenge en TEXTO PLANO, no en JSON: es el error que más veces rompe la verificación en el dashboard.",
  },
  {
    titulo: "Firma X-Hub-Signature-256",
    detalle:
      "HMAC-SHA256 del cuerpo crudo con el App Secret, comparado en tiempo constante. Sin esto cualquiera puede POSTear mensajes falsos a tu webhook.",
  },
  {
    titulo: "Respuesta inmediata, trabajo en segundo plano",
    detalle:
      "El webhook contesta 200 al instante y genera la respuesta aparte. Meta reintenta si el endpoint tarda, y una respuesta con IA tarda segundos: contestar primero evita mensajes duplicados.",
  },
  {
    titulo: "Atribución con ctwa_clid",
    detalle:
      "Cuando el lead entra desde un anuncio Click-to-WhatsApp, Meta agrega el objeto referral con el ctwa_clid. Guardándolo se cierra el círculo: qué anuncio trajo qué venta.",
  },
];

export default function Arquitectura() {
  const [ver, setVer] = useState(false);
  const c = radar.campana;
  const payload = payloadEntrante("¿Cuánto sale la VTV?");

  return (
    <div className="surge grid gap-4 lg:grid-cols-2">
      <div className="flex flex-col gap-4">
        <section className="rounded-xl border border-linea bg-white p-5 sombra-tarjeta">
          <h2 className="mb-1 text-base font-semibold">Cómo se conecta a WhatsApp</h2>
          <p className="mb-4 text-[13.5px] text-gris">
            Esta demo corre sobre el simulador web para que puedas probarla sin
            configurar nada. El sistema de producción se conecta a tu número ya
            aprobado por Meta: mismo motor, mismo CRM, el canal cambia.
          </p>
          <div className="flex flex-col gap-3">
            {PIEZAS.map((p, i) => (
              <div key={p.titulo} className="grid grid-cols-[24px_1fr] gap-3">
                <span className="grid h-6 w-6 place-items-center rounded-full bg-tinta text-xs font-semibold text-white">
                  {i + 1}
                </span>
                <div className="text-[13.5px] leading-relaxed">
                  <b className="font-semibold">{p.titulo}.</b>{" "}
                  <span className="text-gris">{p.detalle}</span>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-xl border border-amber-200 bg-amber-50 p-5">
          <h3 className="mb-1.5 text-[15px] font-semibold text-amber-900">
            1 de octubre de 2026: cambia el costo
          </h3>
          <p className="text-[13.5px] leading-relaxed text-amber-900/90">
            Meta empieza a cobrar los mensajes de servicio dentro de la ventana de
            24&nbsp;horas — las respuestas del bot, que hoy son gratis. Cae justo en
            la mitad de un desarrollo que arranque ahora.
          </p>
          <p className="mt-2.5 text-[13.5px] leading-relaxed text-amber-900/90">
            Por eso conviene que los leads entren por anuncios{" "}
            <strong>Click-to-WhatsApp</strong>: mantienen 72&nbsp;horas de
            conversación gratis, antes y después de octubre.
          </p>
        </section>
      </div>

      <div className="flex flex-col gap-4">
        <section className="rounded-xl border border-linea bg-white p-5 sombra-tarjeta">
          <h3 className="mb-1 text-[15px] font-semibold">
            Plantillas: utility vs marketing
          </h3>
          <p className="mb-3 text-[13.5px] text-gris">
            Un recordatorio de VTV es un aviso sobre un trámite del propio cliente,
            así que califica como <strong>utility</strong>. La misma lista enviada
            como <strong>marketing</strong> cuesta 5 veces más.
          </p>
          <div className="overflow-hidden rounded-lg border border-linea">
            <table className="w-full text-[13px]">
              <thead className="bg-slate-50 text-left text-[11px] uppercase tracking-wider text-gris2">
                <tr>
                  <th className="px-3 py-2 font-semibold">Categoría</th>
                  <th className="px-3 py-2 font-semibold">Tarifa AR</th>
                  <th className="px-3 py-2 text-right font-semibold">
                    {miles(c.contactos)} contactos
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-t border-linea">
                  <td className="px-3 py-2 font-medium">Utility</td>
                  <td className="px-3 py-2 tabular-nums text-gris">{usd(c.tarifaUtility)}</td>
                  <td className="px-3 py-2 text-right font-semibold tabular-nums text-ok">
                    {usd(c.costoUtility)}
                  </td>
                </tr>
                <tr className="border-t border-linea">
                  <td className="px-3 py-2 font-medium">Marketing</td>
                  <td className="px-3 py-2 tabular-nums text-gris">{usd(c.tarifaMarketing)}</td>
                  <td className="px-3 py-2 text-right font-semibold tabular-nums text-gris line-through">
                    {usd(c.costoMarketing)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="mt-2.5 text-xs text-gris2">
            Tarifas de Argentina vigentes a agosto de 2026, por conversación.
          </p>
        </section>

        <section className="overflow-hidden rounded-xl border border-linea bg-white sombra-tarjeta">
          <div className="p-5 pb-3">
            <h3 className="mb-1 text-[15px] font-semibold">Webhook entrante</h3>
            <p className="text-[13.5px] text-gris">
              La estructura exacta que parsea el sistema, con el objeto{" "}
              <code className="rounded bg-slate-100 px-1 py-0.5 font-mono text-xs">referral</code>{" "}
              de un anuncio Click-to-WhatsApp.
            </p>
            <button
              onClick={() => setVer((v) => !v)}
              className="mt-2 text-xs font-medium text-acento hover:underline"
            >
              {ver ? "Ocultar JSON ▴" : `Ver JSON · Cloud API ${VERSION_API} ▾`}
            </button>
          </div>
          {ver && (
            <pre className="max-h-[340px] overflow-auto bg-tinta p-4 text-[10.5px] leading-relaxed text-slate-200">
              {JSON.stringify(payload.cuerpo, null, 2)}
            </pre>
          )}
        </section>
      </div>
    </div>
  );
}
