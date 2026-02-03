FROM python:3.10-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies (Cached layer)
RUN pip install --no-cache-dir \
    fastapi \
    uvicorn[standard] \
    numpy \
    scipy \
    networkx \
    scikit-fuzzy \
    pydantic \
    pydantic-ai \
    python-dotenv \
    requests \
    packaging \
    prometheus_client \
    supabase \
    structlog \
    arize-phoenix \
    opentelemetry-api \
    opentelemetry-sdk \
    opentelemetry-exporter-otlp \
    opentelemetry-instrumentation-fastapi \
    openinference-instrumentation-pydantic-ai \
    crewai \
    llama-index \
    autogen-agentchat

RUN pip install --no-cache-dir torch --index-url https://download.pytorch.org/whl/cpu
# torch_geometric is also listed in pyproject.toml
RUN pip install --no-cache-dir torch-geometric

# Copy all project files
COPY . .

# Expose port (Documentation only)
EXPOSE 8000

# Run Command (Using shell form to expand $PORT provided by Railway)
CMD uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}
