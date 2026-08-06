<?php
define('BRAND_NAME',    'Certxa');
define('PAGE_TITLE',    'Nail Salon Business Blog | Tips, Guides & Insights for Nail Professionals — Certxa');
define('PAGE_DESC',     'The Certxa blog — practical guides and insights to help nail studio owners and nail technicians grow their business. Booking tips, marketing advice, software guides, and more.');
define('PAGE_KEYWORDS', 'nail salon business blog, nail salon owner tips, nail salon marketing, how to grow a nail salon, nail salon booking tips, nail tech business advice, nail salon software guides, reduce no-shows nail salon');
define('PAGE_CANONICAL','https://certxa.com/blog');
define('PAGE_BREADCRUMBS', json_encode([
  ['name'=>'Home','url'=>'https://certxa.com/'],
  ['name'=>'Blog','url'=>'https://certxa.com/blog'],
]));

require_once __DIR__ . '/../api/db.php';

// Fetch posts from DB
$featured  = null;
$articles  = [];
$categories = ['All','Marketing','Operations','Business','Software','Clients','Guides','Growth','Success Story'];

try {
    $pdo = launchit_db_connect();

    $feat_stmt = $pdo->query(
        "SELECT * FROM blog_posts WHERE status='published' AND is_featured=true ORDER BY published_at DESC NULLS LAST LIMIT 1"
    );
    $featured = $feat_stmt->fetch() ?: null;

    $art_stmt = $pdo->prepare(
        "SELECT id,title,slug,excerpt,category,cover_color,cover_emoji,read_time,published_at
         FROM blog_posts
         WHERE status='published'" . ($featured ? " AND id != :fid" : "") . "
         ORDER BY published_at DESC NULLS LAST
         LIMIT 12"
    );
    if ($featured) $art_stmt->bindValue(':fid', $featured['id'], PDO::PARAM_INT);
    $art_stmt->execute();
    $articles = $art_stmt->fetchAll();
} catch (Throwable $e) {
    // Graceful fallback — DB not yet migrated or unavailable
}

require 'includes/header.php';
require 'includes/nav.php';

function fmt_date(string $ts): string {
    return date('F j, Y', strtotime($ts));
}
?>

<!-- HERO -->
<section style="background:var(--cream);padding:80px 0 60px;border-bottom:1px solid var(--light-grey);">
  <div class="container">
    <div style="text-align:center;margin-bottom:48px;">
      <span class="tag tag-plum" style="margin-bottom:16px;display:inline-block;">The Certxa Blog</span>
      <h1 style="font-family:'Cormorant Garamond',serif;font-size:clamp(2rem,4vw,3rem);font-weight:600;color:var(--charcoal);margin-bottom:12px;">Grow your salon.<br><em style="color:var(--plum);">One insight at a time.</em></h1>
      <p style="color:var(--mid-grey);font-size:1rem;max-width:520px;margin:0 auto;">Practical tips and proven strategies for salon owners, stylists, nail technicians, and barbers.</p>
    </div>

    <!-- FEATURED ARTICLE -->
    <?php if ($featured): ?>
    <div style="background:var(--white);border-radius:var(--radius-lg);overflow:hidden;border:1px solid var(--light-grey);box-shadow:var(--shadow-md);display:grid;grid-template-columns:1fr 1fr;gap:0;max-width:900px;margin:0 auto;">
      <div style="background:linear-gradient(145deg,var(--plum),#1e0040);padding:48px 40px;display:flex;flex-direction:column;justify-content:center;">
        <span style="background:rgba(255,255,255,.15);color:#fff;font-size:.72rem;font-weight:700;padding:4px 12px;border-radius:50px;display:inline-block;margin-bottom:16px;letter-spacing:.08em;width:fit-content;">
          <?= htmlspecialchars($featured['category']) ?> · <?= htmlspecialchars($featured['read_time']) ?>
        </span>
        <h2 style="font-family:'Cormorant Garamond',serif;font-size:1.6rem;font-weight:600;color:#fff;line-height:1.25;margin-bottom:14px;">
          <?= htmlspecialchars($featured['title']) ?>
        </h2>
        <?php if ($featured['excerpt']): ?>
        <p style="color:rgba(255,255,255,.75);font-size:.88rem;line-height:1.65;margin-bottom:24px;">
          <?= htmlspecialchars(substr($featured['excerpt'], 0, 180)) ?>…
        </p>
        <?php endif; ?>
        <div style="display:flex;align-items:center;gap:12px;">
          <a href="/blog/<?= htmlspecialchars($featured['slug']) ?>" class="btn btn-gold" style="font-size:.82rem;">Read Article →</a>
          <span style="color:rgba(255,255,255,.5);font-size:.76rem;">
            <?= $featured['published_at'] ? fmt_date($featured['published_at']) : '' ?>
          </span>
        </div>
      </div>
      <div style="background:linear-gradient(145deg,#f8f4ff,#ede9fe);display:flex;align-items:center;justify-content:center;padding:40px;min-height:300px;">
        <div style="text-align:center;">
          <div style="font-size:5rem;margin-bottom:12px;"><?= htmlspecialchars($featured['cover_emoji']) ?></div>
          <span style="font-size:.78rem;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--plum);">Featured</span>
        </div>
      </div>
    </div>
    <?php else: ?>
    <!-- No featured post yet -->
    <div style="text-align:center;padding:32px;background:var(--white);border-radius:var(--radius-lg);border:1px dashed var(--light-grey);max-width:600px;margin:0 auto;">
      <p style="color:var(--mid-grey);font-size:.9rem;">No featured article yet. Articles published from the admin panel will appear here.</p>
    </div>
    <?php endif; ?>
  </div>
</section>

<!-- ARTICLE GRID -->
<section class="section">
  <div class="container" style="max-width:1040px;">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:32px;flex-wrap:wrap;gap:12px;">
      <h2 style="font-size:1.2rem;font-weight:700;color:var(--charcoal);">Latest Articles</h2>
      <div style="display:flex;gap:8px;flex-wrap:wrap;" id="cat-filters">
        <?php foreach ($categories as $cat): ?>
        <span class="cat-pill" data-cat="<?= htmlspecialchars($cat) ?>"
          style="padding:6px 14px;border-radius:50px;font-size:.75rem;font-weight:600;
                 background:<?= $cat==='All' ? 'var(--plum)' : 'var(--cream)' ?>;
                 color:<?= $cat==='All' ? '#fff' : 'var(--mid-grey)' ?>;
                 cursor:pointer;border:1px solid <?= $cat==='All' ? 'var(--plum)' : 'var(--light-grey)' ?>;">
          <?= htmlspecialchars($cat) ?>
        </span>
        <?php endforeach; ?>
      </div>
    </div>

    <?php if (empty($articles) && !$featured): ?>
    <div style="text-align:center;padding:64px 24px;color:var(--mid-grey);">
      <div style="font-size:3rem;margin-bottom:12px;">✍️</div>
      <p style="font-size:.95rem;">No articles published yet.<br>Check back soon!</p>
    </div>
    <?php else: ?>
    <div id="article-grid" style="display:grid;grid-template-columns:repeat(3,1fr);gap:24px;">
      <?php foreach ($articles as $a): ?>
      <article class="blog-card" data-cat="<?= htmlspecialchars($a['category']) ?>"
        style="background:var(--white);border-radius:var(--radius-lg);border:1px solid var(--light-grey);overflow:hidden;transition:var(--transition);"
        onmouseenter="this.style.boxShadow='var(--shadow-md)';this.style.transform='translateY(-3px)'"
        onmouseleave="this.style.boxShadow='none';this.style.transform='none'">
        <div style="background:linear-gradient(135deg,<?= htmlspecialchars($a['cover_color']) ?>22,<?= htmlspecialchars($a['cover_color']) ?>44);height:110px;display:flex;align-items:center;justify-content:center;font-size:2.6rem;">
          <?= htmlspecialchars($a['cover_emoji']) ?>
        </div>
        <div style="padding:22px;">
          <div style="display:flex;gap:8px;margin-bottom:10px;align-items:center;">
            <span style="font-size:.68rem;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:<?= htmlspecialchars($a['cover_color']) ?>;background:<?= htmlspecialchars($a['cover_color']) ?>18;padding:3px 8px;border-radius:50px;">
              <?= htmlspecialchars($a['category']) ?>
            </span>
            <span style="font-size:.7rem;color:var(--mid-grey);"><?= htmlspecialchars($a['read_time']) ?></span>
          </div>
          <h3 style="font-size:.95rem;font-weight:700;color:var(--charcoal);line-height:1.35;margin-bottom:8px;">
            <?= htmlspecialchars($a['title']) ?>
          </h3>
          <?php if ($a['excerpt']): ?>
          <p style="font-size:.8rem;color:var(--mid-grey);line-height:1.55;margin-bottom:14px;">
            <?= htmlspecialchars(substr($a['excerpt'], 0, 110)) ?>…
          </p>
          <?php endif; ?>
          <div style="display:flex;align-items:center;justify-content:space-between;">
            <span style="font-size:.72rem;color:var(--mid-grey);">
              <?= $a['published_at'] ? fmt_date($a['published_at']) : '' ?>
            </span>
            <a href="/blog/<?= htmlspecialchars($a['slug']) ?>" style="font-size:.78rem;font-weight:600;color:var(--plum);">Read →</a>
          </div>
        </div>
      </article>
      <?php endforeach; ?>
    </div>
    <?php endif; ?>
  </div>
</section>

<!-- NEWSLETTER CTA -->
<section style="background:var(--cream);padding:64px 0;border-top:1px solid var(--light-grey);">
  <div class="container" style="max-width:560px;text-align:center;">
    <span class="tag tag-plum" style="margin-bottom:16px;display:inline-block;">Newsletter</span>
    <h2 style="font-family:'Cormorant Garamond',serif;font-size:1.8rem;font-weight:600;color:var(--charcoal);margin-bottom:12px;">Salon growth tips, every week.</h2>
    <p style="color:var(--mid-grey);font-size:.9rem;margin-bottom:24px;">Join 18,000+ beauty professionals who get our weekly guide to growing a thriving salon business.</p>
    <div style="display:flex;gap:8px;max-width:420px;margin:0 auto;">
      <input type="email" placeholder="your@email.com" style="flex:1;padding:12px 16px;border:1px solid var(--light-grey);border-radius:var(--radius-sm);font-size:.88rem;outline:none;">
      <button style="background:var(--plum);color:#fff;border:none;padding:12px 20px;border-radius:var(--radius-sm);font-weight:600;font-size:.88rem;cursor:pointer;">Subscribe</button>
    </div>
    <p style="font-size:.72rem;color:var(--mid-grey);margin-top:10px;">No spam, ever. Unsubscribe any time.</p>
  </div>
</section>

<!-- Category filter JS -->
<script>
document.querySelectorAll('.cat-pill').forEach(function(pill) {
  pill.addEventListener('click', function() {
    var cat = this.dataset.cat;
    document.querySelectorAll('.cat-pill').forEach(function(p) {
      p.style.background = 'var(--cream)';
      p.style.color      = 'var(--mid-grey)';
      p.style.borderColor = 'var(--light-grey)';
    });
    this.style.background   = 'var(--plum)';
    this.style.color        = '#fff';
    this.style.borderColor  = 'var(--plum)';
    document.querySelectorAll('.blog-card').forEach(function(card) {
      if (cat === 'All' || card.dataset.cat === cat) {
        card.style.display = '';
      } else {
        card.style.display = 'none';
      }
    });
  });
});
</script>

<?php require 'includes/footer.php'; ?>
