<?php
define('BRAND_NAME',    'Certxa');
define('PAGE_TITLE',    'Salon Review Management Software | Automate 5-Star Google Reviews — Certxa');
define('PAGE_DESC',     'Automatically collect 5-star Google reviews after every appointment. Certxa salon review management software builds your online reputation on autopilot — helping new clients find and choose your salon every day.');
define('PAGE_KEYWORDS', 'salon review management, beauty salon Google reviews, salon reputation management, automated salon reviews, hair salon review software, get more salon reviews, salon star rating, nail salon reviews, salon review automation');
define('PAGE_CANONICAL', 'https://certxa.com/client-reviews');
define('PAGE_BREADCRUMBS', json_encode([
  ['name'=>'Home','url'=>'https://certxa.com/'],
  ['name'=>'Client Reviews','url'=>'https://certxa.com/client-reviews'],
]));
define('PAGE_SCHEMA', json_encode([
  [
    '@type'       => 'WebPage',
    '@id'         => 'https://certxa.com/client-reviews',
    'name'        => 'Salon Review Management Software — Certxa',
    'description' => 'Automate 5-star Google review collection after every salon appointment to build your online reputation and attract new clients.',
    'url'         => 'https://certxa.com/client-reviews',
    'isPartOf'    => ['@id'=>'https://certxa.com/#website'],
    'about'       => ['@id'=>'https://certxa.com/#software'],
  ],
]));
require 'includes/header.php';
require 'includes/nav.php';
?>

<!-- HERO -->
<section class="hero hero-reviews" style="padding:110px 0 90px;">
  <div class="container">
    <div class="hero-inner">
      <div class="hero-copy animate-fade-up">
        <div class="hero-badge"><span class="tag" style="background:#FDE68A;color:#78350F;">Client Reviews</span></div>
        <h1 class="hero-headline" style="color:#78350F;">Your reputation,<br><em style="color:#D97706;">working for you.</em></h1>
        <p class="hero-subtext">Certxa automatically asks every happy client for a review right after their appointment — when their experience is fresh and they're most likely to rave about you. Build five-star credibility on autopilot.</p>
        <div class="hero-actions">
          <a href="#" class="btn btn-primary">Start Collecting Reviews</a>
          <a href="#" class="btn btn-secondary">See How It Works</a>
        </div>
        <p class="hero-note">Automated &middot; Google, Facebook &amp; Trustpilot &middot; No chasing required</p>
      </div>
      <div class="hero-visual animate-fade-up animate-delay-2">
        <div class="hero-mockup">
          <div class="hero-mockup-header">
            <div class="mockup-dot red"></div>
            <div class="mockup-dot yellow"></div>
            <div class="mockup-dot green"></div>
            <div class="mockup-bar">Reviews Dashboard</div>
          </div>
          <div style="text-align:center;padding:8px 0 16px;">
            <div style="font-family:'Cormorant Garamond',serif;font-size:3rem;font-weight:600;color:var(--plum);line-height:1;">4.9</div>
            <div style="color:var(--gold-bright);font-size:1.4rem;margin-bottom:4px;">★★★★★</div>
            <div style="font-size:.78rem;color:var(--mid-grey);">Based on 284 reviews</div>
          </div>
          <?php
          $reviews = [
            ['SJ', 'Sarah J.', '"The gel manicure is perfect — exactly what I wanted. Will definitely be back!"', '★★★★★', '2 hours ago'],
            ['ML', 'Marcus L.', '"Best nail salon I\'ve found. Friendly, professional, and the nail art is outstanding."', '★★★★★', 'Yesterday'],
            ['PK', 'Priya K.', '"Lovely atmosphere and my nail tech really listened to what I wanted."', '★★★★★', '2 days ago'],
          ];
          foreach ($reviews as $r):
          ?>
          <div style="border-top:1px solid var(--light-grey);padding:12px 0;">
            <div style="display:flex;align-items:center;gap:10px;margin-bottom:6px;">
              <div style="width:30px;height:30px;border-radius:50%;background:var(--plum);color:#fff;font-size:.72rem;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0;"><?= $r[0] ?></div>
              <div>
                <div style="font-weight:600;font-size:.82rem;"><?= $r[1] ?></div>
                <div style="font-size:.72rem;color:var(--gold-bright);"><?= $r[3] ?></div>
              </div>
              <div style="margin-left:auto;font-size:.7rem;color:var(--mid-grey);"><?= $r[4] ?></div>
            </div>
            <div style="font-size:.8rem;color:var(--mid-grey);line-height:1.5;font-style:italic;"><?= $r[2] ?></div>
          </div>
          <?php endforeach; ?>
        </div>
      </div>
    </div>
  </div>
</section>

<!-- STATS -->
<section class="stats-strip">
  <div class="container">
    <div class="stats-grid">
      <div class="stat-item"><div class="stat-value"><span>4×</span></div><div class="stat-label">More reviews than asking manually</div></div>
      <div class="stat-item"><div class="stat-value"><span>88</span>%</div><div class="stat-label">Consumers trust online reviews as much as personal recommendations</div></div>
      <div class="stat-item"><div class="stat-value"><span>32</span>%</div><div class="stat-label">More new clients from strong review profiles</div></div>
      <div class="stat-item"><div class="stat-value"><span>1 in 3</span></div><div class="stat-label">New clients cite reviews as their reason for choosing a salon</div></div>
    </div>
  </div>
</section>

<!-- FEATURES -->
<section class="section">
  <div class="container">
    <div class="section-header">
      <span class="tag tag-plum">Review Automation</span>
      <h2 class="section-title">Build your five-star reputation effortlessly</h2>
      <p class="section-subtitle">Stop hoping clients will leave reviews. Certxa asks them at exactly the right moment — after a great appointment when they're genuinely happy.</p>
    </div>

    <div class="feature-block">
      <div class="feature-content">
        <span class="tag tag-plum">Automated Requests</span>
        <h3 class="feature-title">Ask for reviews at the perfect moment</h3>
        <p class="feature-text">Within an hour of a completed appointment, Certxa automatically sends a friendly review request to your client. The message is personalised with their name and the service they received, making it feel genuine — because it is.</p>
        <ul class="feature-list">
          <li>Sent automatically after every completed appointment</li>
          <li>Personalised with client name and service received</li>
          <li>Links directly to Google, Facebook, or Trustpilot</li>
          <li>Smart filter — unhappy clients are handled privately first</li>
          <li>Follow-up if no response (configurable)</li>
        </ul>
        <a href="#" class="btn btn-primary">Start Free Trial</a>
      </div>
      <div class="feature-visual" style="background:linear-gradient(145deg,var(--gold-light),#FDE68A);">
        <div style="width:100%;max-width:300px;">
          <div style="background:#fff;border-radius:16px;padding:20px;box-shadow:var(--shadow-md);">
            <div style="font-size:.72rem;font-weight:700;color:var(--mid-grey);text-transform:uppercase;letter-spacing:.08em;margin-bottom:10px;">Post-Visit Message</div>
            <div style="background:var(--plum);color:#fff;border-radius:12px 12px 12px 0;padding:14px 16px;font-size:.85rem;line-height:1.6;margin-bottom:10px;">
              Hi Emma! Thank you so much for visiting us today — it was a pleasure having you in. We'd love to know how your experience was. Would you mind leaving us a quick review? It means the world to us! 💜
            </div>
            <div style="display:flex;flex-direction:column;gap:8px;">
              <a style="display:flex;align-items:center;gap:10px;background:#F3F4F6;border-radius:8px;padding:10px 14px;font-size:.82rem;font-weight:600;color:#374151;text-decoration:none;cursor:pointer;">
                <span style="font-size:1rem;">🔍</span> Leave a Google Review
              </a>
              <a style="display:flex;align-items:center;gap:10px;background:#F3F4F6;border-radius:8px;padding:10px 14px;font-size:.82rem;font-weight:600;color:#374151;text-decoration:none;cursor:pointer;">
                <span style="font-size:1rem;">📘</span> Leave a Facebook Review
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="feature-block reverse">
      <div class="feature-content">
        <span class="tag tag-gold">Smart Filtering</span>
        <h3 class="feature-title">Protect your reputation from negative reviews</h3>
        <p class="feature-text">Certxa's intelligent review funnel first asks clients to rate their experience privately. If they score highly, they're directed to your public review platforms. If they have concerns, you're notified privately so you can address it before it goes public — protecting your hard-earned reputation.</p>
        <ul class="feature-list">
          <li>Private satisfaction rating collected first</li>
          <li>Happy clients directed to Google/Facebook</li>
          <li>Unhappy clients send private feedback to you</li>
          <li>Resolve issues before they become public</li>
        </ul>
        <a href="#" class="btn btn-primary">See the Full Flow</a>
      </div>
      <div class="feature-visual">
        <div style="text-align:center;width:100%;max-width:300px;">
          <div style="background:#fff;border-radius:12px;padding:20px;box-shadow:var(--shadow-md);margin-bottom:14px;">
            <div style="font-size:.85rem;font-weight:600;margin-bottom:14px;">How was your visit today?</div>
            <div style="display:flex;justify-content:center;gap:12px;font-size:2rem;margin-bottom:14px;">
              <?php foreach (['😞','😐','🙂','😊','🤩'] as $i => $e): ?>
              <span style="cursor:pointer;<?= $i === 4 ? 'transform:scale(1.3);' : 'opacity:.5;' ?>"><?= $e ?></span>
              <?php endforeach; ?>
            </div>
            <div style="font-size:.75rem;color:var(--mid-grey);">Your feedback helps us improve</div>
          </div>
          <div style="display:flex;gap:10px;">
            <div style="flex:1;background:#D1FAE5;border-radius:8px;padding:12px;text-align:center;">
              <div style="font-size:1.4rem;margin-bottom:4px;">⭐</div>
              <div style="font-size:.75rem;font-weight:700;color:#065F46;">Positive</div>
              <div style="font-size:.7rem;color:#065F46;">→ Public review</div>
            </div>
            <div style="flex:1;background:#FEE2E2;border-radius:8px;padding:12px;text-align:center;">
              <div style="font-size:1.4rem;margin-bottom:4px;">🔒</div>
              <div style="font-size:.75rem;font-weight:700;color:#991B1B;">Concern</div>
              <div style="font-size:.7rem;color:#991B1B;">→ Private message to you</div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="feature-block">
      <div class="feature-content">
        <span class="tag tag-plum">Review Showcase</span>
        <h3 class="feature-title">Show off your glowing reputation everywhere</h3>
        <p class="feature-text">Display your best reviews automatically on your Certxa website, your booking page, and social media. Fresh five-star reviews posted automatically — turning your reputation into your most powerful marketing tool.</p>
        <ul class="feature-list">
          <li>Review widget embedded on your website automatically</li>
          <li>Best reviews highlighted on your booking page</li>
          <li>Shareable review graphics for Instagram and Facebook</li>
          <li>Aggregate rating shown on all your public profiles</li>
        </ul>
        <a href="#" class="btn btn-primary">See the Widget</a>
      </div>
      <div class="feature-visual" style="background:linear-gradient(145deg,var(--plum-light),#DDD6FE);">
        <div class="ui-card" style="width:100%;max-width:320px;">
          <div style="text-align:center;padding-bottom:14px;border-bottom:1px solid var(--light-grey);">
            <div style="font-size:2.5rem;font-weight:700;font-family:'Cormorant Garamond',serif;color:var(--plum);">4.9</div>
            <div style="color:var(--gold-bright);font-size:1.2rem;">★★★★★</div>
            <div style="font-size:.75rem;color:var(--mid-grey);margin-top:4px;">284 verified reviews</div>
          </div>
          <div style="display:flex;flex-direction:column;gap:8px;margin-top:14px;">
            <?php
            $stars = [[5,'★★★★★','241 reviews','95%'], [4,'★★★★☆','32 reviews','12%'], [3,'★★★☆☆','8 reviews','3%']];
            foreach ($stars as $s):
            ?>
            <div style="display:flex;align-items:center;gap:10px;">
              <span style="font-size:.78rem;color:var(--mid-grey);width:20px;text-align:right;"><?= $s[0] ?></span>
              <span style="font-size:.8rem;color:var(--gold-bright);"><?= $s[1] ?></span>
              <div style="flex:1;height:6px;background:var(--light-grey);border-radius:3px;">
                <div style="height:100%;background:var(--gold-bright);border-radius:3px;width:<?= $s[3] ?>;"></div>
              </div>
              <span style="font-size:.72rem;color:var(--mid-grey);width:60px;"><?= $s[2] ?></span>
            </div>
            <?php endforeach; ?>
          </div>
          <div style="margin-top:14px;background:var(--plum-light);border-radius:8px;padding:8px 12px;text-align:center;font-size:.78rem;color:var(--plum);font-weight:600;">
            Embed this widget on your website →
          </div>
        </div>
      </div>
    </div>
  </div>
</section>

<!-- CTA -->
<section class="cta-section">
  <div class="container" style="position:relative;z-index:1;">
    <span class="tag" style="background:rgba(255,255,255,.15);color:#fff;margin-bottom:16px;display:inline-block;">Build Social Proof</span>
    <h2 class="cta-title">Let your happy clients<br><em>do the marketing.</em></h2>
    <p class="cta-text">Start collecting five-star reviews automatically from your very next appointment. The best marketing you'll ever do is letting your work speak for itself.</p>
    <div class="cta-actions">
      <a href="#" class="btn btn-gold">Start Free Trial</a>
      <a href="/salonos" class="btn btn-outline-white">Explore All Features</a>
    </div>
    <p class="cta-note">Credit card required · No charge until trial ends &middot; Setup in minutes</p>
  </div>
</section>

<?php require 'includes/footer.php'; ?>
