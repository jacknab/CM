<?php
define('BRAND_NAME',    'Certxa');
define('PAGE_TITLE',    'Salon Software Data Migration | Certxa');
define('PAGE_DESC',     'Switching salon software is easier than you think. Certxa imports your client lists, appointments, services, and inventory from any platform — free, fast, and stress-free.');
define('PAGE_KEYWORDS', 'salon software migration, switch salon software, import salon data, migrate from Vagaro, migrate from GlossGenius, migrate from Mindbody, migrate from Square Appointments, salon data transfer, switch to Certxa');
define('PAGE_CANONICAL', 'https://certxa.com/data-transfer');
define('PAGE_BREADCRUMBS', json_encode([
  ['name'=>'Home','url'=>'https://certxa.com/'],
  ['name'=>'Free Data Transfer','url'=>'https://certxa.com/data-transfer'],
]));
require 'includes/header.php';
require 'includes/nav.php';
?>

<style>
/* ── Page-specific overrides ───────────────────────────────────────────── */
.dt-hero {
  background: #f0f4f8;
  padding: 100px 0 80px;
  text-align: center;
}
.dt-hero-badge {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 9999px;
  padding: 6px 16px;
  font-size: .78rem;
  font-weight: 600;
  color: var(--plum);
  margin-bottom: 28px;
  letter-spacing: .04em;
  text-transform: uppercase;
}
.dt-hero-badge .dot { width:8px;height:8px;border-radius:50%;background:var(--plum);display:inline-block; }
.dt-hero h1 {
  font-size: clamp(2.4rem, 5.5vw, 3.8rem);
  font-weight: 800;
  letter-spacing: -.04em;
  color: #0f172a;
  line-height: 1.12;
  margin: 0 auto 24px;
  max-width: 700px;
}
.dt-hero p {
  font-size: clamp(1rem, 2vw, 1.15rem);
  color: #475569;
  line-height: 1.7;
  max-width: 540px;
  margin: 0 auto 40px;
}
.dt-hero-actions {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 16px;
  flex-wrap: wrap;
  margin-bottom: 28px;
}
.dt-hero-note {
  font-size: .82rem;
  color: #94a3b8;
}
.dt-hero-note span { margin: 0 8px; }

/* ── Platforms strip ────────────────────────────────────────────────────── */
.platforms-strip {
  background: #fff;
  border-top: 1px solid #e2e8f0;
  border-bottom: 1px solid #e2e8f0;
  padding: 40px 0;
}
.platforms-label {
  text-align: center;
  font-size: .75rem;
  font-weight: 700;
  letter-spacing: .1em;
  text-transform: uppercase;
  color: #94a3b8;
  margin-bottom: 28px;
}
.platforms-grid {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 12px;
}
.platform-pill {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  background: #f8fafc;
  border: 1.5px solid #e2e8f0;
  border-radius: 9999px;
  padding: 10px 20px;
  font-size: .88rem;
  font-weight: 600;
  color: #334155;
  transition: border-color .18s, box-shadow .18s;
  cursor: default;
}
.platform-pill:hover {
  border-color: var(--plum);
  box-shadow: 0 0 0 3px rgba(59,7,100,.07);
}
.platform-pill .pi {
  width: 28px;
  height: 28px;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: .85rem;
  font-weight: 800;
  color: #fff;
  flex-shrink: 0;
}

/* ── Steps ─────────────────────────────────────────────────────────────── */
.steps-section {
  background: #fff;
  padding: 90px 0;
}
.steps-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 40px 32px;
  margin-top: 56px;
  position: relative;
}
.steps-grid::before {
  content: '';
  position: absolute;
  top: 36px;
  left: calc(16.66% + 36px);
  right: calc(16.66% + 36px);
  height: 2px;
  background: linear-gradient(90deg, var(--plum) 0%, #6366f1 100%);
  opacity: .2;
}
.step-card {
  text-align: center;
}
.step-num {
  width: 72px;
  height: 72px;
  border-radius: 50%;
  background: linear-gradient(135deg, var(--plum), #6366f1);
  color: #fff;
  font-size: 1.4rem;
  font-weight: 800;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 auto 20px;
  flex-shrink: 0;
  position: relative;
  z-index: 1;
}
.step-title {
  font-size: 1.05rem;
  font-weight: 700;
  color: #0f172a;
  margin-bottom: 10px;
}
.step-text {
  font-size: .88rem;
  color: #64748b;
  line-height: 1.65;
}

/* ── What gets imported ─────────────────────────────────────────────────── */
.imports-section {
  background: #f8fafc;
  padding: 90px 0;
}
.imports-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 20px;
  margin-top: 48px;
}
.import-card {
  background: #fff;
  border: 1.5px solid #e2e8f0;
  border-radius: 14px;
  padding: 28px;
  display: flex;
  gap: 18px;
  align-items: flex-start;
  transition: border-color .18s, box-shadow .18s;
}
.import-card:hover {
  border-color: var(--plum);
  box-shadow: 0 4px 20px rgba(59,7,100,.08);
}
.import-icon {
  width: 48px;
  height: 48px;
  border-radius: 12px;
  background: var(--plum-light, #ede9fe);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.4rem;
  flex-shrink: 0;
}
.import-card h4 {
  font-size: .95rem;
  font-weight: 700;
  color: #0f172a;
  margin-bottom: 6px;
}
.import-card p {
  font-size: .83rem;
  color: #64748b;
  line-height: 1.55;
  margin: 0;
}
.import-check {
  font-size: .8rem;
  color: #059669;
  font-weight: 600;
  margin-top: 10px;
  display: flex;
  align-items: center;
  gap: 5px;
}

/* ── Timeline UI mock ──────────────────────────────────────────────────── */
.transfer-visual {
  background: #fff;
  border: 1.5px solid #e2e8f0;
  border-radius: 16px;
  padding: 24px;
  max-width: 360px;
  box-shadow: 0 8px 32px rgba(0,0,0,.06);
}
.transfer-header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 20px;
  padding-bottom: 16px;
  border-bottom: 1px solid #f1f5f9;
}
.transfer-logo {
  width: 36px;
  height: 36px;
  border-radius: 8px;
  background: var(--plum);
  color: #fff;
  font-size: .75rem;
  font-weight: 800;
  display: flex;
  align-items: center;
  justify-content: center;
}
.transfer-from {
  font-size: .78rem;
  color: #94a3b8;
}
.transfer-platform {
  font-size: .88rem;
  font-weight: 700;
  color: #0f172a;
}
.transfer-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 0;
  border-bottom: 1px solid #f8fafc;
}
.transfer-row-label {
  font-size: .82rem;
  color: #475569;
}
.transfer-row-count {
  font-size: .82rem;
  font-weight: 700;
  color: var(--plum);
}
.transfer-progress {
  margin-top: 16px;
  background: #f1f5f9;
  border-radius: 6px;
  height: 6px;
  overflow: hidden;
}
.transfer-progress-fill {
  height: 100%;
  border-radius: 6px;
  background: linear-gradient(90deg, var(--plum), #6366f1);
  animation: fillbar 2.4s ease-in-out infinite alternate;
}
@keyframes fillbar {
  from { width: 25%; }
  to   { width: 94%; }
}
.transfer-status {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 14px;
  font-size: .78rem;
  color: #059669;
  font-weight: 600;
}
.transfer-status::before {
  content: '';
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #059669;
  animation: pulse 1.4s ease-in-out infinite;
}
@keyframes pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50%       { opacity: .5; transform: scale(1.3); }
}

/* ── FAQ ────────────────────────────────────────────────────────────────── */
.faq-section {
  background: #fff;
  padding: 80px 0;
}
.faq-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px 48px;
  margin-top: 48px;
}
.faq-item {
  border-bottom: 1px solid #e2e8f0;
  padding-bottom: 20px;
}
.faq-q {
  font-size: .95rem;
  font-weight: 700;
  color: #0f172a;
  margin-bottom: 8px;
}
.faq-a {
  font-size: .87rem;
  color: #64748b;
  line-height: 1.65;
}

/* ── Responsive ─────────────────────────────────────────────────────────── */
@media (max-width: 768px) {
  .steps-grid          { grid-template-columns: 1fr; gap: 32px; }
  .steps-grid::before  { display: none; }
  .imports-grid        { grid-template-columns: 1fr; }
  .faq-grid            { grid-template-columns: 1fr; }
}
@media (max-width: 500px) {
  .platform-pill { font-size: .8rem; padding: 8px 14px; }
}
</style>

<!-- HERO -->
<section class="dt-hero">
  <div class="container">
    <div class="dt-hero-badge"><span class="dot"></span> Free Data Transfer</div>
    <h1>Switching to Certxa has<br>never been easier</h1>
    <p>Sign up for our free data transfer service, and we'll import all of your appointments, services, inventory, and client lists for you.</p>
    <div class="dt-hero-actions">
      <a href="/auth" class="btn btn-primary">Get your free data transfer</a>
      <a href="/pricing" class="btn btn-secondary">See Pricing</a>
    </div>
    <p class="dt-hero-note">
      Credit card required · No charge until trial ends
      <span>&middot;</span>
      <?= TRIAL_DAYS ?>-day free trial
      <span>&middot;</span>
      Transfer completed in 24 hours
    </p>
  </div>
</section>

<!-- PLATFORM LOGOS -->
<section class="platforms-strip">
  <div class="container">
    <p class="platforms-label">We import from any platform, including</p>
    <div class="platforms-grid">
      <?php
      $platforms = [
        ['name'=>'Vagaro',           'emoji'=>'V',  'bg'=>'#7B3F9E', 'url'=>'/certxa-vs-vagaro'],
        ['name'=>'GlossGenius',      'emoji'=>'GG', 'bg'=>'#E0477B', 'url'=>'/certxa-vs-glossgenius'],
        ['name'=>'Square Appts',     'emoji'=>'■',  'bg'=>'#00B386'],
        ['name'=>'Mindbody',         'emoji'=>'M',  'bg'=>'#0078D7'],
        ['name'=>'Fresha',           'emoji'=>'F',  'bg'=>'#FF6B35', 'url'=>'/certxa-vs-fresha'],
        ['name'=>'Booksy',           'emoji'=>'B',  'bg'=>'#0A0A0A'],
        ['name'=>'GoCheckIn',        'emoji'=>'GC', 'bg'=>'#1E293B', 'url'=>'/certxa-vs-gocheckin'],
        ['name'=>'Google Contacts',  'emoji'=>'G',  'bg'=>'#4285F4'],
        ['name'=>'CSV / Excel',      'emoji'=>'📋', 'bg'=>'#059669'],
      ];
      foreach ($platforms as $p):
        $tag = isset($p['url']) ? 'a' : 'div';
      ?>
      <<?= $tag ?> class="platform-pill"<?= isset($p['url']) ? ' href="' . htmlspecialchars($p['url']) . '"' : '' ?>>
        <div class="pi" style="background:<?= $p['bg'] ?>;"><?= $p['emoji'] ?></div>
        <?= $p['name'] ?>
      </<?= $tag ?>>
      <?php endforeach; ?>
    </div>
  </div>
</section>

<!-- HOW IT WORKS -->
<section class="steps-section">
  <div class="container">
    <div class="section-header">
      <span class="tag tag-plum">How It Works</span>
      <h2 class="section-title">Up and running in three steps</h2>
      <p class="section-subtitle">Our team handles the heavy lifting. You focus on running your salon.</p>
    </div>
    <div class="steps-grid">
      <?php
      $steps = [
        ['num'=>'1','title'=>'Start your free trial','text'=>'Sign up for Certxa — takes less than 2 minutes. A credit card is required to subscribe, but you won\'t be charged for ' . TRIAL_DAYS . ' days. Cancel before the trial ends and you owe nothing.'],
        ['num'=>'2','title'=>'Share your export file','text'=>'Export your data from your current software (we\'ll show you exactly how), then upload it securely in your Certxa dashboard.'],
        ['num'=>'3','title'=>'We handle the rest','text'=>'Our import engine normalises your data, detects duplicates, and maps everything to the right fields. Your data is ready within 24 hours.'],
      ];
      foreach ($steps as $s):
      ?>
      <div class="step-card">
        <div class="step-num"><?= $s['num'] ?></div>
        <div class="step-title"><?= $s['title'] ?></div>
        <p class="step-text"><?= $s['text'] ?></p>
      </div>
      <?php endforeach; ?>
    </div>
  </div>
</section>

<!-- WHAT GETS IMPORTED -->
<section class="imports-section">
  <div class="container">
    <div class="section-header">
      <span class="tag tag-gold">Everything Moves</span>
      <h2 class="section-title">We bring your entire business with you</h2>
      <p class="section-subtitle">Not just contacts. Your full history, services, and setup — transferred cleanly and completely.</p>
    </div>
    <div class="feature-block" style="margin-top:56px;align-items:center;">
      <div>
        <div class="imports-grid">
          <?php
          $items = [
            ['icon'=>'👥','title'=>'Client Lists','desc'=>'Full client records including contact details, visit history, notes, tags, and marketing preferences.','check'=>'Duplicate detection included'],
            ['icon'=>'📅','title'=>'Appointment History','desc'=>'Past and upcoming appointments with service details, staff assignments, and pricing.','check'=>'Dates normalised automatically'],
            ['icon'=>'✂️','title'=>'Services & Menu','desc'=>'Your complete service menu with names, durations, pricing, and staff assignments.','check'=>'Categories preserved'],
            ['icon'=>'📦','title'=>'Inventory & Products','desc'=>'Your retail product catalogue with stock levels, suppliers, and pricing.','check'=>'Stock counts transferred'],
            ['icon'=>'🏷️','title'=>'Gift Cards & Loyalty','desc'=>'Outstanding gift card balances and loyalty point totals for every client.','check'=>'Balances protected'],
            ['icon'=>'⚙️','title'=>'Business Settings','desc'=>'Opening hours, locations, staff profiles, and service categories.','check'=>'Full configuration transfer'],
          ];
          foreach ($items as $item):
          ?>
          <div class="import-card">
            <div class="import-icon"><?= $item['icon'] ?></div>
            <div>
              <h4><?= $item['title'] ?></h4>
              <p><?= $item['desc'] ?></p>
              <div class="import-check">✓ <?= $item['check'] ?></div>
            </div>
          </div>
          <?php endforeach; ?>
        </div>
      </div>
      <div style="display:flex;justify-content:center;padding:20px 0;">
        <div class="transfer-visual">
          <div class="transfer-header">
            <div class="transfer-logo">C</div>
            <div>
              <div class="transfer-from">Importing from</div>
              <div class="transfer-platform">Vagaro → Certxa</div>
            </div>
          </div>
          <?php
          $rows = [
            ['Clients',       '1,247 records'],
            ['Appointments',  '8,914 entries'],
            ['Services',      '63 items'],
            ['Products',      '142 SKUs'],
            ['Gift Cards',    '38 active'],
          ];
          foreach ($rows as $r):
          ?>
          <div class="transfer-row">
            <span class="transfer-row-label"><?= $r[0] ?></span>
            <span class="transfer-row-count"><?= $r[1] ?></span>
          </div>
          <?php endforeach; ?>
          <div class="transfer-progress"><div class="transfer-progress-fill"></div></div>
          <div class="transfer-status">Import in progress — 76% complete</div>
        </div>
      </div>
    </div>
  </div>
</section>

<!-- STATS -->
<section class="stats-strip">
  <div class="container">
    <div class="stats-grid">
      <div class="stat-item"><div class="stat-value"><span>24</span>h</div><div class="stat-label">Average transfer time</div></div>
      <div class="stat-item"><div class="stat-value"><span>100</span>%</div><div class="stat-label">Free — no hidden fees</div></div>
      <div class="stat-item"><div class="stat-value"><span>0</span></div><div class="stat-label">Data lost in transfers</div></div>
      <div class="stat-item"><div class="stat-value"><span>7</span>+</div><div class="stat-label">Platforms supported</div></div>
    </div>
  </div>
</section>

<!-- FAQ -->
<section class="faq-section">
  <div class="container">
    <div class="section-header">
      <span class="tag tag-plum">FAQ</span>
      <h2 class="section-title">Questions about switching</h2>
    </div>
    <div class="faq-grid">
      <?php
      $faqs = [
        ['q'=>'Is the data transfer really free?',
         'a'=>'Yes, completely. We include free data migration for every new Certxa account. No setup fees, no migration charges &mdash; ever.'],
        ['q'=>'How long does the transfer take?',
         'a'=>'Most transfers complete within 24 hours. Larger accounts with 10,000+ clients may take up to 48 hours. We\'ll email you the moment it\'s done.'],
        ['q'=>'Will my clients lose their booking history?',
         'a'=>'No. We transfer complete appointment history including service details, pricing, staff notes, and timestamps.'],
        ['q'=>'What if my current software doesn\'t have an export feature?',
         'a'=>'We can work with any CSV, Excel, or spreadsheet file. If you\'re stuck, our support team will help you extract the data directly.'],
        ['q'=>'Do you detect duplicates?',
         'a'=>'Yes &mdash; our import engine automatically flags duplicate clients based on phone number, email, name, and date of birth similarity, so you never end up with messy double records.'],
        ['q'=>'What happens to my data if I cancel?',
         'a'=>'You own your data completely. You can export everything in CSV, XLSX, or JSON format at any time, with one click.'],
        ['q'=>'Can I try Certxa before committing to the transfer?',
         'a'=>'Absolutely. Start your ' . TRIAL_DAYS . '-day free trial first, explore the platform, and then request the transfer whenever you\'re ready.'],
        ['q'=>'Is my data safe during transfer?',
         'a'=>'All transfers use end-to-end encryption. Your data is never shared with third parties and is stored securely in compliance with GDPR.'],
      ];
      foreach ($faqs as $f):
      ?>
      <div class="faq-item">
        <div class="faq-q"><?= $f['q'] ?></div>
        <div class="faq-a"><?= $f['a'] ?></div>
      </div>
      <?php endforeach; ?>
    </div>
  </div>
</section>

<!-- CTA -->
<section class="cta-section">
  <div class="container" style="position:relative;z-index:1;">
    <span class="tag" style="background:rgba(255,255,255,.15);color:#fff;margin-bottom:16px;display:inline-block;">Free Transfer</span>
    <h2 class="cta-title">Your data. Your clients.<br><em>Ready in 24 hours.</em></h2>
    <p class="cta-text">Switch to the nail salon platform built to keep every client record safe and searchable from day one.</p>
    <div class="cta-actions">
      <a href="/auth" class="btn btn-gold">Start Free Trial</a>
      <a href="/salonos" class="btn btn-outline-white">Explore All Features</a>
    </div>
    <p class="cta-note">Credit card required · No charge until trial ends &middot; <?= TRIAL_DAYS ?>-day free trial &middot; Cancel anytime</p>
  </div>
</section>

<?php require 'includes/footer.php'; ?>
