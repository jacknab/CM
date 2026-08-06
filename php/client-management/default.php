<?php
define('BRAND_NAME',    'Certxa');
define('PAGE_TITLE',    'Salon Client Management Software & CRM | Certxa — Know Every Client');
define('PAGE_DESC',     'Build detailed client profiles, track appointment history, record preferences and formulas, and personalise every visit. Certxa salon CRM software helps you turn first-time visitors into loyal, raving regulars.');
define('PAGE_KEYWORDS', 'nail salon client management software, nail salon CRM, nail salon client database, nail salon client profiles, nail salon CRM software, client management for nail salons, nail salon appointment history, nail salon client tracking, nail salon customer management');
define('PAGE_CANONICAL', 'https://certxa.com/client-management');
define('PAGE_BREADCRUMBS', json_encode([
  ['name'=>'Home','url'=>'https://certxa.com/'],
  ['name'=>'Client Management','url'=>'https://certxa.com/client-management'],
]));
define('PAGE_SCHEMA', json_encode([
  [
    '@type'       => 'WebPage',
    '@id'         => 'https://certxa.com/client-management',
    'name'        => 'Salon Client Management Software & CRM — Certxa',
    'description' => 'Build rich client profiles, track appointment history, and personalise every visit with Certxa salon client management software.',
    'url'         => 'https://certxa.com/client-management',
    'isPartOf'    => ['@id'=>'https://certxa.com/#website'],
    'about'       => ['@id'=>'https://certxa.com/#software'],
  ],
]));
require 'includes/header.php';
require 'includes/nav.php';
?>

<!-- HERO -->
<section class="hero hero-clients" style="padding:110px 0 90px;">
  <div class="container">
    <div class="hero-inner">
      <div class="hero-copy animate-fade-up">
        <div class="hero-badge"><span class="tag" style="background:#FED7AA;color:#7C2D12;">Client Management</span></div>
        <h1 class="hero-headline">Know every client.<br><em style="color:#C2410C;">Personalise every visit.</em></h1>
        <p class="hero-subtext">Build rich client profiles that remember preferences, allergies, colour formulas, and history — so every appointment feels like a VIP experience.</p>
        <div class="hero-actions">
          <a href="#" class="btn btn-primary">Start Free Trial</a>
          <a href="#" class="btn btn-secondary">Explore Features</a>
        </div>
        <p class="hero-note">Credit card required · No charge until trial ends &middot; Unlimited client records</p>
      </div>
      <div class="hero-visual animate-fade-up animate-delay-2">
        <div class="hero-mockup">
          <div class="hero-mockup-header">
            <div class="mockup-dot red"></div>
            <div class="mockup-dot yellow"></div>
            <div class="mockup-dot green"></div>
            <div class="mockup-bar">Client Profile — Emma Clarke</div>
          </div>
          <div class="ui-card-header" style="margin-bottom:16px;">
            <div class="ui-avatar" style="width:48px;height:48px;font-size:1.1rem;background:var(--plum);color:#fff;">EC</div>
            <div>
              <div class="ui-name" style="font-size:1rem;">Emma Clarke</div>
              <div class="ui-meta">Client since Jan 2023 &middot; 24 visits</div>
              <div style="margin-top:4px;">
                <span class="ui-badge confirmed">VIP Client</span>
              </div>
            </div>
          </div>
          <div class="ui-row"><span class="ui-row-label">Preferred technician</span><span class="ui-row-value">Linh Nguyen</span></div>
          <div class="ui-row"><span class="ui-row-label">Last visit</span><span class="ui-row-value">12 May 2025</span></div>
          <div class="ui-row"><span class="ui-row-label">Favourite service</span><span class="ui-row-value plum">Gel Manicure</span></div>
          <div class="ui-row"><span class="ui-row-label">Lifetime spend</span><span class="ui-row-value gold">$2,340</span></div>
          <div class="ui-row"><span class="ui-row-label">Allergy note</span><span class="ui-row-value" style="color:#DC2626;">PPD sensitivity</span></div>
        </div>
      </div>
    </div>
  </div>
</section>

<!-- STATS -->
<section class="stats-strip">
  <div class="container">
    <div class="stats-grid">
      <div class="stat-item"><div class="stat-value"><span>3×</span></div><div class="stat-label">Higher return rate with profiles</div></div>
      <div class="stat-item"><div class="stat-value"><span>$450</span></div><div class="stat-label">Average lifetime value increase</div></div>
      <div class="stat-item"><div class="stat-value"><span>100</span>%</div><div class="stat-label">GDPR compliant data storage</div></div>
      <div class="stat-item"><div class="stat-value"><span>0</span></div><div class="stat-label">Missed client preferences</div></div>
    </div>
  </div>
</section>

<!-- FEATURES -->
<section class="section">
  <div class="container">
    <div class="section-header">
      <span class="tag tag-plum">Client Profiles</span>
      <h2 class="section-title">Your clients deserve to feel remembered</h2>
      <p class="section-subtitle">Every detail about every client, organised and accessible at a glance — before they even walk through the door.</p>
    </div>

    <div class="feature-block">
      <div class="feature-content">
        <span class="tag tag-plum">Rich Profiles</span>
        <h3 class="feature-title">Complete client records at your fingertips</h3>
        <p class="feature-text">Build detailed profiles that include contact information, booking history, service preferences, colour formulas, allergy notes, and any custom fields your business needs. Everything is searchable and instantly accessible.</p>
        <ul class="feature-list">
          <li>Full appointment history with service details and technician</li>
          <li>Nail records: gel brand, colour codes, shape, product notes</li>
          <li>Allergy and sensitivity alerts shown at booking</li>
          <li>Client-uploaded photos for style references</li>
          <li>Tags and segments for targeted outreach</li>
        </ul>
        <a href="#" class="btn btn-primary">Try It Free</a>
      </div>
      <div class="feature-visual" style="background:linear-gradient(145deg,#FFF7ED,#FED7AA);">
        <div class="ui-card" style="width:100%;max-width:320px;">
          <div style="font-weight:700;font-size:.88rem;margin-bottom:12px;color:var(--charcoal);">📋 Service Notes — Emma C.</div>
          <?php
          $notes = [
            ['Gel Brand', 'OPI GelColor — Bubble Bath #L68'],
            ['Nail Shape', 'Oval — medium length'],
            ['Allergy Alert', 'Acetone sensitive — use foil wraps'],
            ['Next Visit Goal', 'Gel fill + nail art accent'],
          ];
          foreach ($notes as $n):
          ?>
          <div style="padding:10px 0;border-bottom:1px solid var(--light-grey);">
            <div style="font-size:.72rem;font-weight:700;color:var(--mid-grey);text-transform:uppercase;letter-spacing:.08em;margin-bottom:3px;"><?= $n[0] ?></div>
            <div style="font-size:.88rem;color:var(--charcoal);"><?= $n[1] ?></div>
          </div>
          <?php endforeach; ?>
          <div style="margin-top:12px;display:flex;gap:8px;">
            <button style="flex:1;background:var(--plum-light);color:var(--plum);border:none;padding:8px;border-radius:6px;font-size:.8rem;font-weight:600;cursor:pointer;">Edit Notes</button>
            <button style="flex:1;background:var(--plum);color:#fff;border:none;padding:8px;border-radius:6px;font-size:.8rem;font-weight:600;cursor:pointer;">Add Note</button>
          </div>
        </div>
      </div>
    </div>

    <div class="feature-block reverse">
      <div class="feature-content">
        <span class="tag tag-gold">Smart Insights</span>
        <h3 class="feature-title">Understand your clients better than ever</h3>
        <p class="feature-text">Certxa automatically analyses your client data to surface actionable insights — who your top spenders are, which clients are at risk of lapsing, and which services are driving the most repeat bookings.</p>
        <ul class="feature-list">
          <li>Client retention and churn risk alerts</li>
          <li>Top spender and VIP client identification</li>
          <li>Average visit frequency per client</li>
          <li>Service popularity and revenue breakdown</li>
        </ul>
        <a href="#" class="btn btn-primary">See the Dashboard</a>
      </div>
      <div class="feature-visual">
        <div class="ui-card" style="width:100%;max-width:320px;">
          <div style="font-weight:700;font-size:.9rem;margin-bottom:16px;">Client Insights</div>
          <?php
          $segments = [
            ['VIP Clients', '23', '$180+ avg spend', 'var(--plum)', '23%'],
            ['Regular Clients', '89', '8+ visits', '#059669', '89%'],
            ['At Risk', '14', 'No visit in 60+ days', '#D97706', '14%'],
            ['New Clients', '31', 'First 3 visits', '#3B82F6', '31%'],
          ];
          foreach ($segments as $s):
          ?>
          <div style="padding:10px 0;border-bottom:1px solid var(--light-grey);">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
              <span style="font-size:.85rem;font-weight:600;"><?= $s[0] ?></span>
              <span style="font-size:.85rem;font-weight:700;color:<?= $s[3] ?>;"><?= $s[1] ?></span>
            </div>
            <div style="font-size:.75rem;color:var(--mid-grey);margin-bottom:6px;"><?= $s[2] ?></div>
            <div class="ui-progress-bar"><div class="ui-progress-fill" style="width:<?= $s[4] ?>;background:<?= $s[3] ?>;"></div></div>
          </div>
          <?php endforeach; ?>
        </div>
      </div>
    </div>

    <div class="feature-block">
      <div class="feature-content">
        <span class="tag tag-plum">GDPR & Privacy</span>
        <h3 class="feature-title">Safe, secure, and fully compliant</h3>
        <p class="feature-text">Certxa is built with privacy-first principles. All client data is encrypted, stored securely in the UK, and fully compliant with GDPR regulations. Your clients' trust is protected, and so is your business.</p>
        <ul class="feature-list">
          <li>End-to-end encryption for all client data</li>
          <li>UK-based servers with ISO 27001 certification</li>
          <li>Automated data retention and deletion policies</li>
          <li>Client data export on request in one click</li>
        </ul>
        <a href="#" class="btn btn-primary">Learn About Security</a>
      </div>
      <div class="feature-visual">
        <div style="text-align:center;">
          <div style="font-size:4rem;margin-bottom:16px;">🔒</div>
          <div style="font-size:1.1rem;font-weight:700;color:var(--plum);margin-bottom:8px;">Bank-Grade Security</div>
          <div style="font-size:.9rem;color:var(--mid-grey);margin-bottom:24px;">All data encrypted at rest and in transit</div>
          <?php
          $badges = ['GDPR Compliant', 'ISO 27001', 'UK Data Centre', 'SOC 2 Type II'];
          foreach ($badges as $b):
          ?>
          <div class="integration-pill" style="margin:0 auto 10px;max-width:200px;justify-content:center;"><span class="dot"></span><?= $b ?></div>
          <?php endforeach; ?>
        </div>
      </div>
    </div>
  </div>
</section>

<!-- TESTIMONIAL -->
<section class="section section-alt">
  <div class="container">
    <div class="section-header">
      <span class="tag tag-gold">Client Stories</span>
      <h2 class="section-title">How professionals use client management</h2>
    </div>
    <div class="testimonials-grid">
      <div class="testimonial">
        <div class="testimonial-stars">★★★★★</div>
        <p class="testimonial-text">"I used to rely on memory and scraps of paper for client notes. Now everything is in Certxa — every formula, every preference. My clients are always impressed that I remember everything."</p>
        <div class="testimonial-author">
          <div class="testimonial-avatar">KL</div>
          <div><div class="testimonial-name">Katie Lambert</div><div class="testimonial-role">Colour Specialist, Edinburgh</div></div>
        </div>
      </div>
      <div class="testimonial">
        <div class="testimonial-stars">★★★★★</div>
        <p class="testimonial-text">"The lapsed client alerts are brilliant. I set up an automatic message to clients I haven't seen in 8 weeks and it brings back 3-4 clients every month without me lifting a finger."</p>
        <div class="testimonial-author">
          <div class="testimonial-avatar">TW</div>
          <div><div class="testimonial-name">Tom Walsh</div><div class="testimonial-role">Nail Studio Owner, Bristol</div></div>
        </div>
      </div>
      <div class="testimonial">
        <div class="testimonial-stars">★★★★★</div>
        <p class="testimonial-text">"The allergy alert system is a lifesaver — literally. I had a client with a PPD sensitivity I'd forgotten about. Certxa flagged it before the appointment. That feature alone makes it worth it."</p>
        <div class="testimonial-author">
          <div class="testimonial-avatar">SP</div>
          <div><div class="testimonial-name">Sienna Patel</div><div class="testimonial-role">Senior Nail Technician, Leeds</div></div>
        </div>
      </div>
    </div>
  </div>
</section>

<!-- CTA -->
<section class="cta-section">
  <div class="container" style="position:relative;z-index:1;">
    <span class="tag" style="background:rgba(255,255,255,.15);color:#fff;margin-bottom:16px;display:inline-block;">Know Your Clients</span>
    <h2 class="cta-title">Build relationships that<br><em>last a lifetime.</em></h2>
    <p class="cta-text">Start building rich client profiles today and turn one-time visitors into loyal regulars who keep coming back.</p>
    <div class="cta-actions">
      <a href="#" class="btn btn-gold">Start Free Trial</a>
      <a href="/salonos" class="btn btn-outline-white">Explore All Features</a>
    </div>
    <p class="cta-note">Credit card required · No charge until trial ends &middot; Unlimited client records included</p>
  </div>
</section>

<?php require 'includes/footer.php'; ?>
