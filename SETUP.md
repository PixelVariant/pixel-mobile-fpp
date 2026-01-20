# FPP Cloud Connector Plugin Setup

This plugin connects your FPP (Falcon Player) to the cloud platform, allowing mobile viewers to see your lighting show in real-time.

## How It Works

The plugin acts as a **client** to FPP's built-in HTTP Virtual Display output. Instead of trying to intercept data, it receives data directly from FPP through a clean, supported interface.

```
FPP Sequence/Playlist
        ↓
  Channel Outputs
        ↓
HTTP Virtual Display (port 32328)
        ↓
   This Plugin (SSE client)
        ↓
   Cloud Server
        ↓
  Mobile Viewers
```

## Prerequisites

- FPP (Falcon Player) installed and running
- Node.js installed on FPP (usually pre-installed)
- Internet connection for cloud communication

## Installation

1. **Upload plugin to FPP:**
   ```bash
   scp -r fpp-plugin/* fpp@192.168.90.149:/home/fpp/media/plugins/pixel-mobile-fpp/
   ```

2. **Install dependencies on FPP:**
   ```bash
   ssh fpp@192.168.90.149
   cd /home/fpp/media/plugins/pixel-mobile-fpp
   npm install
   ```

## Configuration

### Step 1: Configure FPP HTTP Virtual Display Output

This is the **crucial step** - you must configure FPP to send data to its HTTP Virtual Display output:

1. Open FPP web interface
2. Go to **Input/Output Setup** → **Channel Outputs**
3. Click **Add Output**
4. Select output type: **HTTP Virtual Display**
5. Configure the output:
   - **Start Channel:** 1
   - **Channel Count:** 33
     - Channels 1-3: Main color (R, G, B)
     - Channels 4-33: 10 pixels (3 channels each)
   - **Width:** 1280 (or your preference)
   - **Height:** 1024 (or your preference)
   - **Pixel Size:** 2
6. **Enable** the output
7. **Save** the configuration

### Step 2: Configure Plugin Settings

1. Access plugin settings page:
   ```
   http://192.168.90.149/plugin.php?plugin=pixel-mobile-fpp&page=settings.html
   ```

2. Enter your configuration:
   - **API Key:** Your cloud platform API key
   - **Cloud Server URL:** `http://YOUR_IP:3002`
   - **Enable Plugin:** Check this box

3. Click **Save Settings**

### Step 3: Start the Plugin

The plugin will start automatically when enabled. You can also start it manually:

```bash
ssh fpp@192.168.90.149
cd /home/fpp/media/plugins/pixel-mobile-fpp
node ddp-cloud-connector.js
```

## Verification

### Check Plugin Status

```bash
ssh fpp@192.168.90.149
cat /home/fpp/media/plugins/pixel-mobile-fpp/settings/stats.json
```

You should see:
```json
{
  "packetsReceived": 1234,
  "packetsSent": 1234,
  "errors": 0,
  "connected": true,
  ...
}
```

### Check FPP Logs

```bash
tail -f /var/log/fpp_daemon.log
```

Look for entries related to HTTP Virtual Display.

### Test the Flow

1. **Start a sequence in FPP**
2. **Plugin should show:** `✓ Receiving FPP data: RGB [255, 0, 0]`
3. **Cloud server should show:** `Lighting data received for show: YOUR_TOKEN`
4. **Viewer page should display:** The colors from your sequence

## Channel Mapping

The plugin expects data in this format:

| Channels | Purpose | Description |
|----------|---------|-------------|
| 1-3 | Main Color | R, G, B for full-screen color display |
| 4-6 | Pixel 1 | R, G, B for first pixel |
| 7-9 | Pixel 2 | R, G, B for second pixel |
| ... | ... | ... |
| 31-33 | Pixel 10 | R, G, B for tenth pixel |

## Troubleshooting

### Plugin says "No recent data"

**Problem:** Plugin not receiving data from FPP.

**Solution:**
1. Verify HTTP Virtual Display output is configured and enabled
2. Check that output uses channels 1-33
3. Ensure a sequence/playlist is actually running
4. Restart FPP: `sudo systemctl restart fppd`

### "Connection error to FPP Virtual Display"

**Problem:** HTTP Virtual Display not responding on port 32328.

**Solution:**
1. Verify HTTP Virtual Display output exists in FPP configuration
2. Check if FPP is running: `systemctl status fppd`
3. Verify port: `netstat -tlnp | grep 32328`
4. Review FPP logs for errors

### Plugin connects but viewers see black screen

**Problem:** Data not reaching cloud or viewers.

**Solution:**
1. Check cloud server logs: `docker logs ddp-mobile-cloud-server-1`
2. Verify API key is valid
3. Test viewer connection to cloud server
4. Check network connectivity between FPP and cloud

### High error count in stats

**Problem:** Data parsing errors.

**Solution:**
1. Verify FPP firmware version (latest recommended)
2. Check HTTP Virtual Display configuration matches expected format
3. Review plugin logs for specific error messages

## Architecture Notes

### Why HTTP Virtual Display?

FPP's HTTP Virtual Display is the **official, supported way** for external applications to receive channel data. It:

- Uses Server-Sent Events (SSE) for efficient streaming
- Provides properly formatted, preprocessed pixel data
- Handles all FPP internal data transformations
- Doesn't require C++ plugin development
- Works with any Node.js application

### Alternative Approaches (Not Used)

We tried these approaches before settling on HTTP Virtual Display:

1. **E1.31 UDP Listener** - Port conflicts with FPP
2. **DDP UDP Listener** - Requires FPP configuration that may not be possible
3. **Shared Memory Files** - Access/permission issues
4. **FPP API Polling** - No live data available
5. **C++ Plugin** - Overkill, requires compilation

HTTP Virtual Display was the right answer all along!

## Performance

- **Latency:** ~40-50ms from FPP to viewers
- **Data Rate:** ~25 packets/second (configurable)
- **Network:** ~10KB/s upload from plugin to cloud
- **CPU:** Minimal (<1% on FPP)

## Support

For issues or questions:
1. Check logs: `tail -f /home/fpp/media/plugins/pixel-mobile-fpp/*.log`
2. Check stats: `cat /home/fpp/media/plugins/pixel-mobile-fpp/settings/stats.json`
3. Review FPP configuration: Input/Output Setup → Channel Outputs
4. Verify cloud server is running: `docker ps`

## References

- [FPP Documentation](https://github.com/FalconChristmas/fpp)
- [HTTP Virtual Display Source](https://github.com/FalconChristmas/fpp/blob/master/src/channeloutput/HTTPVirtualDisplay.cpp)
- [Server-Sent Events Spec](https://html.spec.whatwg.org/multipage/server-sent-events.html)
