<?php
// Serve the homepage at certxa.com/ with NO redirect.
//
// Define canonical and breadcrumbs BEFORE requiring the page file so the
// <link rel="canonical"> in the HTML says https://certxa.com/, not /overview.
// This is what Google Business Profile and Google Search both expect: the
// website URL you register (certxa.com) must match the canonical of the page
// served there — otherwise Google flags it as a redirect mismatch.
define('PAGE_CANONICAL',   'https://certxa.com/');
define('PAGE_BREADCRUMBS', json_encode([
  ['name' => 'Home', 'url' => 'https://certxa.com/'],
]));
require __DIR__ . '/overview/default.php';
