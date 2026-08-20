"""
Capa de interpretacion: clasifica el sector y extrae parametros.

El modelo NO decide precios ni disponibilidad. Devuelve un objeto tipado con
los datos que necesita el motor de presupuestos. El codigo de servicio sale de
un enum construido desde la base: el modelo elige de tu catalogo o no elige.

Si falta la API key o la llamada falla, cae a un extractor por reglas para que
el demo nunca quede mudo.
"""
from __future__ import annotations

import json
import os
import re
from dataclasses import dataclass, asdict
from typing import Any

from . import db, llm

SECTORES = ["VENTAS", "VERIFICACIONES", "SERVICIO_TECNICO", "OTRO"]
INTENCIONES = ["PRESUPUESTO", "TURNO", "CONSULTA", "ESCALAR", "SALUDO", "CIERRE"]

SISTEMA = """Sos el clasificador de un taller y centro de verificacion automotor \
en Argentina. Recibis un mensaje de WhatsApp de un cliente y devolves datos \
estructurados.

Reglas:
- Nunca inventes precios, plazos ni disponibilidad. Tu unica tarea es extraer datos.
- servicio_codigo tiene que salir de la lista provista. Si ninguno corresponde \
claramente, devolve cadena vacia.
- VERIFICACIONES cubre VTV, verificacion policial del automotor y grabado de \
autopartes. SERVICIO_TECNICO cubre el taller (service, frenos, distribucion, \
embrague, bateria, aire). VENTAS cubre consultas comerciales, repuestos sueltos \
y compra de vehiculos.
- Si el cliente pide hablar con una persona, se queja, reclama o el pedido excede \
lo que un bot deberia resolver, intencion = ESCALAR.
- Considera el historial: si el modelo o el anio ya se dijeron antes, repetilos.
- Escribi marca y modelo tal como los usa el mercado argentino (ej: "Volkswagen", \
"Gol Trend").
- Si el dato no esta, devolve cadena vacia o 0. No adivines."""


@dataclass
class Extraccion:
    sector: str = "OTRO"
    intencion: str = "CONSULTA"
    servicio_codigo: str = ""
    marca: str = ""
    modelo: str = ""
    anio: int = 0
    km: int = 0
    patente: str = ""
    confianza: str = "baja"
    motor: str = "llm"   # "llm" | "reglas"

    def dict(self) -> dict[str, Any]:
        return asdict(self)


def _esquema() -> dict[str, Any]:
    codigos = [s["codigo"] for s in db.servicios()]
    return {
        "type": "object",
        "properties": {
            "sector": {"type": "string", "enum": SECTORES},
            "intencion": {"type": "string", "enum": INTENCIONES},
            "servicio_codigo": {"type": "string", "enum": [*codigos, ""]},
            "marca": {"type": "string"},
            "modelo": {"type": "string"},
            "anio": {"type": "integer"},
            "km": {"type": "integer"},
            "patente": {"type": "string"},
            "confianza": {"type": "string", "enum": ["alta", "media", "baja"]},
        },
        "required": ["sector", "intencion", "servicio_codigo", "marca", "modelo",
                     "anio", "km", "patente", "confianza"],
        "additionalProperties": False,
    }


def _catalogo_para_prompt() -> str:
    lineas = []
    for s in db.servicios():
        lineas.append(f"- {s['codigo']} ({s['categoria']}): {s['nombre']}."
                      f" {s['descripcion']}")
    return "\n".join(lineas)


# --------------------------------------------------------------------------
# Fallback por reglas (sin API key o ante error de red)
# --------------------------------------------------------------------------
PALABRAS = [
    ("VTV", ["vtv", "verificacion tecnica", "verificación técnica", "revision tecnica"]),
    ("VERIF_POL", ["verificacion policial", "verificación policial", "transferencia",
                   "grabado de chasis", "numero de motor"]),
    ("GRABADO", ["grabado", "autopartes"]),
    ("SRV10", ["service de 10", "10.000", "10000 km"]),
    ("SRV40", ["service mayor", "40.000", "40000 km"]),
    ("SRV20", ["service", "20.000", "20000 km"]),
    ("ACEITE", ["aceite", "cambio de aceite"]),
    ("FRENOS_D", ["freno", "frenos", "pastilla", "disco"]),
    ("DISTRIB", ["distribucion", "distribución", "correa"]),
    ("EMBRAGUE", ["embrague", "clutch"]),
    ("AMORT_D", ["amortiguador", "suspension", "suspensión"]),
    ("BATERIA_C", ["bateria", "batería"]),
    ("ALINEACION", ["alineacion", "alineación", "balanceo", "tren delantero"]),
    ("AIRE_AC", ["aire acondicionado", "climatizador", "no enfria"]),
]
ESCALAR = ["hablar con", "una persona", "un humano", "asesor", "reclamo", "queja",
           "gerente", "encargado", "me estafaron", "denuncia"]


def extraer_por_reglas(mensaje: str, previo: Extraccion | None = None) -> Extraccion:
    txt = db.sin_acentos(mensaje)
    e = Extraccion(motor="reglas", confianza="baja")
    if previo:
        e.marca, e.modelo = previo.marca, previo.modelo
        e.anio, e.km, e.patente = previo.anio, previo.km, previo.patente
        # El sector y el servicio persisten hasta que el cliente cambie de tema:
        # "y la VTV?" -> "dale, sacame turno" tiene que agendar en Verificaciones.
        e.sector, e.servicio_codigo = previo.sector, previo.servicio_codigo

    if any(p in txt for p in ESCALAR):
        e.intencion, e.sector = "ESCALAR", previo.sector if previo else "OTRO"
        return e

    for codigo, claves in PALABRAS:
        if any(k in txt for k in claves):
            srv = db.servicio(codigo)
            e.servicio_codigo, e.sector = codigo, srv["categoria"]
            e.intencion = "PRESUPUESTO"
            e.confianza = "media"
            break

    # Modelo mas largo primero: "Gol Trend" tiene que ganarle a "Gol",
    # y "Corsa Classic" a "Corsa".
    for c in sorted(db.marcas_modelos(), key=lambda x: -len(x["modelo"])):
        if db.sin_acentos(c["modelo"]) in txt:
            e.marca, e.modelo = c["marca"], c["modelo"]
            break

    if (m := re.search(r"\b(19[89]\d|20[0-2]\d)\b", txt)):
        e.anio = int(m.group(1))
    if (m := re.search(r"\b(\d{2,3})\.?(\d{3})\s*(?:km|kilometros)", txt)):
        e.km = int(m.group(1) + m.group(2))
    if (m := re.search(r"\b([a-z]{3}\d{3}|[a-z]{2}\d{3}[a-z]{2})\b", txt)):
        e.patente = m.group(1).upper()

    if any(k in txt for k in ["turno", "cuando puedo", "horario", "agenda",
                              "sacar turno", "reservar"]):
        e.intencion = "TURNO"
    elif any(k in txt for k in ["cuanto sale", "cuanto cuesta", "cuanto es",
                                "precio", "presupuesto", "cotiza", "vale"]):
        e.intencion = "PRESUPUESTO"
    elif len(txt) <= 30 and any(k in txt for k in ["gracias", "perfecto",
                                                    "barbaro", "dale gracias",
                                                    "listo", "buenisimo"]):
        e.intencion = "CIERRE"
    elif e.intencion == "CONSULTA" and len(txt) <= 25 and any(
            txt.startswith(k) for k in ["hola", "buenas", "buen dia", "que tal",
                                        "hey", "holis"]):
        e.intencion = "SALUDO"
    return e


# --------------------------------------------------------------------------
# Extraccion con LLM
# --------------------------------------------------------------------------
def extraer(mensaje: str, historial: list[dict[str, str]] | None = None,
            previo: Extraccion | None = None) -> Extraccion:
    """Clasifica y extrae. Cae a reglas si no hay proveedor o si falla."""
    if llm.proveedor() == "ninguno":
        return extraer_por_reglas(mensaje, previo)

    contexto = ""
    if historial:
        turnos = "\n".join(f"{h['rol']}: {h['texto']}" for h in historial[-8:])
        contexto = f"\n\nHistorial reciente de la conversacion:\n{turnos}"

    prompt = (f"Catalogo de servicios disponibles:\n{_catalogo_para_prompt()}"
              f"{contexto}\n\nMensaje nuevo del cliente:\n{mensaje}")

    datos = llm.generar_json(SISTEMA, prompt, _esquema())
    if not datos:
        return extraer_por_reglas(mensaje, previo)

    base = Extraccion().dict()
    e = Extraccion(motor="llm", **{k: datos.get(k, v) for k, v in base.items()
                                   if k != "motor"})
    # El modelo puede omitir datos que ya estaban en la conversacion.
    if previo:
        e.marca = e.marca or previo.marca
        e.modelo = e.modelo or previo.modelo
        e.anio = e.anio or previo.anio
        e.km = e.km or previo.km
        e.patente = e.patente or previo.patente
        if e.sector == "OTRO":
            e.sector = previo.sector
    return e
