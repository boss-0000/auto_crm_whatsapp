# Deploy — pasos exactos

El repo está commiteado y el build fue probado en limpio. Faltan tres cosas que
requieren tus cuentas: subir el repo, crear el servicio en Render y cargar la key.

## 1. Subir el repo (2 min)

Creá un repo **privado** vacío en GitHub (sin README, sin .gitignore) y después:

```bash
cd "c:/Users/Administrator/Documents/Projects/AutoCRM_Whatsapp"
git branch -M main
git remote add origin https://github.com/<TU-USUARIO>/autocrm-whatsapp.git
git push -u origin main
```

Si el autor del commit no es el que querés:

```bash
git config user.name "Tu Nombre"
git commit --amend --reset-author --no-edit
```

## 2. Crear el servicio en Render (5 min)

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

## 3. Mantenerlo despierto (2 min) — no saltear

El free tier **duerme a los 15 minutos** y despierta en ~50 segundos. Si él abre
el link y espera casi un minuto en blanco, perdiste el efecto.

En [cron-job.org](https://cron-job.org) (gratis): job cada **10 minutos** contra

```
https://<tu-servicio>.onrender.com/healthz
```

750 horas/mes cubren un servicio permanentemente activo (el mes tiene ~730).

## 4. Verificar el camino LLM — lo único sin probar

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

## 5. Antes de mandarle el link

- [ ] Abrilo en el celular: la vista por defecto es el chat.
- [ ] Probá los 5 mensajes sugeridos.
- [ ] Radar → **Lanzar campaña** → responder "sí, cuánto sale" → tiene que cotizar
      la VTV de ese vehículo, no volver a preguntar.
- [ ] Desplegá **Ver JSON del webhook** y confirmá que se ve `ctwa_clid`.
- [ ] Reemplazá los precios de `scripts/seed.py` si ya te pasó su lista real.
