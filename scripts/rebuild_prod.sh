#!/bin/bash

# Move to root folder
cd ../

# Create docker compose file
cp compose_prod.yml docker-compose.yml

# Re-build running containers and start in detached mode
docker-compose up -d --build --remove-orphans

# Remove temp compose file
rm docker-compose.yml