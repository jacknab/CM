<?php
define('BRAND_NAME',    'Certxa');
define('PAGE_TITLE',    'Revenue Intelligence for Salons | AI-Powered Growth Engine — Certxa');
define('PAGE_DESC',     'Certxa Revenue Intelligence watches your salon data 24/7 — detecting drifting clients, predicting no-shows, filling dead seats, and recovering lost revenue automatically. Included in every SalonOS plan.');
define('PAGE_KEYWORDS', 'salon revenue intelligence, salon AI analytics, salon client retention software, salon no-show prediction, salon churn risk, salon rebooking rate, salon growth score, salon revenue leakage, salon win-back campaigns');
define('PAGE_CANONICAL', 'https://certxa.com/revenue-intelligence');
define('PAGE_BREADCRUMBS', json_encode([
  ['name'=>'Home','url'=>'https://certxa.com/'],
  ['name'=>'Revenue Intelligence','url'=>'https://certxa.com/revenue-intelligence'],
]));
define('PAGE_SCHEMA', json_encode([
  [
    '@type'       => 'WebPage',
    '@id'         => 'https://certxa.com/revenue-intelligence',
    'name'        => 'Revenue Intelligence for Salons — Certxa',
    'description' => 'Certxa Revenue Intelligence automatically detects drifting clients, predicts no-shows, fills dead seats, and recovers lost revenue — all included in SalonOS.',
    'url'         => 'https://certxa.com/revenue-intelligence',
    'isPartOf'    => ['@id'=>'https://certxa.com/#website'],
  ],
  [
    '@type'      => 'FAQPage',
    'mainEntity' => [
      ['@type'=>'Question','name'=>'What is Certxa Revenue Intelligence?','acceptedAnswer'=>['@type'=>'Answer','text'=>'Revenue Intelligence is a built-in engine inside SalonOS that automatically mines your appointment data to detect drifting clients, predict no-shows, identify dead seat patterns, calculate revenue leakage, and score every client on lifetime value and churn risk — then takes automated action to recover lost revenue.']],
      ['@type'=>'Question','name'=>'Does Revenue Intelligence cost extra?','acceptedAnswer'=>['@type'=>'Answer','text'=>'No. Revenue Intelligence is included in Professional and Elite plans at no additional cost. There are no add-ons or setup fees for this feature.']],
      ['@type'=>'Question','name'=>'How does the Client Drift Engine work?','acceptedAnswer'=>['@type'=>'Answer','text'=>'SalonOS learns each client\'s visit cadence — how often they typically come in. When a client goes 20% past their personal cadence without rebooking, the system automatically fires a personalized SMS to bring them back. This alone recovers 10–15% of quietly drifting clients.']],
      ['@type'=>'Question','name'=>'What is the Business Growth Score?','acceptedAnswer'=>['@type'=>'Answer','text'=>'The Growth Score is a single 0–100 number that measures your salon\'s health across five dimensions: client retention rate, rebooking rate, seat utilization, average ticket trend, and new client conversion. It updates daily and tells you exactly which component moved and why.']],
      ['@type'=>'Question','name'=>'How does no-show prediction work?','acceptedAnswer'=>['@type'=>'Answer','text'=>'Every upcoming appointment is scored for no-show risk using multiple factors: the client\'s personal no-show history, how far in advance they booked, the day of week, and the service type. High-risk appointments are surfaced every morning, and automated confirmation reminders are sent to at-risk clients so you never have to chase them yourself.']],
    ],
  ],
]));
require 'includes/header.php';
require 'includes/nav.php';
?>

<style>
@import url('https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@400;500;600;700;800&display=swap');

.ri-page { background: #faf8ff; }

/* ── Hero ───────────────────────────────────────────── */
.ri-hero {
  background: linear-gradient(160deg, #0d0017 0%, #1a0035 45%, #0d001f 100%);
  padding: 120px 0 100px;
  text-align: center;
  position: relative;
  overflow: hidden;
}
.ri-hero::before {
  content: '';
  position: absolute;
  top: -200px; left: 50%;
  transform: translateX(-50%);
  width: 800px; height: 800px;
  background: radial-gradient(circle, rgba(109,40,217,.25) 0%, transparent 65%);
  pointer-events: none;
}
.ri-hero::after {
  content: '';
  position: absolute;
  bottom: -100px; right: -100px;
  width: 500px; height: 500px;
  background: radial-gradient(circle, rgba(245,158,11,.12) 0%, transparent 65%);
  pointer-events: none;
}
.ri-eyebrow {
  display: inline-flex; align-items: center; gap: 8px;
  background: rgba(167,139,250,.12); border: 1px solid rgba(167,139,250,.35);
  border-radius: 50px; padding: 6px 20px; margin-bottom: 28px;
  font-family: 'Instrument Sans', sans-serif;
  font-size: .72rem; font-weight: 700; color: #c4b5fd;
  letter-spacing: .12em; text-transform: uppercase;
}
.ri-headline {
  font-family: 'Instrument Sans', sans-serif;
  font-size: clamp(2.8rem, 6.5vw, 5.5rem);
  font-weight: 800; line-height: 1.06; letter-spacing: -.04em;
  color: #fff; margin-bottom: 24px;
}
.ri-headline em { font-style: normal; color: #a78bfa; }
.ri-sub {
  font-size: clamp(1rem, 1.8vw, 1.2rem);
  color: rgba(255,255,255,.65); max-width: 600px;
  margin: 0 auto 44px; line-height: 1.75;
}
.ri-hero-btns { display: flex; gap: 14px; justify-content: center; flex-wrap: wrap; margin-bottom: 56px; }
.ri-btn-primary {
  display: inline-block; padding: 14px 32px; border-radius: 50px;
  background: linear-gradient(135deg, #7c3aed, #a855f7);
  color: #fff; font-weight: 700; font-size: .95rem; text-decoration: none;
  box-shadow: 0 8px 30px rgba(124,58,237,.4);
  transition: transform .15s, box-shadow .15s;
}
.ri-btn-primary:hover { transform: translateY(-2px); box-shadow: 0 12px 40px rgba(124,58,237,.55); }
.ri-btn-outline {
  display: inline-block; padding: 14px 32px; border-radius: 50px;
  border: 1.5px solid rgba(167,139,250,.5);
  color: #c4b5fd; font-weight: 600; font-size: .95rem; text-decoration: none;
  transition: border-color .15s, background .15s;
}
.ri-btn-outline:hover { border-color: #a78bfa; background: rgba(167,139,250,.08); }

/* ── Live Dashboard Mock ─────────────────────────────── */
.ri-dashboard-mock {
  max-width: 900px; margin: 0 auto;
  background: rgba(255,255,255,.04); border: 1px solid rgba(167,139,250,.2);
  border-radius: 20px; overflow: hidden;
  box-shadow: 0 40px 100px rgba(0,0,0,.5);
}
.ri-mock-bar {
  background: rgba(0,0,0,.4); padding: 12px 20px;
  display: flex; align-items: center; gap: 8px;
  border-bottom: 1px solid rgba(255,255,255,.06);
}
.ri-mock-dot { width: 10px; height: 10px; border-radius: 50%; }
.ri-mock-url {
  flex: 1; margin-left: 8px;
  background: rgba(255,255,255,.06); border-radius: 6px;
  padding: 4px 12px; font-size: .72rem; color: #6b7280; text-align: center;
}
.ri-mock-body { padding: 24px; }

/* ── Stats row ───────────────────────────────────────── */
.ri-stats-row {
  display: grid; grid-template-columns: repeat(auto-fit, minmax(160px,1fr));
  gap: 20px; padding: 56px 0;
}
.ri-stat { text-align: center; }
.ri-stat-num {
  font-family: 'Instrument Sans', sans-serif;
  font-size: clamp(2.2rem, 4vw, 3.2rem); font-weight: 800;
  letter-spacing: -.03em; color: #5b21b6; line-height: 1;
  margin-bottom: 6px;
}
.ri-stat-label { font-size: .82rem; color: #6b7280; line-height: 1.4; }

/* ── Section headers ─────────────────────────────────── */
.ri-section { padding: 80px 0; }
.ri-section-dark { background: linear-gradient(160deg, #0d0017 0%, #1a0035 60%, #0d001f 100%); }
.ri-section-light { background: #faf8ff; }
.ri-section-mid { background: #f3eeff; }

.ri-section-label {
  display: inline-block;
  background: rgba(91,33,182,.08); border: 1px solid rgba(91,33,182,.18);
  color: #5b21b6; border-radius: 50px; padding: 4px 16px;
  font-size: .7rem; font-weight: 700; letter-spacing: .1em; text-transform: uppercase;
  margin-bottom: 20px;
}
.ri-section-label-dark {
  background: rgba(167,139,250,.12); border: 1px solid rgba(167,139,250,.3);
  color: #c4b5fd;
}
.ri-section-title {
  font-family: 'Instrument Sans', sans-serif;
  font-size: clamp(2rem, 4vw, 3.4rem); font-weight: 800;
  letter-spacing: -.03em; color: #1c1917; line-height: 1.12; margin-bottom: 18px;
}
.ri-section-title-light { color: #fff; }
.ri-section-sub { font-size: 1.05rem; color: #6b7280; max-width: 560px; line-height: 1.75; margin-bottom: 48px; }
.ri-section-sub-light { color: rgba(255,255,255,.6); }

/* ── Feature deep-dives ──────────────────────────────── */
.ri-feature-spotlight {
  display: grid; grid-template-columns: 1fr 1fr; gap: 60px; align-items: center;
  margin-bottom: 80px;
}
.ri-feature-spotlight.reversed { direction: rtl; }
.ri-feature-spotlight.reversed > * { direction: ltr; }
@media (max-width: 860px) {
  .ri-feature-spotlight { grid-template-columns: 1fr; }
  .ri-feature-spotlight.reversed { direction: ltr; }
}
.ri-feature-tag {
  display: inline-flex; align-items: center; gap: 6px;
  font-size: .7rem; font-weight: 700; letter-spacing: .1em; text-transform: uppercase;
  margin-bottom: 14px;
}
.ri-feature-title {
  font-family: 'Instrument Sans', sans-serif;
  font-size: clamp(1.5rem, 2.5vw, 2rem); font-weight: 800;
  letter-spacing: -.025em; color: #1c1917; line-height: 1.2; margin-bottom: 16px;
}
.ri-feature-body { font-size: .95rem; color: #4b5563; line-height: 1.8; margin-bottom: 20px; }
.ri-feature-checks { list-style: none; padding: 0; margin: 0 0 24px; display: flex; flex-direction: column; gap: 8px; }
.ri-feature-checks li { font-size: .88rem; color: #374151; display: flex; align-items: flex-start; gap: 8px; }
.ri-feature-checks li::before { content: '✓'; color: #10b981; font-weight: 700; flex-shrink: 0; margin-top: 1px; }
.ri-feature-link { font-size: .85rem; font-weight: 700; color: #7c3aed; text-decoration: none; display: inline-flex; align-items: center; gap: 4px; }
.ri-feature-link:hover { color: #5b21b6; }

/* ── Mock cards ──────────────────────────────────────── */
.ri-mock-card {
  background: #fff; border: 1px solid #ede9f7;
  border-radius: 16px; padding: 24px; box-shadow: 0 8px 40px rgba(59,7,100,.08);
}
.ri-mock-card-dark {
  background: rgba(255,255,255,.04); border: 1px solid rgba(167,139,250,.2);
  border-radius: 16px; padding: 24px;
}
.ri-mock-row {
  display: flex; align-items: center; justify-content: space-between;
  padding: 10px 0; border-bottom: 1px solid rgba(0,0,0,.05);
}
.ri-mock-row:last-child { border-bottom: none; }
.ri-mock-name { font-size: .82rem; font-weight: 600; color: #1c1917; }
.ri-mock-sub { font-size: .72rem; color: #9ca3af; margin-top: 1px; }
.ri-badge {
  font-size: .65rem; font-weight: 700; padding: 3px 8px; border-radius: 50px;
  white-space: nowrap;
}
.ri-badge-red { background: rgba(239,68,68,.1); color: #dc2626; }
.ri-badge-amber { background: rgba(245,158,11,.1); color: #d97706; }
.ri-badge-green { background: rgba(16,185,129,.1); color: #059669; }
.ri-badge-purple { background: rgba(124,58,237,.1); color: #7c3aed; }
.ri-progress-bar {
  height: 6px; border-radius: 3px; background: #f3f4f6; overflow: hidden;
}
.ri-progress-fill { height: 100%; border-radius: 3px; transition: width .4s ease; }

/* ── 8-feature grid ──────────────────────────────────── */
.ri-features-grid {
  display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 20px;
}
.ri-feat-card {
  background: rgba(255,255,255,.04); border: 1px solid rgba(167,139,250,.18);
  border-radius: 16px; padding: 24px; transition: .2s;
}
.ri-feat-card:hover { border-color: rgba(167,139,250,.45); background: rgba(167,139,250,.06); }
.ri-feat-icon {
  width: 42px; height: 42px; border-radius: 12px; display: flex;
  align-items: center; justify-content: center; font-size: 1.2rem;
  margin-bottom: 14px; flex-shrink: 0;
}
.ri-feat-label { font-size: .65rem; font-weight: 700; letter-spacing: .1em; text-transform: uppercase; margin-bottom: 2px; }
.ri-feat-subline { font-size: .72rem; color: #6b7280; margin-bottom: 12px; }
.ri-feat-body { font-size: .83rem; color: #d1d5db; line-height: 1.65; margin-bottom: 12px; }
.ri-feat-proof { font-size: .7rem; font-weight: 700; color: #4ade80; }

/* ── Weekly digest preview ───────────────────────────── */
.ri-digest-preview {
  max-width: 520px; margin: 0 auto;
  background: #fff; border: 1px solid #e5e7eb;
  border-radius: 16px; overflow: hidden;
  box-shadow: 0 16px 60px rgba(59,7,100,.12);
}
.ri-digest-header {
  background: linear-gradient(135deg, #3B0764, #5B21B6);
  padding: 28px 32px; color: #fff;
}
.ri-digest-body { padding: 24px 32px; }
.ri-digest-section { margin-bottom: 20px; }
.ri-digest-section-title { font-size: .65rem; font-weight: 700; letter-spacing: .1em; text-transform: uppercase; color: #9ca3af; margin-bottom: 12px; }
.ri-digest-metric { display: flex; justify-content: space-between; align-items: center; padding: 8px 0; border-bottom: 1px solid #f3f4f6; }
.ri-digest-metric:last-child { border-bottom: none; }
.ri-digest-metric-label { font-size: .82rem; color: #4b5563; }
.ri-digest-metric-value { font-size: .88rem; font-weight: 700; }

/* ── How it works ────────────────────────────────────── */
.ri-steps { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px,1fr)); gap: 32px; }
.ri-step { text-align: center; }
.ri-step-num {
  width: 52px; height: 52px; border-radius: 50%;
  background: linear-gradient(135deg, rgba(124,58,237,.15), rgba(167,139,250,.15));
  border: 1px solid rgba(124,58,237,.25);
  display: flex; align-items: center; justify-content: center;
  font-family: 'Instrument Sans', sans-serif; font-size: 1.1rem; font-weight: 800; color: #7c3aed;
  margin: 0 auto 16px;
}
.ri-step-title { font-size: .95rem; font-weight: 700; color: #1c1917; margin-bottom: 8px; }
.ri-step-body { font-size: .82rem; color: #6b7280; line-height: 1.7; }

/* ── Comparison table ────────────────────────────────── */
.ri-compare { width: 100%; border-collapse: collapse; }
.ri-compare thead th { position: sticky; top: 0; z-index: 2; background: #faf8ff; padding: 14px 20px; font-size: .72rem; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: #9ca3af; text-align: left; border-bottom: 2px solid #e5e7eb; box-shadow: 0 2px 0 #e5e7eb; }
.ri-compare thead th:first-child { border-radius: 0; }
.ri-compare td { padding: 14px 20px; font-size: .88rem; border-bottom: 1px solid #f3f4f6; }
.ri-compare tr:last-child td { border-bottom: none; }
.ri-compare .feature-col { color: #374151; font-weight: 500; }
.ri-compare .yes { color: #059669; font-weight: 700; }
.ri-compare .no  { color: #d1d5db; }
.ri-compare tr:hover td { background: rgba(91,33,182,.025); }

/* ── Testimonials ────────────────────────────────────── */
.ri-testimonials { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px,1fr)); gap: 24px; }
.ri-testimonial {
  background: #fff; border: 1px solid #ede9f7;
  border-radius: 16px; padding: 28px;
  box-shadow: 0 4px 20px rgba(59,7,100,.05);
}
.ri-testimonial-quote { font-size: .88rem; color: #374151; line-height: 1.75; margin-bottom: 20px; font-style: italic; }
.ri-testimonial-author { display: flex; align-items: center; gap: 12px; }
.ri-testimonial-avatar {
  width: 40px; height: 40px; border-radius: 50%;
  background: linear-gradient(135deg, #7c3aed, #a855f7);
  display: flex; align-items: center; justify-content: center;
  font-size: .75rem; font-weight: 700; color: #fff; flex-shrink: 0;
}
.ri-testimonial-name { font-size: .82rem; font-weight: 700; color: #1c1917; }
.ri-testimonial-role { font-size: .72rem; color: #9ca3af; }

/* ── FAQ ─────────────────────────────────────────────── */
.ri-faq { max-width: 720px; margin: 0 auto; }
.ri-faq-item { border-bottom: 1px solid #e5e7eb; }
.ri-faq-item:last-child { border-bottom: none; }
.ri-faq-q {
  width: 100%; background: none; border: none; cursor: pointer;
  display: flex; align-items: center; justify-content: space-between;
  padding: 20px 0; font-size: .95rem; font-weight: 600; color: #1c1917;
  text-align: left; gap: 16px;
}
.ri-faq-q:hover { color: #5b21b6; }
.ri-faq-icon { font-size: 1.4rem; color: #9ca3af; flex-shrink: 0; transition: transform .2s; }
.ri-faq-a { font-size: .88rem; color: #4b5563; line-height: 1.8; padding-bottom: 20px; display: none; }
.ri-faq-item.open .ri-faq-a { display: block; }
.ri-faq-item.open .ri-faq-icon { transform: rotate(45deg); color: #5b21b6; }

/* ── CTA ─────────────────────────────────────────────── */
.ri-cta {
  background: linear-gradient(135deg, #3B0764, #5B21B6);
  padding: 80px 0; text-align: center;
}

/* ── Utilities ───────────────────────────────────────── */
.container { max-width: 1120px; margin: 0 auto; padding: 0 24px; }
.text-center { text-align: center; }
@media (max-width: 640px) {
  .ri-hero { padding: 80px 0 64px; }
  .ri-section { padding: 56px 0; }
}
</style>

<div class="ri-page">
<main id="main-content">

<!-- ── HERO ──────────────────────────────────────────── -->
<section class="ri-hero">
  <div class="container" style="position:relative;z-index:1;">
    <div class="ri-eyebrow">
      <span style="width:6px;height:6px;border-radius:50%;background:#a78bfa;box-shadow:0 0 8px #a78bfa;display:inline-block;"></span>
      SalonOS · Revenue Intelligence
    </div>
    <h1 class="ri-headline">
      Your salon's<br>
      <em>revenue co-pilot.</em>
    </h1>
    <p class="ri-sub">
      SalonOS watches your booking data 24/7 — detecting drifting clients, predicting no-shows, finding dead seats, and automatically recovering lost revenue. No other salon platform does this.
    </p>
    <div class="ri-hero-btns">
      <a href="/auth?mode=register" class="ri-btn-primary">Start Free — See It Working</a>
      <a href="/salonos" class="ri-btn-outline">Explore SalonOS →</a>
    </div>

    <!-- Live dashboard preview -->
    <div class="ri-dashboard-mock">
      <div class="ri-mock-bar">
        <div class="ri-mock-dot" style="background:#ff5f57;"></div>
        <div class="ri-mock-dot" style="background:#ffbd2e;"></div>
        <div class="ri-mock-dot" style="background:#28c840;"></div>
        <div class="ri-mock-url">app.certxa.com/manage/intelligence</div>
      </div>
      <div class="ri-mock-body">
        <!-- Top action bar -->
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;flex-wrap:wrap;gap:12px;">
          <div>
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
              <span style="font-size:.75rem;">🧠</span>
              <span style="font-size:.88rem;font-weight:700;color:#fff;">Revenue Intelligence</span>
            </div>
            <div style="font-size:.65rem;color:#6b7280;">Updated 4 minutes ago</div>
          </div>
          <div style="display:flex;gap:8px;">
            <div style="background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.08);border-radius:8px;padding:6px 12px;font-size:.65rem;color:#9ca3af;">📧 Send digest</div>
            <div style="background:rgba(124,58,237,.25);border:1px solid rgba(124,58,237,.4);border-radius:8px;padding:6px 12px;font-size:.65rem;color:#c4b5fd;">🔄 Refresh</div>
          </div>
        </div>
        <!-- Metric tiles -->
        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:20px;">
          <?php foreach ([
            ['74','Growth Score','↑ +6 from last month','#a78bfa'],
            ['88%','Retention Rate','37-day rolling avg','#4ade80'],
            ['$3,200','Revenue at Risk','8 lapsed clients','#fbbf24'],
            ['3','No-Show Risks','Tomorrow\'s calendar','#f87171'],
          ] as [$val,$label,$sub,$color]): ?>
          <div style="background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);border-radius:10px;padding:12px;">
            <div style="font-family:'Instrument Sans',sans-serif;font-size:<?= strlen($val) > 4 ? '1.1rem' : '1.5rem' ?>;font-weight:800;color:<?= $color ?>;line-height:1;margin-bottom:4px;"><?= $val ?></div>
            <div style="font-size:.62rem;font-weight:600;color:#9ca3af;text-transform:uppercase;letter-spacing:.05em;"><?= $label ?></div>
            <div style="font-size:.6rem;color:#6b7280;margin-top:2px;"><?= $sub ?></div>
          </div>
          <?php endforeach; ?>
        </div>
        <!-- Daily actions -->
        <div style="background:rgba(0,0,0,.3);border:1px solid rgba(255,255,255,.06);border-radius:12px;padding:14px;">
          <div style="font-size:.65rem;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.08em;margin-bottom:12px;">Today's Priority Actions</div>
          <?php foreach ([
            ['⚠️','3 high-risk appointments today','$420 revenue at stake','#f87171','Review no-show risks'],
            ['📡','5 high-value clients drifting','$2,800 annual revenue at stake','#a78bfa','Start win-back campaign'],
            ['💺','Tue 2–4pm dead seat detected','6 eligible clients to target','#4ade80','Fill those seats'],
          ] as [$icon,$label,$detail,$color,$cta]): ?>
          <div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid rgba(255,255,255,.05);">
            <span style="font-size:.9rem;flex-shrink:0;"><?= $icon ?></span>
            <div style="flex:1;min-width:0;">
              <div style="font-size:.72rem;font-weight:600;color:#e5e7eb;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;"><?= $label ?></div>
              <div style="font-size:.62rem;color:<?= $color ?>;"><?= $detail ?></div>
            </div>
            <div style="background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);border-radius:6px;padding:4px 10px;font-size:.6rem;font-weight:600;color:#9ca3af;white-space:nowrap;flex-shrink:0;"><?= $cta ?></div>
          </div>
          <?php endforeach; ?>
          <div style="display:flex;align-items:center;gap:10px;padding:8px 0;">
            <span style="font-size:.9rem;flex-shrink:0;">✅</span>
            <div style="flex:1;">
              <div style="font-size:.72rem;font-weight:600;color:#e5e7eb;">4 rebooking nudges auto-sent this week</div>
              <div style="font-size:.62rem;color:#4ade80;">2 confirmed bookings recovered</div>
            </div>
          </div>
        </div>
      </div>
    </div>

  </div>
</section>

<!-- ── STATS ──────────────────────────────────────────── -->
<section class="ri-section ri-section-light" style="padding:40px 0;">
  <div class="container">
    <div class="ri-stats-row">
      <?php foreach ([
        ['10–15%','of drifting clients recovered automatically'],
        ['68%','average reduction in no-shows'],
        ['6 hrs','how often the engine runs in the background'],
        ['$0','extra cost — included in every SalonOS plan'],
        ['8+','intelligence engines running simultaneously'],
      ] as [$num,$label]): ?>
      <div class="ri-stat">
        <div class="ri-stat-num"><?= $num ?></div>
        <div class="ri-stat-label"><?= $label ?></div>
      </div>
      <?php endforeach; ?>
    </div>
  </div>
</section>

<!-- ── HOW IT WORKS ───────────────────────────────────── -->
<section class="ri-section ri-section-mid">
  <div class="container text-center">
    <div class="ri-section-label">How It Works</div>
    <h2 class="ri-section-title">Set it up once. It runs forever.</h2>
    <p class="ri-section-sub" style="margin:0 auto 56px;">Revenue Intelligence is fully automatic. There's no configuration, no dashboards you have to check. It works silently in the background and surfaces only what matters.</p>
    <div class="ri-steps">
      <?php foreach ([
        ['1','Your data is mined','Every appointment, service, no-show, and cancellation is analyzed. Visit cadences are learned for each individual client.'],
        ['2','Patterns are detected','Dead seats, drifting clients, churn risks, and no-show signals are identified automatically every 6 hours.'],
        ['3','Actions are taken','Personalized SMS goes to drifting clients. High-risk appointments are flagged. Dead seat campaigns are queued.'],
        ['4','You see the results','Your Growth Score updates, revenue recovered is tracked, and a weekly digest lands in your inbox every Monday.'],
      ] as [$num,$title,$body]): ?>
      <div class="ri-step">
        <div class="ri-step-num"><?= $num ?></div>
        <div class="ri-step-title"><?= $title ?></div>
        <div class="ri-step-body"><?= $body ?></div>
      </div>
      <?php endforeach; ?>
    </div>
  </div>
</section>

<!-- ── CLIENT DRIFT ENGINE (deep dive) ───────────────── -->
<section class="ri-section ri-section-light">
  <div class="container">
    <div class="ri-feature-spotlight">
      <div>
        <div class="ri-feature-tag" style="color:#7c3aed;">
          <span>📡</span> Client Drift Engine
        </div>
        <h2 class="ri-feature-title">Catches clients going quiet<br>before you even notice.</h2>
        <p class="ri-feature-body">
          Every client develops a personal visit cadence — every 5 weeks, every 8 weeks, whatever their rhythm is. SalonOS learns it. When someone drifts 20% past that cadence without rebooking, a personalized SMS fires automatically at exactly the right moment — not a blast campaign, a personal nudge.
        </p>
        <ul class="ri-feature-checks">
          <li>Individual cadence learned from visit history — not a one-size-fits-all trigger</li>
          <li>SMS is personalized with client's name, service type, and how long it's been</li>
          <li>Recovers 10–15% of quietly lapsing clients on average</li>
          <li>Frequency capped so clients never feel spammed (14-day cooldown)</li>
          <li>Only fires if the client has no upcoming booking already</li>
        </ul>
      </div>
      <div>
        <div class="ri-mock-card">
          <div style="font-size:.65rem;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:.08em;margin-bottom:14px;">Client Drift Alerts — This Week</div>
          <?php foreach ([
            ['SG','Sarah G.','Balayage · every 6w','7 weeks overdue','$165/visit','critical'],
            ['MT','Marcus T.','Cut & Style · every 4w','5 weeks overdue','$85/visit','high'],
            ['AK','Aaliyah K.','Colour · every 8w','10 weeks overdue','$210/visit','critical'],
            ['PS','Priya S.','Nails · every 3w','4 weeks overdue','$75/visit','medium'],
          ] as [$init,$name,$service,$overdue,$val,$risk]): ?>
          <div class="ri-mock-row">
            <div style="display:flex;align-items:center;gap:10px;">
              <div style="width:34px;height:34px;border-radius:50%;background:linear-gradient(135deg,#7c3aed,#a855f7);display:flex;align-items:center;justify-content:center;font-size:.65rem;font-weight:700;color:#fff;flex-shrink:0;"><?= $init ?></div>
              <div>
                <div class="ri-mock-name"><?= $name ?></div>
                <div class="ri-mock-sub"><?= $service ?> · <span style="color:#f87171;"><?= $overdue ?></span></div>
              </div>
            </div>
            <div style="text-align:right;">
              <div style="font-size:.75rem;font-weight:700;color:#5b21b6;"><?= $val ?></div>
              <span class="ri-badge ri-badge-<?= $risk === 'critical' ? 'red' : ($risk === 'high' ? 'amber' : 'purple') ?>"><?= ucfirst($risk) ?></span>
            </div>
          </div>
          <?php endforeach; ?>
          <div style="margin-top:14px;background:rgba(124,58,237,.06);border:1px solid rgba(124,58,237,.15);border-radius:10px;padding:12px 14px;">
            <div style="font-size:.72rem;color:#6b7280;margin-bottom:4px;">📱 Auto-sent SMS to Sarah G.</div>
            <div style="font-size:.78rem;color:#374151;font-style:italic;">"Hi Sarah, it's been 7 weeks since your last gel manicure — time for a fresh set? Book now: certxa.com/book/glowstudio"</div>
            <div style="font-size:.65rem;color:#10b981;font-weight:700;margin-top:6px;">✓ Sent automatically at 10:14 AM</div>
          </div>
        </div>
      </div>
    </div>
  </div>
</section>

<!-- ── REVENUE LEAKAGE (deep dive) ───────────────────── -->
<section class="ri-section ri-section-mid">
  <div class="container">
    <div class="ri-feature-spotlight reversed">
      <div>
        <div class="ri-feature-tag" style="color:#d97706;">
          <span>💸</span> Revenue Leakage Report
        </div>
        <h2 class="ri-feature-title">Cold hard numbers, monthly.<br>Not stats — action items.</h2>
        <p class="ri-feature-body">
          Every month SalonOS calculates exactly how much revenue slipped through your fingers — from no-shows, cancellations, and lapsed clients. It doesn't bury this in a chart. It shows you the names, the dollars, and automatically sends personalized win-back messages to recover them — no action required from you.
        </p>
        <ul class="ri-feature-checks">
          <li>Breaks down losses by no-shows, cancellations, and lapsed clients separately</li>
          <li>Shows estimated annual revenue impact per lapsed client</li>
          <li>Win-back messages sent automatically to all lapsed clients who opted in</li>
          <li>90-day rolling trend so you can see if things are improving</li>
          <li>Delivered automatically every Monday with your weekly digest</li>
        </ul>
      </div>
      <div>
        <div class="ri-mock-card">
          <div style="font-size:.65rem;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:.08em;margin-bottom:16px;">Revenue Leakage · Last 90 Days</div>
          <?php foreach ([
            ['No-show losses','$1,140','12 appointments','#ef4444'],
            ['Cancellation losses','$860','9 appointments','#f97316'],
            ['Lapsed client losses','$3,200','8 clients · est. annual','#fbbf24'],
          ] as [$label,$amount,$sub,$color]): ?>
          <div style="background:rgba(0,0,0,.02);border:1px solid #f3f4f6;border-radius:10px;padding:12px 14px;margin-bottom:10px;display:flex;justify-content:space-between;align-items:center;">
            <div>
              <div style="font-size:.78rem;font-weight:600;color:#374151;"><?= $label ?></div>
              <div style="font-size:.7rem;color:#9ca3af;"><?= $sub ?></div>
            </div>
            <div style="font-size:1.1rem;font-weight:800;color:<?= $color ?>;"><?= $amount ?></div>
          </div>
          <?php endforeach; ?>
          <div style="background:rgba(239,68,68,.05);border:1px solid rgba(239,68,68,.15);border-radius:10px;padding:14px;margin-top:4px;display:flex;justify-content:space-between;align-items:center;">
            <div>
              <div style="font-size:.78rem;font-weight:700;color:#374151;">Total estimated leakage</div>
              <div style="font-size:.7rem;color:#9ca3af;">Recovery potential: ~$2,600</div>
            </div>
            <div style="font-size:1.3rem;font-weight:800;color:#ef4444;">$5,200</div>
          </div>
          <div style="margin-top:14px;background:rgba(16,185,129,.06);border:1px solid rgba(16,185,129,.2);border-radius:10px;padding:12px 16px;display:flex;align-items:center;justify-content:space-between;">
            <div>
              <div style="font-size:.75rem;font-weight:700;color:#059669;">✓ Win-back campaign auto-sent</div>
              <div style="font-size:.65rem;color:#6b7280;">8 personalised messages sent automatically · no action needed</div>
            </div>
            <span style="font-size:.72rem;font-weight:700;color:#10b981;">Running</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</section>

<!-- ── LTV + CHURN RISK (deep dive) ──────────────────── -->
<section class="ri-section ri-section-light">
  <div class="container">
    <div class="ri-feature-spotlight">
      <div>
        <div class="ri-feature-tag" style="color:#d97706;">
          <span>🎯</span> LTV + Churn Risk Score
        </div>
        <h2 class="ri-feature-title">Know who you absolutely<br>cannot afford to lose.</h2>
        <p class="ri-feature-body">
          Every client in your system gets two live numbers: their Lifetime Value (total and 12-month) and a Churn Risk Score. High LTV + rising churn risk is the most dangerous combination in your business. SalonOS surfaces those clients at the top of your priority list so you can act before it's too late.
        </p>
        <ul class="ri-feature-checks">
          <li>LTV calculated from actual spend history — not estimates</li>
          <li>Churn risk uses visit cadence, no-show history, and days since last visit</li>
          <li>Labels each client: Low / Medium / High / Critical risk</li>
          <li>Your 8 highest-value at-risk clients are highlighted every week</li>
          <li>One-tap win-back SMS for any individual client</li>
        </ul>
      </div>
      <div>
        <div class="ri-mock-card">
          <div style="font-size:.65rem;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:.08em;margin-bottom:6px;">At-Risk Clients · High LTV</div>
          <div style="font-size:.72rem;color:#ef4444;font-weight:600;margin-bottom:14px;">⚠ $11,400 annual revenue at stake</div>
          <?php foreach ([
            ['SG','Sarah G.','LTV $3,200/yr','Critical','#dc2626'],
            ['JT','James T.','LTV $2,800/yr','Critical','#dc2626'],
            ['AK','Aaliyah K.','LTV $2,100/yr','High','#d97706'],
            ['MT','Marcus T.','LTV $1,900/yr','High','#d97706'],
            ['EM','Emma M.','LTV $1,400/yr','Medium','#ca8a04'],
          ] as [$init,$name,$ltv,$risk,$color]): ?>
          <div style="display:flex;align-items:center;justify-content:space-between;padding:9px 0;border-bottom:1px solid #f3f4f6;">
            <div style="display:flex;align-items:center;gap:10px;">
              <div style="width:32px;height:32px;border-radius:50%;background:linear-gradient(135deg,<?= $color ?>,<?= $color ?>aa);display:flex;align-items:center;justify-content:center;font-size:.62rem;font-weight:700;color:#fff;flex-shrink:0;"><?= $init ?></div>
              <div>
                <div style="font-size:.8rem;font-weight:600;color:#1c1917;"><?= $name ?></div>
                <div style="font-size:.68rem;color:#9ca3af;"><?= $ltv ?></div>
              </div>
            </div>
            <div style="display:flex;align-items:center;gap:8px;">
              <span style="font-size:.62rem;font-weight:700;padding:2px 8px;border-radius:50px;background:<?= $color ?>18;color:<?= $color ?>;"><?= $risk ?></span>
              <span style="font-size:.62rem;color:#a78bfa;cursor:pointer;">Win-back →</span>
            </div>
          </div>
          <?php endforeach; ?>
        </div>
      </div>
    </div>
  </div>
</section>

<!-- ── ALL 8 FEATURES GRID ────────────────────────────── -->
<section class="ri-section ri-section-dark">
  <div class="container">
    <div class="text-center" style="margin-bottom:56px;">
      <div class="ri-section-label ri-section-label-dark">All Intelligence Features</div>
      <h2 class="ri-section-title ri-section-title-light">8 engines. All running,<br><em style="color:#a78bfa;">all the time.</em></h2>
      <p class="ri-section-sub ri-section-sub-light" style="margin:0 auto;">Every feature below is live in your dashboard from day one on Professional and Elite plans. No configuration required.</p>
    </div>
    <div class="ri-features-grid">

      <div class="ri-feat-card">
        <div class="ri-feat-icon" style="background:linear-gradient(135deg,rgba(167,139,250,.3),rgba(109,40,217,.3));">📡</div>
        <div class="ri-feat-label" style="color:#a78bfa;">Client Drift Engine</div>
        <div class="ri-feat-subline">Biggest direct revenue impact</div>
        <p class="ri-feat-body">Learns each client's personal visit cadence. When they drift 20%+ past it without booking, fires a personalized win-back SMS automatically.</p>
        <div class="ri-feat-proof">✓ Recovers 10–15% of quietly lapsing clients</div>
      </div>

      <div class="ri-feat-card">
        <div class="ri-feat-icon" style="background:linear-gradient(135deg,rgba(251,191,36,.25),rgba(180,83,9,.25));">💸</div>
        <div class="ri-feat-label" style="color:#fbbf24;">Revenue Leakage Report</div>
        <div class="ri-feat-subline">Monthly, fully automated</div>
        <p class="ri-feat-body">Calculates exactly how much revenue was lost to no-shows, cancellations, and lapsed clients — with names, dollars, and automated win-back messages sent without you lifting a finger.</p>
        <div class="ri-feat-proof">✓ Win-back messages sent automatically</div>
      </div>

      <div class="ri-feat-card">
        <div class="ri-feat-icon" style="background:linear-gradient(135deg,rgba(16,185,129,.25),rgba(5,150,105,.25));">💺</div>
        <div class="ri-feat-label" style="color:#34d399;">Dead Seat Intelligence</div>
        <div class="ri-feat-subline">Turn slow hours into revenue</div>
        <p class="ri-feat-body">Detects consistently under-booked time slots, identifies which clients have historically booked those times and are now overdue, and queues a targeted "fill those seats" campaign.</p>
        <div class="ri-feat-proof">✓ Estimates revenue lost per dead slot</div>
      </div>

      <div class="ri-feat-card">
        <div class="ri-feat-icon" style="background:linear-gradient(135deg,rgba(239,68,68,.25),rgba(185,28,28,.25));">⚠️</div>
        <div class="ri-feat-label" style="color:#f87171;">No-Show Prediction</div>
        <div class="ri-feat-subline">Know before they don't show</div>
        <p class="ri-feat-body">Every upcoming appointment is scored for risk using lead time, client history, day of week, and service type. High-risk appointments surface every morning and automated reminders fire to at-risk clients.</p>
        <div class="ri-feat-proof">✓ Risk scored on 4 independent factors</div>
      </div>

      <div class="ri-feat-card">
        <div class="ri-feat-icon" style="background:linear-gradient(135deg,rgba(59,130,246,.25),rgba(37,99,235,.25));">✂️</div>
        <div class="ri-feat-label" style="color:#60a5fa;">Rebooking Rate by Stylist</div>
        <div class="ri-feat-subline">The number that changes behavior</div>
        <p class="ri-feat-body">"Ashley rebooks 78% of her colour clients. Jake rebooks 39%." The data is sitting in your system right now. SalonOS surfaces it with 90-day trends so you can coach the gap.</p>
        <div class="ri-feat-proof">✓ With trend vs prior 90-day period</div>
      </div>

      <div class="ri-feat-card">
        <div class="ri-feat-icon" style="background:linear-gradient(135deg,rgba(236,72,153,.25),rgba(190,24,93,.25));">⚡</div>
        <div class="ri-feat-label" style="color:#f472b6;">Smart Cancellation Recovery</div>
        <div class="ri-feat-subline">Turns dead revenue into filled seats</div>
        <p class="ri-feat-body">The moment a cancellation hits, SalonOS scans your waitlist, lapsed clients at-cadence, and clients who've taken the same service — then fires a targeted "slot just opened" text to the top 3.</p>
        <div class="ri-feat-proof">✓ Fully automated — zero manual work</div>
      </div>

      <div class="ri-feat-card">
        <div class="ri-feat-icon" style="background:linear-gradient(135deg,rgba(245,158,11,.25),rgba(180,83,9,.25));">🎯</div>
        <div class="ri-feat-label" style="color:#fbbf24;">LTV + Churn Risk Score</div>
        <div class="ri-feat-subline">Know who you can't afford to lose</div>
        <p class="ri-feat-body">Every client gets a lifetime value and a multi-factor churn risk score. High LTV + rising churn risk is surfaced as a priority — giving you the list of clients worth fighting for.</p>
        <div class="ri-feat-proof">✓ Multi-factor score: cadence, visits, no-shows</div>
      </div>

      <div class="ri-feat-card" style="background:linear-gradient(135deg,rgba(109,40,217,.15),rgba(167,139,250,.08));border-color:rgba(167,139,250,.35);">
        <div class="ri-feat-icon" style="background:linear-gradient(135deg,rgba(167,139,250,.4),rgba(109,40,217,.4));">📈</div>
        <div class="ri-feat-label" style="color:#c4b5fd;">Business Growth Score</div>
        <div class="ri-feat-subline">One number to rule them all</div>
        <p class="ri-feat-body">A 0–100 health score updated daily — composed of retention rate, rebooking rate, seat utilization, avg ticket trend, and new client conversion. When it moves, you know exactly why.</p>
        <div class="ri-feat-proof">✓ 30-day trend history included</div>
      </div>

    </div>
  </div>
</section>

<!-- ── WEEKLY DIGEST ───────────────────────────────────── -->
<section class="ri-section ri-section-light">
  <div class="container">
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:64px;align-items:center;">
      <div>
        <div class="ri-section-label">Weekly Digest Email</div>
        <h2 class="ri-feature-title">Your business report,<br>every Monday at 9am.</h2>
        <p class="ri-feature-body">
          Every Monday morning SalonOS sends you a clear, concise email digest — growth score, retention rate, revenue for the week, who's drifting, who's at risk, and the three most important things to do that day. No logging in required.
        </p>
        <ul class="ri-feature-checks">
          <li>Weekly revenue vs prior week comparison</li>
          <li>Top 3 priority actions with links to act immediately</li>
          <li>Growth Score trend with explanation of what changed</li>
          <li>Drifting clients list with direct win-back link</li>
          <li>Pause or re-enable from inside your dashboard any time</li>
        </ul>
        <a href="/auth?mode=register" class="ri-feature-link">Get your first digest free →</a>
      </div>
      <div class="ri-digest-preview">
        <div class="ri-digest-header">
          <div style="font-size:.65rem;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:rgba(255,255,255,.5);margin-bottom:8px;">Certxa Weekly Intelligence Digest</div>
          <div style="font-family:'Instrument Sans',sans-serif;font-size:1.2rem;font-weight:700;">Glow Studio — Week of Nov 4</div>
          <div style="font-size:.78rem;color:rgba(255,255,255,.65);margin-top:4px;">Monday, 9:00 AM</div>
        </div>
        <div class="ri-digest-body">
          <div class="ri-digest-section">
            <div class="ri-digest-section-title">Business Health</div>
            <div class="ri-digest-metric">
              <div class="ri-digest-metric-label">Growth Score</div>
              <div class="ri-digest-metric-value" style="color:#7c3aed;">74 / 100 <span style="font-size:.75rem;color:#10b981;">↑ +6</span></div>
            </div>
            <div class="ri-digest-metric">
              <div class="ri-digest-metric-label">Client Retention (30d)</div>
              <div class="ri-digest-metric-value" style="color:#059669;">88%</div>
            </div>
            <div class="ri-digest-metric">
              <div class="ri-digest-metric-label">Weekly Revenue</div>
              <div class="ri-digest-metric-value" style="color:#374151;">$3,840 <span style="font-size:.72rem;color:#10b981;">↑ $210 vs last week</span></div>
            </div>
          </div>
          <div class="ri-digest-section">
            <div class="ri-digest-section-title">This Week's Priorities</div>
            <?php foreach ([
              ['🔴','3 high-risk appts today','Review before 10am'],
              ['🟠','5 clients drifting','$2,800 annual at stake'],
              ['🟡','Tue 2pm dead seat','6 clients to target'],
            ] as [$dot,$title,$sub]): ?>
            <div style="display:flex;align-items:flex-start;gap:10px;padding:7px 0;border-bottom:1px solid #f3f4f6;">
              <span style="font-size:.8rem;margin-top:2px;flex-shrink:0;"><?= $dot ?></span>
              <div>
                <div style="font-size:.82rem;font-weight:600;color:#1c1917;"><?= $title ?></div>
                <div style="font-size:.7rem;color:#6b7280;"><?= $sub ?></div>
              </div>
            </div>
            <?php endforeach; ?>
          </div>
          <div style="background:linear-gradient(135deg,#7c3aed,#a855f7);border-radius:10px;padding:12px 16px;text-align:center;margin-top:4px;">
            <div style="font-size:.8rem;font-weight:700;color:#fff;">Open your Intelligence dashboard →</div>
          </div>
        </div>
      </div>
    </div>
  </div>
</section>

<!-- ── PRICE OPTIMIZATION & HEATMAP ──────────────────── -->
<section class="ri-section ri-section-mid">
  <div class="container">
    <div class="text-center" style="margin-bottom:48px;">
      <div class="ri-section-label">Advanced Analytics</div>
      <h2 class="ri-section-title">More tools hidden inside<br>your dashboard.</h2>
      <p class="ri-section-sub" style="margin:0 auto;">Beyond the 8 core engines, Revenue Intelligence includes analytics you won't find anywhere else in salon software.</p>
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:24px;">
      <?php foreach ([
        ['📊','Booking Heatmap','A day-by-week grid showing exactly when your salon is busy and dead — so you know which dead slots to target with campaigns.'],
        ['💰','Price Optimization','Surfaces which services are underpriced for their demand, which have alarming no-show rates (and need deposits), and which are being ignored.'],
        ['🎯','Targeted Campaigns','Segment your clients by churn risk, LTV, or last service — then send one SMS campaign to exactly the right people.'],
        ['🏆','Staff Performance','Full breakdown by stylist: revenue per appointment, rebooking rate, no-show rate, and unique clients served — all with 90-day trends.'],
        ['📅','Revenue Forecast','Projects your revenue for the next 30, 60, and 90 days based on confirmed bookings, historical patterns, and current growth trajectory.'],
        ['📅','Service Performance','Which services generate the most revenue per minute of chair time, which have the worst no-show rates, and which are worth promoting more.'],
      ] as [$icon,$title,$body]): ?>
      <div style="background:#fff;border:1px solid #ede9f7;border-radius:14px;padding:24px;box-shadow:0 4px 20px rgba(59,7,100,.04);">
        <div style="font-size:1.5rem;margin-bottom:12px;"><?= $icon ?></div>
        <div style="font-size:.82rem;font-weight:700;color:#1c1917;margin-bottom:8px;"><?= $title ?></div>
        <div style="font-size:.8rem;color:#6b7280;line-height:1.7;"><?= $body ?></div>
      </div>
      <?php endforeach; ?>
    </div>
  </div>
</section>

<!-- ── COMPARISON TABLE ───────────────────────────────── -->
<section class="ri-section ri-section-light">
  <div class="container">
    <div class="text-center" style="margin-bottom:48px;">
      <div class="ri-section-label">How Certxa Compares</div>
      <h2 class="ri-section-title" style="white-space:nowrap;">No other salon platform does this.</h2>
    </div>
    <div style="max-height:560px;overflow-x:auto;overflow-y:auto;border-radius:16px;border:1px solid #ede9f7;box-shadow:0 8px 40px rgba(59,7,100,.06);">
      <table class="ri-compare">
        <thead>
          <tr style="background:#faf8ff;">
            <th>Feature</th>
            <th style="color:#7c3aed;">Certxa</th>
            <th>GlossGenius</th>
            <th>Vagaro</th>
            <th>Square</th>
          </tr>
        </thead>
        <tbody>
          <?php foreach ([
            ['Client Drift Engine (auto win-back SMS)','✓','✗','✗','✗'],
            ['Churn Risk Scoring per client','✓','✗','✗','✗'],
            ['Revenue Leakage Report','✓','✗','✗','✗'],
            ['Dead Seat Intelligence','✓','✗','✗','✗'],
            ['No-Show Risk Prediction','✓','✗','Partial','✗'],
            ['Rebooking Rate by Stylist','✓','✓','Partial','✗'],
            ['Business Growth Score (0–100)','✓','✗','✗','✗'],
            ['Weekly Intelligence Digest Email','✓','✗','✗','✗'],
            ['Price Optimization Suggestions','✓','✗','✗','✗'],
            ['Targeted Segment Campaigns','✓','✓','✓','Partial'],
            ['Included in base plan (no add-on)','✓','N/A','Partial','N/A'],
          ] as [$feat,$certxa,$gg,$vg,$sq]): ?>
          <tr>
            <td class="feature-col"><?= $feat ?></td>
            <td class="<?= $certxa === '✓' ? 'yes' : 'no' ?>"><?= $certxa ?></td>
            <td class="<?= $gg === '✓' ? 'yes' : 'no' ?>" style="<?= $gg === '✓' ? '' : 'color:#d1d5db' ?>"><?= $gg ?></td>
            <td class="<?= $vg === '✓' ? 'yes' : 'no' ?>" style="<?= $vg !== '✓' ? 'color:#d1d5db' : '' ?>"><?= $vg ?></td>
            <td class="<?= $sq === '✓' ? 'yes' : 'no' ?>" style="<?= $sq !== '✓' ? 'color:#d1d5db' : '' ?>"><?= $sq ?></td>
          </tr>
          <?php endforeach; ?>
        </tbody>
      </table>
    </div>
  </div>
</section>

<!-- ── TESTIMONIALS ───────────────────────────────────── -->
<section class="ri-section ri-section-mid">
  <div class="container">
    <div class="text-center" style="margin-bottom:48px;">
      <div class="ri-section-label">What Salon Owners Say</div>
      <h2 class="ri-section-title">The revenue difference<br>is measurable.</h2>
    </div>
    <div class="ri-testimonials">
      <?php foreach ([
        [
          'MT','Marcus T.','Owner, Crown Barbershop',
          '"The Client Drift Engine alone recovered 11 clients in the first month — clients I thought were just gone. SalonOS texted them at exactly the right moment and they booked. That\'s real money back in my pocket."',
        ],
        [
          'AK','Aaliyah K.','Independent Stylist',
          '"I used to manually check who hadn\'t been in a while and then remember to text them. Now the system does it for me. I wake up to bookings I didn\'t have to chase. The revenue report every Monday is brutal — it shows exactly what you\'re leaving on the table."',
        ],
        [
          'PS','Priya S.','Owner, Glow Nail Studio',
          '"The no-show predictor is eerie — it flags clients I already had a gut feeling about. The automated reminders have cut my no-show rate from 18% to under 6% without me chasing anyone. The dead seat intelligence found patterns in my calendar I never would have spotted myself."',
        ],
      ] as [$init,$name,$role,$quote]): ?>
      <div class="ri-testimonial">
        <div style="display:flex;gap:2px;margin-bottom:14px;">
          <?php for($i=0;$i<5;$i++) echo '<span style="color:#f59e0b;font-size:.9rem;">★</span>'; ?>
        </div>
        <p class="ri-testimonial-quote"><?= $quote ?></p>
        <div class="ri-testimonial-author">
          <div class="ri-testimonial-avatar"><?= $init ?></div>
          <div>
            <div class="ri-testimonial-name"><?= $name ?></div>
            <div class="ri-testimonial-role"><?= $role ?></div>
          </div>
        </div>
      </div>
      <?php endforeach; ?>
    </div>
  </div>
</section>

<!-- ── FAQ ────────────────────────────────────────────── -->
<section class="ri-section ri-section-light">
  <div class="container">
    <div class="text-center" style="margin-bottom:48px;">
      <div class="ri-section-label">FAQ</div>
      <h2 class="ri-section-title">Common questions.</h2>
    </div>
    <div class="ri-faq">
      <?php foreach ([
        ['What is Revenue Intelligence and how is it different from analytics?','Regular analytics shows you what happened in a chart. Revenue Intelligence takes action on that data automatically — it sends the win-back SMS, flags the high-risk appointments, and queues the dead seat campaigns. You don\'t have to log in and do anything. It works while you\'re cutting hair.'],
        ['Does Revenue Intelligence cost extra?','No. Revenue Intelligence is included in Professional and Elite plans at no additional cost. There are no add-ons or per-feature fees — the entire intelligence layer is available from day one on those plans.'],
        ['How does the Client Drift Engine know when to send a win-back SMS?','SalonOS learns each individual client\'s visit cadence from their appointment history. When they go 20% past their personal average without a new booking, the SMS fires. It won\'t send if the client already has an upcoming booking or received a similar message in the last 14 days.'],
        ['What is the Business Growth Score made of?','The Growth Score is a 0–100 composite of five components: client retention rate (weight: 30%), rebooking rate (25%), seat utilization (20%), average ticket trend (15%), and new client conversion (10%). Each component gets its own sub-score and a clear explanation of what moved and why.'],
        ['Will clients feel spammed by the automated messages?','No. Every automated SMS is personalized with the client\'s name and context. Rate limiting ensures no client receives more than one intelligence-triggered message per 14 days. Clients can opt out with a STOP reply at any time, which is respected instantly across the entire platform.'],
        ['How much data does the system need to get started?','Revenue Intelligence starts working with as few as 10 completed appointments. Cadence data becomes more accurate after 3+ visits per client. The Growth Score and Leakage Report are meaningful from the first month of use.'],
        ['Can I see which automated messages were sent?','Yes. Every automated SMS triggered by the intelligence system is logged in your SMS Activity tab with the client name, message content, timestamp, and whether it led to a booking. You have full visibility into every action the system took.'],
      ] as [$q,$a]): ?>
      <div class="ri-faq-item">
        <button class="ri-faq-q" onclick="this.parentElement.classList.toggle('open')">
          <?= $q ?>
          <span class="ri-faq-icon">+</span>
        </button>
        <div class="ri-faq-a"><?= $a ?></div>
      </div>
      <?php endforeach; ?>
    </div>
  </div>
</section>

<!-- ── CTA ────────────────────────────────────────────── -->
<section class="ri-cta">
  <div class="container">
    <div style="display:inline-flex;align-items:center;gap:8px;background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.2);border-radius:50px;padding:5px 16px;margin-bottom:24px;">
      <span style="width:6px;height:6px;border-radius:50%;background:#a78bfa;box-shadow:0 0 8px #a78bfa;display:inline-block;"></span>
      <span style="font-size:.7rem;font-weight:700;color:rgba(255,255,255,.7);letter-spacing:.12em;text-transform:uppercase;">Included in every SalonOS plan</span>
    </div>
    <h2 style="font-family:'Instrument Sans',sans-serif;font-size:clamp(2.2rem,5vw,3.8rem);font-weight:800;letter-spacing:-.04em;color:#fff;line-height:1.1;margin-bottom:20px;">
      See your revenue<br><em style="color:#a78bfa;">co-pilot in action.</em>
    </h2>
    <p style="font-size:clamp(.95rem,1.6vw,1.1rem);color:rgba(255,255,255,.65);max-width:480px;margin:0 auto 36px;line-height:1.75;">
      Start a <?= TRIAL_DAYS ?>-day free trial. Credit card required to subscribe — no charge until your trial ends. Revenue Intelligence is live from your first appointment.
    </p>
    <div style="display:flex;gap:14px;justify-content:center;flex-wrap:wrap;">
      <a href="/auth?mode=register" class="ri-btn-primary" style="background:linear-gradient(135deg,#f59e0b,#e8950f);box-shadow:0 8px 30px rgba(245,158,11,.4);">Start <?= TRIAL_DAYS ?>-Day Free Trial</a>
      <a href="/pricing" class="ri-btn-outline">View Pricing →</a>
    </div>
    <p style="font-size:.75rem;color:rgba(255,255,255,.4);margin-top:20px;">Credit card required · No charge until trial ends · All 8 intelligence engines included · Cancel any time</p>
  </div>
</section>

</main>

<script>
// Simple FAQ accordion
document.querySelectorAll('.ri-faq-q').forEach(btn => {
  btn.addEventListener('click', () => {
    const item = btn.parentElement;
    const wasOpen = item.classList.contains('open');
    document.querySelectorAll('.ri-faq-item').forEach(i => i.classList.remove('open'));
    if (!wasOpen) item.classList.add('open');
  });
});
</script>

<?php require 'includes/footer.php'; ?>
