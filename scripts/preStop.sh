#!/bin/sh

# Stop DDP Mobile Cloud Connector when FPP stops
echo "Stopping DDP Mobile Cloud Connector..."

pkill -f "ddp-cloud-connector.js"

echo "DDP Mobile Cloud Connector stopped"
