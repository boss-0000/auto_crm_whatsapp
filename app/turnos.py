"""Disponibilidad de turnos. Deterministica: el LLM no inventa horarios."""
from __future__ import annotations

from datetime import date, datetime, timedelta

# Agenda del taller. En produccion sale de la tabla de turnos del cliente.
HORARIOS = {
    "VERIFICACIONES": ["08:30", "10:00", "11:30", "14:00", "15:30"],
    "SERVICIO_TECNICO": ["08:00", "09:30", "13:30", "16:00"],
    "VENTAS": ["10:00", "12:00", "16:00"],
}
DIAS = ["lunes", "martes", "miercoles", "jueves", "viernes", "sabado", "domingo"]


def _habil(d: date) -> bool:
    return d.weekday() < 5  # lun-vie


def proximos(sector: str, cantidad: int = 3,
             desde: date | None = None) -> list[dict[str, str]]:
    """Primeros turnos libres para un sector, saltando fines de semana."""
    horarios = HORARIOS.get(sector, HORARIOS["SERVICIO_TECNICO"])
    hoy = desde or date.today()
    salida: list[dict[str, str]] = []
    dia = hoy + timedelta(days=1)
    while len(salida) < cantidad and (dia - hoy).days <= 14:
        if _habil(dia):
            for h in horarios:
                if len(salida) >= cantidad:
                    break
                salida.append({
                    "fecha": dia.isoformat(),
                    "hora": h,
                    "etiqueta": f"{DIAS[dia.weekday()]} {dia.day:02d}/{dia.month:02d}"
                                f" a las {h}",
                })
        dia += timedelta(days=1)
    return salida


def texto_turnos(turnos: list[dict[str, str]]) -> str:
    return "\n".join(f"{i}. {t['etiqueta']}" for i, t in enumerate(turnos, 1))
