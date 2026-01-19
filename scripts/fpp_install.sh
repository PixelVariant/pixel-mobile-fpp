#!/bin/bash

# DDP Mobile Cloud Connector install script

# Include common scripts functions and variables
. ${FPPDIR}/scripts/common

# Install Node.js if not already installed
if ! command -v node &> /dev/null; then
    echo "Installing Node.js..."
    if [ -f /etc/debian_version ]; then
        apt-get update
        apt-get install -y nodejs npm
    elif [ -f /etc/redhat-release ]; then
        yum install -y nodejs npm
    fi
fi

# Install plugin dependencies
cd "${PLUGINDIR}/${PLUGIN_NAME}"
npm install

# Create settings directory if it doesn't exist
mkdir -p "${PLUGINDIR}/${PLUGIN_NAME}/settings"

echo "DDP Mobile Cloud Connector plugin installed successfully!"
