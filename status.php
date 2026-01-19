<?php
// Check if service is running
$isRunning = false;
exec('pgrep -f "ddp-cloud-connector.js"', $output, $returnCode);
$isRunning = ($returnCode === 0);

// Load settings
$settingsFile = __DIR__ . '/settings/config.json';
$settings = array();

if (file_exists($settingsFile)) {
    $settings = json_decode(file_get_contents($settingsFile), true);
}

$enabled = isset($settings['enabled']) ? $settings['enabled'] : false;
$apiKey = isset($settings['apiKey']) ? $settings['apiKey'] : 'Not configured';
$cloudServerUrl = isset($settings['cloudServerUrl']) ? $settings['cloudServerUrl'] : 'Not configured';
$universe = isset($settings['universe']) ? $settings['universe'] : 'Not configured';

// Load stats if available
$statsFile = __DIR__ . '/settings/stats.json';
$stats = array(
    'packetsReceived' => 0,
    'packetsSent' => 0,
    'errors' => 0,
    'connected' => false,
    'lastUpdate' => 'Never'
);

if (file_exists($statsFile)) {
    $loadedStats = json_decode(file_get_contents($statsFile), true);
    if ($loadedStats) {
        $stats = array_merge($stats, $loadedStats);
    }
}
?>

<style>
    .ddp-status {
        max-width: 800px;
        margin: 20px auto;
    }
    
    .status-card {
        background: white;
        border-radius: 10px;
        padding: 20px;
        margin-bottom: 20px;
        box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    
    .status-indicator {
        display: inline-block;
        width: 12px;
        height: 12px;
        border-radius: 50%;
        margin-right: 10px;
    }
    
    .status-indicator.running {
        background-color: #4ade80;
    }
    
    .status-indicator.stopped {
        background-color: #ef4444;
    }
    
    .stat-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
        gap: 15px;
        margin-top: 15px;
    }
    
    .stat-item {
        background: #f5f5f5;
        padding: 15px;
        border-radius: 8px;
    }
    
    .stat-label {
        font-size: 12px;
        color: #666;
        margin-bottom: 5px;
    }
    
    .stat-value {
        font-size: 24px;
        font-weight: bold;
        color: #333;
    }
    
    .config-item {
        margin: 10px 0;
        padding: 10px;
        background: #f9f9f9;
        border-radius: 5px;
    }
    
    .config-label {
        font-weight: bold;
        color: #667eea;
    }
</style>

<div class="ddp-status">
    <h2>DDP Mobile Cloud Connector Status</h2>
    
    <div class="status-card">
        <h3>
            <span class="status-indicator <?php echo $isRunning ? 'running' : 'stopped'; ?>"></span>
            Service Status: <?php echo $isRunning ? 'Running' : 'Stopped'; ?>
        </h3>
        
        <p>
            <?php if ($enabled && !$isRunning): ?>
                ⚠️ Service is enabled but not running. Check configuration or restart FPP.
            <?php elseif (!$enabled): ?>
                ℹ️ Service is disabled. Enable it in the Settings page.
            <?php else: ?>
                ✅ Service is running and forwarding E1.31 data to the cloud.
            <?php endif; ?>
        </p>
    </div>
    
    <div class="status-card">
        <h3>Configuration</h3>
        
        <div class="config-item">
            <span class="config-label">API Key:</span> 
            <?php echo $apiKey !== 'Not configured' ? substr($apiKey, 0, 20) . '...' : $apiKey; ?>
        </div>
        
        <div class="config-item">
            <span class="config-label">Cloud Server:</span> 
            <?php echo htmlspecialchars($cloudServerUrl); ?>
        </div>
        
        <div class="config-item">
            <span class="config-label">Universe:</span> 
            <?php echo $universe; ?>
        </div>
    </div>
    
    <div class="status-card">
        <h3>Statistics</h3>
        
        <div class="stat-grid">
            <div class="stat-item">
                <div class="stat-label">Packets Received</div>
                <div class="stat-value"><?php echo number_format($stats['packetsReceived']); ?></div>
            </div>
            
            <div class="stat-item">
                <div class="stat-label">Packets Sent</div>
                <div class="stat-value"><?php echo number_format($stats['packetsSent']); ?></div>
            </div>
            
            <div class="stat-item">
                <div class="stat-label">Errors</div>
                <div class="stat-value"><?php echo number_format($stats['errors']); ?></div>
            </div>
            
            <div class="stat-item">
                <div class="stat-label">Cloud Connection</div>
                <div class="stat-value"><?php echo $stats['connected'] ? '✅' : '❌'; ?></div>
            </div>
        </div>
        
        <p style="margin-top: 15px; color: #666; font-size: 12px;">
            Last Update: <?php echo htmlspecialchars($stats['lastUpdate']); ?>
        </p>
    </div>
    
    <div style="text-align: center; margin-top: 20px;">
        <button onclick="location.reload()" style="padding: 10px 20px; background: #667eea; color: white; border: none; border-radius: 5px; cursor: pointer;">
            🔄 Refresh Status
        </button>
    </div>
</div>
