FROM python:3.10-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies (Cached layer)
RUN pip install --no-cache-dir fastapi uvicorn[standard] torch networkx scikit-fuzzy pydantic python-dotenv

# Copy all project files (including rewards.py, arbitrage.py)
COPY . .

# Expose port
EXPOSE 8000

# Run Command
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
