#!/bin/bash
# Force Docker build for Railway
echo "Building with Docker..."
docker build -t frontend .
echo "Docker build completed"