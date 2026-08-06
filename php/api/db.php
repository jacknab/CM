<?php
/**
 * PDO database connection helper.
 * Parses DATABASE_URL and returns a PDO instance.
 * Must be require_once'd from API endpoint files only.
 */

function launchit_db_connect(): PDO {
    $db_url = getenv('DATABASE_URL');
    if (!$db_url) {
        http_response_code(503);
        header('Content-Type: application/json');
        echo json_encode(['error' => 'Database not configured']);
        exit;
    }

    $parts = parse_url($db_url);
    $host  = $parts['host'] ?? 'localhost';
    $port  = $parts['port'] ?? 5432;
    $db    = ltrim($parts['path'] ?? '/postgres', '/');
    $user  = $parts['user'] ?? '';
    $pass  = $parts['pass'] ?? '';

    $dsn = "pgsql:host={$host};port={$port};dbname={$db}";

    try {
        return new PDO($dsn, $user, $pass, [
            PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        ]);
    } catch (PDOException $e) {
        http_response_code(503);
        header('Content-Type: application/json');
        echo json_encode(['error' => 'Database connection failed']);
        exit;
    }
}
