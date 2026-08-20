---
title: AutoCRM WhatsApp
emoji: 🚗
colorFrom: green
colorTo: gray
sdk: docker
app_port: 7860
pinned: false
short_description: Atención automatizada por WhatsApp para servicios automotrices
---

# AutoCRM WhatsApp — demo

Plataforma de atención automatizada sobre WhatsApp Business API para una
empresa de servicios automotrices: bot con IA, presupuestos determinísticos
desde base propia, CRM con ruteo por sector y radar de vencimientos.

## Correr local

```bash
pip install -r requirements.txt
python -m scripts.seed          # genera data/catalog.db + data/radar.json
uvicorn app.main:app --reload   # http://127.0.0.1:8000
```

## Deploy (Render, free tier)

`render.yaml` está listo. El build corre el seed, así que la base se regenera
en cada deploy y no hace falta disco persistente.

Variables a cargar en el dashboard: `ANTHROPIC_API_KEY`, `WHATSAPP_VERIFY_TOKEN`.

**El free tier duerme a los 15 minutos.** Configurar un ping gratuito
(cron-job.org / UptimeRobot) cada 10 minutos contra `/healthz`. Con eso el
servicio queda permanentemente activo y sigue dentro de las 750 horas/mes.

## Arquitectura

```
scripts/seed.py   genera el catálogo y la flota sintética (25.000 vehículos)
app/db.py         acceso SQLite solo-lectura + resolución de modelos
app/quotes.py     motor de presupuestos determinístico
app/main.py       API FastAPI
data/catalog.db   generado; en producción es la base del cliente
static/           interfaz (chat + panel CRM + radar)
```

### El LLM nunca calcula un precio

Es la decisión de arquitectura central del proyecto:

- **El LLM extrae parámetros**: marca, modelo, año, tipo de servicio, intención.
- **`quotes.cotizar()` calcula**: mano de obra (`horas × valor_hora × factor_segmento`)
  más repuestos (`precio_base × factor_segmento × cantidad`), todo con `SELECT`
  contra la lista de precios.
- **Un validador numérico** compara cada número del mensaje generado contra
  `Presupuesto.valores_permitidos()`. Si aparece un número que no salió de la
  base, no se envía: cae al texto plano de `texto_presupuesto()`.

El bot no puede inventar un precio, ni equivocándose.

Cada presupuesto viaja con el SQL que lo produjo (`Presupuesto.sql`), que la
interfaz muestra en pantalla.

### Datos de precios

Los valores de `scripts/seed.py` son **placeholders de mercado (AR, agosto 2026)**.
Se reemplazan por la lista real del cliente sin tocar una línea de lógica:
`REPUESTOS`, `SERVICIOS`, `COMPOSICION`, `PARAMETROS` y `FACTOR_SEGMENTO`.

Reglas de negocio ya modeladas:

- Patentes formato viejo (`AAA123`) hasta 2015 y Mercosur (`AB123CD`) desde 2016.
- VTV obligatoria desde los 3 años de antigüedad, vencimiento anual.
- Los trámites de **Verificaciones** (VTV, verificación policial, grabado) se
  cobran a arancel oficial: precio final, **sin IVA encima**. Los servicios de
  taller sí llevan IVA.
- Factores de segmento (chico / mediano / suv / pickup / utilitario) sobre mano
  de obra y repuestos por separado.

### Radar de vencimientos

`data/radar.json` se precalcula en el seed para no escanear 25.000 filas por
request. Conversión estimada **por segmento**, no un número único: un
recordatorio de VTV convierte distinto a un "volvé al taller" genérico, porque
la VTV es obligatoria y tiene fecha.

| Segmento | Conversión | Por qué |
|---|---|---|
| VTV venciendo a 60 días | 22% | Obligatoria y con fecha |
| Sin service hace +12 meses | 4% | Recordatorio sin urgencia legal |
| Verificación pendiente | 15% | Trámite ya iniciado |

El radar también calcula el costo Meta de la campaña con las tarifas de
Argentina (agosto 2026): **utility USD 0,0120** vs **marketing USD 0,0618**
por conversación — 5,15× de diferencia sobre la misma lista.

## Conexión con WhatsApp Cloud API

La pantalla **Conectar WhatsApp** permite enchufar un número de prueba en 10 minutos,
sin tocar producción. Implementa las cuatro piezas reales de la integración:

| Pieza | Dónde |
|---|---|
| Handshake `hub.mode` / `hub.verify_token` / `hub.challenge` | `GET /webhook/whatsapp` — responde **texto plano**, no JSON |
| Firma `X-Hub-Signature-256` (HMAC-SHA256 sobre el body crudo) | `whatsapp.validar_firma()`, con `compare_digest` |
| Parseo del webhook + `referral.ctwa_clid` de anuncios CTWA | `whatsapp.parsear()` |
| Envío `POST /{phone_number_id}/messages` | `whatsapp.enviar_texto()` |

El webhook responde **200 inmediatamente** y genera la respuesta en background: Meta
reintenta si el endpoint tarda, y una respuesta con LLM tarda segundos.

Las credenciales viven sólo en memoria (`whatsapp.CREDENCIALES`), nunca se persisten
y nunca se devuelven al navegador — sólo enmascaradas.

**Nunca pedir el token del número de producción.** Puede enviar mensajes en nombre de
la empresa y afectar la calificación de calidad. Además, el webhook se configura por
app: apuntar la app de producción al demo desviaría los mensajes de clientes reales.

### Visor de payload

El panel muestra el JSON del webhook con `ctwa_clid`, `source_type` y `wamid`
resaltados. La etiqueta cambia según la verdad:

- Sin número conectado: *"Estructura de referencia · Cloud API v22.0"*
- Con número conectado: *"Payload real recibido"*

## Estado de verificación

| Camino | Estado |
|---|---|
| Motor de presupuestos, guardarraíl, ruteo, radar, campaña | Verificado |
| Webhook: handshake, firma, parseo, background | Verificado con HMAC real |
| Interfaz (escritorio y móvil) | Verificado en navegador |
| **Llamadas al LLM (Haiku + Opus)** | **Sin verificar — falta `ANTHROPIC_API_KEY`** |
| Envío real por Cloud API | Sin verificar — faltan credenciales de Meta |

Sin `ANTHROPIC_API_KEY` todo corre por el camino determinista (`motor: plantilla`).
Al cargar la key, verificar que la respuesta traiga `motor: llm` y `validacion: ok`.
