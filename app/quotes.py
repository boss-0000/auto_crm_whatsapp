"""
Motor de presupuestos DETERMINISTICO.

El LLM nunca calcula ni inventa un precio. Extrae parametros
(marca, modelo, anio, servicio) y este modulo hace el resto con SQL contra
la lista de precios. Cada presupuesto viaja con el SQL que lo produjo, para
poder mostrarlo en pantalla.
"""
from __future__ import annotations

from dataclasses import dataclass, field, asdict
from typing import Any

from . import db

REDONDEO = 100  # los presupuestos se redondean al centenar de pesos


def _redondear(valor: float) -> int:
    return int(round(valor / REDONDEO) * REDONDEO)


@dataclass
class Item:
    tipo: str          # "mano_obra" | "repuesto"
    detalle: str
    cantidad: float
    unitario: int
    subtotal: int


@dataclass
class Presupuesto:
    servicio_codigo: str
    servicio_nombre: str
    categoria: str
    descripcion: str
    vehiculo: str
    segmento: str
    items: list[Item] = field(default_factory=list)
    subtotal: int = 0
    iva: int = 0
    total: int = 0
    moneda: str = "ARS"
    vigencia_dias: int = 7
    fecha_lista_precios: str = ""
    nota: str = ""
    sql: list[str] = field(default_factory=list)

    def dict(self) -> dict[str, Any]:
        d = asdict(self)
        d["items"] = [asdict(i) if not isinstance(i, dict) else i for i in self.items]
        return d

    def valores_permitidos(self) -> set[int]:
        """Todo numero que el LLM puede mencionar sin estar inventando."""
        ok = {self.subtotal, self.iva, self.total, self.vigencia_dias}
        for i in self.items:
            ok.update({i.unitario, i.subtotal, int(i.cantidad)})
        return {v for v in ok if v}


def cotizar(codigo_servicio: str, catalogo: dict[str, Any],
            anio: int | None = None) -> Presupuesto | None:
    """Presupuesto itemizado para un servicio sobre un modelo del catalogo."""
    srv = db.servicio(codigo_servicio)
    if srv is None:
        return None

    p = db.parametros()
    segmento = catalogo["segmento"]
    f_mo = float(p.get(f"factor_mano_obra_{segmento}", 1.0))
    f_rep = float(p.get(f"factor_repuestos_{segmento}", 1.0))
    valor_hora = int(p["valor_hora_mano_obra"])
    alicuota = float(p["iva"])

    etiqueta = f"{catalogo['marca']} {catalogo['modelo']}".strip()
    if etiqueta and anio:
        etiqueta += f" {anio}"

    pres = Presupuesto(
        servicio_codigo=srv["codigo"],
        servicio_nombre=srv["nombre"],
        categoria=srv["categoria"],
        descripcion=srv["descripcion"],
        vehiculo=etiqueta,
        segmento=segmento,
        moneda=str(p.get("moneda", "ARS")),
        vigencia_dias=int(p.get("vigencia_presupuesto_dias", 7)),
        fecha_lista_precios=str(p.get("fecha_lista_precios", "")),
    )
    pres.sql.append(
        "SELECT codigo, nombre, horas_mano_obra, precio_fijo FROM servicios "
        f"WHERE codigo = '{srv['codigo']}';")

    # Los tramites de verificacion (VTV, verificacion policial, grabado) se
    # cobran a arancel fijo y publicado: ese precio ya es final, no lleva IVA
    # encima. Los servicios de taller con precio cerrado si lo llevan.
    es_arancel = srv["precio_fijo"] is not None and srv["categoria"] == "VERIFICACIONES"

    if srv["precio_fijo"] is not None:
        neto = _redondear(int(srv["precio_fijo"]))
        pres.items.append(Item("arancel" if es_arancel else "servicio",
                               srv["nombre"], 1, neto, neto))
    else:
        horas = float(srv["horas_mano_obra"])
        if horas > 0:
            unit = _redondear(valor_hora * f_mo)
            total_mo = _redondear(unit * horas)
            pres.items.append(
                Item("mano_obra", f"Mano de obra ({horas:g} h x {segmento})",
                     horas, unit, total_mo))
            pres.sql.append(
                "SELECT valor FROM parametros WHERE clave IN "
                f"('valor_hora_mano_obra','factor_mano_obra_{segmento}');")

        repuestos = db.repuestos_de(srv["codigo"])
        if repuestos:
            pres.sql.append(
                "SELECT r.sku, r.nombre, r.precio_base, sr.cantidad "
                "FROM servicio_repuestos sr JOIN repuestos r ON r.sku = sr.repuesto_sku "
                f"WHERE sr.servicio_codigo = '{srv['codigo']}';")
        for r in repuestos:
            unit = _redondear(r["precio_base"] * f_rep)
            pres.items.append(
                Item("repuesto", f"{r['nombre']} [{r['sku']}]",
                     r["cantidad"], unit, unit * r["cantidad"]))

    if not pres.items:
        return None

    pres.subtotal = sum(i.subtotal for i in pres.items)
    if es_arancel:
        pres.iva = 0
        pres.total = pres.subtotal
        pres.nota = "Arancel oficial, precio final."
    else:
        pres.iva = _redondear(pres.subtotal * alicuota)
        pres.total = pres.subtotal + pres.iva
    return pres


def formato_ars(n: int) -> str:
    return f"{n:,}".replace(",", ".")


def texto_presupuesto(p: Presupuesto) -> str:
    """Version en texto plano, la que ve el cliente final en WhatsApp."""
    encabezado = f"*{p.servicio_nombre}*"
    if p.vehiculo:
        encabezado += f" - {p.vehiculo}"
    lineas = [encabezado, ""]
    for i in p.items:
        if i.tipo == "repuesto" and i.cantidad > 1:
            lineas.append(f"- {i.detalle} x{int(i.cantidad)}: "
                          f"$ {formato_ars(i.subtotal)}")
        else:
            lineas.append(f"- {i.detalle}: $ {formato_ars(i.subtotal)}")
    lineas.append("")
    if p.iva:
        lineas.append(f"Subtotal: $ {formato_ars(p.subtotal)}")
        lineas.append(f"IVA: $ {formato_ars(p.iva)}")
    lineas.append(f"*TOTAL: $ {formato_ars(p.total)}*")
    lineas.append("")
    if p.nota:
        lineas.append(p.nota)
    lineas.append(f"Presupuesto valido por {p.vigencia_dias} dias.")
    return "\n".join(lineas)
