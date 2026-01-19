# FPP Plugin - DDP Mobile Cloud Connector

Forwards E1.31 lighting data from FPP to the DDP Mobile cloud platform, enabling audience participation in your Christmas light show.

## Overview

This plugin listens for E1.31 (sACN) packets on your FPP controller and forwards them to a cloud server where viewers can sync their mobile phones to your light show in real-time.

## Features

- 🎄 **Real-time Sync**: Forward E1.31 data to cloud instantly
- 📱 **Mobile Friendly**: Viewers use any web browser
- 🎨 **Multi-Display**: Support for single color and multi-pixel displays
- 🔧 **Easy Setup**: Configure through FPP web interface
- 📊 **Live Stats**: Monitor packet flow and connection status
- 🔄 **Auto-Reconnect**: Handles network issues gracefully

## Installation

### Method 1: From FPP Plugin Manager (Recommended)

1. Open FPP web interface
2. Go to **Content Setup** → **Plugin Manager**
3. Search for "DDP Mobile Cloud Connector"
4. Click **Install**

### Method 2: Manual Installation

```bash
cd /opt/fpp/plugins
git clone https://github.com/yourusername/fpp-plugin-DDP-Mobile.git
cd fpp-plugin-DDP-Mobile
npm install
chmod +x scripts/*.sh
```

## Quick Start

### 1. Setup Cloud Server

First, deploy the DDP Mobile cloud platform (see main repo documentation):

```bash
# Clone main repo
git clone https://github.com/yourusername/ddp-mobile.git
cd ddp-mobile

# Configure
cp .env.example .env
nano .env

# Deploy
docker-compose up -d
```

### 2. Register Your Show

Visit your admin page (e.g., `http://your-server:3000/admin.html`):

1. Enter show name and email
2. Click "Create Show"
3. Copy the **API Key** (not the viewer token!)

### 3. Configure Plugin

In FPP web interface:

1. Go to **Status/Control** → **DDP Mobile - Settings**
2. Paste your API key
3. Enter cloud server URL (e.g., `http://your-server.com:3002`)
4. Set universe number (default: 5)
5. Check "Enable DDP Mobile Cloud Connector"
6. Click **Save Settings**

### 4. Configure xLights

1. Go to **Setup** → **E1.31 Setup**
2. Add controller:
   - IP: Your FPP IP address
   - Port: 5568
   - Universe: 5 (or match plugin setting)
   - Channels: 510

3. Map elements:
   - **Single Color**: Channels 1-3 (RGB)
   - **10-Pixel String**: Channels 4-33 (10 pixels × 3 channels)

### 5. Share with Audience

Give viewers the **6-character token** from Step 2:

1. They visit: `http://your-server:3000`
2. Select "Cloud Mode"
3. Enter token
4. Choose display type
5. Enjoy synchronized lights!

## Configuration

### Settings Page

- **Enable Connector**: Turn service on/off
- **API Key**: Your show's unique API key
- **Cloud Server URL**: WebSocket server address
- **Universe**: E1.31 universe to monitor

### Status Page

Monitor real-time stats:
- Service status (running/stopped)
- Packets received/sent
- Error count
- Cloud connection status
- Last update timestamp

## Channel Mapping

The plugin reads specific DMX channels from the selected universe:

| Display Type | Channels | Description |
|--------------|----------|-------------|
| Single Color | 1-3 | RGB values for full-screen color |
| 10-Pixel String | 4-33 | 10 pixels × 3 channels (RGB) |

**Example xLights setup:**
```
Universe 5:
  Channel 1-3:   Single pixel (RGB) - Full screen color
  Channel 4-6:   Pixel 1 (RGB)
  Channel 7-9:   Pixel 2 (RGB)
  Channel 10-12: Pixel 3 (RGB)
  ...
  Channel 31-33: Pixel 10 (RGB)
```

## Troubleshooting

### Plugin Won't Start

**Check API Key:**
```bash
# View settings
cat /opt/fpp/plugins/fpp-plugin-DDP-Mobile/settings/config.json

# Check if valid
curl http://your-server:3001/api/validate-key/YOUR-API-KEY
```

**Check Logs:**
```bash
# FPP system logs
tail -f /var/log/messages | grep -i ddp

# Plugin process
ps aux | grep ddp-cloud-connector
```

### No Packets Received

1. **Verify E1.31 output:**
   - FPP: Status page → Channel Outputs → Verify universe is active
   - xLights: Tools → E1.31 Sync → Check packets sent

2. **Check universe number:**
   ```bash
   # Listen for E1.31 packets
   tcpdump -i any -n udp port 5568
   ```

3. **Firewall:**
   ```bash
   # Allow UDP 5568
   sudo iptables -A INPUT -p udp --dport 5568 -j ACCEPT
   ```

### Cloud Connection Failed

1. **Test cloud server:**
   ```bash
   curl http://your-server:3002/health
   ```

2. **Check connectivity:**
   ```bash
   ping your-server.com
   telnet your-server.com 3002
   ```

3. **Verify API server:**
   ```bash
   curl http://your-server:3001/health
   ```

### Viewers Can't Connect

1. **Validate token:**
   ```bash
   curl http://your-server:3001/api/validate/TOKEN123
   ```

2. **Check cloud server logs:**
   ```bash
   docker-compose logs cloud-server
   ```

3. **Test WebSocket:**
   - Open browser console
   - Try connecting to `http://your-server:3002`
   - Check for CORS errors

## Architecture

```
┌─────────────┐         ┌──────────────────┐         ┌─────────────┐
│ xLights/FPP │ ──E1.31→│  FPP Plugin      │ ──WS──→ │Cloud Server │
│             │         │  (This Plugin)   │         │  (Rooms)    │
└─────────────┘         └──────────────────┘         └─────────────┘
                                                             │
                                                             │ WS
                                                             ▼
                                                      ┌─────────────┐
                                                      │   Viewers   │
                                                      │ (Mobile Web)│
                                                      └─────────────┘
```

## Development

### File Structure

```
fpp-plugin-DDP-Mobile/
├── pluginInfo.json           # Plugin metadata
├── menu.inc                  # FPP menu integration
├── settings.php              # Configuration page
├── status.php                # Status/monitoring page
├── help.php                  # Help documentation
├── about.php                 # About/credits page
├── package.json              # Node.js dependencies
├── ddp-cloud-connector.js    # Main service
├── scripts/
│   ├── fpp_install.sh        # Installation script
│   ├── fpp_uninstall.sh      # Uninstallation script
│   ├── preStart.sh           # Start service with FPP
│   └── preStop.sh            # Stop service with FPP
└── settings/
    ├── config.json           # User configuration
    └── stats.json            # Runtime statistics
```

### Local Testing

```bash
# Navigate to plugin directory
cd /opt/fpp/plugins/fpp-plugin-DDP-Mobile

# Install dependencies
npm install

# Configure settings
nano settings/config.json

# Run manually
node ddp-cloud-connector.js
```

### Debug Mode

Enable verbose logging:

```javascript
// In ddp-cloud-connector.js, add:
const DEBUG = true;

if (DEBUG) console.log('Debug message here');
```

## API Reference

### Plugin Files

**settings.php** - Configuration interface
- Saves to: `settings/config.json`
- Form fields: apiKey, cloudServerUrl, universe, enabled

**status.php** - Monitoring interface
- Reads from: `settings/stats.json`
- Updated every 30 seconds by connector

**ddp-cloud-connector.js** - Main service
- Listens: UDP 5568 (E1.31)
- Connects: WebSocket to cloud server
- Emits: `lighting-data` events with RGB values

### Cloud API Endpoints

Used by plugin:

- `GET /api/validate-key/:apiKey` - Validate API key
- `WS /` - WebSocket connection
- `emit('lighting-data', data)` - Send lighting update

## Performance

**Network:**
- ~40 E1.31 packets/sec (typical)
- ~1 KB/sec bandwidth usage
- <10ms forwarding latency

**Resources:**
- CPU: <1% on Raspberry Pi 4
- Memory: ~50MB Node.js process
- Disk: <1MB for plugin files

## Security

**Best Practices:**
1. Keep API key secret (never share publicly)
2. Use HTTPS in production (reverse proxy)
3. Restrict firewall to necessary ports
4. Regularly update plugin and dependencies
5. Monitor logs for suspicious activity

## Updates

**Check for updates:**
```bash
cd /opt/fpp/plugins/fpp-plugin-DDP-Mobile
git fetch
git status
```

**Update plugin:**
```bash
git pull
npm install
sudo systemctl restart fppd
```

## Support

- **Issues**: https://github.com/yourusername/fpp-plugin-DDP-Mobile/issues
- **Discussions**: https://github.com/yourusername/fpp-plugin-DDP-Mobile/discussions
- **Main Project**: https://github.com/yourusername/ddp-mobile

## Contributing

Pull requests welcome! Please:
1. Fork the repository
2. Create feature branch
3. Test on FPP device
4. Submit PR with description

## License

MIT License - See LICENSE file

## Credits

**Developed by:** DDP Mobile Team

**Built with:**
- Node.js & Socket.io
- FPP Plugin Framework
- E1.31 (sACN) Protocol

**Thanks to:**
- Falcon Christmas Community
- FPP Development Team
- xLights Contributors
