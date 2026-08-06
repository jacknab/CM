<?php
/**
 * /templates/ → permanent redirect to the new LaunchSite catalog at /launchsite/
 *
 * The old TemplateManager-based gallery has been replaced by a database-driven
 * catalog at /launchsite/.  Any links or bookmarks pointing here are forwarded
 * with a 301 so search engines and users land on the right page.
 */
$qs = (isset($_SERVER['QUERY_STRING']) && $_SERVER['QUERY_STRING'] !== '')
    ? '?' . $_SERVER['QUERY_STRING']
    : '';
header('Location: /launchsite/' . $qs, true, 301);
exit;
