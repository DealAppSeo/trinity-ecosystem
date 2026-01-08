FROM python:3.10-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Copy project files
COPY pyproject.toml .
COPY main.py .
COPY openapi.json .

# Install Python dependencies
# Using direct pip install for simplicity in Phase 3
RUN pip install --no-cache-dir fastapi uvicorn[standard] torch networkx scikit-fuzzy pydantic python-dotenv

# Expose port
EXPOSE 8000

# Run Command
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
