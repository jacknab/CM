<?php
session_start();
require_once __DIR__ . '/config.php';

$blocks = [
    [
        'id'       => 'team-booking-cards',
        'name'     => 'Team Booking Cards',
        'category' => 'Team',
        'desc'     => 'Show up to 4 staff cards with photo, name, bio, and an individual "Book with me" button. Drop this into any page on your website.',
        'badge'    => 'popular',
        'code'     => <<<'HTML'
<!-- Certxa Team Booking Cards — paste anywhere on your website -->
<!-- INSTRUCTIONS: Replace each block of placeholder values with your real staff data.
     Replace PHOTO_URL with a direct image link (or remove the <img> line for the default avatar).
     Replace STAFF_NAME, STAFF_BIO, and BOOKING_URL for each team member.
     Duplicate or remove <div> cards to match your team size. -->
<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:24px;max-width:960px;margin:0 auto;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">

  <!-- Staff Card 1 -->
  <div style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08);text-align:center;">
    <img src="PHOTO_URL_1" alt="STAFF_NAME_1" style="width:100%;height:180px;object-fit:cover;display:block;" />
    <div style="padding:20px 16px;">
      <h3 style="margin:0 0 6px;font-size:1rem;font-weight:700;color:#111;">STAFF_NAME_1</h3>
      <p style="margin:0 0 16px;font-size:0.8rem;color:#6b7280;line-height:1.5;">STAFF_BIO_1</p>
      <a href="BOOKING_URL_1" target="_blank" style="display:inline-block;background:#7c3aed;color:#fff;text-decoration:none;padding:10px 20px;border-radius:8px;font-size:0.8rem;font-weight:600;">Book with me</a>
    </div>
  </div>

  <!-- Staff Card 2 -->
  <div style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08);text-align:center;">
    <img src="PHOTO_URL_2" alt="STAFF_NAME_2" style="width:100%;height:180px;object-fit:cover;display:block;" />
    <div style="padding:20px 16px;">
      <h3 style="margin:0 0 6px;font-size:1rem;font-weight:700;color:#111;">STAFF_NAME_2</h3>
      <p style="margin:0 0 16px;font-size:0.8rem;color:#6b7280;line-height:1.5;">STAFF_BIO_2</p>
      <a href="BOOKING_URL_2" target="_blank" style="display:inline-block;background:#7c3aed;color:#fff;text-decoration:none;padding:10px 20px;border-radius:8px;font-size:0.8rem;font-weight:600;">Book with me</a>
    </div>
  </div>

  <!-- Staff Card 3 -->
  <div style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08);text-align:center;">
    <img src="PHOTO_URL_3" alt="STAFF_NAME_3" style="width:100%;height:180px;object-fit:cover;display:block;" />
    <div style="padding:20px 16px;">
      <h3 style="margin:0 0 6px;font-size:1rem;font-weight:700;color:#111;">STAFF_NAME_3</h3>
      <p style="margin:0 0 16px;font-size:0.8rem;color:#6b7280;line-height:1.5;">STAFF_BIO_3</p>
      <a href="BOOKING_URL_3" target="_blank" style="display:inline-block;background:#7c3aed;color:#fff;text-decoration:none;padding:10px 20px;border-radius:8px;font-size:0.8rem;font-weight:600;">Book with me</a>
    </div>
  </div>

  <!-- Staff Card 4 -->
  <div style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08);text-align:center;">
    <img src="PHOTO_URL_4" alt="STAFF_NAME_4" style="width:100%;height:180px;object-fit:cover;display:block;" />
    <div style="padding:20px 16px;">
      <h3 style="margin:0 0 6px;font-size:1rem;font-weight:700;color:#111;">STAFF_NAME_4</h3>
      <p style="margin:0 0 16px;font-size:0.8rem;color:#6b7280;line-height:1.5;">STAFF_BIO_4</p>
      <a href="BOOKING_URL_4" target="_blank" style="display:inline-block;background:#7c3aed;color:#fff;text-decoration:none;padding:10px 20px;border-radius:8px;font-size:0.8rem;font-weight:600;">Book with me</a>
    </div>
  </div>

</div>
HTML,
    ],
    [
        'id'       => 'book-now-button',
        'name'     => 'Book Now Button',
        'category' => 'Booking',
        'desc'     => 'A single, eye-catching "Book Now" button that links to your online booking page. Drop it anywhere — hero section, sidebar, or footer.',
        'badge'    => '',
        'code'     => <<<'HTML'
<!-- Certxa Book Now Button — paste anywhere on your website -->
<!-- INSTRUCTIONS: Replace BOOKING_URL with your Certxa booking link (e.g. https://yourdomain.com/book/your-salon) -->
<div style="text-align:center;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <a href="BOOKING_URL" target="_blank"
     style="display:inline-flex;align-items:center;gap:10px;background:#7c3aed;color:#fff;text-decoration:none;padding:14px 32px;border-radius:10px;font-size:1rem;font-weight:700;letter-spacing:0.01em;box-shadow:0 4px 14px rgba(124,58,237,0.35);transition:opacity 0.15s;"
     onmouseover="this.style.opacity='0.9'" onmouseout="this.style.opacity='1'">
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
    Book an Appointment
  </a>
</div>
HTML,
    ],
    [
        'id'       => 'booking-banner',
        'name'     => 'Booking Banner',
        'category' => 'Booking',
        'desc'     => 'A full-width banner strip with a headline, short tagline, and a booking button. Perfect for the top or bottom of a page.',
        'badge'    => 'new',
        'code'     => <<<'HTML'
<!-- Certxa Booking Banner — paste anywhere on your website -->
<!-- INSTRUCTIONS:
     - Replace BOOKING_URL with your Certxa booking link
     - Replace SALON_NAME, HEADLINE_TEXT, and TAGLINE_TEXT with your own content
     - Change the background colour (#7c3aed) to match your brand if desired -->
<div style="background:linear-gradient(135deg,#7c3aed,#9f67f5);padding:48px 24px;text-align:center;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <p style="margin:0 0 8px;font-size:0.8rem;font-weight:600;letter-spacing:0.1em;text-transform:uppercase;color:rgba(255,255,255,0.7);">SALON_NAME</p>
  <h2 style="margin:0 0 12px;font-size:2rem;font-weight:800;color:#fff;line-height:1.2;">HEADLINE_TEXT</h2>
  <p style="margin:0 0 28px;font-size:1rem;color:rgba(255,255,255,0.8);">TAGLINE_TEXT</p>
  <a href="BOOKING_URL" target="_blank"
     style="display:inline-block;background:#fff;color:#7c3aed;text-decoration:none;padding:14px 36px;border-radius:10px;font-size:0.95rem;font-weight:700;">
    Book Now →
  </a>
</div>
HTML,
    ],
    [
        'id'       => 'mini-service-menu',
        'name'     => 'Mini Service Menu',
        'category' => 'Services',
        'desc'     => 'A clean 3-column service listing showing service name, short description, and price. Link each to your booking page.',
        'badge'    => '',
        'code'     => <<<'HTML'
<!-- Certxa Mini Service Menu — paste anywhere on your website -->
<!-- INSTRUCTIONS: Replace SERVICE_NAME, SERVICE_DESC, PRICE, and BOOKING_URL for each service.
     Add or remove <div> cards to match your service list. -->
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:900px;margin:0 auto;">
  <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:20px;">

    <!-- Service 1 -->
    <div style="border:1px solid #e5e7eb;border-radius:12px;padding:24px;">
      <div style="font-size:1.5rem;margin-bottom:12px;">✂️</div>
      <h3 style="margin:0 0 8px;font-size:1rem;font-weight:700;color:#111;">SERVICE_NAME_1</h3>
      <p style="margin:0 0 16px;font-size:0.85rem;color:#6b7280;line-height:1.5;">SERVICE_DESC_1</p>
      <div style="display:flex;align-items:center;justify-content:space-between;">
        <span style="font-size:0.9rem;font-weight:700;color:#7c3aed;">PRICE_1</span>
        <a href="BOOKING_URL" target="_blank" style="font-size:0.8rem;color:#7c3aed;text-decoration:none;font-weight:600;">Book →</a>
      </div>
    </div>

    <!-- Service 2 -->
    <div style="border:1px solid #e5e7eb;border-radius:12px;padding:24px;">
      <div style="font-size:1.5rem;margin-bottom:12px;">🎨</div>
      <h3 style="margin:0 0 8px;font-size:1rem;font-weight:700;color:#111;">SERVICE_NAME_2</h3>
      <p style="margin:0 0 16px;font-size:0.85rem;color:#6b7280;line-height:1.5;">SERVICE_DESC_2</p>
      <div style="display:flex;align-items:center;justify-content:space-between;">
        <span style="font-size:0.9rem;font-weight:700;color:#7c3aed;">PRICE_2</span>
        <a href="BOOKING_URL" target="_blank" style="font-size:0.8rem;color:#7c3aed;text-decoration:none;font-weight:600;">Book →</a>
      </div>
    </div>

    <!-- Service 3 -->
    <div style="border:1px solid #e5e7eb;border-radius:12px;padding:24px;">
      <div style="font-size:1.5rem;margin-bottom:12px;">💆</div>
      <h3 style="margin:0 0 8px;font-size:1rem;font-weight:700;color:#111;">SERVICE_NAME_3</h3>
      <p style="margin:0 0 16px;font-size:0.85rem;color:#6b7280;line-height:1.5;">SERVICE_DESC_3</p>
      <div style="display:flex;align-items:center;justify-content:space-between;">
        <span style="font-size:0.9rem;font-weight:700;color:#7c3aed;">PRICE_3</span>
        <a href="BOOKING_URL" target="_blank" style="font-size:0.8rem;color:#7c3aed;text-decoration:none;font-weight:600;">Book →</a>
      </div>
    </div>

  </div>
</div>
HTML,
    ],
    [
        'id'       => 'review-strip',
        'name'     => 'Review Strip',
        'category' => 'Social Proof',
        'desc'     => 'Display 3 client reviews side by side with star ratings and reviewer names. Works great beneath a hero section.',
        'badge'    => '',
        'code'     => <<<'HTML'
<!-- Certxa Review Strip — paste anywhere on your website -->
<!-- INSTRUCTIONS: Replace REVIEWER_NAME, REVIEW_TEXT, and STAR_RATING (use ★ for filled stars) -->
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:960px;margin:0 auto;">
  <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:20px;">

    <!-- Review 1 -->
    <div style="background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:24px;">
      <div style="color:#f59e0b;font-size:1.1rem;margin-bottom:12px;">★★★★★</div>
      <p style="margin:0 0 16px;font-size:0.9rem;color:#374151;line-height:1.6;font-style:italic;">"REVIEW_TEXT_1"</p>
      <p style="margin:0;font-size:0.8rem;font-weight:700;color:#111;">REVIEWER_NAME_1</p>
    </div>

    <!-- Review 2 -->
    <div style="background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:24px;">
      <div style="color:#f59e0b;font-size:1.1rem;margin-bottom:12px;">★★★★★</div>
      <p style="margin:0 0 16px;font-size:0.9rem;color:#374151;line-height:1.6;font-style:italic;">"REVIEW_TEXT_2"</p>
      <p style="margin:0;font-size:0.8rem;font-weight:700;color:#111;">REVIEWER_NAME_2</p>
    </div>

    <!-- Review 3 -->
    <div style="background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:24px;">
      <div style="color:#f59e0b;font-size:1.1rem;margin-bottom:12px;">★★★★★</div>
      <p style="margin:0 0 16px;font-size:0.9rem;color:#374151;line-height:1.6;font-style:italic;">"REVIEW_TEXT_3"</p>
      <p style="margin:0;font-size:0.8rem;font-weight:700;color:#111;">REVIEWER_NAME_3</p>
    </div>

  </div>
</div>
HTML,
    ],
];
?>
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Block Library — Launchit Admin</title>
<link rel="stylesheet" href="<?php echo BASE_PATH; ?>/assets/css/admin.css">
<style>
.blocks-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(520px, 1fr));
    gap: 24px;
}
.block-card {
    background: #0d1225;
    border: 1px solid rgba(255,255,255,0.07);
    border-radius: 14px;
    overflow: hidden;
    display: flex;
    flex-direction: column;
}
.block-card__header {
    padding: 20px 24px 16px;
    border-bottom: 1px solid rgba(255,255,255,0.06);
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
}
.block-card__meta { flex: 1; min-width: 0; }
.block-card__name {
    font-size: 1rem;
    font-weight: 700;
    color: white;
    margin-bottom: 4px;
}
.block-card__desc {
    font-size: 0.8rem;
    color: rgba(255,255,255,0.45);
    line-height: 1.5;
}
.block-cat-tag {
    font-size: 0.68rem;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    padding: 3px 9px;
    border-radius: 100px;
    white-space: nowrap;
    flex-shrink: 0;
    margin-top: 2px;
}
.block-cat-tag--team     { background: rgba(124,58,237,0.15); color: #a78bfa; border: 1px solid rgba(124,58,237,0.25); }
.block-cat-tag--booking  { background: rgba(59,130,246,0.12); color: #60a5fa; border: 1px solid rgba(59,130,246,0.25); }
.block-cat-tag--services { background: rgba(16,185,129,0.12); color: #34d399; border: 1px solid rgba(16,185,129,0.25); }
.block-cat-tag--social   { background: rgba(245,158,11,0.12); color: #fbbf24; border: 1px solid rgba(245,158,11,0.25); }
.block-badge {
    font-size: 0.65rem;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    padding: 2px 7px;
    border-radius: 100px;
    margin-left: 8px;
    vertical-align: middle;
}
.block-badge--popular { background: rgba(251,146,60,0.15); color: #fb923c; border: 1px solid rgba(251,146,60,0.25); }
.block-badge--new     { background: rgba(52,211,153,0.12); color: #34d399; border: 1px solid rgba(52,211,153,0.25); }
.block-card__code-wrap {
    position: relative;
    flex: 1;
}
.block-card__code {
    display: block;
    width: 100%;
    background: #060915;
    color: #a5b4fc;
    font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
    font-size: 0.72rem;
    line-height: 1.7;
    padding: 20px 24px;
    border: none;
    resize: none;
    height: 220px;
    overflow-y: auto;
    outline: none;
    white-space: pre;
    tab-size: 2;
}
.block-card__footer {
    padding: 14px 24px;
    border-top: 1px solid rgba(255,255,255,0.06);
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
}
.block-card__tip {
    font-size: 0.75rem;
    color: rgba(255,255,255,0.35);
}
.btn-copy {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    background: #7c3aed;
    color: white;
    border: none;
    padding: 8px 18px;
    border-radius: 8px;
    font-size: 0.8rem;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.15s, transform 0.1s;
    white-space: nowrap;
}
.btn-copy:hover { background: #6d28d9; }
.btn-copy:active { transform: scale(0.97); }
.btn-copy--success { background: #059669; }
.filter-bar {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
    margin-bottom: 28px;
}
.filter-btn {
    background: transparent;
    border: 1px solid rgba(255,255,255,0.12);
    color: rgba(255,255,255,0.5);
    padding: 6px 16px;
    border-radius: 100px;
    font-size: 0.8rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s;
}
.filter-btn:hover,
.filter-btn.active {
    background: rgba(124,58,237,0.15);
    border-color: rgba(124,58,237,0.4);
    color: #a78bfa;
}
.filter-label {
    font-size: 0.8rem;
    color: rgba(255,255,255,0.3);
    margin-right: 4px;
}
.info-banner {
    background: rgba(124,58,237,0.08);
    border: 1px solid rgba(124,58,237,0.2);
    border-radius: 10px;
    padding: 16px 20px;
    margin-bottom: 28px;
    display: flex;
    align-items: flex-start;
    gap: 12px;
}
.info-banner__icon { font-size: 1.2rem; flex-shrink: 0; margin-top: 1px; }
.info-banner__text { font-size: 0.83rem; color: rgba(255,255,255,0.55); line-height: 1.6; }
.info-banner__text strong { color: rgba(255,255,255,0.85); }
</style>
</head>
<body class="admin-body">

<header class="admin-header">
    <a class="admin-header__brand" href="<?php echo BASE_PATH; ?>/admin.php">
        <div class="admin-header__logo">🚀</div>
        Launchit Admin
        <span class="admin-header__tag">Certxa</span>
    </a>
    <div class="admin-header__actions">
        <span class="admin-header__user">Block Library</span>
        <a href="<?php echo BASE_PATH; ?>/admin.php" class="admin-logout">← Back to Templates</a>
        <a href="<?php echo BASE_PATH; ?>/" target="_blank" class="admin-logout">View Catalog ↗</a>
        <a href="<?php echo BASE_PATH; ?>/admin.php?logout=1" class="admin-logout">Sign Out</a>
    </div>
</header>

<div class="admin-layout">
    <div class="admin-page-title">🧩 Block Library</div>
    <div class="admin-page-sub">Pre-built HTML blocks you can paste into any website template — no coding required.</div>

    <div class="info-banner">
        <div class="info-banner__icon">💡</div>
        <div class="info-banner__text">
            <strong>How to use these blocks:</strong> Click <em>Copy Code</em> on any block, then paste it directly into your website's HTML editor, Squarespace, WordPress, Wix custom code area, or any website builder that accepts HTML. Replace the <code>PLACEHOLDER</code> values with your real content. For the team booking blocks, get your individual staff booking links from the <strong>Certxa dashboard → Online Booking → Team Booking Links</strong>.
        </div>
    </div>

    <div class="filter-bar">
        <span class="filter-label">Filter:</span>
        <button class="filter-btn active" data-cat="all" onclick="filterBlocks('all', this)">All Blocks</button>
        <button class="filter-btn" data-cat="team" onclick="filterBlocks('team', this)">Team</button>
        <button class="filter-btn" data-cat="booking" onclick="filterBlocks('booking', this)">Booking</button>
        <button class="filter-btn" data-cat="services" onclick="filterBlocks('services', this)">Services</button>
        <button class="filter-btn" data-cat="social" onclick="filterBlocks('social', this)">Social Proof</button>
    </div>

    <div class="blocks-grid" id="blocksGrid">
        <?php foreach ($blocks as $block):
            $catKey = strtolower(str_replace(' ', '-', $block['category']));
            $catTagClass = match($block['category']) {
                'Team'         => 'block-cat-tag--team',
                'Booking'      => 'block-cat-tag--booking',
                'Services'     => 'block-cat-tag--services',
                'Social Proof' => 'block-cat-tag--social',
                default        => 'block-cat-tag--booking',
            };
            $code = htmlspecialchars($block['code']);
        ?>
        <div class="block-card" data-cat="<?php echo htmlspecialchars($catKey); ?>">
            <div class="block-card__header">
                <div class="block-card__meta">
                    <div class="block-card__name">
                        <?php echo htmlspecialchars($block['name']); ?>
                        <?php if ($block['badge']): ?>
                        <span class="block-badge block-badge--<?php echo htmlspecialchars($block['badge']); ?>"><?php echo htmlspecialchars($block['badge']); ?></span>
                        <?php endif; ?>
                    </div>
                    <div class="block-card__desc"><?php echo htmlspecialchars($block['desc']); ?></div>
                </div>
                <span class="block-cat-tag <?php echo $catTagClass; ?>"><?php echo htmlspecialchars($block['category']); ?></span>
            </div>
            <div class="block-card__code-wrap">
                <textarea class="block-card__code" id="code-<?php echo htmlspecialchars($block['id']); ?>" readonly spellcheck="false"><?php echo $code; ?></textarea>
            </div>
            <div class="block-card__footer">
                <span class="block-card__tip">Replace all <code>PLACEHOLDER</code> values with your content</span>
                <button class="btn-copy" onclick="copyBlock('<?php echo htmlspecialchars($block['id']); ?>', this)">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                    Copy Code
                </button>
            </div>
        </div>
        <?php endforeach; ?>
    </div>
</div>

<script>
function copyBlock(id, btn) {
    const ta = document.getElementById('code-' + id);
    if (!ta) return;
    navigator.clipboard.writeText(ta.value).then(() => {
        const orig = btn.innerHTML;
        btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg> Copied!';
        btn.classList.add('btn-copy--success');
        setTimeout(() => { btn.innerHTML = orig; btn.classList.remove('btn-copy--success'); }, 2200);
    });
}

function filterBlocks(cat, btn) {
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    document.querySelectorAll('.block-card').forEach(card => {
        const show = cat === 'all' || card.dataset.cat === cat;
        card.style.display = show ? '' : 'none';
    });
}
</script>

</body>
</html>
