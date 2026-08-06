<?php
/**
 * Platform settings loader.
 *
 * Fetches the trial period length from the API server (which reads TRIAL_PERIOD_DAYS
 * and stores it) with a 5-minute file cache.  Falls back gracefully to 60 days.
 *
 * Defines the PHP constant TRIAL_DAYS (integer) so every page can use it.
 */

if (defined('TRIAL_DAYS')) return;

function _certxa_fetch_trial_days(): int {
    // 1. Env var — available when TRIAL_PERIOD_DAYS is set as a Replit secret
    $env = getenv('TRIAL_PERIOD_DAYS');
    if ($env !== false && is_numeric($env) && (int)$env > 0) {
        return (int)$env;
    }

    // 2. File cache (5-minute TTL)
    $cache = sys_get_temp_dir() . '/certxa_trial_days.json';
    if (file_exists($cache) && (time() - filemtime($cache)) < 300) {
        $data = json_decode((string)file_get_contents($cache), true);
        if (isset($data['days']) && is_numeric($data['days']) && (int)$data['days'] > 0) {
            return (int)$data['days'];
        }
    }

    // 3. Live API call (1-second timeout to avoid blocking page renders)
    $days = 60;
    try {
        $ctx = stream_context_create(['http' => ['timeout' => 1, 'ignore_errors' => true]]);
        $raw = @file_get_contents('http://localhost:9200/api/public/trial-days', false, $ctx);
        if ($raw !== false) {
            $data = json_decode($raw, true);
            if (isset($data['days']) && is_numeric($data['days']) && (int)$data['days'] > 0) {
                $days = (int)$data['days'];
                @file_put_contents($cache, json_encode(['days' => $days]));
            }
        }
    } catch (Throwable $_e) {
        // fall through to default
    }

    return $days;
}

define('TRIAL_DAYS', _certxa_fetch_trial_days());
