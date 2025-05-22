#!/bin/bash

# Move to root folder
cd ../

# Create docker compose file
cp compose_dev.yml docker-compose.yml

# Stop running containers
docker-compose down --remove-orphans

# Remove temp compose file
rm docker-compose.yml
