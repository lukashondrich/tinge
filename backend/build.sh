#!/bin/bash
# Force Docker build for Railway
echo "Building with Docker..."
docker build -t backend .
echo "Docker build completed"