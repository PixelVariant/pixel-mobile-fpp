const { io } = require('socket.io-client');
const axios = require('axios');
const http = require('http');
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

// FPP HTTP Virtual Display configuration
const FPP_VIRTUAL_DISPLAY_PORT = 32328;  // FPP's HTTPVirtualDisplay port
const FPP_HOST = settings.fppHost || '127.0.0.1';  // From settings, default to localhost
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

// Store latest channel data from FPP Virtual Display
let latestChannelData = new Array(512).fill(0);
let lastDataTime = 0;

// Base64 decode table (for FPP's SSE data format)
const base64Table = {};
const base64Chars = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz+/";
for (let i = 0; i < base64Chars.length; i++) {
    base64Table[base64Chars[i]] = i;
}

// Connect to FPP's HTTP Virtual Display SSE stream
function connectToFPPVirtualDisplay() {
    const options = {
        hostname: FPP_HOST,
        port: FPP_VIRTUAL_DISPLAY_PORT,
        path: '/api/http-virtual-display/',
        method: 'GET',
        headers: {
            'Accept': 'text/event-stream',
            'Cache-Control': 'no-cache'
        }
    };
    
    console.log(`Connecting to FPP HTTP Virtual Display at ${FPP_HOST}:${FPP_VIRTUAL_DISPLAY_PORT}...`);
    
    const req = http.request(options, (res) => {
        if (res.statusCode !== 200) {
            console.error(`Failed to connect to FPP Virtual Display. Status: ${res.statusCode}`);
            console.error('Make sure you have configured an "HTTP Virtual Display" output in FPP.');
            console.error('Go to: Input/Output Setup -> Channel Outputs -> Add HTTP Virtual Display');
            setTimeout(connectToFPPVirtualDisplay, 5000);
            return;
        }
        
        console.log('✓ Connected to FPP HTTP Virtual Display SSE stream');
        
        let buffer = '';
        
        res.on('data', (chunk) => {
            buffer += chunk.toString();
            
            // Process complete SSE messages
            const lines = buffer.split('\n\n');
            buffer = lines.pop(); // Keep incomplete message in buffer
            
            lines.forEach(message => {
                if (message.trim() === '') return;
                
                // Parse SSE message
                const dataMatch = message.match(/data: (.+)/);
                if (dataMatch) {
                    processSSEData(dataMatch[1]);
                }
            });
        });
        
        res.on('end', () => {
            console.log('SSE connection closed. Reconnecting in 2 seconds...');
            setTimeout(connectToFPPVirtualDisplay, 2000);
        });
    });
    
    req.on('error', (error) => {
        console.error(`Connection error to FPP Virtual Display: ${error.message}`);
        console.error('Retrying in 5 seconds...');
        setTimeout(connectToFPPVirtualDisplay, 5000);
    });
    
    req.end();
}

// Process SSE data from FPP
// Format: "RGB666:XY;XY;XY|RGB666:XY;XY;XY"
// RGB666 = 3 base64 chars (6 bits each = 18 bits for RGB)
// XY = 2-6 base64 chars for x,y coordinates
function processSSEData(data) {
    try {
        const colorGroups = data.split('|');
        
        colorGroups.forEach(group => {
            const [colorStr, locations] = group.split(':');
            if (!colorStr || !locations) return;
            
            // Decode RGB from base64 (3 chars = 18 bits, 6 bits per channel)
            const r = (base64Table[colorStr[0]] << 2);  // 6 bits -> 8 bits
            const g = (base64Table[colorStr[1]] << 2);
            const b = (base64Table[colorStr[2]] << 2);
            
            // For now, just store the first pixel's RGB in channels 0-2
            // and mark that we received data
            if (latestChannelData[0] === undefined || colorGroups.indexOf(group) === 0) {
                latestChannelData[0] = r;
                latestChannelData[1] = g;
                latestChannelData[2] = b;
            }
            
            // Parse locations and store more pixels
            const locs = locations.split(';');
            locs.forEach((loc, idx) => {
                if (idx < 10) { // Store up to 10 pixels
                    const offset = 3 + (idx * 3);
                    latestChannelData[offset] = r;
                    latestChannelData[offset + 1] = g;
                    latestChannelData[offset + 2] = b;
                }
            });
        });
        
        lastDataTime = Date.now();
        stats.packetsReceived++;
        
        if (stats.packetsReceived % 100 === 0) {
            const rgb = latestChannelData.slice(0, 3);
            console.log(`✓ Receiving FPP data: RGB [${rgb.join(', ')}], Packets: ${stats.packetsReceived}`);
        }
    } catch (error) {
        console.error('Error parsing SSE data:', error.message);
        stats.errors++;
    }
}

// Start sending data to cloud
function startDataForwarder() {
    console.log('\n' + '='.repeat(60));
    console.log('FPP CLOUD CONNECTOR PLUGIN');
    console.log('='.repeat(60));
    console.log(`Show token: ${showToken}`);
    console.log(`Cloud server: ${CLOUD_SERVER_URL}`);
    console.log(`FPP Virtual Display: ${FPP_HOST}:${FPP_VIRTUAL_DISPLAY_PORT}`);
    console.log(`Forward interval: ${FORWARD_INTERVAL}ms`);
    console.log('='.repeat(60));
    console.log('\nIMPORTANT: You must configure FPP with an HTTP Virtual Display output:');
    console.log('  1. Go to Input/Output Setup -> Channel Outputs');
    console.log('  2. Add new output: HTTP Virtual Display');
    console.log('  3. Set start channel to 1, channel count to 33');
    console.log('  4. Enable the output');
    console.log('='.repeat(60) + '\n');
    
    // Connect to FPP's Virtual Display
    connectToFPPVirtualDisplay();
    
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
