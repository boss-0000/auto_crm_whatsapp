/**
 * Estructura de la WhatsApp Cloud API.
 *
 * En este demo la conversación corre sobre el simulador web, así que el payload
 * se etiqueta SIEMPRE como estructura de referencia: es la forma documentada del
 * webhook de Meta (v22.0), no un mensaje realmente recibido. El código de
 * producción parsea exactamente estos campos.
 */

export const VERSION_API = "v22.0";

export interface PayloadRef {
  real: false;
  titulo: string;
  cuerpo: Record<string, unknown>;
}

/**
 * Webhook entrante de un mensaje de texto, con el objeto `referral` que Meta
 * agrega cuando el lead llega desde un anuncio Click-to-WhatsApp. El
 * `ctwa_clid` es lo que permite atribuir la venta al anuncio que la originó.
 */
export function payloadEntrante(texto: string, conAnuncio = true): PayloadRef {
  const mensaje: Record<string, unknown> = {
    from: "5491133334444",
    id: "wamid.HBgNNTQ5MTEzMzMzNDQ0NBUCABIYFjNBMEE5RjQ4RDdBQzBBQjBFMzBB",
    timestamp: String(Math.floor(Date.now() / 1000)),
    type: "text",
    text: { body: texto },
  };
  if (conAnuncio) {
    mensaje.referral = {
      source_url: "https://fb.me/2xYzAbCd",
      source_id: "120210000000000000",
      source_type: "ad",
      headline: "VTV sin fila · turno en el día",
      body: "Sacate la VTV esta semana. Reservá por WhatsApp.",
      media_type: "image",
      ctwa_clid: "ARAaBcDeFgHiJkLmNoPqRsTuVwXyZ0123456789abcdef",
    };
  }
  return {
    real: false,
    titulo: `Estructura de referencia · Cloud API ${VERSION_API}`,
    cuerpo: {
      object: "whatsapp_business_account",
      entry: [{
        id: "102290129340398",
        changes: [{
          value: {
            messaging_product: "whatsapp",
            metadata: {
              display_phone_number: "541150000000",
              phone_number_id: "106540352242922",
            },
            contacts: [{ profile: { name: "Cliente" }, wa_id: "5491133334444" }],
            messages: [mensaje],
          },
          field: "messages",
        }],
      }],
    },
  };
}

/** Llamada saliente que envía la respuesta del bot. */
export function payloadSaliente(texto: string): PayloadRef {
  return {
    real: false,
    titulo: `POST /${VERSION_API}/{phone_number_id}/messages`,
    cuerpo: {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: "5491133334444",
      type: "text",
      text: { preview_url: false, body: texto },
    },
  };
}
