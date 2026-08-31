<?php
require_once __DIR__ . '/../api/db.php';
require_once __DIR__ . '/../includes/settings.php';

// Slug is injected by router.php into $_GET['blog_slug']
$slug = $_GET['blog_slug'] ?? '';
if (!$slug) {
    $uri  = urldecode(parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH));
    $slug = trim(str_replace('/blog/', '', $uri), '/');
}

if (!$slug || $slug === 'blog') {
    header('Location: /blog', true, 302);
    exit;
}

// Fetch post from DB
try {
    $pdo  = launchit_db_connect();
    $stmt = $pdo->prepare(
        "SELECT * FROM blog_posts WHERE slug = :slug AND status = 'published' LIMIT 1"
    );
    $stmt->execute([':slug' => $slug]);
    $post = $stmt->fetch();
} catch (Throwable $e) {
    $post = null;
}

if (!$post) {
    http_response_code(404);
    define('BRAND_NAME',    'Certxa');
    define('PAGE_TITLE',    'Article Not Found — Certxa Blog');
    define('PAGE_DESC',     'This article could not be found.');
    define('PAGE_CANONICAL', 'https://certxa.com/blog/' . htmlspecialchars($slug));
    require __DIR__ . '/../includes/header.php';
    require __DIR__ . '/../includes/nav.php';
    echo '<section style="padding:120px 0;text-align:center;">
      <div class="container">
        <h1 style="font-size:2rem;color:var(--charcoal);margin-bottom:12px;">Article Not Found</h1>
        <p style="color:var(--mid-grey);margin-bottom:24px;">This article may have been moved or removed.</p>
        <a href="/blog" class="btn btn-primary">← Back to Blog</a>
      </div>
    </section>';
    require __DIR__ . '/../includes/footer.php';
    exit;
}

// Fetch related posts (same category, excluding current)
try {
    $stmt2 = $pdo->prepare(
        "SELECT id, title, slug, excerpt, category, cover_color, cover_emoji, read_time, published_at
         FROM blog_posts
         WHERE status = 'published' AND slug != :slug AND category = :cat
         ORDER BY published_at DESC NULLS LAST
         LIMIT 3"
    );
    $stmt2->execute([':slug' => $slug, ':cat' => $post['category']]);
    $related = $stmt2->fetchAll();
} catch (Throwable $e) {
    $related = [];
}

// ── Date helpers ─────────────────────────────────────────────────────────────
$pub_date_human = $post['published_at']
    ? date('F j, Y', strtotime($post['published_at']))
    : date('F j, Y', strtotime($post['created_at']));

$pub_iso = $post['published_at']
    ? date('c', strtotime($post['published_at']))
    : date('c', strtotime($post['created_at']));

$mod_iso = $post['updated_at']
    ? date('c', strtotime($post['updated_at']))
    : $pub_iso;

// ── Build excerpt / description (160 chars max for meta) ─────────────────────
$meta_desc = '';
if ($post['excerpt']) {
    $meta_desc = htmlspecialchars(substr(strip_tags($post['excerpt']), 0, 160));
} elseif ($post['content']) {
    $meta_desc = htmlspecialchars(substr(strip_tags($post['content']), 0, 160));
}

// ── Keywords: category + common nail salon terms ─────────────────────────────
$cat_keywords = [
    'Marketing'    => 'salon marketing, nail salon social media, salon client acquisition, nail salon advertising',
    'Operations'   => 'salon management tips, nail salon operations, reduce no-shows, salon scheduling',
    'Business'     => 'nail salon business tips, salon owner advice, nail salon pricing, salon profitability',
    'Software'     => 'nail salon software, salon booking app, salon management software, booking system',
    'Clients'      => 'salon client retention, nail salon loyalty, client management, repeat clients',
    'Guides'       => 'nail salon guide, how to run a nail salon, salon setup guide, step by step salon',
    'Growth'       => 'grow a nail salon, nail salon growth strategy, increase salon revenue, salon expansion',
    'Success Story'=> 'nail salon success story, salon case study, nail tech success, salon transformation',
    'General'      => 'nail salon tips, nail salon advice, certxa blog, nail salon industry',
];
$extra_keywords = $cat_keywords[$post['category']] ?? $cat_keywords['General'];
$page_keywords  = htmlspecialchars($post['title']) . ', ' . htmlspecialchars($post['category']) . ', ' . $extra_keywords . ', certxa, nail salon software';

// ── Article OG image ──────────────────────────────────────────────────────────
// Use a static branded OG image; swap for a per-post upload URL if available
$og_image = 'https://certxa.com/assets/images/og-image.jpg';

// ── JSON-LD Article schema ─────────────────────────────────────────────────────
$article_schema = json_encode([
    '@type'            => 'BlogPosting',
    '@id'              => 'https://certxa.com/blog/' . $post['slug'] . '#article',
    'headline'         => $post['title'],
    'description'      => $post['excerpt'] ? substr(strip_tags($post['excerpt']), 0, 200) : '',
    'datePublished'    => $pub_iso,
    'dateModified'     => $mod_iso,
    'url'              => 'https://certxa.com/blog/' . $post['slug'],
    'mainEntityOfPage' => [
        '@type' => 'WebPage',
        '@id'   => 'https://certxa.com/blog/' . $post['slug'],
    ],
    // A named byline is a real Person; the generic "Certxa Team" fallback is the
    // Organization, not a Person (Google flags Person nodes without a real name).
    'author' => $post['author_name']
        ? ['@type' => 'Person', 'name' => $post['author_name']]
        : ['@type' => 'Organization', '@id' => 'https://certxa.com/#organization', 'name' => 'Certxa'],
    'publisher' => [
        '@type' => 'Organization',
        '@id'   => 'https://certxa.com/#organization',
        'name'  => 'Certxa',
        'logo'  => [
            '@type' => 'ImageObject',
            'url'   => 'https://certxa.com/assets/images/logo.png',
        ],
    ],
    'image' => [
        '@type'  => 'ImageObject',
        'url'    => $og_image,
        'width'  => 1200,
        'height' => 630,
    ],
    'articleSection' => $post['category'],
    'keywords'       => $post['category'] . ', nail salon, certxa',
    'inLanguage'     => 'en-US',
    'isPartOf'       => [
        '@type' => 'Blog',
        '@id'   => 'https://certxa.com/blog#blog',
        'name'  => 'The Certxa Blog',
        'url'   => 'https://certxa.com/blog',
    ],
], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);

// ── Define page constants for header.php ──────────────────────────────────────
define('BRAND_NAME',           'Certxa');
define('PAGE_TITLE',           $post['title'] . ' — Certxa Blog');
define('PAGE_DESC',            $meta_desc ?: 'Read this article on the Certxa Blog — practical tips for nail salon owners and technicians.');
define('PAGE_KEYWORDS',        $page_keywords);
define('PAGE_CANONICAL',       'https://certxa.com/blog/' . $post['slug']);
define('PAGE_OG_TYPE',         'article');
define('PAGE_OG_IMAGE',        $og_image);
define('PAGE_OG_IMAGE_ALT',    $post['title'] . ' — Certxa Blog');
define('PAGE_ARTICLE_AUTHOR',    $post['author_name'] ?: 'Certxa Team');
define('PAGE_ARTICLE_PUBLISHED', $pub_iso);
define('PAGE_ARTICLE_MODIFIED',  $mod_iso);
define('PAGE_ARTICLE_SECTION',   $post['category']);
define('PAGE_BREADCRUMBS', json_encode([
    ['name' => 'Home',         'url' => 'https://certxa.com/'],
    ['name' => 'Blog',         'url' => 'https://certxa.com/blog'],
    ['name' => $post['title'], 'url' => 'https://certxa.com/blog/' . $post['slug']],
]));
define('PAGE_SCHEMA', $article_schema);

require __DIR__ . '/../includes/header.php';
require __DIR__ . '/../includes/nav.php';
?>

<!-- HERO -->
<section style="background:var(--cream);padding:72px 0 48px;border-bottom:1px solid var(--light-grey);">
  <div class="container" style="max-width:760px;">
    <a href="/blog" style="display:inline-flex;align-items:center;gap:6px;font-size:.82rem;font-weight:600;color:var(--plum);text-decoration:none;margin-bottom:24px;">
      ← Back to Blog
    </a>
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px;flex-wrap:wrap;">
      <span style="font-size:.72rem;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:<?= htmlspecialchars($post['cover_color']) ?>;background:<?= htmlspecialchars($post['cover_color']) ?>18;padding:4px 12px;border-radius:50px;">
        <?= htmlspecialchars($post['category']) ?>
      </span>
      <span style="font-size:.78rem;color:var(--mid-grey);"><?= htmlspecialchars($post['read_time']) ?></span>
      <time datetime="<?= $pub_iso ?>" style="font-size:.78rem;color:var(--mid-grey);"><?= $pub_date_human ?></time>
    </div>
    <h1 style="font-family:'Cormorant Garamond',serif;font-size:clamp(1.8rem,4vw,2.6rem);font-weight:600;color:var(--charcoal);line-height:1.2;margin-bottom:16px;">
      <?= htmlspecialchars($post['title']) ?>
    </h1>
    <?php if ($post['excerpt']): ?>
    <p style="font-size:1.05rem;color:var(--mid-grey);line-height:1.7;margin-bottom:20px;">
      <?= htmlspecialchars($post['excerpt']) ?>
    </p>
    <?php endif; ?>
    <?php $author_display = $post['author_name'] ?: 'Certxa Team'; ?>
    <div style="display:flex;align-items:center;gap:10px;">
      <div style="width:36px;height:36px;border-radius:50%;background:linear-gradient(135deg,var(--plum),#6d28d9);display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:.85rem;" aria-hidden="true">
        <?= strtoupper(substr($author_display, 0, 1)) ?>
      </div>
      <div>
        <div style="font-size:.82rem;font-weight:600;color:var(--charcoal);" itemprop="author"><?= htmlspecialchars($author_display) ?></div>
        <div style="font-size:.73rem;color:var(--mid-grey);"><time datetime="<?= $pub_iso ?>"><?= $pub_date_human ?></time></div>
      </div>
    </div>
  </div>
</section>

<!-- ARTICLE BODY -->
<article itemscope itemtype="https://schema.org/BlogPosting" style="padding:56px 0 72px;">
  <meta itemprop="headline"      content="<?= htmlspecialchars($post['title']) ?>">
  <meta itemprop="datePublished" content="<?= $pub_iso ?>">
  <meta itemprop="dateModified"  content="<?= $mod_iso ?>">
  <meta itemprop="author"        content="<?= htmlspecialchars($post['author_name']) ?>">
  <meta itemprop="image"         content="<?= htmlspecialchars($og_image) ?>">

  <div class="container" style="max-width:760px;">
    <?php if ($post['content']): ?>
    <div class="blog-content" itemprop="articleBody">
      <?= $post['content'] /* stored as admin-entered HTML */ ?>
    </div>
    <?php else: ?>
    <p style="color:var(--mid-grey);font-style:italic;">This article has no content yet.</p>
    <?php endif; ?>

    <!-- Tags / category pill -->
    <div style="margin-top:36px;padding-top:24px;border-top:1px solid var(--light-grey);display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
      <span style="font-size:.72rem;font-weight:700;color:var(--mid-grey);text-transform:uppercase;letter-spacing:.06em;">Tags:</span>
      <a href="/blog" style="font-size:.75rem;font-weight:600;color:<?= htmlspecialchars($post['cover_color']) ?>;background:<?= htmlspecialchars($post['cover_color']) ?>18;padding:4px 12px;border-radius:50px;text-decoration:none;">
        <?= htmlspecialchars($post['category']) ?>
      </a>
      <a href="/blog" style="font-size:.75rem;font-weight:600;color:var(--plum);background:#f5f3ff;padding:4px 12px;border-radius:50px;text-decoration:none;">Nail Salon</a>
    </div>

    <!-- Share strip -->
    <div style="margin-top:32px;padding:24px;background:var(--cream);border-radius:var(--radius-lg);border:1px solid var(--light-grey);display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;">
      <div>
        <div style="font-size:.85rem;font-weight:700;color:var(--charcoal);margin-bottom:2px;">Found this helpful?</div>
        <div style="font-size:.78rem;color:var(--mid-grey);">Share it with your network.</div>
      </div>
      <div style="display:flex;gap:8px;">
        <a href="https://twitter.com/intent/tweet?text=<?= urlencode($post['title']) ?>&url=<?= urlencode('https://certxa.com/blog/' . $post['slug']) ?>"
           target="_blank" rel="noopener noreferrer"
           style="padding:8px 16px;border-radius:50px;font-size:.78rem;font-weight:600;background:#000;color:#fff;text-decoration:none;">
          𝕏 Share
        </a>
        <a href="https://www.linkedin.com/sharing/share-offsite/?url=<?= urlencode('https://certxa.com/blog/' . $post['slug']) ?>"
           target="_blank" rel="noopener noreferrer"
           style="padding:8px 16px;border-radius:50px;font-size:.78rem;font-weight:600;background:#0a66c2;color:#fff;text-decoration:none;">
          LinkedIn
        </a>
        <a href="https://www.facebook.com/sharer/sharer.php?u=<?= urlencode('https://certxa.com/blog/' . $post['slug']) ?>"
           target="_blank" rel="noopener noreferrer"
           style="padding:8px 16px;border-radius:50px;font-size:.78rem;font-weight:600;background:#1877f2;color:#fff;text-decoration:none;">
          Facebook
        </a>
      </div>
    </div>
  </div>
</article>

<?php if (!empty($related)): ?>
<!-- RELATED ARTICLES -->
<section style="background:var(--cream);padding:56px 0;border-top:1px solid var(--light-grey);">
  <div class="container" style="max-width:1040px;">
    <h2 style="font-size:1.15rem;font-weight:700;color:var(--charcoal);margin-bottom:24px;">More in <?= htmlspecialchars($post['category']) ?></h2>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:20px;">
      <?php foreach ($related as $r): ?>
      <a href="/blog/<?= htmlspecialchars($r['slug']) ?>" style="text-decoration:none;display:block;background:#fff;border-radius:var(--radius-lg);border:1px solid var(--light-grey);overflow:hidden;transition:var(--transition);"
         onmouseenter="this.style.boxShadow='var(--shadow-md)';this.style.transform='translateY(-2px)'"
         onmouseleave="this.style.boxShadow='none';this.style.transform='none'">
        <div style="height:90px;background:linear-gradient(135deg,<?= htmlspecialchars($r['cover_color']) ?>22,<?= htmlspecialchars($r['cover_color']) ?>44);display:flex;align-items:center;justify-content:center;font-size:2rem;" aria-hidden="true">
          <?= htmlspecialchars($r['cover_emoji']) ?>
        </div>
        <div style="padding:16px;">
          <span style="font-size:.65rem;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:<?= htmlspecialchars($r['cover_color']) ?>;"><?= htmlspecialchars($r['category']) ?></span>
          <h3 style="font-size:.88rem;font-weight:700;color:var(--charcoal);line-height:1.35;margin:6px 0 4px;"><?= htmlspecialchars($r['title']) ?></h3>
          <span style="font-size:.72rem;color:var(--mid-grey);"><?= htmlspecialchars($r['read_time']) ?></span>
        </div>
      </a>
      <?php endforeach; ?>
    </div>
  </div>
</section>
<?php endif; ?>

<!-- NEWSLETTER CTA -->
<section style="background:#fff;padding:64px 0;border-top:1px solid var(--light-grey);">
  <div class="container" style="max-width:520px;text-align:center;">
    <span class="tag tag-plum" style="margin-bottom:16px;display:inline-block;">Newsletter</span>
    <h2 style="font-family:'Cormorant Garamond',serif;font-size:1.7rem;font-weight:600;color:var(--charcoal);margin-bottom:10px;">Salon growth tips, every week.</h2>
    <p style="color:var(--mid-grey);font-size:.88rem;margin-bottom:22px;">Get our weekly insights on growing a salon business.</p>
    <div style="display:flex;gap:8px;max-width:400px;margin:0 auto;">
      <input type="email" placeholder="your@email.com" style="flex:1;padding:12px 16px;border:1px solid var(--light-grey);border-radius:var(--radius-sm);font-size:.88rem;outline:none;" aria-label="Email address">
      <button style="background:var(--plum);color:#fff;border:none;padding:12px 20px;border-radius:var(--radius-sm);font-weight:600;font-size:.88rem;cursor:pointer;">Subscribe</button>
    </div>
  </div>
</section>

<!-- Blog content styles -->
<style>
.blog-content { color:#374151; }
.blog-content h1,.blog-content h2,.blog-content h3,.blog-content h4 {
  font-family:'Cormorant Garamond',serif;
  color:var(--charcoal);
  margin:1.6em 0 .5em;
  line-height:1.25;
}
.blog-content h2 { font-size:1.65rem; font-weight:600; }
.blog-content h3 { font-size:1.25rem; font-weight:600; }
.blog-content h4 { font-size:1rem;   font-weight:700; }
.blog-content p  { margin:0 0 1.2em; line-height:1.85; }
.blog-content ul,.blog-content ol { padding-left:1.5em; margin:0 0 1.2em; }
.blog-content li { margin-bottom:.5em; line-height:1.75; }
.blog-content blockquote {
  border-left:3px solid var(--plum);
  margin:1.6em 0;
  padding:.9em 1.4em;
  background:#f9f5ff;
  border-radius:0 var(--radius-sm) var(--radius-sm) 0;
  color:#555;
  font-style:italic;
  font-size:1.05rem;
}
.blog-content a { color:var(--plum); text-decoration:underline; }
.blog-content a:hover { color:#5b21b6; }
.blog-content img { max-width:100%; border-radius:var(--radius-sm); margin:1em 0; height:auto; }
.blog-content code {
  background:#f3f4f6;
  padding:2px 6px;
  border-radius:4px;
  font-size:.875em;
  font-family:'Courier New',monospace;
}
.blog-content pre {
  background:#1e1e2e;
  color:#cdd6f4;
  padding:1.2em 1.4em;
  border-radius:var(--radius-sm);
  overflow-x:auto;
  margin:1.4em 0;
}
.blog-content pre code { background:none; color:inherit; padding:0; }
.blog-content hr { border:none; border-top:1px solid var(--light-grey); margin:2.4em 0; }
.blog-content table { width:100%; border-collapse:collapse; margin:1.4em 0; font-size:.9rem; }
.blog-content th,.blog-content td { border:1px solid var(--light-grey); padding:10px 14px; }
.blog-content th { background:var(--cream); font-weight:700; text-align:left; }
.blog-content strong { font-weight:700; color:var(--charcoal); }
</style>

<?php require __DIR__ . '/../includes/footer.php'; ?>
