"use client";

import radar from "@/data/radar.json";

const ars = (n: number) => `$ ${n.toLocaleString("es-AR")}`;
const usd = (n: number) => `USD ${n.toFixed(2)}`;
const miles = (n: number) => n.toLocaleString("es-AR");

export default function Radar({ onCampana }: { onCampana: () => void }) {
  const c = radar.campana;
  const factor = (c.costoMarketing / c.costoUtility).toFixed(1);

  return (
    <div className="surge">
      <header className="mb-5">
        <h1 className="text-[15px] font-medium text-gris">
          Radar de vencimientos · base de {miles(radar.totalRegistros)} registros
        </h1>
        <div className="my-1.5 text-[clamp(2rem,6vw,3.2rem)] font-bold leading-none tracking-tight">
          {ars(radar.recuperableTotal)}{" "}
          <span className="text-[0.42em] font-medium tracking-normal text-gris">
            recuperables
          </span>
        </div>
        <p className="max-w-[62ch] text-sm text-gris">
          Facturación recuperable estimada sobre la base que ya tenés. No es plata
          nueva: son clientes cargados hace años que tienen un vencimiento encima.
        </p>
      </header>

      <div className="my-5 grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
        {radar.segmentos.map((s) => (
          <div
            key={s.clave}
            className="flex flex-col gap-2 rounded-xl border border-linea bg-white p-[17px] sombra-tarjeta"
          >
            <h3 className="text-[13.5px] font-semibold leading-snug text-tinta3">
              {s.titulo}
            </h3>
            <div className="text-[31px] font-bold leading-none tracking-tight">
              {miles(s.cantidad)}
            </div>
            <div className="text-[12.5px] text-gris">{s.detalle}</div>
            <div className="mt-1 flex flex-col gap-0.5 border-t border-dashed border-linea pt-2">
              <span className="font-mono text-[11.5px] text-tinta3">
                {miles(s.cantidad)} × {ars(s.ticketPromedio)} ×{" "}
                {(s.conversion * 100).toFixed(0)}%
              </span>
              <span className="text-[15px] font-semibold text-ok">
                {ars(s.recuperable)}
              </span>
            </div>
            <div className="text-xs italic text-gris">{s.porque}</div>
          </div>
        ))}
      </div>

      <div className="grid items-center gap-4 rounded-xl border border-linea bg-white p-[19px] sombra-tarjeta md:grid-cols-[1fr_auto]">
        <div>
          <h3 className="mb-1 text-[15px] font-semibold">
            Campaña de recordatorio de VTV
          </h3>
          <p className="text-[13.5px] text-gris">
            Se envía como plantilla <strong>utility</strong>, no marketing. Es un
            recordatorio sobre un trámite del propio cliente, así que califica — y
            cuesta {factor} veces menos sobre la misma lista.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-5">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wider text-gris2">
                Como utility
              </div>
              <div className="text-[19px] font-bold tracking-tight text-ok">
                {usd(c.costoUtility)}
              </div>
            </div>
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wider text-gris2">
                Como marketing
              </div>
              <div className="text-[19px] font-bold tracking-tight text-gris line-through decoration-[1.5px]">
                {usd(c.costoMarketing)}
              </div>
            </div>
            <div className="self-center rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[12.5px] font-semibold text-emerald-800">
              {factor}× más barato · {miles(c.contactos)} contactos
            </div>
          </div>
        </div>
        <button
          onClick={onCampana}
          className="rounded-lg bg-wa px-5 py-3 text-[14.5px] font-semibold text-white transition hover:-translate-y-px hover:bg-[#0a7166]"
        >
          Lanzar campaña →
        </button>
      </div>

      <p className="mt-4 max-w-[70ch] text-xs leading-relaxed text-gris2">
        Los precios y las tasas de conversión son valores de referencia del mercado
        argentino. Se reemplazan por los datos reales del taller sin tocar una línea
        de código: viven en la lista de precios, no en la lógica.
      </p>
    </div>
  );
}
