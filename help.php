<style>
    .ddp-help {
        max-width: 800px;
        margin: 20px auto;
        line-height: 1.6;
    }
    
    .help-section {
        background: white;
        border-radius: 10px;
        padding: 20px;
        margin-bottom: 20px;
        box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    
    .help-section h3 {
        color: #667eea;
        margin-top: 0;
    }
    
    .step {
        background: #f5f5f5;
        padding: 15px;
        margin: 10px 0;
        border-radius: 5px;
        border-left: 4px solid #667eea;
    }
    
    code {
        background: #f0f0f0;
        padding: 2px 6px;
        border-radius: 3px;
        font-family: monospace;
    }
</style>

<div class="ddp-help">
    <h2>DDP Mobile Cloud Connector - Help</h2>
    
    <div class="help-section">
        <h3>🚀 Quick Start Guide</h3>
        
        <div class="step">
            <strong>Step 1: Register Your Show</strong><br>
            Visit your DDP Mobile admin page (typically at <code>http://your-server:3000/admin.html</code>)
            and register a new show. You'll receive:
            <ul>
                <li>A 6-character viewer token (for your audience)</li>
                <li>An API key (for this plugin)</li>
            </ul>
        </div>
        
        <div class="step">
            <strong>Step 2: Configure Plugin</strong><br>
            Go to the Settings page and enter:
            <ul>
                <li>Your API key from Step 1</li>
                <li>Your cloud server URL (e.g., <code>http://your-server.com:3002</code>)</li>
                <li>The E1.31 universe you want to monitor (default is 5)</li>
            </ul>
        </div>
        
        <div class="step">
            <strong>Step 3: Enable Service</strong><br>
            Check the "Enable DDP Mobile Cloud Connector" checkbox and click Save Settings.
            The service will start automatically.
        </div>
        
        <div class="step">
            <strong>Step 4: Share with Audience</strong><br>
            Give your audience the viewer token from Step 1. They can visit your website
            and enter the token to sync their phones with your light show!
        </div>
    </div>
    
    <div class="help-section">
        <h3>🎄 xLights/FPP Configuration</h3>
        
        <p><strong>E1.31 Setup:</strong></p>
        <ul>
            <li>In xLights, go to Setup → E1.31 Setup</li>
            <li>Add a controller with your FPP IP address</li>
            <li>Set Port to 5568</li>
            <li>Configure the universe (must match plugin settings)</li>
        </ul>
        
        <p><strong>Channel Mapping:</strong></p>
        <ul>
            <li><strong>Single Color:</strong> Channels 1-3 (RGB)</li>
            <li><strong>10-Pixel String:</strong> Channels 4-33 (10 pixels × 3 channels)</li>
        </ul>
    </div>
    
    <div class="help-section">
        <h3>🔧 Troubleshooting</h3>
        
        <p><strong>Service Won't Start:</strong></p>
        <ul>
            <li>Check that API key is valid</li>
            <li>Verify cloud server URL is correct</li>
            <li>Ensure Node.js is installed (automatically done during plugin install)</li>
            <li>Check FPP logs for errors</li>
        </ul>
        
        <p><strong>No Packets Being Sent:</strong></p>
        <ul>
            <li>Verify universe number matches xLights output</li>
            <li>Check that FPP is receiving E1.31 data (FPP Status page)</li>
            <li>Ensure firewall allows UDP port 5568</li>
            <li>Check Status page for connection status</li>
        </ul>
        
        <p><strong>Viewers Can't Connect:</strong></p>
        <ul>
            <li>Verify cloud server is running</li>
            <li>Check that viewers are using the correct token</li>
            <li>Ensure cloud server URL is accessible from internet (if hosting publicly)</li>
            <li>Check API server is running for token validation</li>
        </ul>
    </div>
    
    <div class="help-section">
        <h3>📊 Monitoring</h3>
        
        <p>The Status page shows:</p>
        <ul>
            <li><strong>Service Status:</strong> Whether the connector is running</li>
            <li><strong>Packets Received:</strong> E1.31 packets captured from FPP</li>
            <li><strong>Packets Sent:</strong> Data forwarded to cloud server</li>
            <li><strong>Cloud Connection:</strong> Connection status to cloud server</li>
        </ul>
        
        <p>Stats update every 30 seconds while the service is running.</p>
    </div>
    
    <div class="help-section">
        <h3>💡 Tips</h3>
        
        <ul>
            <li>Use a dedicated universe for mobile viewers to avoid conflicts</li>
            <li>Test with a single viewer before sharing widely</li>
            <li>Monitor the Status page during shows for issues</li>
            <li>Keep your API key secure - don't share it publicly</li>
            <li>Consider using a reverse proxy with HTTPS for production</li>
        </ul>
    </div>
</div>
