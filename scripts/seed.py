"""
Genera data/catalog.db (SQLite, solo lectura en runtime) y data/radar.json.

Datos sinteticos con la MISMA FORMA que la base del cliente.
Los precios son placeholders de mercado (AR, mediados 2026): se reemplazan
por la lista real del cliente sin tocar una sola linea de logica.

    python -m scripts.seed
"""
from __future__ import annotations

import json
import random
import sqlite3
import unicodedata
from datetime import date, timedelta
from pathlib import Path

HOY = date(2026, 8, 20)
TOTAL_VEHICULOS = 25_000
RNG = random.Random(20260820)

RAIZ = Path(__file__).resolve().parent.parent
DATA = RAIZ / "data"
DB_PATH = DATA / "catalog.db"
RADAR_PATH = DATA / "radar.json"

# --------------------------------------------------------------------------
# Parametros del taller
# --------------------------------------------------------------------------
PARAMETROS = {
    "valor_hora_mano_obra": 32_000,
    "iva": 0.21,
    "moneda": "ARS",
    "vigencia_presupuesto_dias": 7,
    "fecha_lista_precios": "2026-08-01",
}

# segmento -> (factor mano de obra, factor repuestos)
FACTOR_SEGMENTO = {
    "chico": (1.00, 1.00),
    "mediano": (1.15, 1.15),
    "suv": (1.35, 1.30),
    "pickup": (1.50, 1.45),
    "utilitario": (1.25, 1.20),
}

# --------------------------------------------------------------------------
# Catalogo de vehiculos (mercado argentino)
# --------------------------------------------------------------------------
CATALOGO = [
    ("Volkswagen", "Gol Trend", 2008, 2019, "chico"),
    ("Volkswagen", "Gol", 2000, 2013, "chico"),
    ("Volkswagen", "Suran", 2006, 2019, "mediano"),
    ("Volkswagen", "Voyage", 2009, 2022, "mediano"),
    ("Volkswagen", "Amarok", 2010, 2026, "pickup"),
    ("Volkswagen", "Vento", 2007, 2021, "mediano"),
    ("Volkswagen", "Polo", 2018, 2026, "chico"),
    ("Volkswagen", "T-Cross", 2019, 2026, "suv"),
    ("Chevrolet", "Corsa Classic", 2000, 2016, "chico"),
    ("Chevrolet", "Onix", 2016, 2026, "chico"),
    ("Chevrolet", "Prisma", 2013, 2019, "mediano"),
    ("Chevrolet", "Cruze", 2011, 2026, "mediano"),
    ("Chevrolet", "S10", 2012, 2026, "pickup"),
    ("Chevrolet", "Tracker", 2013, 2026, "suv"),
    ("Fiat", "Palio", 2000, 2017, "chico"),
    ("Fiat", "Cronos", 2018, 2026, "mediano"),
    ("Fiat", "Argo", 2017, 2026, "chico"),
    ("Fiat", "Toro", 2016, 2026, "pickup"),
    ("Fiat", "Strada", 2000, 2026, "pickup"),
    ("Ford", "Fiesta", 2002, 2019, "chico"),
    ("Ford", "Focus", 2004, 2019, "mediano"),
    ("Ford", "Ka", 2011, 2021, "chico"),
    ("Ford", "EcoSport", 2004, 2022, "suv"),
    ("Ford", "Ranger", 2005, 2026, "pickup"),
    ("Toyota", "Etios", 2013, 2024, "chico"),
    ("Toyota", "Corolla", 2004, 2026, "mediano"),
    ("Toyota", "Hilux", 2005, 2026, "pickup"),
    ("Toyota", "SW4", 2006, 2026, "suv"),
    ("Toyota", "Yaris", 2018, 2026, "chico"),
    ("Renault", "Clio", 2000, 2016, "chico"),
    ("Renault", "Sandero", 2008, 2026, "chico"),
    ("Renault", "Logan", 2007, 2026, "mediano"),
    ("Renault", "Duster", 2011, 2026, "suv"),
    ("Renault", "Kangoo", 2000, 2026, "utilitario"),
    ("Peugeot", "206", 2000, 2012, "chico"),
    ("Peugeot", "208", 2012, 2026, "chico"),
    ("Peugeot", "308", 2012, 2022, "mediano"),
    ("Peugeot", "Partner", 2003, 2026, "utilitario"),
    ("Citroen", "C3", 2003, 2026, "chico"),
    ("Citroen", "Berlingo", 2003, 2026, "utilitario"),
    ("Honda", "Civic", 2006, 2026, "mediano"),
    ("Honda", "Fit", 2009, 2020, "chico"),
    ("Nissan", "Frontier", 2010, 2026, "pickup"),
    ("Nissan", "Kicks", 2016, 2026, "suv"),
    ("Nissan", "March", 2011, 2022, "chico"),
]

# --------------------------------------------------------------------------
# Repuestos (precio base = segmento "chico"; se escala por segmento)
# --------------------------------------------------------------------------
REPUESTOS = [
    ("ACE-5W30", "Aceite sintetico 5W30 (litro)", 22_000),
    ("FIL-ACE", "Filtro de aceite", 28_000),
    ("FIL-AIR", "Filtro de aire", 32_000),
    ("FIL-HAB", "Filtro de habitaculo", 35_000),
    ("FIL-COM", "Filtro de combustible", 45_000),
    ("BUJIA", "Bujia de encendido", 18_000),
    ("PAST-DEL", "Pastillas de freno delanteras (juego)", 145_000),
    ("DISC-DEL", "Discos de freno delanteros (par)", 280_000),
    ("PAST-TRA", "Pastillas de freno traseras (juego)", 128_000),
    ("DISC-TRA", "Discos de freno traseros (par)", 245_000),
    ("KIT-DIST", "Kit correa de distribucion", 320_000),
    ("BOM-AGUA", "Bomba de agua", 185_000),
    ("AMORT-DEL", "Amortiguador delantero (unidad)", 175_000),
    ("AMORT-TRA", "Amortiguador trasero (unidad)", 155_000),
    ("BATERIA", "Bateria 12V 60Ah", 260_000),
    ("KIT-EMB", "Kit de embrague", 620_000),
    ("LIQ-FRE", "Liquido de frenos DOT4", 25_000),
    ("REFRIG", "Refrigerante (litro)", 30_000),
    ("GAS-R134", "Gas refrigerante R134a (carga)", 95_000),
]

# codigo, nombre, categoria, horas_mano_obra, precio_fijo|None, descripcion
SERVICIOS = [
    ("SRV10", "Service de 10.000 km", "SERVICIO_TECNICO", 1.5, None,
     "Cambio de aceite y filtro, revision de niveles y 20 puntos de control."),
    ("SRV20", "Service de 20.000 km", "SERVICIO_TECNICO", 2.5, None,
     "Aceite, filtros de aceite, aire y habitaculo, revision general."),
    ("SRV40", "Service mayor de 40.000 km", "SERVICIO_TECNICO", 4.0, None,
     "Service completo con bujias, todos los filtros y liquido de frenos."),
    ("ACEITE", "Cambio de aceite y filtro", "SERVICIO_TECNICO", 1.0, None,
     "Aceite sintetico y filtro de aceite."),
    ("FRENOS_D", "Frenos delanteros", "SERVICIO_TECNICO", 2.0, None,
     "Pastillas y discos delanteros, purgado de circuito."),
    ("FRENOS_T", "Frenos traseros", "SERVICIO_TECNICO", 2.0, None,
     "Pastillas y discos traseros, purgado de circuito."),
    ("DISTRIB", "Cambio de correa de distribucion", "SERVICIO_TECNICO", 5.0, None,
     "Kit de distribucion completo mas bomba de agua."),
    ("EMBRAGUE", "Cambio de embrague", "SERVICIO_TECNICO", 6.0, None,
     "Kit de embrague completo, incluye desmontaje de caja."),
    ("AMORT_D", "Amortiguadores delanteros", "SERVICIO_TECNICO", 3.0, None,
     "Par de amortiguadores delanteros con alineacion posterior."),
    ("BATERIA_C", "Cambio de bateria", "SERVICIO_TECNICO", 0.5, None,
     "Bateria nueva con chequeo de alternador."),
    ("ALINEACION", "Alineacion y balanceo", "SERVICIO_TECNICO", 0.0, 78_000,
     "Alineacion computarizada de las 4 ruedas y balanceo."),
    ("AIRE_AC", "Carga de aire acondicionado", "SERVICIO_TECNICO", 1.0, None,
     "Carga de gas R134a y test de estanqueidad."),
    ("VTV", "VTV - Verificacion Tecnica Vehicular", "VERIFICACIONES", 0.0, 108_000,
     "Inspeccion tecnica obligatoria para vehiculos livianos."),
    ("VTV_PESADO", "VTV vehiculo pesado", "VERIFICACIONES", 0.0, 175_000,
     "Inspeccion tecnica para vehiculos de mas de 3.500 kg."),
    ("VERIF_POL", "Verificacion policial del automotor", "VERIFICACIONES", 0.0, 55_000,
     "Verificacion de numeros de chasis y motor para transferencia."),
    ("GRABADO", "Grabado de autopartes", "VERIFICACIONES", 0.0, 48_000,
     "Grabado obligatorio de cristales y autopartes."),
    ("PRE_VTV", "Pre-VTV (chequeo previo)", "VERIFICACIONES", 1.0, None,
     "Revision de los puntos que evalua la VTV antes del turno oficial."),
]

# servicio -> [(sku, cantidad)]
COMPOSICION = {
    "SRV10":     [("ACE-5W30", 4), ("FIL-ACE", 1)],
    "SRV20":     [("ACE-5W30", 4), ("FIL-ACE", 1), ("FIL-AIR", 1), ("FIL-HAB", 1)],
    "SRV40":     [("ACE-5W30", 5), ("FIL-ACE", 1), ("FIL-AIR", 1), ("FIL-HAB", 1),
                  ("FIL-COM", 1), ("BUJIA", 4), ("LIQ-FRE", 1)],
    "ACEITE":    [("ACE-5W30", 4), ("FIL-ACE", 1)],
    "FRENOS_D":  [("PAST-DEL", 1), ("DISC-DEL", 1), ("LIQ-FRE", 1)],
    "FRENOS_T":  [("PAST-TRA", 1), ("DISC-TRA", 1), ("LIQ-FRE", 1)],
    "DISTRIB":   [("KIT-DIST", 1), ("BOM-AGUA", 1), ("REFRIG", 2)],
    "EMBRAGUE":  [("KIT-EMB", 1)],
    "AMORT_D":   [("AMORT-DEL", 2)],
    "BATERIA_C": [("BATERIA", 1)],
    "AIRE_AC":   [("GAS-R134", 1)],
    "PRE_VTV":   [],
}

NOMBRES = ["Martin", "Sofia", "Diego", "Valentina", "Nicolas", "Camila", "Lucas",
           "Julieta", "Matias", "Agustina", "Federico", "Micaela", "Sebastian",
           "Rocio", "Gonzalo", "Florencia", "Ezequiel", "Carla", "Ramiro", "Luciana",
           "Pablo", "Daniela", "Ignacio", "Brenda", "Hernan", "Paula", "Marcelo",
           "Natalia", "Leandro", "Vanesa"]
APELLIDOS = ["Gomez", "Rodriguez", "Fernandez", "Lopez", "Martinez", "Perez",
             "Garcia", "Sanchez", "Romero", "Sosa", "Torres", "Alvarez", "Ruiz",
             "Benitez", "Acosta", "Medina", "Herrera", "Aguirre", "Pereyra",
             "Gimenez", "Molina", "Silva", "Castro", "Ortiz", "Nunez", "Cabrera",
             "Rios", "Ferrari", "Dominguez", "Vega"]
LETRAS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"


def sin_acentos(texto: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFD", texto)
                   if unicodedata.category(c) != "Mn").lower()


def patente(anio: int) -> str:
    """Formato viejo AAA123 hasta 2015, Mercosur AB123CD desde 2016."""
    L = LETRAS
    if anio < 2016:
        return f"{RNG.choice(L)}{RNG.choice(L)}{RNG.choice(L)}{RNG.randint(100, 999)}"
    return (f"{RNG.choice(L)}{RNG.choice(L)}{RNG.randint(100, 999)}"
            f"{RNG.choice(L)}{RNG.choice(L)}")


def telefono() -> str:
    cod = RNG.choice(["11", "221", "261", "341", "351", "381"])
    return f"549{cod}{RNG.randint(10 ** 6, 10 ** 7 - 1)}"


def crear_esquema(cx: sqlite3.Connection) -> None:
    cx.executescript("""
    DROP TABLE IF EXISTS parametros;
    DROP TABLE IF EXISTS catalogo_vehiculos;
    DROP TABLE IF EXISTS repuestos;
    DROP TABLE IF EXISTS servicios;
    DROP TABLE IF EXISTS servicio_repuestos;
    DROP TABLE IF EXISTS clientes;
    DROP TABLE IF EXISTS vehiculos;

    CREATE TABLE parametros (clave TEXT PRIMARY KEY, valor TEXT NOT NULL);

    CREATE TABLE catalogo_vehiculos (
        id INTEGER PRIMARY KEY,
        marca TEXT NOT NULL,
        modelo TEXT NOT NULL,
        anio_desde INTEGER NOT NULL,
        anio_hasta INTEGER NOT NULL,
        segmento TEXT NOT NULL,
        busqueda TEXT NOT NULL
    );

    CREATE TABLE repuestos (
        sku TEXT PRIMARY KEY,
        nombre TEXT NOT NULL,
        precio_base INTEGER NOT NULL
    );

    CREATE TABLE servicios (
        codigo TEXT PRIMARY KEY,
        nombre TEXT NOT NULL,
        categoria TEXT NOT NULL,
        horas_mano_obra REAL NOT NULL,
        precio_fijo INTEGER,
        descripcion TEXT NOT NULL,
        busqueda TEXT NOT NULL
    );

    CREATE TABLE servicio_repuestos (
        servicio_codigo TEXT NOT NULL REFERENCES servicios(codigo),
        repuesto_sku TEXT NOT NULL REFERENCES repuestos(sku),
        cantidad INTEGER NOT NULL,
        PRIMARY KEY (servicio_codigo, repuesto_sku)
    );

    CREATE TABLE clientes (
        id INTEGER PRIMARY KEY,
        nombre TEXT NOT NULL,
        telefono TEXT NOT NULL,
        creado TEXT NOT NULL
    );

    CREATE TABLE vehiculos (
        id INTEGER PRIMARY KEY,
        cliente_id INTEGER NOT NULL REFERENCES clientes(id),
        catalogo_id INTEGER NOT NULL REFERENCES catalogo_vehiculos(id),
        patente TEXT NOT NULL,
        anio INTEGER NOT NULL,
        km_actual INTEGER NOT NULL,
        vtv_vence TEXT,
        ultimo_service_fecha TEXT,
        ultimo_service_km INTEGER,
        verificacion_pendiente INTEGER NOT NULL DEFAULT 0
    );

    CREATE INDEX idx_veh_vtv ON vehiculos(vtv_vence);
    CREATE INDEX idx_veh_service ON vehiculos(ultimo_service_fecha);
    CREATE INDEX idx_cat_busqueda ON catalogo_vehiculos(busqueda);
    """)


def poblar_catalogos(cx: sqlite3.Connection) -> None:
    # Los factores de segmento son datos de precios, no logica: viven en la
    # base para que el cliente los ajuste sin tocar codigo.
    params = dict(PARAMETROS)
    for seg, (f_mo, f_rep) in FACTOR_SEGMENTO.items():
        params[f"factor_mano_obra_{seg}"] = f_mo
        params[f"factor_repuestos_{seg}"] = f_rep
    cx.executemany("INSERT INTO parametros VALUES (?,?)",
                   [(k, str(v)) for k, v in params.items()])
    cx.executemany(
        "INSERT INTO catalogo_vehiculos (marca,modelo,anio_desde,anio_hasta,segmento,"
        "busqueda) VALUES (?,?,?,?,?,?)",
        [(m, mo, d, h, s, sin_acentos(f"{m} {mo}")) for m, mo, d, h, s in CATALOGO])
    cx.executemany("INSERT INTO repuestos VALUES (?,?,?)", REPUESTOS)
    cx.executemany(
        "INSERT INTO servicios (codigo,nombre,categoria,horas_mano_obra,precio_fijo,"
        "descripcion,busqueda) VALUES (?,?,?,?,?,?,?)",
        [(c, n, cat, h, pf, d, sin_acentos(f"{c} {n} {d}"))
         for c, n, cat, h, pf, d in SERVICIOS])
    cx.executemany(
        "INSERT INTO servicio_repuestos VALUES (?,?,?)",
        [(srv, sku, cant) for srv, items in COMPOSICION.items() for sku, cant in items])


def poblar_flota(cx: sqlite3.Connection) -> None:
    catalogo = cx.execute(
        "SELECT id, anio_desde, anio_hasta FROM catalogo_vehiculos").fetchall()
    clientes, vehiculos = [], []

    for i in range(1, TOTAL_VEHICULOS + 1):
        nombre = f"{RNG.choice(NOMBRES)} {RNG.choice(APELLIDOS)}"
        clientes.append((i, nombre, telefono(),
                         (HOY - timedelta(days=RNG.randint(0, 2200))).isoformat()))

        cat_id, desde, hasta = RNG.choice(catalogo)
        anio = RNG.randint(desde, min(hasta, HOY.year))
        edad = max(HOY.year - anio, 0)
        km = max(min(int(RNG.gauss(edad * 14_000 + 12_000, 22_000)), 480_000), 1_500)

        # VTV: obligatoria desde los 3 anios de antiguedad, vence anualmente.
        vtv = ((HOY + timedelta(days=RNG.randint(-420, 400))).isoformat()
               if edad >= 3 else None)

        # Ultimo service: pico en los primeros meses y cola larga de abandonados.
        # 12% sin registro (alta reciente o cliente historico sin ficha digital).
        if RNG.random() < 0.88:
            dias = int(RNG.triangular(10, 1_000, 90))
            fecha_srv = (HOY - timedelta(days=dias)).isoformat()
            km_srv = max(km - RNG.randint(1_200, 26_000), 500)
        else:
            fecha_srv, km_srv = None, None

        vehiculos.append((i, i, cat_id, patente(anio), anio, km, vtv,
                          fecha_srv, km_srv, 1 if RNG.random() < 0.06 else 0))

    cx.executemany("INSERT INTO clientes VALUES (?,?,?,?)", clientes)
    cx.executemany("INSERT INTO vehiculos VALUES (?,?,?,?,?,?,?,?,?,?)", vehiculos)


# --------------------------------------------------------------------------
# Radar de vencimientos: agregados precalculados
# --------------------------------------------------------------------------
TICKETS = {"vtv": 108_000, "service": 385_000, "verificacion": 55_000}

# Conversion por segmento. No es un numero unico: un recordatorio de VTV
# convierte muy distinto a un "volve al taller" generico, porque la VTV es
# obligatoria y tiene fecha. Los tres valores se muestran en pantalla para
# que el cliente los discuta en vez de discutir la credibilidad del total.
CONVERSION = {"vtv": 0.22, "service": 0.04, "verificacion": 0.15}

# Tarifas Meta para Argentina (agosto 2026), USD por conversacion.
TARIFA_UTILITY = 0.0120
TARIFA_MARKETING = 0.0618


def miles(n: int) -> str:
    return f"{n:,}".replace(",", ".")


def construir_radar(cx: sqlite3.Connection) -> dict:
    hoy = HOY.isoformat()
    limite_60 = (HOY + timedelta(days=60)).isoformat()
    hace_12m = (HOY - timedelta(days=365)).isoformat()

    q = lambda sql, args=(): cx.execute(sql, args).fetchone()[0]

    vtv_vencidas = q("SELECT COUNT(*) FROM vehiculos WHERE vtv_vence IS NOT NULL"
                     " AND vtv_vence < ?", (hoy,))
    vtv_60 = q("SELECT COUNT(*) FROM vehiculos WHERE vtv_vence BETWEEN ? AND ?",
               (hoy, limite_60))
    service_vencido = q("SELECT COUNT(*) FROM vehiculos WHERE ultimo_service_fecha IS NULL"
                        " OR ultimo_service_fecha < ?", (hace_12m,))
    km_excedido = q("SELECT COUNT(*) FROM vehiculos WHERE ultimo_service_km IS NOT NULL"
                    " AND km_actual - ultimo_service_km > 10000")
    verificacion = q("SELECT COUNT(*) FROM vehiculos WHERE verificacion_pendiente = 1")
    total = q("SELECT COUNT(*) FROM vehiculos")

    def bloque(clave, titulo, cantidad, detalle, base_conversion):
        ticket, conv = TICKETS[clave], CONVERSION[clave]
        return {
            "clave": clave, "titulo": titulo, "cantidad": cantidad,
            "ticket_promedio": ticket, "conversion": conv,
            "recuperable": round(cantidad * ticket * conv),
            "detalle": detalle, "base_conversion": base_conversion,
        }

    segmentos = [
        bloque("vtv", "VTV venciendo en los proximos 60 dias", vtv_60,
               f"{miles(vtv_vencidas)} ya vencidas, ademas de estas",
               "Es obligatoria y tiene fecha: la hacen si o si en algun lado"),
        bloque("service", "Sin service hace mas de 12 meses", service_vencido,
               f"{miles(km_excedido)} superaron 10.000 km desde el ultimo",
               "Recordatorio sin urgencia legal: la conversion es baja por definicion"),
        bloque("verificacion", "Verificacion policial pendiente", verificacion,
               "Tramites iniciados sin turno asignado",
               "Tramite ya empezado: solo falta que saquen el turno"),
    ]

    return {
        "generado": hoy,
        "total_registros": total,
        "segmentos": segmentos,
        "recuperable_total": sum(s["recuperable"] for s in segmentos),
        "campana": {
            "contactos": vtv_60,
            "tarifa_utility": TARIFA_UTILITY,
            "tarifa_marketing": TARIFA_MARKETING,
            "costo_utility": round(vtv_60 * TARIFA_UTILITY, 2),
            "costo_marketing": round(vtv_60 * TARIFA_MARKETING, 2),
        },
    }


def main() -> None:
    DATA.mkdir(exist_ok=True)
    if DB_PATH.exists():
        DB_PATH.unlink()
    cx = sqlite3.connect(DB_PATH)
    try:
        crear_esquema(cx)
        poblar_catalogos(cx)
        poblar_flota(cx)
        cx.commit()
        radar = construir_radar(cx)
        cx.execute("VACUUM")
    finally:
        cx.close()

    RADAR_PATH.write_text(json.dumps(radar, indent=2, ensure_ascii=False),
                          encoding="utf-8")
    mb = DB_PATH.stat().st_size / 1_048_576
    print(f"catalog.db  {mb:.1f} MB  ({miles(TOTAL_VEHICULOS)} vehiculos)")
    for s in radar["segmentos"]:
        print(f"  {s['titulo']}: {miles(s['cantidad'])}"
              f" -> ARS {miles(s['recuperable'])}")
    print(f"  recuperable total: ARS {miles(radar['recuperable_total'])}")
    c = radar["campana"]
    print(f"  campana {miles(c['contactos'])} contactos:"
          f" USD {c['costo_utility']} utility vs USD {c['costo_marketing']} marketing")


if __name__ == "__main__":
    main()
