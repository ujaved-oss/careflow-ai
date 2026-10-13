FROM python:3.12-slim
WORKDIR /app
RUN pip install --no-cache-dir uv==0.13.0
COPY pyproject.toml uv.lock ./
COPY src ./src
RUN uv sync --frozen --no-dev
COPY alembic.ini ./
COPY migrations ./migrations
COPY scripts ./scripts
RUN useradd --create-home careflow && mkdir -p storage && chown -R careflow:careflow /app
USER careflow
EXPOSE 8000
CMD ["uv", "run", "uvicorn", "careflow.main:app", "--host", "0.0.0.0", "--port", "8000"]
