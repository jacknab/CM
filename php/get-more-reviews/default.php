<?php
define('BRAND_NAME',    'Certxa');
define('PAGE_TITLE',    'Get More Reviews for Your Salon | Review Monitoring & Engagement | Certxa');
define('PAGE_DESC',     'Certxa monitors every new Google review in real time and responds automatically with sentiment-aware AI — 5-star reviews get a warm reply, low ratings are flagged to you privately and never auto-published. Build your reputation without spending an hour a day on it.');
define('PAGE_KEYWORDS', 'get more salon reviews, salon review monitoring, salon review engagement, automated google review responses, salon reputation management software, ai review response, google business profile automation, nail salon review software');
define('PAGE_CANONICAL','https://certxa.com/get-more-reviews');
define('PAGE_BREADCRUMBS', json_encode([
  ['name'=>'Home','url'=>'https://certxa.com/'],
  ['name'=>'Get More Reviews','url'=>'https://certxa.com/get-more-reviews'],
]));
define('PAGE_SCHEMA', json_encode([
  [
    '@type'       => 'WebPage',
    '@id'         => 'https://certxa.com/get-more-reviews',
    'name'        => 'Get More Reviews for Your Salon — Review Monitoring & Engagement System',
    'description' => 'Certxa monitors new Google reviews in real time and responds automatically with sentiment-aware AI, so your reputation is managed every day without you doing the work.',
    'url'         => 'https://certxa.com/get-more-reviews',
    'isPartOf'    => ['@id'=>'https://certxa.com/#website'],
    'about'       => ['@id'=>'https://certxa.com/#software'],
  ],
  [
    '@type'      => 'FAQPage',
    'mainEntity' => [
      ['@type'=>'Question','name'=>'Does Certxa automatically respond to my Google reviews?','acceptedAnswer'=>['@type'=>'Answer','text'=>'Yes. Certxa\'s review engine reads every new Google review as it comes in and applies sentiment-aware rules: 4 and 5-star reviews get a warm, personalized AI-written reply automatically after a short delay (an hour by default). 3-star reviews get a drafted response held for your approval before it\'s ever posted. 1 and 2-star reviews are never auto-published — you\'re notified privately so you can decide how to respond yourself.']],
      ['@type'=>'Question','name'=>'Will my review responses sound repetitive or robotic?','acceptedAnswer'=>['@type'=>'Answer','text'=>'No. The engine is given your recently published responses before writing a new one, specifically so it varies its wording instead of reusing the same template — each reply reads as a genuine, individual response rather than a copy-pasted script.']],
      ['@type'=>'Question','name'=>'Can a bad review get auto-published without me seeing it?','acceptedAnswer'=>['@type'=>'Answer','text'=>'No — this is a hard rule, not a setting. 1 and 2-star reviews are never automatically published under any configuration. You\'re notified so you can address the situation directly, and nothing goes out publicly without your involvement.']],
      ['@type'=>'Question','name'=>'How is this different from Certxa\'s automated review requests?','acceptedAnswer'=>['@type'=>'Answer','text'=>'Review requests (see Client Reviews) are about getting new reviews after each appointment. Review monitoring and engagement is about what happens once reviews start coming in — reading them in real time and responding to them intelligently, which itself is a signal that helps your Google Business Profile stay active and trusted. Most salons use both together.']],
      ['@type'=>'Question','name'=>'Does responding to reviews only happen during business hours?','acceptedAnswer'=>['@type'=>'Answer','text'=>'Yes — responses are gated to your salon\'s actual business hours, so a review response never goes out at 3am looking automated. It publishes at a natural time, the same way a real response would.']],
    ],
  ],
]));
require 'includes/header.php';
require 'includes/nav.php';
?>

<!-- HERO -->
<section class="hero-dark-section" style="padding:100px 0 80px;">
  <div class="orb orb-1"></div><div class="orb orb-2"></div>
  <div class="container">
    <div class="hero-dark-inner" style="align-items:center;gap:60px;">
      <div class="hero-dark-copy animate-fade-up">
        <div class="hero-stars-row">
          <span class="stars-badge"><span>⭐</span><span>Review Monitoring &amp; Engagement</span></span>
        </div>
        <h1 class="hero-dark-headline">
          Get more reviews.<br>
          <em>Without spending an hour a day on it.</em>
        </h1>
        <p class="hero-dark-sub">
          Certxa watches your Google reviews as they come in and responds automatically — a warm reply to your 5-star reviews, a careful private flag for anything under 3 stars. Your reputation gets managed every single day, whether or not you have time to look at it.
        </p>
        <div class="hero-dark-actions">
          <a href="/auth?mode=register" class="btn btn-gold btn-lg">Start <?= TRIAL_DAYS ?>-Day Free Trial</a>
          <a href="/client-reviews" class="btn-play-wrap"><span class="btn-play-icon">→</span><span>See how review requests work</span></a>
        </div>
        <div style="margin-top:24px;font-size:.82rem;color:rgba(255,255,255,.55);">Real-time Google review sync · Sentiment-aware AI responses · Nothing risky auto-published</div>
      </div>

      <div class="hero-dark-visual animate-fade-up animate-delay-2">
        <div class="ui-card" style="max-width:340px;width:100%;">
          <div style="font-size:.68rem;font-weight:700;color:var(--mid-grey);text-transform:uppercase;letter-spacing:.1em;margin-bottom:14px;">New Review — Just Now</div>
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;">
            <div style="width:32px;height:32px;border-radius:50%;background:linear-gradient(135deg,#fcd34d,#f59e0b);color:#fff;font-size:.72rem;font-weight:700;display:flex;align-items:center;justify-content:center;">RM</div>
            <div>
              <div style="font-weight:600;font-size:.82rem;">Rachel M.</div>
              <div style="color:var(--gold-bright);font-size:.85rem;">★★★★★</div>
            </div>
          </div>
          <div style="font-size:.8rem;color:var(--mid-grey);line-height:1.55;font-style:italic;margin-bottom:14px;">"Absolutely loved my gel set — the detail work was incredible. Already booked my next appointment!"</div>
          <div style="background:var(--plum-light);border-radius:8px;padding:10px 12px;font-size:.75rem;color:var(--plum);display:flex;align-items:center;gap:6px;">
            <span>✨</span> AI reply drafted — publishing in 47 min
          </div>
        </div>
      </div>
    </div>
  </div>
</section>

<!-- HOW IT WORKS -->
<section class="section">
  <div class="container" style="max-width:1000px;">
    <div class="section-header">
      <span class="tag tag-plum">How It Works</span>
      <h2 class="section-title">Every review, read and answered — automatically</h2>
      <p class="section-subtitle">Most salon owners either ignore reviews or spend real time replying to each one by hand. Certxa does it for you, with rules built to protect your reputation, not just automate it.</p>
    </div>
    <div class="bento" style="grid-template-columns:repeat(3,1fr);margin-top:40px;">
      <div class="bento-card">
        <h3 class="bento-title">Monitor</h3>
        <p class="bento-text">New Google reviews sync to Certxa in real time — you see every review the moment it posts, with full history and an audit trail of every response sent.</p>
      </div>
      <div class="bento-card">
        <h3 class="bento-title">Engage</h3>
        <p class="bento-text">4 and 5-star reviews get a warm, individually-written AI reply after a short delay. Every response is checked against your recent replies so it never reads like a copy-pasted script.</p>
      </div>
      <div class="bento-card">
        <h3 class="bento-title">Protect</h3>
        <p class="bento-text">3-star reviews get a drafted reply held for your approval. 1 and 2-star reviews are never auto-published under any setting — you're notified privately so you stay in control.</p>
      </div>
    </div>
  </div>
</section>

<!-- SENTIMENT TABLE -->
<section class="section section-alt">
  <div class="container" style="max-width:900px;">
    <div class="section-header">
      <span class="tag tag-gold">Built-In Safety Rules</span>
      <h2 class="section-title">Sentiment-aware, not a blanket auto-reply</h2>
      <p class="section-subtitle">A one-size-fits-all auto-responder is a liability the moment a real complaint comes in. Certxa's rules are different for every rating tier.</p>
    </div>
    <div class="compare-table-wrap" style="margin-top:32px;">
      <table class="compare-table">
        <thead>
          <tr>
            <th style="width:22%;">Rating</th>
            <th>What Certxa does</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td class="ct-text" style="text-align:left;color:var(--gold-bright);font-weight:700;">★★★★★ / ★★★★</td>
            <td style="text-align:left;">Personalized AI reply, published automatically after a short delay (default: 1 hour) during your business hours.</td>
          </tr>
          <tr>
            <td class="ct-text" style="text-align:left;color:var(--plum-mid);font-weight:700;">★★★</td>
            <td style="text-align:left;">Reply drafted by AI, held for your review — nothing goes out until you approve it.</td>
          </tr>
          <tr>
            <td class="ct-text" style="text-align:left;color:#DC2626;font-weight:700;">★★ / ★</td>
            <td style="text-align:left;">Never auto-published. You're notified privately so you can respond personally.</td>
          </tr>
        </tbody>
      </table>
    </div>
    <style>.compare-table-wrap{overflow-x:auto;border-radius:var(--radius-md);box-shadow:var(--shadow-md);}.compare-table{width:100%;border-collapse:collapse;background:var(--white);}.compare-table thead th{padding:16px 20px;text-align:left;background:var(--cream);border-bottom:2px solid var(--light-grey);font-size:.78rem;text-transform:uppercase;letter-spacing:.06em;color:var(--mid-grey);}.compare-table tbody td{padding:16px 20px;font-size:.88rem;border-bottom:1px solid var(--light-grey);}.compare-table tbody tr:last-child td{border-bottom:none;}</style>
  </div>
</section>

<!-- GBP AUTOMATION -->
<section class="section">
  <div class="container" style="max-width:960px;">
    <div class="feature-block">
      <div class="feature-content">
        <span class="tag tag-plum">Beyond Reviews</span>
        <h3 class="feature-title">Your Google Business Profile, kept active automatically</h3>
        <p class="feature-text">An engaged Google Business Profile — recent posts, current photos, answered reviews — is itself a signal Google and AI search tools use to decide who to show first. Certxa keeps yours active without you remembering to log in and post something.</p>
        <ul class="feature-list">
          <li>Auto-posts when you add a new service, staff member, or gift cards</li>
          <li>Never invents discounts, prices, or services — only posts what's actually true</li>
          <li>Photo engine keeps your profile visually current</li>
          <li>Full history of every post and response, always visible to you</li>
        </ul>
        <a href="/google-business-profile" class="btn btn-primary">Explore Google Business Profile Tools</a>
      </div>
      <div class="feature-visual" style="background:linear-gradient(145deg,#f5f3ff,#ede9fe);">
        <div style="text-align:center;padding:16px;width:100%;max-width:300px;">
          <div style="font-size:.75rem;font-weight:700;color:var(--plum);text-transform:uppercase;letter-spacing:.1em;margin-bottom:16px;">Recent Activity</div>
          <?php foreach ([
            ['📣', 'New post published', '"Now offering: Gel-X Extensions"'],
            ['💬', 'Review response sent', 'Replied to Rachel M. — 5★'],
            ['🎁', 'New post published', '"Gift cards now available"'],
          ] as $a): ?>
          <div style="display:flex;align-items:flex-start;gap:10px;text-align:left;padding:10px 0;border-top:1px solid rgba(59,7,100,.08);">
            <span style="font-size:1.1rem;"><?= $a[0] ?></span>
            <div>
              <div style="font-size:.8rem;font-weight:600;color:var(--charcoal);"><?= $a[1] ?></div>
              <div style="font-size:.75rem;color:var(--mid-grey);"><?= $a[2] ?></div>
            </div>
          </div>
          <?php endforeach; ?>
        </div>
      </div>
    </div>
  </div>
</section>

<!-- FAQ -->
<section class="section section-alt">
  <div class="container" style="max-width:820px;">
    <div class="section-header">
      <span class="tag tag-plum">FAQ</span>
      <h2 class="section-title">Review monitoring &amp; engagement — common questions</h2>
    </div>
    <div class="accordion">
      <div class="accordion-item">
        <h3 class="accordion-heading"><button class="accordion-btn">Does Certxa automatically respond to my Google reviews? <span class="accordion-icon">+</span></button></h3>
        <div class="accordion-body">Yes. Certxa's review engine reads every new Google review as it comes in and applies sentiment-aware rules: 4 and 5-star reviews get a warm, personalized AI-written reply automatically after a short delay (an hour by default). 3-star reviews get a drafted response held for your approval before it's ever posted. 1 and 2-star reviews are never auto-published — you're notified privately so you can decide how to respond yourself.</div>
      </div>
      <div class="accordion-item">
        <h3 class="accordion-heading"><button class="accordion-btn">Will my review responses sound repetitive or robotic? <span class="accordion-icon">+</span></button></h3>
        <div class="accordion-body">No. The engine is given your recently published responses before writing a new one, specifically so it varies its wording instead of reusing the same template — each reply reads as a genuine, individual response rather than a copy-pasted script.</div>
      </div>
      <div class="accordion-item">
        <h3 class="accordion-heading"><button class="accordion-btn">Can a bad review get auto-published without me seeing it? <span class="accordion-icon">+</span></button></h3>
        <div class="accordion-body">No — this is a hard rule, not a setting. 1 and 2-star reviews are never automatically published under any configuration. You're notified so you can address the situation directly, and nothing goes out publicly without your involvement.</div>
      </div>
      <div class="accordion-item">
        <h3 class="accordion-heading"><button class="accordion-btn">How is this different from Certxa's automated review requests? <span class="accordion-icon">+</span></button></h3>
        <div class="accordion-body">Review requests (see <a href="/client-reviews" style="color:var(--plum);font-weight:600;">Client Reviews</a>) are about getting new reviews after each appointment. Review monitoring and engagement is about what happens once reviews start coming in — reading them in real time and responding to them intelligently, which itself is a signal that helps your Google Business Profile stay active and trusted. Most salons use both together.</div>
      </div>
      <div class="accordion-item">
        <h3 class="accordion-heading"><button class="accordion-btn">Does responding to reviews only happen during business hours? <span class="accordion-icon">+</span></button></h3>
        <div class="accordion-body">Yes — responses are gated to your salon's actual business hours, so a review response never goes out at 3am looking automated. It publishes at a natural time, the same way a real response would.</div>
      </div>
    </div>

    <div class="contact-banner" style="background:linear-gradient(135deg,#6366f1 0%,#8b5cf6 100%);border-radius:20px;padding:48px 40px;text-align:center;margin-top:40px;color:#fff;">
      <h2 style="color:#fff;margin:0 0 12px;font-size:1.8rem;font-family:'Cormorant Garamond',serif;font-weight:700;letter-spacing:-.02em;">Let your reputation run itself.</h2>
      <p style="color:rgba(255,255,255,.8);margin:0 0 24px;font-size:1rem;">Start your <?= TRIAL_DAYS ?>-day free trial — no credit card charge until it ends.</p>
      <a href="/auth?mode=register" style="display:inline-block;background:#fff;color:#6366f1;font-weight:700;font-size:.95rem;padding:14px 32px;border-radius:9999px;text-decoration:none;">Start Free Trial</a>
    </div>
  </div>
</section>

<?php require 'includes/footer.php'; ?>
