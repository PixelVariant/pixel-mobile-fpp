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

const API_SERVER_URL = settings.cloudServerUrl.replace(':3002', ':3001');
const CLOUD_SERVER_URL = settings.cloudServerUrl;
const API_KEY = settings.apiKey;
const UNIVERSE = parseInt(settings.universe);
const MODEL_NAME = settings.modelName || '';

// FPP API configuration
const FPP_API_URL = 'http://localhost';
const UNIVERSE_SIZE = 512; // Standard DMX universe size
const ABSOLUTE_START_CHANNEL = ((UNIVERSE - 1) * UNIVERSE_SIZE) + 1;
const SINGLE_COLOR_CHANNEL = 1;
const PIXELS_START_CHANNEL = 4;
const NUM_PIXELS = 10;
const POLL_INTERVAL = 40; // Poll every 40ms (~25 FPS)

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
        
        // Start reading FPP channel data
        startChannelDataReader();
        
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

// Read channel data from FPP shared memory file
function readChannelData() {
    try {
        // FPP creates model-specific data files in /dev/shm/
        let channelDataFile = null;
        
        if (MODEL_NAME) {
            // Convert model name to filename format (spaces to underscores)
            const filename = MODEL_NAME.replace(/ /g, '_');
            channelDataFile = `/dev/shm/FPP-Model-Data-${filename}`;
            
            if (!fs.existsSync(channelDataFile)) {
                if (stats.packetsReceived % 100 === 0) {
                    console.log(`\nWARNING: Model data file not found: ${channelDataFile}`);
                    console.log(`Make sure model "${MODEL_NAME}" exists and is being used.\n`);
                }
                return null;
            }
        } else {
            // Without a model name, we'd need to read the main channel data file
            channelDataFile = '/dev/shm/FPP-ChannelData';
            
            if (!fs.existsSync(channelDataFile)) {
                if (stats.packetsReceived % 100 === 0) {
                    console.log(`\nWARNING: Channel data file not found. Please specify a model name.\n`);
                }
                return null;
            }
        }
        
        return readFromFile(channelDataFile);
    } catch (error) {
        if (stats.packetsReceived % 1000 === 0) {
            console.error('Error reading channel data:', error.message);
        }
        return null;
    }
}

function readFromFile(filePath) {
    try {
        const buffer = fs.readFileSync(filePath);
        let channelData = new Array(33).fill(0);
        
        if (stats.packetsReceived === 1) {
            console.log(`\n=== READING FROM ${filePath} ===`);
            console.log(`File size: ${buffer.length} bytes`);
        }
        
        // Read first 33 bytes (FPP model data files contain raw channel values)
        for (let i = 0; i < Math.min(33, buffer.length); i++) {
            channelData[i] = buffer[i];
        }
        
        if (stats.packetsReceived === 1) {
            console.log(`Reading first 33 bytes as RGB channels`);
            console.log(`First 10 values: [${channelData.slice(0, 10).join(', ')}]`);
            console.log(`================================\n`);
        }
        
        // Log non-zero data occasionally
        if (stats.packetsReceived % 100 === 0) {
            const hasData = channelData.some(v => v > 0);
            if (hasData) {
                console.log(`✓ Reading live data: R=${channelData[0]} G=${channelData[1]} B=${channelData[2]} [${channelData.slice(0, 10).join(', ')}]`);
            } else if (stats.packetsReceived % 500 === 0) {
                console.log(`No data (all zeros) - is sequence playing and affecting this model?`);
            }
        }
        
        return channelData;
    } catch (error) {
        throw error;
    }
}

// Old API-based function (keeping for reference but not used)
async function readChannelDataFromAPI() {
    try {
        const response = await axios.get(`${FPP_API_URL}/api/models`, {
            timeout: 100
        });
        
        if (!response.data || !Array.isArray(response.data)) {
            return null;
        }
        
        // Debug: Show raw response structure once
        if (stats.packetsReceived === 1) {
            console.log(`\n=== RAW FPP API RESPONSE SAMPLE ===`);
            console.log(JSON.stringify(response.data[0], null, 2));
            console.log(`===================================\n`);
        }
        
        // Debug: List available models every 100 packets
        if (stats.packetsReceived % 100 === 0) {
            console.log(`\n=== AVAILABLE MODELS FROM FPP ===`);
            console.log(`Total models: ${response.data.length}`);
            response.data.slice(0, 5).forEach(m => {
                const hasData = m.data && m.data.length > 0;
                const dataPreview = hasData ? m.data.split(',').slice(0, 5).join(',') : 'NO DATA';
                console.log(`  - "${m.Name}" (Ch ${m.StartChannel}, Count: ${m.ChannelCount}) Data: [${dataPreview}${hasData ? '...' : ''}]`);
            });
            if (response.data.length > 5) {
                console.log(`  ... and ${response.data.length - 5} more`);
            }
            console.log(`================================\n`);
        }
        
        let channelData = new Array(33).fill(0);
        
        // If model name is specified, use that model
        if (MODEL_NAME) {
            const model = response.data.find(m => m.Name === MODEL_NAME);
            if (model && model.data) {
                const data = model.data.split(',');
                
                // Debug log every 100 packets
                if (stats.packetsReceived % 100 === 0) {
                    console.log(`\n=== FPP DATA DEBUG ===`);
                    console.log(`Model: ${MODEL_NAME}`);
                    console.log(`StartChannel: ${model.StartChannel}, ChannelCount: ${model.ChannelCount}`);
                    console.log(`First 10 values from FPP: [${data.slice(0, 10).join(', ')}]`);
                }
                
                // Take first 33 values from the model
                for (let i = 0; i < Math.min(33, data.length); i++) {
                    channelData[i] = parseInt(data[i]) || 0;
                }
            } else {
                if (stats.packetsReceived % 100 === 0) {
                    console.log(`WARNING: Model "${MODEL_NAME}" not found or has no data`);
                }
            }
        } else {
            // Use universe-based channel mapping
            const startChannel = ABSOLUTE_START_CHANNEL;
            const endChannel = startChannel + 32; // Channels 1-33
            
            for (const model of response.data) {
                const modelStart = model.StartChannel;
                const modelEnd = modelStart + model.ChannelCount - 1;
                
                // Check if this model overlaps our channels
                if (modelEnd >= startChannel && modelStart <= endChannel) {
                    const data = model.data ? model.data.split(',') : [];
                    
                    // Extract relevant channels
                    for (let i = 0; i < 33; i++) {
                        const absChannel = startChannel + i;
                        if (absChannel >= modelStart && absChannel <= modelEnd) {
                            const dataIndex = absChannel - modelStart;
                            if (dataIndex < data.length && data[dataIndex]) {
                                channelData[i] = parseInt(data[dataIndex]) || 0;
                            }
                        }
                    }
                }
            }
        }
        
        return channelData;
    } catch (error) {
        if (error.code !== 'ECONNREFUSED') {
            console.error('Error reading channel data:', error.message);
            stats.errors++;
        }
        return null;
    }
}

// Start polling FPP API
function startChannelDataReader() {
    console.log('\n' + '='.repeat(60));
    console.log('DDP MOBILE CLOUD CONNECTOR (FPP PLUGIN)');
    console.log('='.repeat(60));
    console.log(`Reading from: FPP channel memory`);
    if (MODEL_NAME) {
        console.log(`Using model: ${MODEL_NAME}`);
    } else {
        console.log(`Target universe: ${UNIVERSE}`);
        console.log(`Absolute channels: ${ABSOLUTE_START_CHANNEL}-${ABSOLUTE_START_CHANNEL + 32}`);
    }
    console.log(`Show token: ${showToken}`);
    console.log(`Cloud server: ${CLOUD_SERVER_URL}`);
    console.log(`Polling interval: ${POLL_INTERVAL}ms`);
    console.log('='.repeat(60) + '\n');
    
    setInterval(() => {
        try {
            const channelData = readChannelData();
            if (!channelData) {
                return;
            }
            
            stats.packetsReceived++;
            
            // Extract single color (channels 1-3)
            const r = channelData[SINGLE_COLOR_CHANNEL - 1];
            const g = channelData[SINGLE_COLOR_CHANNEL - 1 + 1];
            const b = channelData[SINGLE_COLOR_CHANNEL - 1 + 2];
            
            // Extract 10 pixels (channels 4-33)
            const pixels = [];
            const pixelsOffset = PIXELS_START_CHANNEL - 1;
            for (let i = 0; i < NUM_PIXELS; i++) {
                const offset = pixelsOffset + (i * 3);
                pixels.push({
                    r: channelData[offset],
                    g: channelData[offset + 1],
                    b: channelData[offset + 2]
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
