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
    fppHost: '127.0.0.1',
    mqttBroker: '',
    mqttUsername: '',
    mqttPassword: '',
    mqttTopicColor: 'mobileLights',
    mqttTopicPixels: 'falcon/player/FPP/mobileLights/pixel/#',
    cloudMqttBroker: 'mqtt://192.168.83.45:1883',
    cloudMqttUsername: '',
    cloudMqttPassword: '',
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

// FPP MQTT configuration (local broker - user's existing setup)
const LOCAL_MQTT_BROKER = settings.mqttBroker || `mqtt://${settings.fppHost || '127.0.0.1'}:1883`;
const LOCAL_MQTT_TOPIC_COLOR = settings.mqttTopicColor || 'mobileLights';
const LOCAL_MQTT_TOPIC_PIXELS = settings.mqttTopicPixels || 'falcon/player/FPP/mobileLights/pixel/#';

// Cloud MQTT configuration (your cloud broker)
// Uses token as username and API key as password automatically
const CLOUD_MQTT_BROKER = settings.cloudMqttBroker || 'mqtt://192.168.83.45:1883';
let CLOUD_MQTT_USERNAME = '';  // Will be set to token after initialization
let CLOUD_MQTT_PASSWORD = API_KEY;  // API key is the password

const FPP_HOST = settings.fppHost || '127.0.0.1';
const FORWARD_INTERVAL = 40; // Forward data every 40ms (~25 FPS)

let showToken = null;
let cloudSocket = null;
let localMqttClient = null;
let cloudMqttClient = null;
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

// Get MQTT broker settings from FPP
async function getMQTTBrokerFromFPP() {
    try {
        // Try to get MQTT settings from FPP API
        const response = await axios.get(`http://${FPP_HOST}/api/settings`, {
            timeout: 5000
        });
        
        const mqttHost = response.data.MQTTHost || 'localhost';
        const mqttPort = response.data.MQTTPort || 1883;
        const mqttBroker = `mqtt://${mqttHost}:${mqttPort}`;
        
        console.log(`✓ Retrieved MQTT broker from FPP: ${mqttBroker}`);
        return mqttBroker;
    } catch (error) {
        console.log(`Could not get MQTT broker from FPP (${error.message}), using configured value`);
        return null;
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
        
        // Set cloud MQTT username to token
        CLOUD_MQTT_USERNAME = showToken;
        
        // Get MQTT broker from FPP if not configured
        if (!settings.mqttBroker || settings.mqttBroker.trim() === '') {
            const fppMqttBroker = await getMQTTBrokerFromFPP();
            if (fppMqttBroker) {
                // Override with FPP's MQTT broker
                global.MQTT_BROKER_OVERRIDE = fppMqttBroker;
            }
        } else {
            console.log(`Using configured MQTT broker: ${settings.mqttBroker}`);
        }
        
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

// Store latest channel data from local MQTT
let latestChannelData = new Array(512).fill(0);
let lastDataTime = 0;

// Connect to local FPP MQTT broker and subscribe to channel data
function connectToLocalMQTT() {
    const brokerUrl = global.MQTT_BROKER_OVERRIDE || LOCAL_MQTT_BROKER;
    
    console.log(`Connecting to local FPP MQTT broker at ${brokerUrl}...`);
    console.log(`Will subscribe to topics: ${LOCAL_MQTT_TOPIC_COLOR} and ${LOCAL_MQTT_TOPIC_PIXELS}`);
    
    const mqttOptions = {
        reconnectPeriod: 5000,
        connectTimeout: 10000
    };
    
    // Add authentication if provided
    if (settings.mqttUsername) {
        mqttOptions.username = settings.mqttUsername;
        console.log(`Using local MQTT authentication (username: ${settings.mqttUsername})`);
    }
    if (settings.mqttPassword) {
        mqttOptions.password = settings.mqttPassword;
    }
    
    localMqttClient = mqtt.connect(brokerUrl, mqttOptions);
    
    localMqttClient.on('connect', () => {
        console.log('✓ Connected to local FPP MQTT broker');
        
        // Subscribe to color topic
        localMqttClient.subscribe(LOCAL_MQTT_TOPIC_COLOR, (err) => {
            if (err) {
                console.error('Failed to subscribe to local color topic:', err.message);
            } else {
                console.log(`✓ Subscribed to ${LOCAL_MQTT_TOPIC_COLOR}`);
            }
        });
        
        // Subscribe to pixel topics (wildcard)
        localMqttClient.subscribe(LOCAL_MQTT_TOPIC_PIXELS, (err) => {
            if (err) {
                console.error('Failed to subscribe to local pixel topics:', err.message);
            } else {
                console.log(`✓ Subscribed to ${LOCAL_MQTT_TOPIC_PIXELS}`);
            }
        });
    });
    
    localMqttClient.on('message', (topic, message) => {
        try {
            processLocalMQTTMessage(topic, message.toString());
        } catch (error) {
            console.error('Error processing local MQTT message:', error.message);
            stats.errors++;
        }
    });
    
    localMqttClient.on('error', (error) => {
        console.error(`Local MQTT connection error: ${error.message}`);
        stats.errors++;
    });
    
    localMqttClient.on('close', () => {
        console.log('Local MQTT connection closed. Will attempt to reconnect...');
    });
    
    localMqttClient.on('reconnect', () => {
        console.log('Reconnecting to local MQTT broker...');
    });
}

// Connect to cloud MQTT broker for bridging
function connectToCloudMQTT() {
    console.log(`Connecting to cloud MQTT broker at ${CLOUD_MQTT_BROKER}...`);
    
    const mqttOptions = {
        reconnectPeriod: 5000,
        connectTimeout: 10000,
        username: CLOUD_MQTT_USERNAME,
        password: CLOUD_MQTT_PASSWORD
    };
    
    cloudMqttClient = mqtt.connect(CLOUD_MQTT_BROKER, mqttOptions);
    
    cloudMqttClient.on('connect', () => {
        console.log('✓ Connected to cloud MQTT broker');
        console.log(`  Publishing to: shows/${showToken}/color and shows/${showToken}/pixels/#`);
    });
    
    cloudMqttClient.on('error', (error) => {
        console.error(`Cloud MQTT connection error: ${error.message}`);
        stats.errors++;
    });
    
    cloudMqttClient.on('close', () => {
        console.log('Cloud MQTT connection closed. Will attempt to reconnect...');
    });
    
    cloudMqttClient.on('reconnect', () => {
        console.log('Reconnecting to cloud MQTT broker...');
    });
}

// Process local MQTT message and bridge to cloud
function processLocalMQTTMessage(topic, message) {
    try {
        // Parse RGB values from message
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
        
        // Check if this is a pixel topic (e.g., falcon/player/FPP/mobileLights/pixel/1)
        const pixelMatch = topic.match(/pixel\/(\d+)$/);
        
        if (pixelMatch) {
            // This is a pixel topic - store in pixel array
            const pixelIndex = parseInt(pixelMatch[1]) - 1; // 0-indexed
            if (pixelIndex >= 0 && pixelIndex < 10) {
                const offset = 3 + (pixelIndex * 3);
                latestChannelData[offset] = r;
                latestChannelData[offset + 1] = g;
                latestChannelData[offset + 2] = b;
                
                // Bridge to cloud MQTT
                if (cloudMqttClient && cloudMqttClient.connected) {
                    const cloudTopic = `shows/${showToken}/pixels/${pixelIndex + 1}`;
                    cloudMqttClient.publish(cloudTopic, message);
                }
                
                // Log first few messages for debugging
                if (stats.packetsReceived < 5) {
                    console.log(`Pixel ${pixelIndex + 1} data: RGB(${r}, ${g}, ${b}) -> channels ${offset}-${offset+2}`);
                }
            }
        } else {
            // This is the main color topic - store in channels 0-2
            latestChannelData[0] = r;
            latestChannelData[1] = g;
            latestChannelData[2] = b;
            
            // Bridge to cloud MQTT
            if (cloudMqttClient && cloudMqttClient.connected) {
                const cloudTopic = `shows/${showToken}/color`;
                cloudMqttClient.publish(cloudTopic, message);
            }
            
            // Log first few messages for debugging
            if (stats.packetsReceived < 5) {
                console.log(`Main color data: RGB(${r}, ${g}, ${b}) -> channels 0-2`);
            }
        }
        
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
    const brokerUrl = global.MQTT_BROKER_OVERRIDE || MQTT_BROKER;
    
    console.log('\n' + '='.repeat(60));
    console.log('FPP CLOUD CONNECTOR PLUGIN (MQTT)');
    console.log('='.repeat(60));
    console.log(`Show token: ${showToken}`);
    console.log(`Cloud server: ${CLOUD_SERVER_URL}`);
    console.log(`MQTT Broker: ${brokerUrl}`);
    console.log(`Color Topic: ${MQTT_TOPIC_COLOR}`);
    console.log(`Pixel Topics: ${MQTT_TOPIC_PIXELS}`);
    console.log(`Forward interval: ${FORWARD_INTERVAL}ms`);
    console.log('='.repeat(60));
    console.log('\nMQTT Output Configuration in FPP:');
    console.log('  Main Color (single pixel for cloud-display.html):');
    console.log(`    Topic: ${MQTT_TOPIC_COLOR}`);
    console.log('    Payload: %R%,%G%,%B%');
    console.log('  ');
    console.log('  Pixels (10 outputs for cloud-pixels.html):');
    console.log('    Pixel 1 (channels 9491-9493): falcon/player/FPP/mobileLights/pixel/1');
    console.log('    Pixel 2 (channels 9494-9496): falcon/player/FPP/mobileLights/pixel/2');
    console.log('    ...');
    console.log('    Pixel 10 (channels 9518-9520): falcon/player/FPP/mobileLights/pixel/10');
    console.log('='.repeat(60) + '\n');
    
    // Connect to local FPP MQTT broker
    connectToLocalMQTT();
    
    // Connect to cloud MQTT broker for bridging
    connectToCloudMQTT();
    
    // Forward data to cloud WebSocket periodically
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
