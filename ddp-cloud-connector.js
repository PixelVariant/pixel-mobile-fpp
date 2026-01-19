const dgram = require('dgram');
const { io } = require('socket.io-client');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

// Load settings
const settingsFile = path.join(__dirname, 'settings', 'config.json');
let settings = {
    apiKey: '',
    cloudServerUrl: 'http://localhost:3002',
    universe: 5,
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

const E131_PORT = 5568;
const API_SERVER_URL = settings.cloudServerUrl.replace(':3002', ':3001');
const CLOUD_SERVER_URL = settings.cloudServerUrl;
const API_KEY = settings.apiKey;
const UNIVERSE = parseInt(settings.universe);

// E1.31 configuration
const SINGLE_COLOR_CHANNEL = 1;
const PIXELS_START_CHANNEL = 4;
const NUM_PIXELS = 10;

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
        
        // Start E1.31 receiver
        startE131Receiver();
        
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

// Start E1.31 UDP receiver
function startE131Receiver() {
    const udpSocket = dgram.createSocket('udp4');
    
    udpSocket.on('error', (err) => {
        console.error('UDP socket error:', err);
        stats.errors++;
        saveStats();
    });
    
    udpSocket.on('message', (msg, rinfo) => {
        try {
            // Validate E1.31 packet
            if (msg.length < 126) {
                return;
            }
            
            // Check ACN identifier
            const acnId = msg.toString('ascii', 4, 16);
            if (acnId !== 'ASC-E1.17\0\0\0') {
                return;
            }
            
            // Get universe
            const universe = msg.readUInt16BE(113);
            if (universe !== UNIVERSE) {
                return;
            }
            
            stats.packetsReceived++;
            
            // Extract DMX data
            const dmxDataOffset = 126;
            
            // Extract single color (channels 1-3)
            const r = msg[dmxDataOffset + SINGLE_COLOR_CHANNEL - 1] || 0;
            const g = msg[dmxDataOffset + SINGLE_COLOR_CHANNEL] || 0;
            const b = msg[dmxDataOffset + SINGLE_COLOR_CHANNEL + 1] || 0;
            
            // Extract 10 pixels (channels 4-33)
            const pixels = [];
            for (let i = 0; i < NUM_PIXELS; i++) {
                const pixelOffset = dmxDataOffset + PIXELS_START_CHANNEL - 1 + (i * 3);
                pixels.push({
                    r: msg[pixelOffset] || 0,
                    g: msg[pixelOffset + 1] || 0,
                    b: msg[pixelOffset + 2] || 0
                });
            }
            
            // Send to cloud server
            if (cloudSocket && cloudSocket.connected) {
                cloudSocket.emit('lighting-data', {
                    apiKey: API_KEY,
                    token: showToken,
                    color: { r, g, b },
                    pixels: pixels
                });
                stats.packetsSent++;
            }
            
        } catch (error) {
            console.error('Packet processing error:', error.message);
            stats.errors++;
        }
    });
    
    udpSocket.on('listening', () => {
        const address = udpSocket.address();
        console.log('\n' + '='.repeat(60));
        console.log('DDP MOBILE CLOUD CONNECTOR (FPP PLUGIN)');
        console.log('='.repeat(60));
        console.log(`E1.31 listening on ${address.address}:${address.port}`);
        console.log(`Target universe: ${UNIVERSE}`);
        console.log(`Show token: ${showToken}`);
        console.log(`Cloud server: ${CLOUD_SERVER_URL}`);
        console.log('='.repeat(60) + '\n');
    });
    
    udpSocket.bind(E131_PORT);
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
