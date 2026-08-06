<?php
define('BRAND_NAME',    'Certxa');
define('PAGE_TITLE',    'Self-Service Walk-In Check-In Kiosk for Nail Salons — Certxa');
define('PAGE_DESC',     'Certxa\'s self-service walk-in check-in kiosk lets clients check themselves in on a tablet without interrupting your nail service. Captures name, service, and tech preference, adds them to your live waitlist, and notifies you instantly. GoCheckIn-style kiosk built for nail studios.');
define('PAGE_KEYWORDS', 'nail salon check-in kiosk, self service salon kiosk, walk-in nail salon kiosk, nail salon tablet check-in, GoCheckIn nail salon, salon walk-in management, nail salon waitlist kiosk, nail studio self check-in tablet');
define('PAGE_CANONICAL','https://certxa.com/checkin-kiosk');
define('PAGE_BREADCRUMBS', json_encode([
  ['name'=>'Home','url'=>'https://certxa.com/'],
  ['name'=>'Self-Service Check-In Kiosk','url'=>'https://certxa.com/checkin-kiosk'],
]));
define('PAGE_SCHEMA', json_encode([
  [
    '@type'      => 'FAQPage',
    'mainEntity' => [
      ['@type'=>'Question','name'=>'What is the Certxa walk-in check-in kiosk?','acceptedAnswer'=>['@type'=>'Answer','text'=>'The Certxa check-in kiosk is a self-service tablet screen placed at the front of your nail salon. Walk-in clients choose a service and pick a technician preference — all without you having to stop your work. They\'re instantly added to your live waitlist and a ticket prints automatically at the front desk printer.']],
      ['@type'=>'Question','name'=>'Does the kiosk work for both walk-ins and booked appointments?','acceptedAnswer'=>['@type'=>'Answer','text'=>'Yes — the Certxa kiosk handles both. Booked clients can check themselves in by entering their name or phone number, confirming their arrival. Walk-in clients enter fresh and are added to the end of your waitlist automatically. Both flows are handled on the same screen.']],
      ['@type'=>'Question','name'=>'What device does the kiosk run on?','acceptedAnswer'=>['@type'=>'Answer','text'=>'The Certxa kiosk runs on any iPad or Android tablet. Simply open the Certxa app in kiosk mode, lock the screen to the check-in flow, and place it on your front desk or reception counter. No special hardware required — any modern tablet works.']],
      ['@type'=>'Question','name'=>'Can clients choose their preferred nail technician at the kiosk?','acceptedAnswer'=>['@type'=>'Answer','text'=>'Yes — the kiosk lets walk-in clients select a preferred technician or choose "any available tech." Their preference is shown on your waitlist dashboard so you can assign them to the right person as soon as a seat opens.']],
      ['@type'=>'Question','name'=>'Does the kiosk notify me when someone checks in?','acceptedAnswer'=>['@type'=>'Answer','text'=>'Yes — the moment a client checks in at the kiosk, a ticket prints instantly at your front desk printer and the waitlist updates in real time. You\'ll never miss a walk-in again, even if you\'re mid-service at the nail station.']],
      ['@type'=>'Question','name'=>'How does the kiosk help get more Google reviews?','acceptedAnswer'=>['@type'=>'Answer','text'=>'After a client\'s service is complete, Certxa automatically sends them an SMS asking about their experience. Happy clients are guided directly to your Google review page with one tap — making it effortless to collect 5-star reviews without any awkward in-person asks.']],
    ],
  ],
  [
    '@type'       => 'SoftwareApplication',
    'name'        => 'Certxa Walk-In Check-In Kiosk',
    'applicationCategory' => 'BusinessApplication',
    'operatingSystem' => 'Web, iOS, Android',
    'description' => 'Self-service walk-in check-in kiosk for nail salons. Clients check in on a tablet, choose a service and tech preference, and are added to the live waitlist — all without interrupting your work.',
    'offers'      => ['@type'=>'Offer','price'=>'0','priceCurrency'=>'USD','description'=>'Included in all Certxa plans. ' . TRIAL_DAYS . '-day free trial.'],
  ],
]));
require __DIR__ . '/../includes/header.php';
require __DIR__ . '/../includes/nav.php';
?>

<style>
@import url('https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@400;500;600;700;800&display=swap');

/* ── Page base ──────────────────────────────────────────── */
.ck-page { background: #faf8ff; }

/* ── Hero ───────────────────────────────────────────────── */
.ck-hero {
  background: linear-gradient(155deg, #0d0017 0%, #1a0035 50%, #0a0020 100%);
  padding: 100px 0 80px;
  position: relative;
  overflow: hidden;
}
.ck-hero::before {
  content: '';
  position: absolute; top: -180px; left: 50%;
  transform: translateX(-50%);
  width: 900px; height: 900px;
  background: radial-gradient(circle, rgba(109,40,217,.2) 0%, transparent 65%);
  pointer-events: none;
}
.ck-hero::after {
  content: '';
  position: absolute; bottom: -120px; right: -80px;
  width: 480px; height: 480px;
  background: radial-gradient(circle, rgba(236,72,153,.08) 0%, transparent 65%);
  pointer-events: none;
}
.ck-hero-inner {
  display: grid;
  grid-template-columns: 1fr 1.1fr;
  gap: 48px;
  align-items: center;
  position: relative;
  z-index: 1;
}
@media (max-width: 900px) {
  .ck-hero-inner { grid-template-columns: 1fr; }
  .ck-ipad-wrap  { display: none; }
}

/* ── Hero copy ──────────────────────────────────────────── */
.ck-eyebrow {
  display: inline-flex; align-items: center; gap: 8px;
  background: rgba(16,185,129,.12); border: 1px solid rgba(16,185,129,.3);
  border-radius: 50px; padding: 6px 18px; margin-bottom: 24px;
  font-size: .72rem; font-weight: 700; color: #6ee7b7;
  letter-spacing: .1em; text-transform: uppercase;
}
.ck-eyebrow-dot {
  width: 7px; height: 7px; border-radius: 50%;
  background: #10b981;
  animation: ck-pulse 2s infinite;
}
@keyframes ck-pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50%       { opacity: .55; transform: scale(.85); }
}
.ck-headline {
  font-family: 'Instrument Sans', sans-serif;
  font-size: clamp(2.4rem, 4.8vw, 4.2rem);
  font-weight: 800; line-height: 1.08; letter-spacing: -.04em;
  color: #fff; margin-bottom: 22px;
}
.ck-headline em { font-style: normal; color: #c084fc; }
.ck-sub {
  font-size: clamp(.92rem, 1.5vw, 1.1rem);
  color: rgba(255,255,255,.65); max-width: 500px;
  line-height: 1.75; margin-bottom: 36px;
}
.ck-hero-btns { display: flex; gap: 14px; flex-wrap: wrap; margin-bottom: 40px; }
.ck-btn-primary {
  display: inline-block; padding: 14px 32px; border-radius: 50px;
  background: linear-gradient(135deg, #7c3aed, #ec4899);
  color: #fff; font-weight: 700; font-size: .95rem; text-decoration: none;
  box-shadow: 0 6px 24px rgba(124,58,237,.45);
  transition: transform .15s, box-shadow .15s;
}
.ck-btn-primary:hover { transform: translateY(-2px); box-shadow: 0 10px 32px rgba(124,58,237,.6); }
.ck-btn-outline {
  display: inline-block; padding: 14px 28px; border-radius: 50px;
  border: 1.5px solid rgba(255,255,255,.28); color: rgba(255,255,255,.88);
  font-weight: 600; font-size: .95rem; text-decoration: none;
  transition: background .15s, border-color .15s;
}
.ck-btn-outline:hover { background: rgba(255,255,255,.08); border-color: rgba(255,255,255,.5); }
.ck-hero-metrics { display: flex; gap: 32px; flex-wrap: wrap; }
.ck-metric-val {
  font-family: 'Instrument Sans', sans-serif;
  font-size: 1.3rem; font-weight: 800; color: #fff; line-height: 1; margin-bottom: 4px;
}
.ck-metric-label { font-size: .72rem; color: rgba(255,255,255,.5); font-weight: 500; }

/* ══════════════════════════════════════════════════════════
   iPad Landscape Mockup
══════════════════════════════════════════════════════════ */
.ck-ipad-wrap {
  display: flex;
  align-items: center;
  justify-content: center;
  perspective: 1200px;
}

/* Outer iPad shell – landscape proportions */
.ck-ipad {
  width: 520px;
  height: 370px;
  background: #1a1a1e;
  border-radius: 28px;
  box-shadow:
    0 0 0 2px #3a3a3e,
    0 0 0 3px #111,
    0 32px 80px rgba(0,0,0,.6),
    0 8px 24px rgba(124,58,237,.25);
  position: relative;
  padding: 14px 18px;
  transform: rotateY(-6deg) rotateX(2deg);
  animation: ck-ipad-float 6s ease-in-out infinite;
}
@keyframes ck-ipad-float {
  0%, 100% { transform: rotateY(-6deg) rotateX(2deg) translateY(0); }
  50%       { transform: rotateY(-6deg) rotateX(2deg) translateY(-10px); }
}

/* Camera dot – landscape, centered on short left edge */
.ck-ipad::before {
  content: '';
  position: absolute;
  left: -2px; top: 50%;
  transform: translateY(-50%);
  width: 5px; height: 5px;
  background: #2a2a2e;
  border-radius: 50%;
  box-shadow: 0 0 0 1px #111;
}

/* Home button – centered on short right edge */
.ck-ipad::after {
  content: '';
  position: absolute;
  right: -4px; top: 50%;
  transform: translateY(-50%);
  width: 12px; height: 12px;
  background: #2a2a2e;
  border-radius: 50%;
  box-shadow: 0 0 0 1.5px #111 inset;
}

/* Screen */
.ck-ipad-screen {
  width: 100%; height: 100%;
  border-radius: 14px;
  overflow: hidden;
  position: relative;
  background: #e8e4f8;
}

/* ── Kiosk screen content ──────────────────────────────── */
.ck-screen-bg {
  width: 100%; height: 100%;
  background: linear-gradient(145deg, #eae6f8 0%, #f5f0ff 40%, #fce4f7 100%);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  position: relative;
  overflow: hidden;
}

/* Soft ambient orbs on the kiosk screen */
.ck-screen-orb1 {
  position: absolute; top: -40px; right: -30px;
  width: 150px; height: 150px;
  background: radial-gradient(circle, rgba(192,132,252,.25) 0%, transparent 70%);
  border-radius: 50%;
  animation: ck-orb-drift1 8s ease-in-out infinite;
}
.ck-screen-orb2 {
  position: absolute; bottom: -30px; left: -20px;
  width: 120px; height: 120px;
  background: radial-gradient(circle, rgba(236,72,153,.15) 0%, transparent 70%);
  border-radius: 50%;
  animation: ck-orb-drift2 10s ease-in-out infinite;
}
@keyframes ck-orb-drift1 {
  0%, 100% { transform: translate(0, 0); }
  50%       { transform: translate(-10px, 12px); }
}
@keyframes ck-orb-drift2 {
  0%, 100% { transform: translate(0, 0); }
  50%       { transform: translate(8px, -10px); }
}

/* Check circle */
.ck-screen-check {
  width: 60px; height: 60px;
  border-radius: 50%;
  background: linear-gradient(135deg, #a855f7 0%, #ec4899 100%);
  display: flex; align-items: center; justify-content: center;
  margin-bottom: 14px;
  box-shadow: 0 8px 24px rgba(168,85,247,.45);
  animation: ck-check-pop 3s ease-in-out infinite;
  position: relative; z-index: 1;
}
.ck-screen-check svg {
  width: 28px; height: 28px;
  stroke: #fff; stroke-width: 2.5;
  fill: none;
  stroke-dasharray: 40;
  stroke-dashoffset: 0;
  animation: ck-checkmark-draw 1.8s ease forwards;
}
@keyframes ck-check-pop {
  0%, 100% { transform: scale(1);    box-shadow: 0 8px 24px rgba(168,85,247,.45); }
  50%       { transform: scale(1.06); box-shadow: 0 12px 32px rgba(168,85,247,.65); }
}
@keyframes ck-checkmark-draw {
  from { stroke-dashoffset: 40; }
  to   { stroke-dashoffset: 0; }
}

/* Studio name */
.ck-screen-title {
  font-family: 'Instrument Sans', sans-serif;
  font-size: 1.35rem; font-weight: 800;
  color: #1a1a2e; letter-spacing: -.02em;
  margin-bottom: 5px;
  position: relative; z-index: 1;
  animation: ck-fade-up .8s .3s both;
}
.ck-screen-sub {
  font-size: .72rem; color: #6b7280; font-weight: 500;
  margin-bottom: 22px;
  position: relative; z-index: 1;
  animation: ck-fade-up .8s .5s both;
}

/* TAP button */
.ck-screen-btn {
  display: flex; align-items: center; gap: 8px;
  background: linear-gradient(135deg, #e85d5d 0%, #a855f7 50%, #7c3aed 100%);
  color: #fff;
  padding: 10px 24px;
  border-radius: 50px;
  font-size: .78rem; font-weight: 800;
  letter-spacing: .08em;
  text-transform: uppercase;
  box-shadow: 0 6px 20px rgba(168,85,247,.5);
  position: relative; z-index: 1;
  animation: ck-fade-up .8s .7s both, ck-btn-glow 2.5s 1.5s ease-in-out infinite;
  cursor: default;
}
.ck-screen-btn-hand {
  font-size: 1rem;
  animation: ck-hand-tap 1.8s ease-in-out infinite;
}
@keyframes ck-hand-tap {
  0%, 100% { transform: translateY(0) scale(1); }
  40%       { transform: translateY(3px) scale(.92); }
  60%       { transform: translateY(-1px) scale(1.05); }
}
@keyframes ck-btn-glow {
  0%, 100% { box-shadow: 0 6px 20px rgba(168,85,247,.5); }
  50%       { box-shadow: 0 8px 32px rgba(168,85,247,.8); }
}

/* "KIOSK READY" badge */
.ck-screen-ready {
  position: absolute; bottom: 12px;
  font-size: .55rem; font-weight: 700;
  letter-spacing: .18em; text-transform: uppercase;
  color: #9ca3af;
  z-index: 1;
  animation: ck-fade-up .8s 1s both;
}

/* Ripple effect when tapping */
.ck-ripple {
  position: absolute; z-index: 0;
  border-radius: 50%;
  background: rgba(168,85,247,.12);
  width: 200px; height: 200px;
  top: 50%; left: 50%;
  transform: translate(-50%, -50%) scale(0);
  animation: ck-ripple-anim 3s 2s ease-out infinite;
  pointer-events: none;
}
@keyframes ck-ripple-anim {
  0%   { transform: translate(-50%, -50%) scale(0); opacity: .6; }
  100% { transform: translate(-50%, -50%) scale(1.8); opacity: 0; }
}

@keyframes ck-fade-up {
  from { opacity: 0; transform: translateY(10px); }
  to   { opacity: 1; transform: translateY(0); }
}

/* ── SMS / notification badge floating on iPad ──────────── */
.ck-sms-badge {
  position: absolute;
  bottom: -18px; left: -30px;
  background: #fff;
  border-radius: 14px;
  padding: 10px 14px;
  box-shadow: 0 8px 28px rgba(0,0,0,.18);
  display: flex; align-items: center; gap: 10px;
  width: 210px;
  animation: ck-badge-pop .6s 1.2s both, ck-ipad-float 6s ease-in-out infinite;
  animation-delay: 1.2s, 0s;
  z-index: 10;
}
.ck-sms-icon {
  width: 34px; height: 34px; border-radius: 9px;
  background: linear-gradient(135deg, #10b981, #059669);
  display: flex; align-items: center; justify-content: center;
  font-size: .95rem; flex-shrink: 0;
}
.ck-sms-title { font-size: .72rem; font-weight: 700; color: #1c1917; }
.ck-sms-sub   { font-size: .63rem; color: #6b7280; margin-top: 1px; }
.ck-star-badge {
  position: absolute;
  top: -20px; right: -24px;
  background: #fff;
  border-radius: 14px;
  padding: 9px 14px;
  box-shadow: 0 8px 28px rgba(0,0,0,.18);
  display: flex; align-items: center; gap: 8px;
  animation: ck-badge-pop .6s 1.8s both, ck-ipad-float 6s ease-in-out infinite;
  z-index: 10;
}
.ck-star-badge .stars { font-size: .8rem; letter-spacing: 1px; }
.ck-star-badge .label { font-size: .65rem; font-weight: 700; color: #1c1917; }
@keyframes ck-badge-pop {
  from { opacity: 0; transform: scale(.7); }
  to   { opacity: 1; transform: scale(1); }
}

/* ── Stats strip ─────────────────────────────────────────── */
.ck-stats-strip {
  background: #fff;
  border-top: 1px solid #e9e4f5;
  border-bottom: 1px solid #e9e4f5;
  padding: 40px 0;
}
.ck-stats-grid {
  display: grid; grid-template-columns: repeat(4,1fr);
}
@media (max-width: 720px) { .ck-stats-grid { grid-template-columns: repeat(2,1fr); } }
.ck-stat-col {
  padding: 0 28px;
  border-right: 1px solid #e9e4f5;
  text-align: center;
}
.ck-stat-col:last-child { border-right: none; }
.ck-stat-icon { font-size: 1.5rem; margin-bottom: 8px; }
.ck-stat-val {
  font-family: 'Instrument Sans', sans-serif;
  font-size: 1.75rem; font-weight: 800; color: #1c1917; line-height: 1;
}
.ck-stat-label { font-size: .8rem; color: #9ca3af; margin-top: 4px; }

/* ── Sections ────────────────────────────────────────────── */
.ck-section { padding: 88px 0; }
.ck-section-white { background: #fff; }
.ck-section-light { background: #faf8ff; }
.ck-section-mid   { background: #f3eeff; }
.ck-section-dark  {
  background: linear-gradient(155deg, #0d0017 0%, #1a0035 55%, #0a0020 100%);
}
.ck-section-label {
  display: inline-block;
  background: rgba(124,58,237,.07); border: 1px solid rgba(124,58,237,.18);
  color: #7c3aed; border-radius: 50px; padding: 4px 16px;
  font-size: .7rem; font-weight: 700; letter-spacing: .1em; text-transform: uppercase;
  margin-bottom: 18px;
}
.ck-section-title {
  font-family: 'Instrument Sans', sans-serif;
  font-size: clamp(1.9rem, 3.8vw, 3.2rem); font-weight: 800;
  letter-spacing: -.03em; color: #1c1917; line-height: 1.12; margin-bottom: 18px;
}
.ck-section-sub {
  font-size: 1.05rem; color: #6b7280; max-width: 580px;
  line-height: 1.75; margin-bottom: 52px;
}

/* ── Feature cards ──────────────────────────────────────── */
.ck-features-grid {
  display: grid; grid-template-columns: repeat(3,1fr); gap: 20px;
}
@media (max-width: 860px) { .ck-features-grid { grid-template-columns: 1fr 1fr; } }
@media (max-width: 540px) { .ck-features-grid { grid-template-columns: 1fr; } }

.ck-feat-card {
  background: #fff; border: 1px solid #e9e4f5;
  border-radius: 18px; padding: 26px;
  transition: box-shadow .2s, transform .2s;
}
.ck-feat-card:hover { box-shadow: 0 8px 32px rgba(124,58,237,.1); transform: translateY(-3px); }
.ck-feat-card.highlight {
  border-color: rgba(16,185,129,.3);
  background: linear-gradient(135deg, #f0fdf9, #fff);
}
.ck-feat-icon {
  width: 44px; height: 44px; border-radius: 12px;
  display: flex; align-items: center; justify-content: center;
  font-size: 1.2rem; margin-bottom: 14px;
  background: linear-gradient(135deg, #7c3aed, #a855f7);
}
.ck-feat-icon.green { background: linear-gradient(135deg, #059669, #10b981); }
.ck-feat-title { font-size: .95rem; font-weight: 700; color: #1c1917; margin-bottom: 8px; }
.ck-feat-body  { font-size: .84rem; color: #6b7280; line-height: 1.65; }

/* ── How it works steps ──────────────────────────────────── */
.hiw-grid {
  display:grid; grid-template-columns:1fr 32px 1fr 32px 1fr 32px 1fr;
  align-items:start; gap:0;
}
@media(max-width:860px){ .hiw-grid{ grid-template-columns:1fr 1fr; gap:32px; } .hiw-arrow{display:none;} }
@media(max-width:500px){ .hiw-grid{ grid-template-columns:1fr; } }
.hiw-step { text-align:center; padding:0 8px; }
.hiw-arrow {
  display:flex; align-items:center; justify-content:center; padding-top:44px;
}
.hiw-arrow svg { overflow:visible; }
.hiw-icon-wrap {
  width:100px; height:100px; border-radius:24px;
  background:linear-gradient(145deg,#f5f0ff 0%,#fdeeff 100%);
  border:1.5px solid rgba(168,85,247,.15);
  display:flex; align-items:center; justify-content:center;
  margin:0 auto 20px;
  box-shadow:0 6px 24px rgba(124,58,237,.1), 0 1px 3px rgba(0,0,0,.04);
  position:relative; overflow:hidden;
}
.hiw-icon-wrap::after {
  content:''; position:absolute; inset:0;
  background:linear-gradient(135deg,rgba(168,85,247,.05),rgba(232,72,145,.04));
  border-radius:24px;
}
.hiw-badge {
  position:absolute; top:-9px; right:-9px;
  width:28px; height:28px; border-radius:50%;
  background:linear-gradient(135deg,#7c3aed,#a855f7);
  color:#fff; font-size:12px; font-weight:800;
  display:flex; align-items:center; justify-content:center;
  box-shadow:0 3px 10px rgba(124,58,237,.4);
  z-index:2; font-family:'Instrument Sans',sans-serif;
}
.hiw-title {
  font-family:'Instrument Sans',sans-serif;
  font-size:1rem; font-weight:800; color:#18111a;
  margin-bottom:9px; line-height:1.25;
}
.hiw-body { font-size:.84rem; color:#6b7280; line-height:1.72; max-width:190px; margin:0 auto; }

/* ── SVG animation keyframes ── */
@keyframes hiw-cursor-fall {
  0%,100%{ transform:translate(0,0) scale(1); opacity:1; }
  30%    { transform:translate(0,9px) scale(.75); opacity:1; }
  55%    { transform:translate(0,9px) scale(.75); }
  70%    { transform:translate(0,0) scale(1); }
}
@keyframes hiw-ripple-out {
  0%    { r:1; opacity:.7; }
  70%   { r:11; opacity:0; }
  100%  { r:11; opacity:0; }
}
@keyframes hiw-key-on {
  0%,100%,25% { fill:#e9e3f5; }
  10%          { fill:#e84891; }
}
@keyframes hiw-check-stroke {
  0%,35%  { stroke-dashoffset:28; }
  75%,100%{ stroke-dashoffset:0; }
}
@keyframes hiw-sel-border {
  0%,30%  { stroke:#e9e3f5; }
  60%,100%{ stroke:#e84891; }
}
@keyframes hiw-sel-fill {
  0%,30%  { fill:#f0eeff; }
  60%,100%{ fill:rgba(232,72,145,.08); }
}
@keyframes hiw-paper-out {
  0%,15%  { transform:translateY(-18px); opacity:0; }
  35%,70% { transform:translateY(0);     opacity:1; }
  88%,100%{ transform:translateY(5px);   opacity:0; }
}
@keyframes hiw-light-pulse {
  0%,100%{ opacity:.9; } 50%{ opacity:.3; }
}

/* ── SMS Google Review Section ───────────────────────────── */
.ck-review-grid {
  display: grid; grid-template-columns: 1fr 1fr; gap: 64px; align-items: center;
}
@media (max-width: 860px) { .ck-review-grid { grid-template-columns: 1fr; } }

.ck-phone-mockup {
  display: flex; justify-content: center; align-items: center;
}
.ck-phone {
  width: 240px;
  background: #1a1a1e;
  border-radius: 36px;
  padding: 14px 10px;
  box-shadow: 0 24px 64px rgba(0,0,0,.35), 0 0 0 2px #2a2a2e;
  position: relative;
}
.ck-phone::before {
  content: '';
  position: absolute; top: 16px; left: 50%;
  transform: translateX(-50%);
  width: 60px; height: 4px;
  background: #2a2a2e; border-radius: 4px;
}
.ck-phone-screen {
  background: #f8f9fa;
  border-radius: 26px;
  overflow: hidden;
  min-height: 360px;
  display: flex; flex-direction: column;
}
.ck-sms-header {
  background: #fff;
  padding: 14px 16px 10px;
  border-bottom: 1px solid #e5e7eb;
  text-align: center;
}
.ck-sms-contact { font-size: .72rem; font-weight: 700; color: #1c1917; }
.ck-sms-number  { font-size: .62rem; color: #9ca3af; }
.ck-sms-body { padding: 14px 12px; flex: 1; display: flex; flex-direction: column; gap: 10px; }
.ck-sms-bubble {
  background: #e5e7eb; color: #1c1917;
  border-radius: 16px 16px 16px 4px;
  padding: 9px 12px; font-size: .68rem;
  line-height: 1.55; max-width: 85%;
}
.ck-sms-bubble-out {
  background: #7c3aed; color: #fff;
  border-radius: 16px 16px 4px 16px;
  align-self: flex-end;
}
.ck-sms-link-btn {
  display: flex; align-items: center; justify-content: center; gap: 6px;
  background: #fff; border: 1.5px solid #4285f4;
  border-radius: 10px; padding: 9px 12px;
  font-size: .68rem; font-weight: 700; color: #4285f4;
  text-decoration: none; margin-top: 4px;
}
.ck-google-g {
  width: 14px; height: 14px; font-size: .6rem;
  background: linear-gradient(135deg, #4285f4, #34a853, #fbbc05, #ea4335);
  border-radius: 50%; display: flex; align-items: center; justify-content: center;
  color: #fff; font-weight: 900;
}

/* ── Testimonials ─────────────────────────────────────────── */
.ck-testimonials-grid {
  display: grid; grid-template-columns: repeat(3,1fr); gap: 24px;
}
@media (max-width: 780px) { .ck-testimonials-grid { grid-template-columns: 1fr; } }
.ck-testimonial-card {
  background: #fff; border: 1px solid #e9e4f5;
  border-radius: 18px; padding: 28px;
  box-shadow: 0 2px 12px rgba(124,58,237,.05);
}
.ck-t-stars { font-size: .9rem; margin-bottom: 14px; letter-spacing: 2px; }
.ck-t-quote { font-size: .9rem; color: #374151; line-height: 1.65; font-style: italic; margin-bottom: 18px; }
.ck-t-author { font-size: .83rem; font-weight: 700; color: #7c3aed; }
.ck-t-role   { font-size: .75rem; color: #9ca3af; margin-top: 2px; }

/* ── FAQ ─────────────────────────────────────────────────── */
.ck-faq { max-width: 720px; margin: 0 auto; }
.ck-faq-item { border-bottom: 1px solid #e5e7eb; }
.ck-faq-item:last-child { border-bottom: none; }
.ck-faq-q {
  width: 100%; background: none; border: none; cursor: pointer;
  display: flex; align-items: center; justify-content: space-between;
  padding: 20px 0; font-size: .93rem; font-weight: 600; color: #1c1917;
  text-align: left; gap: 16px; font-family: inherit;
}
.ck-faq-q:hover { color: #7c3aed; }
.ck-faq-icon { font-size: 1.3rem; color: #9ca3af; flex-shrink: 0; transition: transform .2s; }
.ck-faq-a { font-size: .88rem; color: #4b5563; line-height: 1.8; padding-bottom: 20px; display: none; }
.ck-faq-item.open .ck-faq-a { display: block; }
.ck-faq-item.open .ck-faq-icon { transform: rotate(45deg); color: #7c3aed; }

/* ── CTA ─────────────────────────────────────────────────── */
.ck-cta {
  background: linear-gradient(135deg, #3B0764 0%, #1a0035 100%);
  padding: 88px 0; text-align: center; position: relative; overflow: hidden;
}
.ck-cta::before {
  content: '';
  position: absolute; top: -100px; left: 50%; transform: translateX(-50%);
  width: 600px; height: 600px;
  background: radial-gradient(circle, rgba(168,85,247,.2) 0%, transparent 65%);
  pointer-events: none;
}
.ck-cta-headline {
  font-family: 'Instrument Sans', sans-serif;
  font-size: clamp(2.2rem, 5vw, 4rem); font-weight: 800;
  color: #fff; line-height: 1.1; letter-spacing: -.035em; margin-bottom: 18px;
}
.ck-cta-headline em { font-style: normal; color: #c084fc; }
.ck-cta-sub {
  font-size: 1.05rem; color: rgba(255,255,255,.65);
  margin-bottom: 40px; max-width: 500px; margin-left: auto; margin-right: auto; line-height: 1.7;
}
.ck-cta-btns { display: flex; gap: 14px; justify-content: center; flex-wrap: wrap; position: relative; z-index: 1; }

/* ── Shared utilities ────────────────────────────────────── */
.ck-container { max-width: 1120px; margin: 0 auto; padding: 0 24px; }
.ck-text-center { text-align: center; }
@media (max-width: 640px) {
  .ck-hero    { padding: 72px 0 56px; }
  .ck-section { padding: 60px 0; }
}
</style>

<div class="ck-page">

<!-- ══ 1. HERO ══════════════════════════════════════════════ -->
<section class="ck-hero">
  <div class="ck-container">
    <div class="ck-hero-inner">

      <!-- Left copy -->
      <div>
        <div class="ck-eyebrow">
          <span class="ck-eyebrow-dot"></span>
          Walk-In Check-In Kiosk
        </div>
        <h1 class="ck-headline">
          Walk-ins check in themselves.<br><em>You stay in your zone.</em>
        </h1>
        <p class="ck-sub">
          Place a tablet at your front desk. Clients pick a service and choose a tech preference — no interruption needed. They're instantly on your live waitlist and a ticket prints automatically at the front desk.
        </p>
        <div class="ck-hero-btns">
          <a href="/auth?mode=register" class="ck-btn-primary">Start <span class="js-trial-days"><?= TRIAL_DAYS ?></span>-Day Free Trial →</a>
          <a href="/salonos" class="ck-btn-outline">See All Features</a>
        </div>
        <div class="ck-hero-metrics">
          <?php foreach ([
            ['< 30s',  'Check-in time'],
            ['100%',   'Walk-ins captured'],
            ['24 / 7', 'Kiosk uptime'],
          ] as [$val, $label]): ?>
          <div>
            <div class="ck-metric-val"><?= $val ?></div>
            <div class="ck-metric-label"><?= $label ?></div>
          </div>
          <?php endforeach; ?>
        </div>
      </div>

      <!-- Right — animated iPad landscape kiosk mockup -->
      <div class="ck-ipad-wrap">
        <div style="position:relative;">

          <!-- Floating SMS badge -->
          <div class="ck-sms-badge">
            <div class="ck-sms-icon">💬</div>
            <div>
              <div class="ck-sms-title">Google Review Sent</div>
              <div class="ck-sms-sub">SMS sent to Emma · 5-star ⭐</div>
            </div>
          </div>

          <!-- Floating star badge -->
          <div class="ck-star-badge">
            <div class="stars">⭐⭐⭐⭐⭐</div>
            <div class="label">4.9 · 247 reviews</div>
          </div>

          <!-- iPad shell -->
          <div class="ck-ipad">
            <div class="ck-ipad-screen" style="background:#f5f3ff;overflow:hidden;position:relative;">

<style>
/* ── Kiosk Simulation Screens ─────────────────────── */
.ksim-wrap { position:absolute;inset:0;overflow:hidden;font-family:'Instrument Sans',system-ui,sans-serif; }
.ksim { position:absolute;inset:0;opacity:0;pointer-events:none;transition:opacity .4s ease;display:flex;flex-direction:column; }
.ksim.on { opacity:1; }

/* Idle */
#ks0 { background:linear-gradient(145deg,#eae6f8 0%,#f5f0ff 40%,#fce4f7 100%);align-items:center;justify-content:center;gap:6px; }
.ks-orb1 { position:absolute;top:-28px;right:-20px;width:100px;height:100px;background:radial-gradient(circle,rgba(192,132,252,.22) 0%,transparent 70%);border-radius:50%;animation:ck-orb-drift1 8s ease-in-out infinite; }
.ks-orb2 { position:absolute;bottom:-20px;left:-14px;width:80px;height:80px;background:radial-gradient(circle,rgba(236,72,153,.13) 0%,transparent 70%);border-radius:50%;animation:ck-orb-drift2 10s ease-in-out infinite; }
.ks-ripple { position:absolute;border-radius:50%;background:rgba(168,85,247,.1);width:140px;height:140px;top:50%;left:50%;transform:translate(-50%,-50%) scale(0);animation:ks-ripple 3s ease-out infinite; }
@keyframes ks-ripple { 0%{transform:translate(-50%,-50%) scale(0);opacity:.5} 100%{transform:translate(-50%,-50%) scale(1.8);opacity:0} }
.ks-check-circle { width:44px;height:44px;border-radius:50%;background:linear-gradient(135deg,#a855f7,#ec4899);display:flex;align-items:center;justify-content:center;box-shadow:0 6px 18px rgba(168,85,247,.45);animation:ks-pop 3s ease-in-out infinite;position:relative;z-index:1; }
.ks-check-circle svg { width:20px;height:20px;stroke:#fff;stroke-width:2.5;fill:none;stroke-dasharray:30;stroke-dashoffset:0;animation:ks-draw 1.8s ease forwards; }
@keyframes ks-draw { from{stroke-dashoffset:30} to{stroke-dashoffset:0} }
@keyframes ks-pop { 0%,100%{transform:scale(1);box-shadow:0 6px 18px rgba(168,85,247,.45)} 50%{transform:scale(1.06);box-shadow:0 10px 24px rgba(168,85,247,.65)} }
.ks-title { font-size:13px;font-weight:800;color:#18111a;letter-spacing:-.02em;position:relative;z-index:1; }
.ks-sub { font-size:8px;color:#6b6580;font-weight:500;position:relative;z-index:1; }
.ks-tap-btn { display:flex;align-items:center;gap:5px;background:linear-gradient(135deg,#e85d5d,#a855f7 50%,#7c3aed);color:#fff;padding:7px 16px;border-radius:50px;font-size:8px;font-weight:800;letter-spacing:.07em;text-transform:uppercase;box-shadow:0 5px 16px rgba(168,85,247,.5);position:relative;z-index:1;animation:ks-btn-glow 2.5s 1.5s ease-in-out infinite; }
@keyframes ks-btn-glow { 0%,100%{box-shadow:0 5px 16px rgba(168,85,247,.5)} 50%{box-shadow:0 8px 26px rgba(168,85,247,.8)} }
.ks-hand { font-size:10px;animation:ks-hand-tap 1.8s ease-in-out infinite; }
@keyframes ks-hand-tap { 0%,100%{transform:translateY(0) scale(1)} 40%{transform:translateY(2px) scale(.9)} 60%{transform:translateY(-1px) scale(1.05)} }
.ks-ready { position:absolute;bottom:8px;font-size:6px;font-weight:700;letter-spacing:.18em;text-transform:uppercase;color:#9ca3af;z-index:1; }
/* ping dot */
.ks-ping-wrap { display:flex;align-items:center;gap:5px; }
.ks-ping { width:6px;height:6px;border-radius:50%;background:#e84891;animation:ks-ping-anim 1.6s ease-in-out infinite; }
@keyframes ks-ping-anim { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.5;transform:scale(.8)} }

/* Phone screen */
#ks1 { background:#f5f3ff;flex-direction:row; }
.ks-phone-left { width:36%;background:#fdf2f8;border-right:1px solid #e9e3f5;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:5px;padding:6px; }
.ks-store-badge { width:28px;height:28px;border-radius:50%;background:linear-gradient(135deg,#e84891,#a78bfa);display:flex;align-items:center;justify-content:center;color:#fff;font-size:12px;font-weight:900;box-shadow:0 3px 10px rgba(232,72,145,.4); }
.ks-store-name { font-size:8px;font-weight:800;color:#18111a;text-align:center; }
.ks-loyalty-card { background:#fff;border:1px solid #e9e3f5;border-radius:8px;padding:5px 7px;width:90%; }
.ks-loyalty-label { font-size:6px;font-weight:700;color:#e84891;text-transform:uppercase;letter-spacing:.05em;margin-bottom:2px; }
.ks-loyalty-body { font-size:6.5px;color:#6b6580;line-height:1.4; }
.ks-phone-right { flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:5px;padding:6px 8px; }
.ks-phone-label { font-size:8.5px;font-weight:700;color:#18111a;text-align:center; }
.ks-phone-sublabel { font-size:6.5px;color:#a89ec0;margin-top:-3px; }
.ks-phone-display { background:#fff;border:1px solid #e9e3f5;border-radius:8px;padding:5px 12px;min-width:120px;text-align:center;box-shadow:0 1px 4px rgba(80,0,120,.06); }
.ks-phone-display span { font-size:12px;font-family:monospace;letter-spacing:.08em;color:#18111a;font-weight:600; }
.ks-numpad { display:grid;grid-template-columns:repeat(3,1fr);gap:3px; }
.ks-key { width:30px;height:26px;border-radius:6px;font-size:10px;font-weight:700;color:#18111a;background:#fff;border:1px solid #e9e3f5;display:flex;align-items:center;justify-content:center;box-shadow:0 1px 3px rgba(80,0,120,.05);cursor:default; }
.ks-key.del { background:#fef2f2;border-color:#fecaca;color:#ef4444; }
.ks-key.go  { background:#e84891;border-color:#e84891;color:#fff; }

/* Welcome */
#ks2 { background:#f5f3ff;align-items:center;justify-content:center;gap:6px; }
.ks-wave { font-size:36px;animation:ks-bounce 1.5s ease-in-out 3; }
@keyframes ks-bounce { 0%,100%{transform:translateY(0)} 40%{transform:translateY(-8px)} 70%{transform:translateY(-4px)} }
.ks-welcome-h { font-size:16px;font-weight:900;color:#18111a;text-align:center;line-height:1.15; }
.ks-loyalty-pill { display:inline-flex;align-items:center;gap:4px;padding:3px 10px;border-radius:50px;background:#fffbeb;border:1px solid #fde68a;color:#92400e;font-size:7.5px;font-weight:600; }
.ks-visit-note { font-size:7px;color:#6b6580; }

/* Service Type */
#ks3 { background:#f5f3ff; }
.ks-header { padding:7px 8px 6px;background:#fff;border-bottom:1px solid #e9e3f5;flex-shrink:0; }
.ks-header-label { font-size:6px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#e84891;margin-bottom:1px; }
.ks-header-h { font-size:11px;font-weight:900;color:#18111a;line-height:1.2; }
.ks-cat-grid { flex:1;display:grid;grid-template-columns:repeat(3,1fr);gap:5px;padding:6px 8px;align-content:start; }
.ks-cat-card { border-radius:10px;background:#fff;border:1.5px solid #e9e3f5;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 1px 4px rgba(80,0,120,.06);transition:border-color .3s,box-shadow .3s; }
.ks-cat-card.sel { border-color:#e84891;box-shadow:0 0 0 2px rgba(232,72,145,.2),0 2px 8px rgba(80,0,120,.1); }
.ks-cat-img { height:62px;display:flex;align-items:center;justify-content:center;background:#f0eeff;font-size:26px;position:relative;flex-shrink:0; }
.ks-cat-card.sel .ks-cat-img { background:rgba(232,72,145,.08); }
.ks-cat-chk { position:absolute;top:4px;right:4px;width:14px;height:14px;border-radius:50%;background:#e84891;color:#fff;font-size:7px;font-weight:900;display:flex;align-items:center;justify-content:center; }
.ks-cat-body { padding:4px 5px 5px;border-top:1px solid #e9e3f5; }
.ks-cat-title { font-size:8px;font-weight:800;color:#18111a;margin-bottom:2px; }
.ks-cat-bullet { font-size:6px;color:#6b6580;line-height:1.5; }
.ks-footer { padding:5px 8px;background:#fff;border-top:1px solid #e9e3f5;display:flex;align-items:center;justify-content:space-between;flex-shrink:0; }
.ks-ghost-btn { padding:4px 10px;border-radius:7px;font-size:7px;font-weight:600;color:#6b6580;background:#fff;border:1px solid #e9e3f5;box-shadow:0 1px 3px rgba(80,0,120,.05); }
.ks-primary-btn { padding:4px 12px;border-radius:7px;font-size:7px;font-weight:700;color:#fff;background:#e84891;box-shadow:0 2px 8px rgba(232,72,145,.4); }
.ks-primary-btn.dim { background:#d1d5db;box-shadow:none; }

/* Services */
#ks4 { background:#f5f3ff; }
.ks-svc-grid { flex:1;display:grid;grid-template-columns:repeat(4,1fr);gap:4px;padding:5px 7px;align-content:start;overflow:hidden; }
.ks-svc-card { border-radius:8px;background:#fff;border:1.5px solid #e9e3f5;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 1px 4px rgba(80,0,120,.06);transition:border-color .3s,box-shadow .3s; }
.ks-svc-card.sel { border-color:#e84891;box-shadow:0 0 0 2px rgba(232,72,145,.18),0 2px 8px rgba(80,0,120,.1); }
.ks-svc-img { height:52px;display:flex;align-items:center;justify-content:center;background:#f0fdf9;font-size:22px;position:relative;flex-shrink:0; }
.ks-svc-chk { position:absolute;top:3px;right:3px;width:12px;height:12px;border-radius:50%;background:#e84891;color:#fff;font-size:6px;font-weight:900;display:flex;align-items:center;justify-content:center; }
.ks-pop-badge { position:absolute;bottom:0;left:0;background:linear-gradient(90deg,#f59e0b,#f97316);color:#fff;font-size:5.5px;font-weight:700;padding:1.5px 4px;border-radius:0 4px 0 0; }
.ks-svc-body { padding:3px 4px 4px;flex:1;display:flex;flex-direction:column; }
.ks-svc-name { font-size:7.5px;font-weight:700;color:#18111a;line-height:1.25;margin-bottom:2px; }
.ks-svc-meta { display:flex;align-items:center;justify-content:space-between;margin-top:auto;border-top:1px solid #e9e3f5;padding-top:2px; }
.ks-svc-price { font-size:9px;font-weight:900;color:#18111a; }
.ks-svc-dur { font-size:5.5px;font-weight:600;color:#6b6580;background:#f1f0f6;padding:1px 3px;border-radius:4px; }
.ks-cart-bar { padding:4px 7px;background:#fff;border-top:1.5px solid #e9e3f5;display:flex;align-items:center;gap:5px;flex-shrink:0; }
.ks-chip { display:inline-flex;align-items:center;gap:2px;padding:2px 6px;border-radius:50px;font-size:6px;font-weight:600;background:#fdf2f8;border:1px solid #e84891;color:#e84891; }
.ks-cart-total { font-size:10px;font-weight:900;color:#18111a;margin-left:auto;flex-shrink:0; }
.ks-cart-dur { font-size:5.5px;color:#a89ec0; }

/* Stylist */
#ks5 { background:#f5f3ff; }
.ks-stylist-header { padding:7px 8px 5px;background:#fff;border-bottom:1px solid #e9e3f5;text-align:center;flex-shrink:0; }
.ks-stylist-opt { font-size:6px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#e84891;margin-bottom:1px; }
.ks-stylist-h { font-size:12px;font-weight:900;color:#18111a; }
.ks-stylist-sub { font-size:7px;color:#6b6580; }
.ks-staff-grid { flex:1;display:grid;grid-template-columns:repeat(4,1fr);gap:5px;padding:7px 9px;align-content:center; }
.ks-staff-card { border-radius:10px;background:#fff;border:1.5px solid #e9e3f5;padding:7px 4px 6px;display:flex;flex-direction:column;align-items:center;gap:4px;box-shadow:0 1px 4px rgba(80,0,120,.06);transition:border-color .3s,box-shadow .3s;position:relative; }
.ks-staff-card.sel { border-color:#e84891;box-shadow:0 0 0 2px rgba(232,72,145,.18); }
.ks-staff-chk { position:absolute;top:4px;right:4px;width:12px;height:12px;border-radius:50%;background:#e84891;color:#fff;font-size:6px;font-weight:900;display:flex;align-items:center;justify-content:center; }
.ks-avatar { width:32px;height:32px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:900;color:#fff;box-shadow:0 2px 6px rgba(0,0,0,.15); }
.ks-staff-name { font-size:7.5px;font-weight:800;color:#18111a;text-align:center; }
.ks-staff-role { font-size:6px;color:#a89ec0;text-align:center; }

/* Ticket */
#ks6 { background:#f5f3ff;align-items:center;justify-content:center; }
.ks-ticket-card { background:#fff;border-radius:14px;padding:12px 16px;box-shadow:0 4px 20px rgba(80,0,120,.1);border:1px solid #e9e3f5;width:72%;display:flex;flex-direction:column;align-items:center;gap:6px; }
.ks-tick-icon { width:38px;height:38px;border-radius:50%;background:linear-gradient(135deg,#22c55e,#16a34a);display:flex;align-items:center;justify-content:center;box-shadow:0 4px 14px rgba(34,197,94,.4); }
.ks-tick-icon svg { width:18px;height:18px;stroke:#fff;stroke-width:2.5;fill:none;stroke-dasharray:28;stroke-dashoffset:0;animation:ks-draw 1s ease forwards; }
.ks-tick-title { font-size:11px;font-weight:900;color:#18111a;text-align:center; }
.ks-tick-rows { width:100%;display:flex;flex-direction:column;gap:3px; }
.ks-tick-row { display:flex;align-items:center;justify-content:space-between;padding:3px 0;border-bottom:1px solid #f0eeff; }
.ks-tick-row:last-child { border-bottom:none; }
.ks-tick-label { font-size:6.5px;color:#a89ec0;font-weight:600;text-transform:uppercase;letter-spacing:.05em; }
.ks-tick-val { font-size:7.5px;font-weight:700;color:#18111a; }
.ks-wait-pill { background:#fdf2f8;border:1px solid #e84891;border-radius:50px;padding:3px 10px;font-size:8px;font-weight:700;color:#e84891; }
.ks-cdown-ring { display:flex;flex-direction:column;align-items:center;gap:2px; }
.ks-cdown-ring svg { width:30px;height:30px; }
.ks-cdown-num { font-size:7px;color:#a89ec0; }

/* ── Real screenshot screens ── */
.ks-real-shot {
  width:100%; height:100%;
  object-fit:cover; object-position:top left;
  display:block;
}

/* Category screenshot should stay contained inside kiosk frame (not full-bleed) */
#ks3 {
  background:#f5f3ff;
  align-items:center;
  justify-content:center;
}
#ks3 .ks-real-shot {
  width:100%;
  height:100%;
  object-fit:contain;
  object-position:top center;
  border-radius:0;
}

/* Match screen 3 sizing behavior for screens 4 and 6 */
#ks4,
#ks6 {
  background:#f5f3ff;
  align-items:center;
  justify-content:center;
}
#ks4 .ks-real-shot,
#ks6 .ks-real-shot {
  width:100%;
  height:100%;
  object-fit:contain;
  object-position:top center;
  border-radius:0;
}

/* Tap ring overlay on screenshot screens */
.ks-tap-ring {
  position:absolute; pointer-events:none; z-index:10;
  width:28px; height:28px; border-radius:50%;
  border:2.5px solid #e84891;
  background:rgba(232,72,145,.18);
  transform:translate(-50%,-50%) scale(0);
  animation:ks-ring-pop .5s ease forwards;
}
@keyframes ks-ring-pop {
  0%  { transform:translate(-50%,-50%) scale(0); opacity:1; }
  60% { transform:translate(-50%,-50%) scale(1.4); opacity:.8; }
  100%{ transform:translate(-50%,-50%) scale(1); opacity:0; }
}

/* Countdown overlay on confirmation screenshot */
.ks-confirm-cdown {
  position:absolute; bottom:18px; left:50%; transform:translateX(-50%);
  background:rgba(255,255,255,.92); border-radius:50%;
  box-shadow:0 2px 12px rgba(232,72,145,.25);
  pointer-events:none; z-index:10;
  display:none;
}

/* ── Tap Cursor ── */
#ks-cursor {
  position:absolute;pointer-events:none;z-index:999;
  width:14px;height:14px;border-radius:50%;
  background:rgba(255,255,255,.95);
  border:2px solid #e84891;
  box-shadow:0 2px 10px rgba(0,0,0,.3);
  transform:translate(-50%,-50%);
  transition:left .4s cubic-bezier(.4,0,.2,1),top .4s cubic-bezier(.4,0,.2,1),opacity .25s;
  opacity:0;
}
#ks-cursor.tapping {
  animation:ks-tap-anim .28s ease forwards;
}
@keyframes ks-tap-anim {
  0%  { transform:translate(-50%,-50%) scale(1);   box-shadow:0 2px 10px rgba(0,0,0,.3),0 0 0 0   rgba(232,72,145,.7); }
  40% { transform:translate(-50%,-50%) scale(.55); box-shadow:0 1px  4px rgba(0,0,0,.2),0 0 0 0   rgba(232,72,145,.4); }
  100%{ transform:translate(-50%,-50%) scale(1);   box-shadow:0 2px 10px rgba(0,0,0,.3),0 0 0 10px rgba(232,72,145,0); }
}
</style>

<div class="ksim-wrap">

  <!-- ── SCREEN 0: Idle ────────────────────── -->
  <div class="ksim on" id="ks0">
    <div class="ks-orb1"></div>
    <div class="ks-orb2"></div>
    <div class="ks-ripple"></div>
    <div class="ks-check-circle">
      <svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"></polyline></svg>
    </div>
    <div class="ks-title">Fabulous Nails</div>
    <div class="ks-sub">Your style journey starts here</div>
    <div class="ks-tap-btn">
      <span class="ks-hand">👆</span> TAP ANYWHERE TO BEGIN
    </div>
    <div class="ks-ping-wrap" style="margin-top:4px;">
      <span class="ks-ping"></span>
      <span style="font-size:6.5px;color:#a89ec0;letter-spacing:.1em;text-transform:uppercase;font-weight:600;">Kiosk Ready</span>
    </div>
  </div>

  <!-- ── SCREEN 1: Phone Entry ─────────────── -->
  <div class="ksim" id="ks1">
    <div class="ks-phone-left">
      <div class="ks-store-badge">✓</div>
      <div class="ks-store-name">Fabulous<br>Nails</div>
      <div class="ks-loyalty-card">
        <div class="ks-loyalty-label">⭐ Loyalty Rewards</div>
        <div class="ks-loyalty-body">Earn points with every visit!</div>
      </div>
    </div>
    <div class="ks-phone-right">
      <div class="ks-phone-label">Enter your cell phone number</div>
      <div class="ks-phone-sublabel">Your info is never shared</div>
      <div class="ks-phone-display">
        <span id="ksim-phone-display">•••  •••  ••••</span>
      </div>
      <div class="ks-numpad">
        <?php foreach(['1','2','3','4','5','6','7','8','9'] as $d): ?>
        <div class="ks-key"><?= $d ?></div>
        <?php endforeach; ?>
        <div class="ks-key del">⌫</div>
        <div class="ks-key">0</div>
        <div class="ks-key go">→</div>
      </div>
      <div class="ks-ghost-btn" style="font-size:6.5px;padding:3px 10px;color:#a89ec0;">Cancel</div>
    </div>
  </div>

  <!-- ── SCREEN 2: Welcome Back ────────────── -->
  <div class="ksim" id="ks2">
    <div class="ks-wave" id="ksim-wave">👋</div>
    <div class="ks-welcome-h">Welcome back,<br>Toby!</div>
    <div class="ks-loyalty-pill">⭐ 471 loyalty points</div>
    <div class="ks-visit-note">Visit #12 — thanks for coming back!</div>
    <div style="font-size:7px;color:#a89ec0;margin-top:2px;animation:ks-ping-anim 1.2s ease-in-out infinite;">Loading your options…</div>
  </div>

  <!-- ── SCREEN 3: Service Type (real screenshot) ────────── -->
  <div class="ksim" id="ks3">
    <img src="https://certxa.com/api/r2/site-assets/b50e8bfb-421c-49ef-b8fc-58a606271055.webp" class="ks-real-shot" alt="Kiosk category selection">
    <div id="ks3-tap-ring" class="ks-tap-ring" style="display:none;"></div>
  </div>

  <!-- ── SCREEN 4: Services (real screenshot) ─────────────── -->
  <div class="ksim" id="ks4">
    <img src="https://certxa.com/api/r2/site-assets/3f1e87d3-9924-47ec-899e-85c935a98d52.webp" class="ks-real-shot" alt="Kiosk service selection">
    <div id="ks4-tap-ring" class="ks-tap-ring" style="display:none;"></div>
  </div>

  <!-- ── SCREEN 5: Stylist ──────────────────── -->
  <div class="ksim" id="ks5">
    <div class="ks-stylist-header">
      <div class="ks-stylist-opt">Optional</div>
      <div class="ks-stylist-h">Who would you like today?</div>
      <div class="ks-stylist-sub">Pick a stylist or go with next available</div>
    </div>
    <div class="ks-staff-grid">
      <div class="ks-staff-card">
        <div class="ks-avatar" style="background:linear-gradient(135deg,#a78bfa,#7c3aed);">✦</div>
        <div class="ks-staff-name">Any Available</div>
        <div class="ks-staff-role">Next free tech</div>
      </div>
      <div class="ks-staff-card" id="ks5-sophie">
        <span class="ks-staff-chk" id="ks5-chk" style="display:none;">✓</span>
        <div class="ks-avatar" style="background:linear-gradient(135deg,#f472b6,#e84891);">S</div>
        <div class="ks-staff-name">Sophie</div>
        <div class="ks-staff-role">Nail Tech</div>
      </div>
      <div class="ks-staff-card">
        <div class="ks-avatar" style="background:linear-gradient(135deg,#34d399,#059669);">M</div>
        <div class="ks-staff-name">Mai</div>
        <div class="ks-staff-role">Senior Tech</div>
      </div>
      <div class="ks-staff-card">
        <div class="ks-avatar" style="background:linear-gradient(135deg,#60a5fa,#3b82f6);">J</div>
        <div class="ks-staff-name">Jessica</div>
        <div class="ks-staff-role">Nail Artist</div>
      </div>
    </div>
    <div class="ks-footer">
      <div class="ks-ghost-btn">← Back</div>
      <div class="ks-primary-btn dim" id="ks5-btn">Check In →</div>
    </div>
  </div>

  <!-- ── SCREEN 6: Confirmation (real screenshot) ─────────── -->
  <div class="ksim" id="ks6">
    <img src="https://certxa.com/api/r2/site-assets/6b11fd91-5713-4dc9-a516-cac64de3bc32.webp" class="ks-real-shot" alt="Kiosk check-in confirmation">
    <div class="ks-confirm-cdown" id="ks-confirm-cdown">
      <svg viewBox="0 0 40 40" width="40" height="40">
        <circle cx="20" cy="20" r="16" fill="none" stroke="rgba(232,72,145,.2)" stroke-width="3"/>
        <circle cx="20" cy="20" r="16" fill="none" stroke="#e84891" stroke-width="3"
          stroke-dasharray="100.5" stroke-dashoffset="0" id="ks-cdown-arc"
          stroke-linecap="round" transform="rotate(-90 20 20)"/>
        <text x="20" y="24.5" text-anchor="middle" font-size="10" font-weight="900" fill="#18111a" id="ks-cdown-txt">30</text>
      </svg>
    </div>
  </div>

  <!-- Tap cursor overlay -->
  <div id="ks-cursor"></div>

</div><!-- /.ksim-wrap -->

<script>
(function(){
  var PHONE_DIGITS = ['5','5','5','4','7','8','2','9','9','1'];
  // digit → 0-based index in the 3×4 numpad (1..9, ⌫, 0, →)
  var DIGIT_IDX = {'1':0,'2':1,'3':2,'4':3,'5':4,'6':5,'7':6,'8':7,'9':8,'0':10};

  function fmtPhone(s){
    if(s.length<=3)return s;
    if(s.length<=6)return'('+s.slice(0,3)+') '+s.slice(3);
    return'('+s.slice(0,3)+') '+s.slice(3,6)+'-'+s.slice(6);
  }

  function show(id){
    document.querySelectorAll('.ksim').forEach(function(el){el.classList.remove('on');});
    var el=document.getElementById(id);
    if(el) el.classList.add('on');
  }

  function reset(){
    var pd=document.getElementById('ksim-phone-display');
    if(pd) pd.textContent='•••  •••  ••••';
    var h=document.getElementById('ks3-hand'),chk3=document.getElementById('ks3-chk'),b3=document.getElementById('ks3-btn');
    if(h) h.classList.remove('sel');
    if(chk3) chk3.style.display='none';
    if(b3) b3.classList.add('dim');
    var g=document.getElementById('ks4-gel'),chk4=document.getElementById('ks4-chk'),
        chip=document.getElementById('ks4-chip'),tot=document.getElementById('ks4-total'),b4=document.getElementById('ks4-btn');
    if(g) g.classList.remove('sel');
    if(chk4) chk4.style.display='none';
    if(chip) chip.style.display='none';
    if(tot) tot.style.display='none';
    if(b4) b4.classList.add('dim');
    var so=document.getElementById('ks5-sophie'),chk5=document.getElementById('ks5-chk'),b5=document.getElementById('ks5-btn');
    if(so) so.classList.remove('sel');
    if(chk5) chk5.style.display='none';
    if(b5) b5.classList.add('dim');
    var arc=document.getElementById('ks-cdown-arc'),txt=document.getElementById('ks-cdown-txt');
    if(arc) arc.setAttribute('stroke-dashoffset','0');
    if(txt) txt.textContent='30';
    var cdown=document.getElementById('ks-confirm-cdown');
    if(cdown) cdown.style.display='none';
  }

  var timers=[];
  function at(ms,fn){ timers.push(setTimeout(fn,ms)); }
  function clearAll(){ timers.forEach(clearTimeout); timers=[]; }

  var TOTAL=23500;
  var cdownInterval=null;

  // ── Cursor helpers ───────────────────────────────────
  var cur=null;
  function getCur(){ if(!cur) cur=document.getElementById('ks-cursor'); return cur; }

  function posOf(el){
    var c=getCur(); if(!c||!el) return null;
    var wrap=c.parentElement;
    var wR=wrap.getBoundingClientRect(), eR=el.getBoundingClientRect();
    return { x: eR.left-wR.left+eR.width/2, y: eR.top-wR.top+eR.height/2 };
  }

  function curTo(x,y,show){
    var c=getCur(); if(!c) return;
    c.style.left=x+'px'; c.style.top=y+'px';
    if(show!==undefined) c.style.opacity=show?'1':'0';
  }

  function curHide(){ var c=getCur(); if(c) c.style.opacity='0'; }

  function tapEl(el){
    var c=getCur(); if(!c||!el) return;
    var p=posOf(el); if(!p) return;
    c.style.left=p.x+'px'; c.style.top=p.y+'px';
    c.style.opacity='1';
    c.classList.remove('tapping');
    void c.offsetWidth;
    c.classList.add('tapping');
  }

  function tapKey(idx){
    var keys=document.querySelectorAll('#ks1 .ks-numpad .ks-key');
    tapEl(keys[idx]);
  }

  function glide(el){
    var c=getCur(); if(!c||!el) return;
    var p=posOf(el); if(!p) return;
    c.style.left=p.x+'px'; c.style.top=p.y+'px';
    c.style.opacity='1';
  }

  // ── Main loop ────────────────────────────────────────
  function run(){
    clearAll();
    if(cdownInterval){ clearInterval(cdownInterval); cdownInterval=null; }
    reset();
    cur=null; getCur();
    curHide();
    show('ks0');

    // ── Phone screen (2.2s) ──
    at(2200, function(){
      show('ks1');
      var digits='';
      var pd=document.getElementById('ksim-phone-display');
      PHONE_DIGITS.forEach(function(d,i){
        at(2200+380*(i+1), function(){
          digits+=d;
          if(pd) pd.textContent=fmtPhone(digits)||'•••  •••  ••••';
          tapKey(DIGIT_IDX[d]);
        });
      });
    });

    // tap the → key then hide cursor
    at(6380, function(){
      var keys=document.querySelectorAll('#ks1 .ks-numpad .ks-key');
      tapEl(keys[11]);
    });
    at(6700, curHide);

    // ── Welcome (7.2s) ──
    at(7200, function(){
      show('ks2');
      var w=document.getElementById('ksim-wave');
      if(w){ w.style.animation='none'; void w.offsetWidth; w.style.animation=''; }
    });

    // ── Service Type (9.0s) — real screenshot, auto-advance ──
    at(9000, function(){ show('ks3'); curHide(); });

    // auto-advance to service selection at 13.0s
    at(13000, function(){ show('ks4'); });

    // ── Services (13.0s) — real screenshot, auto-advance ──
    // auto-advance to stylist at 16.5s
    at(16500, function(){ show('ks5'); });

    // ── Stylist (16.5s) ──
    // glide to Sophie, tap + select
    at(17400, function(){ glide(document.getElementById('ks5-sophie')); });
    at(17800, function(){
      var so=document.getElementById('ks5-sophie'),chk=document.getElementById('ks5-chk'),b=document.getElementById('ks5-btn');
      tapEl(so);
      if(so) so.classList.add('sel');
      if(chk) chk.style.display='flex';
      if(b) b.classList.remove('dim');
    });

    // glide to Check In button, tap → confirmation screenshot
    at(19100, function(){ glide(document.getElementById('ks5-btn')); });
    at(19500, function(){
      tapEl(document.getElementById('ks5-btn'));
      show('ks6');
      // show countdown ring overlay
      var cdown=document.getElementById('ks-confirm-cdown');
      if(cdown) cdown.style.display='block';
      var secs=30;
      var arc=document.getElementById('ks-cdown-arc'),txt=document.getElementById('ks-cdown-txt');
      var circ=2*Math.PI*16; // r=16 in confirmation SVG
      if(arc) arc.setAttribute('stroke-dashoffset','0');
      cdownInterval=setInterval(function(){
        secs--;
        if(txt) txt.textContent=secs;
        if(arc) arc.setAttribute('stroke-dashoffset',circ*(1-secs/30));
        if(secs<=0){ clearInterval(cdownInterval); cdownInterval=null; }
      },(TOTAL-19500)/30);
    });
    at(19750, curHide);

    // ── Loop ──
    at(TOTAL, run);
  }

  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded',run);
  } else {
    run();
  }
})();
</script>

            </div>
          </div>

        </div>
      </div>

    </div>
  </div>
</section>

<!-- ══ 2. STATS STRIP ════════════════════════════════════════ -->
<div class="ck-stats-strip">
  <div class="ck-container">
    <div class="ck-stats-grid">
      <?php foreach ([
        ['💅', '2,400+', 'Salons using kiosk mode'],
        ['⚡', '< 30s',  'Avg check-in time'],
        ['📲', '98%',    'Clients prefer self check-in'],
        ['⭐', '4× more', 'Google reviews collected'],
      ] as [$icon, $val, $label]): ?>
      <div class="ck-stat-col">
        <div class="ck-stat-icon"><?= $icon ?></div>
        <div class="ck-stat-val"><?= $val ?></div>
        <div class="ck-stat-label"><?= $label ?></div>
      </div>
      <?php endforeach; ?>
    </div>
  </div>
</div>

<!-- ══ 3. HOW IT WORKS ═══════════════════════════════════════ -->
<section class="ck-section ck-section-white">
  <div class="ck-container" style="max-width:1080px;">
    <div class="ck-text-center" style="margin-bottom:64px;">
      <span class="ck-section-label">How It Works</span>
      <h2 class="ck-section-title">From the door to the chair in under 30 seconds.</h2>
      <p class="ck-section-sub" style="margin:0 auto;">The entire check-in flow is self-serve — clients do it themselves while you stay focused on the service.</p>
    </div>

    <div class="hiw-grid">

      <!-- ── Step 1: Tap the Kiosk ── -->
      <div class="hiw-step">
        <div class="hiw-icon-wrap">
          <div class="hiw-badge">1</div>
          <svg width="68" height="68" viewBox="0 0 68 68" fill="none" xmlns="http://www.w3.org/2000/svg" style="position:relative;z-index:1;">
            <!-- iPad shell -->
            <rect x="12" y="5" width="38" height="52" rx="6" fill="#ede9fe" stroke="#a78bfa" stroke-width="2"/>
            <!-- Screen -->
            <rect x="15" y="9" width="32" height="40" rx="3" fill="#fff"/>
            <!-- Home bar -->
            <rect x="26" y="52" width="10" height="3" rx="1.5" fill="#a78bfa" opacity=".5"/>
            <!-- Screen: top label -->
            <rect x="19" y="13" width="24" height="2.5" rx="1.25" fill="#ede9fe"/>
            <!-- Screen: studio name -->
            <rect x="22" y="18" width="18" height="2.5" rx="1.25" fill="#ede9fe"/>
            <!-- Screen: TAP button (pink pill) -->
            <rect x="17" y="27" width="28" height="10" rx="5" fill="#e84891" opacity=".92"/>
            <rect x="22" y="31" width="18" height="2" rx="1" fill="#fff" opacity=".9"/>
            <!-- Cursor group — animates up/down to simulate a tap -->
            <g style="animation:hiw-cursor-fall 2.4s 0.5s ease-in-out infinite; transform-origin:51px 37px;">
              <!-- Ripple ring -->
              <circle cx="51" cy="37" r="1" fill="none" stroke="#e84891" stroke-width="1.5"
                style="animation:hiw-ripple-out 2.4s 0.5s ease-out infinite;"/>
              <!-- Cursor outer glow -->
              <circle cx="51" cy="37" r="5" fill="rgba(232,72,145,.18)"/>
              <!-- Cursor dot -->
              <circle cx="51" cy="37" r="3" fill="#e84891"/>
              <circle cx="50" cy="36" r="1" fill="#fff" opacity=".6"/>
            </g>
          </svg>
        </div>
        <h3 class="hiw-title">Tap the Kiosk</h3>
        <p class="hiw-body">Client walks up to the iPad on your counter and taps to start. No staff needed — the screen guides them.</p>
      </div>

      <!-- ── Arrow 1 → 2 ── -->
      <div class="hiw-arrow">
        <svg width="32" height="20" viewBox="0 0 32 20">
          <line x1="0" y1="10" x2="22" y2="10" stroke="#c4b5fd" stroke-width="2" stroke-dasharray="4 3"/>
          <polyline points="18,4 26,10 18,16" fill="none" stroke="#a78bfa" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </div>

      <!-- ── Step 2: Enter Phone Number ── -->
      <div class="hiw-step">
        <div class="hiw-icon-wrap">
          <div class="hiw-badge">2</div>
          <svg width="68" height="68" viewBox="0 0 68 68" fill="none" xmlns="http://www.w3.org/2000/svg" style="position:relative;z-index:1;">
            <!-- Phone display bar -->
            <rect x="10" y="7" width="48" height="11" rx="3.5" fill="#fff" stroke="#e9e3f5" stroke-width="1.5"/>
            <!-- Digits in display -->
            <rect x="14" y="11" width="7" height="2.5" rx="1.25" fill="#18111a" opacity=".7"/>
            <rect x="24" y="11" width="7" height="2.5" rx="1.25" fill="#18111a" opacity=".7"/>
            <rect x="34" y="11" width="7" height="2.5" rx="1.25" fill="#18111a" opacity=".7"/>
            <rect x="44" y="11" width="5" height="2.5" rx="1.25" fill="#e84891" opacity=".9"
              style="animation:hiw-key-on 1.8s 0s infinite;"/>
            <!-- Numpad: 3×3 + bottom row, keys 14×10 px, gap 3 -->
            <!-- Row 1 -->
            <rect x="10" y="22" width="13" height="9" rx="2.5" fill="#e9e3f5"/>
            <rect x="27" y="22" width="13" height="9" rx="2.5" fill="#e9e3f5"
              style="animation:hiw-key-on 1.8s 0.3s infinite;"/>
            <rect x="44" y="22" width="13" height="9" rx="2.5" fill="#e9e3f5"/>
            <!-- Row 2 -->
            <rect x="10" y="35" width="13" height="9" rx="2.5" fill="#e9e3f5"
              style="animation:hiw-key-on 1.8s 0.9s infinite;"/>
            <rect x="27" y="35" width="13" height="9" rx="2.5" fill="#e84891"
              style="animation:hiw-key-on 1.8s 0s infinite;"/>
            <rect x="44" y="35" width="13" height="9" rx="2.5" fill="#e9e3f5"/>
            <!-- Row 3 -->
            <rect x="10" y="48" width="13" height="9" rx="2.5" fill="#e9e3f5"/>
            <rect x="27" y="48" width="13" height="9" rx="2.5" fill="#e9e3f5"
              style="animation:hiw-key-on 1.8s 0.6s infinite;"/>
            <rect x="44" y="48" width="13" height="9" rx="2.5" fill="#e9e3f5"
              style="animation:hiw-key-on 1.8s 1.2s infinite;"/>
            <!-- Bottom row: del, 0, go -->
            <rect x="10" y="60" width="13" height="6" rx="2" fill="#f0eeff" opacity=".8"/>
            <rect x="27" y="60" width="13" height="6" rx="2" fill="#f0eeff" opacity=".8"/>
            <rect x="44" y="60" width="13" height="6" rx="2" fill="#e84891" opacity=".8"/>
          </svg>
        </div>
        <h3 class="hiw-title">Enter Phone Number</h3>
        <p class="hiw-body">They type their number on the numpad. Returning clients are recognised and welcomed back by name.</p>
      </div>

      <!-- ── Arrow 2 → 3 ── -->
      <div class="hiw-arrow">
        <svg width="32" height="20" viewBox="0 0 32 20">
          <line x1="0" y1="10" x2="22" y2="10" stroke="#c4b5fd" stroke-width="2" stroke-dasharray="4 3"/>
          <polyline points="18,4 26,10 18,16" fill="none" stroke="#a78bfa" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </div>

      <!-- ── Step 3: Pick a Service ── -->
      <div class="hiw-step">
        <div class="hiw-icon-wrap">
          <div class="hiw-badge">3</div>
          <svg width="68" height="68" viewBox="0 0 68 68" fill="none" xmlns="http://www.w3.org/2000/svg" style="position:relative;z-index:1;">
            <!-- Card 1 (unselected) -->
            <rect x="5" y="14" width="25" height="36" rx="5" fill="#fff" stroke="#e9e3f5" stroke-width="1.5"/>
            <rect x="9" y="18" width="17" height="14" rx="3" fill="#f0eeff"/>
            <!-- Squiggle icon in card 1 -->
            <rect x="11" y="23" width="13" height="2" rx="1" fill="#c4b5fd" opacity=".7"/>
            <rect x="11" y="27" width="9" height="2" rx="1" fill="#c4b5fd" opacity=".5"/>
            <rect x="9" y="35" width="17" height="2" rx="1" fill="#e9e3f5"/>
            <rect x="9" y="39" width="13" height="2" rx="1" fill="#f0eeff"/>
            <rect x="9" y="43" width="10" height="2" rx="1" fill="#f0eeff"/>
            <!-- Card 2 (selected — animated) -->
            <rect x="34" y="10" width="28" height="42" rx="5" fill="#fff"
              stroke="#e9e3f5" stroke-width="2"
              style="animation:hiw-sel-border 2.8s ease-in-out infinite;"/>
            <rect x="38" y="14" width="20" height="16" rx="3" fill="#f0eeff"
              style="animation:hiw-sel-fill 2.8s ease-in-out infinite;"/>
            <!-- Icon in card 2 -->
            <rect x="40" y="19" width="16" height="2" rx="1" fill="#e84891" opacity=".6"
              style="animation:hiw-sel-border 2.8s ease-in-out infinite;"/>
            <rect x="40" y="23" width="11" height="2" rx="1" fill="#c4b5fd" opacity=".5"/>
            <rect x="38" y="33" width="20" height="2.5" rx="1.25" fill="#18111a" opacity=".6"/>
            <rect x="38" y="38" width="14" height="2" rx="1" fill="#e9e3f5"/>
            <rect x="38" y="43" width="12" height="2" rx="1" fill="#e9e3f5"/>
            <!-- Checkmark badge -->
            <circle cx="59" cy="13" r="8" fill="#e9e3f5"
              style="animation:hiw-sel-border 2.8s ease-in-out infinite; stroke:none;"/>
            <circle cx="59" cy="13" r="8" fill="#e84891"
              style="animation:hiw-sel-fill 2.8s ease-in-out infinite; stroke:none;"/>
            <polyline points="55.5,13 58,15.5 62.5,9.5"
              stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" fill="none"
              stroke-dasharray="14" stroke-dashoffset="14"
              style="animation:hiw-check-stroke 2.8s ease-in-out infinite;"/>
          </svg>
        </div>
        <h3 class="hiw-title">Pick a Service</h3>
        <p class="hiw-body">They select from your live service menu and optionally choose a preferred nail technician — or tap "any available."</p>
      </div>

      <!-- ── Arrow 3 → 4 ── -->
      <div class="hiw-arrow">
        <svg width="32" height="20" viewBox="0 0 32 20">
          <line x1="0" y1="10" x2="22" y2="10" stroke="#c4b5fd" stroke-width="2" stroke-dasharray="4 3"/>
          <polyline points="18,4 26,10 18,16" fill="none" stroke="#a78bfa" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </div>

      <!-- ── Step 4: Ticket Prints ── -->
      <div class="hiw-step">
        <div class="hiw-icon-wrap">
          <div class="hiw-badge">4</div>
          <svg width="68" height="68" viewBox="0 0 68 68" fill="none" xmlns="http://www.w3.org/2000/svg" style="position:relative;z-index:1;">
            <!-- Printer body -->
            <rect x="6" y="22" width="56" height="24" rx="6" fill="#ede9fe" stroke="#a78bfa" stroke-width="2"/>
            <!-- Printer top feed slot -->
            <rect x="18" y="14" width="32" height="10" rx="3" fill="#fff" stroke="#e9e3f5" stroke-width="1.5"/>
            <!-- Feed lines inside top slot -->
            <rect x="22" y="17" width="24" height="1.5" rx=".75" fill="#e9e3f5"/>
            <rect x="22" y="20" width="18" height="1.5" rx=".75" fill="#f0eeff"/>
            <!-- Status light (pulses green) -->
            <circle cx="53" cy="34" r="3.5" fill="#22c55e"
              style="animation:hiw-light-pulse 1.4s ease-in-out infinite;"/>
            <!-- Output slot -->
            <rect x="14" y="43" width="40" height="3" rx="1.5" fill="#c4b5fd" opacity=".4"/>
            <!-- Paper coming out (animated) -->
            <g style="animation:hiw-paper-out 3s 0.4s ease-in-out infinite; transform-origin:34px 45px;">
              <!-- Paper sheet -->
              <rect x="16" y="46" width="36" height="18" rx="3" fill="#fff" stroke="#e9e3f5" stroke-width="1.5"/>
              <!-- Lines on ticket -->
              <rect x="21" y="50" width="26" height="2.5" rx="1.25" fill="#18111a" opacity=".5"/>
              <rect x="21" y="55" width="19" height="2" rx="1" fill="#e9e3f5"/>
              <rect x="21" y="59" width="22" height="2" rx="1" fill="#e9e3f5"/>
            </g>
          </svg>
        </div>
        <h3 class="hiw-title">Ticket Prints Automatically</h3>
        <p class="hiw-body">A check-in ticket fires to your front desk printer instantly. Next available staff picks it up — zero interruption to your workflow.</p>
      </div>

    </div>
  </div>
</section>

<!-- ══ 4. FEATURES GRID ══════════════════════════════════════ -->
<section class="ck-section ck-section-light">
  <div class="ck-container" style="max-width:1080px;">
    <div class="ck-text-center" style="margin-bottom:56px;">
      <span class="ck-section-label">Kiosk Features</span>
      <h2 class="ck-section-title">Everything a busy nail studio needs at the door</h2>
    </div>
    <div class="ck-features-grid">
      <?php
      $features = [
        ['💬', 'Bilingual Support', 'Switches between English, Vietnamese, Spanish, and French — so every client feels welcome from the moment they walk in.', false],
        ['🧑‍🤝‍🧑', 'Tech Preference Selection', 'Walk-in clients choose their preferred nail technician or "any available" — reducing awkward front-desk conversations.', false],
        ['🕐', 'Live Wait Time Display', 'Clients see their estimated wait time on the kiosk and receive a text when it\'s almost their turn. No hovering.', false],
        ['🖨️', 'Instant Print Ticket', 'The moment a client checks in, a ticket is automatically sent to your front desk printer — the next available staff picks it up and gets to work.', false],
        ['✅', 'Appointment Check-In', 'Booked clients enter their phone number to confirm arrival — no front desk needed.', false],
        ['⭐', 'Automatic Google Review SMS', 'After every service, Certxa sends the client an SMS asking about their experience. One tap takes them straight to your Google review page — so happy clients leave reviews without any awkward in-person asks.', true],
        ['📊', 'Walk-In Analytics', 'See how many walk-ins you get each day, which services they prefer, peak arrival times, and average wait times.', false],
        ['🔒', 'Kiosk Lock Mode', 'Lock the Certxa app into kiosk mode so clients can only access the check-in flow. They can\'t accidentally exit or browse.', false],
        ['🎨', 'Branded to Your Studio', 'Display your studio logo on the kiosk idle screen and customise the welcome text shown to clients. Simple, clean, and on-brand.', false],
      ];
      foreach ($features as $f): ?>
      <div class="ck-feat-card <?= $f[3] ? 'highlight' : '' ?>">
        <div class="ck-feat-icon <?= $f[3] ? 'green' : '' ?>"><?= $f[0] ?></div>
        <h3 class="ck-feat-title"><?= $f[1] ?></h3>
        <p class="ck-feat-body"><?= $f[2] ?></p>
      </div>
      <?php endforeach; ?>
    </div>
  </div>
</section>

<!-- ══ 5. SMS GOOGLE REVIEW SPOTLIGHT ═══════════════════════ -->
<section class="ck-section ck-section-white">
  <div class="ck-container" style="max-width:1040px;">
    <div class="ck-review-grid">

      <!-- Phone mockup showing the SMS -->
      <div class="ck-phone-mockup">
        <div class="ck-phone">
          <div class="ck-phone-screen">
            <div class="ck-sms-header">
              <div class="ck-sms-contact">Fabulous Nails</div>
              <div class="ck-sms-number">+1 (555) 200-1234</div>
            </div>
            <div class="ck-sms-body">
              <div class="ck-sms-bubble">
                Hi Emma 👋 Thanks for visiting Fabulous Nails today! How was your experience?
              </div>
              <div class="ck-sms-bubble" style="margin-top:4px;">
                Loved it? It would mean the world to us if you left a quick Google review — it only takes 30 seconds! 🙏
              </div>
              <a href="#" class="ck-sms-link-btn">
                <div class="ck-google-g">G</div>
                Leave us a Google Review →
              </a>
              <div class="ck-sms-bubble ck-sms-bubble-out" style="margin-top:8px;">
                ⭐⭐⭐⭐⭐ Just left you a 5-star!
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Copy -->
      <div>
        <span class="ck-section-label" style="background:rgba(16,185,129,.07);border-color:rgba(16,185,129,.2);color:#059669;">New Feature</span>
        <h2 class="ck-section-title" style="margin-bottom:18px;">Turn happy clients into<br>5-star Google reviews</h2>
        <p style="font-size:1rem;color:#6b7280;line-height:1.75;margin-bottom:28px;">
          After every completed service, Certxa automatically sends your client an SMS asking about their experience. Happy clients are guided directly to your Google review page — no awkward in-person asks, no QR codes to explain, no friction.
        </p>
        <ul style="list-style:none;padding:0;margin:0;display:flex;flex-direction:column;gap:14px;">
          <?php
          $checks = [
            'Sent automatically after every service — zero effort from you',
            'Direct link to your Google Business review page',
            'Timing is configurable (15 min after checkout, same evening, next day)',
            'Unhappy clients are directed to you privately — not public reviews',
            'Track review count and rating trends in your dashboard',
          ];
          foreach ($checks as $c): ?>
          <li style="display:flex;align-items:flex-start;gap:10px;font-size:.9rem;color:#374151;">
            <span style="color:#059669;font-weight:700;margin-top:1px;flex-shrink:0;">✓</span>
            <span><?= $c ?></span>
          </li>
          <?php endforeach; ?>
        </ul>
        <div style="margin-top:32px;">
          <a href="/auth?mode=register" class="ck-btn-primary">Get More Google Reviews →</a>
        </div>
      </div>

    </div>
  </div>
</section>

<!-- ══ 6. TESTIMONIALS ═══════════════════════════════════════ -->
<section class="ck-section ck-section-mid">
  <div class="ck-container" style="max-width:1020px;">
    <div class="ck-text-center" style="margin-bottom:48px;">
      <span class="ck-section-label">Loved by Nail Studios</span>
      <h2 class="ck-section-title">What nail salon owners say</h2>
    </div>
    <div class="ck-testimonials-grid">
      <?php
      $quotes = [
        ['"Since we put the kiosk on the front counter, I haven\'t had to stop a service to greet a walk-in. My clients love it and I\'m so much less stressed."', 'Linh T.', 'Owner, Luxe Nail Studio'],
        ['"The Google review SMS alone is worth it. Our rating went from 4.1 to 4.8 in two months — just from the automatic messages Certxa sends after each visit."', 'Mai N.', 'Owner, Pink Polish Studio'],
        ['"My solo booth just feels so much more professional. Clients check in on the tablet and see their estimated wait. No awkward conversations. Game changer."', 'Sandra K.', 'Solo Nail Tech, Booth Renter'],
      ];
      foreach ($quotes as $q): ?>
      <div class="ck-testimonial-card">
        <div class="ck-t-stars">⭐⭐⭐⭐⭐</div>
        <p class="ck-t-quote"><?= $q[0] ?></p>
        <div class="ck-t-author"><?= $q[1] ?></div>
        <div class="ck-t-role"><?= $q[2] ?></div>
      </div>
      <?php endforeach; ?>
    </div>
  </div>
</section>

<!-- ══ 6b. AUTUMN AI RECEPTIONIST CALLOUT ════════════════════ -->
<section class="ck-section ck-section-white">
  <div class="ck-container" style="max-width:1040px;">
    <div style="background:linear-gradient(135deg,#3b0764 0%,#5b21b6 50%,#7c3aed 100%);border-radius:28px;padding:56px 60px;display:flex;align-items:center;gap:56px;flex-wrap:wrap;">

      <!-- Icon + badge -->
      <div style="flex-shrink:0;text-align:center;">
        <div style="width:96px;height:96px;border-radius:50%;background:rgba(255,255,255,.12);backdrop-filter:blur(8px);display:flex;align-items:center;justify-content:center;font-size:3rem;margin:0 auto 16px;">🤖</div>
        <div style="display:inline-block;background:rgba(232,72,145,.25);border:1px solid rgba(232,72,145,.4);border-radius:50px;padding:4px 14px;font-size:.72rem;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#f9a8d4;">New</div>
      </div>

      <!-- Copy -->
      <div style="flex:1;min-width:240px;">
        <h2 style="font-family:'Instrument Sans',sans-serif;font-size:clamp(1.6rem,3.5vw,2.4rem);font-weight:900;letter-spacing:-.03em;color:#fff;line-height:1.1;margin:0 0 14px;">
          Never miss another walk-in call with <em style="font-style:normal;color:#e879f9;">Autumn</em>
        </h2>
        <p style="font-size:.97rem;color:rgba(255,255,255,.72);line-height:1.75;margin:0 0 28px;">
          The kiosk handles walk-ins at your door. Autumn handles the phone — answering calls 24/7, booking appointments directly into your Certxa calendar, and upselling add-ons naturally on every call. Together they cover every channel, so nothing slips through.
        </p>
        <div style="display:flex;gap:12px;flex-wrap:wrap;">
          <a href="/autumn" style="display:inline-block;padding:13px 28px;border-radius:50px;background:linear-gradient(135deg,#e84891,#c026d3);color:#fff;font-size:.92rem;font-weight:700;text-decoration:none;box-shadow:0 6px 24px rgba(232,72,145,.4);font-family:'Instrument Sans',sans-serif;">
            Meet Autumn →
          </a>
          <a href="/auth?mode=register" style="display:inline-block;padding:13px 28px;border-radius:50px;background:transparent;border:1.5px solid rgba(255,255,255,.3);color:rgba(255,255,255,.9);font-size:.92rem;font-weight:600;text-decoration:none;font-family:'Instrument Sans',sans-serif;">
            Start Free Trial
          </a>
        </div>
      </div>

      <!-- Quick stats -->
      <div style="display:flex;flex-direction:column;gap:16px;flex-shrink:0;">
        <?php foreach ([
          ['📞', 'Answers in 2s', 'Every call, every time'],
          ['📅', 'Books live',    'Into your real calendar'],
          ['🔄', 'Zero setup',   'Reads your Certxa account'],
        ] as [$icon, $title, $sub]): ?>
        <div style="display:flex;align-items:center;gap:14px;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.1);border-radius:14px;padding:14px 18px;">
          <span style="font-size:1.5rem;flex-shrink:0;"><?= $icon ?></span>
          <div>
            <div style="font-size:.9rem;font-weight:700;color:#fff;"><?= $title ?></div>
            <div style="font-size:.78rem;color:rgba(255,255,255,.5);margin-top:2px;"><?= $sub ?></div>
          </div>
        </div>
        <?php endforeach; ?>
      </div>

    </div>
  </div>
</section>

<!-- ══ 7. FAQ ════════════════════════════════════════════════ -->
<section class="ck-section ck-section-white">
  <div class="ck-container" style="max-width:720px;">
    <div class="ck-text-center" style="margin-bottom:48px;">
      <h2 class="ck-section-title">Frequently asked questions</h2>
    </div>
    <div class="ck-faq">
      <?php
      $faqs = [
        ['What device do I need for the kiosk?', 'Any iPad or Android tablet works. Just open the Certxa app in kiosk mode — the screen locks to the check-in flow so clients can\'t browse anything else. A tablet stand or wall mount completes the setup.'],
        ['Does this replace my front desk?', 'It handles the walk-in greeting and check-in process automatically. Many single-tech studios use the kiosk as a full front desk replacement. Larger studios use it to free up staff time during busy hours.'],
        ['Can booked clients check in here too — not just walk-ins?', 'Yes — booked clients enter their phone number and are instantly marked as arrived. A ticket prints at your front desk and they\'ll appear as "checked in" on your calendar.'],
        ['How does the Google review SMS work?', 'After a client\'s service is marked complete in your SalonOS dashboard, Certxa automatically sends them an SMS asking about their experience. Happy clients tap the Google link and leave a review. If they\'re not satisfied, they\'re redirected privately to you — so negative feedback comes to you first, not Google.'],
        ['Is the kiosk included in my Certxa plan?', 'Yes — kiosk mode is included in all Certxa plans at no extra cost. Automated Google review requests are available on Professional and Elite plans. You just need a compatible tablet and the Certxa app.'],
        ['Can clients see how long they\'ll wait?', 'Yes — after checking in, the client sees an estimated wait time based on your current queue. You can also send them an automatic SMS when it\'s almost their turn so they can wait comfortably instead of standing at the door.'],
      ];
      foreach ($faqs as $f): ?>
      <div class="ck-faq-item">
        <button class="ck-faq-q">
          <?= $f[0] ?>
          <span class="ck-faq-icon">+</span>
        </button>
        <div class="ck-faq-a"><?= $f[1] ?></div>
      </div>
      <?php endforeach; ?>
    </div>
  </div>
</section>

<!-- ══ 8. CTA ════════════════════════════════════════════════ -->
<section class="ck-cta">
  <div class="ck-container" style="max-width:640px;text-align:center;position:relative;z-index:1;">
    <span class="ck-section-label" style="background:rgba(192,132,252,.12);border-color:rgba(192,132,252,.28);color:#c084fc;margin-bottom:20px;">Start today — free for <span class="js-trial-days"><?= TRIAL_DAYS ?></span> days</span>
    <h2 class="ck-cta-headline">Set up your kiosk<br><em>this afternoon.</em></h2>
    <p class="ck-cta-sub">
      Included free with every Certxa plan. Use any iPad or Android tablet you already have — quick to configure and your kiosk is live.
    </p>
    <div class="ck-cta-btns">
      <a href="/auth?mode=register" class="ck-btn-primary">Start Free Trial →</a>
      <a href="/salonos" class="ck-btn-outline">Explore SalonOS</a>
    </div>
    <div style="margin-top:24px;font-size:.8rem;color:rgba(255,255,255,.4);">Credit card required &middot; No charge until trial ends &middot; Works on any iPad or Android tablet</div>
  </div>
</section>

</div><!-- .ck-page -->

<script>
// FAQ accordion
document.querySelectorAll('.ck-faq-q').forEach(btn => {
  btn.addEventListener('click', () => {
    const item = btn.closest('.ck-faq-item');
    const wasOpen = item.classList.contains('open');
    document.querySelectorAll('.ck-faq-item').forEach(i => i.classList.remove('open'));
    if (!wasOpen) item.classList.add('open');
  });
});
</script>

<?php require __DIR__ . '/../includes/footer.php'; ?>
