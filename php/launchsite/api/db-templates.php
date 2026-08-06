<?php
/**
 * db-templates.php — LaunchSite template CRUD helpers using PostgreSQL.
 *
 * All functions assume DATABASE_URL is set in the environment.
 * Call launchit_tpl_db() to get a PDO connection; it returns null on failure
 * (unlike db.php which exits) so callers can degrade gracefully.
 */

function launchit_tpl_db(): ?PDO {
    static $pdo = null;
    if ($pdo !== null) return $pdo;

    $db_url = getenv('DATABASE_URL');
    if (!$db_url) return null;

    $parts = parse_url($db_url);
    $host  = $parts['host'] ?? 'localhost';
    $port  = $parts['port'] ?? 5432;
    $db    = ltrim($parts['path'] ?? '/postgres', '/');
    $user  = $parts['user'] ?? '';
    $pass  = $parts['pass'] ?? '';

    try {
        $pdo = new PDO(
            "pgsql:host={$host};port={$port};dbname={$db}",
            $user, $pass,
            [
                PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            ]
        );
        return $pdo;
    } catch (Throwable) {
        return null;
    }
}

function launchit_tpl_row_to_array(array $row): array {
    $features = $row['features'] ?? '[]';
    if (is_string($features)) {
        $features = json_decode($features, true) ?: [];
    }
    return [
        'id'            => $row['id'],
        'name'          => $row['name']          ?? '',
        'category'      => $row['category']      ?? '',
        'style'         => $row['style']          ?? 'Modern',
        'desc'          => $row['desc']           ?? '',
        'badge'         => $row['badge']          ?? '',
        'features'      => $features,
        'accent'        => $row['accent']         ?? '#a855f7',
        'dark'          => $row['dark']           ?? '#0a0b15',
        'light'         => $row['light']          ?? '#1c1d27',
        'url_slug'      => $row['url_slug']       ?? $row['id'],
        'hero_tagline'  => $row['hero_tagline']   ?? '',
        'hero_sub'      => $row['hero_sub']       ?? '',
        'business_name' => $row['business_name']  ?? '',
        'type'          => $row['type']           ?? 'php',
        'react_path'    => $row['react_path']     ?? '',
        'scraped_path'  => $row['scraped_path']   ?? '',
        'source_url'    => $row['source_url']     ?? '',
    ];
}

function launchit_all_templates(): array {
    $pdo = launchit_tpl_db();
    if (!$pdo) return [];
    try {
        $stmt = $pdo->query(
            "SELECT * FROM launchsite_templates ORDER BY sort_order ASC, created_at ASC"
        );
        $all = [];
        foreach ($stmt->fetchAll() as $row) {
            $tpl = launchit_tpl_row_to_array($row);
            $all[$tpl['id']] = $tpl;
        }
        return $all;
    } catch (Throwable) {
        return [];
    }
}

function launchit_get_template(string $id): ?array {
    $pdo = launchit_tpl_db();
    if (!$pdo) return null;
    try {
        $stmt = $pdo->prepare("SELECT * FROM launchsite_templates WHERE id = ?");
        $stmt->execute([$id]);
        $row = $stmt->fetch();
        return $row ? launchit_tpl_row_to_array($row) : null;
    } catch (Throwable) {
        return null;
    }
}

function launchit_template_exists(string $id): bool {
    $pdo = launchit_tpl_db();
    if (!$pdo) return false;
    try {
        $stmt = $pdo->prepare("SELECT 1 FROM launchsite_templates WHERE id = ? LIMIT 1");
        $stmt->execute([$id]);
        return (bool) $stmt->fetch();
    } catch (Throwable) {
        return false;
    }
}

function launchit_insert_template(array $data): bool {
    $pdo = launchit_tpl_db();
    if (!$pdo) return false;
    try {
        $features = $data['features'] ?? [];
        $pdo->prepare("
            INSERT INTO launchsite_templates
                (id, name, category, style, \"desc\", badge, features,
                 accent, dark, light, url_slug, hero_tagline, hero_sub,
                 business_name, type, react_path, scraped_path, source_url,
                 sort_order, created_at, updated_at)
            VALUES
                (?, ?, ?, ?, ?, ?, ?,
                 ?, ?, ?, ?, ?, ?,
                 ?, ?, ?, ?, ?,
                 (SELECT COALESCE(MAX(sort_order),0)+1 FROM launchsite_templates),
                 NOW(), NOW())
        ")->execute([
            $data['id'],
            $data['name']          ?? '',
            $data['category']      ?? '',
            $data['style']         ?? 'Modern',
            $data['desc']          ?? '',
            $data['badge']         ?? '',
            json_encode(is_array($features) ? $features : []),
            $data['accent']        ?? '#a855f7',
            $data['dark']          ?? '#0a0b15',
            $data['light']         ?? '#1c1d27',
            $data['url_slug']      ?? $data['id'],
            $data['hero_tagline']  ?? '',
            $data['hero_sub']      ?? '',
            $data['business_name'] ?? '',
            $data['type']          ?? 'php',
            $data['react_path']    ?? null,
            $data['scraped_path']  ?? null,
            $data['source_url']    ?? null,
        ]);
        return true;
    } catch (Throwable $e) {
        error_log('launchit_insert_template: ' . $e->getMessage());
        return false;
    }
}

function launchit_update_template(string $id, array $data): bool {
    $pdo = launchit_tpl_db();
    if (!$pdo) return false;
    try {
        $setClauses = [];
        $params     = [];

        $colMap = [
            'name'          => 'name',
            'category'      => 'category',
            'style'         => 'style',
            'desc'          => 'desc',
            'badge'         => 'badge',
            'accent'        => 'accent',
            'dark'          => 'dark',
            'light'         => 'light',
            'url_slug'      => 'url_slug',
            'hero_tagline'  => 'hero_tagline',
            'hero_sub'      => 'hero_sub',
            'business_name' => 'business_name',
            'type'          => 'type',
            'react_path'    => 'react_path',
            'scraped_path'  => 'scraped_path',
            'source_url'    => 'source_url',
        ];

        foreach ($colMap as $phpKey => $col) {
            if (array_key_exists($phpKey, $data)) {
                $setClauses[] = "\"$col\" = ?";
                $params[]     = $data[$phpKey];
            }
        }

        if (array_key_exists('features', $data)) {
            $setClauses[] = '"features" = ?::jsonb';
            $features = $data['features'];
            $params[] = json_encode(is_array($features) ? $features : []);
        }

        if (!$setClauses) return true;

        $setClauses[] = '"updated_at" = NOW()';
        $params[]     = $id;

        $sql = "UPDATE launchsite_templates SET " . implode(', ', $setClauses) . " WHERE id = ?";
        $pdo->prepare($sql)->execute($params);
        return true;
    } catch (Throwable $e) {
        error_log('launchit_update_template: ' . $e->getMessage());
        return false;
    }
}

function launchit_delete_template(string $id): bool {
    $pdo = launchit_tpl_db();
    if (!$pdo) return false;
    try {
        $pdo->prepare("DELETE FROM launchsite_templates WHERE id = ?")->execute([$id]);
        return true;
    } catch (Throwable $e) {
        error_log('launchit_delete_template: ' . $e->getMessage());
        return false;
    }
}
