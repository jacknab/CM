<?php
define('BRAND_NAME',    'Certxa');
define('PAGE_TITLE',    'Certxa vs GlossGenius — Nail Salon Software Comparison | Certxa');
define('PAGE_DESC',     'Compare Certxa and GlossGenius for nail salons: pricing, payment processing fees, check-in kiosk, AI receptionist, and features — side by side, with real 2026 numbers.');
define('PAGE_KEYWORDS', 'certxa vs glossgenius, glossgenius alternative, glossgenius vs certxa, nail salon software comparison, glossgenius pricing, glossgenius review');
define('PAGE_CANONICAL','https://certxa.com/certxa-vs-glossgenius');
define('PAGE_BREADCRUMBS', json_encode([
  ['name'=>'Home','url'=>'https://certxa.com/'],
  ['name'=>'Certxa vs GlossGenius','url'=>'https://certxa.com/certxa-vs-glossgenius'],
]));
define('PAGE_SCHEMA', json_encode([
  [
    '@type'       => 'WebPage',
    '@id'         => 'https://certxa.com/certxa-vs-glossgenius',
    'name'        => 'Certxa vs GlossGenius',
    'description' => 'Side-by-side comparison of Certxa and GlossGenius nail salon software: pricing, fees, and features.',
    'url'         => 'https://certxa.com/certxa-vs-glossgenius',
    'isPartOf'    => ['@id'=>'https://certxa.com/#website'],
    'about'       => ['@id'=>'https://certxa.com/#software'],
  ],
  [
    '@type'      => 'FAQPage',
    'mainEntity' => [
      ['@type'=>'Question','name'=>'Is Certxa cheaper than GlossGenius?','acceptedAnswer'=>['@type'=>'Answer','text'=>'For most nail salons, yes. Certxa\'s plans run $9–$49/month ($7–$39/month billed annually). GlossGenius\'s three plans are $24–$168/month ($28–$168/month billed monthly, $24–$148/month billed annually). GlossGenius\'s Gold plan drops its platform fee to 0% on card processing, but the subscription itself still costs more than any Certxa plan.']],
      ['@type'=>'Question','name'=>'Does GlossGenius have an AI receptionist like Certxa\'s Autumn?','acceptedAnswer'=>['@type'=>'Answer','text'=>'Certxa\'s Autumn AI receptionist is available today as a usage-based add-on. GlossGenius has announced "Reception by GlossGenius," an AI phone-answering feature, but as of this writing it is listed as Coming Soon and is not yet available to salons.']],
      ['@type'=>'Question','name'=>'Can I migrate from GlossGenius to Certxa?','acceptedAnswer'=>['@type'=>'Answer','text'=>'Yes. Certxa offers free data migration from GlossGenius — your client list, appointment history, and service menu are imported for you, typically in under an hour.']],
      ['@type'=>'Question','name'=>'Does Certxa have a self-service check-in kiosk?','acceptedAnswer'=>['@type'=>'Answer','text'=>'Yes. Certxa includes a self-service walk-in check-in kiosk on every plan — clients check themselves in on a tablet, choose a service and technician preference, and are added to your live waitlist automatically.']],
    ],
  ],
]));
require 'includes/header.php';
require 'includes/nav.php';
?>

<style>
.vs-hero { background: linear-gradient(160deg,#1a0033 0%,#2d0057 50%,#1a0033 100%); padding: 100px 0 70px; text-align: center; color: #fff; position: relative; overflow: hidden; }
.vs-hero .orb-1, .vs-hero .orb-2 { position: absolute; pointer-events: none; }
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
    <h1>Certxa <em>vs</em> GlossGenius</h1>
    <p>Both platforms cover booking, payments, and client management. Here's how the pricing, fees, and features actually compare — with real numbers, not marketing claims.</p>
    <div class="hero-dark-actions">
      <a href="/auth?mode=register" class="btn btn-gold btn-lg">Start <?= TRIAL_DAYS ?>-Day Free Trial</a>
      <a href="/pricing" class="btn-outline-white btn-lg">See Certxa Pricing</a>
    </div>
    <div class="vs-hero-stats">
      <div class="vs-hero-stat"><div class="num">$9</div><div class="lbl">Certxa starting price/mo</div></div>
      <div class="vs-hero-stat"><div class="num">$24</div><div class="lbl">GlossGenius starting price/mo</div></div>
      <div class="vs-hero-stat"><div class="num"><?= TRIAL_DAYS ?>d</div><div class="lbl">Certxa free trial</div></div>
    </div>
  </div>
</section>

<section class="compare-section">
  <div class="container">
    <div class="section-header">
      <span class="tag tag-plum">Pricing & Fees</span>
      <h2 class="section-title">What each plan actually costs</h2>
      <p class="section-subtitle">GlossGenius pricing shown is billed annually (monthly billing runs higher on both platforms). Figures as of August 2026 — verify current pricing directly with each provider before switching.</p>
    </div>
    <div class="compare-table-wrap">
      <table class="compare-table">
        <thead>
          <tr>
            <th style="width:34%;"></th>
            <th><div class="plan-header featured-col">Certxa</div><div class="plan-header-price" style="color:var(--plum-mid);">$9 – $49/mo ⭐</div></th>
            <th><div class="plan-header">GlossGenius</div><div class="plan-header-price">$24 – $148/mo</div></th>
          </tr>
        </thead>
        <tbody>
          <tr class="section-row"><td colspan="3">Plans</td></tr>
          <tr><td>Entry plan</td><td class="featured-col ct-text">Solo — $9/mo ($7 annual)</td><td class="ct-text">Standard — $28/mo ($24 annual)</td></tr>
          <tr><td>Mid plan</td><td class="featured-col ct-text">Professional — $22/mo ($18 annual)</td><td class="ct-text">Gold — $56/mo ($48 annual)</td></tr>
          <tr><td>Top plan</td><td class="featured-col ct-text">Elite — $49/mo ($39 annual)</td><td class="ct-text">Platinum — $168/mo ($148 annual)</td></tr>
          <tr><td>Staff / calendars on mid plan</td><td class="featured-col ct-check">Unlimited</td><td class="ct-text">Not publicly specified</td></tr>

          <tr class="section-row"><td colspan="3">Fees</td></tr>
          <tr><td>Setup fee</td><td class="featured-col ct-text">None</td><td class="ct-text">None</td></tr>
          <tr><td>Card processing</td><td class="featured-col ct-text">2.7% + $0.05 + $0.60/txn in-person, 2.9% + $0.30 + $0.60/txn online</td><td class="ct-text">2.6% per transaction (0% platform fee on Gold plan)</td></tr>
          <tr><td>Marketplace / booking commission</td><td class="featured-col ct-check">None</td><td class="ct-text">Not publicly disclosed</td></tr>
          <tr><td>Free trial</td><td class="featured-col ct-text"><?= TRIAL_DAYS ?> days</td><td class="ct-text">Available (length not published)</td></tr>

          <tr class="section-row"><td colspan="3">Features</td></tr>
          <tr><td>Self-service check-in kiosk</td><td class="featured-col ct-check">✓</td><td class="ct-cross">–</td></tr>
          <tr><td>AI phone receptionist</td><td class="featured-col ct-text">Available now (Autumn, usage-based)</td><td class="ct-text">Announced, listed "Coming Soon"</td></tr>
          <tr><td>Built-in POS</td><td class="featured-col ct-check">✓</td><td class="ct-check">✓</td></tr>
          <tr><td>Online booking</td><td class="featured-col ct-check">✓</td><td class="ct-check">✓</td></tr>
          <tr><td>Client management / CRM</td><td class="featured-col ct-check">✓</td><td class="ct-check">✓</td></tr>
          <tr><td>Branded website builder</td><td class="featured-col ct-check">✓</td><td class="ct-text">Not a core feature</td></tr>
          <tr><td>Free card reader</td><td class="featured-col ct-text">Purchased from Stripe</td><td class="ct-check">✓ Included</td></tr>
        </tbody>
      </table>
    </div>
    <p class="source-note">Pricing and feature details for GlossGenius are based on GlossGenius's publicly published pricing page as of August 2026. Pricing, fees, and features change over time on both platforms — always confirm current terms directly with the provider before making a switch.</p>
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
        <h3 class="bento-title">Lower cost at every tier</h3>
        <p class="bento-text">Certxa's Professional plan ($22/mo, $18/mo annually) costs less than GlossGenius's entry-level Standard plan ($28/mo, $24/mo annually) — and includes unlimited staff and calendars.</p>
      </div>
      <div class="bento-card">
        <h3 class="bento-title">A live AI receptionist today</h3>
        <p class="bento-text">Autumn, Certxa's AI receptionist, answers calls and books appointments now. GlossGenius's equivalent, "Reception by GlossGenius," is announced but not yet shipped as of this writing.</p>
      </div>
      <div class="bento-card">
        <h3 class="bento-title">A check-in kiosk built in</h3>
        <p class="bento-text">Certxa's self-service walk-in kiosk is included on every plan — clients check themselves in, choose a tech preference, and join your live waitlist without you stopping mid-service.</p>
      </div>
    </div>
  </div>
</section>

<section class="section section-alt">
  <div class="container" style="max-width:820px;">
    <div class="section-header">
      <span class="tag tag-plum">FAQ</span>
      <h2 class="section-title">Certxa vs GlossGenius — common questions</h2>
    </div>
    <div class="accordion">
      <div class="accordion-item">
        <h3 class="accordion-heading"><button class="accordion-btn">Is Certxa cheaper than GlossGenius? <span class="accordion-icon">+</span></button></h3>
        <div class="accordion-body">For most nail salons, yes. Certxa's plans run $9–$49/month ($7–$39/month billed annually). GlossGenius's three plans are $24–$168/month billed monthly ($24–$148/month billed annually). GlossGenius's Gold plan drops its platform fee to 0% on card processing, but the subscription itself still costs more than any Certxa plan.</div>
      </div>
      <div class="accordion-item">
        <h3 class="accordion-heading"><button class="accordion-btn">Does GlossGenius have an AI receptionist like Certxa's Autumn? <span class="accordion-icon">+</span></button></h3>
        <div class="accordion-body">Certxa's Autumn AI receptionist is available today as a usage-based add-on. GlossGenius has announced "Reception by GlossGenius," an AI phone-answering feature, but as of this writing it is listed as Coming Soon and is not yet available to salons.</div>
      </div>
      <div class="accordion-item">
        <h3 class="accordion-heading"><button class="accordion-btn">Can I migrate from GlossGenius to Certxa? <span class="accordion-icon">+</span></button></h3>
        <div class="accordion-body">Yes. Certxa offers free data migration from GlossGenius — your client list, appointment history, and service menu are imported for you, typically in under an hour.</div>
      </div>
      <div class="accordion-item">
        <h3 class="accordion-heading"><button class="accordion-btn">Does Certxa have a self-service check-in kiosk? <span class="accordion-icon">+</span></button></h3>
        <div class="accordion-body">Yes. Certxa includes a self-service walk-in check-in kiosk on every plan — clients check themselves in on a tablet, choose a service and technician preference, and are added to your live waitlist automatically.</div>
      </div>
    </div>

    <div class="contact-banner">
      <h2>See the difference for yourself</h2>
      <p>Start your <?= TRIAL_DAYS ?>-day free trial — no credit card charge until it ends.</p>
      <a href="/auth?mode=register">Start Free Trial</a>
    </div>
  </div>
</section>

<?php require 'includes/footer.php'; ?>
