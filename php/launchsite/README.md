# LaunchSite — PHP Catalog Frontend

## Files

```
launchsite-php/
├── index.php              # Main catalog page (3 category cards)
├── hair-salons.php        # Hair salon templates grid
├── barbershops.php        # Barbershop templates grid
├── nail-salons.php        # Nail salon templates grid
├── includes/
│   ├── header.php         # Site header / nav (shared)
│   └── footer.php         # Site footer (shared)
└── assets/
    ├── css/style.css      # All styles
    └── js/main.js         # Mobile menu + scroll animations
```

## Deployment

1. Upload the entire `launchsite-php/` folder to your server as `/launchsite/`
2. The pages assume they live at `https://certxa.com/launchsite/`
3. Make sure your web server has PHP 7.4+ enabled

## URL Structure

| URL | Page |
|-----|------|
| `/launchsite/` or `/launchsite/index.php` | Main catalog with 3 category cards |
| `/launchsite/hair-salons.php` | Hair salon templates |
| `/launchsite/barbershops.php` | Barbershop templates |
| `/launchsite/nail-salons.php` | Nail salon templates |

## Adding Template Thumbnails

Each template card has a placeholder. To add real screenshots:

1. Drop thumbnail images into `assets/images/templates/`
2. In each category PHP file, replace the `thumb-placeholder` div with:

```php
<img src="/launchsite/assets/images/templates/<?= $t['id'] ?>.jpg" alt="<?= htmlspecialchars($t['name']) ?>">
```

## Adding New Templates

In each category PHP file, add an entry to the `$templates` array:

```php
[
    'id'       => 'my-template-slug',
    'name'     => 'Template Display Name',
    'style'    => 'Modern',
    'desc'     => 'Short description shown on the card.',
    'badge'    => 'new',          // 'new', 'popular', 'premium', or ''
    'features' => ['Booking', 'Gallery', 'Services'],
    'color'    => '#1a1a2e',      // dominant color for the preview gradient
],
```

## Preview & Select Links

Cards link to:
- `/launchsite/preview.php?id={template-id}` — live demo (Part 2: React app)
- `/launchsite/select.php?id={template-id}` — add to account (Part 2: React app)

These pages will be built in Part 2 as the React application.
