#!/bin/bash

# DDP Mobile Cloud Connector uninstall script

echo "Stopping DDP Mobile service..."
pkill -f "ddp-cloud-connector.js"

echo "DDP Mobile Cloud Connector plugin uninstalled successfully!"
