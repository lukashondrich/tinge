# Embedding Service Dockerfile
FROM node:18-bullseye-slim

# Install Python and system dependencies with retry logic
RUN apt-get update && \
    for i in 1 2 3; do \
        apt-get install -y \
            python3 \
            python3-pip \
            python3-venv \
            python3-dev \
            build-essential \
            curl \
        && break || sleep 5; \
    done && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install Node.js dependencies
RUN npm install --only=production

# Copy Python requirements if they exist
COPY requirements.txt* ./

# Create Python virtual environment and install dependencies if requirements.txt exists
# For now, skip ML dependencies to speed up build - can be added later when needed
# RUN if [ -f requirements.txt ]; then \
#         python3 -m venv /app/venv && \
#         . /app/venv/bin/activate && \
#         pip install --upgrade pip && \
#         pip install -r requirements.txt; \
#     fi

# Copy source code
COPY . .

# Expose port
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3001/health || exit 1

# Start the application directly
CMD ["node", "server.js"]