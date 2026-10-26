FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt && useradd --create-home --uid 10001 care
COPY --chown=care:care backend backend
COPY --chown=care:care web web
COPY --chown=care:care data data
COPY --chown=care:care scripts scripts
RUN mkdir -p runtime && chown care:care runtime
USER care
EXPOSE 8000
CMD ["gunicorn", "--bind", "0.0.0.0:8000", "--workers", "2", "--threads", "2", "--timeout", "30", "backend.app:create_app()"]
