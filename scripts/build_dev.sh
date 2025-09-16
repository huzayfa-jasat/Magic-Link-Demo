#!/bin/bash

# Stop any running containers
docker compose down --remove-orphans

# Build and start the services
COMPOSE_DOCKER_CLI_BUILD=1 DOCKER_BUILDKIT=1 docker compose -f compose_dev.yml up --build -d

echo "Magic Link Demo is running!"
echo "API: http://localhost:11793"
echo "Prometheus: http://localhost:9091"