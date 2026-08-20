# Hugging Face Spaces · SDK: docker
#
# HF ejecuta el contenedor como UID 1000 y publica el puerto declarado en
# `app_port` del README (7860). Todo lo que escriba la app tiene que ser
# propiedad de ese usuario.
FROM python:3.12-slim

RUN useradd -m -u 1000 user
USER user

ENV HOME=/home/user \
    PATH=/home/user/.local/bin:$PATH \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PORT=7860

WORKDIR $HOME/app

COPY --chown=user:user requirements.txt ./
RUN pip install --no-cache-dir --user -r requirements.txt

COPY --chown=user:user . ./

# La base se genera durante el build: la imagen queda autocontenida y el
# arranque no depende de ningun disco persistente.
RUN python -m scripts.seed

EXPOSE 7860

# Sin --reload y con un solo worker: el estado de las conversaciones vive en
# memoria del proceso.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "7860", "--workers", "1"]
