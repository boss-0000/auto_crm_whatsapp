"""Acceso de solo lectura al catalogo. Una sola conexion, sin escrituras."""
from __future__ import annotations

import json
import sqlite3
import unicodedata
from functools import lru_cache
from pathlib import Path
from typing import Any

RAIZ = Path(__file__).resolve().parent.parent
DB_PATH = RAIZ / "data" / "catalog.db"
RADAR_PATH = RAIZ / "data" / "radar.json"


def sin_acentos(texto: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFD", texto or "")
                   if unicodedata.category(c) != "Mn").lower().strip()


@lru_cache(maxsize=1)
def conexion() -> sqlite3.Connection:
    """SQLite en modo lectura. check_same_thread=False: FastAPI usa threadpool."""
    if not DB_PATH.exists():
        raise RuntimeError(
            f"Falta {DB_PATH}. Corre 'python -m scripts.seed' antes de arrancar.")
    cx = sqlite3.connect(f"file:{DB_PATH}?mode=ro", uri=True, check_same_thread=False)
    cx.row_factory = sqlite3.Row
    return cx


@lru_cache(maxsize=1)
def parametros() -> dict[str, Any]:
    filas = conexion().execute("SELECT clave, valor FROM parametros").fetchall()
    out: dict[str, Any] = {}
    for f in filas:
        v = f["valor"]
        try:
            out[f["clave"]] = int(v)
        except ValueError:
            try:
                out[f["clave"]] = float(v)
            except ValueError:
                out[f["clave"]] = v
    return out


@lru_cache(maxsize=1)
def radar() -> dict[str, Any]:
    return json.loads(RADAR_PATH.read_text(encoding="utf-8"))


@lru_cache(maxsize=1)
def servicios() -> list[dict[str, Any]]:
    filas = conexion().execute(
        "SELECT codigo, nombre, categoria, horas_mano_obra, precio_fijo, descripcion"
        " FROM servicios ORDER BY categoria, codigo").fetchall()
    return [dict(f) for f in filas]


def servicio(codigo: str) -> dict[str, Any] | None:
    f = conexion().execute(
        "SELECT codigo, nombre, categoria, horas_mano_obra, precio_fijo, descripcion"
        " FROM servicios WHERE codigo = ?", (codigo,)).fetchone()
    return dict(f) if f else None


@lru_cache(maxsize=1)
def marcas_modelos() -> list[dict[str, Any]]:
    filas = conexion().execute(
        "SELECT id, marca, modelo, anio_desde, anio_hasta, segmento, busqueda"
        " FROM catalogo_vehiculos ORDER BY marca, modelo").fetchall()
    return [dict(f) for f in filas]


def buscar_modelo(marca: str | None, modelo: str | None) -> dict[str, Any] | None:
    """Resuelve texto libre contra el catalogo. Devuelve None si no hay match claro."""
    objetivo = sin_acentos(f"{marca or ''} {modelo or ''}")
    if not objetivo:
        return None
    tokens = [t for t in objetivo.split() if t]
    mejor, mejor_score = None, 0
    for c in marcas_modelos():
        campo = c["busqueda"]
        score = sum(len(t) for t in tokens if t in campo)
        # Match exacto de modelo completo pesa mas que tokens sueltos.
        if sin_acentos(c["modelo"]) in objetivo:
            score += 10
        if score > mejor_score:
            mejor, mejor_score = c, score
    return mejor if mejor_score >= 3 else None


def vehiculo_por_patente(patente: str) -> dict[str, Any] | None:
    f = conexion().execute(
        "SELECT v.id, v.patente, v.anio, v.km_actual, v.vtv_vence,"
        " v.ultimo_service_fecha, v.ultimo_service_km, v.verificacion_pendiente,"
        " c.marca, c.modelo, c.segmento, cl.nombre AS cliente"
        " FROM vehiculos v"
        " JOIN catalogo_vehiculos c ON c.id = v.catalogo_id"
        " JOIN clientes cl ON cl.id = v.cliente_id"
        " WHERE UPPER(v.patente) = UPPER(?)", (patente.strip(),)).fetchone()
    return dict(f) if f else None


def vehiculo_vtv_por_vencer(offset: int = 0) -> dict[str, Any] | None:
    """Un caso real del radar, para que la campana del demo use datos de la base."""
    from datetime import date, timedelta
    hoy = date.today().isoformat()
    limite = (date.today() + timedelta(days=60)).isoformat()
    f = conexion().execute(
        "SELECT v.patente, v.anio, v.vtv_vence, c.marca, c.modelo,"
        " cl.nombre AS cliente, cl.telefono"
        " FROM vehiculos v"
        " JOIN catalogo_vehiculos c ON c.id = v.catalogo_id"
        " JOIN clientes cl ON cl.id = v.cliente_id"
        " WHERE v.vtv_vence BETWEEN ? AND ?"
        " ORDER BY v.vtv_vence LIMIT 1 OFFSET ?", (hoy, limite, offset)).fetchone()
    return dict(f) if f else None


def repuestos_de(codigo_servicio: str) -> list[dict[str, Any]]:
    filas = conexion().execute(
        "SELECT r.sku, r.nombre, r.precio_base, sr.cantidad"
        " FROM servicio_repuestos sr"
        " JOIN repuestos r ON r.sku = sr.repuesto_sku"
        " WHERE sr.servicio_codigo = ?"
        " ORDER BY r.nombre", (codigo_servicio,)).fetchall()
    return [dict(f) for f in filas]
