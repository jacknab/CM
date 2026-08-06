<?php
/**
 * GET /launchsite/api/check-subdomain.php?name=mysalon
 * Returns JSON: { available: bool, name: string }
 */
header('Content-Type: application/json');
header('Cache-Control: no-store');

require_once __DIR__ . '/db.php';

$name = trim(strtolower($_GET['name'] ?? ''));

// Validate: 2–50 chars, lowercase alphanumeric + hyphens, no leading/trailing hyphens, no consecutive hyphens
if (!preg_match('/^[a-z0-9]([a-z0-9\-]{0,48}[a-z0-9])?$/', $name) || strpos($name, '--') !== false) {
    echo json_encode(['available' => false, 'name' => $name, 'error' => 'invalid']);
    exit;
}

// Reserved names
$reserved = ['www', 'mail', 'ftp', 'admin', 'api', 'app', 'certxa', 'launchit',
             'support', 'help', 'blog', 'shop', 'store', 'test', 'demo', 'staging',
             'dev', 'secure', 'ns1', 'ns2', 'smtp', 'pop', 'imap'];
if (in_array($name, $reserved, true)) {
    echo json_encode(['available' => false, 'name' => $name, 'error' => 'reserved']);
    exit;
}

try {
    $pdo  = launchit_db_connect();
    $stmt = $pdo->prepare('SELECT id FROM subdomains WHERE slug = :slug LIMIT 1');
    $stmt->execute([':slug' => $name]);
    $taken = (bool) $stmt->fetch();

    echo json_encode(['available' => !$taken, 'name' => $name]);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(['available' => false, 'name' => $name, 'error' => 'db_error']);
}
