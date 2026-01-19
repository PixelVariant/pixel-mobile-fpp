# FPP Plugin Installation Guide

## Quick Installation

### Method 1: From FPP Plugin Manager (When Available)

1. Open your FPP web interface (e.g., `http://fpp.local`)
2. Navigate to **Content Setup** → **Plugin Manager**
3. Search for "DDP Mobile" or "Cloud Connector"
4. Click **Install**
5. Wait for installation to complete
6. Go to **Status/Control** → **DDP Mobile - Settings** to configure

### Method 2: Manual Installation via Git

```bash
# SSH into your FPP device
ssh fpp@fpp.local
# Password is usually 'falcon'

# Navigate to plugins directory
cd /opt/fpp/plugins

# Clone the plugin
git clone https://github.com/yourusername/fpp-plugin-DDP-Mobile.git

# Install dependencies
cd fpp-plugin-DDP-Mobile
npm install

# Make scripts executable
chmod +x scripts/*.sh

# Restart FPP to load plugin
sudo systemctl restart fppd
```

### Method 3: Upload via FPP Interface

1. Download plugin as ZIP from GitHub
2. In FPP, go to **Content Setup** → **File Manager**
3. Navigate to `/opt/fpp/plugins/`
4. Upload and extract ZIP
5. SSH in and run:
   ```bash
   cd /opt/fpp/plugins/fpp-plugin-DDP-Mobile
   npm install
   chmod +x scripts/*.sh
   sudo systemctl restart fppd
   ```

## Configuration

### 1. Get Your API Key

First, register your show on the cloud platform:

```bash
# From your server (or use admin web page)
curl -X POST http://your-server:3001/api/shows \
  -H "Content-Type: application/json" \
  -d '{"name":"My Christmas Show","email":"you@example.com"}'
```

Save the `api_key` from the response (NOT the viewer token).

### 2. Configure Plugin in FPP

1. Open FPP web interface
2. Go to **Status/Control** menu
3. Look for **DDP Mobile - Settings**
4. Enter configuration:
   - **Enable Connector**: ☑️ Checked
   - **API Key**: Paste your API key
   - **Cloud Server URL**: `http://your-server.com:3002`
   - **Universe**: `5` (or your chosen universe)
5. Click **Save Settings**

### 3. Verify Installation

1. Go to **Status/Control** → **DDP Mobile - Status**
2. Check that:
   - Service Status shows "Running"
   - Cloud Connection shows ✅
   - Packets are being received and sent

## Troubleshooting Installation

### Plugin Not Showing in Menu

```bash
# Check if plugin directory exists
ls -la /opt/fpp/plugins/fpp-plugin-DDP-Mobile

# Check FPP logs
tail -f /var/log/messages | grep -i fpp

# Restart FPP
sudo systemctl restart fppd
```

### NPM Install Fails

```bash
# Update npm
sudo npm install -g npm

# Clear cache and retry
cd /opt/fpp/plugins/fpp-plugin-DDP-Mobile
npm cache clean --force
npm install
```

### Service Won't Start

```bash
# Check Node.js is installed
node --version
npm --version

# If not installed:
sudo apt-get update
sudo apt-get install -y nodejs npm

# Check settings file
cat /opt/fpp/plugins/fpp-plugin-DDP-Mobile/settings/config.json

# Test manually
cd /opt/fpp/plugins/fpp-plugin-DDP-Mobile
node ddp-cloud-connector.js
# Ctrl+C to stop
```

### Permission Issues

```bash
# Fix ownership
sudo chown -R fpp:fpp /opt/fpp/plugins/fpp-plugin-DDP-Mobile

# Fix script permissions
chmod +x /opt/fpp/plugins/fpp-plugin-DDP-Mobile/scripts/*.sh
```

## Updating the Plugin

### Via Git (Manual Installation)

```bash
cd /opt/fpp/plugins/fpp-plugin-DDP-Mobile
git pull
npm install
sudo systemctl restart fppd
```

### Via Plugin Manager

1. Go to **Content Setup** → **Plugin Manager**
2. Find "DDP Mobile Cloud Connector"
3. Click **Update** if available

## Uninstallation

### Via Plugin Manager

1. Go to **Content Setup** → **Plugin Manager**
2. Find "DDP Mobile Cloud Connector"
3. Click **Uninstall**

### Manual Uninstallation

```bash
# Stop the service
pkill -f ddp-cloud-connector

# Remove plugin directory
sudo rm -rf /opt/fpp/plugins/fpp-plugin-DDP-Mobile

# Restart FPP
sudo systemctl restart fppd
```

## Testing E1.31 Data Flow

### 1. Verify FPP is Receiving E1.31

1. In FPP: **Status/Control** → **Status Page**
2. Check **E1.31 / DDP / ArtNet** section
3. Should show packets being received on your universe

### 2. Test xLights Output

```bash
# On FPP device, listen for E1.31 packets
sudo tcpdump -i any -n udp port 5568

# Start sequence in xLights
# You should see packets in tcpdump output
```

### 3. Verify Plugin is Forwarding

1. In FPP: **DDP Mobile - Status**
2. Watch "Packets Received" counter increase
3. Watch "Packets Sent" counter increase
4. Cloud Connection should show ✅

## xLights Configuration for Testing

1. **Setup** → **E1.31 Setup**
2. Add Controller:
   - **Description**: FPP DDP Mobile
   - **IP Address**: Your FPP IP (e.g., `192.168.1.100`)
   - **Universe**: `5` (match plugin config)
   - **Channels**: `510`
   - **Protocol**: `E1.31`

3. **Layout** tab:
   - Add single pixel at Channels 1-3 for testing
   - Add string of 10 pixels at Channels 4-33

4. **Sequencer**:
   - Create simple test sequence
   - Set first pixel to solid color
   - Play sequence and check FPP plugin status page

## Advanced Configuration

### Custom Port

If E1.31 port 5568 is in use:

Edit `ddp-cloud-connector.js`:
```javascript
const E131_PORT = 5568; // Change to your port
```

Then restart: `sudo systemctl restart fppd`

### Multiple Universes

Currently supports single universe. To monitor multiple:

1. Install plugin multiple times with different names
2. Configure each for different universe
3. Each will need separate API key/show

### Debug Logging

Enable verbose logging by editing `ddp-cloud-connector.js`:

```javascript
// Add at top of file
const DEBUG = true;

// Add throughout code
if (DEBUG) console.log('Debug message');
```

View logs: `tail -f /var/log/messages | grep -i ddp`

## Support

- **Issues**: https://github.com/yourusername/fpp-plugin-DDP-Mobile/issues
- **Main Docs**: [README.md](README.md)
- **FPP Forums**: https://falconchristmas.com/forum/

## Common Issues

**"API key not configured"**
- Configure plugin in Settings page first
- Ensure API key is valid via show registration

**"Invalid API key"**
- Verify cloud server is running
- Check API server health: `curl http://your-server:3001/health`
- Confirm API key matches registration

**"No packets received"**
- Check xLights is outputting to correct universe
- Verify FPP is receiving data (Status page)
- Check firewall allows UDP 5568
- Ensure universe number matches in all places

**"Cloud connection failed"**
- Ping cloud server: `ping your-server.com`
- Test WebSocket port: `telnet your-server.com 3002`
- Check cloud server logs: `docker-compose logs cloud-server`
