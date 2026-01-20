<?php
/**
 * Auto-configure MQTT outputs in FPP based on selected model
 */

header('Content-Type: application/json');

// Get POST data
$data = json_decode(file_get_contents('php://input'), true);
$modelName = $data['modelName'] ?? '';
$fppHost = $data['fppHost'] ?? '127.0.0.1';
$mqttBroker = $data['mqttBroker'] ?? '';
$mqttUsername = $data['mqttUsername'] ?? '';
$mqttPassword = $data['mqttPassword'] ?? '';
$mqttTopicColor = $data['mqttTopicColor'] ?? 'falcon/player/FPP/channel/output/color';
$mqttTopicPixels = $data['mqttTopicPixels'] ?? 'falcon/player/FPP/mobileLights/pixel/#';

if (empty($modelName)) {
    echo json_encode(['success' => false, 'message' => 'No model selected']);
    exit;
}

// Extract base topic for pixels (remove wildcard)
$pixelTopicBase = str_replace('/#', '', $mqttTopicPixels);

// Get model data from FPP
$modelUrl = "http://{$fppHost}/api/models";
$modelsJson = @file_get_contents($modelUrl);

if ($modelsJson === false) {
    echo json_encode(['success' => false, 'message' => 'Failed to connect to FPP API']);
    exit;
}

$models = json_decode($modelsJson, true);
$selectedModel = null;

foreach ($models as $model) {
    if ($model['Name'] === $modelName) {
        $selectedModel = $model;
        break;
    }
}

if (!$selectedModel) {
    echo json_encode(['success' => false, 'message' => 'Model not found']);
    exit;
}

$startChannel = $selectedModel['StartChannel'];
$channelCount = $selectedModel['ChannelCount'];

// Calculate number of RGB pixels (3 channels per pixel)
$numPixels = intval($channelCount / 3);

// Get current MQTT outputs from FPP's co-other.json
$outputsUrl = "http://{$fppHost}/api/channel/output/co-other";
$outputsJson = @file_get_contents($outputsUrl);

if ($outputsJson === false) {
    echo json_encode(['success' => false, 'message' => 'Failed to get MQTT outputs from FPP (co-other.json)']);
    exit;
}

$currentOutputs = json_decode($outputsJson, true);

// Find and remove old mobileLights MQTT outputs
$outputsToKeep = [];
foreach ($currentOutputs as $output) {
    // Keep outputs that are NOT our mobileLights MQTT outputs
    if ($output['type'] !== 'MQTT' || 
        (strpos($output['topic'] ?? '', $pixelTopicBase) === false && 
         $output['topic'] !== $mqttTopicColor)) {
        $outputsToKeep[] = $output;
    }
}

// Create new MQTT outputs
$newOutputs = [];

// Add main color output (first 3 channels)
$newOutputs[] = [
    'type' => 'MQTT',
    'enabled' => 1,
    'startChannel' => $startChannel,
    'channelCount' => 3,
    'host' => $mqttBroker ?: 'localhost:1883',
    'username' => $mqttUsername,
    'password' => $mqttPassword,
    'topic' => $mqttTopicColor,
    'message' => '%R%,%G%,%B%',
    'qos' => 0,
    'retain' => 0,
    'description' => "MobileLights Color ({$modelName})"
];

// Add pixel outputs (3 channels each)
for ($i = 0; $i < $numPixels; $i++) {
    $pixelNum = $i + 1;
    $pixelStartChannel = $startChannel + 3 + ($i * 3);
    
    $newOutputs[] = [
        'type' => 'MQTT',
        'enabled' => 1,
        'startChannel' => $pixelStartChannel,
        'channelCount' => 3,
        'host' => $mqttBroker ?: 'localhost:1883',
        'username' => $mqttUsername,
        'password' => $mqttPassword,
        'topic' => "{$pixelTopicBase}/{$pixelNum}",
        'message' => '%R%,%G%,%B%',
        'qos' => 0,
        'retain' => 0,
        'description' => "MobileLights Pixel {$pixelNum} ({$modelName})"
    ];
}

// Combine kept outputs with new outputs
$finalOutputs = array_merge($outputsToKeep, $newOutputs);

// Update FPP MQTT outputs (co-other.json)
$context = stream_context_create([
    'http' => [
        'method' => 'POST',
        'header' => 'Content-Type: application/json',
        'content' => json_encode($finalOutputs)
    ]
]);

$result = @file_get_contents($outputsUrl, false, $context);

if ($result === false) {
    echo json_encode([
        'success' => false, 
        'message' => 'Failed to update FPP MQTT outputs (co-other.json)'
    ]);
    exit;
}

echo json_encode([
    'success' => true,
    'message' => "Created " . (count($newOutputs)) . " MQTT outputs for {$modelName}",
    'details' => [
        'model' => $modelName,
        'startChannel' => $startChannel,
        'channelCount' => $channelCount,
        'numPixels' => $numPixels,
        'outputsCreated' => count($newOutputs),
        'outputsRemoved' => count($currentOutputs) - count($outputsToKeep)
    ]
]);
