"""
Redaccion de la respuesta + guardarrail numerico.

El LLM redacta, pero solo puede usar numeros que salieron de la base. Despues
de generar, se validan todos los importes del mensaje contra el conjunto de
valores permitidos del presupuesto. Si aparece un numero que no salio de un
SELECT, el mensaje NO se envia: cae al texto plano determinista.

Guardamos numeros >= 1000 (importes, kilometrajes, anios). Los menores son
cantidades, horas y dias, y no representan riesgo de precio inventado.
"""
from __future__ import annotations

import os
import re
from dataclasses import dataclass, field
from datetime import date
from typing import Any

from . import quotes, turnos
from .nlu import Extraccion

MODELO_REDACCION = os.getenv("MODEL_COMPOSE", "claude-opus-5")
UMBRAL_IMPORTE = 1000

SISTEMA = """Sos el asistente de WhatsApp de un taller y centro de verificacion \
automotor en Argentina. Escribis en castellano rioplatense, de vos, natural y \
breve, como escribe una persona del mostrador.

REGLA ABSOLUTA: los unicos numeros que podes escribir son los que aparecen en \
los DATOS que te paso. No calcules, no estimes, no redondees, no inventes \
precios, plazos ni disponibilidad. Si un dato no esta, no lo menciones.

Formato WhatsApp: sin encabezados markdown, sin tablas. Podes usar *negrita* \
con asteriscos simples y guiones para listar. Maximo 6 lineas salvo que estes \
pasando un presupuesto itemizado.

No saludes de nuevo si la conversacion ya empezo. Cerra con una sola pregunta \
concreta que haga avanzar al cliente."""


@dataclass
class Respuesta:
    texto: str
    tipo: str
    motor: str = "llm"           # "llm" | "plantilla"
    validacion: str = "ok"       # "ok" | "sin_validar" | "rechazado"
    numeros_rechazados: list[int] = field(default_factory=list)

    def dict(self) -> dict[str, Any]:
        return {
            "texto": self.texto, "tipo": self.tipo, "motor": self.motor,
            "validacion": self.validacion,
            "numeros_rechazados": self.numeros_rechazados,
        }


# --------------------------------------------------------------------------
# Guardarrail numerico
# --------------------------------------------------------------------------
def numeros_de(texto: str) -> list[tuple[int, bool]]:
    """
    Devuelve (valor, es_importe). En AR el punto es separador de miles.

    Un numero precedido por '$' o seguido de 'peso' es un IMPORTE y se valida
    contra la lista de precios y nada mas. El resto (kilometrajes, anios,
    cantidades) se valida contra un conjunto mas amplio.
    """
    salida: list[tuple[int, bool]] = []
    for m in re.finditer(r"\d[\d.]*", texto):
        limpio = m.group(0).rstrip(".").replace(".", "")
        if not limpio.isdigit():
            continue
        antes = texto[max(0, m.start() - 12):m.start()]
        despues = texto[m.end():m.end() + 10].lower()
        es_importe = bool(re.search(r"[$]\s*$", antes)) or despues.lstrip().startswith(
            ("peso", "ars"))
        salida.append((int(limpio), es_importe))
    return salida


def validar(texto: str, importes: set[int],
            generales: set[int]) -> tuple[bool, list[int]]:
    """importes = valores del presupuesto. generales = + km, anios, referencias."""
    malos = set()
    for valor, es_importe in numeros_de(texto):
        if valor < UMBRAL_IMPORTE:
            continue
        if valor not in (importes if es_importe else generales):
            malos.add(valor)
    return (not malos), sorted(malos)


def _permitidos(presupuesto: quotes.Presupuesto | None,
                ext: Extraccion) -> tuple[set[int], set[int]]:
    """(importes, generales). Un '$' solo puede ir seguido de un importe."""
    importes: set[int] = set()
    if presupuesto:
        importes |= presupuesto.valores_permitidos()

    generales = set(importes)
    if ext.anio:
        generales.add(ext.anio)
    if ext.km:
        generales.add(ext.km)
    anio = date.today().year
    generales |= {anio, anio + 1}
    # Kilometrajes de referencia que nombran los propios servicios
    # ("service de 20.000 km"). Nunca validos como importe.
    generales |= {10_000, 20_000, 40_000}
    return importes, generales


# --------------------------------------------------------------------------
# Plantillas deterministas (fallback y referencia para el LLM)
# --------------------------------------------------------------------------
def plantilla(tipo: str, ext: Extraccion,
              presupuesto: quotes.Presupuesto | None,
              slots: list[dict[str, str]] | None) -> str:
    if tipo == "presupuesto" and presupuesto:
        return (quotes.texto_presupuesto(presupuesto)
                + "\n\nQueres que te reserve un turno?")
    if tipo == "faltan_datos":
        falta = "el modelo y el ano del vehiculo" if not ext.modelo else "el ano"
        srv = ""
        if ext.servicio_codigo:
            from . import db
            s = db.servicio(ext.servicio_codigo)
            srv = f" para {s['nombre'].lower()}" if s else ""
        return f"Para pasarte el presupuesto{srv} necesito {falta}. Me lo decis?"
    if tipo == "turno" and slots:
        return ("Tengo estos turnos disponibles:\n"
                + turnos.texto_turnos(slots)
                + "\n\nCual te sirve?")
    if tipo == "escalar":
        return ("Te paso con un asesor del equipo. En un rato te escriben por"
                " este mismo chat.")
    if tipo == "cierre":
        return "Dale, cualquier cosa escribime por aca. Buen dia!"
    if tipo == "saludo":
        return ("Hola! Soy el asistente del taller. Te puedo pasar presupuestos,"
                " sacar turno de VTV o verificacion, y agendar service."
                " Que necesitas?")
    return ("Eso te lo confirma mejor un asesor. Queres que te derive con"
            " alguien del equipo?")


# --------------------------------------------------------------------------
# Redaccion
# --------------------------------------------------------------------------
def _cliente():
    from anthropic import Anthropic
    return Anthropic()


def _datos_para_llm(tipo: str, ext: Extraccion,
                    presupuesto: quotes.Presupuesto | None,
                    slots: list[dict[str, str]] | None) -> str:
    partes = [f"Situacion: {tipo}", f"Sector: {ext.sector}"]
    if ext.marca or ext.modelo:
        partes.append(f"Vehiculo: {ext.marca} {ext.modelo} {ext.anio or ''}".strip())
    if presupuesto:
        partes.append("Presupuesto calculado por el sistema (usar estos numeros"
                      " exactos, no recalcular):")
        partes.append(quotes.texto_presupuesto(presupuesto))
    if slots:
        partes.append("Turnos libres (no inventar otros):")
        partes.append(turnos.texto_turnos(slots))
    if tipo == "faltan_datos":
        faltan = [n for n, v in [("modelo", ext.modelo), ("anio", ext.anio)] if not v]
        partes.append(f"Faltan estos datos para cotizar: {', '.join(faltan)}."
                      " Pedilos en una sola pregunta.")
    if tipo == "escalar":
        partes.append("Hay que derivar a un asesor humano. Avisale al cliente"
                      " con naturalidad, sin disculpas largas.")
    if tipo == "fuera_de_alcance":
        partes.append("La consulta no la cubre el catalogo. Ofrece derivar a un"
                      " asesor. No inventes una respuesta tecnica.")
    return "\n".join(partes)


def responder(tipo: str, ext: Extraccion,
              presupuesto: quotes.Presupuesto | None = None,
              slots: list[dict[str, str]] | None = None,
              historial: list[dict[str, str]] | None = None) -> Respuesta:
    """Redacta la respuesta y la valida. Nunca devuelve un precio inventado."""
    respaldo = plantilla(tipo, ext, presupuesto, slots)

    if not os.getenv("ANTHROPIC_API_KEY"):
        return Respuesta(respaldo, tipo, motor="plantilla", validacion="sin_validar")

    contexto = ""
    if historial:
        turnos_txt = "\n".join(f"{h['rol']}: {h['texto']}" for h in historial[-6:])
        contexto = f"\n\nConversacion hasta ahora:\n{turnos_txt}"

    prompt = (f"DATOS:\n{_datos_para_llm(tipo, ext, presupuesto, slots)}"
              f"{contexto}\n\nRedacta el proximo mensaje del asistente.")

    try:
        r = _cliente().messages.create(
            model=MODELO_REDACCION,
            max_tokens=2000,
            output_config={"effort": "low"},
            system=[{"type": "text", "text": SISTEMA,
                     "cache_control": {"type": "ephemeral"}}],
            messages=[{"role": "user", "content": prompt}],
        )
        if r.stop_reason == "refusal":
            return Respuesta(respaldo, tipo, motor="plantilla",
                             validacion="sin_validar")
        texto = "\n".join(b.text for b in r.content if b.type == "text").strip()
    except Exception:
        return Respuesta(respaldo, tipo, motor="plantilla", validacion="sin_validar")

    if not texto:
        return Respuesta(respaldo, tipo, motor="plantilla", validacion="sin_validar")

    ok, malos = validar(texto, *_permitidos(presupuesto, ext))
    if not ok:
        # El modelo escribio un importe que no salio de la base: se descarta.
        return Respuesta(respaldo, tipo, motor="plantilla",
                         validacion="rechazado", numeros_rechazados=malos)
    return Respuesta(texto, tipo, motor="llm", validacion="ok")
