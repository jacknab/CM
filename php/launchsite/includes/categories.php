<?php
/**
 * Central category registry.
 *
 * Defines all possible categories and computes live template counts.
 * Only categories with at least 1 template appear in $active_categories.
 *
 * Requires:  config.php  (for BASE_PATH)
 * Provides:  $all_templates, $all_categories, $active_categories
 */

require_once __DIR__ . '/../data/templates.php';

$all_categories = [
    'Hair Salon' => [
        'key'   => 'Hair Salon',
        'label' => 'Hair Salons',
        'emoji' => '💇‍♀️',
        'page'  => 'hair-salons.php',
        'desc'  => 'Elegant, professional websites for hair salons — showcasing services, stylists, and online booking in a stunning layout.',
    ],
    'Barbershop' => [
        'key'   => 'Barbershop',
        'label' => 'Barbershops',
        'emoji' => '✂️',
        'page'  => 'barbershops.php',
        'desc'  => 'Bold, sharp websites for modern barbershops. From classic heritage to street-culture — find a look that fits your shop.',
    ],
    'Nail Salon' => [
        'key'   => 'Nail Salon',
        'label' => 'Nail Salons',
        'emoji' => '💅',
        'page'  => 'nail-salons.php',
        'desc'  => 'Chic, vibrant websites for nail salons and nail artists — portfolio, services, and online booking beautifully presented.',
    ],
];

foreach ($all_categories as $key => &$cat) {
    $cat['count'] = count(array_filter($all_templates, fn($t) => $t['category'] === $key));
}
unset($cat);

$active_categories = array_filter($all_categories, fn($c) => $c['count'] > 0);
