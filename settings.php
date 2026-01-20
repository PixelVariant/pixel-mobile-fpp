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
$mqttBroker = isset($settings['mqttBroker']) ? $settings['mqttBroker'] : '';
$mqttUsername = isset($settings['mqttUsername']) ? $settings['mqttUsername'] : '';
$mqttPassword = isset($settings['mqttPassword']) ? $settings['mqttPassword'] : '';
$mqttTopicColor = isset($settings['mqttTopicColor']) ? $settings['mqttTopicColor'] : 'mobileLights';
$mqttTopicPixels = isset($settings['mqttTopicPixels']) ? $settings['mqttTopicPixels'] : 'falcon/player/FPP/mobileLights/pixel/#';
$universe = isset($settings['universe']) ? $settings['universe'] : '5';
$modelName = isset($settings['modelName']) ? $settings['modelName'] : '';
$enabled = isset($settings['enabled']) ? $settings['enabled'] : false;

// Handle form submission
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $settings = array(
        'apiKey' => trim($_POST['apiKey']),
        'cloudServerUrl' => trim($_POST['cloudServerUrl']),
        'fppHost' => trim($_POST['fppHost']),
        'mqttBroker' => trim($_POST['mqttBroker']),
        'mqttUsername' => trim($_POST['mqttUsername']),
        'mqttPassword' => trim($_POST['mqttPassword']),
        'mqttTopicColor' => trim($_POST['mqttTopicColor']),
        'mqttTopicPixels' => trim($_POST['mqttTopicPixels']),
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
    $mqttBroker = $settings['mqttBroker'];
    $mqttUsername = $settings['mqttUsername'];
    $mqttPassword = $settings['mqttPassword'];
    $mqttTopicColor = $settings['mqttTopicColor'];
    $mqttTopicPixels = $settings['mqttTopicPixels'];
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
            <label for="mqttBroker">MQTT Broker URL (Optional)</label>
            <input type="text" name="mqttBroker" id="mqttBroker" value="<?php echo htmlspecialchars($mqttBroker); ?>">
            <div class="help-text">Leave blank to auto-detect from FPP settings, or specify manually (e.g., mqtt://192.168.1.100:1883)</div>
        </div>
        
        <div class="form-group">
            <label for="mqttUsername">MQTT Username (Optional)</label>
            <input type="text" name="mqttUsername" id="mqttUsername" value="<?php echo htmlspecialchars($mqttUsername); ?>">
            <div class="help-text">Username for MQTT authentication (leave blank if not required)</div>
        </div>
        
        <div class="form-group">
            <label for="mqttPassword">MQTT Password (Optional)</label>
            <input type="password" name="mqttPassword" id="mqttPassword" value="<?php echo htmlspecialchars($mqttPassword); ?>">
            <div class="help-text">Password for MQTT authentication (leave blank if not required)</div>
        </div>
        
        <div class="form-group">
            <label for="mqttTopicColor">MQTT Color Topic *</label>
            <input type="text" name="mqttTopicColor" id="mqttTopicColor" value="<?php echo htmlspecialchars($mqttTopicColor); ?>" required>
            <div class="help-text">MQTT topic for single main RGB color display (e.g., mobileLights)</div>
        </div>
        
        <div class="form-group">
            <label for="mqttTopicPixels">MQTT Pixel Topics (Optional)</label>
            <input type="text" name="mqttTopicPixels" id="mqttTopicPixels" value="<?php echo htmlspecialchars($mqttTopicPixels); ?>">
            <div class="help-text">MQTT wildcard topic for 10 pixels (e.g., falcon/player/FPP/mobileLights/pixel/#). Use # for wildcard.</div>
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
            <button type="button" class="btn-auto-config" onclick="autoConfigureMQTT()" style="margin-top: 10px; padding: 8px 16px; background: #3b82f6; color: white; border: none; border-radius: 5px; cursor: pointer;">
                🔧 Auto-Configure MQTT Outputs for Selected Model
            </button>
            <div id="auto-config-status" style="margin-top: 10px; padding: 10px; border-radius: 5px; display: none;"></div>
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
    
    // Auto-configure MQTT outputs based on selected model
    async function autoConfigureMQTT() {
        const statusDiv = document.getElementById('auto-config-status');
        const modelName = document.getElementById('modelName').value;
        
        if (!modelName) {
            statusDiv.style.display = 'block';
            statusDiv.style.backgroundColor = '#fbbf24';
            statusDiv.style.color = '#78350f';
            statusDiv.textContent = '⚠️ Please select a model first';
            return;
        }
        
        const fppHost = document.getElementById('fppHost').value || '127.0.0.1';
        const mqttBroker = document.getElementById('mqttBroker').value;
        const mqttUsername = document.getElementById('mqttUsername').value;
        const mqttPassword = document.getElementById('mqttPassword').value;
        const mqttTopicColor = document.getElementById('mqttTopicColor').value;
        const mqttTopicPixels = document.getElementById('mqttTopicPixels').value;
        
        statusDiv.style.display = 'block';
        statusDiv.style.backgroundColor = '#3b82f6';
        statusDiv.style.color = 'white';
        statusDiv.textContent = '🔄 Configuring MQTT outputs...';
        
        try {
            const response = await fetch('/plugin.php?_menu=status&plugin=pixel-mobile-fpp&page=api.php&action=auto-configure-mqtt&nopage=1', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    modelName,
                    fppHost,
                    mqttBroker,
                    mqttUsername,
                    mqttPassword,
                    mqttTopicColor,
                    mqttTopicPixels
                })
            });
            
            const result = await response.json();
            
            if (result.success) {
                statusDiv.style.backgroundColor = '#4ade80';
                statusDiv.style.color = 'white';
                statusDiv.innerHTML = `✅ ${result.message}<br><small>Created ${result.details.outputsCreated} outputs (${result.details.numPixels} pixels) starting at channel ${result.details.startChannel}</small>`;
            } else {
                statusDiv.style.backgroundColor = '#ef4444';
                statusDiv.style.color = 'white';
                statusDiv.textContent = `❌ ${result.message}`;
            }
        } catch (error) {
            statusDiv.style.backgroundColor = '#ef4444';
            statusDiv.style.color = 'white';
            statusDiv.textContent = `❌ Error: ${error.message}`;
        }
    }
</script>
