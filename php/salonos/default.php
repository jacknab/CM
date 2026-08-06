<?php
define('BRAND_NAME',    'Certxa');
define('PAGE_TITLE',    'SalonOS by Certxa — The Complete Nail Salon Operating System');
define('PAGE_DESC',     'SalonOS by Certxa is the all-in-one nail salon operating system. Online booking, front desk calendar, self-service walk-in kiosk, built-in POS, loyalty rewards, waitlist management, and Google review automation — built exclusively for nail studios.');
define('PAGE_KEYWORDS', 'nail salon operating system, all-in-one nail salon software, nail salon POS booking loyalty, nail studio front desk software, SalonOS, nail salon management system, nail salon check-in kiosk, nail salon waitlist, nail salon loyalty program');
define('PAGE_CANONICAL', 'https://certxa.com/salonos');
define('PAGE_BREADCRUMBS', json_encode([
  ['name'=>'Home','url'=>'https://certxa.com/'],
  ['name'=>'SalonOS','url'=>'https://certxa.com/salonos'],
]));
define('PAGE_SCHEMA', json_encode([
  [
    '@type'       => 'WebPage',
    '@id'         => 'https://certxa.com/salonos',
    'name'        => 'SalonOS by Certxa — All-in-One Salon Operating System',
    'description' => 'SalonOS is the complete salon operating system by Certxa, bundling booking, POS, loyalty, check-in, waitlist, and review management into one platform.',
    'url'         => 'https://certxa.com/salonos',
    'isPartOf'    => ['@id'=>'https://certxa.com/#website'],
  ],
  [
    '@type'       => 'SoftwareApplication',
    'name'        => 'SalonOS by Certxa',
    'applicationCategory' => 'BusinessApplication',
    'operatingSystem'     => 'Web, iOS, Android',
    'offers' => ['@type'=>'Offer','price'=>'0','priceCurrency'=>'USD','description'=>TRIAL_DAYS . '-day free trial. Credit card required · No charge until trial ends.'],
  ],
]));
require 'includes/header.php';
require 'includes/nav.php';
?>

<style>
/* ── SalonOS page-scoped overrides ─────────────────────── */
@import url('https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@400;500;600;700;800&display=swap');

.sos-page { background:#F7F3FF; }

.sos-hero {
  background: linear-gradient(160deg, #F7F3FF 0%, #EDE8FF 50%, #F3EEFF 100%);
  padding: 120px 0 100px;
  text-align: center;
  position: relative;
  overflow: hidden;
}

/* soft blob decorations */
.sos-blob {
  position: absolute;
  border-radius: 50%;
  filter: blur(80px);
  pointer-events: none;
}
.sos-blob-1 { width:500px;height:500px;background:rgba(180,83,9,.07); top:-120px;right:-100px; }
.sos-blob-2 { width:400px;height:400px;background:rgba(109,40,217,.07); bottom:-80px;left:-80px; }

.sos-eyebrow {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  background: #fff;
  border: 1px solid #D8CCFF;
  border-radius: 50px;
  padding: 6px 18px;
  margin-bottom: 32px;
  font-family: 'Instrument Sans', sans-serif;
  font-size: .72rem;
  font-weight: 700;
  color: var(--plum);
  letter-spacing: .12em;
  text-transform: uppercase;
  box-shadow: 0 2px 12px rgba(59,7,100,.06);
}

.sos-headline {
  font-family: 'Instrument Sans', sans-serif;
  font-size: clamp(3rem, 7vw, 6.5rem);
  font-weight: 800;
  line-height: 1.05;
  letter-spacing: -.04em;
  color: #1a0033;
  max-width: 900px;
  margin: 0 auto 28px;
}
.sos-headline em {
  font-style: normal;
  color: var(--plum);
}
.sos-headline .sos-gold {
  color: #B45309;
}

.sos-sub {
  font-family: 'Inter', sans-serif;
  font-size: clamp(1rem, 1.8vw, 1.2rem);
  color: #5b4a7a;
  max-width: 580px;
  margin: 0 auto 40px;
  line-height: 1.75;
}

/* 7-module pill row */
.sos-pills {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 10px;
  max-width: 780px;
  margin: 0 auto 48px;
}
.sos-pill {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  background: #fff;
  border: 1px solid #e5dbff;
  border-radius: 50px;
  padding: 8px 18px;
  font-family: 'Instrument Sans', sans-serif;
  font-size: .82rem;
  font-weight: 600;
  color: #3d2265;
  box-shadow: 0 2px 8px rgba(59,7,100,.06);
  white-space: nowrap;
}
.sos-pill-dot {
  width: 8px; height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.sos-actions {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 14px;
  flex-wrap: wrap;
  margin-bottom: 40px;
}
.sos-btn-primary {
  font-family: 'Instrument Sans', sans-serif;
  background: var(--plum);
  color: #fff;
  border: none;
  border-radius: 50px;
  padding: 15px 34px;
  font-size: 1rem;
  font-weight: 700;
  text-decoration: none;
  box-shadow: 0 8px 28px rgba(59,7,100,.25);
  transition: transform .2s, box-shadow .2s;
}
.sos-btn-primary:hover { transform:translateY(-2px); box-shadow:0 12px 36px rgba(59,7,100,.3); }
.sos-btn-outline {
  font-family: 'Instrument Sans', sans-serif;
  background: transparent;
  color: var(--plum);
  border: 1.5px solid #c4b0e8;
  border-radius: 50px;
  padding: 14px 30px;
  font-size: 1rem;
  font-weight: 600;
  text-decoration: none;
  transition: border-color .2s, background .2s;
}
.sos-btn-outline:hover { background:#f0eaff; border-color:var(--plum); }

.sos-trust {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  font-family: 'Inter', sans-serif;
  font-size: .82rem;
  color: #7c6aa0;
}

/* Light pastel background for rest of page */
.sos-stats { background: #fff; border-top:1px solid #ede8ff; border-bottom:1px solid #ede8ff; }
/* Override .stats-strip's default white-on-plum treatment:
   on .sos-stats the background is white, so the numbers need
   a dark colour and the labels a mid-grey. */
.sos-stats::before { display: none; }                        /* kill the gold radial glow — invisible on white anyway */
.sos-stats .stat-value { color: #1a0333; }                    /* deep plum numerals */
.sos-stats .stat-value span { color: #6D28D9; }               /* keep the accent digits in brand plum, not gold */
.sos-stats .stat-label { color: #6b5a85; }                    /* readable muted purple-grey */
.sos-section { background: #F7F3FF; }
.sos-pricing-cta { background: #EDE8FF; border-top:1px solid #d8ccff; }
</style>

<div class="sos-page">

<!-- ── HERO ─────────────────────────────────────────────── -->
<section class="sos-hero">
  <div class="sos-blob sos-blob-1"></div>
  <div class="sos-blob sos-blob-2"></div>

  <div class="container">
    <div class="sos-eyebrow">
      <span style="width:7px;height:7px;border-radius:50%;background:var(--plum);display:inline-block;"></span>
      Introducing SalonOS by Certxa
    </div>

    <h1 class="sos-headline">
      One system.<br>
      <em>Everything</em> your<br>
      salon <span class="sos-gold">needs.</span>
    </h1>

    <p class="sos-sub">
      Stop juggling seven different tools. SalonOS brings booking, your front desk, POS, loyalty, check-in, waitlist, and Google reviews into one beautifully unified platform.
    </p>

    <!-- module pills -->
    <div class="sos-pills">
      <span class="sos-pill"><span class="sos-pill-dot" style="background:#7c3aed;"></span>Online Booking</span>
      <span class="sos-pill"><span class="sos-pill-dot" style="background:#0f766e;"></span>Front Desk Calendar</span>
      <span class="sos-pill"><span class="sos-pill-dot" style="background:#B45309;"></span>Built-in POS</span>
      <span class="sos-pill"><span class="sos-pill-dot" style="background:#be185d;"></span>Loyalty Rewards</span>
      <span class="sos-pill"><span class="sos-pill-dot" style="background:#059669;"></span>Client Check-In</span>
      <span class="sos-pill"><span class="sos-pill-dot" style="background:#2563eb;"></span>Waitlist</span>
      <span class="sos-pill"><span class="sos-pill-dot" style="background:#d97706;"></span>Google Reviews</span>
      <span class="sos-pill" style="background:linear-gradient(135deg,#1a0033,#2d0066);border-color:#6d28d9;"><span class="sos-pill-dot" style="background:#a78bfa;box-shadow:0 0 6px #a78bfa;"></span><span style="color:#e9d5ff;font-weight:700;">Revenue Co-Pilot ✦</span></span>
    </div>

    <div class="sos-actions">
      <a href="#" class="sos-btn-primary">Start <?= TRIAL_DAYS ?>-Day Free Trial</a>
      <a href="/pricing" class="sos-btn-outline">View Pricing →</a>
    </div>

    <div class="sos-trust">
      <div class="avatar-stack">
        <div class="av-dot" style="background:linear-gradient(135deg,#a78bfa,#7c3aed)">JM</div>
        <div class="av-dot" style="background:linear-gradient(135deg,#f9a8d4,#ec4899)">RP</div>
        <div class="av-dot" style="background:linear-gradient(135deg,#fcd34d,#f59e0b)">DK</div>
        <div class="av-dot" style="background:linear-gradient(135deg,#6ee7b7,#059669)">SL</div>
      </div>
      <span><strong style="color:#3d2265;">Nail studios</strong> running on SalonOS</span>
    </div>
  </div>
</section>

<!-- ── WHAT'S INSIDE SALONOS ─────────────────────────────── -->
<section class="stats-strip sos-stats">
  <div class="container">
    <div class="stats-grid">
      <div class="stat-item"><div class="stat-value"><span data-count="7">0</span></div><div class="stat-label">Modules in one system</div></div>
      <div class="stat-item"><div class="stat-value"><span data-count="50">0</span>K+</div><div class="stat-label">Salons on SalonOS</div></div>
      <div class="stat-item"><div class="stat-value"><span data-count="<?= TRIAL_DAYS ?>"><?= TRIAL_DAYS ?></span>-day</div><div class="stat-label">Free trial, no charge until it ends</div></div>
      <div class="stat-item"><div class="stat-value">4.9<span style="font-size:1.8rem;">★</span></div><div class="stat-label">Average customer rating</div></div>
    </div>
  </div>
</section>

<!-- ── 7 MODULE DEEP DIVES ───────────────────────────────── -->
<section class="section">
  <div class="container">
    <div class="section-header">
      <span class="tag tag-plum">Everything Included</span>
      <h2 class="section-title">Seven tools. One subscription.<br><em style="font-style:italic;color:var(--plum);">Zero switching costs.</em></h2>
      <p class="section-subtitle">Every module in SalonOS is purpose-built for salons and synced in real time — so your booking, your desk, your payments, and your marketing always know what the others are doing.</p>
    </div>

    <?php
    $modules = [
      [
        'num'   => '01',
        'tag'   => 'Online Booking',
        'color' => 'var(--plum)',
        'icon'  => '📅',
        'title' => 'Smart booking your clients love',
        'body'  => 'Let clients book 24/7 from your website, Google, Instagram, or a direct link. SalonOS shows real-time availability, matches clients to their preferred nail tech, and sends automated reminders so no-shows become a thing of the past.',
        'bullets' => ['24/7 booking from any device','Real-time tech availability','Automated SMS & email reminders','Instant confirmations & rescheduling','Embedded directly on your website'],
        'reverse' => false,
        'ui' => '<div class="ui-card" style="max-width:300px;">
          <div style="font-size:.7rem;font-weight:700;color:var(--mid-grey);text-transform:uppercase;letter-spacing:.1em;margin-bottom:12px;">New Booking</div>
          <div style="display:flex;flex-direction:column;gap:8px;">
            <div style="background:var(--plum-light);border-radius:8px;padding:10px 12px;border-left:3px solid var(--plum);">
              <div style="font-size:.82rem;font-weight:600;color:var(--plum);">Gel Manicure + Nail Art</div>
              <div style="font-size:.72rem;color:var(--mid-grey);">Thu 2 May · 10:00am · Sophie H.</div>
            </div>
            <div style="background:#f0fdf4;border-radius:8px;padding:10px 12px;border-left:3px solid #059669;">
              <div style="font-size:.82rem;font-weight:600;color:#059669;">Confirmed ✓</div>
              <div style="font-size:.72rem;color:var(--mid-grey);">Reminder sent · $145 deposit held</div>
            </div>
          </div>
        </div>',
      ],
      [
        'num'   => '02',
        'tag'   => 'Front Desk Calendar',
        'color' => '#7c3aed',
        'icon'  => '🗓',
        'title' => 'A front desk that never sleeps',
        'body'  => 'Your receptionist\'s dream. A live multi-tech calendar gives your whole team instant visibility of every appointment, break, and booking gap. Drag-and-drop rescheduling, colour-coded by nail tech, with a daily run sheet that prints in one click.',
        'bullets' => ['Multi-tech live calendar view','Drag-and-drop rescheduling','Colour-coded by team member','Printable daily run sheets','Block time, breaks & holidays'],
        'reverse' => true,
        'ui' => '<div class="ui-card" style="max-width:300px;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
            <strong style="font-size:.85rem;">Thursday, 2 May</strong>
            <span style="font-size:.72rem;color:var(--plum);font-weight:600;">3 nail techs</span>
          </div>
          <div style="display:flex;gap:6px;font-size:.65rem;font-weight:700;color:var(--mid-grey);text-transform:uppercase;letter-spacing:.08em;margin-bottom:8px;">
            <div style="flex:1;text-align:center;">Sophie</div>
            <div style="flex:1;text-align:center;">Emma</div>
            <div style="flex:1;text-align:center;">James</div>
          </div>
          <div style="display:flex;gap:6px;">
            <div style="flex:1;display:flex;flex-direction:column;gap:4px;">
              <div style="background:#ede9fe;border-radius:6px;padding:6px 8px;font-size:.65rem;font-weight:600;color:#7c3aed;border-left:2px solid #7c3aed;">Gel Set<br><span style="font-weight:400;color:#9ca3af;">10–12pm</span></div>
              <div style="background:#ede9fe;border-radius:6px;padding:6px 8px;font-size:.65rem;font-weight:600;color:#7c3aed;border-left:2px solid #7c3aed;">Pedicure<br><span style="font-weight:400;color:#9ca3af;">2–3pm</span></div>
            </div>
            <div style="flex:1;display:flex;flex-direction:column;gap:4px;">
              <div style="background:#fef3c7;border-radius:6px;padding:6px 8px;font-size:.65rem;font-weight:600;color:#d97706;border-left:2px solid #d97706;">Acrylic<br><span style="font-weight:400;color:#9ca3af;">11–1pm</span></div>
            </div>
            <div style="flex:1;display:flex;flex-direction:column;gap:4px;">
              <div style="background:#d1fae5;border-radius:6px;padding:6px 8px;font-size:.65rem;font-weight:600;color:#059669;border-left:2px solid #059669;">Dip Set<br><span style="font-weight:400;color:#9ca3af;">9–10am</span></div>
              <div style="background:#d1fae5;border-radius:6px;padding:6px 8px;font-size:.65rem;font-weight:600;color:#059669;border-left:2px solid #059669;">Nail Art<br><span style="font-weight:400;color:#9ca3af;">11am</span></div>
            </div>
          </div>
        </div>',
      ],
      [
        'num'   => '03',
        'tag'   => 'Built-in POS',
        'color' => 'var(--gold)',
        'icon'  => '💳',
        'title' => 'Checkout in seconds, not minutes',
        'body'  => 'SalonOS\'s built-in point of sale handles services, retail, gift cards, splits, tips, and discounts — all synced instantly to every client record. Pair with Certxa Terminal Pro, Reader Flex, or iPhone Tap to Pay.',
        'bullets' => ['Service + retail in one checkout','Tipping prompts on every transaction','Split payments & gift card redemption','Next-day payouts to your bank','Syncs to client profiles automatically'],
        'reverse' => false,
        'ui' => '<div class="ui-card" style="max-width:300px;background:#1c1c1e;border:1px solid rgba(255,255,255,.1);">
          <div style="font-size:.7rem;font-weight:700;color:rgba(255,255,255,.4);text-transform:uppercase;letter-spacing:.1em;margin-bottom:12px;">Checkout</div>
          <div class="ui-row" style="border-color:rgba(255,255,255,.08);"><span style="color:#D4D4D4;font-size:.82rem;">Gel Manicure</span><span style="color:#fff;font-weight:600;">$55.00</span></div>
          <div class="ui-row" style="border-color:rgba(255,255,255,.08);"><span style="color:#D4D4D4;font-size:.82rem;">Nail Art Add-on</span><span style="color:#fff;font-weight:600;">$20.00</span></div>
          <div style="border-top:1px solid rgba(255,255,255,.1);margin:10px 0;"></div>
          <div class="ui-row" style="border:none;"><span style="color:#9CA3AF;font-size:.78rem;">Tip (20%)</span><span style="color:var(--gold-bright);">+$15.00</span></div>
          <div class="ui-row" style="border:none;"><span style="color:#fff;font-weight:700;">Total</span><span style="color:#fff;font-weight:800;font-size:1rem;">$90.00</span></div>
          <div style="background:var(--gold-bright);color:#1a0033;text-align:center;padding:11px;border-radius:8px;margin-top:12px;font-weight:700;font-size:.88rem;">Charge $90.00 →</div>
        </div>',
      ],
      [
        'num'   => '04',
        'tag'   => 'Loyalty Rewards',
        'color' => '#ec4899',
        'icon'  => '⭐',
        'title' => 'Punch-card loyalty, built right in',
        'body'  => 'Set up a digital loyalty programme in minutes — no separate app required. Clients earn a stamp with every visit and unlock rewards you define. It\'s the classic punch-card experience, beautifully modernised and fully automated inside SalonOS.',
        'bullets' => ['Custom stamp-per-visit rules','Configurable rewards & tiers','Clients track progress in their booking app','Auto-applied at checkout','Push-notification reward alerts'],
        'reverse' => true,
        'ui' => '<div class="ui-card" style="max-width:300px;">
          <div style="font-size:.7rem;font-weight:700;color:var(--mid-grey);text-transform:uppercase;letter-spacing:.1em;margin-bottom:14px;">Loyalty Card · Emma Clarke</div>
          <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:8px;margin-bottom:16px;">
            '.implode('', array_map(fn($i) => '<div style="aspect-ratio:1;border-radius:10px;background:'.($i<=4?'linear-gradient(135deg,#ec4899,#f472b6)':'rgba(0,0,0,.06)').';display:flex;align-items:center;justify-content:center;font-size:'.($i<=4?'.85':'1').';'.($i<=4?'box-shadow:0 3px 10px rgba(236,72,153,.3);':'border:1.5px dashed #d1d5db;').'">'
              .($i<=4 ? '★' : '').
            '</div>', range(1,10))).'
          </div>
          <div style="background:linear-gradient(135deg,#fdf2f8,#fce7f3);border-radius:10px;padding:12px 14px;display:flex;justify-content:space-between;align-items:center;">
            <div><div style="font-size:.78rem;font-weight:700;color:#ec4899;">4 of 10 stamps</div><div style="font-size:.65rem;color:#9ca3af;">6 more visits to unlock</div></div>
            <div style="font-size:.75rem;font-weight:700;color:#ec4899;background:#fff;border-radius:8px;padding:4px 10px;border:1px solid #fbcfe8;">Free Nail Art</div>
          </div>
        </div>',
      ],
      [
        'num'   => '05',
        'tag'   => 'Client Check-In',
        'color' => '#10b981',
        'icon'  => '✅',
        'title' => 'Effortless arrival, every time',
        'body'  => 'Clients tap a QR code at your door or check in via their confirmation link. SalonOS notifies the nail tech instantly, moves the appointment to "Arrived", and your front desk stays free to focus on the experience rather than the admin.',
        'bullets' => ['QR code self check-in at the door','Instant tech notification','Auto-updates appointment status','Walk-in check-in from front desk','Works on any device — no app download'],
        'reverse' => false,
        'ui' => '<div class="ui-card" style="max-width:300px;">
          <div style="font-size:.7rem;font-weight:700;color:var(--mid-grey);text-transform:uppercase;letter-spacing:.1em;margin-bottom:12px;">Today\'s Check-Ins</div>
          '.implode('', array_map(fn($c) => '
          <div class="ui-row">
            <div style="display:flex;align-items:center;gap:10px;">
              <div style="width:30px;height:30px;border-radius:50%;background:linear-gradient(135deg,'.($c[2]).'),#fff;display:flex;align-items:center;justify-content:center;font-size:.65rem;font-weight:700;color:#fff;flex-shrink:0;">'.$c[0][0].'</div>
              <div><div style="font-size:.82rem;font-weight:600;color:var(--charcoal);">'.$c[0].'</div><div style="font-size:.65rem;color:var(--mid-grey);">'.$c[3].'</div></div>
            </div>
            <span style="font-size:.65rem;font-weight:700;color:'.$c[1][1].';background:'.$c[1][0].';border-radius:50px;padding:3px 9px;flex-shrink:0;">'.$c[1][2].'</span>
          </div>', [
            ['Emma Clarke',  ['#d1fae5','#059669','Arrived'],  'linear-gradient(135deg,#a78bfa,#7c3aed)', '10:00am · Gel Manicure'],
            ['Sophie Hart',  ['#fef3c7','#d97706','In Chair'],  'linear-gradient(135deg,#fcd34d,#f59e0b)', '10:30am · Pedicure'],
            ['Jessica Lee',  ['#f3f4f6','#6b7280','Waiting'],  'linear-gradient(135deg,#6ee7b7,#059669)', '11:00am · Acrylic Set'],
          ])).'
        </div>',
      ],
      [
        'num'   => '06',
        'tag'   => 'Waitlist Management',
        'color' => '#3b82f6',
        'icon'  => '⏳',
        'title' => 'Never lose a walk-in again',
        'body'  => 'When you\'re fully booked, SalonOS captures walk-ins on a live digital waitlist. The moment a slot opens up, the next client is automatically notified and given a one-tap confirmation window. You fill cancellations instantly and clients feel looked after.',
        'bullets' => ['Live digital waitlist for walk-ins','Auto-text when a slot opens','One-tap client confirmation','Priority bumping for loyalty members','Estimated wait time display'],
        'reverse' => true,
        'ui' => '<div class="ui-card" style="max-width:300px;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">
            <div style="font-size:.7rem;font-weight:700;color:var(--mid-grey);text-transform:uppercase;letter-spacing:.1em;">Live Waitlist</div>
            <span style="background:#eff6ff;color:#3b82f6;font-size:.65rem;font-weight:700;border-radius:50px;padding:3px 10px;">3 waiting</span>
          </div>
          '.implode('', array_map(fn($w) => '
          <div style="display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid var(--light-grey);">
            <div style="width:26px;height:26px;border-radius:50%;background:#dbeafe;display:flex;align-items:center;justify-content:center;font-size:.7rem;font-weight:700;color:#3b82f6;flex-shrink:0;">'.$w[0].'</div>
            <div style="flex:1;"><div style="font-size:.8rem;font-weight:600;color:var(--charcoal);">'.$w[1].'</div><div style="font-size:.65rem;color:var(--mid-grey);">'.$w[2].'</div></div>
            <div style="font-size:.65rem;font-weight:700;color:#3b82f6;">'.$w[3].'</div>
          </div>', [
            ['1','Marcus B.','Gel Manicure','~8 min'],
            ['2','Priya S.','Dip Powder Set','~22 min'],
            ['3','Claire W.','Nail Gel Full Set','~35 min'],
          ])).'
        </div>',
      ],
      [
        'num'   => '07',
        'tag'   => 'Google Review Management',
        'color' => '#f59e0b',
        'icon'  => '🌟',
        'title' => 'More 5-star reviews, on autopilot',
        'body'  => 'After every appointment, SalonOS sends a perfectly timed review request via SMS. Positive reviews are directed straight to Google. Negative ones are captured privately so you can resolve them first. Your rating climbs without you lifting a finger.',
        'bullets' => ['Auto review request after checkout','Direct link to your Google listing','Negative review intercept & private inbox','Track rating trends over time','Works with your Google Business Profile booking link'],
        'reverse' => false,
        'ui' => '<div class="ui-card" style="max-width:300px;">
          <div style="text-align:center;padding:8px 0 16px;">
            <div style="font-size:2.4rem;font-weight:800;color:var(--charcoal);letter-spacing:-.04em;">4.9</div>
            <div style="color:#F59E0B;font-size:1.1rem;letter-spacing:3px;margin:4px 0;">★★★★★</div>
            <div style="font-size:.72rem;color:var(--mid-grey);">Based on 312 Google reviews</div>
          </div>
          <div style="display:flex;flex-direction:column;gap:6px;margin-bottom:14px;">
            '.implode('', array_map(fn($r) => '
            <div style="display:flex;align-items:center;gap:8px;">
              <span style="font-size:.72rem;color:var(--mid-grey);width:10px;">'.$r[0].'★</span>
              <div style="flex:1;height:6px;background:var(--light-grey);border-radius:3px;overflow:hidden;"><div style="width:'.$r[1].'%;height:100%;background:'.($r[0]==5?'#F59E0B':($r[0]==4?'#FCD34D':'#d1d5db')).';border-radius:3px;"></div></div>
              <span style="font-size:.65rem;color:var(--mid-grey);width:24px;">'.$r[2].'</span>
            </div>', [[5,88,'274'],[4,9,'28'],[3,2,'7'],[2,1,'2'],[1,0,'1']])).'
          </div>
          <div style="background:linear-gradient(135deg,rgba(245,158,11,.08),rgba(245,158,11,.04));border:1px solid rgba(245,158,11,.2);border-radius:10px;padding:10px 12px;display:flex;align-items:center;gap:8px;">
            <span style="font-size:1rem;">📨</span>
            <div><div style="font-size:.72rem;font-weight:700;color:var(--charcoal);">6 new reviews this week</div><div style="font-size:.65rem;color:var(--mid-grey);">All 5-star · 0 negative</div></div>
          </div>
        </div>',
      ],
    ];

    foreach ($modules as $idx => $m):
      $rev = $m['reverse'];
    ?>
    <div class="feature-block <?= $rev ? 'reverse' : '' ?>" style="margin-bottom:80px;">
      <div class="feature-content">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px;">
          <span style="font-family:'Cormorant Garamond',serif;font-size:3rem;font-weight:700;color:<?= $m['color'] ?>;opacity:.3;line-height:1;"><?= $m['num'] ?></span>
          <span class="tag" style="background:<?= $m['color'] ?>18;color:<?= $m['color'] ?>;border:1px solid <?= $m['color'] ?>44;"><?= $m['icon'] ?> <?= $m['tag'] ?></span>
        </div>
        <h3 class="feature-title" style="color:var(--charcoal);"><?= $m['title'] ?></h3>
        <p class="feature-text"><?= $m['body'] ?></p>
        <ul class="feature-list">
          <?php foreach ($m['bullets'] as $b): ?>
          <li><?= $b ?></li>
          <?php endforeach; ?>
        </ul>
        <a href="#" class="btn btn-primary" style="margin-top:24px;">Try <?= $m['tag'] ?> Free</a>
      </div>
      <div class="feature-visual" style="background:linear-gradient(145deg,var(--cream),var(--cream-dark));">
        <?= $m['ui'] ?>
      </div>
    </div>
    <?php endforeach; ?>

  </div>
</section>

<!-- ── REVENUE CO-PILOT ───────────────────────────────────── -->
<section style="background:linear-gradient(160deg,#0d0017 0%,#130025 60%,#0d001f 100%);padding:100px 0;position:relative;overflow:hidden;">

  <!-- background decoration -->
  <div style="position:absolute;top:-200px;right:-200px;width:600px;height:600px;background:radial-gradient(circle,rgba(109,40,217,.18) 0%,transparent 70%);pointer-events:none;"></div>
  <div style="position:absolute;bottom:-100px;left:-100px;width:400px;height:400px;background:radial-gradient(circle,rgba(167,139,250,.1) 0%,transparent 70%);pointer-events:none;"></div>

  <div id="revenue-intelligence" class="container" style="position:relative;z-index:1;">

    <div style="text-align:center;margin-bottom:64px;">
      <div style="display:inline-flex;align-items:center;gap:8px;background:rgba(167,139,250,.12);border:1px solid rgba(167,139,250,.3);border-radius:50px;padding:6px 20px;margin-bottom:24px;">
        <span style="width:6px;height:6px;border-radius:50%;background:#a78bfa;box-shadow:0 0 8px #a78bfa;display:inline-block;"></span>
        <span style="font-size:.72rem;font-weight:700;color:#c4b5fd;letter-spacing:.12em;text-transform:uppercase;">Revenue Intelligence · Built In</span>
      </div>
      <h2 style="font-family:'Instrument Sans',sans-serif;font-size:clamp(2.2rem,5vw,4rem);font-weight:800;line-height:1.08;letter-spacing:-.04em;color:#fff;margin-bottom:20px;">
        While everyone else says<br>
        <em style="font-style:normal;color:#a78bfa;">"we grow your business"</em><br>
        <span style="color:#f9fafb;">we actually show you how.</span>
      </h2>
      <p style="font-size:clamp(.95rem,1.6vw,1.15rem);color:#9ca3af;max-width:580px;margin:0 auto;line-height:1.75;">
        SalonOS mines your own booking data 24/7 and tells you exactly where revenue is leaking — then takes action to recover it automatically. No other salon platform does this.
      </p>
    </div>

    <!-- 8 intelligence cards grid -->
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:20px;margin-bottom:60px;">

      <!-- 1. Client Drift Engine -->
      <div style="background:rgba(255,255,255,.04);border:1px solid rgba(167,139,250,.2);border-radius:16px;padding:28px;transition:.2s;" onmouseenter="this.style.borderColor='rgba(167,139,250,.5)';this.style.background='rgba(167,139,250,.08)'" onmouseleave="this.style.borderColor='rgba(167,139,250,.2)';this.style.background='rgba(255,255,255,.04)'">
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px;">
          <div style="width:42px;height:42px;border-radius:12px;background:linear-gradient(135deg,rgba(167,139,250,.3),rgba(109,40,217,.3));display:flex;align-items:center;justify-content:center;font-size:1.3rem;flex-shrink:0;">📡</div>
          <div>
            <div style="font-size:.65rem;font-weight:700;color:#a78bfa;text-transform:uppercase;letter-spacing:.1em;margin-bottom:2px;">Client Drift Engine</div>
            <div style="font-size:.78rem;color:#6b7280;">Biggest direct revenue impact</div>
          </div>
        </div>
        <p style="font-size:.88rem;color:#d1d5db;line-height:1.65;margin-bottom:14px;">Every client has a visit cadence — every 5 weeks, every 8 weeks. SalonOS learns it. When someone drifts 20% past their personal cadence without rebooking, it fires a personalized SMS at exactly the right moment.</p>
        <div style="background:rgba(0,0,0,.3);border:1px solid rgba(255,255,255,.08);border-radius:10px;padding:12px 14px;font-size:.78rem;">
          <div style="color:#6b7280;margin-bottom:4px;">📱 Auto-sent SMS</div>
          <div style="color:#e5e7eb;font-style:italic;">"Hi Sarah, it's been 7 weeks since your last gel manicure — time for a fresh set? Book now: [link]"</div>
        </div>
        <div style="margin-top:14px;font-size:.72rem;font-weight:700;color:#4ade80;">✓ Recovers 10–15% of quietly drifting clients</div>
      </div>

      <!-- 2. Revenue Leakage Report -->
      <div style="background:rgba(255,255,255,.04);border:1px solid rgba(167,139,250,.2);border-radius:16px;padding:28px;transition:.2s;" onmouseenter="this.style.borderColor='rgba(167,139,250,.5)';this.style.background='rgba(167,139,250,.08)'" onmouseleave="this.style.borderColor='rgba(167,139,250,.2)';this.style.background='rgba(255,255,255,.04)'">
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px;">
          <div style="width:42px;height:42px;border-radius:12px;background:linear-gradient(135deg,rgba(251,191,36,.25),rgba(180,83,9,.25));display:flex;align-items:center;justify-content:center;font-size:1.3rem;flex-shrink:0;">💸</div>
          <div>
            <div style="font-size:.65rem;font-weight:700;color:#fbbf24;text-transform:uppercase;letter-spacing:.1em;margin-bottom:2px;">Revenue Leakage Report</div>
            <div style="font-size:.78rem;color:#6b7280;">Monthly, delivered automatically</div>
          </div>
        </div>
        <p style="font-size:.88rem;color:#d1d5db;line-height:1.65;margin-bottom:14px;">Cold hard numbers, monthly. Which clients haven't booked since, what they used to spend, and exactly how much annual revenue you're on track to lose. Not a dashboard stat — an action item with one tap to reach them.</p>
        <div style="background:rgba(0,0,0,.3);border:1px solid rgba(255,255,255,.08);border-radius:10px;padding:12px 14px;">
          <div style="display:flex;justify-content:space-between;font-size:.78rem;margin-bottom:4px;"><span style="color:#9ca3af;">Lapsed clients this month</span><span style="color:#f87171;font-weight:700;">8 clients</span></div>
          <div style="display:flex;justify-content:space-between;font-size:.78rem;"><span style="color:#9ca3af;">Est. lost annual revenue</span><span style="color:#fbbf24;font-weight:700;">$3,200</span></div>
        </div>
        <div style="margin-top:14px;font-size:.72rem;font-weight:700;color:#4ade80;">✓ One-tap winback campaign included</div>
      </div>

      <!-- 3. Dead Seat Intelligence -->
      <div style="background:rgba(255,255,255,.04);border:1px solid rgba(167,139,250,.2);border-radius:16px;padding:28px;transition:.2s;" onmouseenter="this.style.borderColor='rgba(167,139,250,.5)';this.style.background='rgba(167,139,250,.08)'" onmouseleave="this.style.borderColor='rgba(167,139,250,.2)';this.style.background='rgba(255,255,255,.04)'">
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px;">
          <div style="width:42px;height:42px;border-radius:12px;background:linear-gradient(135deg,rgba(16,185,129,.25),rgba(5,150,105,.25));display:flex;align-items:center;justify-content:center;font-size:1.3rem;flex-shrink:0;">💺</div>
          <div>
            <div style="font-size:.65rem;font-weight:700;color:#34d399;text-transform:uppercase;letter-spacing:.1em;margin-bottom:2px;">Dead Seat Intelligence</div>
            <div style="font-size:.78rem;color:#6b7280;">Turn slow hours into revenue</div>
          </div>
        </div>
        <p style="font-size:.88rem;color:#d1d5db;line-height:1.65;margin-bottom:14px;">Tuesday 2–4pm is consistently 20% booked. SalonOS finds that pattern, identifies clients who've booked Tuesdays before and are overdue, then gives you a one-click "fill those seats" campaign.</p>
        <div style="background:rgba(0,0,0,.3);border:1px solid rgba(255,255,255,.08);border-radius:10px;padding:12px 14px;font-size:.78rem;">
          <div style="color:#9ca3af;margin-bottom:4px;">📊 Detected pattern</div>
          <div style="color:#e5e7eb;">Tue 2–4pm · <span style="color:#f87171;">22% fill rate</span> · <span style="color:#34d399;">6 eligible clients to target</span></div>
        </div>
        <div style="margin-top:14px;font-size:.72rem;font-weight:700;color:#4ade80;">✓ Estimates lost revenue per dead slot</div>
      </div>

      <!-- 4. No-Show Prediction -->
      <div style="background:rgba(255,255,255,.04);border:1px solid rgba(167,139,250,.2);border-radius:16px;padding:28px;transition:.2s;" onmouseenter="this.style.borderColor='rgba(167,139,250,.5)';this.style.background='rgba(167,139,250,.08)'" onmouseleave="this.style.borderColor='rgba(167,139,250,.2)';this.style.background='rgba(255,255,255,.04)'">
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px;">
          <div style="width:42px;height:42px;border-radius:12px;background:linear-gradient(135deg,rgba(239,68,68,.25),rgba(185,28,28,.25));display:flex;align-items:center;justify-content:center;font-size:1.3rem;flex-shrink:0;">⚠️</div>
          <div>
            <div style="font-size:.65rem;font-weight:700;color:#f87171;text-transform:uppercase;letter-spacing:.1em;margin-bottom:2px;">No-Show Prediction</div>
            <div style="font-size:.78rem;color:#6b7280;">Know before they don't show</div>
          </div>
        </div>
        <p style="font-size:.88rem;color:#d1d5db;line-height:1.65;margin-bottom:14px;">Every upcoming appointment gets scored for no-show risk using booking lead time, client history, day of week, and service type. High-risk appointments surface every morning so you can send a targeted confirmation.</p>
        <div style="background:rgba(0,0,0,.3);border:1px solid rgba(255,255,255,.08);border-radius:10px;padding:12px 14px;font-size:.78rem;">
          <div style="color:#9ca3af;margin-bottom:4px;">Tomorrow's risk alerts</div>
          <div style="display:flex;justify-content:space-between;"><span style="color:#e5e7eb;">3 high-risk appointments</span><span style="color:#f87171;font-weight:700;">Send confirmations →</span></div>
        </div>
        <div style="margin-top:14px;font-size:.72rem;font-weight:700;color:#4ade80;">✓ Risk scored by booking lead time + history</div>
      </div>

      <!-- 5. Rebooking Rate by Nail Tech -->
      <div style="background:rgba(255,255,255,.04);border:1px solid rgba(167,139,250,.2);border-radius:16px;padding:28px;transition:.2s;" onmouseenter="this.style.borderColor='rgba(167,139,250,.5)';this.style.background='rgba(167,139,250,.08)'" onmouseleave="this.style.borderColor='rgba(167,139,250,.2)';this.style.background='rgba(255,255,255,.04)'">
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px;">
          <div style="width:42px;height:42px;border-radius:12px;background:linear-gradient(135deg,rgba(59,130,246,.25),rgba(37,99,235,.25));display:flex;align-items:center;justify-content:center;font-size:1.3rem;flex-shrink:0;">💅</div>
          <div>
            <div style="font-size:.65rem;font-weight:700;color:#60a5fa;text-transform:uppercase;letter-spacing:.1em;margin-bottom:2px;">Rebooking Rate by Nail Tech</div>
            <div style="font-size:.78rem;color:#6b7280;">The number that changes behavior</div>
          </div>
        </div>
        <p style="font-size:.88rem;color:#d1d5db;line-height:1.65;margin-bottom:14px;">The data is sitting in your system right now. SalonOS surfaces it. "Ashley rebooks 78% of her gel manicure clients. Jake rebooks 39%." That number changes behavior — and your bottom line — overnight.</p>
        <div style="background:rgba(0,0,0,.3);border:1px solid rgba(255,255,255,.08);border-radius:10px;padding:12px 14px;font-size:.78rem;display:flex;flex-direction:column;gap:6px;">
          <div style="display:flex;justify-content:space-between;align-items:center;"><span style="color:#e5e7eb;">Ashley M.</span><div style="display:flex;align-items:center;gap:8px;"><div style="width:80px;height:6px;background:rgba(255,255,255,.1);border-radius:3px;overflow:hidden;"><div style="width:78%;height:100%;background:#4ade80;border-radius:3px;"></div></div><span style="color:#4ade80;font-weight:700;">78%</span></div></div>
          <div style="display:flex;justify-content:space-between;align-items:center;"><span style="color:#e5e7eb;">Jake T.</span><div style="display:flex;align-items:center;gap:8px;"><div style="width:80px;height:6px;background:rgba(255,255,255,.1);border-radius:3px;overflow:hidden;"><div style="width:39%;height:100%;background:#f87171;border-radius:3px;"></div></div><span style="color:#f87171;font-weight:700;">39%</span></div></div>
        </div>
        <div style="margin-top:14px;font-size:.72rem;font-weight:700;color:#4ade80;">✓ With trend vs prior 90-day period</div>
      </div>

      <!-- 6. Smart Cancellation Recovery -->
      <div style="background:rgba(255,255,255,.04);border:1px solid rgba(167,139,250,.2);border-radius:16px;padding:28px;transition:.2s;" onmouseenter="this.style.borderColor='rgba(167,139,250,.5)';this.style.background='rgba(167,139,250,.08)'" onmouseleave="this.style.borderColor='rgba(167,139,250,.2)';this.style.background='rgba(255,255,255,.04)'">
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px;">
          <div style="width:42px;height:42px;border-radius:12px;background:linear-gradient(135deg,rgba(236,72,153,.25),rgba(190,24,93,.25));display:flex;align-items:center;justify-content:center;font-size:1.3rem;flex-shrink:0;">⚡</div>
          <div>
            <div style="font-size:.65rem;font-weight:700;color:#f472b6;text-transform:uppercase;letter-spacing:.1em;margin-bottom:2px;">Smart Cancellation Recovery</div>
            <div style="font-size:.78rem;color:#6b7280;">Turns dead revenue into filled seats</div>
          </div>
        </div>
        <p style="font-size:.88rem;color:#d1d5db;line-height:1.65;margin-bottom:14px;">The moment a cancellation hits, SalonOS instantly scans your waitlist, lapsed clients at-cadence, and clients who've taken that same service. It fires a targeted "slot just opened" text to the top 3 candidates.</p>
        <div style="background:rgba(0,0,0,.3);border:1px solid rgba(255,255,255,.08);border-radius:10px;padding:12px 14px;font-size:.78rem;">
          <div style="color:#9ca3af;margin-bottom:4px;">Slot just opened — 3 candidates found</div>
          <div style="display:flex;flex-direction:column;gap:3px;">
            <div style="color:#e5e7eb;">1. Emma C. — waitlist + overdue 3w</div>
            <div style="color:#e5e7eb;">2. Priya S. — same service, lapsed 5w</div>
          </div>
        </div>
        <div style="margin-top:14px;font-size:.72rem;font-weight:700;color:#4ade80;">✓ Automated — no manual work needed</div>
      </div>

      <!-- 7. LTV + Churn Risk Score -->
      <div style="background:rgba(255,255,255,.04);border:1px solid rgba(167,139,250,.2);border-radius:16px;padding:28px;transition:.2s;" onmouseenter="this.style.borderColor='rgba(167,139,250,.5)';this.style.background='rgba(167,139,250,.08)'" onmouseleave="this.style.borderColor='rgba(167,139,250,.2)';this.style.background='rgba(255,255,255,.04)'">
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px;">
          <div style="width:42px;height:42px;border-radius:12px;background:linear-gradient(135deg,rgba(245,158,11,.25),rgba(180,83,9,.25));display:flex;align-items:center;justify-content:center;font-size:1.3rem;flex-shrink:0;">🎯</div>
          <div>
            <div style="font-size:.65rem;font-weight:700;color:#fbbf24;text-transform:uppercase;letter-spacing:.1em;margin-bottom:2px;">LTV + Churn Risk Score</div>
            <div style="font-size:.78rem;color:#6b7280;">Know who you can't afford to lose</div>
          </div>
        </div>
        <p style="font-size:.88rem;color:#d1d5db;line-height:1.65;margin-bottom:14px;">Every client gets two numbers: their lifetime value and a churn risk score. High LTV + rising churn risk is the most dangerous combination. SalonOS surfaces those clients prominently so you can act before it's too late.</p>
        <div style="background:rgba(0,0,0,.3);border:1px solid rgba(255,255,255,.08);border-radius:10px;padding:12px 14px;font-size:.78rem;">
          <div style="color:#f87171;margin-bottom:4px;font-weight:600;">⚠️ At-risk this week</div>
          <div style="color:#e5e7eb;">8 high-LTV clients · <span style="color:#fbbf24;font-weight:700;">$11,400 annual revenue at stake</span></div>
        </div>
        <div style="margin-top:14px;font-size:.72rem;font-weight:700;color:#4ade80;">✓ Multi-factor score: cadence, visits, no-shows</div>
      </div>

      <!-- 8. Growth Score -->
      <div style="background:linear-gradient(135deg,rgba(109,40,217,.15),rgba(167,139,250,.08));border:1px solid rgba(167,139,250,.35);border-radius:16px;padding:28px;transition:.2s;" onmouseenter="this.style.borderColor='rgba(167,139,250,.6)'" onmouseleave="this.style.borderColor='rgba(167,139,250,.35)'">
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px;">
          <div style="width:42px;height:42px;border-radius:12px;background:linear-gradient(135deg,rgba(167,139,250,.4),rgba(109,40,217,.4));display:flex;align-items:center;justify-content:center;font-size:1.3rem;flex-shrink:0;">📈</div>
          <div>
            <div style="font-size:.65rem;font-weight:700;color:#c4b5fd;text-transform:uppercase;letter-spacing:.1em;margin-bottom:2px;">Business Growth Score</div>
            <div style="font-size:.78rem;color:#6b7280;">One number to rule them all</div>
          </div>
        </div>
        <p style="font-size:.88rem;color:#d1d5db;line-height:1.65;margin-bottom:14px;">A single 0–100 health score on your dashboard every day — composed of retention rate, rebooking rate, seat utilization, avg ticket trend, and new client conversion. When it moves, you know exactly why.</p>
        <div style="background:rgba(0,0,0,.35);border:1px solid rgba(255,255,255,.1);border-radius:10px;padding:16px;text-align:center;">
          <div style="font-family:'Instrument Sans',sans-serif;font-size:3rem;font-weight:800;color:#a78bfa;line-height:1;">74</div>
          <div style="font-size:.72rem;color:#9ca3af;margin-bottom:8px;">Business Health Score</div>
          <div style="display:flex;justify-content:center;gap:12px;font-size:.65rem;">
            <span style="color:#4ade80;">↑ Retention 88%</span>
            <span style="color:#fbbf24;">→ Utilization 71%</span>
            <span style="color:#f87171;">↓ Rebook 54%</span>
          </div>
        </div>
        <div style="margin-top:14px;font-size:.72rem;font-weight:700;color:#4ade80;">✓ 30-day trend history included</div>
      </div>

    </div>

    <!-- bottom CTA bar -->
    <div style="background:rgba(255,255,255,.05);border:1px solid rgba(167,139,250,.25);border-radius:16px;padding:32px 40px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:20px;">
      <div>
        <div style="font-family:'Instrument Sans',sans-serif;font-size:1.3rem;font-weight:700;color:#fff;margin-bottom:6px;">Revenue Intelligence is included in every SalonOS plan.</div>
        <div style="font-size:.88rem;color:#9ca3af;">No add-ons. No extra tier. The entire co-pilot layer runs automatically from day one.</div>
      </div>
      <a href="/auth?mode=register" class="sos-btn-primary" style="white-space:nowrap;flex-shrink:0;">Start Free — See It Working</a>
    </div>

  </div>
</section>

<!-- ── SALONOS PRICING CTA ───────────────────────────────── -->
<section class="sos-pricing-cta" style="padding:72px 0;">
  <div class="container" style="text-align:center;">
    <span class="tag tag-plum" style="margin-bottom:16px;display:inline-block;">Simple Pricing</span>
    <h2 style="font-family:'Instrument Sans',sans-serif;font-size:clamp(2rem,4vw,3.2rem);font-weight:800;color:var(--plum);letter-spacing:-.03em;margin-bottom:16px;">
      All 7 modules.<br>One straightforward price.
    </h2>
    <p style="font-size:1rem;color:#5b4a7a;max-width:500px;margin:0 auto 36px;line-height:1.75;">
      No picking and choosing features. SalonOS gives you everything from day one — booking, POS, loyalty, check-in, waitlist, and reviews — all in one plan.
    </p>
    <div style="display:flex;justify-content:center;gap:16px;flex-wrap:wrap;">
      <a href="#" class="sos-btn-primary">Start <?= TRIAL_DAYS ?>-Day Free Trial</a>
      <a href="/pricing" class="sos-btn-outline">View Plans &amp; Pricing</a>
    </div>
    <p style="font-size:.78rem;color:#7c6aa0;margin-top:16px;">Credit card required · No charge until trial ends &middot; All 7 modules included &middot; Cancel any time</p>
  </div>
</section>

<!-- ── CTA ───────────────────────────────────────────────── -->
<section class="cta-section">
  <div class="container" style="position:relative;z-index:1;">
    <span class="tag" style="background:rgba(255,255,255,.15);color:#fff;margin-bottom:16px;display:inline-block;">SalonOS by Certxa</span>
    <h2 class="cta-title">Your salon's new<br><em>operating system.</em></h2>
    <p class="cta-text">The only operating system built exclusively for nail studios — booking, POS, loyalty, kiosk, and revenue intelligence, all in one place.</p>
    <div class="cta-actions">
      <a href="#" class="btn btn-gold">Start Free Trial</a>
      <a href="/contact" class="btn btn-outline-white">Talk to Us</a>
    </div>
    <p class="cta-note"><?= TRIAL_DAYS ?>-day free trial &middot; All modules included &middot; Credit card required · No charge until trial ends</p>
  </div>
</section>

</div><!-- /sos-page -->

<?php require 'includes/footer.php'; ?>
