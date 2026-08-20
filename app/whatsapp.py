"""
Integracion con WhatsApp Cloud API.

Cubre las cuatro piezas reales de la integracion:
  1. Handshake de verificacion del webhook (GET con hub.challenge).
  2. Validacion de firma X-Hub-Signature-256 (HMAC-SHA256 sobre el body crudo).
  3. Parseo del webhook entrante, incluido el objeto referral de los anuncios
     Click-to-WhatsApp (ctwa_clid).
  4. Envio de mensajes por POST /{phone_number_id}/messages.

Las credenciales viven en memoria y nunca se persisten ni se devuelven al
navegador: el token se guarda enmascarado para mostrar.
"""
from __future__ import annotations

import hashlib
import hmac
import json
import os
from collections import deque
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any

import httpx

VERSION_API = os.getenv("GRAPH_API_VERSION", "v22.0")
GRAFO = "https://graph.facebook.com"

# Ultimos payloads reales vistos, para el visor de la interfaz.
BITACORA: deque[dict[str, Any]] = deque(maxlen=25)


@dataclass
class Credenciales:
    phone_number_id: str = ""
    waba_id: str = ""
    token: str = ""
    app_secret: str = ""
    verify_token: str = ""
    display_phone_number: str = ""
    verificado: bool = False
    conectado_en: str = ""

    @property
    def activa(self) -> bool:
        return bool(self.phone_number_id and self.token)

    def publico(self) -> dict[str, Any]:
        """Version segura para el navegador: sin token ni app secret."""
        return {
            "conectado": self.activa and self.verificado,
            "phone_number_id": self.phone_number_id,
            "waba_id": self.waba_id,
            "display_phone_number": self.display_phone_number,
            "token_enmascarado": (self.token[:8] + "..." + self.token[-4:]
                                  if len(self.token) > 14 else ""),
            "firma_activa": bool(self.app_secret),
            "conectado_en": self.conectado_en,
        }


CREDENCIALES = Credenciales(verify_token=os.getenv("WHATSAPP_VERIFY_TOKEN", ""))


# --------------------------------------------------------------------------
# 1. Handshake de verificacion
# --------------------------------------------------------------------------
def verificar_handshake(modo: str | None, token: str | None,
                        challenge: str | None) -> str | None:
    """
    Meta llama GET con hub.mode / hub.verify_token / hub.challenge.

    Hay que devolver el challenge como TEXTO PLANO, no como JSON: es el error
    clasico que hace fallar la verificacion en el dashboard.
    """
    esperado = CREDENCIALES.verify_token or os.getenv("WHATSAPP_VERIFY_TOKEN", "")
    if modo == "subscribe" and token and esperado and hmac.compare_digest(
            token, esperado):
        return challenge or ""
    return None


# --------------------------------------------------------------------------
# 2. Validacion de firma
# --------------------------------------------------------------------------
def validar_firma(cuerpo: bytes, cabecera: str | None) -> bool:
    """
    HMAC-SHA256 del body CRUDO con el app secret.

    Se compara con compare_digest para no filtrar informacion por tiempos.
    Si no hay app secret cargado, no se puede validar y se deja pasar
    (el demo lo marca en pantalla como firma no verificada).
    """
    if not CREDENCIALES.app_secret:
        return True
    if not cabecera or not cabecera.startswith("sha256="):
        return False
    esperada = hmac.new(CREDENCIALES.app_secret.encode(), cuerpo,
                        hashlib.sha256).hexdigest()
    return hmac.compare_digest(esperada, cabecera[7:])


# --------------------------------------------------------------------------
# 3. Parseo del webhook
# --------------------------------------------------------------------------
@dataclass
class MensajeEntrante:
    wa_id: str = ""              # telefono del cliente
    nombre: str = ""
    texto: str = ""
    mensaje_id: str = ""         # wamid...
    timestamp: str = ""
    tipo: str = "text"
    phone_number_id: str = ""
    referral: dict[str, Any] = field(default_factory=dict)
    crudo: dict[str, Any] = field(default_factory=dict)

    @property
    def origen(self) -> str:
        """De donde vino el lead, segun el objeto referral de Meta."""
        st = self.referral.get("source_type")
        if st == "ad":
            return "Anuncio Click-to-WhatsApp"
        if st == "post":
            return "Publicacion de Facebook/Instagram"
        return "WhatsApp directo"


def parsear(payload: dict[str, Any]) -> MensajeEntrante | None:
    """Extrae el primer mensaje de texto del webhook. None si no lo hay."""
    try:
        value = payload["entry"][0]["changes"][0]["value"]
        mensajes = value.get("messages") or []
        if not mensajes:
            return None  # status update (sent/delivered/read), no es un mensaje
        m = mensajes[0]
        if m.get("type") != "text":
            return None
        contactos = value.get("contacts") or [{}]
        return MensajeEntrante(
            wa_id=m.get("from", ""),
            nombre=(contactos[0].get("profile") or {}).get("name", ""),
            texto=(m.get("text") or {}).get("body", ""),
            mensaje_id=m.get("id", ""),
            timestamp=m.get("timestamp", ""),
            tipo=m.get("type", "text"),
            phone_number_id=(value.get("metadata") or {}).get("phone_number_id", ""),
            referral=m.get("referral") or {},
            crudo=payload,
        )
    except (KeyError, IndexError, TypeError):
        return None


def registrar(direccion: str, payload: Any, nota: str = "") -> None:
    BITACORA.appendleft({
        "direccion": direccion,           # "entrante" | "saliente"
        "momento": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "nota": nota,
        "payload": payload,
    })


# --------------------------------------------------------------------------
# 4. Envio de mensajes
# --------------------------------------------------------------------------
def enviar_texto(destino: str, texto: str) -> dict[str, Any]:
    """POST /{phone_number_id}/messages. Devuelve la respuesta de Meta."""
    if not CREDENCIALES.activa:
        raise RuntimeError("no hay credenciales cargadas")
    url = f"{GRAFO}/{VERSION_API}/{CREDENCIALES.phone_number_id}/messages"
    cuerpo = {
        "messaging_product": "whatsapp",
        "recipient_type": "individual",
        "to": destino,
        "type": "text",
        "text": {"preview_url": False, "body": texto},
    }
    registrar("saliente", {"url": url, "body": cuerpo}, "POST /messages")
    with httpx.Client(timeout=20) as cx:
        r = cx.post(url, json=cuerpo,
                    headers={"Authorization": f"Bearer {CREDENCIALES.token}"})
    try:
        datos = r.json()
    except ValueError:
        datos = {"error": "respuesta no-JSON", "status": r.status_code}
    registrar("saliente", datos, f"HTTP {r.status_code}")
    return datos


def probar_credenciales() -> tuple[bool, str]:
    """GET al numero para validar token + phone_number_id antes de guardar."""
    url = f"{GRAFO}/{VERSION_API}/{CREDENCIALES.phone_number_id}"
    try:
        with httpx.Client(timeout=15) as cx:
            r = cx.get(url, params={"fields": "display_phone_number,verified_name"},
                       headers={"Authorization": f"Bearer {CREDENCIALES.token}"})
        datos = r.json()
    except Exception as exc:
        return False, f"No se pudo contactar a Meta: {exc}"
    if r.status_code != 200:
        msg = (datos.get("error") or {}).get("message", f"HTTP {r.status_code}")
        return False, msg
    CREDENCIALES.display_phone_number = datos.get("display_phone_number", "")
    return True, datos.get("verified_name", "numero verificado")


# --------------------------------------------------------------------------
# Payload de referencia para el modo simulador
# --------------------------------------------------------------------------
def payload_referencia(texto: str, con_anuncio: bool = True) -> dict[str, Any]:
    """
    Estructura documentada del webhook de Cloud API.

    Se usa SOLO en modo simulador y la interfaz lo etiqueta como referencia.
    Cuando hay un numero conectado, el visor muestra el payload real recibido.
    """
    mensaje: dict[str, Any] = {
        "from": "5491133334444",
        "id": "wamid.HBgNNTQ5MTEzMzMzNDQ0NBUCABIYFjNBMEE5RjQ4RDdBQzBBQjBFMzBB",
        "timestamp": str(int(datetime.now(timezone.utc).timestamp())),
        "type": "text",
        "text": {"body": texto},
    }
    if con_anuncio:
        mensaje["referral"] = {
            "source_url": "https://fb.me/2xYzAbCd",
            "source_id": "120210000000000000",
            "source_type": "ad",
            "headline": "VTV sin fila - turno en el dia",
            "body": "Sacate la VTV esta semana. Reserva por WhatsApp.",
            "media_type": "image",
            "ctwa_clid": "ARAaBcDeFgHiJkLmNoPqRsTuVwXyZ0123456789abcdef",
        }
    return {
        "object": "whatsapp_business_account",
        "entry": [{
            "id": "102290129340398",
            "changes": [{
                "value": {
                    "messaging_product": "whatsapp",
                    "metadata": {
                        "display_phone_number": "541150000000",
                        "phone_number_id": "106540352242922",
                    },
                    "contacts": [{
                        "profile": {"name": "Cliente"},
                        "wa_id": "5491133334444",
                    }],
                    "messages": [mensaje],
                },
                "field": "messages",
            }],
        }],
    }
