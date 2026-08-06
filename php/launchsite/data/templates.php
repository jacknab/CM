<?php
/**
 * Template catalog loader.
 *
 * Reads all templates from the launchsite_templates PostgreSQL table and
 * provides $all_templates as an associative array keyed by template ID.
 * This replaces the old flat-file PHP array approach.
 */

require_once __DIR__ . '/../api/db-templates.php';

$all_templates = launchit_all_templates();
