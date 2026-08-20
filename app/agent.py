"""
Orquestador de la conversacion.

Decide QUE responder (ruteo determinista) y delega el COMO a compose.
Devuelve tambien la ficha del lead que se pinta en el panel del CRM.
"""
from __future__ import annotations

import uuid
from dataclasses import dataclass, field, asdict
from datetime import datetime, timezone
from typing import Any

from . import compose, db, quotes, turnos
from .nlu import Extraccion, extraer

# Servicios que se cotizan sin conocer el vehiculo: el arancel es fijo.
# No tiene sentido preguntar marca y modelo para dar el precio de la VTV.
def _requiere_vehiculo(srv: dict[str, Any]) -> bool:
    return srv["precio_fijo"] is None


SECTOR_ETIQUETA = {
    "VENTAS": "Ventas",
    "VERIFICACIONES": "Verificaciones",
    "SERVICIO_TECNICO": "Servicio Tecnico",
    "OTRO": "Sin clasificar",
}


@dataclass
class Lead:
    id: str
    telefono: str = ""
    nombre: str = ""
    origen: str = "WhatsApp directo"
    origen_detalle: dict[str, Any] = field(default_factory=dict)
    sector: str = "OTRO"
    sector_etiqueta: str = "Sin clasificar"
    intencion: str = ""
    vehiculo: str = ""
    servicio: str = ""
    estado: str = "BOT"          # BOT | REQUIERE_HUMANO
    presupuesto: dict[str, Any] | None = None
    creado: str = ""
    actualizado: str = ""

    def dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass
class Conversacion:
    id: str = field(default_factory=lambda: uuid.uuid4().hex[:12])
    historial: list[dict[str, str]] = field(default_factory=list)
    ultima_extraccion: Extraccion | None = None
    lead: Lead | None = None

    def nuevo_lead(self, telefono: str, nombre: str, origen: str,
                   detalle: dict[str, Any] | None = None) -> Lead:
        ahora = datetime.now(timezone.utc).isoformat(timespec="seconds")
        self.lead = Lead(id=self.id, telefono=telefono, nombre=nombre,
                         origen=origen, origen_detalle=detalle or {},
                         creado=ahora, actualizado=ahora)
        return self.lead


def _stub_catalogo() -> dict[str, Any]:
    """Vehiculo generico para tramites de arancel fijo."""
    return {"marca": "", "modelo": "", "segmento": "chico"}


def procesar_stream(conv: Conversacion, mensaje: str):
    """
    Igual que procesar(), pero emitiendo las etapas del pipeline.

    La interfaz las muestra en vivo: clasificar (LLM) -> cotizar (SQL) ->
    redactar (LLM) -> validar. Es la arquitectura hecha visible.
    """
    yield {"evento": "etapa", "nombre": "clasificando",
           "detalle": "Interpretando el mensaje y extrayendo parametros"}
    ext = extraer(mensaje, conv.historial, conv.ultima_extraccion)
    yield {"evento": "extraccion", "datos": ext.dict()}

    conv.historial.append({"rol": "cliente", "texto": mensaje})

    presupuesto: quotes.Presupuesto | None = None
    slots: list[dict[str, str]] | None = None
    srv = db.servicio(ext.servicio_codigo) if ext.servicio_codigo else None

    if ext.intencion == "ESCALAR":
        tipo = "escalar"
    elif ext.intencion == "SALUDO":
        tipo = "saludo"
    elif ext.intencion == "CIERRE":
        tipo = "cierre"
    elif ext.intencion == "TURNO":
        sector = ext.sector
        if sector == "OTRO" and conv.lead:
            sector = conv.lead.sector
        slots = turnos.proximos(sector if sector != "OTRO" else "SERVICIO_TECNICO")
        tipo = "turno"
    elif ext.intencion == "PRESUPUESTO" and srv is not None:
        catalogo = db.buscar_modelo(ext.marca, ext.modelo)
        if _requiere_vehiculo(srv) and catalogo is None:
            tipo = "faltan_datos"
        else:
            presupuesto = quotes.cotizar(
                srv["codigo"], catalogo or _stub_catalogo(), ext.anio or None)
            tipo = "presupuesto" if presupuesto else "fuera_de_alcance"
    else:
        tipo = "fuera_de_alcance"

    if presupuesto is not None:
        yield {"evento": "etapa", "nombre": "cotizando",
               "detalle": "Precio calculado con SQL contra la lista, sin LLM",
               "sql": presupuesto.sql}
    elif slots:
        yield {"evento": "etapa", "nombre": "agenda",
               "detalle": "Turnos leidos de la agenda, no generados por el modelo"}

    yield {"evento": "etapa", "nombre": "redactando",
           "detalle": "El modelo redacta usando solo los datos del sistema"}
    respuesta = compose.responder(tipo, ext, presupuesto, slots, conv.historial)

    yield {"evento": "etapa", "nombre": "validando",
           "detalle": ("Todos los importes coinciden con la base"
                       if respuesta.validacion == "ok" else
                       "Se detecto un importe fuera de la base: mensaje descartado"
                       if respuesta.validacion == "rechazado" else
                       "Respuesta deterministica (sin LLM)"),
           "resultado": respuesta.validacion,
           "rechazados": respuesta.numeros_rechazados}

    conv.historial.append({"rol": "asistente", "texto": respuesta.texto})
    conv.ultima_extraccion = ext

    lead = conv.lead or conv.nuevo_lead("", "Cliente", "Simulador web")
    lead.sector = ext.sector if ext.sector != "OTRO" else lead.sector
    lead.sector_etiqueta = SECTOR_ETIQUETA.get(lead.sector, "Sin clasificar")
    lead.intencion = ext.intencion
    if ext.marca or ext.modelo:
        lead.vehiculo = f"{ext.marca} {ext.modelo} {ext.anio or ''}".strip()
    if srv:
        lead.servicio = srv["nombre"]
    if tipo == "escalar":
        lead.estado = "REQUIERE_HUMANO"
    if presupuesto:
        lead.presupuesto = presupuesto.dict()
    lead.actualizado = datetime.now(timezone.utc).isoformat(timespec="seconds")

    yield {
        "evento": "final",
        "datos": {
            "respuesta": respuesta.dict(),
            "extraccion": ext.dict(),
            "presupuesto": presupuesto.dict() if presupuesto else None,
            "lead": lead.dict(),
            "tipo": tipo,
        },
    }


def procesar(conv: Conversacion, mensaje: str) -> dict[str, Any]:
    """Un turno completo. Consume el stream y devuelve solo el resultado."""
    for evento in procesar_stream(conv, mensaje):
        if evento["evento"] == "final":
            return evento["datos"]
    raise RuntimeError("el pipeline no emitio evento final")
