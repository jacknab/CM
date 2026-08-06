<?php
define('BRAND_NAME',     'Certxa');
define('PAGE_TITLE',     'Autumn AI Receptionist for Salons | Never Miss a Booking Call — Certxa');
define('PAGE_DESC',      'Autumn answers every salon call in under 2 seconds, books appointments directly into your Certxa calendar, upsells add-ons, and handles rescheduling — 24/7. Available on every Certxa plan. Pay only for what you use.');
define('PAGE_KEYWORDS',  'salon AI receptionist, AI phone answering for salons, automated salon booking, salon virtual receptionist, AI call answering salon, salon phone automation, Autumn AI receptionist, Certxa AI receptionist');
define('PAGE_CANONICAL', 'https://certxa.com/autumn');
define('PAGE_BREADCRUMBS', json_encode([
  ['name' => 'Home',                 'url' => 'https://certxa.com/'],
  ['name' => 'Autumn AI Receptionist', 'url' => 'https://certxa.com/autumn'],
]));
define('PAGE_SCHEMA', json_encode([
  [
    '@type'       => 'WebPage',
    '@id'         => 'https://certxa.com/autumn',
    'name'        => 'Autumn AI Receptionist — Certxa',
    'description' => 'Autumn answers every salon phone call in under 2 seconds, books appointments, handles rescheduling, upsells add-ons, and answers client questions — 24/7.',
    'url'         => 'https://certxa.com/autumn',
    'isPartOf'    => ['@id' => 'https://certxa.com/#website'],
  ],
  [
    '@type'      => 'FAQPage',
    'mainEntity' => [
      ['@type'=>'Question','name'=>'Do I need a separate subscription for Autumn?','acceptedAnswer'=>['@type'=>'Answer','text'=>'No. Autumn is available on all Certxa plans — Solo, Professional, and Elite. You simply load credit to your account and enable her. There\'s no additional monthly fee.']],
      ['@type'=>'Question','name'=>'How does the credit balance work?','acceptedAnswer'=>['@type'=>'Answer','text'=>'You top up your Autumn credit balance from inside your Certxa dashboard. Autumn draws from that balance for each minute of active call time. You can set a low-balance auto top-up so she never goes offline mid-day.']],
      ['@type'=>'Question','name'=>'Does Autumn need training before she can take calls?','acceptedAnswer'=>['@type'=>'Answer','text'=>'No. From the moment you enable her, Autumn already knows your services, staff members, schedule, business hours, and pricing — pulled directly from your Certxa account. Setup takes minutes.']],
      ['@type'=>'Question','name'=>'What happens if my credit balance runs out?','acceptedAnswer'=>['@type'=>'Answer','text'=>'Autumn will stop taking new calls until the balance is topped up. We\'ll notify you well in advance and the optional auto top-up feature means you\'ll rarely run dry.']],
      ['@type'=>'Question','name'=>'Can callers tell they\'re speaking to an AI?','acceptedAnswer'=>['@type'=>'Answer','text'=>'Autumn is designed to sound warm, natural, and professional. Many callers don\'t realise she isn\'t your front-desk team. If a caller specifically asks whether they\'re speaking to an AI, Autumn will answer honestly.']],
      ['@type'=>'Question','name'=>'Does Autumn work for multi-location businesses?','acceptedAnswer'=>['@type'=>'Answer','text'=>'Yes. Autumn can be enabled independently per location, each with its own credit balance and configuration — ideal for salon groups and franchise owners.']],
    ],
  ],
]));
require __DIR__ . '/../includes/header.php';
require __DIR__ . '/../includes/nav.php';
?>

<style>
/* ── Colour tokens ─────────────────────────────────────────── */
:root {
  --plum:     #3B0764;
  --plum-mid: #5B21B6;
  --violet:   #6D28D9;
  --gold:     #F59E0B;
  --green:    #10B981;
  --cream:    #faf9ff;
}

/* ── Scroll-reveal (replaces Framer Motion whileInView) ─────── */
.fade-in {
  opacity: 0;
  transform: translateY(20px);
  transition: opacity .7s cubic-bezier(.25,.1,.25,1), transform .7s cubic-bezier(.25,.1,.25,1);
}
.fade-in.visible { opacity: 1; transform: translateY(0); }

/* ── Shared layout ──────────────────────────────────────────── */
.au2-container { max-width: 1160px; margin: 0 auto; padding: 0 24px; }
.au2-container-md { max-width: 960px; margin: 0 auto; padding: 0 24px; }
.au2-container-sm { max-width: 760px; margin: 0 auto; padding: 0 24px; }

/* ── Hero ───────────────────────────────────────────────────── */
.au2-hero {
  background: linear-gradient(135deg, #3B0764 0%, #2e0650 35%, #1a0338 100%);
  color: #fff;
  padding: 88px 24px 110px;
  position: relative;
  overflow: hidden;
}
.au2-hero-orb {
  position: absolute; border-radius: 50%; pointer-events: none;
}
.au2-hero-grid {
  max-width: 1160px; margin: 0 auto;
  display: grid; grid-template-columns: 1fr 1fr;
  gap: 60px; align-items: center;
}
.au2-live-badge {
  display: inline-flex; align-items: center; gap: 8px;
  background: rgba(16,185,129,.15); border: 1px solid rgba(16,185,129,.35);
  border-radius: 50px; padding: 6px 16px; margin-bottom: 24px;
}
.au2-live-dot {
  width: 8px; height: 8px; border-radius: 50%;
  background: var(--green); animation: au2pulse 2s infinite;
}
.au2-live-text {
  font-size: .78rem; font-weight: 600; color: #6ee7b7; letter-spacing: .06em;
}
.au2-hero h1 {
  font-size: clamp(2.4rem,4.5vw,3.8rem);
  font-weight: 800; line-height: 1.1;
  margin-bottom: 22px; letter-spacing: -.03em;
}
.au2-hero h1 em { font-style: normal; color: var(--gold); }
.au2-hero-sub {
  font-size: 1.1rem; color: rgba(255,255,255,.72);
  line-height: 1.7; margin-bottom: 38px; max-width: 500px;
}
.au2-hero-btns { display: flex; gap: 12px; flex-wrap: wrap; }
.au2-btn-primary {
  display: inline-flex; align-items: center;
  padding: 16px 36px; border-radius: 50px; font-weight: 700;
  font-size: 1rem; border: none; cursor: pointer;
  background: #6366f1; color: #fff;
  box-shadow: 0 4px 24px rgba(99,102,241,.45);
  transition: transform .15s, box-shadow .15s; text-decoration: none;
}
.au2-btn-primary:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 28px rgba(99,102,241,.6);
}
.au2-btn-outline {
  display: inline-flex; align-items: center; gap: 8px;
  padding: 14px 28px; border-radius: 50px; font-weight: 600;
  font-size: .95rem; text-decoration: none;
  border: 1px solid rgba(255,255,255,.28); color: rgba(255,255,255,.88);
  transition: background .15s, border-color .15s;
}
.au2-btn-outline:hover {
  background: rgba(255,255,255,.1);
  border-color: rgba(255,255,255,.5);
}
.au2-hero-metrics {
  display: flex; gap: 28px; margin-top: 40px;
}
.au2-metric-val { font-weight: 800; font-size: 1.3rem; color: #fff; }
.au2-metric-lbl { font-size: .75rem; color: rgba(255,255,255,.55); margin-top: 2px; }

/* ── Hero card ──────────────────────────────────────────────── */
.au2-hero-card {
  background: rgba(255,255,255,.97); border-radius: 28px;
  padding: 32px 28px;
  box-shadow: 0 32px 80px rgba(0,0,0,.35);
  border: 1px solid rgba(255,255,255,.25);
}
.au2-card-head {
  display: flex; align-items: center; justify-content: space-between;
  margin-bottom: 24px; padding-bottom: 20px;
  border-bottom: 1px solid #e9e4f5;
}
.au2-avatar-lg {
  width: 48px; height: 48px; border-radius: 50%;
  background: linear-gradient(135deg, var(--plum) 0%, var(--violet) 100%);
  display: flex; align-items: center; justify-content: center;
  color: #fff; font-weight: 800; font-size: 1.2rem;
  box-shadow: 0 4px 16px rgba(59,7,100,.4);
}
.au2-online-badge {
  display: flex; align-items: center; gap: 6px;
  background: rgba(16,185,129,.1); color: #059669;
  padding: 6px 14px; border-radius: 50px; font-size: .78rem; font-weight: 700;
}
.au2-stat-grid {
  display: grid; grid-template-columns: 1fr 1fr 1fr;
  gap: 12px; margin-bottom: 24px;
}
.au2-stat-tile {
  background: #f5f3ff; border-radius: 14px; padding: 12px 8px; text-align: center;
}
.au2-stat-tile-val { font-weight: 800; font-size: 1.2rem; color: var(--plum); }
.au2-stat-tile-lbl {
  font-size: .68rem; color: #6b7280; font-weight: 600;
  margin-top: 2px; text-transform: uppercase; letter-spacing: .04em;
}
.au2-disclaimer {
  margin-top: 10px; font-size: .65rem;
  color: #9ca3af; text-align: center; letter-spacing: .01em;
}

/* ── Hero call chat ─────────────────────────────────────────── */
.au2-hero-chat {
  display: flex; gap: 20px; margin-top: 18px;
  align-items: flex-start; height: 420px;
}
/* iPhone */
.au2-iphone {
  width: 178px; flex-shrink: 0;
  background: linear-gradient(175deg, #2c2c2e 0%, #111113 100%);
  border-radius: 50px; padding: 8px;
  box-shadow: 0 36px 90px rgba(0,0,0,.75),
              inset 0 0 0 1.5px rgba(255,255,255,.16),
              inset 0 1px 0 rgba(255,255,255,.24);
  position: relative; align-self: center;
}
.au2-iphone-btn-l1 { position:absolute;left:-4px;top:88px; width:4px;height:22px;background:linear-gradient(90deg,#1a1a1c,#333);border-radius:3px 0 0 3px; }
.au2-iphone-btn-l2 { position:absolute;left:-4px;top:122px;width:4px;height:36px;background:linear-gradient(90deg,#1a1a1c,#333);border-radius:3px 0 0 3px; }
.au2-iphone-btn-l3 { position:absolute;left:-4px;top:168px;width:4px;height:36px;background:linear-gradient(90deg,#1a1a1c,#333);border-radius:3px 0 0 3px; }
.au2-iphone-btn-r  { position:absolute;right:-4px;top:140px;width:4px;height:60px;background:linear-gradient(90deg,#333,#1a1a1c);border-radius:0 3px 3px 0; }
.au2-iphone-screen {
  border-radius: 42px; height: 394px;
  display: flex; flex-direction: column; align-items: center;
  overflow: hidden; position: relative;
  transition: background 0.5s ease;
}
.au2-dynamic-island {
  width: 90px; height: 30px; background: #000;
  border-radius: 0 0 24px 24px; flex-shrink: 0;
}
.au2-status-bar {
  width: 100%; padding: 5px 18px 0;
  display: flex; align-items: center; justify-content: space-between;
  flex-shrink: 0;
}
.au2-status-time { font-size: .7rem; color: #fff; font-weight: 700; letter-spacing: -.01em; }

/* Chat panel */
.au2-chat-panel {
  flex: 1; min-width: 0;
  display: flex; flex-direction: column;
  height: 100%;
  background: #fff; border-radius: 20px;
  box-shadow: 0 4px 24px rgba(0,0,0,.08);
  overflow: hidden; position: relative;
}
.au2-chat-body {
  flex: 1; padding: 18px 16px 10px;
  overflow-y: auto; display: flex;
  flex-direction: column; gap: 10px;
}
.au2-bubble-wrap-ai   { display:flex; justify-content:flex-start; }
.au2-bubble-wrap-user { display:flex; justify-content:flex-end;   }
.au2-bubble {
  max-width: 78%; padding: 10px 14px;
  font-size: .76rem; line-height: 1.55; font-weight: 500;
  animation: bubbleIn .25s ease;
}
.au2-bubble-ai {
  background: linear-gradient(135deg,#4f7fff 0%,#007AFF 100%);
  color: #fff;
  border-radius: 4px 18px 18px 18px;
  box-shadow: 0 2px 10px rgba(0,122,255,.25);
}
.au2-bubble-user {
  background: #E9E9EB; color: #1c1c1e;
  border-radius: 18px 4px 18px 18px;
  box-shadow: 0 1px 4px rgba(0,0,0,.06);
}
.au2-chat-bar {
  flex-shrink: 0;
  border-top: 1px solid #f0f0f0;
  padding: 10px 16px;
  display: flex; align-items: center; gap: 10px;
  background: #fafafa;
}
.au2-chat-avatar {
  width: 32px; height: 32px; border-radius: 50%; flex-shrink: 0;
  background: linear-gradient(135deg, var(--plum) 0%, var(--violet) 100%);
  display: flex; align-items: center; justify-content: center;
  color: #fff; font-weight: 800; font-size: .72rem;
  transition: opacity .4s;
}
.au2-waveform { display:flex; align-items:center; gap:2px; transition: opacity .4s; }
.au2-wave-bar {
  width: 3px; border-radius: 2px;
  background: var(--violet);
}
.au2-chat-divider { flex:1; border-top: 1.5px dotted #e0e0e0; align-self: center; }
.au2-chat-user-icon {
  width: 32px; height: 32px; border-radius: 50%; flex-shrink: 0;
  background: #E9E9EB;
  display: flex; align-items: center; justify-content: center;
  font-size: .72rem; font-weight: 700; color: #555;
  transition: opacity .4s;
}

/* Ringing overlay */
.au2-ringing-overlay {
  position: absolute; inset: 0; z-index: 10;
  display: flex; flex-direction: column;
  align-items: center; justify-content: center;
  background: rgba(255,255,255,.97);
  backdrop-filter: blur(6px); gap: 10px;
}
.au2-ring-avatar {
  width: 50px; height: 50px; border-radius: 50%;
  background: linear-gradient(135deg, var(--plum) 0%, var(--violet) 100%);
  display: flex; align-items: center; justify-content: center;
  color: #fff; font-weight: 800; font-size: 1rem;
  box-shadow: 0 4px 16px rgba(109,40,217,.35);
  position: relative; z-index: 1;
}
.au2-ring-lbl { font-size: .8rem; font-weight: 600; color: #6b7280; }
.au2-typing-dots { display: flex; gap: 5px; }
.au2-typing-dot {
  width: 6px; height: 6px; border-radius: 50%;
  background: var(--violet); opacity: 0.45;
}
.au2-ring-ripple {
  position: absolute; border-radius: 50%;
  border: 1.5px solid rgba(109,40,217,.22);
}

/* iPhone ringing content */
.au2-iphone-ringing {
  display: flex; flex-direction: column; align-items: center;
  width: 100%; flex: 1; padding-top: 6px;
}
.au2-iphone-incoming {
  font-size: .68rem; color: rgba(255,255,255,.55);
  font-weight: 500; letter-spacing: .06em;
  margin-bottom: 18px; text-align: center;
}
.au2-iphone-caller-avatar {
  position: relative; width: 82px; height: 82px;
  display: flex; align-items: center; justify-content: center; margin-bottom: 14px;
}
.au2-iphone-ripple {
  position: absolute; border-radius: 50%;
  border: 1.5px solid rgba(52,211,153,.4);
}
.au2-iphone-avatar-inner {
  width: 74px; height: 74px; border-radius: 50%;
  background: linear-gradient(135deg, #5b21b6 0%, #7c3aed 100%);
  display: flex; align-items: center; justify-content: center;
  font-size: 1.2rem; font-weight: 800; color: #fff;
  box-shadow: 0 0 0 3px rgba(255,255,255,.15); z-index: 1;
}
.au2-caller-name {
  font-size: 1rem; color: #fff; font-weight: 700;
  text-align: center; line-height: 1.2; margin-bottom: 4px;
}
.au2-caller-number {
  font-size: .65rem; color: rgba(255,255,255,.4); margin-bottom: 26px;
}
.au2-call-btns { display: flex; gap: 36px; align-items: center; }
.au2-call-btn {
  display: flex; flex-direction: column; align-items: center; gap: 6px;
}
.au2-call-btn-circle {
  width: 54px; height: 54px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
}
.au2-call-btn-lbl { font-size: .6rem; color: rgba(255,255,255,.5); }

/* iPhone connected content */
.au2-iphone-connected {
  display: flex; flex-direction: column; align-items: center;
  width: 100%; flex: 1;
}
.au2-iphone-name {
  font-size: 1.15rem; color: #fff; font-weight: 700;
  letter-spacing: -.02em; text-align: center; margin-bottom: 6px;
}
.au2-iphone-timer {
  font-size: .75rem; color: rgba(255,255,255,.5);
  font-variant-numeric: tabular-nums; letter-spacing: .04em;
  margin-bottom: 16px;
}
.au2-iphone-controls {
  display: grid; grid-template-columns: repeat(3,1fr);
  row-gap: 10px; column-gap: 6px;
  padding: 0 12px; margin-bottom: 16px; width: 100%;
}
.au2-ctrl {
  display: flex; flex-direction: column; align-items: center; gap: 4px;
}
.au2-ctrl-circle {
  width: 36px; height: 36px; border-radius: 50%;
  background: rgba(255,255,255,.16);
  display: flex; align-items: center; justify-content: center;
}
.au2-ctrl-lbl { font-size: .5rem; color: rgba(255,255,255,.55); text-align: center; }
.au2-end-call {
  width: 50px; height: 50px; border-radius: 50%;
  background: #e5373a;
  display: flex; align-items: center; justify-content: center;
  box-shadow: 0 4px 16px rgba(229,55,58,.65);
}
.au2-home-ind {
  position: absolute; bottom: 8px;
  width: 110px; height: 4px; border-radius: 2px;
  background: rgba(255,255,255,.35);
}

/* ── Stats bar ──────────────────────────────────────────────── */
.au2-stats-bar {
  background: #fff;
  border-top: 1px solid #e9e4f5; border-bottom: 1px solid #e9e4f5;
  padding: 36px 24px;
}
.au2-stats-grid {
  max-width: 1100px; margin: 0 auto;
  display: grid; grid-template-columns: repeat(4,1fr); gap: 0;
}
.au2-stat-col { padding: 0 32px; border-right: 1px solid #e9e4f5; }
.au2-stat-col:last-child { border-right: none; }
.au2-stat-col-icon {
  display: flex; align-items: center; gap: 6px;
  font-size: .78rem; font-weight: 600; color: #6b7280; margin-bottom: 6px;
}
.au2-stat-col-val { font-weight: 800; font-size: 1.7rem; color: #1c1917; }
.au2-stat-col-sub { font-size: 1rem; font-weight: 500; color: #9ca3af; margin-left: 6px; }

/* ── Section scaffolding ────────────────────────────────────── */
.au2-section          { padding: 96px 24px; }
.au2-section-cream    { background: var(--cream); }
.au2-section-white    { background: #fff; }
.au2-section-dark     { background: linear-gradient(135deg, var(--plum) 0%, #1a0338 100%); }
.au2-section-label {
  display: inline-flex; align-items: center; gap: 6px;
  background: rgba(59,7,100,.08); border: 1px solid rgba(59,7,100,.18);
  color: var(--plum-mid); border-radius: 50px;
  padding: 6px 16px; font-size: .78rem; font-weight: 700;
  letter-spacing: .06em; text-transform: uppercase; margin-bottom: 24px;
}
.au2-section-title {
  font-size: clamp(1.9rem,3vw,2.9rem); font-weight: 800;
  line-height: 1.2; letter-spacing: -.02em; color: #1c1917; margin-bottom: 20px;
}
.au2-section-title em { font-style: normal; color: var(--plum-mid); }
.au2-section-sub {
  font-size: 1.05rem; color: #6b7280;
  line-height: 1.7; margin-bottom: 0; max-width: 540px;
}

/* ── Meet Autumn ────────────────────────────────────────────── */
.au2-meet-grid {
  display: grid; grid-template-columns: 1fr 1fr;
  gap: 72px; align-items: center;
}
.au2-check-list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 16px; }
.au2-check-list li { display: flex; align-items: flex-start; gap: 14px; }
.au2-check-icon {
  width: 36px; height: 36px; border-radius: 10px; flex-shrink: 0;
  background: rgba(59,7,100,.07); color: var(--plum-mid);
  display: flex; align-items: center; justify-content: center; font-size: .9rem;
}
.au2-check-text { font-size: .92rem; color: #374151; line-height: 1.6; padding-top: 6px; }

/* Call log card */
.au2-call-card { background:#fff; border-radius:24px; box-shadow:0 12px 48px rgba(59,7,100,.12); border:1px solid #e9e4f5; overflow:hidden; }
.au2-call-card-head {
  background: linear-gradient(135deg, var(--plum) 0%, var(--violet) 100%);
  padding: 20px 24px; color: #fff;
  display: flex; align-items: center; justify-content: space-between;
}
.au2-call-card-avatar {
  width:40px; height:40px; border-radius:50%;
  background:rgba(255,255,255,.2);
  display:flex; align-items:center; justify-content:center;
  font-weight:800; font-size:1.1rem;
}
.au2-call-mini-stats {
  display: grid; grid-template-columns: 1fr 1fr 1fr;
  border-bottom: 1px solid #f0eaf8;
}
.au2-call-mini-stat {
  padding: 14px 12px; text-align: center;
  border-right: 1px solid #f0eaf8;
}
.au2-call-mini-stat:last-child { border-right: none; }
.au2-call-mini-val { font-weight: 800; font-size: 1.15rem; color: var(--plum); }
.au2-call-mini-lbl { font-size: .68rem; color: #9ca3af; font-weight: 600; margin-top: 2px; text-transform: uppercase; letter-spacing: .04em; }
.au2-call-row {
  display: flex; align-items: center; padding: 11px 20px; gap: 12px;
  border-bottom: 1px solid #f9f7fe;
}
.au2-call-row:last-child { border-bottom: none; }
.au2-call-row-avatar {
  width: 32px; height: 32px; border-radius: 50%;
  background: rgba(59,7,100,.07);
  display: flex; align-items: center; justify-content: center;
  font-size: .78rem; font-weight: 700; color: var(--plum-mid); flex-shrink: 0;
}
.au2-outcome-badge {
  font-size: .68rem; font-weight: 700; padding: 3px 9px;
  border-radius: 50px; white-space: nowrap;
}
.au2-call-card-foot {
  padding: 12px 20px; border-top: 1px solid #f0eaf8;
  display: flex; align-items: center; justify-content: center; gap: 6px;
}

/* ── Feature cards ──────────────────────────────────────────── */
.au2-features-grid {
  display: grid; grid-template-columns: repeat(3,1fr); gap: 20px;
}
.au2-feat-card {
  background: #fff; border: 1px solid #e9e4f5;
  border-radius: 20px; padding: 28px 26px;
  transition: box-shadow .2s, transform .2s;
}
.au2-feat-card:hover { box-shadow: 0 8px 32px rgba(91,33,182,.12); transform: translateY(-3px); }
.au2-feat-icon {
  width: 44px; height: 44px; border-radius: 12px;
  background: linear-gradient(135deg, var(--plum) 0%, var(--violet) 100%);
  display: flex; align-items: center; justify-content: center;
  margin-bottom: 16px; color: #fff; font-size: 1.1rem;
}
.au2-feat-title { font-weight: 700; font-size: 1rem; color: #1c1917; margin-bottom: 8px; }
.au2-feat-body  { font-size: .875rem; color: #6b7280; line-height: 1.65; }

/* ── Calendar intelligence ──────────────────────────────────── */
.au2-cal-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 20px;
}
.au2-cal-card {
  background: #fff; border-radius: 20px;
  padding: 28px 24px; border: 1px solid #e9e4f5;
  box-shadow: 0 4px 20px rgba(59,7,100,.06);
}
.au2-cal-icon {
  width: 48px; height: 48px; border-radius: 14px;
  background: linear-gradient(135deg,rgba(59,7,100,.1) 0%,rgba(109,40,217,.12) 100%);
  color: var(--plum-mid);
  display: flex; align-items: center; justify-content: center;
  margin-bottom: 16px; font-size: 1.2rem;
}

/* ── Steps ──────────────────────────────────────────────────── */
.au2-steps-grid {
  display: grid; grid-template-columns: repeat(3,1fr);
  gap: 48px; position: relative;
}
.au2-step-connector {
  position: absolute; top: 27px;
  left: calc(16.6% + 8px);
  width: calc(66.7% - 16px); height: 2px;
  background: linear-gradient(90deg, rgba(59,7,100,.4), rgba(109,40,217,.4));
  z-index: 0;
}
.au2-step { text-align: center; position: relative; z-index: 1; }
.au2-step-num {
  width: 56px; height: 56px; border-radius: 50%;
  background: linear-gradient(135deg, var(--plum) 0%, var(--violet) 100%);
  display: flex; align-items: center; justify-content: center;
  margin: 0 auto 20px; color: #fff;
  font-size: 1.25rem; font-weight: 800;
  box-shadow: 0 6px 20px rgba(59,7,100,.3);
}
.au2-step-title { font-weight: 700; font-size: 1.05rem; color: #1c1917; margin-bottom: 10px; }
.au2-step-body { font-size: .875rem; color: #6b7280; line-height: 1.65; max-width: 260px; margin: 0 auto; }

/* ── Pricing ────────────────────────────────────────────────── */
.au2-pricing-grid {
  display: grid; grid-template-columns: repeat(3,1fr);
  gap: 24px; margin-bottom: 48px;
}
.au2-pricing-card {
  border-radius: 20px; padding: 30px 26px;
  border: 1px solid #e9e4f5; background: #fff;
  transition: box-shadow .2s;
}
.au2-pricing-card-hi {
  background: linear-gradient(135deg, var(--plum) 0%, var(--violet) 100%);
  border: none; color: #fff;
  box-shadow: 0 12px 40px rgba(59,7,100,.28);
  transform: scale(1.03);
}
.au2-pricing-icon {
  width: 44px; height: 44px; border-radius: 12px;
  display: flex; align-items: center; justify-content: center;
  margin-bottom: 18px; font-size: 1.1rem;
}
.au2-plans-row {
  background: var(--cream); border: 1px solid #e9e4f5;
  border-radius: 20px; padding: 32px 36px;
  display: flex; align-items: center; gap: 24px; flex-wrap: wrap;
}
.au2-plan-badge {
  display: flex; align-items: center; gap: 6px;
  background: rgba(59,7,100,.07); border: 1px solid rgba(59,7,100,.15);
  padding: 8px 18px; border-radius: 50px;
  font-size: .82rem; font-weight: 700; color: var(--plum-mid);
}

/* ── Testimonial ────────────────────────────────────────────── */
.au2-testimonial {
  background: #fff; border-radius: 24px;
  padding: 56px 52px; text-align: center;
  box-shadow: 0 8px 40px rgba(59,7,100,.09);
  border: 1px solid #e9e4f5;
}
.au2-stars { display: flex; justify-content: center; gap: 4px; margin-bottom: 28px; }
.au2-quote {
  font-size: clamp(1.25rem,2.2vw,1.65rem); font-weight: 700;
  color: #1c1917; line-height: 1.45; margin-bottom: 32px;
  letter-spacing: -.01em;
}
.au2-quote-stats {
  display: grid; grid-template-columns: repeat(3,1fr);
  gap: 24px; margin-top: 40px; padding-top: 36px;
  border-top: 1px solid #e9e4f5;
}
.au2-qs-val { font-weight: 800; font-size: 1.8rem; color: var(--plum-mid); }
.au2-qs-lbl { font-size: .78rem; color: #9ca3af; font-weight: 600; margin-top: 4px; }

/* ── FAQ ────────────────────────────────────────────────────── */
.au2-faq-item {
  border: 1px solid #e9e4f5; border-radius: 14px;
  overflow: hidden; margin-bottom: 8px;
  transition: box-shadow .2s;
}
.au2-faq-item.open { box-shadow: 0 4px 20px rgba(59,7,100,.08); }
.au2-faq-q {
  width: 100%; text-align: left;
  padding: 20px 24px;
  display: flex; align-items: center; justify-content: space-between; gap: 16px;
  background: none; border: none; cursor: pointer;
  font-weight: 600; font-size: .93rem; color: #1c1917;
  font-family: inherit;
}
.au2-faq-icon {
  flex-shrink: 0; width: 24px; height: 24px; border-radius: 50%;
  background: #f3f0ff; color: var(--plum-mid);
  display: flex; align-items: center; justify-content: center;
  font-size: 1.1rem; line-height: 1;
  transition: background .2s, color .2s;
}
.au2-faq-item.open .au2-faq-icon {
  background: linear-gradient(135deg, #3B0764, #6D28D9);
  color: #fff;
}
.au2-faq-a {
  padding: 0 24px; font-size: .875rem; color: #6b7280;
  line-height: 1.7;
  max-height: 0; overflow: hidden;
  transition: max-height .25s ease, padding .25s ease;
}
.au2-faq-item.open .au2-faq-a {
  max-height: 400px;
  padding: 0 24px 20px;
}

/* ── CTA ────────────────────────────────────────────────────── */
.au2-cta-section {
  background: linear-gradient(135deg, var(--plum) 0%, #1a0338 100%);
  padding: 96px 24px; text-align: center; position: relative; overflow: hidden;
}
.au2-cta-orb {
  position: absolute; top: -80px; left: 50%; transform: translateX(-50%);
  width: 600px; height: 600px; border-radius: 50%;
  background: rgba(109,40,217,.2); pointer-events: none;
}
.au2-cta-h2 {
  font-size: clamp(2.2rem,4vw,3.6rem); font-weight: 800;
  line-height: 1.1; letter-spacing: -.03em; color: #fff; margin-bottom: 20px;
}
.au2-cta-sub { font-size: 1rem; color: rgba(255,255,255,.6); margin-bottom: 40px; }

/* ── Activity feed ──────────────────────────────────────────── */
#au2-activity-feed .au2-feed-row {
  display: flex; align-items: center; gap: 10px;
  padding: 9px 0; border-bottom: 1px solid rgba(229,231,235,.5);
}
.au2-feed-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
.au2-feed-text { flex: 1; font-size: .83rem; font-weight: 500; color: #1f2937; }
.au2-feed-time { font-size: .72rem; color: #9ca3af; white-space: nowrap; }

/* ── Demo modal ─────────────────────────────────────────────── */
#au2-demo-overlay {
  display: none;
  position: fixed; inset: 0; z-index: 1000;
  background: rgba(0,0,0,.55); backdrop-filter: blur(4px);
  align-items: flex-start; justify-content: center;
  overflow-y: auto; padding: 24px 16px;
}
#au2-demo-overlay.open { display: flex; }
.au2-modal {
  background: #fff; border-radius: 20px; padding: 32px 32px 28px;
  width: 100%; max-width: 460px; position: relative;
  box-shadow: 0 24px 60px rgba(0,0,0,.2); flex-shrink: 0;
}
.au2-modal-close {
  position: absolute; top: 16px; right: 16px;
  background: none; border: none; cursor: pointer;
  color: #9ca3af; padding: 4px; line-height: 1; font-size: 1.2rem;
}
.au2-modal-icon {
  width: 52px; height: 52px; border-radius: 14px;
  background: #ede9fe; display: flex; align-items: center;
  justify-content: center; margin-bottom: 18px; font-size: 1.4rem;
}
.au2-demo-badge {
  display: inline-flex; align-items: center; gap: 5px; margin-bottom: 14px;
  padding: 3px 10px; border-radius: 50px;
  background: #fef2f2; border: 1px solid #fca5a5;
}
.au2-demo-badge-dot {
  width: 6px; height: 6px; border-radius: 50%;
  background: #ef4444; display: inline-block;
  animation: au2demopulse 1.5s infinite;
}
.au2-demo-badge-text {
  font-size: .7rem; font-weight: 700; color: #dc2626;
  letter-spacing: .07em; text-transform: uppercase;
}
.au2-modal input[type=tel] {
  width: 100%; padding: 14px 16px; border-radius: 12px;
  border: 1.5px solid #e5e7eb;
  font-size: 1rem; color: #111827; outline: none;
  box-sizing: border-box; margin-bottom: 16px;
  transition: border-color .15s;
}
.au2-modal input[type=tel]:focus { border-color: #6d28d9; }
.au2-modal input[type=tel].error { border-color: #ef4444; margin-bottom: 6px; }
.au2-modal-submit {
  width: 100%; padding: 15px; border-radius: 50px;
  background: #6d28d9; color: #fff;
  font-weight: 700; font-size: 1rem;
  border: none; cursor: pointer;
  transition: background .15s; margin-bottom: 14px;
}
.au2-modal-submit:disabled { background: #a78bfa; cursor: not-allowed; }
.au2-modal-legal {
  text-align: center; font-size: .77rem; color: #9ca3af; line-height: 1.5;
}
.au2-timer-badge {
  position: absolute; top: 14px; right: 48px; z-index: 2;
  display: flex; align-items: center; gap: 5px;
  padding: 5px 11px; border-radius: 50px;
  border: 1.5px solid #c4b5fd; background: #f5f3ff;
}
.au2-timer-dot {
  width: 6px; height: 6px; border-radius: 50%;
  background: #6d28d9; display: inline-block;
  animation: au2demopulse 1.4s infinite;
}
.au2-timer-val {
  font-size: .82rem; font-weight: 700;
  font-variant-numeric: tabular-nums;
  color: #6d28d9; letter-spacing: .04em;
}

/* Demo success */
.au2-modal-success { display: none; }
.au2-phone-reveal {
  display: flex; align-items: center; gap: 14px; margin-bottom: 10px;
}
.au2-phone-check {
  width: 44px; height: 44px; border-radius: 50%; background: #d1fae5;
  display: flex; align-items: center; justify-content: center; flex-shrink: 0;
  font-size: 1.3rem;
}
.au2-phone-number { font-size: 1.6rem; font-weight: 800; color: #111827; letter-spacing: -.02em; }
.au2-phone-sub { font-size: .84rem; color: #6b7280; margin-top: 3px; }
.au2-demo-tip {
  background: #f5f3ff; border: 1px solid #ddd6fe;
  border-radius: 10px; padding: 11px 14px; margin-bottom: 18px;
  display: flex; align-items: flex-start; gap: 9px;
  font-size: .82rem; color: #4c1d95; line-height: 1.75;
}

/* Demo mini calendar */
.au2-demo-calendars { display: flex; flex-direction: column; gap: 16px; }
.au2-demo-cal-wrap {
  background: #fafafa; border-radius: 14px;
  border: 1px solid #f0eef8; padding: 12px 10px;
}
.au2-demo-7col {
  display: grid; grid-template-columns: repeat(7,1fr); gap: 4px; margin-top: 8px;
}
.au2-demo-day {
  background: #f9fafb; border: 1.5px solid #e5e7eb;
  border-radius: 10px; padding: 8px 5px; min-height: 80px;
}
.au2-demo-day.today {
  background: rgba(109,40,217,.05);
  border-color: #6D28D9;
}
.au2-demo-day-name {
  font-size: .6rem; font-weight: 700; color: #9ca3af;
  text-transform: uppercase; text-align: center;
}
.au2-demo-day.today .au2-demo-day-name { color: #6D28D9; }
.au2-demo-day-num {
  font-size: .82rem; font-weight: 800; color: #111827;
  width: 22px; height: 22px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  margin: 2px auto 4px;
}
.au2-demo-day.today .au2-demo-day-num {
  background: rgba(109,40,217,.15); color: #6D28D9;
}
.au2-demo-appt {
  border-radius: 5px; padding: 3px 4px; margin-bottom: 3px;
}
.au2-demo-appt-time { font-size: .58rem; font-weight: 700; line-height: 1.2; }
.au2-demo-appt-svc  { font-size: .56rem; color: #374151; line-height: 1.2; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.au2-demo-done-btn {
  display: block; width: 100%; padding: 10px 0; margin-top: 18px;
  border-radius: 50px; background: #6d28d9; color: #fff;
  font-weight: 700; border: none; cursor: pointer; font-size: .9rem;
}

/* ── Animations ─────────────────────────────────────────────── */
@keyframes au2pulse {
  0%, 100% { opacity: 1; }
  50%       { opacity: .4; }
}
@keyframes au2demopulse {
  0%, 100% { opacity: 1; }
  50%       { opacity: .3; }
}
@keyframes bubbleIn {
  from { opacity: 0; transform: translateY(8px) scale(.96); }
  to   { opacity: 1; transform: none; }
}
@keyframes au2wave {
  from { transform: scaleY(.35); }
  to   { transform: scaleY(1.4); }
}
@keyframes au2ringPulse {
  0%   { transform: scale(.85); opacity: .8; }
  70%  { transform: scale(1.35); opacity: 0; }
  100% { transform: scale(1.35); opacity: 0; }
}
@keyframes au2acceptPulse {
  0%, 100% { box-shadow: 0 3px 14px rgba(22,163,74,.55); }
  50%       { box-shadow: 0 3px 22px rgba(22,163,74,.9);  }
}
@keyframes au2bounce {
  0%, 80%, 100% { transform: translateY(0);   opacity: .55; }
  40%           { transform: translateY(-5px); opacity: 1;   }
}
@keyframes au2iRingPulse {
  0%   { transform: scale(.85); opacity: .8; }
  70%  { transform: scale(1.4);  opacity: 0; }
  100% { transform: scale(1.4);  opacity: 0; }
}

/* ── Responsive ─────────────────────────────────────────────── */
@media (max-width: 900px) {
  .au2-hero-grid, .au2-meet-grid { grid-template-columns: 1fr !important; }
  .au2-hero-chat  { display: none; }
  .au2-features-grid { grid-template-columns: 1fr 1fr !important; }
  .au2-steps-grid    { grid-template-columns: 1fr !important; }
  .au2-pricing-grid  { grid-template-columns: 1fr !important; }
  .au2-step-connector { display: none !important; }
  .au2-stats-grid    { grid-template-columns: 1fr 1fr !important; }
  .au2-testimonial   { padding: 36px 24px !important; }
  .au2-quote-stats   { grid-template-columns: 1fr !important; }
}
@media (max-width: 560px) {
  .au2-features-grid { grid-template-columns: 1fr !important; }
  .au2-stats-grid    { grid-template-columns: 1fr !important; }
}
</style>

<div>

<!-- ══ 1. HERO ═══════════════════════════════════════════════ -->
<section class="au2-hero">
  <div class="au2-hero-orb" style="top:-100px;right:-100px;width:500px;height:500px;background:rgba(109,40,217,.18);"></div>
  <div class="au2-hero-orb" style="bottom:-80px;left:-80px;width:380px;height:380px;background:rgba(91,33,182,.14);"></div>
  <div class="au2-hero-orb" style="top:30%;left:45%;width:260px;height:260px;background:rgba(245,158,11,.06);"></div>

  <div class="au2-hero-grid">
    <!-- Left copy -->
    <div>
      <div class="fade-in">
        <div class="au2-live-badge">
          <span class="au2-live-dot"></span>
          <span class="au2-live-text">LIVE — AUTUMN IS ANSWERING CALLS NOW</span>
        </div>
      </div>

      <div class="fade-in" style="transition-delay:.1s">
        <h1>Meet Autumn.<br><em>Your salon's AI receptionist.</em></h1>
      </div>

      <div class="fade-in" style="transition-delay:.2s">
        <p class="au2-hero-sub">
          Autumn answers every call instantly, books appointments directly into your calendar, handles rescheduling, answers client questions, and upsells add-ons — all without you lifting a finger.
        </p>
      </div>

      <div class="fade-in" style="transition-delay:.3s">
        <div class="au2-hero-btns">
          <button class="au2-btn-primary" onclick="openDemoModal()">Demo Autumn Now</button>
          <a href="/dashboard" class="au2-btn-outline">Enable for My Salon</a>
        </div>
      </div>

      <div class="fade-in" style="transition-delay:.4s">
        <div class="au2-hero-metrics">
          <?php foreach ([['< 2 sec','Answer time'],['100%','Answer rate'],['24 / 7','Always on']] as [$v,$l]): ?>
          <div>
            <div class="au2-metric-val"><?= $v ?></div>
            <div class="au2-metric-lbl"><?= $l ?></div>
          </div>
          <?php endforeach; ?>
        </div>
      </div>
    </div>

    <!-- Right — hero card with animated call widget -->
    <div class="fade-in" style="transition-delay:.45s">
      <div class="au2-hero-card">
        <div class="au2-card-head">
          <div style="display:flex;align-items:center;gap:14px;">
            <div class="au2-avatar-lg">A</div>
            <div>
              <div style="font-weight:800;font-size:1rem;color:#1c1917;">Autumn</div>
              <div style="font-size:.8rem;color:#6b7280;font-weight:500;">AI Receptionist</div>
            </div>
          </div>
          <div class="au2-online-badge">
            <span style="width:7px;height:7px;border-radius:50%;background:#10B981;display:inline-block;"></span>
            Online now
          </div>
        </div>

        <div class="au2-stat-grid">
          <?php foreach ([['47','Calls Today'],['<2s','Response'],['100%','Answer Rate']] as [$v,$l]): ?>
          <div class="au2-stat-tile">
            <div class="au2-stat-tile-val"><?= $v ?></div>
            <div class="au2-stat-tile-lbl"><?= $l ?></div>
          </div>
          <?php endforeach; ?>
        </div>

        <!-- Hero call animation widget -->
        <div class="au2-hero-chat" id="au2-hero-chat">

          <!-- iPhone mockup -->
          <div class="au2-iphone">
            <div class="au2-iphone-btn-l1"></div>
            <div class="au2-iphone-btn-l2"></div>
            <div class="au2-iphone-btn-l3"></div>
            <div class="au2-iphone-btn-r"></div>
            <div class="au2-iphone-screen" id="au2-iphone-screen"
              style="background:linear-gradient(170deg,#0c1a30 0%,#060e1e 55%,#020609 100%);">

              <div class="au2-dynamic-island"></div>

              <div class="au2-status-bar">
                <div class="au2-status-time">12:00</div>
                <div style="display:flex;align-items:center;gap:5px;">
                  <svg width="15" height="11" viewBox="0 0 15 11" fill="white">
                    <rect x="0"  y="6"   width="2.8" height="5"   rx=".6" opacity=".4"/>
                    <rect x="4"  y="4.5" width="2.8" height="6.5" rx=".6" opacity=".65"/>
                    <rect x="8"  y="2.5" width="2.8" height="8.5" rx=".6" opacity=".85"/>
                    <rect x="12" y="0"   width="2.8" height="11"  rx=".6"/>
                  </svg>
                  <svg width="13" height="10" viewBox="0 0 13 10" fill="none">
                    <circle cx="6.5" cy="9" r="1.2" fill="white"/>
                    <path d="M3.2 6.2a4.66 4.66 0 0 1 6.6 0" stroke="white" stroke-width="1.2" stroke-linecap="round"/>
                    <path d="M1 3.8A8 8 0 0 1 12 3.8" stroke="white" stroke-width="1.2" stroke-linecap="round" opacity=".6"/>
                  </svg>
                  <svg width="20" height="10" viewBox="0 0 20 10" fill="none">
                    <rect x=".5" y=".5" width="16" height="9" rx="2.2" stroke="white" stroke-opacity=".5"/>
                    <rect x="1.5" y="1.5" width="11" height="7" rx="1.4" fill="white"/>
                    <path d="M17.5 3.5v3a1.5 1.5 0 0 0 0-3z" fill="white" opacity=".45"/>
                  </svg>
                </div>
              </div>

              <!-- Ringing state -->
              <div id="au2-iphone-ringing" class="au2-iphone-ringing">
                <div class="au2-iphone-incoming">incoming call</div>
                <div class="au2-iphone-caller-avatar">
                  <div class="au2-iphone-ripple" style="width:108px;height:108px;animation:au2iRingPulse 1.8s .0s ease-out infinite;"></div>
                  <div class="au2-iphone-ripple" style="width:134px;height:134px;animation:au2iRingPulse 1.8s .35s ease-out infinite;"></div>
                  <div class="au2-iphone-ripple" style="width:160px;height:160px;animation:au2iRingPulse 1.8s .7s ease-out infinite;"></div>
                  <div class="au2-iphone-avatar-inner">FN</div>
                </div>
                <div class="au2-caller-name">Fabulous Nails</div>
                <div class="au2-caller-number">+1 (619) 604-6886</div>
                <div class="au2-call-btns">
                  <div class="au2-call-btn">
                    <div class="au2-call-btn-circle" style="background:#dc2626;box-shadow:0 4px 16px rgba(220,38,38,.5);">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="transform:rotate(135deg)"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.93 13 19.79 19.79 0 0 1 1.92 4.38 2 2 0 0 1 3.89 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
                    </div>
                    <div class="au2-call-btn-lbl">Decline</div>
                  </div>
                  <div class="au2-call-btn">
                    <div class="au2-call-btn-circle" style="background:#16a34a;box-shadow:0 4px 16px rgba(22,163,74,.55);animation:au2acceptPulse 1.2s ease-in-out infinite;">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.93 13 19.79 19.79 0 0 1 1.92 4.38 2 2 0 0 1 3.89 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
                    </div>
                    <div class="au2-call-btn-lbl">Accept</div>
                  </div>
                </div>
              </div>

              <!-- Connected state (hidden initially) -->
              <div id="au2-iphone-connected" class="au2-iphone-connected" style="display:none;margin-top:20px;">
                <div class="au2-iphone-name">Fabulous Nails</div>
                <div class="au2-iphone-timer" id="au2-call-timer">0:00</div>
                <div class="au2-iphone-controls">
                  <?php
                  $controls = [
                    ['mute','M'],['keypad','#'],['speaker','🔊'],
                    ['add','➕'],['video','📹'],['contacts','👤'],
                  ];
                  foreach ($controls as [$lbl,$ico]):
                  ?>
                  <div class="au2-ctrl">
                    <div class="au2-ctrl-circle"><span style="font-size:.75rem;"><?= $ico ?></span></div>
                    <div class="au2-ctrl-lbl"><?= $lbl ?></div>
                  </div>
                  <?php endforeach; ?>
                </div>
                <div class="au2-end-call">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="transform:rotate(135deg)"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.93 13 19.79 19.79 0 0 1 1.92 4.38 2 2 0 0 1 3.89 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
                </div>
                <div class="au2-home-ind"></div>
              </div>

            </div><!-- /screen -->
          </div><!-- /iphone -->

          <!-- Chat panel -->
          <div class="au2-chat-panel">
            <!-- Ringing overlay -->
            <div class="au2-ringing-overlay" id="au2-ringing-overlay">
              <div style="position:relative;width:56px;height:56px;display:flex;align-items:center;justify-content:center;">
                <div class="au2-ring-ripple" style="width:76px;height:76px;animation:au2ringPulse 1.8s .0s ease-out infinite;"></div>
                <div class="au2-ring-ripple" style="width:96px;height:96px;animation:au2ringPulse 1.8s .4s ease-out infinite;"></div>
                <div class="au2-ring-avatar">A</div>
              </div>
              <div class="au2-ring-lbl">Autumn is answering…</div>
              <div class="au2-typing-dots">
                <div class="au2-typing-dot" style="animation:au2bounce 1.1s .00s infinite;"></div>
                <div class="au2-typing-dot" style="animation:au2bounce 1.1s .18s infinite;"></div>
                <div class="au2-typing-dot" style="animation:au2bounce 1.1s .36s infinite;"></div>
              </div>
            </div>

            <div class="au2-chat-body" id="au2-bubbles"></div>

            <div class="au2-chat-bar">
              <div class="au2-chat-avatar" id="au2-ai-avatar">A</div>
              <div class="au2-waveform" id="au2-waveform">
                <?php
                $heights = [4,7,11,8,13,6,9,5,12,7,10,4];
                foreach ($heights as $i => $h):
                ?>
                <div class="au2-wave-bar" style="height:<?= $h ?>px;animation:au2wave 0.9s <?= $i * 0.06 ?>s ease-in-out infinite alternate;"></div>
                <?php endforeach; ?>
              </div>
              <div class="au2-chat-divider"></div>
              <div class="au2-chat-user-icon" id="au2-user-icon">👤</div>
            </div>
          </div>

        </div><!-- /hero-chat -->

        <p class="au2-disclaimer">Simulated call flow — Autumn is not a website chatbot.</p>
      </div>
    </div>
  </div>
</section>

<!-- ══ 2. STATS BAR ════════════════════════════════════════════ -->
<section class="au2-stats-bar">
  <div class="au2-stats-grid">
    <?php
    $stats = [
      ['📞','Calls Answered','2,847','this week'],
      ['📅','Appointments Booked','1,203',''],
      ['⚡','Avg Response Time','< 2 sec',''],
      ['⭐','Client Satisfaction','98.4%',''],
    ];
    foreach ($stats as $i => [$icon,$lbl,$val,$sub]):
    ?>
    <div class="au2-stat-col fade-in" style="transition-delay:<?= $i * 0.08 ?>s">
      <div class="au2-stat-col-icon"><?= $icon ?> <?= $lbl ?></div>
      <div class="au2-stat-col-val">
        <?= $val ?>
        <?php if ($sub): ?><span class="au2-stat-col-sub"><?= $sub ?></span><?php endif; ?>
      </div>
    </div>
    <?php endforeach; ?>
  </div>
</section>

<!-- ══ 3. MEET AUTUMN ══════════════════════════════════════════ -->
<section class="au2-section au2-section-cream">
  <div class="au2-container">
    <div class="au2-meet-grid">

      <!-- Left -->
      <div class="fade-in">
        <div class="au2-section-label">✨ Meet Autumn</div>
        <h2 class="au2-section-title">
          A receptionist who never puts<br>
          <em>a caller on hold.</em>
        </h2>
        <p class="au2-section-sub" style="margin-bottom:36px;">
          Autumn is deeply integrated with your Certxa account. From the moment she's activated, she knows every service you offer, every staff member's schedule, your business hours, and your booking rules.
        </p>

        <ul class="au2-check-list">
          <?php foreach ([
            ['📅', 'Books, reschedules, and cancels appointments in real time'],
            ['💬', 'Answers questions about services, prices, and availability'],
            ['📈', 'Upsells add-ons and premium services on every call'],
            ['👤', 'Recognises returning clients and personalises the experience'],
            ['📞', 'Fills calendar gaps and keeps your schedule fully booked'],
          ] as [$ico, $txt]): ?>
          <li>
            <div class="au2-check-icon"><?= $ico ?></div>
            <span class="au2-check-text"><?= $txt ?></span>
          </li>
          <?php endforeach; ?>
        </ul>
      </div>

      <!-- Right — call log card -->
      <div class="fade-in" style="transition-delay:.2s">
        <div class="au2-call-card">
          <div class="au2-call-card-head">
            <div style="display:flex;align-items:center;gap:12px;">
              <div class="au2-call-card-avatar">A</div>
              <div>
                <div style="font-weight:700;font-size:.9rem;">Autumn — Call History</div>
                <div style="font-size:.75rem;opacity:.7;">Your AI receptionist activity</div>
              </div>
            </div>
            <div style="display:flex;align-items:center;gap:6px;background:rgba(16,185,129,.25);padding:4px 12px;border-radius:50px;font-size:.72rem;font-weight:700;color:#6ee7b7;">
              <span style="width:6px;height:6px;border-radius:50%;background:#10B981;display:inline-block;"></span>
              Active
            </div>
          </div>

          <div class="au2-call-mini-stats">
            <?php foreach ([['34','Calls Today'],['2m 18s','Avg Duration'],['21','Bookings']] as [$v,$l]): ?>
            <div class="au2-call-mini-stat">
              <div class="au2-call-mini-val"><?= $v ?></div>
              <div class="au2-call-mini-lbl"><?= $l ?></div>
            </div>
            <?php endforeach; ?>
          </div>

          <?php
          $calls = [
            ['S','Sarah M.','(305) 555-0142','Booked',  '1m 54s','9:12 AM', 'rgba(16,185,129,.1)', '#059669'],
            ['J','James T.','(786) 555-0388','Rescheduled','2m 31s','9:47 AM','rgba(59,130,246,.1)','#2563eb'],
            ['E','Emma L.', '(954) 555-0271','Cancelled','0m 58s','10:03 AM','rgba(245,158,11,.1)', '#b45309'],
            ['P','Priya K.','(305) 555-0519','Booked',  '3m 07s','10:22 AM','rgba(16,185,129,.1)', '#059669'],
            ['M','Marcus W.','(786) 555-0934','Booked', '2m 45s','10:55 AM','rgba(16,185,129,.1)', '#059669'],
          ];
          foreach ($calls as $i => [$init,$name,$phone,$outcome,$dur,$time,$bg,$col]):
          ?>
          <div class="au2-call-row">
            <div class="au2-call-row-avatar"><?= $init ?></div>
            <div style="flex:1;min-width:0;">
              <div style="font-weight:600;font-size:.82rem;color:#1c1917;"><?= $name ?></div>
              <div style="font-size:.72rem;color:#9ca3af;"><?= $phone ?></div>
            </div>
            <span class="au2-outcome-badge" style="background:<?= $bg ?>;color:<?= $col ?>;"><?= $outcome ?></span>
            <div style="text-align:right;flex-shrink:0;">
              <div style="font-size:.78rem;font-weight:600;color:#374151;"><?= $dur ?></div>
              <div style="font-size:.68rem;color:#9ca3af;"><?= $time ?></div>
            </div>
          </div>
          <?php endforeach; ?>

          <div class="au2-call-card-foot">
            <span style="color:#10B981;">✓</span>
            <span style="font-size:.75rem;font-weight:600;color:#6b7280;">Every call logged automatically — nothing slips through</span>
          </div>
        </div>
      </div>

    </div>
  </div>
</section>

<!-- ══ 4. FEATURES GRID ════════════════════════════════════════ -->
<section class="au2-section au2-section-white">
  <div class="au2-container">
    <div class="fade-in" style="text-align:center;margin-bottom:64px;">
      <h2 class="au2-section-title" style="max-width:680px;margin:0 auto 16px;">
        Everything a great receptionist does,<br>
        <em>without the overhead.</em>
      </h2>
      <p class="au2-section-sub" style="max-width:580px;margin:0 auto;">
        Autumn handles your front-desk calls completely — from first ring to confirmed booking.
      </p>
    </div>

    <div class="au2-features-grid">
      <?php
      $features = [
        ['📞','Instant answer, every time',      'Autumn picks up within two seconds, rain or shine. No more missed calls while your stylists are mid-service.'],
        ['📅','Real-time booking',               'She sees live availability across all staff and books — or reschedules — directly into your Certxa calendar.'],
        ['📈','Built-in upselling',              'Autumn naturally suggests add-ons and upgrades on every call, increasing your average ticket without any training.'],
        ['👤','Client recognition',              'Returning clients are greeted by name. Autumn knows their history and can pull up their last appointment.'],
        ['🛡️','Policy enforcement',             'Autumn applies your cancellation policy and handles late-notice requests gracefully — no awkward conversations for your team.'],
        ['🛡️','Protection layer',               'Spam filter included — robocalls, telemarketers, and obvious loops are ended in the first few seconds.'],
        ['🔊','Natural conversation',            'Autumn sounds warm, professional, and human. Callers routinely can\'t tell she isn\'t your front-desk team.'],
        ['🔄','Always up to date',               'Change your services, hours, or staff? Autumn syncs automatically — no retraining required.'],
        ['⚡','Zero setup friction',             'Autumn reads your Certxa account from day one. You\'re live in minutes, not days.'],
      ];
      foreach ($features as $i => [$ico,$title,$body]):
      ?>
      <div class="au2-feat-card fade-in" style="transition-delay:<?= $i * 0.06 ?>s">
        <div class="au2-feat-icon"><?= $ico ?></div>
        <h3 class="au2-feat-title"><?= $title ?></h3>
        <p class="au2-feat-body"><?= $body ?></p>
      </div>
      <?php endforeach; ?>
    </div>
  </div>
</section>

<!-- ══ 4b. CALENDAR INTELLIGENCE ══════════════════════════════ -->
<section class="au2-section au2-section-cream">
  <div class="au2-container-md">
    <div class="fade-in" style="text-align:center;margin-bottom:64px;">
      <div class="au2-section-label">📅 Calendar Intelligence</div>
      <h2 class="au2-section-title" style="max-width:680px;margin:0 auto 16px;">
        Autumn keeps your calendar full.<br>
        <em>Not just answered — optimised.</em>
      </h2>
      <p class="au2-section-sub" style="max-width:600px;margin:0 auto;">
        Every gap in your day is lost revenue. Autumn doesn't just take bookings — she actively works your schedule to maximise utilisation and client value.
      </p>
    </div>

    <div class="au2-cal-grid">
      <?php
      $cal = [
        ['⏰','Fills dead time automatically',   'Autumn spots open slots and works to fill them — reaching out, suggesting alternatives, and keeping the waitlist moving.'],
        ['🔄','Increases repeat bookings',        'She nudges lapsed clients, reminds regulars it\'s time to rebook, and turns one-time visitors into loyal regulars.'],
        ['📈','Pushes upsells intelligently',     'Based on service history and slot duration, Autumn suggests the right add-ons at exactly the right moment.'],
        ['⭐','Prioritises high-value clients',   'VIP clients and high-ticket services get preference when slots are tight — Autumn knows who matters most.'],
        ['📊','Smooths calendar utilisation',     'No more back-to-back chaos or dead afternoons. Autumn distributes bookings to match your team\'s rhythm.'],
      ];
      foreach ($cal as $i => [$ico,$title,$body]):
      ?>
      <div class="au2-cal-card fade-in" style="transition-delay:<?= $i * 0.07 ?>s">
        <div class="au2-cal-icon"><?= $ico ?></div>
        <div style="font-weight:700;font-size:.95rem;color:#1c1917;margin-bottom:8px;"><?= $title ?></div>
        <div style="font-size:.85rem;color:#6b7280;line-height:1.65;"><?= $body ?></div>
      </div>
      <?php endforeach; ?>
    </div>
  </div>
</section>

<!-- ══ 5. HOW IT WORKS ═════════════════════════════════════════ -->
<section class="au2-section au2-section-white">
  <div class="au2-container-md">
    <div class="fade-in" style="text-align:center;margin-bottom:72px;">
      <h2 class="au2-section-title">Up and running in minutes</h2>
      <p class="au2-section-sub" style="max-width:480px;margin:0 auto;">
        Autumn works with the data already inside your Certxa account. There's nothing to configure from scratch.
      </p>
    </div>

    <div class="au2-steps-grid">
      <div class="au2-step-connector"></div>
      <?php
      $steps = [
        ['1','Load your account balance',   'Head to the Autumn section in your Certxa dashboard and add credit to your account. You choose how much to load.'],
        ['2','Activate Autumn',             'Enable Autumn with one click. She reads your services, staff, and calendar automatically — no manual setup.'],
        ['3','Forward your calls',          'Point your salon phone to Autumn\'s number. She starts answering immediately. Your balance covers every minute she\'s on a call.'],
      ];
      foreach ($steps as $i => [$num,$title,$body]):
      ?>
      <div class="au2-step fade-in" style="transition-delay:<?= $i * 0.1 ?>s">
        <div class="au2-step-num"><?= $num ?></div>
        <h3 class="au2-step-title"><?= $title ?></h3>
        <p class="au2-step-body"><?= $body ?></p>
      </div>
      <?php endforeach; ?>
    </div>
  </div>
</section>

<!-- ══ 6. PRICING ══════════════════════════════════════════════ -->
<section class="au2-section au2-section-white" style="padding-top:0;">
  <div class="au2-container-md">
    <div class="fade-in" style="text-align:center;margin-bottom:60px;">
      <div class="au2-section-label">💳 How Pricing Works</div>
      <h2 class="au2-section-title">Pay for what Autumn actually uses.</h2>
      <p class="au2-section-sub" style="max-width:540px;margin:0 auto;">
        Autumn is available on every Certxa plan. There's no extra subscription — instead you load funds into your account and Autumn draws from that balance as she handles calls.
      </p>
    </div>

    <div class="au2-pricing-grid">
      <?php
      $pricing = [
        ['💳','Load your balance',     'Add any amount to your Autumn credit balance directly from your Certxa dashboard. Funds never expire.',false],
        ['📞','Autumn handles calls',  'Every minute Autumn spends on an active call draws from your balance. Nothing is charged when she\'s idle.',true],
        ['📈','Auto top-up (optional)','Set a low-balance threshold and Certxa will top up your account automatically — so Autumn never stops mid-day.',false],
      ];
      foreach ($pricing as $i => [$ico,$title,$body,$hi]):
      ?>
      <div class="au2-pricing-card <?= $hi ? 'au2-pricing-card-hi' : '' ?> fade-in" style="transition-delay:<?= $i * 0.1 ?>s">
        <div class="au2-pricing-icon" style="background:<?= $hi ? 'rgba(255,255,255,.15)' : 'rgba(59,7,100,.07)' ?>;color:<?= $hi ? '#fff' : '#5B21B6' ?>;"><?= $ico ?></div>
        <h3 style="font-weight:700;font-size:1rem;margin-bottom:10px;color:<?= $hi ? '#fff' : '#1c1917' ?>;"><?= $title ?></h3>
        <p style="font-size:.875rem;line-height:1.65;color:<?= $hi ? 'rgba(255,255,255,.8)' : '#6b7280' ?>;"><?= $body ?></p>
      </div>
      <?php endforeach; ?>
    </div>

    <div class="au2-plans-row fade-in">
      <div style="flex:1;min-width:240px;">
        <h3 style="font-weight:700;font-size:1.05rem;color:#1c1917;margin-bottom:8px;">Works with every Certxa plan</h3>
        <p style="font-size:.88rem;color:#6b7280;line-height:1.6;">
          Autumn is an add-on available to Solo, Professional, and Elite subscribers. Simply load credit and enable her — no plan upgrade required.
        </p>
      </div>
      <div style="display:flex;gap:12px;flex-wrap:wrap;">
        <?php foreach (['Solo','Professional','Elite'] as $plan): ?>
        <div class="au2-plan-badge">✅ <?= $plan ?></div>
        <?php endforeach; ?>
      </div>
    </div>
  </div>
</section>

<!-- ══ 7. TESTIMONIAL ══════════════════════════════════════════ -->
<section class="au2-section au2-section-cream">
  <div class="au2-container-sm">
    <div class="au2-testimonial fade-in">
      <div class="au2-stars">
        <?php for ($i=0;$i<5;$i++): ?>
        <span style="font-size:1.2rem;">⭐</span>
        <?php endfor; ?>
      </div>
      <blockquote class="au2-quote">
        "Autumn paid for herself in the first week. We stopped missing calls, our booking rate went up 34%, and my staff finally stopped running to the phone mid-haircut."
      </blockquote>
      <div style="font-weight:700;color:#1c1917;font-size:.95rem;">Jessica R.</div>
      <div style="color:#9ca3af;font-size:.83rem;margin-top:4px;">Owner, Luxe Hair Studio</div>
      <div class="au2-quote-stats">
        <?php foreach ([['34%','More bookings'],['Zero','Missed calls'],['10 min','Setup time']] as [$v,$l]): ?>
        <div>
          <div class="au2-qs-val"><?= $v ?></div>
          <div class="au2-qs-lbl"><?= $l ?></div>
        </div>
        <?php endforeach; ?>
      </div>
    </div>
  </div>
</section>

<!-- ══ 8. FAQ ══════════════════════════════════════════════════ -->
<section class="au2-section au2-section-white">
  <div class="au2-container-sm">
    <div class="fade-in" style="text-align:center;margin-bottom:48px;">
      <h2 class="au2-section-title">Common questions</h2>
    </div>

    <?php
    $faqs = [
      ['Do I need a separate subscription for Autumn?',
       'No. Autumn is available on all Certxa plans — Solo, Professional, and Elite. You simply load credit to your account and enable her. There\'s no additional monthly fee.'],
      ['How does the credit balance work?',
       'You top up your Autumn credit balance from inside your Certxa dashboard. Autumn draws from that balance for each minute of active call time. You can set a low-balance auto top-up so she never goes offline mid-day.'],
      ['Does Autumn need training before she can take calls?',
       'No. From the moment you enable her, Autumn already knows your services, staff members, schedule, business hours, and pricing — pulled directly from your Certxa account. Setup takes minutes.'],
      ['What happens if my credit balance runs out?',
       'Autumn will stop taking new calls until the balance is topped up. We\'ll notify you well in advance and the optional auto top-up feature means you\'ll rarely run dry.'],
      ['Can callers tell they\'re speaking to an AI?',
       'Autumn is designed to sound warm, natural, and professional. Many callers don\'t realise she isn\'t your front-desk team. If a caller specifically asks whether they\'re speaking to an AI, Autumn will answer honestly.'],
      ['Does Autumn work for multi-location businesses?',
       'Yes. Autumn can be enabled independently per location, each with its own credit balance and configuration — ideal for salon groups and franchise owners.'],
    ];
    foreach ($faqs as $i => [$q,$a]):
    ?>
    <div class="au2-faq-item fade-in" style="transition-delay:<?= $i * 0.06 ?>s">
      <button class="au2-faq-q" onclick="toggleFaq(this)">
        <?= htmlspecialchars($q) ?>
        <span class="au2-faq-icon">+</span>
      </button>
      <div class="au2-faq-a"><?= htmlspecialchars($a) ?></div>
    </div>
    <?php endforeach; ?>
  </div>
</section>

<!-- ══ 9. CTA BANNER ══════════════════════════════════════════ -->
<section class="au2-cta-section">
  <div class="au2-cta-orb"></div>
  <div style="max-width:680px;margin:0 auto;position:relative;z-index:1;">
    <div class="fade-in">
      <h2 class="au2-cta-h2">
        Your phone is ringing.<br>Is Autumn there?
      </h2>
    </div>
    <div class="fade-in" style="transition-delay:.1s">
      <p class="au2-cta-sub">Call Autumn yourself — enter your number and get a live demo in seconds.</p>
    </div>
    <div class="fade-in" style="transition-delay:.2s">
      <div style="display:flex;gap:20px;justify-content:center;align-items:center;flex-wrap:wrap;">
        <button class="au2-btn-primary" onclick="openDemoModal()">Try Free Demo</button>
        <a href="/contact" style="font-size:1rem;font-weight:700;color:#fff;text-decoration:none;opacity:.85;transition:opacity .15s;"
           onmouseover="this.style.opacity='.6'" onmouseout="this.style.opacity='.85'">
          Talk to Sales
        </a>
      </div>
    </div>
  </div>
</section>

</div><!-- end page wrapper -->

<!-- ══ DEMO MODAL ════════════════════════════════════════════ -->
<div id="au2-demo-overlay" onclick="if(event.target===this)closeDemoModal()">
  <div class="au2-modal" id="au2-modal-box">

    <!-- Timer badge (success state) -->
    <div class="au2-timer-badge" id="au2-timer-badge" style="display:none;">
      <span class="au2-timer-dot"></span>
      <span class="au2-timer-val" id="au2-timer-val">5:00</span>
    </div>

    <!-- Close -->
    <button class="au2-modal-close" onclick="closeDemoModal()">✕</button>

    <!-- ── Step 1: phone entry ── -->
    <div id="au2-modal-step1">
      <div class="au2-modal-icon">📞</div>
      <div class="au2-demo-badge">
        <span class="au2-demo-badge-dot"></span>
        <span class="au2-demo-badge-text">Real Live Demo</span>
      </div>
      <h2 style="font-size:1.45rem;font-weight:800;color:#111827;margin-bottom:6px;">Try Autumn — Fabulous Nails</h2>

      <div style="background:#f5f3ff;border:1px solid #ddd6fe;border-radius:12px;padding:13px 16px;margin-bottom:16px;">
        <div style="font-weight:700;font-size:.88rem;color:#4c1d95;margin-bottom:7px;">💅 What to do:</div>
        <ul style="margin:0;padding:0 0 0 16px;font-size:.83rem;color:#374151;line-height:1.95;">
          <li>Call the number we give you and ask Autumn to <strong>book an appointment</strong></li>
          <li>Pick <strong>any day of the week</strong> shown on the calendar</li>
          <li>You can even <strong>request a specific technician</strong> by name</li>
        </ul>
      </div>

      <p style="font-size:.88rem;color:#6b7280;line-height:1.6;margin-bottom:22px;">
        Enter your phone number to unlock the demo line. This is a
        <strong style="color:#111827;">real live call</strong> to a real AI receptionist —
        once you submit you'll have exactly
        <strong style="color:#6d28d9;">5 minutes</strong> to try it.
      </p>

      <form onsubmit="submitDemoForm(event)">
        <label style="display:block;font-size:.85rem;font-weight:600;color:#374151;margin-bottom:8px;">Your Phone Number</label>
        <input type="tel" id="au2-phone-input" placeholder="(555) 867–5309" autocomplete="tel" />
        <p id="au2-phone-error" style="color:#ef4444;font-size:.82rem;margin-bottom:12px;display:none;"></p>
        <button type="submit" class="au2-modal-submit" id="au2-submit-btn">Start My 5-Minute Demo →</button>
        <p class="au2-modal-legal">US numbers only · One demo per number · We store your number only to prevent repeat demos and keep costs fair.</p>
      </form>
    </div>

    <!-- ── Step 2: success / calendar ── -->
    <div id="au2-modal-step2" class="au2-modal-success">
      <div class="au2-modal-icon">📞</div>

      <div class="au2-phone-reveal">
        <div class="au2-phone-check">✅</div>
        <div>
          <div class="au2-phone-number" id="au2-demo-phone">(619) 604-6886</div>
          <p class="au2-phone-sub" id="au2-demo-sub">Call now and book an appointment. Watch the calendar update live!</p>
        </div>
      </div>

      <div class="au2-demo-tip">
        <span style="font-size:1.1rem;flex-shrink:0;">💡</span>
        <div><strong>Tip:</strong> Tell Autumn which day works for you — any day shown below.
          You can also <strong>request a specific technician</strong> by name and she'll check their availability.</div>
      </div>

      <div class="au2-demo-calendars" id="au2-demo-calendars"></div>

      <button class="au2-demo-done-btn" onclick="closeDemoModal()">Done</button>
    </div>

  </div>
</div>

<?php require __DIR__ . '/../includes/footer.php'; ?>

<script>
/* ══════════════════════════════════════════════════════════
   SCROLL REVEAL
══════════════════════════════════════════════════════════ */
(function() {
  var obs = new IntersectionObserver(function(entries) {
    entries.forEach(function(e) {
      if (e.isIntersecting) { e.target.classList.add('visible'); obs.unobserve(e.target); }
    });
  }, { threshold: 0.08, rootMargin: '-60px 0px' });
  document.querySelectorAll('.fade-in').forEach(function(el) { obs.observe(el); });
})();

/* ══════════════════════════════════════════════════════════
   FAQ ACCORDION
══════════════════════════════════════════════════════════ */
function toggleFaq(btn) {
  var item = btn.closest('.au2-faq-item');
  var icon = btn.querySelector('.au2-faq-icon');
  var isOpen = item.classList.contains('open');
  document.querySelectorAll('.au2-faq-item.open').forEach(function(el) {
    el.classList.remove('open');
    el.querySelector('.au2-faq-icon').textContent = '+';
  });
  if (!isOpen) {
    item.classList.add('open');
    icon.textContent = '×';
  }
}

/* ══════════════════════════════════════════════════════════
   HERO CALL CHAT ANIMATION
══════════════════════════════════════════════════════════ */
(function() {
  var SCENARIOS = [
    [
      { from:'autumn', text:'Thank you for calling Fabulous Nails! This is Autumn. How can I help you today?' },
      { from:'client', text:'Hi! I\'d like to book a gel manicure this Wednesday.' },
      { from:'autumn', text:'Perfect — Wednesday at 3:00 PM with Lily is open. Want me to book that for you?' }
    ],
    [
      { from:'client', text:'Hi, I need to reschedule my Thursday appointment.' },
      { from:'autumn', text:'Of course! I can help with that. What\'s the name on the booking?' },
      { from:'client', text:'It\'s Sarah Johnson.' },
      { from:'autumn', text:'Got it, Sarah — moved you to Saturday at 10:00 AM. Confirmation text on its way!' }
    ]
  ];
  var DELAYS_A = [800,4200,7800], LOOP_A = 12000;
  var DELAYS_B = [800,4000,7200,10800], LOOP_B = 15000;
  var RING_MS = 2400, SWEEP_MS = 900;

  var scenIdx = 0, loopTimer, phase = 'ringing', callSecs = 0, callTimer;
  var bubblesEl   = document.getElementById('au2-bubbles');
  var ringOverlay = document.getElementById('au2-ringing-overlay');
  var iRinging    = document.getElementById('au2-iphone-ringing');
  var iConnected  = document.getElementById('au2-iphone-connected');
  var iScreen     = document.getElementById('au2-iphone-screen');
  var callTimerEl = document.getElementById('au2-call-timer');
  var waveEl      = document.getElementById('au2-waveform');
  var aiAvatar    = document.getElementById('au2-ai-avatar');
  var userIcon    = document.getElementById('au2-user-icon');

  function fmtSecs(s) {
    return Math.floor(s/60)+':'+(s%60<10?'0':'')+(s%60);
  }

  function setPhase(p) {
    phase = p;
    if (p === 'ringing') {
      iScreen.style.background = 'linear-gradient(170deg,#0c1a30 0%,#060e1e 55%,#020609 100%)';
      iRinging.style.display = 'flex';
      iConnected.style.display = 'none';
      ringOverlay.style.display = 'flex';
      bubblesEl.innerHTML = '';
      if (callTimer) clearInterval(callTimer);
      callSecs = 0;
    } else if (p === 'connected') {
      iScreen.style.background = 'linear-gradient(170deg,#1a0838 0%,#0a031a 45%,#040110 100%)';
      iRinging.style.display = 'none';
      iConnected.style.display = 'flex';
      ringOverlay.style.opacity = '0';
      ringOverlay.style.transition = 'opacity .35s';
      setTimeout(function(){ ringOverlay.style.display='none'; ringOverlay.style.opacity=''; ringOverlay.style.transition=''; }, 380);
      callTimer = setInterval(function(){ callSecs++; if(callTimerEl) callTimerEl.textContent=fmtSecs(callSecs); }, 1000);
    } else if (p === 'sweeping') {
      iScreen.style.background = 'linear-gradient(180deg,#0a0a0a 0%,#050505 100%)';
      iConnected.innerHTML = '<div style="display:flex;flex-direction:column;align-items:center;flex:1;justify-content:center;gap:8px;margin-top:40px;">' +
        '<div style="width:62px;height:62px;border-radius:50%;background:rgba(255,255,255,.07);display:flex;align-items:center;justify-content:center;font-size:1rem;font-weight:800;color:rgba(255,255,255,.25);">FN</div>' +
        '<div style="font-size:.88rem;color:rgba(255,255,255,.85);font-weight:600;">Call Ended</div>' +
        '<div style="font-size:.7rem;color:rgba(255,255,255,.38);">'+fmtSecs(callSecs)+'</div></div>';
      bubblesEl.style.transition = 'transform .55s ease-in, opacity .55s';
      bubblesEl.style.transform = 'translateY(-420px)';
      bubblesEl.style.opacity = '0';
      if (callTimer) clearInterval(callTimer);
    }
  }

  function addBubble(msg) {
    var isAI = msg.from === 'autumn';
    var wrap = document.createElement('div');
    wrap.className = isAI ? 'au2-bubble-wrap-ai' : 'au2-bubble-wrap-user';
    var bbl = document.createElement('div');
    bbl.className = 'au2-bubble ' + (isAI ? 'au2-bubble-ai' : 'au2-bubble-user');
    bbl.textContent = msg.text;
    wrap.appendChild(bbl);
    bubblesEl.appendChild(wrap);
    bubblesEl.scrollTop = bubblesEl.scrollHeight;
    // speaker indicators
    if (aiAvatar) aiAvatar.style.opacity = isAI ? '1' : '0.35';
    if (userIcon) userIcon.style.opacity = isAI ? '0.35' : '1';
    if (waveEl)   waveEl.style.opacity   = isAI ? '1' : '0.2';
  }

  function runLoop() {
    var msgs   = SCENARIOS[scenIdx];
    var delays = scenIdx === 0 ? DELAYS_A : DELAYS_B;
    var loopMs = scenIdx === 0 ? LOOP_A   : LOOP_B;

    // Reset bubble panel
    bubblesEl.style.transition = '';
    bubblesEl.style.transform  = '';
    bubblesEl.style.opacity    = '1';
    bubblesEl.innerHTML = '';
    if (aiAvatar) aiAvatar.style.opacity = '1';
    if (userIcon) userIcon.style.opacity = '0.35';
    if (waveEl)   waveEl.style.opacity   = '1';

    setPhase('ringing');

    setTimeout(function() { setPhase('connected'); }, RING_MS);

    delays.forEach(function(d, i) {
      setTimeout(function() { if(msgs[i]) addBubble(msgs[i]); }, RING_MS + d);
    });

    setTimeout(function() { setPhase('sweeping'); }, RING_MS + loopMs);

    loopTimer = setTimeout(function() {
      scenIdx = (scenIdx + 1) % SCENARIOS.length;
      runLoop();
    }, RING_MS + loopMs + SWEEP_MS);
  }

  // Only run if the hero chat element exists and viewport is wide enough
  if (document.getElementById('au2-hero-chat') && window.innerWidth > 900) {
    runLoop();
  }
})();

/* ══════════════════════════════════════════════════════════
   DEMO MODAL
══════════════════════════════════════════════════════════ */
var DEMO_STORE_ID   = 2;
var DEMO_PHONE_DISPLAY = '(619) 604-6886';
var DEMO_DURATION   = 5 * 60;
var demoTimerIv     = null;
var demoSecsLeft    = DEMO_DURATION;

function openDemoModal() {
  document.getElementById('au2-demo-overlay').classList.add('open');
  document.getElementById('au2-phone-input').focus();
}
function closeDemoModal() {
  document.getElementById('au2-demo-overlay').classList.remove('open');
  if (demoTimerIv) { clearInterval(demoTimerIv); demoTimerIv = null; }
  // reset
  document.getElementById('au2-modal-step1').style.display = '';
  document.getElementById('au2-modal-step2').style.display = 'none';
  document.getElementById('au2-timer-badge').style.display = 'none';
  document.getElementById('au2-phone-input').value = '';
  document.getElementById('au2-phone-error').style.display = 'none';
  document.getElementById('au2-modal-box').style.maxWidth = '460px';
  demoSecsLeft = DEMO_DURATION;
}

document.addEventListener('keydown', function(e){ if(e.key==='Escape') closeDemoModal(); });

function fmtDemoTime(s) {
  return Math.floor(s/60)+':'+(s%60<10?'0':'')+(s%60);
}

function startDemoTimer() {
  demoSecsLeft = DEMO_DURATION;
  document.getElementById('au2-timer-val').textContent = fmtDemoTime(demoSecsLeft);
  document.getElementById('au2-timer-badge').style.display = 'flex';
  demoTimerIv = setInterval(function() {
    demoSecsLeft--;
    if (demoSecsLeft <= 0) {
      clearInterval(demoTimerIv);
      closeDemoModal();
      return;
    }
    var val = document.getElementById('au2-timer-val');
    var badge = document.getElementById('au2-timer-badge');
    if (val) val.textContent = fmtDemoTime(demoSecsLeft);
    // Colour urgency
    if (demoSecsLeft <= 20) {
      if (badge) { badge.style.background='#fef2f2'; badge.style.borderColor='#fca5a5'; }
      if (val) val.style.color = '#dc2626';
      document.querySelector('.au2-timer-dot').style.background = '#dc2626';
    } else if (demoSecsLeft <= 60) {
      if (badge) { badge.style.background='#fff7ed'; badge.style.borderColor='#fdba74'; }
      if (val) val.style.color = '#ea580c';
      document.querySelector('.au2-timer-dot').style.background = '#ea580c';
    }
  }, 1000);
}

function buildCalendar(storeId, staffId, staffName, accentColor, container) {
  var DAY_NAMES = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  var today = new Date(); today.setHours(0,0,0,0);
  var days = [];
  for (var i=0;i<7;i++) {
    var d = new Date(today); d.setDate(d.getDate()+i); days.push(d);
  }

  // Header
  var hdr = document.createElement('div');
  hdr.style.cssText = 'display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;';
  var hdrName = document.createElement('span');
  hdrName.style.cssText = 'font-size:.78rem;font-weight:700;color:#374151;letter-spacing:.06em;text-transform:uppercase;';
  hdrName.textContent = staffName ? 'Technician — '+staffName : 'Live Calendar';
  var liveBadge = document.createElement('span');
  liveBadge.style.cssText = 'font-size:.75rem;font-weight:600;color:#9ca3af;display:flex;align-items:center;gap:5px;';
  liveBadge.innerHTML = '<span style="width:7px;height:7px;border-radius:50%;background:#d1d5db;display:inline-block;" id="cal-dot-'+Math.random().toString(36).slice(2)+'"></span>Connecting…';
  hdr.appendChild(hdrName); hdr.appendChild(liveBadge);
  container.appendChild(hdr);

  // 7-day grid
  var grid = document.createElement('div');
  grid.className = 'au2-demo-7col';
  days.forEach(function(day, i) {
    var isToday = i === 0;
    var col = document.createElement('div');
    col.className = 'au2-demo-day' + (isToday ? ' today' : '');
    col.dataset.date = day.toISOString().slice(0,10);
    var dn = document.createElement('div'); dn.className='au2-demo-day-name'; dn.textContent=DAY_NAMES[day.getDay()];
    var num = document.createElement('div'); num.className='au2-demo-day-num'; num.textContent=day.getDate();
    col.appendChild(dn); col.appendChild(num);
    grid.appendChild(col);
  });
  container.appendChild(grid);

  // Fetch appointments
  var url = '/api/autumn/demo-calendar/appointments?storeId='+storeId+(staffId?'&staffId='+staffId:'');
  fetch(url).then(function(r){return r.json();}).then(function(data) {
    if (!data.appointments) return;
    data.appointments.forEach(function(a) {
      var aDate = new Date(a.date);
      var dateStr = aDate.toISOString().slice(0,10);
      var col = grid.querySelector('[data-date="'+dateStr+'"]');
      if (!col) return;
      var STATUS_COLORS = {pending:'#6d28d9',confirmed:'#2563eb','in-progress':'#d97706',completed:'#10b981'};
      var color = STATUS_COLORS[a.status||'pending'] || accentColor;
      var apptEl = document.createElement('div');
      apptEl.className = 'au2-demo-appt';
      apptEl.style.cssText = 'background:'+color+'18;border:1px solid '+color+'40;border-left:3px solid '+color+';';
      var h = aDate.getHours(), m = aDate.getMinutes();
      var ampm = h>=12?'pm':'am'; var hh=h%12||12;
      var timeStr = hh+(m?':'+('0'+m).slice(-2):'')+ampm;
      apptEl.innerHTML = '<div class="au2-demo-appt-time" style="color:'+color+';">'+timeStr+'</div>' +
                         '<div class="au2-demo-appt-svc">'+(a.serviceName||'Appt')+'</div>';
      col.appendChild(apptEl);
    });
  }).catch(function(){});
}

async function submitDemoForm(e) {
  e.preventDefault();
  var phoneInput = document.getElementById('au2-phone-input');
  var errEl      = document.getElementById('au2-phone-error');
  var submitBtn  = document.getElementById('au2-submit-btn');
  var phone      = phoneInput.value.trim();

  errEl.style.display = 'none';
  phoneInput.classList.remove('error');

  if (!phone) {
    errEl.textContent = 'Please enter your phone number.';
    errEl.style.display = 'block';
    phoneInput.classList.add('error');
    return;
  }

  submitBtn.disabled = true;
  submitBtn.textContent = 'Saving…';

  try {
    var res = await fetch('/api/autumn/demo-request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: phone }),
    });
    var data = await res.json();
    if (!res.ok) {
      errEl.textContent = data.error || 'Something went wrong.';
      errEl.style.display = 'block';
      phoneInput.classList.add('error');
      return;
    }

    // Success — switch to step 2
    document.getElementById('au2-modal-step1').style.display = 'none';
    document.getElementById('au2-modal-step2').style.display = 'block';
    document.getElementById('au2-modal-box').style.maxWidth = '820px';

    startDemoTimer();

    // Fetch store info & build calendars
    var storeRes = await fetch('/api/autumn/demo-store-info?storeId='+DEMO_STORE_ID);
    var storeData = await storeRes.json();
    var salonName = (storeData.store && storeData.store.name) ? storeData.store.name : 'Fabulous Nails';
    var staffList = (Array.isArray(storeData.staff) && storeData.staff.length) ? storeData.staff : [];

    document.getElementById('au2-demo-sub').textContent =
      'Call now and book an appointment at '+salonName+'. Watch the calendar update live!';

    var STAFF_COLORS = ['#6d28d9','#db2777','#2563eb','#0891b2'];
    var calsEl = document.getElementById('au2-demo-calendars');
    calsEl.innerHTML = '';

    var list = staffList.length > 0 ? staffList : [{ id: null, name: null, color: null }];
    list.forEach(function(s, idx) {
      var color = s.color || STAFF_COLORS[idx % STAFF_COLORS.length];
      var wrap = document.createElement('div');
      wrap.className = 'au2-demo-cal-wrap';
      calsEl.appendChild(wrap);
      buildCalendar(DEMO_STORE_ID, s.id || undefined, s.name || undefined, color, wrap);
    });

  } catch(err) {
    errEl.textContent = 'Network error — please try again.';
    errEl.style.display = 'block';
    phoneInput.classList.add('error');
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Start My 5-Minute Demo →';
  }
}
</script>
