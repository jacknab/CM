<?php
define('BRAND_NAME',    'Certxa');
define('PAGE_TITLE',    'Salon Google Booking Link | Certxa');
define('PAGE_DESC',     'Sync your Certxa booking link to your Google Business Profile so clients can book directly from Google Search and Maps. No partnership required — just a direct link to your Certxa booking page.');
define('PAGE_KEYWORDS', 'google business profile salon booking, google listing booking link, salon google maps booking link, book via google listing, certxa google integration, salon google business profile');
define('PAGE_CANONICAL', 'https://certxa.com/google-business-profile');
define('PAGE_BREADCRUMBS', json_encode([
  ['name'=>'Home','url'=>'https://certxa.com/'],
  ['name'=>'Google Business Profile','url'=>'https://certxa.com/google-business-profile'],
]));
define('PAGE_SCHEMA', json_encode([
  [
    '@type'       => 'WebPage',
    '@id'         => 'https://certxa.com/google-business-profile',
    'name'        => 'Google Business Profile Booking Link — Certxa',
    'description' => 'Sync your Certxa booking link to your Google Business Profile so clients can book directly from your Google listing.',
    'url'         => 'https://certxa.com/google-business-profile',
    'isPartOf'    => ['@id'=>'https://certxa.com/#website'],
    'about'       => ['@id'=>'https://certxa.com/#software'],
  ],
]));
require 'includes/header.php';
require 'includes/nav.php';
?>

<!-- HERO -->
<section class="hero hero-google" style="padding:110px 0 90px;">
  <div class="container">
    <div class="hero-inner">
      <div class="hero-copy animate-fade-up">
        <div class="hero-badge"><span class="tag" style="background:#DBEAFE;color:#1E3A8A;">Google Business Profile</span></div>
        <h1 class="hero-headline" style="color:#1E3A8A;">Get booked directly<br><em style="color:#2563EB;">from your Google listing.</em></h1>
        <p class="hero-subtext">Certxa syncs your booking link to your Google Business Profile. When clients find your salon on Google Search or Maps, they see a direct link to book with you — no middlemen, no extra partnerships.</p>
        <div class="hero-actions">
          <a href="/auth?mode=register" class="btn btn-primary">Start Free Trial</a>
          <a href="/salonos" class="btn btn-secondary">See All Features</a>
        </div>
        <p class="hero-note">Included on Professional &amp; Elite plans &middot; Setup in minutes</p>
      </div>
      <div class="hero-visual animate-fade-up animate-delay-2">
        <div class="hero-mockup" style="background:#fff;">
          <div class="hero-mockup-header">
            <div class="mockup-dot red"></div>
            <div class="mockup-dot yellow"></div>
            <div class="mockup-dot green"></div>
            <div class="mockup-bar" style="font-size:.75rem;">google.com — "nail salon near me"</div>
          </div>
          <!-- Google listing mockup -->
          <div style="background:#fff;border-radius:8px;border:1px solid #E5E7EB;padding:16px;font-family:Arial,sans-serif;">
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;">
              <div style="width:36px;height:36px;border-radius:8px;background:#F3F4F6;display:flex;align-items:center;justify-content:center;font-size:1.2rem;">✂️</div>
              <div>
                <div style="font-size:.9rem;font-weight:700;color:#1a0dab;">Luna Nail Studio</div>
                <div style="font-size:.75rem;color:#006621;">Open now &middot; Closes 7pm</div>
              </div>
              <div style="margin-left:auto;font-size:.78rem;font-weight:600;color:#F59E0B;">★★★★★ 4.9 (127)</div>
            </div>
            <div style="font-size:.8rem;color:#4B5563;margin-bottom:14px;line-height:1.5;">Award-winning nail studio in the heart of Shoreditch. Specialists in gel manicures, nail art, and spa pedicures.</div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px;">
              <a href="#" style="background:#1a73e8;color:#fff;border-radius:6px;padding:9px;text-align:center;font-size:.8rem;font-weight:700;cursor:pointer;text-decoration:none;display:block;">📅 Book an appointment</a>
              <div style="background:#F3F4F6;color:#1a0dab;border-radius:6px;padding:9px;text-align:center;font-size:.8rem;font-weight:600;cursor:pointer;">📞 Call now</div>
            </div>
            <div style="font-size:.72rem;color:#9CA3AF;text-align:center;">Booking link managed by <span style="color:#5b21b6;font-weight:600;">Certxa</span></div>
          </div>
        </div>
        <div class="hero-badge-float top-right" style="top:-12px;right:-20px;">
          <div class="badge-icon">🔍</div>
          <div class="badge-text"><strong>Found on Google</strong><span>Booked via your listing</span></div>
        </div>
      </div>
    </div>
  </div>
</section>

<!-- STATS -->
<section class="stats-strip">
  <div class="container">
    <div class="stats-grid">
      <div class="stat-item"><div class="stat-value"><span>28</span>%</div><div class="stat-label">More bookings from new clients</div></div>
      <div class="stat-item"><div class="stat-value"><span>5B</span></div><div class="stat-label">Google searches every day</div></div>
      <div class="stat-item"><div class="stat-value"><span>1</span></div><div class="stat-label">Click from listing to booking</div></div>
      <div class="stat-item"><div class="stat-value"><span>5</span>min</div><div class="stat-label">To sync your booking link</div></div>
    </div>
  </div>
</section>

<!-- HOW IT WORKS -->
<section class="section">
  <div class="container">
    <div class="section-header">
      <span class="tag tag-plum">How It Works</span>
      <h2 class="section-title">Your Google listing. Your booking page.</h2>
      <p class="section-subtitle">Certxa connects your Google Business Profile to your Certxa booking page — so every client who finds you on Google can book directly, instantly.</p>
    </div>

    <div class="feature-block">
      <div class="feature-content">
        <span class="tag tag-plum">Google Business Profile Sync</span>
        <h3 class="feature-title">Your booking link, right on your Google listing</h3>
        <p class="feature-text">When you connect your Google Business Profile to Certxa, we inject your Certxa booking URL into your listing. Clients who find you on Google Search or Maps see a direct "Book an appointment" link that takes them straight to your Certxa booking page.</p>
        <ul class="feature-list">
          <li>Booking link on your Google Search listing</li>
          <li>Booking link on your Google Maps profile</li>
          <li>Clients land on your real-time Certxa availability</li>
          <li>Instant confirmation sent to client and you</li>
          <li>Every booking synced to your Certxa calendar</li>
        </ul>
        <a href="/auth?mode=register" class="btn btn-primary">Connect Google Now</a>
      </div>
      <div class="feature-visual" style="background:linear-gradient(145deg,#EFF6FF,#DBEAFE);">
        <div style="width:100%;max-width:300px;">
          <div style="background:#fff;border-radius:12px;padding:16px;box-shadow:var(--shadow-md);margin-bottom:12px;">
            <div style="font-size:.72rem;font-weight:700;color:var(--mid-grey);margin-bottom:10px;text-transform:uppercase;letter-spacing:.08em;">Client selects a time</div>
            <div style="font-size:.85rem;font-weight:600;margin-bottom:10px;">Cut &amp; Blow Dry · 60 min</div>
            <?php
            $times = ['10:00', '11:00', '14:00', '15:30', '16:00'];
            echo '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;">';
            foreach ($times as $i => $t) {
              $active = $i === 2;
              echo '<div style="background:'.($active ? '#1a73e8' : '#F3F4F6').';color:'.($active ? '#fff' : '#374151').';padding:8px;border-radius:6px;text-align:center;font-size:.8rem;font-weight:'.($active ? '700' : '500').';cursor:pointer;">'.$t.'</div>';
            }
            echo '</div>';
            ?>
          </div>
          <div style="background:#1a73e8;color:#fff;text-align:center;padding:12px;border-radius:8px;font-weight:700;font-size:.88rem;cursor:pointer;">
            Confirm Booking
          </div>
          <div style="text-align:center;font-size:.72rem;color:#9CA3AF;margin-top:8px;">Powered by Certxa &middot; Instant confirmation</div>
        </div>
      </div>
    </div>

    <div class="feature-block reverse">
      <div class="feature-content">
        <span class="tag tag-gold">Always Accurate</span>
        <h3 class="feature-title">Real availability, every time</h3>
        <p class="feature-text">Because the booking link goes directly to Certxa, clients always see your real, live availability. No double bookings, no stale slots, no manual syncing required. Whatever changes in your Certxa calendar is instantly what clients see.</p>
        <ul class="feature-list">
          <li>Live Certxa availability on every click</li>
          <li>Blocked times and breaks respected automatically</li>
          <li>Multi-staff support — clients choose a stylist</li>
          <li>No manual updates needed — ever</li>
        </ul>
        <a href="/auth?mode=register" class="btn btn-primary">Start Free Trial</a>
      </div>
      <div class="feature-visual">
        <div style="text-align:center;width:100%;max-width:300px;">
          <div style="display:flex;align-items:center;justify-content:center;gap:16px;margin-bottom:24px;">
            <div style="background:#fff;border-radius:12px;padding:14px;box-shadow:var(--shadow-md);font-size:.85rem;font-weight:700;">Certxa<br><span style="color:var(--plum);">Booking</span></div>
            <div style="display:flex;flex-direction:column;gap:6px;align-items:center;">
              <div style="background:#1a73e8;color:#fff;padding:4px 10px;border-radius:20px;font-size:.7rem;font-weight:600;">→ Link synced</div>
            </div>
            <div style="background:#fff;border-radius:12px;padding:14px;box-shadow:var(--shadow-md);font-size:.85rem;font-weight:700;"><span style="color:#1a73e8;font-size:1.2rem;">G</span><br>Google</div>
          </div>
          <div class="integration-pill" style="margin:0 auto 10px;justify-content:center;"><span class="dot"></span>Booking link active</div>
          <div style="font-size:.8rem;color:var(--mid-grey);">Your Certxa booking page</div>
        </div>
      </div>
    </div>
  </div>
</section>

<!-- STEPS -->
<section class="section section-alt">
  <div class="container">
    <div class="section-header">
      <span class="tag tag-plum">Quick Setup</span>
      <h2 class="section-title">Live on Google in three steps</h2>
    </div>
    <div class="steps-grid">
      <div class="step">
        <div class="step-number">1</div>
        <h4 class="step-title">Connect your Google Business Profile</h4>
        <p class="step-text">Link your existing Google Business Profile to Certxa in one click from your dashboard. If you don't have one, Google makes it free and quick to set up.</p>
      </div>
      <div class="step">
        <div class="step-number">2</div>
        <h4 class="step-title">Certxa syncs your booking link</h4>
        <p class="step-text">We automatically update your Google listing with a direct link to your Certxa booking page. No copy-pasting, no manual entry — it just appears.</p>
      </div>
      <div class="step">
        <div class="step-number">3</div>
        <h4 class="step-title">Clients find you and book instantly</h4>
        <p class="step-text">From now on, anyone who finds your salon on Google can click straight through to your live booking page and confirm an appointment in seconds.</p>
      </div>
    </div>
  </div>
</section>

<!-- CTA -->
<section class="cta-section">
  <div class="container" style="position:relative;z-index:1;">
    <span class="tag" style="background:rgba(255,255,255,.15);color:#fff;margin-bottom:16px;display:inline-block;">Capture Every Opportunity</span>
    <h2 class="cta-title">Your next client is<br><em>already searching.</em></h2>
    <p class="cta-text">Make it effortless for new clients to find and book you directly from Google — your real booking page, working for your salon 24 hours a day.</p>
    <div class="cta-actions">
      <a href="/auth?mode=register" class="btn btn-gold">Start Free Trial</a>
      <a href="/salonos" class="btn btn-outline-white">Explore All Features</a>
    </div>
    <p class="cta-note">Included on Professional &amp; Elite plans &middot; No setup fees</p>
  </div>
</section>

<?php require 'includes/footer.php'; ?>
