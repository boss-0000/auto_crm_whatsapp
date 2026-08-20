"""
AutoCRM WhatsApp - API del demo.

Arranque local:
    python -m scripts.seed
    uvicorn app.main:app --reload
"""
from __future__ import annotations

import json
import os
import uuid
from collections import OrderedDict
from datetime import date, datetime, timezone
from pathlib import Path

from fastapi import BackgroundTasks, Body, FastAPI, Query, Request
from fastapi.responses import (FileResponse, JSONResponse, PlainTextResponse,
                               Response, StreamingResponse)
from fastapi.staticfiles import StaticFiles

from . import db, quotes, whatsapp
from .agent import Conversacion, procesar, procesar_stream
from .nlu import Extraccion

RAIZ = Path(__file__).resolve().parent.parent
STATIC = RAIZ / "static"

# El endpoint es publico: el cliente controla lo que manda, asi que se acota.
MAX_MENSAJE = int(os.getenv("MAX_MESSAGE_CHARS", "500"))
MAX_TURNOS = int(os.getenv("MAX_HISTORY_TURNS", "12"))
MAX_CONVERSACIONES = 300

app = FastAPI(title="AutoCRM WhatsApp", docs_url=None, redoc_url=None)

# Estado en memoria. Render free mantiene un unico proceso vivo, asi que
# alcanza para el demo; en produccion esto es Postgres.
_SESIONES: "OrderedDict[str, Conversacion]" = OrderedDict()
# Conversaciones que entran por WhatsApp real, indexadas por telefono.
_POR_TELEFONO: dict[str, Conversacion] = {}


def sesion(conversacion_id: str | None) -> Conversacion:
    if conversacion_id and conversacion_id in _SESIONES:
        conv = _SESIONES.pop(conversacion_id)
        _SESIONES[conversacion_id] = conv
        return conv
    conv = Conversacion()
    _SESIONES[conv.id] = conv
    while len(_SESIONES) > MAX_CONVERSACIONES:
        _SESIONES.popitem(last=False)
    return conv


def recortar(conv: Conversacion) -> None:
    if len(conv.historial) > MAX_TURNOS * 2:
        conv.historial = conv.historial[-MAX_TURNOS * 2:]


# --------------------------------------------------------------------------
# Salud y datos
# --------------------------------------------------------------------------
@app.get("/healthz")
def healthz() -> dict[str, object]:
    """Ping del uptime monitor: mantiene vivo el free tier de Render."""
    return {"ok": True, "registros": db.radar()["total_registros"],
            "sesiones": len(_SESIONES)}


@app.get("/api/radar")
def api_radar() -> dict[str, object]:
    return db.radar()


@app.get("/api/catalogo")
def api_catalogo() -> dict[str, object]:
    return {
        "servicios": db.servicios(),
        "modelos": [{k: v for k, v in m.items() if k != "busqueda"}
                    for m in db.marcas_modelos()],
        "parametros": db.parametros(),
    }


# --------------------------------------------------------------------------
# Conversacion
# --------------------------------------------------------------------------
@app.get("/api/chat/stream")
def api_chat_stream(mensaje: str = Query(..., max_length=MAX_MENSAJE),
                    conversacion_id: str | None = Query(None)) -> StreamingResponse:
    """SSE: emite cada etapa del pipeline y despues el resultado final."""
    conv = sesion(conversacion_id)
    recortar(conv)

    def eventos():
        yield f"data: {json.dumps({'evento': 'inicio', 'conversacion_id': conv.id})}\n\n"
        try:
            for ev in procesar_stream(conv, mensaje.strip()):
                if ev["evento"] == "final":
                    ev["datos"]["conversacion_id"] = conv.id
                    # En modo simulador el visor muestra la estructura documentada
                    # de la Cloud API; con un numero conectado muestra el payload
                    # real que entro por el webhook.
                    ev["datos"]["payload"] = {
                        "real": False,
                        "titulo": f"Estructura de referencia · Cloud API {whatsapp.VERSION_API}",
                        "cuerpo": whatsapp.payload_referencia(mensaje.strip()),
                    }
                yield f"data: {json.dumps(ev, ensure_ascii=False)}\n\n"
        except Exception as exc:  # el demo nunca se queda mudo
            fallo = {"evento": "error", "detalle": str(exc)[:200]}
            yield f"data: {json.dumps(fallo, ensure_ascii=False)}\n\n"

    return StreamingResponse(eventos(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache",
                                      "X-Accel-Buffering": "no"})


@app.post("/api/chat")
def api_chat(datos: dict = Body(...)) -> dict[str, object]:
    """
    Version sin streaming del mismo pipeline.

    Existe como red de seguridad: algunos proxies bufferean SSE y el chat se
    quedaria colgado. La interfaz usa el stream y cae aca si falla.
    """
    mensaje = str(datos.get("mensaje", ""))[:MAX_MENSAJE].strip()
    if not mensaje:
        return JSONResponse({"error": "mensaje vacio"}, status_code=400)

    conv = sesion(datos.get("conversacion_id"))
    recortar(conv)
    etapas: list[dict] = []
    final: dict = {}
    for ev in procesar_stream(conv, mensaje):
        if ev["evento"] == "etapa":
            etapas.append(ev)
        elif ev["evento"] == "final":
            final = ev["datos"]
    final["conversacion_id"] = conv.id
    final["etapas"] = etapas
    final["payload"] = {
        "real": False,
        "titulo": f"Estructura de referencia · Cloud API {whatsapp.VERSION_API}",
        "cuerpo": whatsapp.payload_referencia(mensaje),
    }
    return final


@app.post("/api/reset")
def api_reset(conversacion_id: str | None = Query(None)) -> dict[str, str]:
    if conversacion_id:
        _SESIONES.pop(conversacion_id, None)
    conv = sesion(None)
    return {"conversacion_id": conv.id}


# --------------------------------------------------------------------------
# Campana desde el radar
# --------------------------------------------------------------------------
PLANTILLA_VTV = (
    "Hola {nombre}! Te escribimos de AutoService.\n\n"
    "La VTV de tu *{vehiculo}* (patente {patente}) vence el {vence}.\n"
    "Tenemos turnos disponibles esta semana.\n\n"
    "Queres que te reserve uno?")


@app.post("/api/campana")
def api_campana(indice: int = Query(0, ge=0, le=50)) -> dict[str, object]:
    """
    Dispara la campana del radar sobre un caso real de la base.

    Devuelve el mensaje saliente (plantilla utility ya aprobada) y el costo
    Meta comparado contra la misma campana categorizada como marketing.
    """
    veh = db.vehiculo_vtv_por_vencer(indice)
    if veh is None:
        return JSONResponse({"error": "sin vehiculos en ventana"}, status_code=404)

    vence = date.fromisoformat(veh["vtv_vence"])
    texto = PLANTILLA_VTV.format(
        nombre=veh["cliente"].split()[0],
        vehiculo=f"{veh['marca']} {veh['modelo']} {veh['anio']}",
        patente=veh["patente"],
        vence=f"{vence.day:02d}/{vence.month:02d}")

    conv = sesion(None)
    lead = conv.nuevo_lead(telefono=veh["telefono"], nombre=veh["cliente"],
                           origen="Campana VTV (radar)",
                           detalle={"patente": veh["patente"],
                                    "vtv_vence": veh["vtv_vence"],
                                    "plantilla": "recordatorio_vtv_v1",
                                    "categoria": "utility"})
    lead.sector = "VERIFICACIONES"
    lead.sector_etiqueta = "Verificaciones"
    lead.vehiculo = f"{veh['marca']} {veh['modelo']} {veh['anio']}"
    conv.historial.append({"rol": "asistente", "texto": texto})

    # El mensaje saliente ya establecio el contexto: si el cliente contesta
    # "si, cuanto sale?", el bot tiene que cotizar la VTV de ESE vehiculo,
    # no volver a preguntar de que se trata.
    conv.ultima_extraccion = Extraccion(
        sector="VERIFICACIONES", intencion="CONSULTA", servicio_codigo="VTV",
        marca=veh["marca"], modelo=veh["modelo"], anio=veh["anio"],
        patente=veh["patente"], confianza="alta", motor="campana")

    campana = db.radar()["campana"]
    return {
        "conversacion_id": conv.id,
        "mensaje": texto,
        "lead": lead.dict(),
        "vehiculo": veh,
        "plantilla": {
            "nombre": "recordatorio_vtv_v1",
            "categoria": "UTILITY",
            "estado": "APPROVED",
            "idioma": "es_AR",
        },
        "costo": campana,
    }


# --------------------------------------------------------------------------
# Conexion con WhatsApp Cloud API
# --------------------------------------------------------------------------
@app.get("/api/conexion")
def api_conexion() -> dict[str, object]:
    return {
        "estado": whatsapp.CREDENCIALES.publico(),
        "webhook_url": "/webhook/whatsapp",
        "verify_token": whatsapp.CREDENCIALES.verify_token,
        "version_api": whatsapp.VERSION_API,
        "bitacora": list(whatsapp.BITACORA)[:10],
    }


@app.post("/api/conectar")
def api_conectar(datos: dict = Body(...)) -> dict[str, object]:
    """
    Carga las credenciales del numero de PRUEBA del cliente.

    Se validan contra Meta antes de darlas por buenas: si el token o el
    phone_number_id estan mal, el error aparece aca y no cinco minutos despues
    cuando el mensaje no llega.
    """
    c = whatsapp.CREDENCIALES
    c.phone_number_id = str(datos.get("phone_number_id", "")).strip()
    c.waba_id = str(datos.get("waba_id", "")).strip()
    c.token = str(datos.get("token", "")).strip()
    c.app_secret = str(datos.get("app_secret", "")).strip()
    if datos.get("verify_token"):
        c.verify_token = str(datos["verify_token"]).strip()
    if not c.verify_token:
        c.verify_token = "autocrm-" + uuid.uuid4().hex[:12]

    if not c.activa:
        c.verificado = False
        return JSONResponse({"ok": False,
                             "detalle": "Faltan phone_number_id o token."},
                            status_code=400)

    ok, detalle = whatsapp.probar_credenciales()
    c.verificado = ok
    c.conectado_en = (datetime.now(timezone.utc).isoformat(timespec="seconds")
                      if ok else "")
    return {"ok": ok, "detalle": detalle, "estado": c.publico(),
            "verify_token": c.verify_token}


@app.post("/api/desconectar")
def api_desconectar() -> dict[str, bool]:
    whatsapp.CREDENCIALES.__init__(  # type: ignore[misc]
        verify_token=os.getenv("WHATSAPP_VERIFY_TOKEN", ""))
    whatsapp.BITACORA.clear()
    return {"ok": True}


# --------------------------------------------------------------------------
# Webhook de Meta
# --------------------------------------------------------------------------
@app.get("/webhook/whatsapp", response_model=None)
def webhook_verificar(
        hub_mode: str | None = Query(None, alias="hub.mode"),
        hub_verify_token: str | None = Query(None, alias="hub.verify_token"),
        hub_challenge: str | None = Query(None, alias="hub.challenge")) -> Response:
    """Meta espera el challenge en TEXTO PLANO, no en JSON."""
    challenge = whatsapp.verificar_handshake(hub_mode, hub_verify_token, hub_challenge)
    if challenge is None:
        return PlainTextResponse("forbidden", status_code=403)
    return PlainTextResponse(challenge, status_code=200)


def _atender(entrante: "whatsapp.MensajeEntrante") -> None:
    """Genera y envia la respuesta. Corre en background: Meta ya recibio su 200."""
    conv = _POR_TELEFONO.get(entrante.wa_id)
    if conv is None:
        conv = Conversacion()
        _POR_TELEFONO[entrante.wa_id] = conv
        _SESIONES[conv.id] = conv
        conv.nuevo_lead(telefono=entrante.wa_id,
                        nombre=entrante.nombre or "Cliente",
                        origen=entrante.origen,
                        detalle=entrante.referral)
    recortar(conv)
    resultado = procesar(conv, entrante.texto)
    try:
        whatsapp.enviar_texto(entrante.wa_id, resultado["respuesta"]["texto"])
    except Exception as exc:
        whatsapp.registrar("saliente", {"error": str(exc)[:200]}, "fallo al enviar")


@app.post("/webhook/whatsapp", response_model=None)
async def webhook_recibir(request: Request, tareas: BackgroundTasks) -> Response:
    """
    Responde 200 de inmediato y procesa aparte.

    Meta reintenta si el webhook tarda, y generar la respuesta con un LLM
    tarda segundos: contestar primero y trabajar despues evita mensajes
    duplicados.
    """
    crudo = await request.body()
    if not whatsapp.validar_firma(crudo, request.headers.get("x-hub-signature-256")):
        whatsapp.registrar("entrante", {"error": "firma invalida"}, "rechazado")
        return PlainTextResponse("firma invalida", status_code=403)

    try:
        payload = json.loads(crudo)
    except ValueError:
        return PlainTextResponse("bad request", status_code=400)

    entrante = whatsapp.parsear(payload)
    whatsapp.registrar("entrante", payload,
                       f"mensaje de {entrante.wa_id}" if entrante else "sin mensaje")
    if entrante and entrante.texto:
        tareas.add_task(_atender, entrante)
    return PlainTextResponse("EVENT_RECEIVED", status_code=200)


# --------------------------------------------------------------------------
# Estatico
# --------------------------------------------------------------------------
@app.get("/", response_model=None)
def index() -> Response:
    idx = STATIC / "index.html"
    if idx.exists():
        return FileResponse(idx)
    return JSONResponse({"estado": "en construccion", "healthz": "/healthz"})


if STATIC.exists():
    app.mount("/static", StaticFiles(directory=STATIC), name="static")
