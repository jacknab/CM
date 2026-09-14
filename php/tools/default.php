<?php
define('BRAND_NAME',    'Certxa');
define('PAGE_TITLE',    'Free Salon Business Calculators | Certxa Tools');
define('PAGE_DESC',     'Two free calculators for nail salon and salon owners: find your break-even point in appointments per day, and see exactly how much no-shows are costing you every year.');
define('PAGE_KEYWORDS', 'salon break even calculator, nail salon break even point, salon no show calculator, salon no show cost, how many appointments to break even, salon profit calculator, nail salon business tools');
define('PAGE_CANONICAL', 'https://certxa.com/tools');
define('PAGE_BREADCRUMBS', json_encode([
  ['name'=>'Home','url'=>'https://certxa.com/'],
  ['name'=>'Tools','url'=>'https://certxa.com/tools'],
]));
define('PAGE_SCHEMA', json_encode([
  [
    '@type'       => 'WebPage',
    '@id'         => 'https://certxa.com/tools',
    'name'        => 'Free Salon Business Calculators — Certxa',
    'description' => 'Free break-even and no-show cost calculators built for nail salon and salon owners.',
    'url'         => 'https://certxa.com/tools',
    'isPartOf'    => ['@id'=>'https://certxa.com/#website'],
    'about'       => ['@id'=>'https://certxa.com/#software'],
  ],
  [
    '@type'    => 'ItemList',
    '@id'      => 'https://certxa.com/tools#tool-list',
    'name'     => 'Certxa Salon Business Calculators',
    'itemListElement' => [
      [
        '@type'    => 'ListItem',
        'position' => 1,
        'item'     => [
          '@type'               => 'WebApplication',
          '@id'                 => 'https://certxa.com/tools#breakeven-calculator',
          'name'                => 'Salon Break-Even Calculator',
          'url'                 => 'https://certxa.com/tools#breakeven',
          'applicationCategory' => 'BusinessApplication',
          'operatingSystem'     => 'Any (web browser)',
          'description'         => 'Calculates how many clients per day a salon needs to break even, based on monthly fixed costs, average ticket price, stylist commission rate, stations, and days open — plus a chair-utilization score and no-show impact analysis.',
          'offers'              => ['@type' => 'Offer', 'price' => 0, 'priceCurrency' => 'USD'],
          'isAccessibleForFree' => true,
        ],
      ],
      [
        '@type'    => 'ListItem',
        'position' => 2,
        'item'     => [
          '@type'               => 'WebApplication',
          '@id'                 => 'https://certxa.com/tools#no-show-calculator',
          'name'                => 'Salon No-Show Cost Calculator',
          'url'                 => 'https://certxa.com/tools#no-show',
          'applicationCategory' => 'BusinessApplication',
          'operatingSystem'     => 'Any (web browser)',
          'description'         => 'Calculates how much revenue a salon loses to client no-shows each year, and how much automated reminders can recover.',
          'offers'              => ['@type' => 'Offer', 'price' => 0, 'priceCurrency' => 'USD'],
          'isAccessibleForFree' => true,
        ],
      ],
    ],
  ],
  [
    '@type'    => 'FAQPage',
    'mainEntity' => [
      [
        '@type'          => 'Question',
        'name'           => 'What is break-even analysis for a salon?',
        'acceptedAnswer' => ['@type'=>'Answer','text'=>'Salon break-even analysis tells you the exact number of clients (or revenue) you need each month to cover all your fixed costs — rent, utilities, insurance, software — plus the commission paid to stylists. Below that number you lose money; above it, every dollar contributes to profit.'],
      ],
      [
        '@type'          => 'Question',
        'name'           => 'How do you calculate the break-even point for a salon?',
        'acceptedAnswer' => ['@type'=>'Answer','text'=>'The formula is: Break-even revenue = fixed costs / (1 − commission %). Then divide by your average ticket price to get the number of clients needed per month, and by your days open to get clients per day. For example, a salon with $6,000 in fixed costs, 50% commission, and a $45 average ticket needs about 267 clients per month, or 10-11 per day if open 26 days.'],
      ],
      [
        '@type'          => 'Question',
        'name'           => 'What is a healthy chair utilization rate for a salon?',
        'acceptedAnswer' => ['@type'=>'Answer','text'=>'Most profitable salons run at 60-80% chair utilization. Below 50% you have cushion but lots of wasted capacity. Above 85% you are stretched thin and vulnerable to no-shows or staff turnover. If your break-even point requires over 90% utilization, you need to raise prices, cut fixed costs, or add stations.'],
      ],
      [
        '@type'          => 'Question',
        'name'           => 'How do no-shows affect my salon\'s break-even point?',
        'acceptedAnswer' => ['@type'=>'Answer','text'=>'No-shows directly raise the number of appointments you need to book. If your break-even is 15 clients per day and your no-show rate is 15%, you actually need to book about 18 appointments per day to net 15 paying clients. This is why reducing no-shows with automated reminders and deposits has such a big impact on profitability.'],
      ],
      [
        '@type'          => 'Question',
        'name'           => 'Is the break-even calculator accurate for my specific salon?',
        'acceptedAnswer' => ['@type'=>'Answer','text'=>'This tool uses the standard break-even formula used by accountants and business advisors, and is highly accurate for commission-based salons. Booth rental models work too — enter your net fixed costs (after collecting booth rent) and set commission to 0%. For the most precise numbers, use your actual rent, utilities, and commission rate from the last 3 months.'],
      ],
      [
        '@type'          => 'Question',
        'name'           => 'How much do no-shows cost salons?',
        'acceptedAnswer' => ['@type'=>'Answer','text'=>'The average salon loses several hundred dollars per week to no-shows, depending on service prices and appointment volume. At a 12% no-show rate with $65 average services and 70 weekly appointments, a salon loses roughly $28,000 per year.'],
      ],
      [
        '@type'          => 'Question',
        'name'           => 'How can I reduce no-shows at my salon?',
        'acceptedAnswer' => ['@type'=>'Answer','text'=>'Automated SMS and email reminders sent ahead of the appointment, combined with a deposit or card on file at booking, typically cut no-shows by about half. Certxa includes both — automated client notifications and Stripe-powered deposit protection — built into online booking.'],
      ],
      [
        '@type'          => 'Question',
        'name'           => 'Are these calculators free to use?',
        'acceptedAnswer' => ['@type'=>'Answer','text'=>'Yes. Both calculators are free, run entirely in your browser, and don\'t require an account or email address. They give you an estimate based on the numbers you enter — use them as a starting point for pricing and staffing decisions.'],
      ],
    ],
  ],
]));
require 'includes/header.php';
require 'includes/nav.php';
?>

<style>
/* ── Tools page — shared calculator components ─────────────────── */
.tool-pill {
  display:inline-flex; align-items:center; gap:8px;
  background:rgba(220,38,38,.08); border:1px solid rgba(220,38,38,.18);
  border-radius:50px; padding:6px 16px; font-size:.82rem; font-weight:600;
  color:#DC2626; margin-bottom:18px;
}
.tool-pill .dot { width:7px; height:7px; border-radius:50%; background:#DC2626; }
.tool-pill.plum { background:var(--plum-light); border-color:transparent; color:var(--plum); }
.tool-pill.plum .dot { background:var(--plum); }

.calc-grid { display:grid; grid-template-columns:1fr 1fr; gap:28px; align-items:start; margin-top:40px; }

/* ── Input panel ── */
.calc-panel {
  background:var(--white); border:1.5px solid var(--light-grey); border-radius:var(--radius-lg);
  padding:32px; box-shadow:0 4px 24px rgba(0,0,0,.06), 0 1px 4px rgba(0,0,0,.03);
}
.calc-panel-title { font-family:'Inter',sans-serif; font-size:1.2rem; font-weight:700; color:var(--charcoal); margin-bottom:24px; }
.calc-field { margin-bottom:24px; }
.calc-field:last-child { margin-bottom:0; }
.calc-field label { display:block; font-size:.85rem; font-weight:600; color:var(--charcoal); margin-bottom:8px; }
.calc-flat-input {
  width:100%; padding:13px 16px; font-size:1.05rem; font-weight:600; color:var(--charcoal);
  background:#FAFAFA; border:1.5px solid var(--light-grey); border-radius:12px; outline:none;
  font-family:'Inter',sans-serif; transition:.2s;
}
.calc-flat-input:focus { border-color:var(--plum); box-shadow:0 0 0 3px var(--plum-light); }
.calc-flat-input::-webkit-outer-spin-button, .calc-flat-input::-webkit-inner-spin-button { -webkit-appearance:none; margin:0; }
.calc-flat-input[type=number] { -moz-appearance:textfield; }
.calc-input-wrap { position:relative; }
.calc-input-wrap .calc-prefix { position:absolute; left:16px; top:50%; transform:translateY(-50%); color:var(--mid-grey); font-weight:700; font-size:1.05rem; pointer-events:none; }
.calc-input-wrap .calc-flat-input.has-prefix { padding-left:32px; }
.calc-select {
  appearance:none; -webkit-appearance:none; cursor:pointer; padding-right:40px;
  background-repeat:no-repeat; background-position:right 16px center; background-size:14px;
  background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='%236B7280' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E");
}

.calc-slider-row { display:flex; align-items:center; gap:16px; }
.calc-slider { flex:1; -webkit-appearance:none; appearance:none; height:8px; border-radius:8px; outline:none; cursor:pointer; background:var(--light-grey); }
.calc-slider::-webkit-slider-thumb { -webkit-appearance:none; width:24px; height:24px; border-radius:50%; background:#DC2626; border:3px solid #fff; cursor:pointer; box-shadow:0 2px 8px rgba(220,38,38,.35); transition:transform .2s; }
.calc-slider::-webkit-slider-thumb:hover { transform:scale(1.12); }
.calc-slider::-moz-range-thumb { width:24px; height:24px; border-radius:50%; background:#DC2626; border:3px solid #fff; cursor:pointer; }
.calc-slider.theme-plum::-webkit-slider-thumb { background:var(--plum); box-shadow:0 2px 8px rgba(91,33,182,.35); }
.calc-slider.theme-plum::-moz-range-thumb { background:var(--plum); }
.calc-slider-val { font-size:1.5rem; font-weight:800; min-width:64px; text-align:right; color:#DC2626; }
.calc-slider-val.plum { color:var(--plum); }
.calc-slider-scale { display:flex; justify-content:space-between; font-size:.72rem; color:var(--mid-grey); margin-top:8px; }

/* ── Result cards ── */
.calc-results { display:flex; flex-direction:column; gap:20px; }
.calc-result-card { background:var(--white); border-radius:var(--radius-lg); padding:30px; }
.calc-result-card.danger   { border:1.5px solid #FECACA; box-shadow:0 4px 24px rgba(220,38,38,.08), 0 1px 4px rgba(0,0,0,.03); }
.calc-result-card.positive { border:1.5px solid #A7F3D0; box-shadow:0 4px 24px rgba(5,150,105,.10), 0 1px 4px rgba(0,0,0,.03); }
.calc-result-card.plum     { border:1.5px solid var(--plum-light); box-shadow:0 4px 24px rgba(59,7,100,.08), 0 1px 4px rgba(0,0,0,.03); }

.calc-result-hdr { display:flex; align-items:center; gap:12px; margin-bottom:22px; flex-wrap:wrap; }
.calc-badge { width:42px; height:42px; border-radius:12px; display:flex; align-items:center; justify-content:center; flex-shrink:0; }
.calc-badge.danger   { background:rgba(220,38,38,.1); color:#DC2626; }
.calc-badge.positive { background:rgba(5,150,105,.1); color:#059669; }
.calc-badge.plum     { background:var(--plum-light); color:var(--plum); }
.calc-result-hdr h4 { font-size:1.08rem; font-weight:700; color:var(--charcoal); margin:0; }
.calc-tag-pill { font-size:.72rem; font-weight:700; padding:3px 10px; border-radius:50px; background:rgba(5,150,105,.1); color:#059669; }
.calc-tag-pill.danger { background:rgba(220,38,38,.1); color:#DC2626; }

.calc-highlight-row { display:flex; align-items:center; justify-content:center; gap:28px; margin-bottom:22px; flex-wrap:wrap; text-align:left; }
.calc-highlight-icon { width:60px; height:60px; border-radius:50%; display:flex; align-items:center; justify-content:center; flex-shrink:0; }
.calc-highlight-icon.danger   { background:rgba(220,38,38,.08); color:#DC2626; }
.calc-highlight-icon.positive { background:rgba(5,150,105,.08); color:#059669; }
.calc-highlight-icon.plum     { background:var(--plum-pale); color:var(--plum); }
.calc-highlight-label { font-size:.82rem; color:var(--mid-grey); margin-bottom:2px; }
.calc-highlight-value { font-size:1.6rem; font-weight:800; line-height:1.2; }
.calc-highlight-value.danger   { color:#DC2626; }
.calc-highlight-value.positive { color:#059669; }
.calc-highlight-value.plum     { color:var(--plum); }

.calc-lines { display:flex; flex-direction:column; }
.calc-line { display:flex; justify-content:space-between; align-items:center; gap:12px; padding:12px 0; border-bottom:1px solid var(--light-grey); }
.calc-line:last-of-type { border-bottom:none; }
.calc-line-label { font-size:.86rem; color:var(--mid-grey); }
.calc-line-value { font-size:1.1rem; font-weight:700; white-space:nowrap; }
.calc-line-value.danger   { color:#DC2626; }
.calc-line-value.positive { color:#059669; }
.calc-line-value.plum     { color:var(--plum); }
.calc-line-value.neutral  { color:var(--charcoal); }

.calc-total-box { margin-top:14px; padding:18px; border-radius:var(--radius-md); text-align:center; }
.calc-total-box.danger   { background:rgba(220,38,38,.05); }
.calc-total-box.positive { background:rgba(5,150,105,.05); }
.calc-total-box.plum     { background:var(--plum-pale); }
.calc-total-label { font-size:.82rem; color:var(--mid-grey); margin-bottom:6px; }
.calc-total-value { font-family:'Cormorant Garamond',serif; font-size:2.4rem; font-weight:700; line-height:1; }
.calc-total-value.danger   { color:#DC2626; }
.calc-total-value.positive { color:#059669; }
.calc-total-value.plum     { color:var(--plum); }

.calc-callout-box { margin-top:14px; background:rgba(5,150,105,.06); border-radius:var(--radius-sm); padding:12px 16px; text-align:center; font-size:.85rem; color:var(--charcoal); }
.calc-callout-box strong { color:#059669; }

/* ── Comparison bars ── */
.calc-compare { margin-top:32px; background:var(--white); border:1.5px solid var(--light-grey); border-radius:var(--radius-lg); padding:32px; box-shadow:0 4px 24px rgba(0,0,0,.06); }
.calc-compare h4 { text-align:center; font-size:1.1rem; font-weight:700; color:var(--charcoal); margin-bottom:24px; }
.calc-bar-row { margin-bottom:20px; }
.calc-bar-row:last-of-type { margin-bottom:0; }
.calc-bar-hdr { display:flex; justify-content:space-between; margin-bottom:8px; font-size:.85rem; font-weight:600; color:var(--charcoal); }
.calc-bar-track { width:100%; height:18px; border-radius:50px; background:var(--light-grey); overflow:hidden; }
.calc-bar-fill { height:100%; border-radius:50px; transition:width .6s cubic-bezier(.34,1.56,.64,1); }
.calc-bar-fill.danger   { background:linear-gradient(90deg,#DC2626,#B91C1C); }
.calc-bar-fill.positive { background:linear-gradient(90deg,#059669,#047857); }
.calc-bar-fill.plum     { background:linear-gradient(90deg,var(--plum),#6D28D9); }
.calc-bar-fill.neutral  { background:linear-gradient(90deg,#9CA3AF,#6B7280); }
.calc-compare-note { text-align:center; font-size:.8rem; color:var(--mid-grey); margin-top:18px; }

.tool-cta-note { text-align:center; margin-top:22px; font-size:.85rem; color:var(--mid-grey); }
.tool-cta-note a { color:var(--plum); font-weight:600; }

/* ── Break-even: single-column form + reveal-on-calculate results ── */
.calc-form-wrap { max-width:640px; margin:0 auto; }
.calc-slider-inline { display:flex; align-items:center; gap:16px; }
.calc-slider-inline .calc-slider-val { min-width:56px; }
.calc-hint { font-size:.72rem; color:var(--mid-grey); margin-top:8px; line-height:1.5; }
.calc-submit-btn {
  width:100%; background:var(--grad-plum); color:#fff; border:none; border-radius:12px;
  padding:16px; font-size:1.05rem; font-weight:700; font-family:'Inter',sans-serif;
  cursor:pointer; transition:var(--transition); box-shadow:var(--shadow-md); margin-top:6px;
}
.calc-submit-btn:hover { transform:translateY(-1px); box-shadow:var(--shadow-lg); }

.results-section { opacity:0; transform:translateY(20px); transition:opacity .5s ease, transform .5s cubic-bezier(.34,1.56,.64,1); }
.results-section.visible { opacity:1; transform:translateY(0); }
.results-section.hidden { display:none; }

.be-hero-card {
  border-radius:var(--radius-lg); padding:44px 32px; text-align:center; position:relative; overflow:hidden;
  background:linear-gradient(135deg,#1C1917 0%,#3B0764 100%); box-shadow:0 8px 40px rgba(59,7,100,.25); margin-top:44px;
}
.be-hero-card::before {
  content:''; position:absolute; inset:0; pointer-events:none;
  background:radial-gradient(ellipse at 50% 0%, rgba(180,83,9,.2) 0%, transparent 60%);
}
.be-hero-inner { position:relative; z-index:1; }
.be-hero-eyebrow { font-size:.76rem; font-weight:700; letter-spacing:.1em; text-transform:uppercase; color:var(--gold-bright); margin-bottom:14px; }
.be-hero-lead { color:rgba(255,255,255,.68); font-size:.95rem; margin-bottom:2px; }
.be-hero-number { font-family:'Inter',sans-serif; font-size:clamp(3.2rem,8vw,4.6rem); font-weight:800; color:#fff; line-height:1; margin:4px 0 8px; }
.be-hero-sub { color:rgba(255,255,255,.65); font-size:1.05rem; margin-bottom:20px; }
.be-hero-pill { display:inline-flex; align-items:center; gap:8px; background:rgba(255,255,255,.1); border:1px solid rgba(255,255,255,.15); border-radius:50px; padding:8px 18px; color:rgba(255,255,255,.85); font-size:.85rem; }

.be-stat-grid { display:grid; grid-template-columns:repeat(3,1fr); gap:16px; margin-top:24px; }
.be-stat-card { background:#fff; border:1.5px solid var(--light-grey); border-radius:var(--radius-md); padding:22px 16px; text-align:center; }
.be-stat-icon { width:38px; height:38px; border-radius:10px; background:var(--plum-light); color:var(--plum); display:flex; align-items:center; justify-content:center; margin:0 auto 12px; }
.be-stat-label { font-size:.66rem; font-weight:700; letter-spacing:.06em; text-transform:uppercase; color:var(--mid-grey); margin-bottom:6px; }
.be-stat-value { font-size:1.35rem; font-weight:700; color:var(--charcoal); }

.be-verdict { display:flex; gap:14px; align-items:flex-start; border-radius:var(--radius-lg); padding:22px 24px; margin-top:24px; border:1.5px solid; }
.be-verdict.positive { background:rgba(5,150,105,.05); border-color:#A7F3D0; }
.be-verdict.warning  { background:rgba(180,83,9,.05); border-color:var(--gold-light); }
.be-verdict.danger   { background:rgba(220,38,38,.05); border-color:#FECACA; }
.be-verdict-icon { width:38px; height:38px; border-radius:10px; display:flex; align-items:center; justify-content:center; flex-shrink:0; }
.be-verdict.positive .be-verdict-icon { background:rgba(5,150,105,.12); color:#059669; }
.be-verdict.warning  .be-verdict-icon { background:rgba(180,83,9,.14); color:var(--gold); }
.be-verdict.danger   .be-verdict-icon { background:rgba(220,38,38,.12); color:#DC2626; }
.be-verdict-title { font-weight:700; color:var(--charcoal); margin-bottom:4px; }
.be-verdict-body { font-size:.86rem; color:var(--mid-grey); line-height:1.6; }

.be-noshow-card { margin-top:24px; border:1.5px solid #FECACA; border-radius:var(--radius-lg); padding:28px; background:linear-gradient(135deg,#fff 0%,#FEF2F2 100%); }
.be-noshow-hdr { display:flex; align-items:center; gap:12px; margin-bottom:14px; }
.be-noshow-hdr h4 { font-size:1.05rem; font-weight:700; color:var(--charcoal); margin:0; }
.be-noshow-text { font-size:.85rem; color:var(--mid-grey); line-height:1.6; margin-bottom:18px; }
.be-noshow-grid { display:grid; grid-template-columns:1fr 1fr; gap:14px; margin:18px 0; }
.be-noshow-mini { background:#fff; border:1.5px solid var(--light-grey); border-radius:var(--radius-sm); padding:16px; }
.be-noshow-mini.danger { background:rgba(220,38,38,.04); border-color:#FECACA; }
.be-noshow-mini-label { font-size:.66rem; font-weight:700; text-transform:uppercase; letter-spacing:.06em; color:var(--mid-grey); margin-bottom:6px; }
.be-noshow-mini-value { font-size:1.35rem; font-weight:700; color:var(--charcoal); }
.be-noshow-mini.danger .be-noshow-mini-value { color:#DC2626; }
.be-noshow-cta { background:#fff; border:1.5px solid var(--plum-light); border-radius:var(--radius-sm); padding:16px 18px; font-size:.85rem; color:var(--charcoal); line-height:1.55; }
.be-noshow-cta strong { color:var(--plum); }

@media (max-width:900px) { .calc-grid { grid-template-columns:1fr; } }
@media (max-width:640px) {
  .be-stat-grid { grid-template-columns:1fr; }
  .be-noshow-grid { grid-template-columns:1fr; }
}
@media (max-width:520px) {
  .calc-panel, .calc-result-card, .calc-compare, .be-noshow-card { padding:22px; }
  .calc-highlight-row { gap:18px; }
  .calc-total-value { font-size:2rem; }
  .be-hero-card { padding:32px 22px; }
}
</style>

<!-- HERO -->
<section style="background: linear-gradient(160deg, var(--cream) 0%, var(--plum-light) 100%); padding: 90px 0 50px;">
  <div class="container" style="text-align:center;">
    <span class="tag tag-plum" style="margin-bottom:16px;display:inline-block;">Free Tools</span>
    <h1 style="font-family:'Cormorant Garamond',serif; font-size:clamp(2.6rem,5vw,4rem); color:var(--plum); line-height:1.12; margin-bottom:18px; letter-spacing:-.02em;">
      Know your numbers<br><em>before they know you.</em>
    </h1>
    <p style="font-size:1.05rem; color:var(--mid-grey); max-width:560px; margin:0 auto 8px; line-height:1.75;">
      Two free calculators built for nail salon and salon owners — find your break-even point, and see exactly what no-shows are costing you every year.
    </p>
    <div style="margin-top:24px; display:flex; gap:12px; justify-content:center; flex-wrap:wrap;">
      <a href="#breakeven" class="btn btn-primary">Break-Even Calculator</a>
      <a href="#no-show" class="btn btn-secondary">No-Show Calculator</a>
    </div>
  </div>
</section>

<!-- TOOL 1: BREAK-EVEN CALCULATOR -->
<section class="section" id="breakeven" style="padding-top:70px;">
  <div class="container" style="max-width:1040px;">
    <div style="text-align:center;max-width:640px;margin:0 auto;">
      <span class="tool-pill plum"><span class="dot"></span>Free Tool</span>
      <h2 style="font-family:'Cormorant Garamond',serif;font-size:clamp(2.2rem,4vw,3rem);color:var(--charcoal);line-height:1.15;margin-bottom:16px;">
        Salon Break-Even<br><em style="color:var(--plum);">Analysis Calculator</em>
      </h2>
      <p style="font-size:1rem;color:var(--mid-grey);line-height:1.7;">How many clients per day does your salon need to break even? Enter your numbers and get an instant answer — with a chair-utilization score and no-show impact analysis.</p>
    </div>

    <div class="calc-form-wrap">
      <div class="calc-panel">
        <h3 class="calc-panel-title">Your Salon Numbers</h3>

        <div class="calc-field">
          <label for="be-type">Salon Type</label>
          <select id="be-type" class="calc-flat-input calc-select">
            <option value="nail">Nail Salon</option>
            <option value="hair">Hair Salon</option>
            <option value="beauty">Beauty Salon / Spa</option>
            <option value="barber">Barbershop</option>
          </select>
          <p class="calc-hint">Sets a realistic clients-per-chair capacity for your industry.</p>
        </div>

        <div class="calc-field">
          <label for="be-fixed">Monthly Fixed Costs</label>
          <div class="calc-input-wrap"><span class="calc-prefix">$</span>
            <input type="number" id="be-fixed" class="calc-flat-input has-prefix" value="6000" min="100" step="100">
          </div>
          <p class="calc-hint">Rent + utilities + insurance + software + loan payments. Not staff commission.</p>
        </div>

        <div class="calc-field">
          <label for="be-ticket">Average Ticket Per Client</label>
          <div class="calc-input-wrap"><span class="calc-prefix">$</span>
            <input type="number" id="be-ticket" class="calc-flat-input has-prefix" value="45" min="1" step="1">
          </div>
        </div>

        <div class="calc-field">
          <label for="be-stations">Number of Stations / Chairs</label>
          <div class="calc-slider-inline">
            <input type="range" id="be-stations" class="calc-slider theme-plum" min="1" max="20" step="1" value="5">
            <span class="calc-slider-val plum" id="be-stations-lbl">5</span>
          </div>
          <div class="calc-slider-scale"><span>1</span><span>20</span></div>
        </div>

        <div class="calc-field">
          <label for="be-days">Days Open Per Month</label>
          <div class="calc-slider-inline">
            <input type="range" id="be-days" class="calc-slider theme-plum" min="15" max="31" step="1" value="26">
            <span class="calc-slider-val plum" id="be-days-lbl">26</span>
          </div>
          <div class="calc-slider-scale"><span>15</span><span>31</span></div>
        </div>

        <div class="calc-field">
          <label for="be-commission">Commission Rate / Staff Cost %</label>
          <div class="calc-slider-inline">
            <input type="range" id="be-commission" class="calc-slider theme-plum" min="0" max="70" step="1" value="50">
            <span class="calc-slider-val plum" id="be-commission-lbl">50%</span>
          </div>
          <div class="calc-slider-scale"><span>0%</span><span>70%</span></div>
          <p class="calc-hint">Percentage of each ticket paid to the stylist. For booth rental, set to 0% and enter net fixed costs above.</p>
        </div>

        <button type="button" class="calc-submit-btn" id="be-calc-btn">Calculate My Break-Even Point</button>
      </div>

      <!-- RESULTS (revealed on calculate) -->
      <div class="results-section hidden" id="be-results">

        <div class="be-hero-card">
          <div class="be-hero-inner">
            <div class="be-hero-eyebrow">Your Break-Even Point</div>
            <div class="be-hero-lead">You need to serve</div>
            <div class="be-hero-number" id="be-out-clients-day">0</div>
            <div class="be-hero-sub">paying clients per day to break even</div>
            <div class="be-hero-pill" id="be-out-clients-month">0 clients per month</div>
          </div>
        </div>

        <div class="be-stat-grid">
          <div class="be-stat-card">
            <div class="be-stat-icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
            </div>
            <div class="be-stat-label">Monthly Revenue Needed</div>
            <div class="be-stat-value" id="be-out-revenue">$0</div>
          </div>
          <div class="be-stat-card">
            <div class="be-stat-icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="5" x2="5" y2="19"/><circle cx="6.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/></svg>
            </div>
            <div class="be-stat-label">Chair Utilization</div>
            <div class="be-stat-value" id="be-out-utilization">0%</div>
          </div>
          <div class="be-stat-card">
            <div class="be-stat-icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
            </div>
            <div class="be-stat-label">Daily Capacity</div>
            <div class="be-stat-value" id="be-out-capacity">0 / day</div>
          </div>
        </div>

        <div class="be-verdict positive" id="be-verdict">
          <div class="be-verdict-icon" id="be-verdict-icon">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/></svg>
          </div>
          <div>
            <div class="be-verdict-title" id="be-verdict-title">—</div>
            <div class="be-verdict-body" id="be-verdict-body">—</div>
          </div>
        </div>

        <!-- COMPARISON BAR -->
        <div class="calc-compare">
          <h4>Break-Even vs. Capacity</h4>
          <div class="calc-bar-row">
            <div class="calc-bar-hdr"><span>Break-even needed</span><span id="be-bar-breakeven-lbl">0 / day</span></div>
            <div class="calc-bar-track"><div class="calc-bar-fill plum" id="be-bar-breakeven" style="width:0%;"></div></div>
          </div>
          <div class="calc-bar-row">
            <div class="calc-bar-hdr"><span>Maximum capacity</span><span id="be-bar-capacity-lbl">0 / day</span></div>
            <div class="calc-bar-track"><div class="calc-bar-fill neutral" style="width:100%;"></div></div>
          </div>
          <p class="calc-compare-note">Every client above break-even drops straight to profit.</p>
        </div>

        <!-- NO-SHOW IMPACT -->
        <div class="be-noshow-card">
          <div class="be-noshow-hdr">
            <div class="calc-badge danger">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
            </div>
            <h4>How No-Shows Raise Your Break-Even</h4>
          </div>
          <p class="be-noshow-text">Every no-show is a blocked slot that earns $0. Drag the slider to see how many appointments you actually need to book to net your target number of paying clients.</p>

          <div class="calc-field" style="margin-bottom:0;">
            <div class="calc-slider-row">
              <input type="range" id="be-noshow-rate" class="calc-slider" min="0" max="30" step="1" value="15">
              <span class="calc-slider-val" id="be-noshow-rate-lbl">15%</span>
            </div>
            <div class="calc-slider-scale"><span>0%</span><span>15%</span><span>30%</span></div>
          </div>

          <div class="be-noshow-grid">
            <div class="be-noshow-mini">
              <div class="be-noshow-mini-label">Paying clients / day</div>
              <div class="be-noshow-mini-value" id="be-out-paying">0</div>
            </div>
            <div class="be-noshow-mini danger">
              <div class="be-noshow-mini-label">Appointments to book</div>
              <div class="be-noshow-mini-value" id="be-out-booked">0</div>
            </div>
          </div>

          <div class="be-noshow-cta">
            <strong>Certxa's automated reminders and deposits typically cut no-shows by about half.</strong> At half your current no-show rate, you'd only need to book <strong id="be-out-booked-certxa">0</strong> appointments/day to hit the same target — <a href="/client-notifications">see client notifications →</a>
          </div>
        </div>

        <p class="tool-cta-note">Fill more chairs, faster — <a href="/online-booking">see how 24/7 online booking works →</a></p>
      </div>
    </div>
  </div>
</section>

<script>
(function(){
  function fmtMoney0(n){ return '$' + Math.round(Math.max(n,0)).toLocaleString('en-US'); }
  function fillSlider(el, color){
    var pct = ((+el.value - +el.min) / (+el.max - +el.min)) * 100;
    el.style.background = 'linear-gradient(to right,' + color + ' 0%,' + color + ' ' + pct + '%,var(--light-grey) ' + pct + '%,var(--light-grey) 100%)';
  }

  var CAPACITY_PER_CHAIR = { nail: 8, hair: 6, beauty: 5, barber: 10 };

  var beStations   = document.getElementById('be-stations');
  var beDays       = document.getElementById('be-days');
  var beCommission = document.getElementById('be-commission');
  var beNoShow     = document.getElementById('be-noshow-rate');

  function syncSliderLabel(el, lblId, suffix, color){
    document.getElementById(lblId).textContent = el.value + (suffix || '');
    fillSlider(el, color);
  }
  [
    [beStations,   'be-stations-lbl',   '',  'var(--plum)'],
    [beDays,       'be-days-lbl',       '',  'var(--plum)'],
    [beCommission, 'be-commission-lbl', '%', 'var(--plum)'],
  ].forEach(function(cfg){
    syncSliderLabel(cfg[0], cfg[1], cfg[2], cfg[3]);
    cfg[0].addEventListener('input', function(){ syncSliderLabel(cfg[0], cfg[1], cfg[2], cfg[3]); });
  });
  syncSliderLabel(beNoShow, 'be-noshow-rate-lbl', '%', '#DC2626');

  var lastClientsPerDay = 0;

  function updateNoShowImpact(){
    var rate = (+beNoShow.value || 0) / 100;
    syncSliderLabel(beNoShow, 'be-noshow-rate-lbl', '%', '#DC2626');

    var paying = Math.ceil(lastClientsPerDay);
    var booked = rate < 1 ? Math.ceil(paying / (1 - rate)) : paying;
    var bookedReduced = (rate / 2) < 1 ? Math.ceil(paying / (1 - rate / 2)) : paying;

    document.getElementById('be-out-paying').textContent = paying;
    document.getElementById('be-out-booked').textContent = booked;
    document.getElementById('be-out-booked-certxa').textContent = bookedReduced;
  }
  beNoShow.addEventListener('input', updateNoShowImpact);

  function calculate(){
    var type       = document.getElementById('be-type').value;
    var fixed      = +document.getElementById('be-fixed').value || 0;
    var ticket     = +document.getElementById('be-ticket').value || 0;
    var stations   = +beStations.value || 1;
    var days       = +beDays.value || 1;
    var commission = (+beCommission.value || 0) / 100;

    var salonShare        = Math.max(1 - commission, 0.01);
    var breakevenRevenue  = fixed / salonShare;
    var clientsPerMonth   = ticket > 0 ? breakevenRevenue / ticket : 0;
    var clientsPerDay     = clientsPerMonth / days;
    lastClientsPerDay     = clientsPerDay;

    var capacityPerChair = CAPACITY_PER_CHAIR[type] || 8;
    var dailyCapacity    = stations * capacityPerChair;
    var utilization      = dailyCapacity > 0 ? (clientsPerDay / dailyCapacity * 100) : 0;

    document.getElementById('be-out-clients-day').textContent   = Math.ceil(clientsPerDay).toLocaleString('en-US');
    document.getElementById('be-out-clients-month').textContent = Math.round(clientsPerMonth).toLocaleString('en-US') + ' clients per month';
    document.getElementById('be-out-revenue').textContent       = fmtMoney0(breakevenRevenue);
    document.getElementById('be-out-utilization').textContent   = Math.round(utilization) + '%';
    document.getElementById('be-out-capacity').textContent      = dailyCapacity.toLocaleString('en-US') + ' / day';

    var verdict = document.getElementById('be-verdict');
    var icon    = document.getElementById('be-verdict-icon');
    var title   = document.getElementById('be-verdict-title');
    var body    = document.getElementById('be-verdict-body');
    var tier, tierClass, iconSvg;
    var checkIcon = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/></svg>';
    var warnIcon  = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>';

    if (utilization > 100) {
      tierClass = 'danger'; iconSvg = warnIcon;
      title.textContent = 'Break-Even Exceeds Capacity';
      body.textContent  = "Your fixed costs and commission rate require more clients than your stations can physically serve. Raise prices, lower commission, cut fixed costs, or add stations.";
    } else if (utilization > 90) {
      tierClass = 'danger'; iconSvg = warnIcon;
      title.textContent = 'Running Above 90% Capacity';
      body.textContent  = "You need over 90% chair utilization just to break even — raise prices, lower commission, or cut fixed costs to build in a margin of safety.";
    } else if (utilization > 85) {
      tierClass = 'warning'; iconSvg = warnIcon;
      title.textContent = 'Running Thin';
      body.textContent  = "You're stretched thin. A slow week or a few no-shows could put you underwater — consider tightening costs or booking more efficiently.";
    } else if (utilization >= 50) {
      tierClass = 'positive'; iconSvg = checkIcon;
      title.textContent = 'Healthy Break-Even';
      body.textContent  = "Most profitable salons run in the 60–80% utilization range — you're in solid, sustainable territory.";
    } else {
      tierClass = 'positive'; iconSvg = checkIcon;
      title.textContent = 'Plenty of Cushion';
      body.textContent  = "Your break-even point uses less than half your capacity — you have room to grow, take time off, or absorb slow days without risk.";
    }
    verdict.className = 'be-verdict ' + tierClass;
    icon.className    = 'be-verdict-icon';
    icon.innerHTML     = iconSvg;

    var barPct = Math.min(utilization, 100);
    document.getElementById('be-bar-breakeven').style.width = barPct + '%';
    document.getElementById('be-bar-breakeven-lbl').textContent = Math.ceil(clientsPerDay).toLocaleString('en-US') + ' / day';
    document.getElementById('be-bar-capacity-lbl').textContent  = dailyCapacity.toLocaleString('en-US') + ' / day';

    updateNoShowImpact();

    var section = document.getElementById('be-results');
    section.classList.remove('hidden');
    requestAnimationFrame(function(){ section.classList.add('visible'); });
    section.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  document.getElementById('be-calc-btn').addEventListener('click', calculate);
})();
</script>

<!-- TOOL 2: NO-SHOW CALCULATOR -->
<section class="section" id="no-show" style="padding-top:20px;">
  <div class="container" style="max-width:1040px;">
    <div style="text-align:center;max-width:640px;margin:0 auto;">
      <span class="tool-pill"><span class="dot"></span>Free Tool</span>
      <h2 style="font-family:'Cormorant Garamond',serif;font-size:clamp(2.2rem,4vw,3rem);color:var(--charcoal);line-height:1.15;margin-bottom:16px;">
        How much are no-shows<br><em style="color:#DC2626;">costing your salon?</em>
      </h2>
      <p style="font-size:1rem;color:var(--mid-grey);line-height:1.7;">Enter your salon's numbers below. See exactly how much revenue walks out the door every week, month, and year — and how much you could recover.</p>
    </div>

    <div class="calc-grid">
      <!-- INPUT PANEL -->
      <div class="calc-panel">
        <h3 class="calc-panel-title">Your Salon Numbers</h3>

        <div class="calc-field">
          <label for="ns-price">Average Service Price</label>
          <div class="calc-input-wrap"><span class="calc-prefix">$</span>
            <input type="number" id="ns-price" class="calc-flat-input has-prefix" value="65" min="1" max="999">
          </div>
        </div>

        <div class="calc-field">
          <label for="ns-appts">Appointments Per Week</label>
          <input type="number" id="ns-appts" class="calc-flat-input" value="70" min="1" max="999">
        </div>

        <div class="calc-field">
          <label for="ns-rate">Current No-Show Rate</label>
          <div class="calc-slider-row">
            <input type="range" id="ns-rate" class="calc-slider" min="0" max="50" step="1" value="12">
            <span class="calc-slider-val" id="ns-rate-lbl">12%</span>
          </div>
          <div class="calc-slider-scale"><span>0%</span><span>25%</span><span>50%</span></div>
        </div>

        <div class="calc-field">
          <label for="ns-days">Days Open Per Week</label>
          <select id="ns-days" class="calc-flat-input calc-select">
            <option value="5">5 days</option>
            <option value="6" selected>6 days</option>
            <option value="7">7 days</option>
          </select>
        </div>
      </div>

      <!-- RESULTS -->
      <div class="calc-results">
        <div class="calc-result-card danger">
          <div class="calc-result-hdr">
            <div class="calc-badge danger">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
            </div>
            <h4>Without Automated Reminders</h4>
          </div>

          <div class="calc-highlight-row">
            <div class="calc-highlight-icon danger">
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
            </div>
            <div>
              <div class="calc-highlight-label">No-shows per week</div>
              <div class="calc-highlight-value danger" id="ns-out-count">—</div>
            </div>
          </div>

          <div class="calc-lines">
            <div class="calc-line"><span class="calc-line-label">Lost per open day</span><span class="calc-line-value danger" id="ns-out-day">—</span></div>
            <div class="calc-line"><span class="calc-line-label">Lost per week</span><span class="calc-line-value danger" id="ns-out-week">—</span></div>
            <div class="calc-line"><span class="calc-line-label">Lost per month</span><span class="calc-line-value danger" id="ns-out-month">—</span></div>
          </div>

          <div class="calc-total-box danger">
            <div class="calc-total-label">Lost per year</div>
            <div class="calc-total-value danger" id="ns-out-year">—</div>
          </div>
        </div>

        <div class="calc-result-card positive">
          <div class="calc-result-hdr">
            <div class="calc-badge positive">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/></svg>
            </div>
            <h4>With Certxa</h4>
            <span class="calc-tag-pill">~50% fewer no-shows</span>
          </div>

          <div class="calc-highlight-row">
            <div class="calc-highlight-icon positive">
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>
            </div>
            <div>
              <div class="calc-highlight-label">You could recover</div>
              <div class="calc-highlight-value positive" id="ns-out-recovered">—</div>
            </div>
          </div>

          <div class="calc-callout-box">That's <strong id="ns-out-appts">—</strong> free appointments worth of revenue, every year.</div>
        </div>
      </div>
    </div>

    <!-- COMPARISON BAR -->
    <div class="calc-compare">
      <h4>Annual Revenue Lost to No-Shows</h4>
      <div class="calc-bar-row">
        <div class="calc-bar-hdr"><span>Without reminders</span><span style="color:#DC2626;" id="ns-bar-lost-lbl">-$—</span></div>
        <div class="calc-bar-track"><div class="calc-bar-fill danger" id="ns-bar-lost" style="width:100%;"></div></div>
      </div>
      <div class="calc-bar-row">
        <div class="calc-bar-hdr"><span>With Certxa</span><span style="color:#059669;" id="ns-bar-saved-lbl">-$—</span></div>
        <div class="calc-bar-track"><div class="calc-bar-fill positive" id="ns-bar-saved" style="width:50%;"></div></div>
      </div>
      <p class="calc-compare-note">Certxa's automated SMS &amp; email reminders cut no-shows by an average of 50%.</p>
    </div>

    <p class="tool-cta-note">Certxa sends automated reminders and supports deposits on every booking — <a href="/client-notifications">see client notifications →</a> or <a href="/payment-processing">deposit protection →</a></p>
  </div>
</section>

<script>
(function(){
  function fmtMoney0(n){ var s = n < 0 ? '-' : ''; return s + '$' + Math.round(Math.abs(n)).toLocaleString('en-US'); }
  function fillSlider(el, color){
    var pct = ((+el.value - +el.min) / (+el.max - +el.min)) * 100;
    el.style.background = 'linear-gradient(to right,' + color + ' 0%,' + color + ' ' + pct + '%,var(--light-grey) ' + pct + '%,var(--light-grey) 100%)';
  }

  var nsRate = document.getElementById('ns-rate');

  function calcNoShow(){
    var price = +document.getElementById('ns-price').value || 0;
    var appts = +document.getElementById('ns-appts').value || 0;
    var rate  = (+nsRate.value || 0) / 100;
    var days  = +document.getElementById('ns-days').value || 1;

    document.getElementById('ns-rate-lbl').textContent = nsRate.value + '%';
    fillSlider(nsRate, '#DC2626');

    var noShowsPerWeek = appts * rate;
    var lostWeek  = noShowsPerWeek * price;
    var lostDay   = lostWeek / days;
    var lostMonth = lostWeek * (52 / 12);
    var lostYear  = lostWeek * 52;
    var recovered = lostYear * 0.5;
    var remaining = lostYear - recovered;
    var savedAppts = Math.round(noShowsPerWeek * 52 * 0.5);

    document.getElementById('ns-out-count').textContent     = (Math.round(noShowsPerWeek * 10) / 10);
    document.getElementById('ns-out-day').textContent       = fmtMoney0(lostDay);
    document.getElementById('ns-out-week').textContent      = fmtMoney0(lostWeek);
    document.getElementById('ns-out-month').textContent     = fmtMoney0(lostMonth);
    document.getElementById('ns-out-year').textContent      = fmtMoney0(lostYear);
    document.getElementById('ns-out-recovered').textContent = fmtMoney0(recovered) + ' / year';
    document.getElementById('ns-out-appts').textContent     = savedAppts.toLocaleString('en-US');

    document.getElementById('ns-bar-lost-lbl').textContent  = '-' + fmtMoney0(lostYear);
    document.getElementById('ns-bar-saved-lbl').textContent = '-' + fmtMoney0(remaining);
    document.getElementById('ns-bar-lost').style.width  = '100%';
    document.getElementById('ns-bar-saved').style.width = (lostYear > 0 ? (remaining / lostYear * 100) : 0) + '%';
  }

  ['ns-price','ns-appts','ns-rate','ns-days'].forEach(function(id){
    document.getElementById(id).addEventListener('input', calcNoShow);
  });
  calcNoShow();
})();
</script>

<!-- FAQ -->
<section class="section" style="background:var(--cream);">
  <div class="container" style="max-width:720px;">
    <div class="section-header">
      <span class="tag tag-plum">FAQ</span>
      <h2 class="section-title">Calculator questions, answered</h2>
    </div>
    <div class="accordion">
      <div class="accordion-item">
        <h3 class="accordion-heading"><button class="accordion-btn">What is break-even analysis for a salon? <span class="accordion-icon">+</span></button></h3>
        <div class="accordion-body">Salon break-even analysis tells you the exact number of clients (or revenue) you need each month to cover all your fixed costs — rent, utilities, insurance, software — plus the commission paid to stylists. Below that number you lose money; above it, every dollar contributes to profit.</div>
      </div>
      <div class="accordion-item">
        <h3 class="accordion-heading"><button class="accordion-btn">How do you calculate the break-even point for a salon? <span class="accordion-icon">+</span></button></h3>
        <div class="accordion-body">The formula is: Break-even revenue = fixed costs / (1 − commission %). Then divide by your average ticket price to get the number of clients needed per month, and by your days open to get clients per day. For example, a salon with $6,000 in fixed costs, 50% commission, and a $45 average ticket needs about 267 clients per month, or 10-11 per day if open 26 days.</div>
      </div>
      <div class="accordion-item">
        <h3 class="accordion-heading"><button class="accordion-btn">What is a healthy chair utilization rate for a salon? <span class="accordion-icon">+</span></button></h3>
        <div class="accordion-body">Most profitable salons run at 60-80% chair utilization. Below 50% you have cushion but lots of wasted capacity. Above 85% you are stretched thin and vulnerable to no-shows or staff turnover. If your break-even point requires over 90% utilization, you need to raise prices, cut fixed costs, or add stations.</div>
      </div>
      <div class="accordion-item">
        <h3 class="accordion-heading"><button class="accordion-btn">How do no-shows affect my salon's break-even point? <span class="accordion-icon">+</span></button></h3>
        <div class="accordion-body">No-shows directly raise the number of appointments you need to book. If your break-even is 15 clients per day and your no-show rate is 15%, you actually need to book about 18 appointments per day to net 15 paying clients. This is why reducing no-shows with automated reminders and deposits has such a big impact on profitability.</div>
      </div>
      <div class="accordion-item">
        <h3 class="accordion-heading"><button class="accordion-btn">Is the break-even calculator accurate for my specific salon? <span class="accordion-icon">+</span></button></h3>
        <div class="accordion-body">This tool uses the standard break-even formula used by accountants and business advisors, and is highly accurate for commission-based salons. Booth rental models work too — enter your net fixed costs (after collecting booth rent) and set commission to 0%. For the most precise numbers, use your actual rent, utilities, and commission rate from the last 3 months.</div>
      </div>
      <div class="accordion-item">
        <h3 class="accordion-heading"><button class="accordion-btn">How much do no-shows cost salons? <span class="accordion-icon">+</span></button></h3>
        <div class="accordion-body">The average salon loses several hundred dollars per week to no-shows, depending on service prices and appointment volume. At a 12% no-show rate with $65 average services and 70 weekly appointments, a salon loses roughly $28,000 per year.</div>
      </div>
      <div class="accordion-item">
        <h3 class="accordion-heading"><button class="accordion-btn">How can I reduce no-shows at my salon? <span class="accordion-icon">+</span></button></h3>
        <div class="accordion-body">Automated SMS and email reminders sent ahead of the appointment, combined with a deposit or card on file at booking, typically cut no-shows by about half. Certxa includes both — automated client notifications and Stripe-powered deposit protection — built into online booking.</div>
      </div>
      <div class="accordion-item">
        <h3 class="accordion-heading"><button class="accordion-btn">Are these calculators free to use? <span class="accordion-icon">+</span></button></h3>
        <div class="accordion-body">Yes. Both calculators are free, run entirely in your browser, and don't require an account or email address. They give you an estimate based on the numbers you enter — use them as a starting point for pricing and staffing decisions.</div>
      </div>
    </div>
  </div>
</section>

<!-- FINAL CTA -->
<section class="cta-section">
  <div class="container" style="position:relative;z-index:1;text-align:center;">
    <span class="tag" style="background:rgba(255,255,255,.15);color:#fff;margin-bottom:16px;display:inline-block;">Put the numbers to work</span>
    <h2 class="cta-title">Hit break-even faster.<br><em>Lose fewer bookings to no-shows.</em></h2>
    <p class="cta-text">Certxa brings 24/7 online booking, automated reminders, and deposit protection into one platform built for nail salons. Start free for <?= TRIAL_DAYS ?> days.</p>
    <div class="cta-actions">
      <a href="/auth?mode=register" class="btn btn-gold">Start Free Trial</a>
      <a href="/salonos" class="btn btn-outline-white">Explore All Features</a>
    </div>
    <p class="cta-note">Credit card required · No charge until trial ends</p>
  </div>
</section>

<?php require 'includes/footer.php'; ?>
