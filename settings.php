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
$fppHost = isset($settings['fppHost']) ? $settings['fppHost'] : '127.0.0.1';
$universe = isset($settings['universe']) ? $settings['universe'] : '5';
$modelName = isset($settings['modelName']) ? $settings['modelName'] : '';
$enabled = isset($settings['enabled']) ? $settings['enabled'] : false;

// Handle form submission
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $settings = array(
        'apiKey' => trim($_POST['apiKey']),
        'cloudServerUrl' => trim($_POST['cloudServerUrl']),
        'fppHost' => trim($_POST['fppHost']),
        'universe' => intval($_POST['universe']),
        'modelName' => trim($_POST['modelName']),
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
    $fppHost = $settings['fppHost'];
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
            <label for="fppHost">FPP Host IP *</label>
            <input type="text" name="fppHost" id="fppHost" value="<?php echo htmlspecialchars($fppHost); ?>" required>
            <div class="help-text">IP of FPP device (use 127.0.0.1 if plugin runs ON the FPP, or 192.168.x.x if running remotely)</div>
        </div>
        
        <div class="form-group">
            <label for="universe">E1.31 Universe *</label>
            <input type="number" name="universe" id="universe" value="<?php echo $universe; ?>" min="1" max="63999" required>
            <div class="help-text">The universe to monitor for lighting data (default: 5)</div>
        </div>
        
        <div class="form-group">
            <label for="modelName">Model/Element Name (Optional)</label>
            <select name="modelName" id="modelName">
                <option value="">-- Use Universe Channels 1-33 --</option>
            </select>
            <div class="help-text">Select an FPP model/element to use for data. If selected, universe setting is ignored.</div>
        </div>
        
        <button type="submit" class="btn-save">💾 Save Settings</button>
    </form>
</div>

<script>
    // Load available models from FPP
    async function loadModels() {
        try {
            const response = await fetch('/api/models');
            const models = await response.json();
            
            const select = document.getElementById('modelName');
            const currentValue = '<?php echo addslashes($modelName); ?>';
            
            models.forEach(model => {
                const option = document.createElement('option');
                option.value = model.Name;
                option.textContent = `${model.Name} (${model.Type}, ${model.ChannelCount} channels)`;
                if (model.Name === currentValue) {
                    option.selected = true;
                }
                select.appendChild(option);
            });
        } catch (error) {
            console.error('Failed to load models:', error);
            // Fallback to text input if API fails
            const select = document.getElementById('modelName');
            const input = document.createElement('input');
            input.type = 'text';
            input.name = 'modelName';
            input.id = 'modelName';
            input.value = '<?php echo htmlspecialchars($modelName); ?>';
            input.placeholder = 'Enter model name manually';
            select.parentNode.replaceChild(input, select);
        }
    }
    
    // Load models when page loads
    loadModels();
</script>
