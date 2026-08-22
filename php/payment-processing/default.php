<?php
define('BRAND_NAME',    'Certxa');
define('PAGE_TITLE',    'Nail Salon Payment Processing | Certxa');
define('PAGE_DESC',     'Nail salon POS and payment processing powered by Stripe. Take card, chip, contactless, Apple Pay, and Google Pay payments through the Stripe M2 reader inside Certxa.');
define('PAGE_KEYWORDS', 'nail salon payment processing, stripe for nail salons, nail salon card reader, nail salon POS system, stripe M2 reader, nail salon point of sale, certxa payments, nail salon credit card processing, tap to pay nail salon');
define('PAGE_CANONICAL','https://certxa.com/payment-processing');
define('PAGE_BREADCRUMBS', json_encode([
  ['name'=>'Home','url'=>'https://certxa.com/'],
  ['name'=>'Payment Processing','url'=>'https://certxa.com/payment-processing'],
]));
define('PAGE_SCHEMA', json_encode([
  [
    '@type'      => 'FAQPage',
    'mainEntity' => [
      ['@type'=>'Question','name'=>'Does Certxa support Stripe payments?','acceptedAnswer'=>['@type'=>'Answer','text'=>'Certxa provides a Stripe-powered payment workflow for salons. Review the current connection and payout details during setup before taking live payments.']],
      ['@type'=>'Question','name'=>'What is the Stripe M2 card reader?','acceptedAnswer'=>['@type'=>'Answer','text'=>'The Stripe M2 is a compact, wireless Bluetooth card reader that accepts chip, swipe, and contactless (NFC) payments including Apple Pay and Google Pay. It pairs directly with the Certxa app on your phone or tablet, so you can take payments anywhere in the salon — at the chair, the front desk, or on the go.']],
      ['@type'=>'Question','name'=>'Where do I buy the Stripe M2 reader?','acceptedAnswer'=>['@type'=>'Answer','text'=>'You purchase the Stripe M2 reader directly from Stripe\'s hardware store at stripe.com/terminal. Once you have the reader, simply pair it with your Certxa account through the Payment Settings page and you\'re ready to take payments instantly.']],
      ['@type'=>'Question','name'=>'What are the payment processing fees?','acceptedAnswer'=>['@type'=>'Answer','text'=>'Payment processing fees depend on the Stripe account and payment method used. Review the current Certxa and Stripe pricing details before enabling payments for your salon.']],
      ['@type'=>'Question','name'=>'Does Certxa support contactless and tap payments?','acceptedAnswer'=>['@type'=>'Answer','text'=>'Yes — through the Stripe M2 reader, Certxa supports all major contactless payment methods: Apple Pay, Google Pay, Samsung Pay, and any NFC-enabled debit or credit card. Clients simply tap their phone or card and the payment is processed in seconds.']],
      ['@type'=>'Question','name'=>'Is my payment data secure?','acceptedAnswer'=>['@type'=>'Answer','text'=>'Payment details are handled through the configured payment provider. Review the current security and data-handling information before enabling payments for your salon.']],
    ],
  ],
  [
    '@type'       => 'SoftwareApplication',
    'name'        => 'Certxa Built-In POS — Powered by Stripe',
    'applicationCategory' => 'BusinessApplication',
    'operatingSystem' => 'Web, iOS, Android',
    'description' => 'Certxa\'s built-in point of sale for nail salons, powered by Stripe. Accept chip, swipe, tap, Apple Pay, and Google Pay through the Stripe M2 card reader — no third-party POS app needed.',
      'offers'      => ['@type'=>'Offer','price'=>'0','priceCurrency'=>'USD','description'=>TRIAL_DAYS . '-day free trial. Credit card required · No charge until trial ends.'],
  ],
]));
require __DIR__ . '/../includes/header.php';
require __DIR__ . '/../includes/nav.php';
?>

<style>
@import url('https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@400;500;600;700;800&display=swap');

.sp-page { background: #f8f7ff; }
.sp-container { max-width: 1120px; margin: 0 auto; padding: 0 28px; }

.sp-label {
  display: inline-flex; align-items: center; gap: 8px;
  background: rgba(99,91,255,.1); border: 1px solid rgba(99,91,255,.22);
  border-radius: 50px; padding: 6px 18px; margin-bottom: 20px;
  font-size: .7rem; font-weight: 700; color: #6356f5;
  letter-spacing: .1em; text-transform: uppercase;
}

/* ═══════════════════════════════════════════════
   HERO
═══════════════════════════════════════════════ */
.sp-hero {
  background: linear-gradient(155deg, #08001a 0%, #12003a 45%, #06001a 100%);
  padding: 100px 0 90px;
  position: relative;
  overflow: hidden;
}
.sp-hero::before {
  content: '';
  position: absolute; top: -200px; left: 50%;
  transform: translateX(-50%);
  width: 900px; height: 900px;
  background: radial-gradient(circle, rgba(99,91,255,.18) 0%, transparent 65%);
  pointer-events: none;
}
.sp-hero::after {
  content: '';
  position: absolute; bottom: -120px; right: -60px;
  width: 500px; height: 500px;
  background: radial-gradient(circle, rgba(99,255,206,.06) 0%, transparent 65%);
  pointer-events: none;
}
.sp-hero-inner {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 56px;
  align-items: center;
  position: relative; z-index: 1;
}
@media (max-width: 900px) {
  .sp-hero-inner { grid-template-columns: 1fr; }
  .sp-device-wrap { display: flex; justify-content: center; }
}

.sp-partner-badge {
  display: inline-flex; align-items: center; gap: 10px;
  background: rgba(255,255,255,.05); border: 1px solid rgba(255,255,255,.12);
  border-radius: 50px; padding: 8px 20px; margin-bottom: 28px;
  font-size: .72rem; font-weight: 600; color: rgba(255,255,255,.7);
  letter-spacing: .06em; text-transform: uppercase;
}
.sp-partner-stripe { font-weight: 800; color: #635bff; font-size: .8rem; letter-spacing: 0; text-transform: none; }
.sp-partner-dot {
  width: 6px; height: 6px; border-radius: 50%;
  background: #635bff;
  box-shadow: 0 0 8px rgba(99,91,255,.8);
  animation: sp-dot-pulse 2s ease-in-out infinite;
}
@keyframes sp-dot-pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50%       { opacity: .5; transform: scale(.8); }
}

.sp-headline {
  font-family: 'Instrument Sans', sans-serif;
  font-size: clamp(2.2rem, 4.5vw, 4rem);
  font-weight: 800; line-height: 1.08; letter-spacing: -.04em;
  color: #fff; margin-bottom: 22px;
}
.sp-headline em { font-style: normal; color: #635bff; }
.sp-sub {
  font-size: clamp(.92rem, 1.5vw, 1.08rem);
  color: rgba(255,255,255,.62); max-width: 480px;
  line-height: 1.78; margin-bottom: 38px;
}
.sp-hero-btns { display: flex; gap: 14px; flex-wrap: wrap; margin-bottom: 44px; }
.sp-btn-primary {
  display: inline-block; padding: 14px 32px; border-radius: 50px;
  background: linear-gradient(135deg, #635bff, #4f46e5);
  color: #fff; font-weight: 700; font-size: .95rem; text-decoration: none;
  box-shadow: 0 6px 24px rgba(99,91,255,.5);
  transition: transform .15s, box-shadow .15s;
}
.sp-btn-primary:hover { transform: translateY(-2px); box-shadow: 0 10px 32px rgba(99,91,255,.7); }
.sp-btn-outline {
  display: inline-block; padding: 14px 28px; border-radius: 50px;
  border: 1.5px solid rgba(255,255,255,.25); color: rgba(255,255,255,.85);
  font-weight: 600; font-size: .95rem; text-decoration: none;
  transition: background .15s, border-color .15s;
}
.sp-btn-outline:hover { background: rgba(255,255,255,.07); border-color: rgba(255,255,255,.45); }

.sp-hero-stats { display: flex; gap: 32px; flex-wrap: wrap; }
.sp-stat-val {
  font-family: 'Instrument Sans', sans-serif;
  font-size: 1.4rem; font-weight: 800; color: #fff; line-height: 1; margin-bottom: 4px;
}
.sp-stat-label { font-size: .7rem; color: rgba(255,255,255,.45); font-weight: 500; }

/* ═══════════════════════════════════════════════
   STRIPE M2 — Hero Device (small)
═══════════════════════════════════════════════ */
.sp-device-wrap {
  display: flex; align-items: center; justify-content: center;
  perspective: 1200px; padding: 20px 0;
}
.sp-device-scene {
  position: relative;
  display: flex; align-items: flex-end; gap: 36px;
  transform: rotateY(-8deg) rotateX(4deg);
  animation: sp-device-float 7s ease-in-out infinite;
}
@keyframes sp-device-float {
  0%, 100% { transform: rotateY(-8deg) rotateX(4deg) translateY(0); }
  50%       { transform: rotateY(-8deg) rotateX(4deg) translateY(-12px); }
}

/* M2 body */
.sp-m2 {
  width: 88px; height: 148px;
  background: linear-gradient(175deg, #f0f0f0 0%, #e0dfe0 40%, #d4d3d4 100%);
  border-radius: 18px;
  position: relative;
  box-shadow:
    0 0 0 1.5px rgba(0,0,0,.14),
    4px 8px 28px rgba(0,0,0,.35),
    0 2px 6px rgba(0,0,0,.2),
    inset 0 1px 0 rgba(255,255,255,.9);
  display: flex; flex-direction: column; align-items: center;
}
.sp-m2-slot {
  width: 58px; height: 6px;
  background: #1a1a1a; border-radius: 3px; margin-top: 16px;
  box-shadow: inset 0 2px 4px rgba(0,0,0,.6), 0 1px 0 rgba(255,255,255,.3);
}
.sp-m2-logo-area { margin-top: 18px; display: flex; flex-direction: column; align-items: center; gap: 5px; }
.sp-m2-wordmark { font-family: 'Instrument Sans', sans-serif; font-size: .55rem; font-weight: 800; letter-spacing: .12em; text-transform: uppercase; color: #635bff; }
.sp-m2-sub-text { font-size: .38rem; font-weight: 600; color: #999; letter-spacing: .08em; text-transform: uppercase; }
.sp-m2-nfc { margin-top: 16px; width: 30px; height: 30px; position: relative; display: flex; align-items: center; justify-content: center; }
.sp-m2-nfc-arc {
  position: absolute; border: 2px solid #635bff; border-radius: 50%; opacity: 0;
  animation: sp-nfc-ping 2.4s ease-out infinite;
}
.sp-m2-nfc-arc:nth-child(1) { width: 10px; height: 10px; animation-delay: 0s; }
.sp-m2-nfc-arc:nth-child(2) { width: 18px; height: 18px; animation-delay: .3s; }
.sp-m2-nfc-arc:nth-child(3) { width: 26px; height: 26px; animation-delay: .6s; }
@keyframes sp-nfc-ping {
  0%   { opacity: .9; transform: scale(.6); }
  100% { opacity: 0;  transform: scale(1.1); }
}
.sp-m2-led {
  margin-top: 14px; width: 8px; height: 8px; border-radius: 50%;
  background: #00d4aa;
  box-shadow: 0 0 10px rgba(0,212,170,.8), 0 0 20px rgba(0,212,170,.4);
  animation: sp-led-blink 3s ease-in-out infinite;
}
@keyframes sp-led-blink { 0%, 90%, 100% { opacity: 1; } 95% { opacity: .2; } }
.sp-m2::after {
  content: '';
  position: absolute; bottom: 10px; left: 50%; transform: translateX(-50%);
  width: 20px; height: 5px; background: #bbb; border-radius: 3px;
  box-shadow: inset 0 1px 2px rgba(0,0,0,.3), 0 1px 0 rgba(255,255,255,.5);
}
.sp-m2-side-btn {
  position: absolute; right: -4px; top: 36px;
  width: 5px; height: 22px;
  background: linear-gradient(180deg, #c8c8c8, #b0b0b0);
  border-radius: 0 3px 3px 0;
  box-shadow: 2px 2px 4px rgba(0,0,0,.2);
}

/* Credit card tap animation */
.sp-tap-card {
  width: 62px; height: 40px;
  background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%);
  border-radius: 6px;
  position: absolute; top: -24px; right: -36px;
  box-shadow: 0 4px 16px rgba(0,0,0,.4), inset 0 1px 0 rgba(255,255,255,.1);
  transform: rotate(14deg);
  animation: sp-card-tap 3.5s ease-in-out infinite;
}
@keyframes sp-card-tap {
  0%, 60%, 100% { transform: rotate(14deg) translateY(0); opacity: 1; }
  30%           { transform: rotate(14deg) translateY(-8px); opacity: .7; }
}
.sp-tap-card::before {
  content: '';
  position: absolute; top: 10px; left: 8px;
  width: 24px; height: 18px;
  background: linear-gradient(135deg, #d4a017, #f5c842);
  border-radius: 3px;
}

/* Phone beside reader */
.sp-phone {
  width: 68px; height: 120px;
  background: linear-gradient(175deg, #1c1c1e 0%, #2c2c2e 100%);
  border-radius: 16px;
  position: relative;
  box-shadow: 0 0 0 1.5px rgba(255,255,255,.1), 4px 8px 28px rgba(0,0,0,.5);
  display: flex; flex-direction: column; align-items: center;
  padding: 10px 6px 6px; overflow: hidden;
}
.sp-phone::before {
  content: '';
  position: absolute; top: 5px; left: 50%; transform: translateX(-50%);
  width: 20px; height: 3px; background: #333; border-radius: 2px;
}
.sp-phone-screen {
  width: 100%; flex: 1;
  background: linear-gradient(160deg, #0d0025 0%, #1a0045 100%);
  border-radius: 10px;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 4px; overflow: hidden; position: relative;
}
.sp-phone-amount { font-family: 'Instrument Sans', sans-serif; font-size: .85rem; font-weight: 800; color: #fff; position: relative; z-index: 1; }
.sp-phone-label  { font-size: .34rem; color: rgba(255,255,255,.5); text-transform: uppercase; letter-spacing: .08em; position: relative; z-index: 1; }
.sp-phone-check {
  width: 22px; height: 22px; border-radius: 50%;
  background: linear-gradient(135deg, #00d4aa, #635bff);
  display: flex; align-items: center; justify-content: center;
  margin-top: 4px; position: relative; z-index: 1;
  animation: sp-check-pop 3.5s ease-in-out infinite;
}
@keyframes sp-check-pop { 0%, 40%, 100% { transform: scale(1); } 20% { transform: scale(1.15); } }
.sp-phone-check svg { width: 12px; height: 12px; stroke: #fff; stroke-width: 2.5; fill: none; }
.sp-phone-paid { font-size: .3rem; color: #00d4aa; font-weight: 700; text-transform: uppercase; letter-spacing: .1em; position: relative; z-index: 1; }

.sp-device-glow {
  position: absolute; bottom: -30px; left: 50%; transform: translateX(-50%);
  width: 260px; height: 40px;
  background: radial-gradient(ellipse, rgba(99,91,255,.35) 0%, transparent 70%);
  filter: blur(12px);
}
.sp-floating-chip {
  position: absolute;
  background: rgba(255,255,255,.06); border: 1px solid rgba(255,255,255,.12);
  border-radius: 50px; padding: 5px 12px;
  font-size: .58rem; font-weight: 700; color: rgba(255,255,255,.75);
  white-space: nowrap; backdrop-filter: blur(8px);
}
.sp-chip-1 { top: -10px; left: -60px; animation: sp-chip-float 5s 0s ease-in-out infinite; }
.sp-chip-2 { top: 30px; right: -70px; animation: sp-chip-float 5s .8s ease-in-out infinite; }
.sp-chip-3 { bottom: 20px; left: -65px; animation: sp-chip-float 5s 1.5s ease-in-out infinite; }
@keyframes sp-chip-float { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-6px); } }

/* ═══════════════════════════════════════════════
   TRUST BAR
═══════════════════════════════════════════════ */
.sp-trust {
  background: #fff; border-bottom: 1px solid #ede9fe; padding: 20px 0;
}
.sp-trust-inner {
  display: flex; align-items: center; justify-content: center;
  gap: 40px; flex-wrap: wrap;
}
.sp-trust-item { display: flex; align-items: center; gap: 10px; font-size: .78rem; font-weight: 600; color: #6b7280; }
.sp-trust-icon {
  width: 32px; height: 32px; background: #f5f3ff; border-radius: 8px;
  display: flex; align-items: center; justify-content: center;
}
.sp-trust-icon svg { width: 16px; height: 16px; }

/* ═══════════════════════════════════════════════
   HOW IT WORKS
═══════════════════════════════════════════════ */
.sp-how { padding: 88px 0; background: #f8f7ff; }
.sp-section-head { text-align: center; margin-bottom: 60px; }
.sp-section-title {
  font-family: 'Instrument Sans', sans-serif;
  font-size: clamp(1.8rem, 3.5vw, 3rem);
  font-weight: 800; letter-spacing: -.03em;
  color: #0f0a24; margin-bottom: 14px;
}
.sp-section-title em { font-style: normal; color: #635bff; }
.sp-section-sub { font-size: 1.02rem; color: #6b7280; max-width: 520px; margin: 0 auto; line-height: 1.7; }

.sp-steps { display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; }
@media (max-width: 780px) { .sp-steps { grid-template-columns: 1fr; } }

.sp-step {
  background: #fff; border: 1px solid #ede9fe; border-radius: 20px;
  padding: 36px 32px; position: relative;
  transition: transform .2s, box-shadow .2s;
}
.sp-step:hover { transform: translateY(-4px); box-shadow: 0 16px 48px rgba(99,91,255,.1); }
.sp-step-num {
  font-family: 'Instrument Sans', sans-serif;
  font-size: 3.5rem; font-weight: 800; letter-spacing: -.06em;
  color: rgba(99,91,255,.08); line-height: 1;
  position: absolute; top: 20px; right: 24px;
}
.sp-step-icon {
  width: 52px; height: 52px;
  background: linear-gradient(135deg, #635bff, #4f46e5);
  border-radius: 14px;
  display: flex; align-items: center; justify-content: center;
  margin-bottom: 20px;
  box-shadow: 0 8px 20px rgba(99,91,255,.3);
}
.sp-step-icon svg { width: 24px; height: 24px; stroke: #fff; fill: none; stroke-width: 2; }
.sp-step h3 { font-family: 'Instrument Sans', sans-serif; font-size: 1.1rem; font-weight: 800; letter-spacing: -.02em; color: #0f0a24; margin-bottom: 10px; }
.sp-step p { font-size: .88rem; color: #6b7280; line-height: 1.7; margin: 0; }

/* ═══════════════════════════════════════════════
   M2 SPOTLIGHT
═══════════════════════════════════════════════ */
.sp-m2-section {
  background: linear-gradient(155deg, #08001a 0%, #100030 50%, #06001a 100%);
  padding: 96px 0; position: relative; overflow: hidden;
}
.sp-m2-section::before {
  content: ''; position: absolute; top: -100px; right: -100px;
  width: 600px; height: 600px;
  background: radial-gradient(circle, rgba(99,91,255,.15) 0%, transparent 65%);
  pointer-events: none;
}
.sp-m2-section::after {
  content: ''; position: absolute; bottom: -80px; left: -80px;
  width: 400px; height: 400px;
  background: radial-gradient(circle, rgba(0,212,170,.08) 0%, transparent 65%);
  pointer-events: none;
}
.sp-m2-grid {
  display: grid; grid-template-columns: 1fr 1fr; gap: 72px;
  align-items: center; position: relative; z-index: 1;
}
@media (max-width: 900px) {
  .sp-m2-grid { grid-template-columns: 1fr; }
  .sp-m2-device-col { display: flex; justify-content: center; }
}
.sp-m2-copy .sp-label { background: rgba(99,91,255,.15); border-color: rgba(99,91,255,.3); color: #a5a0ff; }
.sp-m2-copy h2 {
  font-family: 'Instrument Sans', sans-serif;
  font-size: clamp(1.9rem, 3.5vw, 2.9rem);
  font-weight: 800; letter-spacing: -.04em; line-height: 1.1;
  color: #fff; margin-bottom: 18px;
}
.sp-m2-copy h2 em { font-style: normal; color: #635bff; }
.sp-m2-copy p { font-size: 1rem; color: rgba(255,255,255,.62); line-height: 1.78; margin-bottom: 28px; }

.sp-m2-specs { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-bottom: 36px; }
.sp-m2-spec {
  background: rgba(255,255,255,.04); border: 1px solid rgba(255,255,255,.08);
  border-radius: 12px; padding: 16px;
}
.sp-m2-spec-icon { font-size: 1.2rem; margin-bottom: 6px; }
.sp-m2-spec-title { font-size: .75rem; font-weight: 700; color: #fff; margin-bottom: 3px; }
.sp-m2-spec-desc  { font-size: .7rem; color: rgba(255,255,255,.45); line-height: 1.5; }

.sp-m2-cta {
  display: inline-flex; align-items: center; gap: 10px;
  padding: 14px 30px; border-radius: 50px;
  background: #635bff; color: #fff; font-weight: 700; font-size: .95rem; text-decoration: none;
  box-shadow: 0 6px 24px rgba(99,91,255,.5);
  transition: transform .15s, box-shadow .15s;
}
.sp-m2-cta:hover { transform: translateY(-2px); box-shadow: 0 10px 32px rgba(99,91,255,.7); }
.sp-m2-cta svg { width: 18px; height: 18px; stroke: currentColor; fill: none; stroke-width: 2; }

/* Large M2 CSS illustration */
.sp-m2-large {
  display: flex; align-items: center; justify-content: center;
  perspective: 1400px;
}
.sp-m2-large-scene {
  position: relative;
  transform: rotateY(8deg) rotateX(-3deg);
  animation: sp-large-float 8s ease-in-out infinite;
}
@keyframes sp-large-float {
  0%, 100% { transform: rotateY(8deg) rotateX(-3deg) translateY(0); }
  50%       { transform: rotateY(8deg) rotateX(-3deg) translateY(-14px); }
}

.sp-m2-xl {
  width: 140px; height: 236px;
  background: linear-gradient(175deg, #f5f5f5 0%, #e8e8e8 35%, #d8d8d8 70%, #ccc 100%);
  border-radius: 28px; position: relative;
  box-shadow:
    0 0 0 2px rgba(0,0,0,.12),
    0 0 0 3px rgba(255,255,255,.6),
    8px 24px 64px rgba(0,0,0,.5),
    0 4px 12px rgba(0,0,0,.3),
    inset 0 1px 0 rgba(255,255,255,.95);
  display: flex; flex-direction: column; align-items: center;
}
.sp-m2-xl::before {
  content: '';
  position: absolute; top: 0; left: 0; right: 0; bottom: 0;
  background: linear-gradient(130deg, rgba(255,255,255,.3) 0%, transparent 50%);
  border-radius: 28px; pointer-events: none;
}
.sp-m2-xl::after {
  content: '';
  position: absolute; bottom: 14px; left: 50%; transform: translateX(-50%);
  width: 30px; height: 7px; background: #c0c0c0; border-radius: 4px;
  box-shadow: inset 0 2px 3px rgba(0,0,0,.25), 0 1px 0 rgba(255,255,255,.6);
}

.sp-m2-xl-slot {
  width: 90px; height: 10px; background: #111; border-radius: 5px; margin-top: 26px;
  box-shadow: inset 0 3px 6px rgba(0,0,0,.7), 0 1.5px 0 rgba(255,255,255,.4);
  position: relative;
}
.sp-m2-xl-slot::after {
  content: 'INSERT CARD';
  position: absolute; bottom: -14px; left: 50%; transform: translateX(-50%);
  font-size: .3rem; font-weight: 700; letter-spacing: .15em; color: #999; white-space: nowrap;
}
.sp-m2-xl-logo { margin-top: 28px; display: flex; flex-direction: column; align-items: center; gap: 5px; }
.sp-m2-xl-wordmark { font-family: 'Instrument Sans', sans-serif; font-size: .85rem; font-weight: 800; letter-spacing: .12em; text-transform: uppercase; color: #635bff; }
.sp-m2-xl-sub { font-size: .52rem; font-weight: 600; letter-spacing: .1em; text-transform: uppercase; color: #aaa; }

.sp-m2-xl-nfc { margin-top: 26px; width: 48px; height: 48px; position: relative; display: flex; align-items: center; justify-content: center; }
.sp-m2-xl-arc { position: absolute; border: 2.5px solid #635bff; border-radius: 50%; opacity: 0; animation: sp-nfc-ping 2.4s ease-out infinite; }
.sp-m2-xl-arc:nth-child(1) { width: 14px; height: 14px; animation-delay: 0s; }
.sp-m2-xl-arc:nth-child(2) { width: 26px; height: 26px; animation-delay: .35s; }
.sp-m2-xl-arc:nth-child(3) { width: 38px; height: 38px; animation-delay: .7s; }
.sp-m2-xl-arc:nth-child(4) { width: 48px; height: 48px; animation-delay: 1.05s; }

.sp-m2-xl-leds { display: flex; gap: 6px; margin-top: 22px; }
.sp-m2-xl-led { width: 8px; height: 8px; border-radius: 50%; background: #ddd; }
.sp-m2-xl-led.on { background: #00d4aa; box-shadow: 0 0 10px rgba(0,212,170,.8); animation: sp-led-blink 3s ease-in-out infinite; }
.sp-m2-xl-led.on-2 { background: #635bff; box-shadow: 0 0 10px rgba(99,91,255,.8); animation: sp-led-blink 3s .4s ease-in-out infinite; }

.sp-m2-xl-side {
  position: absolute; right: -6px; top: 55px;
  width: 7px; height: 35px;
  background: linear-gradient(180deg, #ccc, #bbb);
  border-radius: 0 4px 4px 0;
  box-shadow: 3px 2px 6px rgba(0,0,0,.25), inset -1px 0 0 rgba(255,255,255,.5);
}

.sp-accept-badge {
  position: absolute;
  background: rgba(255,255,255,.06); border: 1px solid rgba(255,255,255,.12);
  border-radius: 10px; padding: 8px 14px;
  display: flex; align-items: center; gap: 6px;
  font-size: .62rem; font-weight: 700; color: rgba(255,255,255,.8);
  backdrop-filter: blur(6px); white-space: nowrap;
}
.sp-accept-badge-dot { width: 6px; height: 6px; border-radius: 50%; background: #00d4aa; box-shadow: 0 0 8px rgba(0,212,170,.8); }
.sp-badge-1 { top: 0; right: -120px;   animation: sp-chip-float 5s 0s   ease-in-out infinite; }
.sp-badge-2 { top: 70px; right: -130px; animation: sp-chip-float 5s .7s  ease-in-out infinite; }
.sp-badge-3 { bottom: 60px; right: -110px; animation: sp-chip-float 5s 1.3s ease-in-out infinite; }
.sp-badge-4 { bottom: 10px; left: -130px; animation: sp-chip-float 5s .4s  ease-in-out infinite; }

.sp-m2-xl-glow {
  position: absolute; bottom: -40px; left: 50%; transform: translateX(-50%);
  width: 200px; height: 60px;
  background: radial-gradient(ellipse, rgba(99,91,255,.4) 0%, transparent 70%);
  filter: blur(16px);
}

/* ═══════════════════════════════════════════════
   FEATURES
═══════════════════════════════════════════════ */
.sp-features { padding: 88px 0; background: #fff; }
.sp-feat-grid {
  display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; margin-top: 56px;
}
@media (max-width: 900px) { .sp-feat-grid { grid-template-columns: repeat(2, 1fr); } }
@media (max-width: 580px) { .sp-feat-grid { grid-template-columns: 1fr; } }

.sp-feat {
  background: #f8f7ff; border: 1px solid #ede9fe; border-radius: 18px; padding: 30px 26px;
  transition: transform .2s, box-shadow .2s;
}
.sp-feat:hover { transform: translateY(-3px); box-shadow: 0 12px 36px rgba(99,91,255,.08); }
.sp-feat-icon {
  width: 46px; height: 46px;
  background: linear-gradient(135deg, #635bff, #4f46e5);
  border-radius: 12px;
  display: flex; align-items: center; justify-content: center;
  margin-bottom: 16px;
  box-shadow: 0 6px 16px rgba(99,91,255,.28);
}
.sp-feat-icon svg { width: 22px; height: 22px; stroke: #fff; fill: none; stroke-width: 2; }
.sp-feat h3 { font-family: 'Instrument Sans', sans-serif; font-size: 1rem; font-weight: 800; letter-spacing: -.02em; color: #0f0a24; margin-bottom: 8px; }
.sp-feat p  { font-size: .84rem; color: #6b7280; line-height: 1.65; margin: 0; }

/* ═══════════════════════════════════════════════
   FEE CALLOUT
═══════════════════════════════════════════════ */
.sp-fee { padding: 0 0 80px; background: #fff; }
.sp-fee-card {
  background: linear-gradient(135deg, #0f0a24 0%, #1a1040 100%);
  border-radius: 28px; padding: 56px 64px;
  display: flex; align-items: center; gap: 48px; flex-wrap: wrap;
}
@media (max-width: 700px) { .sp-fee-card { padding: 40px 32px; } }
.sp-fee-copy { flex: 1; min-width: 280px; }
.sp-fee-copy .sp-label { background: rgba(99,91,255,.15); border-color: rgba(99,91,255,.3); color: #a5a0ff; }
.sp-fee-copy h2 { font-family: 'Instrument Sans', sans-serif; font-size: 1.9rem; font-weight: 800; letter-spacing: -.03em; color: #fff; margin-bottom: 14px; }
.sp-fee-copy p  { font-size: .92rem; color: rgba(255,255,255,.6); line-height: 1.72; margin: 0; }
.sp-fee-cards { display: flex; gap: 16px; flex-wrap: wrap; }
.sp-fee-pill {
  background: rgba(255,255,255,.04); border: 1px solid rgba(255,255,255,.1);
  border-radius: 16px; padding: 24px 28px; text-align: center; min-width: 140px;
}
.sp-fee-pill-amt { font-family: 'Instrument Sans', sans-serif; font-size: 2rem; font-weight: 800; color: #fff; line-height: 1; margin-bottom: 6px; }
.sp-fee-pill-amt span { font-size: 1.1rem; }
.sp-fee-pill-label { font-size: .68rem; color: rgba(255,255,255,.45); font-weight: 600; letter-spacing: .06em; text-transform: uppercase; }
.sp-fee-pill.highlight { border-color: rgba(99,91,255,.4); background: rgba(99,91,255,.12); }
.sp-fee-pill.highlight .sp-fee-pill-amt { color: #a5a0ff; }

/* ═══════════════════════════════════════════════
   FAQ
═══════════════════════════════════════════════ */
.sp-faq { padding: 88px 0; background: #f8f7ff; }
.sp-faq-list { max-width: 780px; margin: 48px auto 0; display: flex; flex-direction: column; gap: 12px; }
.sp-faq-item {
  background: #fff; border: 1px solid #ede9fe; border-radius: 14px; overflow: hidden;
  transition: box-shadow .2s;
}
.sp-faq-item.open { box-shadow: 0 8px 28px rgba(99,91,255,.1); }
.sp-faq-q {
  width: 100%; display: flex; justify-content: space-between; align-items: center;
  padding: 20px 24px; background: none; border: none; cursor: pointer; text-align: left;
  font-family: 'Instrument Sans', sans-serif; font-size: .95rem; font-weight: 700;
  color: #0f0a24; gap: 16px;
}
.sp-faq-icon {
  width: 26px; height: 26px; border-radius: 50%; flex-shrink: 0;
  background: #f0eeff; color: #635bff; font-size: 1.1rem; font-weight: 800; line-height: 1;
  display: flex; align-items: center; justify-content: center;
  transition: transform .25s, background .2s;
}
.sp-faq-item.open .sp-faq-icon { transform: rotate(45deg); background: #635bff; color: #fff; }
.sp-faq-a {
  max-height: 0; overflow: hidden;
  transition: max-height .3s ease, padding .3s;
  font-size: .88rem; color: #4b5563; line-height: 1.72;
  padding: 0 24px;
}
.sp-faq-item.open .sp-faq-a { max-height: 300px; padding: 0 24px 20px; }

/* ═══════════════════════════════════════════════
   CTA
═══════════════════════════════════════════════ */
.sp-cta {
  background: linear-gradient(155deg, #08001a 0%, #12003a 50%, #06001a 100%);
  padding: 100px 0; text-align: center; position: relative; overflow: hidden;
}
.sp-cta::before {
  content: ''; position: absolute; top: -150px; left: 50%; transform: translateX(-50%);
  width: 700px; height: 700px;
  background: radial-gradient(circle, rgba(99,91,255,.2) 0%, transparent 65%);
  pointer-events: none;
}
.sp-cta-inner { position: relative; z-index: 1; }
.sp-cta h2 { font-family: 'Instrument Sans', sans-serif; font-size: clamp(2rem, 4vw, 3.2rem); font-weight: 800; letter-spacing: -.04em; color: #fff; margin-bottom: 16px; line-height: 1.1; }
.sp-cta h2 em { font-style: normal; color: #635bff; }
.sp-cta p { font-size: 1rem; color: rgba(255,255,255,.58); margin-bottom: 40px; line-height: 1.7; max-width: 480px; margin-left: auto; margin-right: auto; }
.sp-cta-btns { display: flex; gap: 16px; justify-content: center; flex-wrap: wrap; }
.sp-cta-note { margin-top: 28px; font-size: .78rem; color: rgba(255,255,255,.35); }
</style>

<div class="sp-page">

<!-- ══ HERO ══════════════════════════════════════════════════ -->
<section class="sp-hero">
  <div class="sp-container">
    <div class="sp-hero-inner">

      <div class="sp-hero-copy">
        <div class="sp-partner-badge">
          <span class="sp-partner-dot"></span>
          Official Partner&nbsp;&nbsp;<span class="sp-partner-stripe">Stripe</span>
        </div>
        <h1 class="sp-headline">
          Nail salon POS,<br>
          <em>powered by Stripe</em>
        </h1>
        <p class="sp-sub">
          Certxa partners with Stripe — the world's leading payment infrastructure — to give every nail salon a professional, built-in POS. Accept cards, contactless tap, Apple Pay, and Google Pay right inside Certxa. No third-party terminal app. No separate login. Just tap and done.
        </p>
        <div class="sp-hero-btns">
          <a href="/auth?mode=register" class="sp-btn-primary">Start Free Trial →</a>
          <a href="https://stripe.com/terminal/stripe-m2" target="_blank" rel="noopener" class="sp-btn-outline">Buy M2 Reader ↗</a>
        </div>
        <div class="sp-hero-stats">
          <div>
            <div class="sp-stat-val">Stripe</div>
            <div class="sp-stat-label">payment processing workflow</div>
          </div>
          <div>
            <div class="sp-stat-val">POS</div>
            <div class="sp-stat-label">checkout connected to your salon workflow</div>
          </div>
          <div>
            <div class="sp-stat-val">Secure</div>
            <div class="sp-stat-label">provider-managed payment data</div>
          </div>
        </div>
      </div>

      <div class="sp-device-wrap">
        <div class="sp-device-scene">
          <div class="sp-floating-chip sp-chip-1">💳 Chip &amp; Swipe</div>
          <div class="sp-floating-chip sp-chip-2">📲 Tap &amp; NFC</div>
          <div class="sp-floating-chip sp-chip-3">🍎 Apple Pay</div>

          <div class="sp-phone">
            <div class="sp-phone-screen">
              <div class="sp-phone-label">Total</div>
              <div class="sp-phone-amount">$82.00</div>
              <div class="sp-phone-check">
                <svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
              </div>
              <div class="sp-phone-paid">Paid</div>
            </div>
          </div>

          <div class="sp-m2">
            <div class="sp-m2-slot"></div>
            <div class="sp-m2-logo-area">
              <div class="sp-m2-wordmark">Stripe</div>
              <div class="sp-m2-sub-text">M2 Reader</div>
            </div>
            <div class="sp-m2-nfc">
              <div class="sp-m2-nfc-arc"></div>
              <div class="sp-m2-nfc-arc"></div>
              <div class="sp-m2-nfc-arc"></div>
            </div>
            <div class="sp-m2-led"></div>
            <div class="sp-m2-side-btn"></div>
            <div class="sp-tap-card"></div>
          </div>

          <div class="sp-device-glow"></div>
        </div>
      </div>

    </div>
  </div>
</section>

<!-- ══ TRUST BAR ════════════════════════════════════════════ -->
<div class="sp-trust">
  <div class="sp-container">
    <div class="sp-trust-inner">
      <div class="sp-trust-item">
        <div class="sp-trust-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="#635bff" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
        </div>
        PCI DSS Level 1 Certified
      </div>
      <div class="sp-trust-item">
        <div class="sp-trust-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="#635bff" stroke-width="2"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>
        </div>
        All Major Cards Accepted
      </div>
      <div class="sp-trust-item">
        <div class="sp-trust-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="#635bff" stroke-width="2"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>
        </div>
        Funds Direct to Your Account
      </div>
      <div class="sp-trust-item">
        <div class="sp-trust-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="#635bff" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
        </div>
        Instant Payment Notifications
      </div>
      <div class="sp-trust-item">
        <div class="sp-trust-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="#635bff" stroke-width="2"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.81a19.79 19.79 0 01-3.07-8.68A2 2 0 012 .18h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.09 8a16 16 0 006.91 6.91l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z"/></svg>
        </div>
        Stripe Support Included
      </div>
    </div>
  </div>
</div>

<!-- ══ HOW IT WORKS ══════════════════════════════════════════ -->
<section class="sp-how">
  <div class="sp-container">
    <div class="sp-section-head">
      <div class="sp-label">How it works</div>
      <h2 class="sp-section-title">Up and taking payments<br>in <em>under 10 minutes</em></h2>
      <p class="sp-section-sub">Connect your Stripe account, pair your M2 reader, and you're live. No installers, no POS contracts, no hardware rental fees.</p>
    </div>
    <div class="sp-steps">
      <div class="sp-step">
        <div class="sp-step-num">01</div>
        <div class="sp-step-icon">
          <svg viewBox="0 0 24 24"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
        </div>
        <h3>Connect your Stripe account</h3>
        <p>Open Certxa's Payment Settings and click "Connect with Stripe." Stripe's secure OAuth flow takes under 3 minutes — no paperwork, no approvals, no waiting.</p>
      </div>
      <div class="sp-step">
        <div class="sp-step-num">02</div>
        <div class="sp-step-icon">
          <svg viewBox="0 0 24 24"><rect x="5" y="2" width="14" height="20" rx="2"/><line x1="12" y1="18" x2="12.01" y2="18"/></svg>
        </div>
        <h3>Order &amp; pair your M2 reader</h3>
        <p>Purchase the Stripe M2 card reader directly from Stripe's hardware store. Once it arrives, pair it to Certxa via Bluetooth in seconds — right from the Payment Settings page.</p>
      </div>
      <div class="sp-step">
        <div class="sp-step-num">03</div>
        <div class="sp-step-icon">
          <svg viewBox="0 0 24 24"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
        </div>
        <h3>Take payments anywhere</h3>
        <p>Charge clients at checkout, at the styling chair, or anywhere in the shop. Every transaction records automatically in Certxa with instant payout to your Stripe balance.</p>
      </div>
    </div>
  </div>
</section>

<!-- ══ M2 SPOTLIGHT ══════════════════════════════════════════ -->
<section class="sp-m2-section">
  <div class="sp-container">
    <div class="sp-m2-grid">

      <div class="sp-m2-copy">
        <div class="sp-label">Recommended Hardware</div>
        <h2>The <em>Stripe M2</em><br>card reader</h2>
        <p>
          The Stripe M2 is a compact, wireless Bluetooth card reader designed for modern service businesses. Small enough to fit in a pocket, powerful enough to handle every payment type your clients use — chip, swipe, and contactless tap. It pairs with Certxa and your phone or tablet in seconds.
        </p>
        <div class="sp-m2-specs">
          <div class="sp-m2-spec">
            <div class="sp-m2-spec-icon">📶</div>
            <div class="sp-m2-spec-title">Bluetooth Wireless</div>
            <div class="sp-m2-spec-desc">Connects to your phone or tablet wirelessly — no cables at the chair</div>
          </div>
          <div class="sp-m2-spec">
            <div class="sp-m2-spec-icon">📲</div>
            <div class="sp-m2-spec-title">Tap, Chip &amp; Swipe</div>
            <div class="sp-m2-spec-desc">Accepts all card types plus Apple Pay, Google Pay, and Samsung Pay</div>
          </div>
          <div class="sp-m2-spec">
            <div class="sp-m2-spec-icon">🔋</div>
            <div class="sp-m2-spec-title">All-Day Battery</div>
            <div class="sp-m2-spec-desc">Lasts a full day of busy salon use on a single USB-C charge</div>
          </div>
          <div class="sp-m2-spec">
            <div class="sp-m2-spec-icon">🔒</div>
            <div class="sp-m2-spec-title">End-to-End Encryption</div>
            <div class="sp-m2-spec-desc">Payment data encrypted at the reader — never stored in Certxa</div>
          </div>
        </div>
        <a href="https://stripe.com/terminal/stripe-m2" target="_blank" rel="noopener" class="sp-m2-cta">
          <svg viewBox="0 0 24 24"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 002 1.61h9.72a2 2 0 001.95-1.57l1.65-7.43H6"/></svg>
          Buy from Stripe's Hardware Store
          <svg viewBox="0 0 24 24"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
        </a>
      </div>

      <div class="sp-m2-device-col">
        <div class="sp-m2-large">
          <div class="sp-m2-large-scene">

            <div class="sp-accept-badge sp-badge-1"><div class="sp-accept-badge-dot"></div> Apple Pay</div>
            <div class="sp-accept-badge sp-badge-2"><div class="sp-accept-badge-dot"></div> Google Pay</div>
            <div class="sp-accept-badge sp-badge-3"><div class="sp-accept-badge-dot"></div> Contactless NFC</div>
            <div class="sp-accept-badge sp-badge-4"><div class="sp-accept-badge-dot"></div> Chip &amp; Swipe</div>

            <div class="sp-m2-xl">
              <div class="sp-m2-xl-slot"></div>
              <div class="sp-m2-xl-logo">
                <div class="sp-m2-xl-wordmark">Stripe</div>
                <div class="sp-m2-xl-sub">M2 Card Reader</div>
              </div>
              <div class="sp-m2-xl-nfc">
                <div class="sp-m2-xl-arc"></div>
                <div class="sp-m2-xl-arc"></div>
                <div class="sp-m2-xl-arc"></div>
                <div class="sp-m2-xl-arc"></div>
              </div>
              <div class="sp-m2-xl-leds">
                <div class="sp-m2-xl-led on"></div>
                <div class="sp-m2-xl-led on-2"></div>
                <div class="sp-m2-xl-led"></div>
                <div class="sp-m2-xl-led"></div>
              </div>
              <div class="sp-m2-xl-side"></div>
            </div>

            <div class="sp-m2-xl-glow"></div>
          </div>
        </div>
      </div>

    </div>
  </div>
</section>

<!-- ══ FEATURES ══════════════════════════════════════════════ -->
<section class="sp-features">
  <div class="sp-container">
    <div class="sp-section-head">
      <div class="sp-label">Built into Certxa</div>
      <h2 class="sp-section-title">Everything your salon<br>needs to <em>get paid</em></h2>
      <p class="sp-section-sub">The Certxa POS is woven into every part of the platform — from appointments to checkout to reporting — not bolted on as an afterthought.</p>
    </div>
    <div class="sp-feat-grid">
      <div class="sp-feat">
        <div class="sp-feat-icon">
          <svg viewBox="0 0 24 24"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>
        </div>
        <h3>One-tap checkout</h3>
        <p>When an appointment is complete, tap "Check Out" and the total populates automatically — services, add-ons, tip, and tax included. Hand the reader to the client and you're done in two taps.</p>
      </div>
      <div class="sp-feat">
        <div class="sp-feat-icon">
          <svg viewBox="0 0 24 24"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
        </div>
        <h3>Bank-grade security</h3>
        <p>Stripe is PCI DSS Level 1 certified — the highest certification in payments. Card data is encrypted at the reader and never touches Certxa's servers. Your clients are always protected.</p>
      </div>
      <div class="sp-feat">
        <div class="sp-feat-icon">
          <svg viewBox="0 0 24 24"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>
        </div>
        <h3>Direct-to-bank payouts</h3>
        <p>Every payment goes straight to your Stripe account — Certxa never holds your funds. Stripe pays out to your bank on your schedule, as fast as next business day.</p>
      </div>
      <div class="sp-feat">
        <div class="sp-feat-icon">
          <svg viewBox="0 0 24 24"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
        </div>
        <h3>Automatic SMS receipts</h3>
        <p>After every checkout, Certxa sends the client an SMS receipt automatically. No manual emails. No printing paper. Just a clean digital receipt straight to their phone.</p>
      </div>
      <div class="sp-feat">
        <div class="sp-feat-icon">
          <svg viewBox="0 0 24 24"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
        </div>
        <h3>Real-time sales reporting</h3>
        <p>Every transaction syncs instantly to Certxa's reports dashboard. Track daily revenue, top services, staff sales, and tips — all in one place without logging into Stripe separately.</p>
      </div>
      <div class="sp-feat">
        <div class="sp-feat-icon">
          <svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="7"/><polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88"/></svg>
        </div>
        <h3>Loyalty rewards built in</h3>
        <p>Every payment automatically triggers loyalty point calculations. Clients earn points on every visit without you lifting a finger — fully integrated into checkout, no separate loyalty app needed.</p>
      </div>
    </div>
  </div>
</section>

<!-- ══ FEE CALLOUT ═══════════════════════════════════════════ -->
<section class="sp-fee">
  <div class="sp-container">
    <div class="sp-fee-card">
      <div class="sp-fee-copy">
        <div class="sp-label">Transparent Pricing</div>
        <h2>Simple, honest fees.<br>No surprises.</h2>
        <p>Payment costs depend on the configured payment provider, payment method, and your account terms. Review the current pricing details before taking live payments so you understand processing fees, hardware costs, and any applicable platform charges.</p>
      </div>
      <div class="sp-fee-cards">
        <div class="sp-fee-pill highlight">
          <div class="sp-fee-pill-amt"><span>$</span>0.60</div>
          <div class="sp-fee-pill-label">Certxa connection<br>fee per transaction</div>
        </div>
        <div class="sp-fee-pill">
          <div class="sp-fee-pill-amt">+</div>
          <div class="sp-fee-pill-label">Stripe's standard<br>processing rate</div>
        </div>
        <div class="sp-fee-pill">
          <div class="sp-fee-pill-amt">$0</div>
          <div class="sp-fee-pill-label">monthly POS<br>software fee</div>
        </div>
      </div>
    </div>
  </div>
</section>

<!-- ══ FAQ ════════════════════════════════════════════════════ -->
<section class="sp-faq">
  <div class="sp-container">
    <div class="sp-section-head">
      <div class="sp-label">Common Questions</div>
      <h2 class="sp-section-title">Payments, <em>answered</em></h2>
    </div>
    <div class="sp-faq-list">
      <?php
      $faqs = [
        ["Does Certxa support Stripe payments?", "Certxa provides a Stripe-powered payment workflow for salons. Review the current connection and payout details during setup before taking live payments."],
        ["What is the Stripe M2 card reader?", "The Stripe M2 is a compact, wireless Bluetooth card reader that accepts chip, swipe, and contactless (NFC) payments including Apple Pay and Google Pay. It pairs directly with the Certxa app on your phone or tablet, so you can take payments anywhere in the salon — at the chair, front desk, or on the move."],
        ["Where do I buy the Stripe M2 reader?", "You purchase the Stripe M2 reader directly from Stripe's hardware store at stripe.com/terminal. Once it arrives, open Certxa's Payment Settings, tap 'Pair Reader,' and you're ready to take payments in seconds. No technical setup required."],
        ["What are the payment processing fees?", "Payment processing fees depend on the Stripe account and payment method used. Review the current Certxa and Stripe pricing details before enabling payments for your salon."],
        ["Does Certxa support contactless and tap payments?", "Yes — through the Stripe M2 reader, Certxa supports all major contactless payment methods: Apple Pay, Google Pay, Samsung Pay, and any NFC-enabled debit or credit card. Clients simply tap their phone or card and the payment is done in seconds."],
        ["Is my payment data secure?", "Payment details are handled through the configured payment provider. Review the current security and data-handling information before enabling payments for your salon."],
      ];
      foreach ($faqs as $f): ?>
      <div class="sp-faq-item">
        <button class="sp-faq-q">
          <?= htmlspecialchars($f[0]) ?>
          <span class="sp-faq-icon">+</span>
        </button>
        <div class="sp-faq-a"><?= htmlspecialchars($f[1]) ?></div>
      </div>
      <?php endforeach; ?>
    </div>
  </div>
</section>

<!-- ══ CTA ════════════════════════════════════════════════════ -->
<section class="sp-cta">
  <div class="sp-container">
    <div class="sp-cta-inner">
      <div class="sp-label" style="background:rgba(99,91,255,.15);border-color:rgba(99,91,255,.3);color:#a5a0ff;margin-bottom:24px;">Ready to get started?</div>
      <h2>Start accepting payments<br><em>in your salon today.</em></h2>
      <p>Connect Stripe, pair your M2 reader, and take your first payment — all within the same afternoon. Free <?= TRIAL_DAYS ?>-day trial — credit card required to subscribe, no charge until the trial ends.</p>
      <div class="sp-cta-btns">
        <a href="/auth?mode=register" class="sp-btn-primary">Start Free Trial →</a>
        <a href="https://stripe.com/terminal/stripe-m2" target="_blank" rel="noopener" class="sp-btn-outline">Buy the M2 Reader ↗</a>
      </div>
      <div class="sp-cta-note">Credit card required · No charge until trial ends &middot; <?= TRIAL_DAYS ?>-day free trial &middot; Cancel anytime</div>
    </div>
  </div>
</section>

</div><!-- .sp-page -->

<script>
document.querySelectorAll('.sp-faq-q').forEach(btn => {
  btn.addEventListener('click', () => {
    const item = btn.closest('.sp-faq-item');
    const wasOpen = item.classList.contains('open');
    document.querySelectorAll('.sp-faq-item').forEach(i => i.classList.remove('open'));
    if (!wasOpen) item.classList.add('open');
  });
});
</script>

<?php require __DIR__ . '/../includes/footer.php'; ?>
