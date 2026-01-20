const { io } = require('socket.io-client');
const axios = require('axios');
const mqtt = require('mqtt');
const fs = require('fs');
const path = require('path');

// Load settings
const settingsFile = path.join(__dirname, 'settings', 'config.json');
let settings = {
    apiKey: '',
    cloudServerUrl: 'http://localhost:3002',
    fppHost: '127.0.0.1',  // IP address of FPP (use 127.0.0.1 if running ON the FPP)
    enabled: false
};

try {
    if (fs.existsSync(settingsFile)) {
        settings = JSON.parse(fs.readFileSync(settingsFile, 'utf8'));
    } else {
        console.log('No configuration found. Please configure the plugin first.');
        process.exit(0);
    }
} catch (error) {
    console.error('Error loading settings:', error);
    process.exit(1);
}

if (!settings.enabled) {
    console.log('Plugin is disabled. Enable it in the settings page.');
    process.exit(0);
}

if (!settings.apiKey) {
    console.log('API key not configured. Please configure the plugin first.');
    process.exit(0);
}

const API_SERVER_URL = settings.cloudServerUrl.replace(':3002', ':3001');
const CLOUD_SERVER_URL = settings.cloudServerUrl;
const API_KEY = settings.apiKey;

// FPP MQTT configuration
const MQTT_BROKER = `mqtt://${settings.fppHost || '127.0.0.1'}:1883`;
const MQTT_TOPIC = settings.mqttTopic || 'falcon/player/FPP/channel/output/color';
const FPP_HOST = settings.fppHost || '127.0.0.1';
const FORWARD_INTERVAL = 40; // Forward data every 40ms (~25 FPS)

let showToken = null;
let cloudSocket = null;
let stats = {
    packetsReceived: 0,
    packetsSent: 0,
    errors: 0,
    connected: false,
    startTime: Date.now(),
    lastUpdate: new Date().toISOString()
};

// Stats file
const statsFile = path.join(__dirname, 'settings', 'stats.json');

// Save stats to file
function saveStats() {
    try {
        fs.writeFileSync(statsFile, JSON.stringify(stats, null, 2));
    } catch (error) {
        console.error('Error saving stats:', error);
    }
}

// Validate API key and get show token
async function initialize() {
    try {
        console.log('Validating API key...');
        const response = await axios.get(`${API_SERVER_URL}/api/validate-key/${API_KEY}`, {
            timeout: 5000
        });
        
        if (!response.data.valid) {
            console.error('ERROR: Invalid API key');
            process.exit(1);
        }
        
        showToken = response.data.token;
        console.log(`✓ API key validated. Show token: ${showToken}`);
        
        // Connect to cloud server
        connectToCloud();
        
        // Start data forwarder
        startDataForwarder();
        
    } catch (error) {
        console.error('Initialization error:', error.message);
        stats.errors++;
        saveStats();
        process.exit(1);
    }
}

// Connect to cloud WebSocket server
function connectToCloud() {
    console.log(`Connecting to cloud server: ${CLOUD_SERVER_URL}`);
    
    cloudSocket = io(CLOUD_SERVER_URL, {
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionDelay: 2000,
        reconnectionAttempts: Infinity
    });
    
    cloudSocket.on('connect', () => {
        console.log('✓ Connected to cloud server');
        stats.connected = true;
        saveStats();
    });
    
    cloudSocket.on('disconnect', (reason) => {
        console.log(`Disconnected from cloud server: ${reason}`);
        stats.connected = false;
        saveStats();
    });
    
    cloudSocket.on('error', (error) => {
        console.error('Cloud connection error:', error.message);
        stats.errors++;
        stats.connected = false;
        saveStats();
    });
    
    cloudSocket.on('reconnect', (attemptNumber) => {
        console.log(`Reconnected to cloud server (attempt ${attemptNumber})`);
        stats.connected = true;
        saveStats();
    });
}

// Store latest channel data from FPP MQTT
let latestChannelData = new Array(512).fill(0);
let lastDataTime = 0;
let mqttClient = null;

// Connect to FPP's MQTT broker and subscribe to channel data
function connectToFPPMQTT() {
    console.log(`Connecting to FPP MQTT broker at ${MQTT_BROKER}...`);
    console.log(`Subscribing to topic: ${MQTT_TOPIC}`);
    
    mqttClient = mqtt.connect(MQTT_BROKER, {
        reconnectPeriod: 5000,
        connectTimeout: 10000
    });
    
    mqttClient.on('connect', () => {
        console.log('✓ Connected to FPP MQTT broker');
        
        // Subscribe to the channel output topic
        mqttClient.subscribe(MQTT_TOPIC, (err) => {
            if (err) {
                console.error('Failed to subscribe to MQTT topic:', err.message);
            } else {
                console.log(`✓ Subscribed to ${MQTT_TOPIC}`);
            }
        });
    });
    
    mqttClient.on('message', (topic, message) => {
        try {
            processMQTTMessage(message.toString());
        } catch (error) {
            console.error('Error processing MQTT message:', error.message);
            stats.errors++;
        }
    });
    
    mqttClient.on('error', (error) => {
        console.error(`MQTT connection error: ${error.message}`);
        stats.errors++;
    });
    
    mqttClient.on('close', () => {
        console.log('MQTT connection closed. Will attempt to reconnect...');
    });
    
    mqttClient.on('reconnect', () => {
        console.log('Reconnecting to MQTT broker...');
    });
}

// Process MQTT message from FPP
// FPP MQTT output format: "R,G,B" or custom payload pattern
function processMQTTMessage(message) {
    try {
        // Parse RGB values from message
        // Format could be: "255,0,0" or "#FF0000" or custom pattern
        let r = 0, g = 0, b = 0;
        
        if (message.includes(',')) {
            // Format: "R,G,B"
            const parts = message.split(',').map(p => parseInt(p.trim()));
            r = parts[0] || 0;
            g = parts[1] || 0;
            b = parts[2] || 0;
        } else if (message.startsWith('#')) {
            // Format: "#RRGGBB"
            const hex = message.substring(1);
            r = parseInt(hex.substring(0, 2), 16) || 0;
            g = parseInt(hex.substring(2, 4), 16) || 0;
            b = parseInt(hex.substring(4, 6), 16) || 0;
        } else {
            // Try parsing as JSON: {"r":255,"g":0,"b":0}
            const data = JSON.parse(message);
            r = data.r || data.R || 0;
            g = data.g || data.G || 0;
            b = data.b || data.B || 0;
        }
        
        // Store RGB in channels 0-2
        latestChannelData[0] = r;
        latestChannelData[1] = g;
        latestChannelData[2] = b;
        
        // For now, pixels (channels 3-32) remain zeros
        // Can be expanded later when MQTT supports more channels
        
        lastDataTime = Date.now();
        stats.packetsReceived++;
        
        if (stats.packetsReceived % 100 === 0) {
            console.log(`✓ Receiving MQTT data: RGB [${r}, ${g}, ${b}], Packets: ${stats.packetsReceived}`);
        }
    } catch (error) {
        console.error('Error parsing MQTT message:', error.message);
        stats.errors++;
    }
}

// Start sending data to cloud
function startDataForwarder() {
    console.log('\n' + '='.repeat(60));
    console.log('FPP CLOUD CONNECTOR PLUGIN (MQTT)');
    console.log('='.repeat(60));
    console.log(`Show token: ${showToken}`);
    console.log(`Cloud server: ${CLOUD_SERVER_URL}`);
    console.log(`MQTT Broker: ${MQTT_BROKER}`);
    console.log(`MQTT Topic: ${MQTT_TOPIC}`);
    console.log(`Forward interval: ${FORWARD_INTERVAL}ms`);
    console.log('='.repeat(60));
    console.log('\nIMPORTANT: You must configure FPP with an MQTT output:');
    console.log('  1. Go to Input/Output Setup -> Channel Outputs');
    console.log('  2. Add new output: MQTT');
    console.log('  3. Set your desired start channel (e.g., 1 or 100)');
    console.log('  4. Channel count: 3 (for RGB)');
    console.log('  5. Configure MQTT broker (usually localhost:1883)');
    console.log('  6. Set topic and payload pattern');
    console.log('  7. Enable the output');
    console.log('='.repeat(60) + '\n');
    
    // Connect to FPP's MQTT broker
    connectToFPPMQTT();
    
    // Forward data to cloud periodically
    setInterval(() => {
        try {
            // Check if we've received data recently (within last 2 seconds)
            if (Date.now() - lastDataTime > 2000) {
                return; // No recent data
            }
            
            // Extract single color (channels 1-3)
            const r = latestChannelData[0] || 0;
            const g = latestChannelData[1] || 0;
            const b = latestChannelData[2] || 0;
            
            // Extract 10 pixels (channels 4-33)
            const pixels = [];
            for (let i = 0; i < 10; i++) {
                const offset = 3 + (i * 3);
                pixels.push({
                    r: latestChannelData[offset] || 0,
                    g: latestChannelData[offset + 1] || 0,
                    b: latestChannelData[offset + 2] || 0
                });
            }
            
            // Send to cloud via Socket.io
            if (cloudSocket && cloudSocket.connected) {
                cloudSocket.emit('lighting-data', {
                    apiKey: API_KEY,
                    token: showToken,
                    color: { r, g, b },
                    pixels: pixels
                });
                stats.packetsSent++;
                
                // Debug log every 100 packets
                if (stats.packetsSent % 100 === 0) {
                    console.log(`Sent packet ${stats.packetsSent}, RGB: [${r},${g},${b}]`);
                }
            }
            
        } catch (error) {
            console.error('Data forwarding error:', error.message);
            stats.errors++;
        }
    }, FORWARD_INTERVAL);
}

// Stats reporting and saving
setInterval(() => {
    const uptime = Math.floor((Date.now() - stats.startTime) / 1000);
    const pps = stats.packetsReceived > 0 ? (stats.packetsReceived / uptime).toFixed(1) : 0;
    
    stats.lastUpdate = new Date().toISOString();
    saveStats();
    
    console.log(`[STATS] Uptime: ${uptime}s | Received: ${stats.packetsReceived} | Sent: ${stats.packetsSent} | PPS: ${pps} | Errors: ${stats.errors} | Connected: ${stats.connected ? 'Yes' : 'No'}`);
}, 30000); // Every 30 seconds

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('\nShutting down gracefully...');
    saveStats();
    if (cloudSocket) {
        cloudSocket.disconnect();
    }
    process.exit(0);
});

process.on('SIGINT', () => {
    console.log('\nShutting down gracefully...');
    saveStats();
    if (cloudSocket) {
        cloudSocket.disconnect();
    }
    process.exit(0);
});

// Start the connector
initialize();
