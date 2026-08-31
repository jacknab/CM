<?php
define('BRAND_NAME',    'Certxa');
define('PAGE_TITLE',    'Certxa vs Vagaro — Nail Salon Software Comparison | Certxa');
define('PAGE_DESC',     'Compare Certxa and Vagaro for nail salons: per-staff pricing, add-on fees, check-in kiosk, and AI receptionist — side by side, with real 2026 numbers.');
define('PAGE_KEYWORDS', 'certxa vs vagaro, vagaro alternative, vagaro vs certxa, nail salon software comparison, vagaro pricing, vagaro review');
define('PAGE_CANONICAL','https://certxa.com/certxa-vs-vagaro');
define('PAGE_BREADCRUMBS', json_encode([
  ['name'=>'Home','url'=>'https://certxa.com/'],
  ['name'=>'Certxa vs Vagaro','url'=>'https://certxa.com/certxa-vs-vagaro'],
]));
define('PAGE_SCHEMA', json_encode([
  [
    '@type'       => 'WebPage',
    '@id'         => 'https://certxa.com/certxa-vs-vagaro',
    'name'        => 'Certxa vs Vagaro',
    'description' => 'Side-by-side comparison of Certxa and Vagaro nail salon software: pricing, fees, and features.',
    'url'         => 'https://certxa.com/certxa-vs-vagaro',
    'isPartOf'    => ['@id'=>'https://certxa.com/#website'],
    'about'       => ['@id'=>'https://certxa.com/#software'],
  ],
  [
    '@type'      => 'FAQPage',
    'mainEntity' => [
      ['@type'=>'Question','name'=>'Does Vagaro charge per staff member?','acceptedAnswer'=>['@type'=>'Answer','text'=>'Yes. Vagaro\'s advertised $24–$30/month starting price covers one bookable calendar — each additional staff member\'s calendar adds to the bill. Certxa\'s Professional plan is a flat $22/month ($18/month billed annually) with unlimited staff and calendars included.']],
      ['@type'=>'Question','name'=>'What does a multi-staff salon actually pay on Vagaro?','acceptedAnswer'=>['@type'=>'Answer','text'=>'Based on Vagaro\'s published add-on pricing (payments, text marketing, branded app, payroll), a salon with several staff adding a website and text marketing commonly lands well above $100/month before card processing fees, according to independent pricing breakdowns. Certxa\'s comparable Professional plan is $22/month flat.']],
      ['@type'=>'Question','name'=>'Does Vagaro have an AI receptionist?','acceptedAnswer'=>['@type'=>'Answer','text'=>'Not natively. Vagaro covers booking, POS, and marketing, but AI phone answering requires a third-party integration. Certxa\'s Autumn AI receptionist is built in and available today as a usage-based add-on.']],
      ['@type'=>'Question','name'=>'Can I migrate from Vagaro to Certxa?','acceptedAnswer'=>['@type'=>'Answer','text'=>'Yes. Certxa offers free data migration from Vagaro — your client list, appointment history, and service menu are imported for you, typically in under an hour.']],
    ],
  ],
]));
require 'includes/header.php';
require 'includes/nav.php';
?>

<style>
.vs-hero { background: linear-gradient(160deg,#1a0033 0%,#2d0057 50%,#1a0033 100%); padding: 100px 0 70px; text-align: center; color: #fff; position: relative; overflow: hidden; }
.vs-hero-badge { display: inline-flex; align-items: center; gap: 10px; background: rgba(255,255,255,.08); border: 1px solid rgba(255,255,255,.16); border-radius: 60px; padding: 8px 20px; font-size: .82rem; color: rgba(255,255,255,.8); margin-bottom: 24px; }
.vs-hero h1 { font-family: 'Cormorant Garamond', serif; font-size: clamp(2.4rem,5.5vw,4.2rem); font-weight: 700; letter-spacing: -.03em; line-height: 1.08; margin-bottom: 18px; }
.vs-hero h1 em { font-style: normal; background: linear-gradient(135deg,#F59E0B,#FBBF24); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; }
.vs-hero p { color: rgba(255,255,255,.65); font-size: 1.08rem; max-width: 560px; margin: 0 auto 32px; line-height: 1.7; }
.vs-hero-stats { display: flex; justify-content: center; gap: 48px; margin-top: 40px; flex-wrap: wrap; }
.vs-hero-stat { text-align: center; }
.vs-hero-stat .num { font-family: 'Cormorant Garamond', serif; font-size: 2.2rem; font-weight: 700; color: #FBBF24; line-height: 1; }
.vs-hero-stat .lbl { font-size: .78rem; color: rgba(255,255,255,.55); margin-top: 6px; }

.compare-section { padding: 80px 0; background: var(--cream); }
.compare-table-wrap { overflow-x: auto; border-radius: var(--radius-md); box-shadow: var(--shadow-md); }
.compare-table { width: 100%; border-collapse: collapse; background: var(--white); border-radius: var(--radius-md); overflow: hidden; }
.compare-table thead th { padding: 20px 24px; text-align: center; background: var(--white); border-bottom: 2px solid var(--light-grey); }
.compare-table thead th:first-child { text-align: left; }
.compare-table thead .plan-header { font-size: 1.05rem; font-weight: 700; color: var(--charcoal); }
.compare-table thead .plan-header.featured-col { color: var(--plum); }
.compare-table thead .plan-header-price { font-size: .82rem; color: var(--mid-grey); font-weight: 500; margin-top: 2px; }
.compare-table .section-row td { background: var(--cream); padding: 12px 24px; font-size: .72rem; font-weight: 700; letter-spacing: .1em; text-transform: uppercase; color: var(--mid-grey); border-top: 1px solid var(--light-grey); }
.compare-table tbody td { padding: 14px 24px; text-align: center; font-size: .88rem; border-bottom: 1px solid var(--light-grey); color: var(--charcoal); }
.compare-table tbody td:first-child { text-align: left; font-weight: 500; }
.compare-table tbody tr:last-child td { border-bottom: none; }
.compare-table .featured-col { background: rgba(91,33,182,.04); }
.ct-check { color: #059669; font-size: 1.1rem; font-weight: 700; }
.ct-cross { color: #D1D5DB; font-size: 1.1rem; }
.ct-text  { font-size: .82rem; font-weight: 600; color: var(--plum-mid); }

.contact-banner { background: linear-gradient(135deg,#6366f1 0%,#8b5cf6 100%); border-radius: 20px; padding: 48px 40px; text-align: center; margin-top: 24px; color: #fff; }
.contact-banner h2 { color: #fff; margin: 0 0 12px; font-size: 1.8rem; font-family: 'Cormorant Garamond', serif; font-weight: 700; letter-spacing: -.02em; }
.contact-banner p { color: rgba(255,255,255,.8); margin: 0 0 24px; font-size: 1rem; }
.contact-banner a { display: inline-block; background: #fff; color: #6366f1; font-weight: 700; font-size: .95rem; padding: 14px 32px; border-radius: 9999px; text-decoration: none; }
.source-note { font-size: .78rem; color: var(--mid-grey); text-align: center; margin-top: 24px; max-width: 640px; margin-left: auto; margin-right: auto; line-height: 1.6; }
</style>

<section class="vs-hero">
  <div class="container">
    <span class="vs-hero-badge">💅 Nail Salon Software Comparison</span>
    <h1>Certxa <em>vs</em> Vagaro</h1>
    <p>Vagaro's advertised price covers one calendar. Here's what a real multi-staff nail salon actually pays on each platform — with real numbers, not marketing claims.</p>
    <div class="hero-dark-actions">
      <a href="/auth?mode=register" class="btn btn-gold btn-lg">Start <?= TRIAL_DAYS ?>-Day Free Trial</a>
      <a href="/pricing" class="btn-outline-white btn-lg">See Certxa Pricing</a>
    </div>
    <div class="vs-hero-stats">
      <div class="vs-hero-stat"><div class="num">$22</div><div class="lbl">Certxa, unlimited staff/mo</div></div>
      <div class="vs-hero-stat"><div class="num">$100+</div><div class="lbl">Typical Vagaro cost, multi-staff/mo</div></div>
      <div class="vs-hero-stat"><div class="num"><?= TRIAL_DAYS ?>d</div><div class="lbl">Certxa free trial</div></div>
    </div>
  </div>
</section>

<section class="compare-section">
  <div class="container">
    <div class="section-header">
      <span class="tag tag-plum">Pricing & Fees</span>
      <h2 class="section-title">What each plan actually costs</h2>
      <p class="section-subtitle">Vagaro's core pricing model charges per bookable calendar (per staff member), with add-ons billed separately. Figures as of August 2026 — verify current pricing directly with each provider before switching.</p>
    </div>
    <div class="compare-table-wrap">
      <table class="compare-table">
        <thead>
          <tr>
            <th style="width:34%;"></th>
            <th><div class="plan-header featured-col">Certxa</div><div class="plan-header-price" style="color:var(--plum-mid);">$9 – $49/mo ⭐</div></th>
            <th><div class="plan-header">Vagaro</div><div class="plan-header-price">From $24–$30/mo + add-ons</div></th>
          </tr>
        </thead>
        <tbody>
          <tr class="section-row"><td colspan="3">Pricing Model</td></tr>
          <tr><td>Base price (1 staff)</td><td class="featured-col ct-text">Solo — $9/mo ($7 annual)</td><td class="ct-text">$24–$30/mo (1 bookable calendar)</td></tr>
          <tr><td>Pricing structure</td><td class="featured-col ct-text">Flat monthly plans</td><td class="ct-text">Per-calendar (per staff member)</td></tr>
          <tr><td>Unlimited staff / calendars</td><td class="featured-col ct-check">✓ on Professional ($22/mo)</td><td class="ct-cross">– (each calendar adds to the bill)</td></tr>
          <tr><td>4-staff salon w/ website + text marketing</td><td class="featured-col ct-text">$22/mo flat</td><td class="ct-text">~$110/mo reported, before processing fees</td></tr>

          <tr class="section-row"><td colspan="3">Fees</td></tr>
          <tr><td>Setup fee</td><td class="featured-col ct-text">None</td><td class="ct-text">None advertised</td></tr>
          <tr><td>Card processing</td><td class="featured-col ct-text">2.7% + $0.05 + $0.60/txn in-person, 2.9% + $0.30 + $0.60/txn online</td><td class="ct-text">2.2%+ (add-on), 2.2%–3.5% reported real-world</td></tr>
          <tr><td>Text/SMS marketing</td><td class="featured-col ct-text">Included (200/mo+) or usage-based add-on</td><td class="ct-text">$20/mo add-on</td></tr>
          <tr><td>Branded mobile app</td><td class="featured-col ct-text">Not offered</td><td class="ct-text">$100/mo add-on</td></tr>
          <tr><td>Payroll</td><td class="featured-col ct-text">Included</td><td class="ct-text">$34 + $5/employee add-on</td></tr>
          <tr><td>Free trial</td><td class="featured-col ct-text"><?= TRIAL_DAYS ?> days</td><td class="ct-text">30 days, no card required</td></tr>

          <tr class="section-row"><td colspan="3">Features</td></tr>
          <tr><td>Self-service check-in kiosk</td><td class="featured-col ct-check">✓</td><td class="ct-cross">–</td></tr>
          <tr><td>AI phone receptionist</td><td class="featured-col ct-text">Available now (Autumn, usage-based)</td><td class="ct-text">Third-party integration only</td></tr>
          <tr><td>Built-in POS</td><td class="featured-col ct-check">✓</td><td class="ct-check">✓</td></tr>
          <tr><td>Online booking</td><td class="featured-col ct-check">✓</td><td class="ct-check">✓</td></tr>
          <tr><td>Client management / CRM</td><td class="featured-col ct-check">✓</td><td class="ct-check">✓</td></tr>
          <tr><td>Branded website builder</td><td class="featured-col ct-check">✓ Included</td><td class="ct-text">Add-on</td></tr>
        </tbody>
      </table>
    </div>
    <p class="source-note">Vagaro figures are based on Vagaro's publicly published pricing and independent third-party pricing breakdowns as of August 2026. Real-world costs vary by salon size and add-ons selected on both platforms — always confirm current terms directly with the provider before making a switch.</p>
  </div>
</section>

<section class="section">
  <div class="container" style="max-width:960px;">
    <div class="section-header">
      <span class="tag tag-gold">Why Salons Switch</span>
      <h2 class="section-title">Where Certxa is different</h2>
    </div>
    <div class="bento" style="grid-template-columns:repeat(3,1fr);">
      <div class="bento-card">
        <h3 class="bento-title">One flat price, not per-seat</h3>
        <p class="bento-text">Certxa's Professional plan is $22/mo flat with unlimited staff and calendars. On Vagaro, every additional staff member's calendar adds to your bill — a real cost difference for any salon with more than one or two technicians.</p>
      </div>
      <div class="bento-card">
        <h3 class="bento-title">No add-on maze</h3>
        <p class="bento-text">Text marketing, a branded app, and payroll are core parts of Certxa's plans. On Vagaro, each is a separate line-item add-on — $20/mo, $100/mo, and $34+$5/employee respectively.</p>
      </div>
      <div class="bento-card">
        <h3 class="bento-title">AI receptionist built in</h3>
        <p class="bento-text">Autumn, Certxa's AI receptionist, is available today as a native usage-based add-on. Vagaro has no native AI phone answering — it requires a separate third-party integration.</p>
      </div>
    </div>
  </div>
</section>

<section class="section section-alt">
  <div class="container" style="max-width:820px;">
    <div class="section-header">
      <span class="tag tag-plum">FAQ</span>
      <h2 class="section-title">Certxa vs Vagaro — common questions</h2>
    </div>
    <div class="accordion">
      <div class="accordion-item">
        <h3 class="accordion-heading"><button class="accordion-btn">Does Vagaro charge per staff member? <span class="accordion-icon">+</span></button></h3>
        <div class="accordion-body">Yes. Vagaro's advertised $24–$30/month starting price covers one bookable calendar — each additional staff member's calendar adds to the bill. Certxa's Professional plan is a flat $22/month ($18/month billed annually) with unlimited staff and calendars included.</div>
      </div>
      <div class="accordion-item">
        <h3 class="accordion-heading"><button class="accordion-btn">What does a multi-staff salon actually pay on Vagaro? <span class="accordion-icon">+</span></button></h3>
        <div class="accordion-body">Based on Vagaro's published add-on pricing (payments, text marketing, branded app, payroll), a salon with several staff adding a website and text marketing commonly lands well above $100/month before card processing fees, according to independent pricing breakdowns. Certxa's comparable Professional plan is $22/month flat.</div>
      </div>
      <div class="accordion-item">
        <h3 class="accordion-heading"><button class="accordion-btn">Does Vagaro have an AI receptionist? <span class="accordion-icon">+</span></button></h3>
        <div class="accordion-body">Not natively. Vagaro covers booking, POS, and marketing, but AI phone answering requires a third-party integration. Certxa's Autumn AI receptionist is built in and available today as a usage-based add-on.</div>
      </div>
      <div class="accordion-item">
        <h3 class="accordion-heading"><button class="accordion-btn">Can I migrate from Vagaro to Certxa? <span class="accordion-icon">+</span></button></h3>
        <div class="accordion-body">Yes. Certxa offers free data migration from Vagaro — your client list, appointment history, and service menu are imported for you, typically in under an hour.</div>
      </div>
    </div>

    <div class="contact-banner">
      <h2>See the real cost difference</h2>
      <p>Start your <?= TRIAL_DAYS ?>-day free trial — no credit card charge until it ends.</p>
      <a href="/auth?mode=register">Start Free Trial</a>
    </div>
  </div>
</section>

<?php require 'includes/footer.php'; ?>
