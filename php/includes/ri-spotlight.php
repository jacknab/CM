<?php
/**
 * Revenue Intelligence Spotlight — comparison page insert
 *
 * Expected variables set by the including page:
 *   $competitor_name  — e.g. "Vagaro" or "GlossGenius"
 *   $competitor_slug  — e.g. "vagaro" or "glossgenius"  (used in ids)
 */
$competitor_name = $competitor_name ?? 'the competition';
?>

<!-- ═══════════════════════════════════════════════════════════════
     REVENUE INTELLIGENCE SPOTLIGHT
     ═══════════════════════════════════════════════════════════════ -->
<section class="ri-spotlight-section" id="revenue-intelligence">
  <div class="ri-spotlight-orb ri-spotlight-orb-1"></div>
  <div class="ri-spotlight-orb ri-spotlight-orb-2"></div>

  <div class="container" style="max-width:960px;position:relative;z-index:1;">

    <!-- eyebrow + headline -->
    <div style="text-align:center;margin-bottom:52px;">
      <span class="ri-spotlight-eyebrow">🧠 Only on Certxa</span>
      <h2 class="ri-spotlight-headline">
        Revenue Intelligence<br>
        <em><?= htmlspecialchars($competitor_name) ?> doesn't have anything like this.</em>
      </h2>
      <p class="ri-spotlight-sub">
        While <?= htmlspecialchars($competitor_name) ?> shows you a calendar and a client list,
        Certxa's Revenue Intelligence engine works in the background 24/7 —
        detecting leaks, predicting problems, and recovering revenue automatically.
        No add-ons. Included in every plan.
      </p>
    </div>

    <!-- 6 capability cards -->
    <div class="ri-spotlight-grid">

      <div class="ri-spotlight-card">
        <div class="ri-spotlight-card-icon">📉</div>
        <h3 class="ri-spotlight-card-title">Client Drift Engine</h3>
        <p class="ri-spotlight-card-body">Learns every client's visit cadence. When someone goes 20% overdue without rebooking, a personalised win-back SMS fires automatically.</p>
        <span class="ri-spotlight-card-stat">Recovers 10–15% of quietly drifting clients</span>
      </div>

      <div class="ri-spotlight-card">
        <div class="ri-spotlight-card-icon">🎯</div>
        <h3 class="ri-spotlight-card-title">No-Show Risk Scoring</h3>
        <p class="ri-spotlight-card-body">Every upcoming appointment is scored for no-show risk using booking lead time, client history, and day-of-week patterns. High-risk slots are surfaced each morning.</p>
        <span class="ri-spotlight-card-stat">Cut no-shows before they happen</span>
      </div>

      <div class="ri-spotlight-card">
        <div class="ri-spotlight-card-icon">💸</div>
        <h3 class="ri-spotlight-card-title">Revenue Leakage Report</h3>
        <p class="ri-spotlight-card-body">Monthly report of lapsed clients, the exact revenue they represented, and a ranked list of who to contact first to recover it.</p>
        <span class="ri-spotlight-card-stat">See money left on the table, in dollars</span>
      </div>

      <div class="ri-spotlight-card">
        <div class="ri-spotlight-card-icon">🪑</div>
        <h3 class="ri-spotlight-card-title">Dead Seat Detector</h3>
        <p class="ri-spotlight-card-body">Identifies your chronically underbooked day and hour slots, estimates the lost revenue potential, and surfaces the best candidates to fill them.</p>
        <span class="ri-spotlight-card-stat">Turn empty chairs into booked revenue</span>
      </div>

      <div class="ri-spotlight-card">
        <div class="ri-spotlight-card-icon">📊</div>
        <h3 class="ri-spotlight-card-title">Business Growth Score</h3>
        <p class="ri-spotlight-card-body">A single 0–100 score measuring your salon's health across retention, rebooking rate, seat utilisation, ticket trend, and new client conversion. Updates daily.</p>
        <span class="ri-spotlight-card-stat">One number that tells the whole story</span>
      </div>

      <div class="ri-spotlight-card">
        <div class="ri-spotlight-card-icon">🔁</div>
        <h3 class="ri-spotlight-card-title">Cancellation Recovery</h3>
        <p class="ri-spotlight-card-body">The moment a slot cancels, the system finds the top 3 clients from your waitlist and lapsed regulars who've had that service — and sends them an offer to fill it.</p>
        <span class="ri-spotlight-card-stat">Slots fill themselves</span>
      </div>

    </div>

    <!-- head-to-head RI comparison strip -->
    <div class="ri-spotlight-vs">
      <div class="ri-spotlight-vs-header">
        <div class="ri-spotlight-vs-col ri-spotlight-vs-col-feature">Intelligence feature</div>
        <div class="ri-spotlight-vs-col ri-spotlight-vs-col-certxa">Certxa</div>
        <div class="ri-spotlight-vs-col ri-spotlight-vs-col-competitor"><?= htmlspecialchars($competitor_name) ?></div>
      </div>
      <?php
      $ri_rows = [
        ['Client drift detection & auto win-back SMS'],
        ['No-show risk scoring per appointment'],
        ['Revenue leakage dollar report'],
        ['Dead seat pattern detection'],
        ['Business Growth Score (0–100)'],
        ['Cancellation recovery auto-fill'],
        ['Staff rebooking rate tracking'],
        ['LTV &amp; churn risk per client'],
      ];
      foreach ($ri_rows as $i => $row): ?>
      <div class="ri-spotlight-vs-row" style="background:<?= $i % 2 === 0 ? 'rgba(255,255,255,.03)' : 'transparent' ?>;">
        <div class="ri-spotlight-vs-col ri-spotlight-vs-col-feature"><?= $row[0] ?></div>
        <div class="ri-spotlight-vs-col ri-spotlight-vs-col-certxa ri-check">✓ Included</div>
        <div class="ri-spotlight-vs-col ri-spotlight-vs-col-competitor ri-cross">✗ Not available</div>
      </div>
      <?php endforeach; ?>
    </div>

    <!-- CTA row -->
    <div style="text-align:center;margin-top:44px;">
      <a href="/revenue-intelligence" class="ri-spotlight-link-btn">See how Revenue Intelligence works →</a>
      <p style="font-size:.75rem;color:rgba(255,255,255,.35);margin-top:14px;">Included in every SalonOS plan &middot; No setup &middot; No add-on fees</p>
    </div>

  </div>
</section>

<style>
/* ── Revenue Intelligence Spotlight ───────────────────────────── */
.ri-spotlight-section {
  position: relative;
  overflow: hidden;
  background: linear-gradient(160deg, #0d0017 0%, #180030 50%, #0d001f 100%);
  padding: 96px 0 80px;
}
.ri-spotlight-orb {
  position: absolute;
  border-radius: 50%;
  pointer-events: none;
}
.ri-spotlight-orb-1 {
  top: -180px; left: 50%;
  transform: translateX(-50%);
  width: 700px; height: 700px;
  background: radial-gradient(circle, rgba(109,40,217,.22) 0%, transparent 65%);
}
.ri-spotlight-orb-2 {
  bottom: -120px; right: -80px;
  width: 440px; height: 440px;
  background: radial-gradient(circle, rgba(245,158,11,.10) 0%, transparent 65%);
}

/* eyebrow */
.ri-spotlight-eyebrow {
  display: inline-flex; align-items: center; gap: 8px;
  background: rgba(167,139,250,.12);
  border: 1px solid rgba(167,139,250,.32);
  border-radius: 50px; padding: 6px 18px;
  font-size: .7rem; font-weight: 700; color: #c4b5fd;
  letter-spacing: .12em; text-transform: uppercase;
  margin-bottom: 22px;
}

/* headline */
.ri-spotlight-headline {
  font-family: 'Cormorant Garamond', serif;
  font-size: clamp(2.2rem, 5vw, 3.6rem);
  font-weight: 700; line-height: 1.1;
  color: #fff; margin-bottom: 18px; letter-spacing: -.01em;
}
.ri-spotlight-headline em {
  font-style: italic;
  color: #a78bfa;
}

/* subheading */
.ri-spotlight-sub {
  font-size: clamp(.9rem, 1.5vw, 1.05rem);
  color: rgba(255,255,255,.55);
  max-width: 620px; margin: 0 auto;
  line-height: 1.75;
}

/* 6-card grid */
.ri-spotlight-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 20px;
  margin-bottom: 48px;
}
@media (max-width: 800px) {
  .ri-spotlight-grid { grid-template-columns: repeat(2, 1fr); }
}
@media (max-width: 520px) {
  .ri-spotlight-grid { grid-template-columns: 1fr; }
}

.ri-spotlight-card {
  background: rgba(255,255,255,.04);
  border: 1px solid rgba(167,139,250,.18);
  border-radius: 16px;
  padding: 28px 24px;
  transition: border-color .2s, background .2s;
}
.ri-spotlight-card:hover {
  border-color: rgba(167,139,250,.42);
  background: rgba(167,139,250,.07);
}
.ri-spotlight-card-icon {
  font-size: 1.6rem;
  margin-bottom: 12px;
  line-height: 1;
}
.ri-spotlight-card-title {
  font-family: 'Inter', sans-serif;
  font-size: .92rem; font-weight: 700;
  color: #e9d5ff; margin-bottom: 8px; line-height: 1.3;
}
.ri-spotlight-card-body {
  font-size: .82rem; color: rgba(255,255,255,.5);
  line-height: 1.65; margin-bottom: 14px;
}
.ri-spotlight-card-stat {
  display: inline-block;
  font-size: .7rem; font-weight: 700;
  color: #a78bfa;
  background: rgba(167,139,250,.12);
  border: 1px solid rgba(167,139,250,.2);
  border-radius: 50px; padding: 3px 12px;
  letter-spacing: .02em;
}

/* head-to-head table */
.ri-spotlight-vs {
  border: 1px solid rgba(167,139,250,.2);
  border-radius: 16px;
  overflow: hidden;
}
.ri-spotlight-vs-header {
  display: grid;
  grid-template-columns: 1fr 160px 160px;
  background: rgba(109,40,217,.35);
  padding: 13px 20px;
  font-size: .75rem; font-weight: 700;
  color: #e9d5ff; letter-spacing: .04em;
}
.ri-spotlight-vs-row {
  display: grid;
  grid-template-columns: 1fr 160px 160px;
  padding: 13px 20px;
  border-top: 1px solid rgba(167,139,250,.1);
  font-size: .83rem; align-items: center;
}
.ri-spotlight-vs-col-feature { color: rgba(255,255,255,.75); font-weight: 500; }
.ri-spotlight-vs-col-certxa  { text-align: center; }
.ri-spotlight-vs-col-competitor { text-align: center; }

.ri-check { color: #86efac; font-weight: 700; font-size: .8rem; }
.ri-cross  { color: rgba(255,255,255,.28); font-size: .8rem; }

@media (max-width: 600px) {
  .ri-spotlight-vs-header,
  .ri-spotlight-vs-row {
    grid-template-columns: 1fr 90px 90px;
    font-size: .75rem;
    padding: 12px 14px;
  }
}

/* link button */
.ri-spotlight-link-btn {
  display: inline-block;
  padding: 14px 34px;
  border-radius: 50px;
  background: linear-gradient(135deg, #7c3aed, #a855f7);
  color: #fff; font-weight: 700; font-size: .92rem;
  text-decoration: none;
  box-shadow: 0 8px 30px rgba(124,58,237,.4);
  transition: transform .15s, box-shadow .15s;
}
.ri-spotlight-link-btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 12px 40px rgba(124,58,237,.55);
}
</style>
