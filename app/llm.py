"""
Adaptador de proveedor de LLM.

El resto del sistema no sabe que modelo hay detras. Solo pide dos cosas:
extraer JSON con un esquema, y redactar texto. Eso permite correr el demo con
el tier gratuito de Gemini y pasar a Anthropic cuando haya presupuesto, sin
tocar la logica de negocio.

Lo que NO cambia con el proveedor:
  - los precios los calcula SQL, nunca el modelo;
  - el guardarrail numerico valida la salida igual;
  - si el proveedor falla, se responde con las plantillas deterministicas.

Cualquier error se guarda en ULTIMO_ERROR y se expone en /healthz: sin eso,
un fallo del modelo se ve identico a "no hay key" y no hay forma de depurarlo.
"""
from __future__ import annotations

import json
import os
from typing import Any

import httpx

TIEMPO_LIMITE = 45.0

# Ultimo fallo del proveedor, para diagnostico desde /healthz.
ULTIMO_ERROR: dict[str, Any] = {}


def _registrar_error(etapa: str, detalle: str) -> None:
    ULTIMO_ERROR.clear()
    ULTIMO_ERROR.update({"etapa": etapa, "detalle": detalle[:300]})


def _key_gemini() -> str:
    return os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY") or ""


def proveedor() -> str:
    """anthropic | gemini | ninguno. LLM_PROVIDER fuerza uno concreto."""
    forzado = os.getenv("LLM_PROVIDER", "auto").strip().lower()
    if forzado in ("anthropic", "gemini", "ninguno"):
        return forzado
    if os.getenv("ANTHROPIC_API_KEY"):
        return "anthropic"
    if _key_gemini():
        return "gemini"
    return "ninguno"


def modelo(rol: str) -> str:
    """rol: 'extraccion' | 'redaccion'."""
    p = proveedor()
    if rol == "extraccion":
        return os.getenv("MODEL_EXTRACT") or (
            "gemini-2.5-flash-lite" if p == "gemini" else "claude-haiku-4-5")
    return os.getenv("MODEL_COMPOSE") or (
        "gemini-2.5-flash" if p == "gemini" else "claude-opus-5")


def estado() -> dict[str, Any]:
    return {
        "proveedor": proveedor(),
        "modelo_extraccion": modelo("extraccion"),
        "modelo_redaccion": modelo("redaccion"),
        "ultimo_error": ULTIMO_ERROR or None,
    }


# --------------------------------------------------------------------------
# Gemini (REST) — https://generativelanguage.googleapis.com
# --------------------------------------------------------------------------
BASE_GEMINI = "https://generativelanguage.googleapis.com/v1beta/models"

_TIPOS = {"object": "OBJECT", "string": "STRING", "integer": "INTEGER",
          "number": "NUMBER", "boolean": "BOOLEAN", "array": "ARRAY"}


def _esquema_gemini(esquema: dict[str, Any]) -> dict[str, Any]:
    """
    Traduce JSON Schema al subconjunto OpenAPI que acepta Gemini.

    Gemini usa tipos en mayuscula y rechaza additionalProperties.
    """
    fuera: dict[str, Any] = {}
    for clave, valor in esquema.items():
        if clave == "additionalProperties":
            continue
        if clave == "type" and isinstance(valor, str):
            fuera["type"] = _TIPOS.get(valor, valor.upper())
        elif clave == "properties":
            fuera["properties"] = {k: _esquema_gemini(v) for k, v in valor.items()}
        elif clave == "items":
            fuera["items"] = _esquema_gemini(valor)
        else:
            fuera[clave] = valor
    if fuera.get("type") == "OBJECT" and "properties" in fuera:
        fuera.setdefault("propertyOrdering", list(fuera["properties"].keys()))
    return fuera


def _pedir_gemini(sistema: str, prompt: str, max_tokens: int,
                  esquema: dict[str, Any] | None) -> str | None:
    cuerpo: dict[str, Any] = {
        "systemInstruction": {"parts": [{"text": sistema}]},
        "contents": [{"role": "user", "parts": [{"text": prompt}]}],
        "generationConfig": {"maxOutputTokens": max_tokens},
    }
    if esquema is not None:
        cuerpo["generationConfig"]["responseMimeType"] = "application/json"
        cuerpo["generationConfig"]["responseSchema"] = _esquema_gemini(esquema)

    nombre = modelo("extraccion" if esquema is not None else "redaccion")
    url = f"{BASE_GEMINI}/{nombre}:generateContent"
    try:
        with httpx.Client(timeout=TIEMPO_LIMITE) as cx:
            r = cx.post(url, json=cuerpo,
                        headers={"x-goog-api-key": _key_gemini()})
    except Exception as exc:
        _registrar_error("gemini:red", f"{type(exc).__name__}: {exc}")
        return None

    if r.status_code != 200:
        _registrar_error(f"gemini:http{r.status_code}", r.text)
        return None
    try:
        datos = r.json()
        cand = datos["candidates"][0]
        # MAX_TOKENS deja la respuesta cortada: mejor descartarla.
        if cand.get("finishReason") not in (None, "STOP"):
            _registrar_error("gemini:corte", str(cand.get("finishReason")))
            return None
        partes = cand["content"]["parts"]
        return "".join(p.get("text", "") for p in partes).strip()
    except (KeyError, IndexError, ValueError) as exc:
        _registrar_error("gemini:formato", f"{type(exc).__name__}: {r.text[:200]}")
        return None


# --------------------------------------------------------------------------
# Anthropic
# --------------------------------------------------------------------------
def _pedir_anthropic(sistema: str, prompt: str, max_tokens: int,
                     esquema: dict[str, Any] | None) -> str | None:
    try:
        from anthropic import Anthropic
        cliente = Anthropic()
        extra: dict[str, Any] = {}
        if esquema is not None:
            extra["output_config"] = {
                "format": {"type": "json_schema", "schema": esquema}}
        else:
            extra["output_config"] = {"effort": "low"}
        r = cliente.messages.create(
            model=modelo("extraccion" if esquema is not None else "redaccion"),
            max_tokens=max_tokens,
            system=[{"type": "text", "text": sistema,
                     "cache_control": {"type": "ephemeral"}}],
            messages=[{"role": "user", "content": prompt}],
            **extra)
        if r.stop_reason == "refusal":
            _registrar_error("anthropic:refusal", str(r.stop_details))
            return None
        return "".join(b.text for b in r.content if b.type == "text").strip()
    except Exception as exc:
        _registrar_error("anthropic", f"{type(exc).__name__}: {exc}")
        return None


# --------------------------------------------------------------------------
# API publica
# --------------------------------------------------------------------------
def generar_texto(sistema: str, prompt: str, max_tokens: int = 1200) -> str | None:
    p = proveedor()
    if p == "gemini":
        return _pedir_gemini(sistema, prompt, max_tokens, None)
    if p == "anthropic":
        return _pedir_anthropic(sistema, prompt, max_tokens, None)
    return None


def generar_json(sistema: str, prompt: str, esquema: dict[str, Any],
                 max_tokens: int = 800) -> dict[str, Any] | None:
    p = proveedor()
    if p == "gemini":
        crudo = _pedir_gemini(sistema, prompt, max_tokens, esquema)
    elif p == "anthropic":
        crudo = _pedir_anthropic(sistema, prompt, max_tokens, esquema)
    else:
        return None
    if not crudo:
        return None
    try:
        return json.loads(crudo)
    except ValueError:
        _registrar_error(f"{p}:json", crudo[:200])
        return None
