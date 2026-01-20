<?php
/**
 * API endpoint for AJAX requests - bypasses FPP template wrapper
 */

// Clean any previous output
if (ob_get_level()) {
    ob_end_clean();
}

header('Content-Type: application/json');
header('Cache-Control: no-cache, must-revalidate');

$action = $_GET['action'] ?? $_POST['action'] ?? '';

if ($action === 'auto-configure-mqtt') {
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

    // Extract channelOutputs array if it exists
    $channelOutputs = $currentOutputs['channelOutputs'] ?? $currentOutputs;

    // Find and remove old mobileLights MQTT outputs
    $outputsToKeep = [];
    foreach ($channelOutputs as $output) {
        // Keep outputs that are NOT our mobileLights MQTT outputs
        if ($output['type'] !== 'MQTTOutput' || 
            (strpos($output['topic'] ?? '', $pixelTopicBase) === false && 
             $output['topic'] !== $mqttTopicColor)) {
            $outputsToKeep[] = $output;
        }
    }

    // Create new MQTT outputs
    $newOutputs = [];

    // Add main color output (first 3 channels)
    $newOutputs[] = [
        'enabled' => 1,
        'type' => 'MQTTOutput',
        'startChannel' => $startChannel,
        'channelCount' => 3,
        'topic' => $mqttTopicColor,
        'payload' => '%R%,%G%,%B%',
        'channelType' => 'RGB'
    ];

    // Add pixel outputs (3 channels each)
    for ($i = 0; $i < $numPixels; $i++) {
        $pixelNum = $i + 1;
        $pixelStartChannel = $startChannel + 3 + ($i * 3);
        
        $newOutputs[] = [
            'enabled' => 1,
            'type' => 'MQTTOutput',
            'startChannel' => $pixelStartChannel,
            'channelCount' => 3,
            'topic' => "{$pixelTopicBase}/{$pixelNum}",
            'payload' => '%R%,%G%,%B%',
            'channelType' => 'RGB'
        ];
    }

    // Combine kept outputs with new outputs
    $finalOutputs = array_merge($outputsToKeep, $newOutputs);

    // Wrap in proper format for FPP
    $updateData = [
        'channelOutputs' => $finalOutputs,
        'status' => 'OK'
    ];

    // Update FPP MQTT outputs (co-other.json)
    $context = stream_context_create([
        'http' => [
            'method' => 'POST',
            'header' => 'Content-Type: application/json',
            'content' => json_encode($updateData)
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
            'outputsRemoved' => count($channelOutputs) - count($outputsToKeep)
        ]
    ]);
    exit;
}

echo json_encode(['success' => false, 'message' => 'Invalid action']);
exit;
