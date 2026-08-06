<?php
define('BRAND_NAME',    'Certxa');
define('PAGE_TITLE',    'Payments & Billing Explained | Certxa — Stripe Connect, Wallet & SMS');
define('PAGE_DESC',     'Understand how payments and billing work on Certxa. We use Stripe Connect for card-present POS and a prepaid Platform Wallet for AI Receptionist calls and SMS overage. No surprises.');
define('PAGE_KEYWORDS', 'certxa payments, certxa billing, stripe connect salon, salon card reader, salon POS fees, certxa wallet, AI receptionist credits, SMS overage salon software');
define('PAGE_CANONICAL', 'https://certxa.com/payments');
define('PAGE_BREADCRUMBS', json_encode([
  ['name'=>'Home',     'url'=>'https://certxa.com/'],
  ['name'=>'Pricing',  'url'=>'https://certxa.com/pricing'],
  ['name'=>'Payments & Billing', 'url'=>'https://certxa.com/payments'],
]));
define('PAGE_SCHEMA', json_encode([
  [
    '@type'       => 'WebPage',
    '@id'         => 'https://certxa.com/payments',
    'name'        => 'Payments & Billing — Certxa',
    'description' => 'How Certxa handles card-present payments via Stripe Connect, the Platform Wallet for pay-as-you-go extras, and the SMS credits system.',
    'url'         => 'https://certxa.com/payments',
    'isPartOf'    => ['@id'=>'https://certxa.com/#website'],
  ],
  [
    '@type'      => 'FAQPage',
    'mainEntity' => [
      ['@type'=>'Question','name'=>'Does Certxa take a cut of my payment processing fees?','acceptedAnswer'=>['@type'=>'Answer','text'=>'No. Certxa does not take a percentage of your card sales. All processing fees go directly to Stripe. We charge a flat $0.60 connection fee per transaction — that\'s our only payment-related charge.']],
      ['@type'=>'Question','name'=>'Do I need to buy a card reader from Certxa?','acceptedAnswer'=>['@type'=>'Answer','text'=>'No. The Stripe M2 card reader is purchased directly from Stripe Terminal. Certxa connects your Stripe account to our POS via Stripe Connect, so the reader communicates directly with Stripe — not through us.']],
      ['@type'=>'Question','name'=>'What is the Platform Wallet used for?','acceptedAnswer'=>['@type'=>'Answer','text'=>'The Platform Wallet is a prepaid dollar balance inside your Certxa account. It covers pay-as-you-go extras: AI Receptionist (Autumn) call charges, additional SMS when your allowance runs out, and future usage-based features. You top it up manually or set it to auto-refill when the balance drops below a threshold.']],
      ['@type'=>'Question','name'=>'What happens if my Wallet balance runs out during an AI call?','acceptedAnswer'=>['@type'=>'Answer','text'=>'Autumn will complete any in-progress call even if it takes the balance slightly negative (up to -$10.00). However, new calls will be blocked until you top up. Auto-refill prevents this entirely.']],
      ['@type'=>'Question','name'=>'How does SMS overage work?','acceptedAnswer'=>['@type'=>'Answer','text'=>'Your plan includes a monthly SMS allowance (200 SMS on Solo, unlimited on Professional and Elite). If you exceed it, additional messages are charged at $0.026 per SMS, drawn automatically from your Platform Wallet.']],
    ],
  ],
]));
require __DIR__ . '/../includes/header.php';
require __DIR__ . '/../includes/nav.php';
?>

<style>
.pay-hero {
  background: linear-gradient(160deg, #0f0a1e 0%, #1e0a3c 55%, #0a0f1e 100%);
  padding: 100px 0 80px;
  position: relative;
  overflow: hidden;
}
.pay-hero::before {
  content: '';
  position: absolute;
  top: -200px; left: 50%;
  transform: translateX(-50%);
  width: 800px; height: 800px;
  background: radial-gradient(circle, rgba(109,40,217,.18) 0%, transparent 65%);
  pointer-events: none;
}
.pay-hero-tag {
  display: inline-block;
  background: rgba(139,92,246,.2);
  color: #c4b5fd;
  border: 1px solid rgba(139,92,246,.3);
  font-size: .75rem;
  font-weight: 700;
  letter-spacing: .1em;
  text-transform: uppercase;
  padding: 6px 18px;
  border-radius: 50px;
  margin-bottom: 20px;
}
.pay-hero h1 {
  font-family: 'Cormorant Garamond', serif;
  font-size: clamp(2.4rem, 5vw, 3.8rem);
  color: #fff;
  line-height: 1.12;
  margin-bottom: 20px;
  letter-spacing: -.02em;
}
.pay-hero h1 em { color: #a78bfa; font-style: italic; }
.pay-hero p {
  font-size: 1.05rem;
  color: rgba(255,255,255,.65);
  max-width: 580px;
  margin: 0 auto;
  line-height: 1.8;
}
.pillar-nav {
  display: flex;
  justify-content: center;
  gap: 12px;
  flex-wrap: wrap;
  margin-top: 44px;
}
.pillar-btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 10px 22px;
  border-radius: 50px;
  font-size: .85rem;
  font-weight: 600;
  text-decoration: none;
  border: 1.5px solid rgba(255,255,255,.18);
  color: rgba(255,255,255,.8);
  background: rgba(255,255,255,.06);
  transition: all .2s;
}
.pillar-btn:hover { background: rgba(255,255,255,.12); color: #fff; border-color: rgba(255,255,255,.3); }
.pillar-btn .pb-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }

.pay-section { padding: 80px 0; scroll-margin-top: 80px; }
.pay-section-alt { background: var(--cream); }

.how-steps {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 20px;
  margin-top: 48px;
}
.how-step {
  background: var(--white);
  border: 1.5px solid var(--light-grey);
  border-radius: var(--radius-md);
  padding: 28px 24px;
  transition: var(--transition);
}
.how-step:hover { border-color: var(--plum-light); box-shadow: var(--shadow-sm); }
.how-step-num {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px; height: 34px;
  border-radius: 50%;
  background: var(--plum-light);
  color: var(--plum-mid);
  font-size: .8rem;
  font-weight: 800;
  margin-bottom: 14px;
}
.how-step h3 { font-size: .98rem; font-weight: 700; margin-bottom: 8px; }
.how-step p  { font-size: .85rem; color: var(--mid-grey); line-height: 1.65; margin: 0; }

/* ── Step 2 M2 device illustration ── */
.how-step-m2 { display: flex; flex-direction: column; align-items: center; gap: 18px; }
.how-step-m2-copy { width: 100%; }
.pay-m2-wrap {
  display: flex; align-items: center; justify-content: center;
  perspective: 900px;
}
.pay-m2-scene {
  transform: rotateY(10deg) rotateX(-3deg);
  animation: pay-m2-float 7s ease-in-out infinite;
  position: relative;
}
@keyframes pay-m2-float {
  0%,100% { transform: rotateY(10deg) rotateX(-3deg) translateY(0); }
  50%      { transform: rotateY(10deg) rotateX(-3deg) translateY(-8px); }
}
.pay-m2-body {
  width: 72px; height: 122px;
  background: linear-gradient(175deg, #f5f5f5 0%, #e8e8e8 40%, #d5d5d5 100%);
  border-radius: 16px; position: relative;
  box-shadow:
    0 0 0 1.5px rgba(0,0,0,.12),
    0 0 0 2.5px rgba(255,255,255,.55),
    5px 14px 36px rgba(0,0,0,.45),
    inset 0 1px 0 rgba(255,255,255,.9);
  display: flex; flex-direction: column; align-items: center;
}
.pay-m2-body::before {
  content: '';
  position: absolute; inset: 0;
  background: linear-gradient(130deg, rgba(255,255,255,.28) 0%, transparent 50%);
  border-radius: 16px; pointer-events: none;
}
.pay-m2-body::after {
  content: '';
  position: absolute; bottom: 8px; left: 50%; transform: translateX(-50%);
  width: 18px; height: 4px;
  background: #bbb; border-radius: 3px;
  box-shadow: inset 0 1px 2px rgba(0,0,0,.25), 0 1px 0 rgba(255,255,255,.55);
}
.pay-m2-slot {
  width: 48px; height: 5px; background: #111; border-radius: 3px; margin-top: 14px;
  box-shadow: inset 0 2px 4px rgba(0,0,0,.7), 0 1px 0 rgba(255,255,255,.3);
}
.pay-m2-logo { margin-top: 12px; display: flex; flex-direction: column; align-items: center; gap: 2px; }
.pay-m2-wordmark { font-size: .45rem; font-weight: 800; letter-spacing: .12em; text-transform: uppercase; color: #635bff; }
.pay-m2-sub { font-size: .3rem; font-weight: 600; letter-spacing: .1em; text-transform: uppercase; color: #bbb; }
.pay-m2-nfc {
  margin-top: 12px; width: 26px; height: 26px;
  position: relative; display: flex; align-items: center; justify-content: center;
}
.pay-m2-arc {
  position: absolute; border: 1.5px solid #635bff; border-radius: 50%;
  opacity: 0; animation: pay-m2-nfc 2.4s ease-out infinite;
}
.pay-m2-arc:nth-child(1) { width: 7px;  height: 7px;  animation-delay: 0s; }
.pay-m2-arc:nth-child(2) { width: 14px; height: 14px; animation-delay: .35s; }
.pay-m2-arc:nth-child(3) { width: 20px; height: 20px; animation-delay: .7s; }
.pay-m2-arc:nth-child(4) { width: 26px; height: 26px; animation-delay: 1.05s; }
@keyframes pay-m2-nfc {
  0%   { transform: scale(.6); opacity: 0; }
  20%  { opacity: .9; }
  100% { transform: scale(1); opacity: 0; }
}
.pay-m2-leds { display: flex; gap: 4px; margin-top: 10px; }
.pay-m2-led { width: 5px; height: 5px; border-radius: 50%; background: #ddd; }
.pay-m2-led.on  { background: #00d4aa; box-shadow: 0 0 6px rgba(0,212,170,.8); animation: pay-m2-blink 3s ease-in-out infinite; }
.pay-m2-led.on2 { background: #635bff; box-shadow: 0 0 6px rgba(99,91,255,.8); animation: pay-m2-blink 3s .4s ease-in-out infinite; }
@keyframes pay-m2-blink {
  0%,100% { opacity: 1; } 50% { opacity: .35; }
}
.pay-m2-side {
  position: absolute; right: -4px; top: 28px;
  width: 4px; height: 20px;
  background: linear-gradient(180deg, #ccc, #bbb); border-radius: 0 3px 3px 0;
  box-shadow: 2px 1px 4px rgba(0,0,0,.2);
}
.pay-m2-glow {
  position: absolute; bottom: -18px; left: 50%; transform: translateX(-50%);
  width: 90px; height: 28px;
  background: radial-gradient(ellipse, rgba(99,91,255,.35) 0%, transparent 70%);
  filter: blur(8px);
}
.pay-m2-tag {
  margin-top: 10px; text-align: center;
  font-size: .6rem; font-weight: 600; color: var(--mid-grey);
  letter-spacing: .04em;
}
.pay-m2-tag a { color: var(--plum); text-decoration: none; font-weight: 700; }
.pay-m2-tag a:hover { text-decoration: underline; }
@media (max-width: 680px) {
  .pay-m2-wrap { margin-top: 8px; }
}

.fee-callout {
  display: flex;
  align-items: flex-start;
  gap: 20px;
  background: var(--white);
  border: 2px solid var(--plum-light);
  border-radius: var(--radius-md);
  padding: 28px 32px;
  margin-top: 40px;
  flex-wrap: wrap;
}
.fee-callout-icon { font-size: 2rem; flex-shrink: 0; line-height: 1; padding-top: 4px; }
.fee-callout-body { flex: 1; min-width: 220px; }
.fee-callout-body h3 { font-size: 1.05rem; font-weight: 700; margin-bottom: 8px; }
.fee-callout-body p  { font-size: .87rem; color: var(--mid-grey); line-height: 1.7; margin: 0; }
.fee-callout-body p + p { margin-top: 10px; }
.fee-callout-price {
  font-family: 'Cormorant Garamond', serif;
  font-size: 2.6rem;
  font-weight: 600;
  color: var(--plum);
  white-space: nowrap;
  align-self: center;
}
.fee-callout-price span { font-size: 1rem; font-family: 'Inter', sans-serif; font-weight: 400; color: var(--mid-grey); }

.security-strip {
  display: flex;
  flex-wrap: wrap;
  gap: 24px;
  justify-content: center;
  margin-top: 44px;
}
.sec-item { display: flex; align-items: center; gap: 10px; font-size: .85rem; color: var(--mid-grey); }
.sec-item strong { color: var(--charcoal); }

.wallet-uses {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 20px;
  margin-top: 36px;
}
.wallet-use-card {
  background: var(--white);
  border: 1.5px solid var(--light-grey);
  border-radius: var(--radius-md);
  padding: 26px 20px;
  text-align: center;
  transition: var(--transition);
}
.wallet-use-card:hover { border-color: var(--plum-light); box-shadow: var(--shadow-sm); }
.wallet-use-icon { font-size: 2rem; margin-bottom: 12px; display: block; }
.wallet-use-card h3 { font-size: .95rem; font-weight: 700; margin-bottom: 6px; }
.wallet-use-card p  { font-size: .82rem; color: var(--mid-grey); line-height: 1.6; margin: 0; }
.wallet-use-rate {
  display: inline-block;
  margin-top: 12px;
  font-size: .76rem;
  font-weight: 700;
  color: var(--plum-mid);
  background: var(--plum-light);
  padding: 3px 12px;
  border-radius: 50px;
}

.wallet-flow {
  display: flex;
  align-items: center;
  gap: 0;
  margin-top: 40px;
  flex-wrap: wrap;
  justify-content: center;
}
.wf-step {
  flex: 1;
  min-width: 150px;
  max-width: 210px;
  text-align: center;
  padding: 20px 14px;
  background: var(--white);
  border: 1.5px solid var(--light-grey);
  border-radius: var(--radius-md);
}
.wf-arrow { font-size: 1.4rem; color: #c4b5fd; padding: 0 8px; flex-shrink: 0; }
.wf-step-icon { font-size: 1.8rem; margin-bottom: 10px; display: block; }
.wf-step h4 { font-size: .88rem; font-weight: 700; margin-bottom: 4px; }
.wf-step p  { font-size: .78rem; color: var(--mid-grey); line-height: 1.5; margin: 0; }

.auto-refill-strip {
  display: flex;
  align-items: center;
  gap: 20px;
  background: linear-gradient(135deg, #f5f3ff, #ede9fe);
  border: 1.5px solid #c4b5fd;
  border-radius: var(--radius-md);
  padding: 24px 28px;
  margin-top: 40px;
  flex-wrap: wrap;
}
.ar-icon { font-size: 2rem; flex-shrink: 0; }
.ar-body { flex: 1; min-width: 220px; }
.ar-body h3 { font-size: 1rem; font-weight: 700; margin-bottom: 4px; color: var(--plum-mid); }
.ar-body p  { font-size: .86rem; color: #6d28d9; line-height: 1.65; margin: 0; }

.sms-buckets {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 24px;
  margin-top: 40px;
}
.sms-bucket {
  border-radius: var(--radius-md);
  padding: 28px 24px;
  border: 1.5px solid var(--light-grey);
  background: var(--white);
}
.sms-bucket.primary { border-color: var(--plum); background: var(--plum-light); }
.sms-bucket h3 { font-size: 1rem; font-weight: 700; margin-bottom: 10px; }
.sms-bucket .bucket-badge {
  display: inline-block;
  font-size: .68rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: .08em;
  padding: 3px 10px;
  border-radius: 50px;
  margin-bottom: 14px;
}
.sms-bucket.primary .bucket-badge { background: var(--plum); color: #fff; }
.sms-bucket:not(.primary) .bucket-badge { background: var(--light-grey); color: var(--mid-grey); }
.sms-bucket p  { font-size: .86rem; line-height: 1.7; margin: 0; color: var(--charcoal); }
.sms-bucket ul { margin: 12px 0 0; padding: 0; list-style: none; }
.sms-bucket ul li {
  font-size: .84rem; color: var(--charcoal);
  padding: 5px 0;
  display: flex; align-items: center; gap: 8px;
}
.sms-bucket ul li::before { content: '✓'; color: #059669; font-weight: 700; flex-shrink: 0; }

.sms-packages {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;
  margin-top: 28px;
}
.sms-pkg {
  background: var(--white);
  border: 1.5px solid var(--light-grey);
  border-radius: var(--radius-md);
  padding: 22px 16px;
  text-align: center;
  transition: var(--transition);
}
.sms-pkg:hover { border-color: var(--plum-light); box-shadow: var(--shadow-sm); }
.sms-pkg-price {
  font-family: 'Cormorant Garamond', serif;
  font-size: 2.2rem;
  font-weight: 600;
  color: var(--plum);
  line-height: 1;
  margin-bottom: 4px;
}
.sms-pkg-amount { font-size: .9rem; font-weight: 700; margin-bottom: 4px; }
.sms-pkg-rate   { font-size: .76rem; color: var(--mid-grey); }

/* ── Cost estimator ───────────────────────────────── */
.estimator-wrap {
  background: var(--white);
  border: 2px solid var(--plum-light);
  border-radius: var(--radius-lg);
  overflow: hidden;
  margin-top: 48px;
  box-shadow: var(--shadow-md);
}
.estimator-header {
  background: linear-gradient(135deg, var(--plum), #4c1d95);
  padding: 28px 36px;
  color: #fff;
}
.estimator-header h3 { font-size: 1.1rem; font-weight: 700; margin: 0 0 4px; }
.estimator-header p  { font-size: .85rem; color: rgba(255,255,255,.7); margin: 0; }

.estimator-body {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0;
}
.estimator-inputs {
  padding: 32px 36px;
  border-right: 1.5px solid var(--light-grey);
}
.estimator-results {
  padding: 32px 36px;
  background: #fafaf9;
}

.est-input-group { margin-bottom: 24px; }
.est-input-group:last-child { margin-bottom: 0; }
.est-label {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: .83rem;
  font-weight: 600;
  color: var(--charcoal);
  margin-bottom: 10px;
}
.est-label-hint { font-size: .75rem; font-weight: 400; color: var(--mid-grey); }

.est-slider-row { display: flex; align-items: center; gap: 14px; }
.est-slider {
  flex: 1;
  -webkit-appearance: none;
  appearance: none;
  height: 4px;
  border-radius: 4px;
  background: var(--light-grey);
  outline: none;
  cursor: pointer;
}
.est-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 20px; height: 20px;
  border-radius: 50%;
  background: var(--plum);
  cursor: pointer;
  box-shadow: 0 1px 4px rgba(91,33,182,.4);
  transition: transform .15s;
}
.est-slider::-webkit-slider-thumb:hover { transform: scale(1.15); }
.est-slider::-moz-range-thumb {
  width: 20px; height: 20px;
  border-radius: 50%;
  background: var(--plum);
  cursor: pointer;
  border: none;
}
.est-val {
  min-width: 52px;
  text-align: right;
  font-size: .88rem;
  font-weight: 700;
  color: var(--plum);
}

.est-result-title {
  font-size: .75rem;
  font-weight: 700;
  letter-spacing: .09em;
  text-transform: uppercase;
  color: var(--mid-grey);
  margin-bottom: 18px;
}
.est-line {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  padding: 9px 0;
  border-bottom: 1px solid var(--light-grey);
  font-size: .86rem;
  gap: 12px;
}
.est-line:last-of-type { border-bottom: none; }
.est-line-label { color: var(--charcoal); flex: 1; line-height: 1.4; }
.est-line-sub   { font-size: .74rem; color: var(--mid-grey); display: block; margin-top: 2px; }
.est-line-amt   { font-weight: 700; color: var(--charcoal); white-space: nowrap; }
.est-line-amt.zero { color: #059669; }

.est-total {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 18px;
  padding-top: 16px;
  border-top: 2px solid var(--plum-light);
}
.est-total-label { font-size: .88rem; font-weight: 700; color: var(--charcoal); }
.est-total-label span { display: block; font-size: .74rem; font-weight: 400; color: var(--mid-grey); margin-top: 2px; }
.est-total-amt {
  font-family: 'Cormorant Garamond', serif;
  font-size: 2.2rem;
  font-weight: 600;
  color: var(--plum);
  line-height: 1;
}

.est-wallet-suggest {
  margin-top: 18px;
  background: var(--plum-light);
  border-radius: var(--radius-sm);
  padding: 12px 16px;
  font-size: .81rem;
  color: var(--plum-mid);
  line-height: 1.6;
}
.est-wallet-suggest strong { color: var(--plum); }

.est-disclaimer {
  padding: 14px 36px;
  background: #fafaf9;
  border-top: 1px solid var(--light-grey);
  font-size: .74rem;
  color: var(--mid-grey);
  line-height: 1.6;
}

@media (max-width: 800px) {
  .estimator-body { grid-template-columns: 1fr; }
  .estimator-inputs { border-right: none; border-bottom: 1.5px solid var(--light-grey); }
  .estimator-inputs, .estimator-results { padding: 24px 20px; }
  .estimator-header { padding: 22px 20px; }
  .est-disclaimer { padding: 14px 20px; }
}

@media (max-width: 700px) {
  .sms-buckets  { grid-template-columns: 1fr; }
  .sms-packages { grid-template-columns: 1fr; }
  .fee-callout  { flex-direction: column; }
  .wallet-flow  { flex-direction: column; align-items: stretch; }
  .wf-arrow     { transform: rotate(90deg); align-self: center; }
}
</style>

<!-- HERO -->
<div class="pay-hero">
  <div class="container" style="text-align:center; position:relative; z-index:1;">
    <span class="pay-hero-tag">Payments &amp; Billing</span>
    <h1>No hidden fees.<br><em>No surprises. Ever.</em></h1>
    <p>Certxa keeps every billing stream transparent: Stripe handles your card payments, your Wallet covers pay-as-you-go extras, and your plan's included SMS keeps clients in the loop. Here's exactly how each piece works.</p>

    <div class="pillar-nav">
      <a href="#stripe-connect" class="pillar-btn"><span class="pb-dot" style="background:#635bff;"></span>Stripe Connect &amp; POS</a>
      <a href="#wallet" class="pillar-btn"><span class="pb-dot" style="background:#a78bfa;"></span>Platform Wallet</a>
      <a href="#sms" class="pillar-btn"><span class="pb-dot" style="background:#10b981;"></span>SMS &amp; Messaging</a>
      <a href="#estimator" class="pillar-btn"><span class="pb-dot" style="background:#f59e0b;"></span>Cost Estimator</a>
      <a href="#faq-billing" class="pillar-btn"><span class="pb-dot" style="background:#e5e7eb;"></span>FAQ</a>
    </div>
  </div>
</div>

<!-- ═══ STRIPE CONNECT ═══════════════════════════════════ -->
<section class="pay-section" id="stripe-connect">
  <div class="container">
    <div class="section-header">
      <span class="tag tag-plum" style="background:rgba(99,91,255,.1);color:#4f46e5;border-color:rgba(99,91,255,.25);">Stripe Connect</span>
      <h2 class="section-title">Card payments, powered by Stripe</h2>
      <p class="section-subtitle">Certxa does not process payments itself. We connect your business directly to Stripe — the same infrastructure used by Amazon, Shopify, and millions of businesses worldwide. Your money flows from client card to your Stripe account, and we never touch it.</p>
    </div>

    <div class="how-steps">
      <div class="how-step">
        <div class="how-step-num">1</div>
        <h3>Connect your Stripe account</h3>
        <p>From your Certxa dashboard, go to <strong>Payments → Connect Stripe</strong>. If you don't have a Stripe account yet, you'll create one for free in about 3 minutes. Your Certxa account and Stripe are now linked via Stripe Connect.</p>
      </div>
      <div class="how-step">
        <div class="how-step-m2">
          <div class="how-step-m2-copy">
            <div class="how-step-num">2</div>
            <h3>Get the Stripe M2 card reader</h3>
            <p>Purchase the Stripe M2 card reader directly from <a href="https://stripe.com/terminal" target="_blank" rel="noopener" style="color:var(--plum);font-weight:600;">Stripe Terminal</a> — not from us. The M2 is a compact Bluetooth reader that accepts chip, swipe, and contactless tap. You own it outright.</p>
          </div>
          <div class="pay-m2-wrap">
            <div style="display:flex;flex-direction:column;align-items:center;gap:6px;">
              <div class="pay-m2-scene">
                <div class="pay-m2-body">
                  <div class="pay-m2-slot"></div>
                  <div class="pay-m2-logo">
                    <div class="pay-m2-wordmark">Stripe</div>
                    <div class="pay-m2-sub">M2 Reader</div>
                  </div>
                  <div class="pay-m2-nfc">
                    <div class="pay-m2-arc"></div>
                    <div class="pay-m2-arc"></div>
                    <div class="pay-m2-arc"></div>
                    <div class="pay-m2-arc"></div>
                  </div>
                  <div class="pay-m2-leds">
                    <div class="pay-m2-led on"></div>
                    <div class="pay-m2-led on2"></div>
                    <div class="pay-m2-led"></div>
                  </div>
                  <div class="pay-m2-side"></div>
                  <div class="pay-m2-glow"></div>
                </div>
              </div>
              <div class="pay-m2-tag"><a href="https://stripe.com/terminal" target="_blank" rel="noopener">Buy at Stripe →</a></div>
            </div>
          </div>
        </div>
      </div>
      <div class="how-step">
        <div class="how-step-num">3</div>
        <h3>Take your first payment</h3>
        <p>Open a checkout from any appointment in Certxa and tap to charge. The M2 reader communicates directly with Stripe — card data never passes through Certxa. Funds settle in your Stripe account on Stripe's payout schedule.</p>
      </div>
      <div class="how-step">
        <div class="how-step-num">4</div>
        <h3>Stripe pays you out</h3>
        <p>Stripe deposits your earnings directly into your linked bank account — typically the next business day. Certxa has no access to your funds, cannot hold them, and plays no part in your payouts.</p>
      </div>
    </div>

    <div class="fee-callout">
      <div class="fee-callout-icon">💳</div>
      <div class="fee-callout-body">
        <h3>What does it cost per transaction?</h3>
        <p>
          Stripe charges their standard card-present processing rate on every transaction
          (<a href="https://stripe.com/pricing" target="_blank" rel="noopener" style="color:var(--plum);font-weight:600;">see Stripe's pricing →</a> — typically 2.7% + 5¢ for US cards in-person).
          On top of that, Certxa charges a flat <strong style="color:var(--plum);">$0.60 connection fee</strong> per transaction. That's it — no percentage cut, no monthly gateway fee, no minimums.
        </p>
        <p style="font-size:.82rem;">
          <strong>Example:</strong> A $100 service with a US card costs roughly $2.70 + $0.05 (Stripe) + $0.60 (Certxa) = $3.35 total — leaving you <strong>$96.65</strong>.
        </p>
      </div>
      <div class="fee-callout-price">$0.60 <span>/txn</span></div>
    </div>

    <div class="security-strip">
      <div class="sec-item">🔒 <span><strong>PCI compliant</strong> — card data goes directly to Stripe, never through Certxa</span></div>
      <div class="sec-item">🏦 <span><strong>We never touch your money</strong> — funds go straight to your Stripe account</span></div>
      <div class="sec-item">⚡ <span><strong>Next-day payouts</strong> — on Stripe's standard payout schedule</span></div>
    </div>
  </div>
</section>

<!-- ═══ PLATFORM WALLET ═══════════════════════════════════ -->
<section class="pay-section pay-section-alt" id="wallet">
  <div class="container">
    <div class="section-header">
      <span class="tag tag-plum">Platform Wallet</span>
      <h2 class="section-title">Your prepaid balance for pay-as-you-go extras</h2>
      <p class="section-subtitle">The Certxa Wallet is a dollar balance inside your account. It funds usage-based extras like AI Receptionist calls and overflow SMS — separate from your subscription, separate from your Stripe payments. You only add money when you need those features.</p>
    </div>

    <p style="text-align:center;font-weight:700;font-size:1rem;margin-bottom:4px;">What the Wallet covers</p>
    <p style="text-align:center;color:var(--mid-grey);font-size:.88rem;margin-top:0;">One balance. Every pay-as-you-go feature on your account draws from it.</p>

    <div class="wallet-uses">
      <div class="wallet-use-card">
        <span class="wallet-use-icon">🍂</span>
        <h3>Autumn AI Receptionist</h3>
        <p>Every call Autumn handles draws from your Wallet balance. Billing is per minute — $0.0041 per second, which works out to $0.25 per minute of connected call time.</p>
        <span class="wallet-use-rate">$0.25 per minute</span>
      </div>
      <div class="wallet-use-card">
        <span class="wallet-use-icon">💬</span>
        <h3>SMS Overage</h3>
        <p>When your plan's monthly SMS allowance is used up, your Wallet covers additional messages so notifications keep going without interruption.</p>
        <span class="wallet-use-rate">$0.026 per SMS</span>
      </div>
      <div class="wallet-use-card">
        <span class="wallet-use-icon">📞</span>
        <h3>AI Phone Number</h3>
        <p>Provisioning the dedicated phone number that Autumn uses to take inbound calls is a one-time charge drawn from your Wallet.</p>
        <span class="wallet-use-rate">One-time provisioning fee</span>
      </div>
      <div class="wallet-use-card">
        <span class="wallet-use-icon">✨</span>
        <h3>Future Extras</h3>
        <p>As Certxa rolls out new usage-based features, your existing Wallet balance will cover them automatically — no new payment method needed.</p>
        <span class="wallet-use-rate">More coming soon</span>
      </div>
    </div>

    <p style="text-align:center;font-weight:700;font-size:1rem;margin-top:56px;margin-bottom:4px;">How topping up works</p>
    <p style="text-align:center;color:var(--mid-grey);font-size:.88rem;margin-top:0;">Add funds manually any time, or let auto-refill keep your balance healthy automatically.</p>

    <div class="wallet-flow">
      <div class="wf-step">
        <span class="wf-step-icon">🏦</span>
        <h4>Open Wallet</h4>
        <p>Go to <strong>Billing → Wallet</strong> inside your dashboard</p>
      </div>
      <div class="wf-arrow">→</div>
      <div class="wf-step">
        <span class="wf-step-icon">💳</span>
        <h4>Add funds</h4>
        <p>Choose an amount and pay via Stripe Checkout — one-click with a saved card</p>
      </div>
      <div class="wf-arrow">→</div>
      <div class="wf-step">
        <span class="wf-step-icon">⚡</span>
        <h4>Balance is live instantly</h4>
        <p>Funds appear immediately — Autumn and other extras can draw from them right away</p>
      </div>
      <div class="wf-arrow">→</div>
      <div class="wf-step">
        <span class="wf-step-icon">📊</span>
        <h4>Review usage</h4>
        <p>Every charge is logged in a transaction ledger so you see exactly where every cent went</p>
      </div>
    </div>

    <div class="auto-refill-strip">
      <div class="ar-icon">🔄</div>
      <div class="ar-body">
        <h3>Auto-Refill — set it and forget it</h3>
        <p>Set a low-balance threshold (e.g. $5) and a refill amount (e.g. $25). When your Wallet drops below the threshold, Certxa automatically charges your saved card and restores the balance — so Autumn never drops a call and SMS notifications never miss a beat. Enable it from <strong>Billing → Wallet → Auto-Refill</strong> in your dashboard.</p>
      </div>
    </div>
  </div>
</section>

<!-- ═══ SMS & MESSAGING ════════════════════════════════════ -->
<section class="pay-section" id="sms">
  <div class="container">
    <div class="section-header">
      <span class="tag" style="background:#d1fae5;color:#065f46;">SMS &amp; Messaging</span>
      <h2 class="section-title">Your plan includes SMS — Wallet covers the rest</h2>
      <p class="section-subtitle">Every Certxa subscription includes a monthly SMS allowance at no extra cost. If you send more than your plan allows, each additional message is billed at a flat rate drawn directly from your Platform Wallet — no packages to buy, no credits to manage.</p>
    </div>

    <div class="sms-buckets">
      <div class="sms-bucket primary">
        <span class="bucket-badge">Included in your plan</span>
        <h3>📅 Monthly SMS Allowance</h3>
        <p>Every subscription comes with a built-in SMS allowance that resets automatically at the start of each billing period. Use it for appointment reminders, confirmations, and marketing — it's already part of what you pay.</p>
        <ul>
          <li>No extra cost — included in every plan</li>
          <li>Solo plan: 200 SMS/month</li>
          <li>Professional &amp; Elite: Unlimited SMS</li>
          <li>Resets automatically each billing cycle</li>
        </ul>
      </div>
      <div class="sms-bucket">
        <span class="bucket-badge">When allowance runs out</span>
        <h3>💼 Wallet SMS Overage</h3>
        <p>Once your monthly allowance is used up, additional messages are charged directly to your Platform Wallet at a flat per-message rate. Your Wallet balance is the same one used for AI Receptionist calls — one balance, all usage-based features.</p>
        <ul>
          <li>$0.026 per SMS beyond your plan allowance</li>
          <li>Charged to your Platform Wallet automatically</li>
          <li>Set Wallet auto-refill so messages never stop</li>
          <li>Full usage log in your dashboard</li>
        </ul>
      </div>
    </div>

    <div class="auto-refill-strip" style="margin-top:32px;">
      <div class="ar-icon">💡</div>
      <div class="ar-body">
        <h3>Most salons never hit their limit</h3>
        <p>On the Professional or Elite plan, SMS is unlimited — you'll never pay overage. On the Solo plan, 200 messages covers the average solo stylist's reminders for the month. If you do go over, the Wallet rate is simple and transparent: <strong>$0.026 per message</strong>. Enable Auto-Refill on your Wallet and it handles itself automatically.</p>
      </div>
    </div>
  </div>
</section>

<?php
// Fetch plan prices from the API (no auth required)
$_planPrices = ['solo' => ['name'=>'Solo','priceMonthly'=>900], 'professional' => ['name'=>'Professional','priceMonthly'=>2200]];
$_planJson = @file_get_contents('http://127.0.0.1:9200/api/public/plan-prices');
if ($_planJson) {
  $_fetched = json_decode($_planJson, true);
  if (is_array($_fetched)) $_planPrices = array_merge($_planPrices, $_fetched);
}
$_soloCents = (int)($_planPrices['solo']['priceMonthly'] ?? 900);
$_proCents  = (int)($_planPrices['professional']['priceMonthly'] ?? 2200);
$_soloPrice = number_format($_soloCents / 100, 0);
$_proPrice  = number_format($_proCents  / 100, 0);
?>

<!-- ═══ COST ESTIMATOR ════════════════════════════════════ -->
<section class="pay-section pay-section-alt" id="estimator">
  <div class="container">
    <div class="section-header">
      <span class="tag tag-gold">Cost Estimator</span>
      <h2 class="section-title">See your real monthly cost</h2>
      <p class="section-subtitle">Choose your plan and adjust the sliders to match your expected volume. The full breakdown updates instantly — so you go into your first month with zero surprises.</p>
    </div>

    <div class="estimator-wrap">
      <div class="estimator-header">
        <h3>🧮 Monthly Cost Estimator</h3>
        <p>Select a plan, then adjust the sliders to reflect your expected usage. All calculations are estimates based on typical Stripe US card-present rates.</p>
      </div>

      <div class="estimator-body">

        <!-- INPUTS -->
        <div class="estimator-inputs">

          <!-- Plan selector pills -->
          <div class="est-input-group">
            <div class="est-label">Your plan</div>
            <div class="est-plan-pills">
              <button class="est-plan-pill" id="pill-solo"
                data-price="<?= $_soloCents ?>"
                data-name="Solo"
                onclick="selectPlan('solo')">
                Solo &nbsp;· &nbsp;$<?= $_soloPrice ?>/mo
              </button>
              <button class="est-plan-pill active" id="pill-professional"
                data-price="<?= $_proCents ?>"
                data-name="Professional"
                onclick="selectPlan('professional')">
                Professional &nbsp;· &nbsp;$<?= $_proPrice ?>/mo
              </button>
            </div>
          </div>

          <div class="est-input-group">
            <div class="est-label">
              Card transactions per month
              <span class="est-label-hint" id="lbl-txns">50 transactions</span>
            </div>
            <div class="est-slider-row">
              <input type="range" class="est-slider" id="sl-txns" min="0" max="500" value="50" step="5">
              <span class="est-val" id="val-txns">50</span>
            </div>
          </div>

          <div class="est-input-group">
            <div class="est-label">
              Average transaction value
              <span class="est-label-hint" id="lbl-avg">$60 per transaction</span>
            </div>
            <div class="est-slider-row">
              <input type="range" class="est-slider" id="sl-avg" min="10" max="300" value="60" step="5">
              <span class="est-val" id="val-avg">$60</span>
            </div>
          </div>

          <div class="est-input-group">
            <div class="est-label">
              Autumn AI minutes per month
              <span class="est-label-hint">$0.25 per minute ($0.0041/sec)</span>
            </div>
            <div class="est-slider-row">
              <input type="range" class="est-slider" id="sl-calls" min="0" max="300" value="0" step="5">
              <span class="est-val" id="val-calls">0</span>
            </div>
          </div>

          <div class="est-input-group">
            <div class="est-label">
              Overage SMS per month
              <span class="est-label-hint">Beyond your plan's allowance · $0.026/SMS</span>
            </div>
            <div class="est-slider-row">
              <input type="range" class="est-slider" id="sl-sms" min="0" max="1000" value="0" step="25">
              <span class="est-val" id="val-sms">0</span>
            </div>
          </div>

        </div>

        <!-- RESULTS -->
        <div class="estimator-results">
          <div class="est-result-title">Monthly Cost Breakdown</div>

          <div class="est-line">
            <div class="est-line-label">
              <span id="r-plan-name">Professional</span> plan subscription
              <span class="est-line-sub">Billed monthly · change anytime</span>
            </div>
            <div class="est-line-amt" id="r-plan">$<?= $_proPrice ?>.00</div>
          </div>

          <div class="est-line">
            <div class="est-line-label">
              Stripe processing fees
              <span class="est-line-sub">2.7% + $0.05 per transaction (US card-present estimate)</span>
            </div>
            <div class="est-line-amt" id="r-stripe">$0.00</div>
          </div>

          <div class="est-line">
            <div class="est-line-label">
              Certxa connection fee
              <span class="est-line-sub">$0.60 × number of transactions</span>
            </div>
            <div class="est-line-amt" id="r-certxa">$0.00</div>
          </div>

          <div class="est-line">
            <div class="est-line-label">
              Autumn AI Receptionist
              <span class="est-line-sub">$0.25 per minute ($0.0041/sec)</span>
            </div>
            <div class="est-line-amt" id="r-autumn">$0.00</div>
          </div>

          <div class="est-line">
            <div class="est-line-label">
              Overage SMS (via Wallet)
              <span class="est-line-sub">$0.026 per message beyond plan allowance</span>
            </div>
            <div class="est-line-amt" id="r-sms">$0.00</div>
          </div>

          <div class="est-total">
            <div class="est-total-label">
              Estimated monthly total
              <span>Everything included</span>
            </div>
            <div class="est-total-amt" id="r-total">$<?= $_proPrice ?>.00</div>
          </div>

          <div class="est-wallet-suggest" id="wallet-suggest" style="display:none;">
            💡 <strong>Wallet suggestion:</strong> At this volume, a wallet top-up of <strong id="r-wallet-topup">$0</strong>/month would keep Autumn and SMS running without interruption — or set auto-refill to that amount and forget about it.
          </div>
        </div>

      </div>

      <div class="est-disclaimer">
        ⚠️ <strong>Estimates only.</strong> Plan prices are current as of page load and may change. Stripe processing fees shown are based on standard US card-present rates (2.7% + $0.05) — international cards and other types may differ (<a href="https://stripe.com/pricing" target="_blank" rel="noopener" style="color:var(--plum);">see Stripe's full pricing</a>). Certxa's $0.60 connection fee is exact. Autumn call charges and SMS Wallet rates are per the current Certxa billing schedule.
      </div>
    </div>
  </div>
</section>

<style>
.est-plan-pills {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}
.est-plan-pill {
  flex: 1;
  min-width: 130px;
  padding: 10px 18px;
  border-radius: 50px;
  border: 2px solid var(--light-grey);
  background: var(--white);
  color: var(--charcoal);
  font-size: .85rem;
  font-weight: 600;
  cursor: pointer;
  transition: all .18s;
  text-align: center;
  line-height: 1.3;
}
.est-plan-pill:hover {
  border-color: var(--plum-light);
  background: var(--plum-light);
  color: var(--plum-mid);
}
.est-plan-pill.active {
  border-color: var(--plum);
  background: var(--plum);
  color: #fff;
}
</style>

<script>
(function () {
  var PLAN_PRICES = {
    solo:         { name: 'Solo',         cents: <?= $_soloCents ?> },
    professional: { name: 'Professional', cents: <?= $_proCents  ?> }
  };
  var selectedPlan = 'professional';

  window.selectPlan = function(code) {
    selectedPlan = code;
    document.querySelectorAll('.est-plan-pill').forEach(function(p) {
      p.classList.toggle('active', p.id === 'pill-' + code);
    });
    update();
  };

  var slTxns  = document.getElementById('sl-txns');
  var slAvg   = document.getElementById('sl-avg');
  var slCalls = document.getElementById('sl-calls');
  var slSms   = document.getElementById('sl-sms');

  function fmt(n) { return '$' + n.toFixed(2); }

  function update() {
    var txns  = +slTxns.value;
    var avg   = +slAvg.value;
    var calls = +slCalls.value;
    var sms   = +slSms.value;

    // Display slider labels
    document.getElementById('val-txns').textContent  = txns;
    document.getElementById('val-avg').textContent   = '$' + avg;
    document.getElementById('val-calls').textContent = calls;
    document.getElementById('val-sms').textContent   = sms;
    document.getElementById('lbl-txns').textContent  = txns + ' transaction' + (txns !== 1 ? 's' : '');
    document.getElementById('lbl-avg').textContent   = '$' + avg + ' per transaction';

    // Plan fee
    var planData  = PLAN_PRICES[selectedPlan];
    var planAmt   = planData.cents / 100;
    document.getElementById('r-plan-name').textContent = planData.name;
    document.getElementById('r-plan').textContent = fmt(planAmt);

    // Calculations
    var stripeAmt  = txns * (avg * 0.027 + 0.05);
    var certxaAmt  = txns * 0.60;
    var autumnAmt  = calls * 0.25;
    var smsAmt     = sms  * 0.026;
    var total      = planAmt + stripeAmt + certxaAmt + autumnAmt + smsAmt;

    // Wallet usage = Autumn + SMS overage
    var walletNeeded = autumnAmt + smsAmt;

    // Update results
    document.getElementById('r-stripe').textContent = fmt(stripeAmt);
    document.getElementById('r-certxa').textContent = fmt(certxaAmt);

    var autumnEl = document.getElementById('r-autumn');
    autumnEl.textContent = fmt(autumnAmt);
    autumnEl.className   = 'est-line-amt' + (autumnAmt === 0 ? ' zero' : '');

    var smsEl = document.getElementById('r-sms');
    smsEl.textContent = fmt(smsAmt);
    smsEl.className   = 'est-line-amt' + (smsAmt === 0 ? ' zero' : '');

    document.getElementById('r-total').textContent = fmt(total);

    // Wallet suggestion - round up to nearest $5 with a small buffer
    var ws = document.getElementById('wallet-suggest');
    if (walletNeeded === 0) {
      ws.style.display = 'none';
    } else {
      var suggestedTopup = Math.ceil((walletNeeded * 1.15) / 5) * 5;
      ws.innerHTML = '💡 <strong>Wallet suggestion:</strong> At this volume, topping up by <strong>$' + suggestedTopup + '/month</strong> (or setting auto-refill to that amount) keeps Autumn and SMS running without interruption.';
      ws.style.display = '';
    }
  }

  [slTxns, slAvg, slCalls, slSms].forEach(function(el) {
    el.addEventListener('input', update);
    // Style slider track fill dynamically
    el.addEventListener('input', function() {
      var min = +el.min, max = +el.max, val = +el.value;
      var pct = ((val - min) / (max - min)) * 100;
      el.style.background = 'linear-gradient(to right, var(--plum) 0%, var(--plum) ' + pct + '%, var(--light-grey) ' + pct + '%, var(--light-grey) 100%)';
    });
    var min = +el.min, max = +el.max, val = +el.value;
    var pct = ((val - min) / (max - min)) * 100;
    el.style.background = 'linear-gradient(to right, var(--plum) 0%, var(--plum) ' + pct + '%, var(--light-grey) ' + pct + '%, var(--light-grey) 100%)';
  });

  update();
})();
</script>

<!-- ═══ FAQ ═══════════════════════════════════════════════ -->
<section class="pay-section pay-section-alt" id="faq-billing">
  <div class="container" style="max-width:720px;">
    <div class="section-header">
      <span class="tag tag-plum">FAQ</span>
      <h2 class="section-title">Billing questions, answered</h2>
    </div>
    <div class="accordion">
      <div class="accordion-item">
        <button class="accordion-btn">Does Certxa take a percentage of my card sales? <span class="accordion-icon">+</span></button>
        <div class="accordion-body">No. Certxa does not take any percentage of your card sales. All processing fees go directly to Stripe at their standard rates. Our only payment-related charge is a flat <strong>$0.60 connection fee per transaction</strong> — that covers the cost of the Stripe Connect integration we maintain for you.</div>
      </div>
      <div class="accordion-item">
        <button class="accordion-btn">Do I buy the card reader from Certxa? <span class="accordion-icon">+</span></button>
        <div class="accordion-body">No — the Stripe M2 card reader is purchased directly from <a href="https://stripe.com/terminal" target="_blank" rel="noopener" style="color:var(--plum);font-weight:600;">Stripe Terminal</a>. Certxa connects to your Stripe account, so the reader talks to Stripe directly — not through us. You own the hardware outright and it stays with you even if you ever change platforms.</div>
      </div>
      <div class="accordion-item">
        <button class="accordion-btn">What is the Platform Wallet and how is it different from my subscription? <span class="accordion-icon">+</span></button>
        <div class="accordion-body">Your subscription covers your core platform access: booking, calendars, CRM, website builder, and your monthly SMS allowance. The Platform Wallet is a <strong>separate prepaid balance</strong> used for pay-as-you-go extras — Autumn AI Receptionist calls, overflow SMS when your allowance runs out, AI phone number provisioning, and future usage-based features. You only need to add funds if you use those extras.</div>
      </div>
      <div class="accordion-item">
        <button class="accordion-btn">What happens if my Wallet runs out during an Autumn call? <span class="accordion-icon">+</span></button>
        <div class="accordion-body">Autumn completes any in-progress call even if it takes the balance slightly negative (up to -$10.00 grace). New calls will be blocked until you top up. Enable <strong>Auto-Refill</strong> and this will never happen — the system automatically tops up the moment the balance drops below your set threshold.</div>
      </div>
      <div class="accordion-item">
        <button class="accordion-btn">What happens to unused SMS when my billing period resets? <span class="accordion-icon">+</span></button>
        <div class="accordion-body">Your plan's monthly SMS allowance resets each billing period — unused messages don't carry over. On the Professional and Elite plans, SMS is unlimited so this doesn't apply. On the Solo plan, you get 200 SMS/month; if you go over, additional messages are billed at <strong>$0.026 per SMS</strong> from your Platform Wallet.</div>
      </div>
      <div class="accordion-item">
        <button class="accordion-btn">Is there a minimum amount I need to add to the Wallet? <span class="accordion-icon">+</span></button>
        <div class="accordion-body">No minimum. Add any amount via Stripe Checkout from your dashboard. A good rule of thumb: if Autumn handles around 100 calls a month, a $50–$75 top-up gives you comfortable runway. With Auto-Refill on, you set the threshold once and never think about it again.</div>
      </div>
    </div>
  </div>
</section>

<!-- CTA -->
<section class="cta-section">
  <div class="container" style="position:relative;z-index:1;text-align:center;">
    <span class="tag" style="background:rgba(255,255,255,.15);color:#fff;margin-bottom:16px;display:inline-block;">Ready to start?</span>
    <h2 class="cta-title">No surprises on day one.<br><em>Or any day after.</em></h2>
    <p class="cta-text">Start your free <?= TRIAL_DAYS ?>-day trial — a credit card is required to subscribe, but you won't be charged until the trial ends. Connect Stripe and pick up the M2 reader whenever you're ready to take in-person payments.</p>
    <div class="cta-actions">
      <a href="/auth?mode=register" class="btn btn-gold" style="font-size:1rem;padding:16px 40px;">Start Free Trial</a>
      <a href="/salonos" class="btn btn-outline-white">Explore All Features</a>
    </div>
    <p class="cta-note">Questions? Chat with our team — typical response time under 5 minutes.</p>
  </div>
</section>

<?php require __DIR__ . '/../includes/footer.php'; ?>
