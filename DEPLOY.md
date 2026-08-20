# Deploy

Dos caminos. **Hugging Face Spaces** no pide tarjeta; **Render** free exige un
medio de pago en el workspace (devuelve 402 sin tarjeta, incluso en plan free).

---

# A · Hugging Face Spaces (sin tarjeta) — recomendado

## 1. Crear el Space (2 min)

En <https://huggingface.co/new-space>:

| Campo | Valor |
|---|---|
| Owner | tu usuario |
| Space name | `auto-crm-whatsapp` |
| License | cualquiera |
| SDK | **Docker** → *Blank* |
| Hardware | CPU basic (free) |
| Visibility | **Public** ← si es privado, el link no le abre al cliente |

## 2. Empujar el codigo (2 min)

Necesitas un token de escritura: <https://huggingface.co/settings/tokens> (tipo *Write*).

```bash
cd "c:/Users/Administrator/Documents/Projects/AutoCRM_Whatsapp"
git remote add hf https://huggingface.co/spaces/<TU-USUARIO>/auto-crm-whatsapp
git push hf main --force
```

Usuario = tu usuario de HF, contraseña = el token. El `--force` es porque el
Space arranca con un commit inicial propio (un README) que hay que reemplazar:
el nuestro ya trae el frontmatter que HF necesita.

## 3. Cargar las variables (1 min)

Space → **Settings** → **Variables and secrets**:

| Nombre | Tipo | Valor |
|---|---|---|
| `ANTHROPIC_API_KEY` | Secret | tu key `sk-ant-...` |
| `WHATSAPP_VERIFY_TOKEN` | Secret | `autocrm-verify-3391d68401e99347` |

`MODEL_EXTRACT` y `MODEL_COMPOSE` ya tienen default en el codigo.

Despues de agregarlas: **Settings → Factory rebuild** (las variables nuevas no
entran en un contenedor ya construido).

## 4. Esperar el build

3–5 min la primera vez. La pestaña **Logs** muestra el `pip install` y el
`scripts.seed`. Cuando termina, la URL publica es:

```
https://<TU-USUARIO>-auto-crm-whatsapp.hf.space
```

Esa es la que le mandas al cliente. El webhook para Meta es esa misma URL
con `/webhook/whatsapp` — la pantalla *Conectar* ya la arma sola.

## Ventaja sobre Render free

El Space duerme recien a las **48 h** de inactividad, no a los 15 minutos.
No hace falta ping de uptime: si lo desplegas hoy, mañana esta despierto.

---

# B · Render (requiere tarjeta en el workspace)

> Probado por API el 2026-08-20: `POST /v1/services` devuelve **402 Payment
> Required** en un workspace sin tarjeta, aunque el plan sea `free`. La API key
> y el plan free no son el problema; el workspace necesita medio de pago.

## 1. Crear el servicio en Render (5 min)

1. **New → Blueprint**, elegí el repo. Render lee `render.yaml` solo.
   (Si preferís a mano: **New → Web Service**, runtime Python, y copiá
   `buildCommand` y `startCommand` desde `render.yaml`.)
2. Plan: **Free**.
3. En **Environment**, cargá:

   | Variable | Valor |
   |---|---|
   | `ANTHROPIC_API_KEY` | tu key `sk-ant-...` |
   | `WHATSAPP_VERIFY_TOKEN` | cualquier string largo, ej. `autocrm-verify-9f3a2b7c` |

   `MODEL_EXTRACT` y `MODEL_COMPOSE` ya vienen con default en `render.yaml`.
4. Deploy. El build corre `python -m scripts.seed` y tarda ~2 min.

## 2. Mantenerlo despierto (2 min) — no saltear

El free tier **duerme a los 15 minutos** y despierta en ~50 segundos. Si él abre
el link y espera casi un minuto en blanco, perdiste el efecto.

En [cron-job.org](https://cron-job.org) (gratis): job cada **10 minutos** contra

```
https://<tu-servicio>.onrender.com/healthz
```

750 horas/mes cubren un servicio permanentemente activo (el mes tiene ~730).

## 3. Verificar el camino LLM — lo único sin probar

Apenas esté arriba:

```bash
curl -N "https://<tu-servicio>.onrender.com/api/chat/stream?mensaje=me%20chillan%20los%20frenos%20de%20la%20hilux%202019"
```

En el evento `final` buscá:

- `"motor": "llm"` → el modelo está redactando. **Correcto.**
- `"motor": "plantilla"` → la llamada está fallando en silencio (el `except` es
  ancho a propósito para que el demo nunca quede mudo). Revisá que la key esté
  bien cargada; si persiste, hay que agregar un log en `compose.responder()`.
- `"validacion": "ok"` → los importes coinciden con la base.

Probá también un caso fuera de catálogo (`"me anda mal el turbo"`) para confirmar
que deriva a asesor en vez de inventar.

---

# Antes de mandarle el link (los dos caminos)

- [ ] Abrilo en el celular: la vista por defecto es el chat.
- [ ] Probá los 5 mensajes sugeridos.
- [ ] Radar → **Lanzar campaña** → responder "sí, cuánto sale" → tiene que cotizar
      la VTV de ese vehículo, no volver a preguntar.
- [ ] Desplegá **Ver JSON del webhook** y confirmá que se ve `ctwa_clid`.
- [ ] Reemplazá los precios de `scripts/seed.py` si ya te pasó su lista real.
