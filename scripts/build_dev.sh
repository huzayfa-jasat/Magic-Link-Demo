#!/bin/bash

# Move to root folder
cd ../

# Create docker compose file
cp compose_dev.yml docker-compose.yml

# Stop running containers
docker compose down --remove-orphans

# Build the services
COMPOSE_DOCKER_CLI_BUILD=1 DOCKER_BUILDKIT=1 docker compose build

# Start the services in detached mode
docker compose up -d

# Remove temp compose file
rm docker-compose.yml