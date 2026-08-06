<?php
session_start();
require_once __DIR__ . '/config.php';

header('Content-Type: application/json');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    echo json_encode(['ok' => false, 'error' => 'POST required.']);
    exit;
}

require_once __DIR__ . '/data/templates.php';

$template_id = preg_replace('/[^a-z0-9\-]/', '', strtolower(trim($_POST['template_id'] ?? '')));
$name        = trim($_POST['name'] ?? '');

if (!$template_id || !isset($all_templates[$template_id])) {
    echo json_encode(['ok' => false, 'error' => 'Template not found.']);
    exit;
}
if (strlen($name) < 1) {
    echo json_encode(['ok' => false, 'error' => 'Name cannot be empty.']);
    exit;
}
if (strlen($name) > 100) {
    echo json_encode(['ok' => false, 'error' => 'Name too long (max 100 chars).']);
    exit;
}

if (!launchit_update_template($template_id, ['name' => $name])) {
    echo json_encode(['ok' => false, 'error' => 'Database error — could not rename template.']);
    exit;
}

echo json_encode(['ok' => true]);
exit;
