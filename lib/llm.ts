/**
 * Adaptador de modelo de lenguaje. Opcional por diseño.
 *
 * Sin ninguna variable de entorno el demo funciona completo por el camino
 * determinístico. Si existe GEMINI_API_KEY, el modelo interpreta frases que las
 * reglas no cubren y redacta con más naturalidad.
 *
 * Lo que NO cambia con el modelo: los precios los calcula la aritmética, el
 * guardarraíl valida la salida, y si el proveedor falla se responde con las
 * plantillas. El modelo es una mejora, nunca una dependencia.
 */

const BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const TIEMPO_LIMITE_MS = 20_000;

/** Último fallo del proveedor, para diagnóstico desde /api/estado. */
export let ultimoError: { etapa: string; detalle: string } | null = null;

const registrarError = (etapa: string, detalle: string) => {
  ultimoError = { etapa, detalle: detalle.slice(0, 300) };
};

const key = () => process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY ?? "";

export const hayModelo = () => key().length > 0;

export const modeloExtraccion = () =>
  process.env.MODEL_EXTRACT || "gemini-2.5-flash-lite";
export const modeloRedaccion = () =>
  process.env.MODEL_COMPOSE || "gemini-2.5-flash";

export function estado() {
  return {
    proveedor: hayModelo() ? "gemini" : "ninguno",
    modeloExtraccion: modeloExtraccion(),
    modeloRedaccion: modeloRedaccion(),
    ultimoError,
  };
}

const TIPOS: Record<string, string> = {
  object: "OBJECT", string: "STRING", integer: "INTEGER",
  number: "NUMBER", boolean: "BOOLEAN", array: "ARRAY",
};

/** Traduce JSON Schema al subconjunto OpenAPI que acepta Gemini. */
function esquemaGemini(e: Record<string, unknown>): Record<string, unknown> {
  const fuera: Record<string, unknown> = {};
  for (const [clave, valor] of Object.entries(e)) {
    if (clave === "additionalProperties") continue;
    if (clave === "type" && typeof valor === "string") {
      fuera.type = TIPOS[valor] ?? valor.toUpperCase();
    } else if (clave === "properties" && valor && typeof valor === "object") {
      fuera.properties = Object.fromEntries(
        Object.entries(valor as Record<string, Record<string, unknown>>)
          .map(([k, v]) => [k, esquemaGemini(v)])
      );
    } else {
      fuera[clave] = valor;
    }
  }
  if (fuera.type === "OBJECT" && fuera.properties) {
    fuera.propertyOrdering = Object.keys(fuera.properties as object);
  }
  return fuera;
}

async function pedir(
  sistema: string,
  prompt: string,
  maxTokens: number,
  esquema: Record<string, unknown> | null
): Promise<string | null> {
  if (!hayModelo()) return null;

  const generationConfig: Record<string, unknown> = { maxOutputTokens: maxTokens };
  if (esquema) {
    generationConfig.responseMimeType = "application/json";
    generationConfig.responseSchema = esquemaGemini(esquema);
  }
  const modelo = esquema ? modeloExtraccion() : modeloRedaccion();

  const control = new AbortController();
  const reloj = setTimeout(() => control.abort(), TIEMPO_LIMITE_MS);
  try {
    const r = await fetch(`${BASE}/${modelo}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key() },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: sistema }] },
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig,
      }),
      signal: control.signal,
    });
    if (!r.ok) {
      registrarError(`gemini:http${r.status}`, await r.text());
      return null;
    }
    const datos = await r.json();
    const cand = datos?.candidates?.[0];
    // MAX_TOKENS deja la respuesta cortada: mejor descartarla.
    if (cand?.finishReason && cand.finishReason !== "STOP") {
      registrarError("gemini:corte", String(cand.finishReason));
      return null;
    }
    const texto = (cand?.content?.parts ?? [])
      .map((p: { text?: string }) => p.text ?? "").join("").trim();
    return texto || null;
  } catch (err) {
    registrarError("gemini:red", err instanceof Error ? err.message : String(err));
    return null;
  } finally {
    clearTimeout(reloj);
  }
}

export const generarTexto = (sistema: string, prompt: string, maxTokens = 1200) =>
  pedir(sistema, prompt, maxTokens, null);

export async function generarJSON<T>(
  sistema: string,
  prompt: string,
  esquema: Record<string, unknown>,
  maxTokens = 800
): Promise<T | null> {
  const crudo = await pedir(sistema, prompt, maxTokens, esquema);
  if (!crudo) return null;
  try {
    return JSON.parse(crudo) as T;
  } catch {
    registrarError("gemini:json", crudo.slice(0, 200));
    return null;
  }
}
