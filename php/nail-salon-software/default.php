<?php
define('BRAND_NAME',    'Certxa');
define('PAGE_TITLE',    'Nail Salon Software | Online Booking & Management for Nail Studios — Certxa');
define('PAGE_DESC',     'Certxa is the nail salon software built for gel, acrylic, and nail art studios. Online booking, client profiles with service history, automated reminders, integrated payments, and your own branded website. ' . TRIAL_DAYS . '-day free trial.');
define('PAGE_KEYWORDS', 'nail salon software, nail salon booking software, nail studio management software, nail salon scheduling app, online booking for nail salons, nail salon POS, gel nail salon software, acrylic nail salon software, nail technician software');
define('PAGE_CANONICAL','https://certxa.com/nail-salon-software');
define('PAGE_BREADCRUMBS', json_encode([
  ['name'=>'Home','url'=>'https://certxa.com/'],
  ['name'=>'Nail Salon Software','url'=>'https://certxa.com/nail-salon-software'],
]));
define('PAGE_SCHEMA', json_encode([
  [
    '@type'      => 'FAQPage',
    'mainEntity' => [
      ['@type'=>'Question','name'=>'What is the best software for nail salons?','acceptedAnswer'=>['@type'=>'Answer','text'=>'Certxa is purpose-built for nail salons and nail studios. It includes 24/7 online booking, client profiles with detailed nail service history and product notes, automated appointment reminders to reduce no-shows, integrated card payments, a POS system, and a branded website builder — all in one platform. Start with a ' . TRIAL_DAYS . '-day free trial.']],
      ['@type'=>'Question','name'=>'Can clients book specific nail technicians online?','acceptedAnswer'=>['@type'=>'Answer','text'=>'Yes — with Certxa, clients can choose their preferred nail technician when booking online. Each technician has their own calendar, services, and availability. Clients can also request "any available tech" if they\'re flexible.']],
      ['@type'=>'Question','name'=>'Can I track nail formulas and product notes per client?','acceptedAnswer'=>['@type'=>'Answer','text'=>'Yes — Certxa\'s client profiles let you record detailed service notes including gel brand, colour codes, nail shape, enhancements used, and anything else that makes each client\'s experience personal. Available to view before every appointment.']],
    ],
  ],
  [
    '@type'       => 'SoftwareApplication',
    '@id'         => 'https://certxa.com/#nail-software',
    'name'        => 'Certxa Nail Salon Software',
    'applicationCategory' => 'BusinessApplication',
    'operatingSystem' => 'Web, iOS, Android',
    'description' => 'All-in-one nail salon management software with online booking, client profiles, automated reminders, payments, and website builder.',
    'offers'      => ['@type'=>'Offer','price'=>'0','priceCurrency'=>'USD','description'=>TRIAL_DAYS . '-day free trial, then from $9/month'],
  ],
]));
require 'includes/header.php';
require 'includes/nav.php';
?>

<section class="hero-dark-section has-video" style="padding:100px 0 80px;">
  <div class="hero-video-bg">
    <video autoplay muted loop playsinline preload="metadata" poster="">
      <source src="/videos/nail_salon.mp4" type="video/mp4">
    </video>
  </div>
  <div class="hero-video-overlay"></div>
  <div class="orb orb-1"></div><div class="orb orb-2"></div>
  <div class="container">
    <div class="hero-dark-inner">
      <div class="hero-dark-copy animate-fade-up">
        <div class="hero-stars-row">
          <span class="stars-badge"><span>💅</span><span>Built for Nail Salons & Studios</span></span>
        </div>
        <h1 class="hero-dark-headline">
          Nail salon<br>software that<br><em>fills every chair.</em>
        </h1>
        <p class="hero-dark-sub">Online booking, client records with full nail history, automated reminders, and payments — everything a nail studio needs, in one beautifully simple platform.</p>
        <div class="hero-dark-actions">
          <a href="#" class="btn btn-gold btn-lg">Start <?= TRIAL_DAYS ?>-Day Free Trial</a>
          <a href="/pricing" class="btn-play-wrap"><span class="btn-play-icon">→</span><span>See pricing</span></a>
        </div>
        <div style="margin-top:28px;font-size:.82rem;color:rgba(255,255,255,.6);">Credit card required · No charge until trial ends &middot; Setup in under 5 minutes</div>
      </div>
      <div class="hero-dark-visual animate-fade-up animate-delay-2">
        <div class="ui-card" style="max-width:340px;width:100%;">
          <div style="font-size:.72rem;font-weight:700;color:var(--mid-grey);text-transform:uppercase;letter-spacing:.1em;margin-bottom:12px;">Client Profile — Zara Singh</div>
          <?php
          $notes = [
            ['Gel Brand','OPI GelColor'],['Colour','Bubble Bath #L68'],['Shape','Oval — medium'],['Enhancements','None'],['Last Visit','28 Apr 2026'],['Next Appt','26 May 2026'],
          ];
          foreach ($notes as $n): ?>
          <div class="ui-row">
            <span style="font-size:.8rem;color:var(--mid-grey);"><?= $n[0] ?></span>
            <span style="font-size:.8rem;font-weight:600;color:var(--charcoal);"><?= $n[1] ?></span>
          </div>
          <?php endforeach; ?>
          <div style="margin-top:12px;padding:10px 12px;background:var(--plum-light);border-radius:8px;font-size:.78rem;">
            <span style="font-weight:600;color:var(--plum);">⚠️ Note:</span>
            <span style="color:var(--charcoal);margin-left:4px;">Sensitive to acetone — use foil wraps, not soak bowl.</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</section>

<section class="stats-strip">
  <div class="container">
    <div class="stats-grid">
      <div class="stat-item"><div class="stat-value"><span>68</span>%</div><div class="stat-label">Reduction in no-shows</div></div>
      <div class="stat-item"><div class="stat-value"><span>42</span>%</div><div class="stat-label">More bookings in 30 days</div></div>
      <div class="stat-item"><div class="stat-value"><span><?= TRIAL_DAYS ?></span>day</div><div class="stat-label">Free trial — no charge until it ends</div></div>
      <div class="stat-item"><div class="stat-value"><span>5</span>min</div><div class="stat-label">Average setup time</div></div>
    </div>
  </div>
</section>

<section class="section">
  <div class="container" style="max-width:960px;">
    <div class="section-header">
      <span class="tag tag-plum">Built for Nail Techs</span>
      <h2 class="section-title">Everything your nail salon needs to run and grow</h2>
    </div>
    <div class="bento" style="grid-template-columns:repeat(2,1fr);">
      <?php
      $features = [
        ['24/7 Online Booking','Clients book gel sets, acrylics, pedicures, and nail art sessions any time — from your website, Instagram bio, or Google. No phone calls, no back-and-forth.'],
        ['Client Nail History','Every client profile stores gel brands, colour codes, nail shape, enhancements, sensitivity notes, and photos. See everything before they walk through the door.'],
        ['Multi-Tech Scheduling','Let clients book with their favourite nail technician. Each tech has their own calendar, services, and working hours — perfectly organised at a glance.'],
        ['No-Show Deposits','Require a deposit when clients book colour or enhancement services. Block your time from cancellations with one simple setting.'],
        ['Automated Reminders','SMS and email reminders go out automatically — reducing no-shows without you lifting a finger. Clients appreciate the heads-up, you appreciate the filled chair.'],
        ['Integrated Card Payments','Accept card in-salon and online. Certxa POS handles tips, splits, gift card redemptions, and membership discounts — all from one screen.'],
      ];
      foreach ($features as $f): ?>
      <div class="bento-card">
        <h3 class="bento-title"><?= $f[0] ?></h3>
        <p class="bento-text"><?= $f[1] ?></p>
      </div>
      <?php endforeach; ?>
    </div>
  </div>
</section>

<section class="testi-dark-section">
  <div class="container" style="max-width:960px;">
    <div class="section-header" style="text-align:center;margin-bottom:48px;">
      <span class="tag tag-dark">Nail Salon Owners Love Certxa</span>
      <h2 class="section-title" style="color:var(--white);">Real nail studios. Real results.</h2>
    </div>
    <div class="testi-dark-grid">
      <?php
      $testimonials = [
        [
          'quote'  => 'My clients love being able to book their regular gel appointments online at midnight. I wake up to a full schedule.',
          'name'   => 'Ava L.',
          'role'   => 'Gel Nail Studio, New York',
          'stat'   => '+52%',
          'stat_label' => 'more bookings',
          'grad'   => 'linear-gradient(135deg,#fcd34d,#f59e0b)',
        ],
        [
          'quote'  => 'The client notes are everything for me. I know exactly which gel brand each client prefers before they sit down.',
          'name'   => 'Zara M.',
          'role'   => 'Nail Artist, Los Angeles',
          'stat'   => '5★',
          'stat_label' => 'zero complaints',
          'grad'   => 'linear-gradient(135deg,#a78bfa,#7c3aed)',
        ],
        [
          'quote'  => 'Deposits stopped my no-shows overnight. For long nail art sessions, this feature alone pays for my entire subscription.',
          'name'   => 'Grace W.',
          'role'   => 'Nail Studio, Miami',
          'stat'   => '68%',
          'stat_label' => 'fewer no-shows',
          'grad'   => 'linear-gradient(135deg,#fcd34d,#f59e0b)',
        ],
      ];
      foreach ($testimonials as $t): ?>
      <div class="testi-dark-card reveal">
        <div class="tdc-top">
          <div class="tdc-stars">★★★★★</div>
          <div class="tdc-metric-pill">
            <span class="tdc-metric-stat"><?= $t['stat'] ?></span>
            <span class="tdc-metric-label"><?= $t['stat_label'] ?></span>
          </div>
        </div>
        <p class="tdc-quote">"<?= $t['quote'] ?>"</p>
        <div class="tdc-author">
          <div class="tdc-av" style="background:<?= $t['grad'] ?>"><?= substr($t['name'],0,2) ?></div>
          <div class="tdc-info">
            <div class="tdc-name"><?= $t['name'] ?></div>
            <div class="tdc-role"><?= $t['role'] ?></div>
          </div>
        </div>
      </div>
      <?php endforeach; ?>
    </div>
  </div>
</section>

<section class="section">
  <div class="container" style="max-width:720px;">
    <div class="section-header">
      <span class="tag tag-plum">FAQ</span>
      <h2 class="section-title">Nail salon software — common questions</h2>
    </div>
    <div class="accordion">
      <div class="accordion-item">
        <button class="accordion-btn">What is the best software for nail salons? <span class="accordion-icon">+</span></button>
        <div class="accordion-body">Certxa is purpose-built for nail salons and studios. It includes 24/7 online booking, detailed client profiles with nail history and product notes, automated reminders to cut no-shows, integrated payments, a POS system, and a branded website — all in one platform. Start with a <?= TRIAL_DAYS ?>-day free trial.</div>
      </div>
      <div class="accordion-item">
        <button class="accordion-btn">Can clients choose their nail technician when booking? <span class="accordion-icon">+</span></button>
        <div class="accordion-body">Yes — clients can select their preferred technician, or choose "any available" for maximum flexibility. Each technician has their own calendar, service list, and availability — all managed from your Certxa dashboard.</div>
      </div>
      <div class="accordion-item">
        <button class="accordion-btn">Can I store client nail formulas and preferences? <span class="accordion-icon">+</span></button>
        <div class="accordion-body">Yes — Certxa client profiles let you record gel brand, colour codes, nail shape, enhancements, sensitivities, photos, and any custom notes. Everything is there before a client arrives so you can deliver a personalised experience every single time.</div>
      </div>
      <div class="accordion-item">
        <button class="accordion-btn">Can I take deposits for nail appointments? <span class="accordion-icon">+</span></button>
        <div class="accordion-body">Absolutely — Certxa lets you require a deposit (fixed amount or percentage) for any service. This is particularly popular for long nail art and full-set sessions where no-shows are most costly. Deposits are processed automatically at booking and are fully refundable or non-refundable based on your policy.</div>
      </div>
    </div>
  </div>
</section>

<section class="cta-section">
  <div class="container" style="position:relative;z-index:1;">
    <h2 class="cta-title">The nail salon software<br><em>your studio deserves.</em></h2>
    <p class="cta-text">Join thousands of nail technicians and studio owners running their business on Certxa.</p>
    <div class="cta-actions">
      <a href="#" class="btn btn-gold btn-lg">Start <?= TRIAL_DAYS ?>-Day Free Trial</a>
      <a href="/salonos" class="btn btn-outline-white">Explore All Features</a>
    </div>
    <p class="cta-note"><?= TRIAL_DAYS ?>-day free trial &middot; Credit card required · No charge until trial ends &middot; Setup in 5 minutes</p>
  </div>
</section>

<?php require 'includes/footer.php'; ?>
