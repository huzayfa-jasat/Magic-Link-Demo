#!/bin/bash

# Stop running containers
docker compose -f compose_dev.yml down --remove-orphans

echo "Magic Link Demo stopped successfully!"
