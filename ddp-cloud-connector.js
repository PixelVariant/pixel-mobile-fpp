const { io } = require('socket.io-client');
const axios = require('axios');
const dgram = require('dgram');
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

const API_SERVER_URL = settings.cloudServerUrl.replace(':3002', ':3001');
const CLOUD_SERVER_URL = settings.cloudServerUrl;
const API_KEY = settings.apiKey;
const UNIVERSE = parseInt(settings.universe);
const MODEL_NAME = settings.modelName || '';

// E1.31 Listener configuration
const E131_PORT = 5568;  // Standard E1.31 port
const POLL_INTERVAL = 40; // Process data every 40ms (~25 FPS)

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

// Store latest channel data from E1.31
let latestChannelData = new Array(512).fill(0);
let lastPacketTime = 0;

// Create UDP socket to listen for E1.31 data
const udpSocket = dgram.createSocket('udp4');

udpSocket.on('error', (err) => {
    console.error(`UDP socket error:\n${err.stack}`);
    udpSocket.close();
});

udpSocket.on('message', (msg, rinfo) => {
    try {
        // E1.31 packet structure (simplified)
        // Bytes 0-17: RLP Preamble
        // Bytes 18-37: Frame Layer
        // Bytes 38-115: DMP Layer
        // Bytes 116+: DMX data (1 byte start code + 512 bytes channel data)
        
        if (msg.length < 126) return; // Minimum E1.31 packet size
        
        // Check for E1.31 packet (ASC-E1.17)
        const vector = msg.readUInt32BE(18);
        if (vector !== 0x00000004) return; // Not E1.31 DATA packet
        
        // Get universe number
        const packetUniverse = msg.readUInt16BE(113);
        
        // Only process our target universe
        if (packetUniverse !== UNIVERSE) return;
        
        // DMX data starts at byte 126 (after start code at 125)
        const dmxData = msg.slice(126);
        
        // Update our channel data buffer
        for (let i = 0; i < Math.min(512, dmxData.length); i++) {
            latestChannelData[i] = dmxData[i];
        }
        
        lastPacketTime = Date.now();
        stats.packetsReceived++;
        
        if (stats.packetsReceived % 100 === 0) {
            console.log(`✓ Receiving E1.31 Universe ${UNIVERSE}: [${latestChannelData.slice(0, 10).join(', ')}]`);
        }
    } catch (error) {
        console.error('Error parsing E1.31 packet:', error.message);
    }
});

udpSocket.on('listening', () => {
    const address = udpSocket.address();
    console.log(`✓ Listening for E1.31 on port ${address.port}`);
    console.log(`  Configure FPP to output Universe ${UNIVERSE} to 127.0.0.1:${E131_PORT}\n`);
});

// Bind to E1.31 port
try {
    udpSocket.bind(E131_PORT);
} catch (error) {
    console.error(`Failed to bind to port ${E131_PORT}:`, error.message);
    console.error('Make sure no other E1.31 receiver is running.');
    process.exit(1);
}

// Start sending E1.31 data to cloud
function startDataForwarder() {
    console.log('\n' + '='.repeat(60));
    console.log('DDP MOBILE CLOUD CONNECTOR (FPP PLUGIN)');
    console.log('='.repeat(60));
    console.log(`Listening for E1.31 Universe ${UNIVERSE}`);
    console.log(`Show token: ${showToken}`);
    console.log(`Cloud server: ${CLOUD_SERVER_URL}`);
    console.log(`Forward interval: ${POLL_INTERVAL}ms`);
    console.log('='.repeat(60) + '\n');
    
    // Forward data to cloud periodically
    setInterval(() => {
        try {
            // Check if we've received data recently (within last second)
            if (Date.now() - lastPacketTime > 1000) {
                return; // No recent data
            }
            
            // Extract single color (channels 1-3)
            const r = latestChannelData[0];
            const g = latestChannelData[1];
            const b = latestChannelData[2];
            
            // Extract 10 pixels (channels 4-33)
            const pixels = [];
            for (let i = 0; i < 10; i++) {
                const offset = 3 + (i * 3);
                pixels.push({
                    r: latestChannelData[offset],
                    g: latestChannelData[offset + 1],
                    b: latestChannelData[offset + 2]
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
                    console.log(`Sent packet ${stats.packetsSent}, connected: ${cloudSocket.connected}`);
                }
            } else {
                console.log('Socket not connected, cannot send data');
            }
            
        } catch (error) {
            console.error('Channel data processing error:', error.message);
            stats.errors++;
        }
    }, POLL_INTERVAL);
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
