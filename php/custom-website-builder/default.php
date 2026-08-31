<?php
define('BRAND_NAME',    'Certxa');
define('PAGE_TITLE',    'Salon Website Builder | Certxa');
define('PAGE_DESC',     'Salon website builder for a branded, bookable website with templates, custom content, and Certxa online booking. Create a professional home for your nail salon or beauty business without starting from code.');
define('PAGE_KEYWORDS', 'salon website builder, beauty salon website, hair salon website builder, bookable salon website, salon website design, nail salon website, create salon website, salon website templates, beauty website builder');
define('PAGE_CANONICAL', 'https://certxa.com/custom-website-builder');
define('PAGE_BREADCRUMBS', json_encode([
  ['name'=>'Home','url'=>'https://certxa.com/'],
  ['name'=>'Website Builder','url'=>'https://certxa.com/custom-website-builder'],
]));
define('PAGE_SCHEMA', json_encode([
  [
    '@type'       => 'WebPage',
    '@id'         => 'https://certxa.com/custom-website-builder',
    'name'        => 'Salon Website Builder — Certxa',
    'description' => 'Build a professional, bookable salon website in minutes with Certxa website builder. Designer templates, custom branding, and integrated online booking.',
    'url'         => 'https://certxa.com/custom-website-builder',
    'isPartOf'    => ['@id'=>'https://certxa.com/#website'],
    'about'       => ['@id'=>'https://certxa.com/#software'],
  ],
  [
    '@type'           => 'WebApplication',
    'name'            => 'Certxa Salon Website Builder',
    'applicationCategory' => 'WebApplication',
    'description'     => 'Drag-and-drop salon website builder with designer templates, custom branding, and integrated online booking.',
    'offers' => [
      '@type'         => 'Offer',
      'price'         => '0',
      'priceCurrency' => 'USD',
      'description'   => 'Included with all Certxa plans.',
    ],
  ],
]));
require 'includes/header.php';
require 'includes/nav.php';
?>

<!-- HERO -->
<section class="hero hero-website" style="padding:110px 0 90px;">
  <div class="container">
    <div class="hero-inner">
      <div class="hero-copy animate-fade-up">
        <div class="hero-badge"><span class="tag tag-plum">Custom Website Builder</span></div>
        <h1 class="hero-headline">A website as stunning<br>as your <em>best work.</em></h1>
        <p class="hero-subtext">Build a gorgeous, fully-bookable website in under an afternoon — no web designers, no monthly agency fees, no technical knowledge required. Just your brand, your services, and your personality.</p>
        <div class="hero-actions">
          <a href="/auth?mode=register" class="btn btn-primary">Build Your Site Free</a>
          <a href="/online-booking" class="btn btn-secondary">Explore Online Booking</a>
        </div>
        <p class="hero-note">No coding &middot; Booking built-in &middot; Live in minutes</p>
      </div>
      <div class="hero-visual animate-fade-up animate-delay-2" style="position:relative;">
        <div style="background:var(--white);border-radius:var(--radius-lg);box-shadow:var(--shadow-lg);overflow:hidden;border:1px solid var(--light-grey);">
          <!-- Fake browser chrome -->
          <div style="background:#F3F4F6;padding:12px 16px;display:flex;align-items:center;gap:10px;border-bottom:1px solid var(--light-grey);">
            <div class="mockup-dot red"></div>
            <div class="mockup-dot yellow"></div>
            <div class="mockup-dot green"></div>
            <div class="mockup-bar" style="flex:1;font-size:.72rem;">luna-nail-studio.certxa.com</div>
          </div>
          <!-- Fake website preview -->
          <div style="background:linear-gradient(180deg,#1C1917 0%,#292524 100%);">
            <div style="padding:28px 24px;text-align:center;color:#fff;">
              <div style="font-size:.7rem;letter-spacing:.25em;text-transform:uppercase;color:var(--gold-bright);margin-bottom:8px;">Nail Art &amp; Beauty Specialists</div>
              <div style="font-family:'Cormorant Garamond',serif;font-size:2.2rem;font-weight:600;line-height:1.1;margin-bottom:12px;">Luna Nail Studio</div>
              <div style="font-size:.8rem;color:rgba(255,255,255,.6);margin-bottom:16px;line-height:1.6;">Award-winning nail art &amp; gel services in the heart of downtown.</div>
              <div style="display:flex;gap:10px;justify-content:center;">
                <div style="background:var(--gold-bright);color:#fff;padding:9px 20px;border-radius:50px;font-size:.78rem;font-weight:700;cursor:pointer;">Book Now</div>
                <div style="border:1.5px solid rgba(255,255,255,.4);color:#fff;padding:9px 20px;border-radius:50px;font-size:.78rem;cursor:pointer;">Our Work</div>
              </div>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:3px;padding:0 16px 16px;">
              <?php
              $colours = ['#6B4F37','#8C7351','#A08060','#B89B7A','#7A5C3A','#5C4030'];
              foreach ($colours as $c):
              ?>
              <div style="aspect-ratio:1;background:<?= $c ?>;border-radius:4px;"></div>
              <?php endforeach; ?>
            </div>
          </div>
          <div style="padding:16px 20px;background:#fff;">
            <div style="font-size:.72rem;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--mid-grey);margin-bottom:10px;">Featured Services</div>
            <div style="display:flex;gap:8px;overflow:hidden;">
              <?php
              $services = ['Gel Manicure','Acrylic Sets','Nail Art','Pedicures'];
              foreach ($services as $s):
              ?>
              <div style="background:var(--cream);border-radius:6px;padding:6px 12px;font-size:.72rem;font-weight:600;white-space:nowrap;color:var(--charcoal);"><?= $s ?></div>
              <?php endforeach; ?>
            </div>
          </div>
        </div>
        <div class="hero-badge-float top-right" style="top:-12px;right:-20px;">
          <div class="badge-icon">🎨</div>
          <div class="badge-text"><strong>15+ Templates</strong><span>Fully customisable</span></div>
        </div>
        <div class="hero-badge-float bottom-left" style="bottom:-12px;left:-20px;">
          <div class="badge-icon">⚡</div>
          <div class="badge-text"><strong>Live in minutes</strong><span>No tech skills needed</span></div>
        </div>
      </div>
    </div>
  </div>
</section>

<!-- STATS -->
<section class="stats-strip">
  <div class="container">
    <div class="stats-grid">
      <div class="stat-item"><div class="stat-value"><span>15</span>+</div><div class="stat-label">Designer templates</div></div>
      <div class="stat-item"><div class="stat-value"><span>30</span>min</div><div class="stat-label">Average build time</div></div>
      <div class="stat-item"><div class="stat-value"><span>$0</span></div><div class="stat-label">Monthly hosting cost</div></div>
      <div class="stat-item"><div class="stat-value"><span>100</span>%</div><div class="stat-label">Mobile optimised</div></div>
    </div>
  </div>
</section>

<!-- FEATURES -->
<section class="section">
  <div class="container">
    <div class="section-header">
      <span class="tag tag-plum">Everything Included</span>
      <h2 class="section-title">A website built for bookings, not just looks</h2>
      <p class="section-subtitle">Most website builders just give you a pretty page. Certxa gives you a website that actually converts visitors into booked clients — with booking built in from day one.</p>
    </div>

    <div class="feature-block">
      <div class="feature-content">
        <span class="tag tag-plum">Designer Templates</span>
        <h3 class="feature-title">Start with a template. Make it entirely yours.</h3>
        <p class="feature-text">Choose from 15+ professionally designed templates created specifically for beauty and wellness businesses. Then customise every colour, font, photo, and word to match your brand — without ever touching a line of code.</p>
        <ul class="feature-list">
          <li>15+ salon-specific designer templates</li>
          <li>Drag-and-drop page builder — no coding</li>
          <li>Upload your own logo, photos, and brand colours</li>
          <li>Custom fonts — choose from hundreds of pairings</li>
          <li>Mobile-perfect on every device, automatically</li>
        </ul>
        <a href="/auth?mode=register" class="btn btn-primary">Start Building Free</a>
      </div>
      <div class="feature-visual" style="background:linear-gradient(145deg,var(--plum-light),#DDD6FE);">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;width:100%;max-width:320px;">
          <?php
          $templates = [
            ['#1C1917','#fff','Midnight','Dark &amp; Luxe'],
            ['#F5F0EB','#4A1D96','Bloom','Soft &amp; Elegant'],
            ['#065F46','#fff','Emerald','Bold &amp; Fresh'],
            ['#FEF3C7','#78350F','Honey','Warm &amp; Inviting'],
          ];
          foreach ($templates as $i => $t):
          ?>
          <div style="background:<?= $t[0] ?>;border-radius:10px;padding:16px;cursor:pointer;border:2px solid <?= $i === 0 ? 'var(--gold-bright)' : 'transparent' ?>;transition:all .2s;">
            <div style="font-family:'Cormorant Garamond',serif;font-size:1.1rem;color:<?= $t[1] ?>;font-weight:600;margin-bottom:4px;"><?= $t[2] ?></div>
            <div style="font-size:.7rem;color:<?= $t[1] ?>;opacity:.7;"><?= $t[3] ?></div>
            <?php if ($i === 0): ?>
            <div style="font-size:.65rem;color:var(--gold-bright);margin-top:8px;font-weight:700;">✓ Popular choice</div>
            <?php endif; ?>
          </div>
          <?php endforeach; ?>
        </div>
      </div>
    </div>

    <div class="feature-block reverse">
      <div class="feature-content">
        <span class="tag tag-gold">Booking Integration</span>
        <h3 class="feature-title">Booking built in — not bolted on</h3>
        <p class="feature-text">Every Certxa website comes with your full booking system already embedded. Clients can browse your services and book an appointment without ever leaving your site — and every booking flows straight into your Certxa calendar.</p>
        <ul class="feature-list">
          <li>Full booking system on every page of your site</li>
          <li>Real-time availability always up to date</li>
          <li>Online deposits and prepayments supported</li>
          <li>Service menu with photos, descriptions, and pricing</li>
          <li>Staff profiles and individual booking pages</li>
        </ul>
        <a href="/auth?mode=register" class="btn btn-primary">Try the Website Builder Free</a>
      </div>
      <div class="feature-visual">
        <div class="ui-card" style="width:100%;max-width:320px;">
          <div style="font-size:.72rem;font-weight:700;color:var(--mid-grey);text-transform:uppercase;letter-spacing:.08em;margin-bottom:12px;">Service Menu — Live on Your Site</div>
          <?php
          $svcs = [
            ['Gel Manicure', '60 min', '$55', '💅'],
            ['Acrylic Full Set', '90 min', '$75', '✨'],
            ['Nail Art Design', '30 min', 'From $20', '🎨'],
          ];
          foreach ($svcs as $s):
          ?>
          <div style="display:flex;align-items:center;gap:12px;padding:12px 0;border-bottom:1px solid var(--light-grey);">
            <div style="width:36px;height:36px;background:var(--plum-light);border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:1rem;flex-shrink:0;"><?= $s[3] ?></div>
            <div style="flex:1;">
              <div style="font-weight:600;font-size:.88rem;"><?= $s[0] ?></div>
              <div style="font-size:.75rem;color:var(--mid-grey);"><?= $s[1] ?></div>
            </div>
            <div style="text-align:right;">
              <div style="font-weight:700;font-size:.88rem;"><?= $s[2] ?></div>
              <div style="background:var(--plum);color:#fff;font-size:.7rem;padding:3px 8px;border-radius:50px;margin-top:4px;cursor:pointer;font-weight:600;">Book</div>
            </div>
          </div>
          <?php endforeach; ?>
        </div>
      </div>
    </div>

    <div class="feature-block">
      <div class="feature-content">
        <span class="tag tag-plum">Your Own Domain</span>
        <h3 class="feature-title">A professional address that's entirely yours</h3>
        <p class="feature-text">Get a free yourname.certxa.com subdomain instantly, or connect your own custom domain like www.ariahair.co.uk. Either way, your site is hosted by Certxa at no extra cost — with SSL, fast load times, and 99.9% uptime guaranteed.</p>
        <ul class="feature-list">
          <li>Free subdomain included on all plans</li>
          <li>Connect your own custom domain — we guide you</li>
          <li>Free SSL certificate for secure HTTPS browsing</li>
          <li>99.9% uptime guarantee — always online</li>
          <li>Blazing-fast load times on all devices</li>
        </ul>
        <a href="/auth?mode=register" class="btn btn-primary">Get Your Free Site</a>
      </div>
      <div class="feature-visual" style="background:linear-gradient(145deg,var(--cream),var(--cream-dark));">
        <div style="text-align:center;width:100%;max-width:300px;">
          <div style="background:#fff;border-radius:10px;padding:14px 18px;box-shadow:var(--shadow-md);margin-bottom:12px;display:flex;align-items:center;gap:10px;">
            <span style="color:#059669;font-size:1rem;">🔒</span>
            <div style="flex:1;font-size:.85rem;font-weight:600;color:var(--charcoal);">www.ariahair.co.uk</div>
            <span class="ui-badge confirmed">Live</span>
          </div>
          <div style="background:#fff;border-radius:10px;padding:14px 18px;box-shadow:var(--shadow-sm);margin-bottom:12px;display:flex;align-items:center;gap:10px;opacity:.6;">
            <span style="color:#059669;font-size:1rem;">🔒</span>
            <div style="flex:1;font-size:.85rem;color:var(--charcoal);">luna-nail.certxa.com</div>
            <span class="ui-badge confirmed">Free</span>
          </div>
          <div style="font-size:.8rem;color:var(--mid-grey);margin-bottom:16px;">Both your free subdomain and custom domain work simultaneously</div>
          <?php
          $perks = ['✓ Free SSL included', '✓ Managed hosting', '✓ 99.9% uptime', '✓ Fast CDN delivery'];
          foreach ($perks as $p):
          ?>
          <div style="font-size:.82rem;color:#059669;font-weight:600;margin-bottom:6px;"><?= $p ?></div>
          <?php endforeach; ?>
        </div>
      </div>
    </div>
  </div>
</section>

<!-- SEO & MARKETING -->
<section class="section section-alt">
  <div class="container">
    <div class="section-header">
      <span class="tag tag-plum">Built to Be Found</span>
      <h2 class="section-title">Your website ranks. Your clients find you.</h2>
      <p class="section-subtitle">Certxa websites are built with search engines in mind from the very first line of code — so new clients in your area can find you on Google without you spending a penny on ads.</p>
    </div>
    <div class="cards-grid">
      <div class="card">
        <div class="card-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35" stroke-linecap="round"/></svg></div>
        <h3 class="card-title">SEO Optimised</h3>
        <p class="card-text">Every page is built with proper meta tags, structured data, and semantic HTML — giving search engines everything they need to understand and index your business.</p>
      </div>
      <div class="card">
        <div class="card-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 18h.01M8 21h8a2 2 0 002-2v-2a5 5 0 00-10 0v2a2 2 0 002 2zM12 3a4 4 0 110 8 4 4 0 010-8z" stroke-linecap="round" stroke-linejoin="round"/></svg></div>
        <h3 class="card-title">Local Discovery</h3>
        <p class="card-text">Your location and services are structured to appear in "near me" searches — capturing clients searching for exactly what you offer right in your area.</p>
      </div>
      <div class="card">
        <div class="card-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M13 10V3L4 14h7v7l9-11h-7z" stroke-linecap="round" stroke-linejoin="round"/></svg></div>
        <h3 class="card-title">Lightning Fast</h3>
        <p class="card-text">Use a fast, mobile-friendly site as the starting point for local discovery. Certxa connects your site to your booking workflow so visitors can move from discovery to appointment.</p>
      </div>
    </div>
  </div>
</section>

<!-- FAQ -->
<section class="section">
  <div class="container" style="max-width:720px;">
    <div class="section-header">
      <span class="tag tag-plum">Questions</span>
      <h2 class="section-title">What people ask before building</h2>
    </div>
    <div class="accordion">
      <div class="accordion-item">
        <h3 class="accordion-heading"><button class="accordion-btn">Do I need any design or coding experience? <span class="accordion-icon">+</span></button></h3>
        <div class="accordion-body">None whatsoever. The Certxa website builder is drag-and-drop and completely visual. You choose a template, swap in your photos, write your words, pick your colours, and your site is done. If you can use Instagram, you can build a Certxa website.</div>
      </div>
      <div class="accordion-item">
        <h3 class="accordion-heading"><button class="accordion-btn">Can I use my own domain name? <span class="accordion-icon">+</span></button></h3>
        <div class="accordion-body">Yes — you can connect any domain you already own (from GoDaddy, Namecheap, or any other registrar) to your Certxa site. We provide step-by-step instructions and our support team will help you get set up if needed. Alternatively, use your free yourname.certxa.com subdomain and upgrade later.</div>
      </div>
      <div class="accordion-item">
        <h3 class="accordion-heading"><button class="accordion-btn">Is booking automatically included on the site? <span class="accordion-icon">+</span></button></h3>
        <div class="accordion-body">Yes — this is one of Certxa's biggest advantages. Your entire booking system is embedded into your website automatically. Clients can browse services and book in real time without leaving your site, and every booking goes directly into your Certxa calendar. No third-party widgets or extra setup required.</div>
      </div>
      <div class="accordion-item">
        <h3 class="accordion-heading"><button class="accordion-btn">Can I show my portfolio and photo gallery? <span class="accordion-icon">+</span></button></h3>
        <div class="accordion-body">Absolutely. Every Certxa website includes a gallery section where you can showcase your best work. You can also connect your Instagram feed to automatically display your latest posts, keeping your site fresh with zero effort.</div>
      </div>
      <div class="accordion-item">
        <h3 class="accordion-heading"><button class="accordion-btn">Is there an extra cost for the website? <span class="accordion-icon">+</span></button></h3>
        <div class="accordion-body">The website builder is included in all Certxa plans at no extra cost — including hosting, SSL, and your free subdomain. If you want to connect a custom domain, you'll just pay your registrar's standard annual domain fee (typically $10–15/year). No hidden costs from us.</div>
      </div>
    </div>
  </div>
</section>

<!-- CTA -->
<section class="cta-section">
  <div class="container" style="position:relative;z-index:1;">
    <span class="tag" style="background:rgba(255,255,255,.15);color:#fff;margin-bottom:16px;display:inline-block;">Build Your Site Today</span>
    <h2 class="cta-title">Your website is waiting.<br><em>Build it in minutes.</em></h2>
    <p class="cta-text">Build a stunning, fully-bookable nail studio website with Certxa — no designers, no developers, no stress.</p>
    <div class="cta-actions">
      <a href="/auth?mode=register" class="btn btn-gold">Start Building — It's Free</a>
      <a href="/nail-salon-software" class="btn btn-outline-white">Explore Nail Salon Software</a>
    </div>
    <p class="cta-note">Credit card required · No charge until trial ends &middot; Website included on all plans &middot; Live in minutes</p>
  </div>
</section>

<?php require 'includes/footer.php'; ?>
