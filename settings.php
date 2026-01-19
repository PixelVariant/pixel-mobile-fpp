<?php
// Load settings
$settingsFile = __DIR__ . '/settings/config.json';
$settings = array();

if (file_exists($settingsFile)) {
    $settings = json_decode(file_get_contents($settingsFile), true);
}

// Default values
$apiKey = isset($settings['apiKey']) ? $settings['apiKey'] : '';
$cloudServerUrl = isset($settings['cloudServerUrl']) ? $settings['cloudServerUrl'] : 'http://your-cloud-server:3002';
$universe = isset($settings['universe']) ? $settings['universe'] : '5';
$enabled = isset($settings['enabled']) ? $settings['enabled'] : false;

// Handle form submission
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $settings = array(
        'apiKey' => trim($_POST['apiKey']),
        'cloudServerUrl' => trim($_POST['cloudServerUrl']),
        'universe' => intval($_POST['universe']),
        'enabled' => isset($_POST['enabled'])
    );
    
    // Save settings
    if (!is_dir(__DIR__ . '/settings')) {
        mkdir(__DIR__ . '/settings', 0755, true);
    }
    
    file_put_contents($settingsFile, json_encode($settings, JSON_PRETTY_PRINT));
    
    // Restart the service
    exec('pkill -f "ddp-cloud-connector.js"');
    
    if ($settings['enabled']) {
        exec('cd ' . __DIR__ . ' && node ddp-cloud-connector.js > /dev/null 2>&1 &');
    }
    
    echo '<div style="background-color: #4ade80; color: white; padding: 15px; border-radius: 5px; margin-bottom: 20px;">Settings saved successfully! Service ' . ($settings['enabled'] ? 'started' : 'stopped') . '.</div>';
    
    // Reload settings
    $apiKey = $settings['apiKey'];
    $cloudServerUrl = $settings['cloudServerUrl'];
    $universe = $settings['universe'];
    $enabled = $settings['enabled'];
}
?>

<style>
    .ddp-settings {
        max-width: 800px;
        margin: 20px auto;
    }
    
    .form-group {
        margin-bottom: 20px;
    }
    
    .form-group label {
        display: block;
        font-weight: bold;
        margin-bottom: 5px;
    }
    
    .form-group input[type="text"],
    .form-group input[type="number"] {
        width: 100%;
        padding: 10px;
        border: 1px solid #ccc;
        border-radius: 5px;
        font-size: 14px;
    }
    
    .form-group input[type="checkbox"] {
        margin-right: 10px;
    }
    
    .help-text {
        font-size: 12px;
        color: #666;
        margin-top: 5px;
    }
    
    .btn-save {
        background-color: #667eea;
        color: white;
        padding: 12px 30px;
        border: none;
        border-radius: 5px;
        font-size: 16px;
        cursor: pointer;
    }
    
    .btn-save:hover {
        background-color: #5568d3;
    }
    
    .info-box {
        background-color: #e0e7ff;
        padding: 15px;
        border-radius: 5px;
        margin-bottom: 20px;
    }
</style>

<div class="ddp-settings">
    <h2>DDP Mobile Cloud Connector Settings</h2>
    
    <div class="info-box">
        <strong>📋 Setup Instructions:</strong><br>
        1. Register your show at your DDP Mobile admin page<br>
        2. Copy the API key provided<br>
        3. Enter the API key below<br>
        4. Configure your universe and cloud server URL<br>
        5. Enable the connector and save
    </div>
    
    <form method="POST">
        <div class="form-group">
            <label for="enabled">
                <input type="checkbox" name="enabled" id="enabled" <?php echo $enabled ? 'checked' : ''; ?>>
                Enable DDP Mobile Cloud Connector
            </label>
            <div class="help-text">Check this to start forwarding E1.31 data to the cloud</div>
        </div>
        
        <div class="form-group">
            <label for="apiKey">API Key *</label>
            <input type="text" name="apiKey" id="apiKey" value="<?php echo htmlspecialchars($apiKey); ?>" required>
            <div class="help-text">Your unique API key from the DDP Mobile registration page</div>
        </div>
        
        <div class="form-group">
            <label for="cloudServerUrl">Cloud Server URL *</label>
            <input type="text" name="cloudServerUrl" id="cloudServerUrl" value="<?php echo htmlspecialchars($cloudServerUrl); ?>" required>
            <div class="help-text">The WebSocket server URL (e.g., http://your-server.com:3002)</div>
        </div>
        
        <div class="form-group">
            <label for="universe">E1.31 Universe *</label>
            <input type="number" name="universe" id="universe" value="<?php echo $universe; ?>" min="1" max="63999" required>
            <div class="help-text">The universe to monitor for lighting data (default: 5)</div>
        </div>
        
        <button type="submit" class="btn-save">💾 Save Settings</button>
    </form>
</div>
