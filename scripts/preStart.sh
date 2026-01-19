#!/bin/sh

# Start DDP Mobile Cloud Connector when FPP starts
echo "Starting DDP Mobile Cloud Connector..."

PLUGINDIR="${PLUGINDIR}"
PLUGIN_NAME="fpp-plugin-DDP-Mobile"

# Start the connector in the background
cd "${PLUGINDIR}/${PLUGIN_NAME}"
node ddp-cloud-connector.js > /dev/null 2>&1 &

echo "DDP Mobile Cloud Connector started"
