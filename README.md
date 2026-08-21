# AutoCRM · Atención automatizada por WhatsApp

Demo de una plataforma de atención para una empresa de servicios automotrices:
bot con IA, presupuestos automáticos desde base propia, CRM con ruteo por sector
y radar de vencimientos sobre 25.000 registros.

Next.js 16 · React 19 · Tailwind 4 · TypeScript. Desplegable en Vercel sin
configurar nada.

## Correr local

```bash
npm install
npm run dev          # http://localhost:3000
```

## Deploy en Vercel

Importá el repo y listo. `prebuild` genera los datos, no hay base que
provisionar, no hay variables obligatorias.

**La demo funciona completa sin ninguna variable de entorno.** Es deliberado:
ninguna cuenta, key o servicio externo puede romper el deploy.

| Variable | ¿Obligatoria? | Para qué |
|---|---|---|
| `GEMINI_API_KEY` | No | El bot interpreta frases fuera de las reglas y redacta con más naturalidad. Tier gratuito sin tarjeta: [aistudio.google.com/apikey](https://aistudio.google.com/apikey) |

Sin key, la interpretación la hacen reglas locales y las respuestas salen de
plantillas determinísticas. Con key, el modelo reemplaza ambas — pero **nunca**
los precios.

## La decisión de arquitectura que importa

**El modelo de lenguaje nunca calcula un precio.**

- **El modelo extrae parámetros**: marca, modelo, año, tipo de servicio, intención.
- **`lib/presupuestos.ts` calcula**: mano de obra (`horas × valor_hora × factor_segmento`)
  más repuestos (`precio_base × factor_segmento × cantidad`), contra la lista de precios.
- **`lib/redactar.ts` valida**: después de redactar, compara cada importe del
  mensaje contra los valores que salieron del cálculo. Si aparece un número que
  no salió de ahí, el texto del modelo se descarta y se envía el presupuesto
  determinístico.

El bot no puede inventar un precio, ni equivocándose. El panel muestra la
aritmética completa de cada presupuesto en pantalla.

El guardarraíl distingue importes de otros números: un valor precedido por `$`
se valida sólo contra la lista de precios, el resto contra un conjunto más
amplio. Así `"el service de 20.000 km"` pasa y `"$ 20.000 de descuento"` no.

## Reglas de negocio modeladas

- Patentes formato viejo (`AAA123`) hasta 2015 y Mercosur (`AB123CD`) desde 2016.
- VTV obligatoria desde los 3 años de antigüedad, vencimiento anual.
- Los trámites de **Verificaciones** (VTV, verificación policial, grabado) se
  cobran a arancel oficial: precio final, **sin IVA encima**. Los servicios de
  taller sí lo llevan.
- Factores de precio por segmento (chico / mediano / suv / pickup / utilitario),
  separados para mano de obra y repuestos.
- Ruteo automático a Ventas, Verificaciones y Servicio Técnico, con derivación a
  un asesor cuando el pedido excede al bot.

## Radar de vencimientos

`scripts/seed.mjs` sintetiza 25.000 vehículos en tiempo de build y guarda sólo
los agregados (`data/radar.json`, ~9 KB), así el bundle serverless queda chico.
La flota es determinística: misma semilla, misma base en cada build.

Conversión estimada **por segmento**, no un número único — un recordatorio de VTV
convierte muy distinto a un "volvé al taller" genérico:

| Segmento | Conversión | Por qué |
|---|---|---|
| VTV venciendo a 60 días | 22% | Obligatoria y con fecha |
| Sin service hace +12 meses | 4% | Recordatorio sin urgencia legal |
| Verificación pendiente | 15% | Trámite ya iniciado |

También calcula el costo Meta de la campaña con tarifas de Argentina (agosto
2026): **utility USD 0,0120** vs **marketing USD 0,0618** por conversación.

## Sobre el canal de WhatsApp

La conversación corre sobre un **simulador web**: se ve el comportamiento
completo sin depender de credenciales de Meta. El visor de payload muestra la
estructura documentada de la Cloud API v22.0 —con `referral.ctwa_clid` de un
anuncio Click-to-WhatsApp— y está etiquetado como estructura de referencia, no
como un mensaje realmente recibido.

La pestaña **WhatsApp** documenta las piezas de la integración de producción:
handshake del webhook, firma `X-Hub-Signature-256`, respuesta inmediata con
trabajo en segundo plano, y atribución por `ctwa_clid`.

## Los precios son de referencia

Los valores de `lib/catalogo.ts` son precios de mercado argentino a agosto de
2026. Se reemplazan por la lista real del cliente sin tocar el motor: viven en
`SERVICIOS`, `REPUESTOS`, `COMPOSICION`, `PARAMETROS` y `FACTORES`.
