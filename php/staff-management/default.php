<?php
define('BRAND_NAME',    'Certxa');
define('PAGE_TITLE',    'Salon Staff Management Software | Certxa');
define('PAGE_DESC',     'Salon staff management software for schedules, roles and permissions, PIN timeclock, commission tracking, and payroll — all in one hub. Certxa keeps your team organised alongside booking and daily salon operations.');
define('PAGE_KEYWORDS', 'salon staff management software, hair salon management software, spa employee management software, salon employee scheduling software, salon payroll and timekeeping software, salon staff roster app, salon commission tracking software, nail salon staff management');
define('PAGE_CANONICAL', 'https://certxa.com/staff-management');
define('PAGE_BREADCRUMBS', json_encode([
  ['name'=>'Home','url'=>'https://certxa.com/'],
  ['name'=>'Staff Management','url'=>'https://certxa.com/staff-management'],
]));
define('PAGE_SCHEMA', json_encode([
  [
    '@type'       => 'WebPage',
    '@id'         => 'https://certxa.com/staff-management',
    'name'        => 'Salon Staff Management Software — Certxa',
    'description' => 'Schedules, roles and permissions, PIN timeclock, commission tracking, and payroll in one hub built for salons.',
    'url'         => 'https://certxa.com/staff-management',
    'isPartOf'    => ['@id'=>'https://certxa.com/#website'],
    'about'       => ['@id'=>'https://certxa.com/#software'],
  ],
  [
    '@type'      => 'FAQPage',
    'mainEntity' => [
      ['@type'=>'Question','name'=>'What can staff see and do in Certxa?','acceptedAnswer'=>['@type'=>'Answer','text'=>'Each staff member gets their own login with a permission level you set. They can manage their own calendar, clock in and out with a PIN, see their own commission structure and pay period totals, and (for contractors) view their payout history — without seeing anything you have not given them access to.']],
      ['@type'=>'Question','name'=>'Does Certxa track staff hours?','acceptedAnswer'=>['@type'=>'Answer','text'=>'Yes. Staff clock in and out with a personal PIN at a timeclock, and that time feeds directly into payroll runs — no separate time-tracking app or manual timesheet entry required.']],
      ['@type'=>'Question','name'=>'How does commission tracking work?','acceptedAnswer'=>['@type'=>'Answer','text'=>'Each staff member has their own commission structure configured by the owner. As appointments are completed, commission accrues against that structure in real time, and staff can check their own running pay-period total from their own login at any point — not just after a payroll run closes.']],
      ['@type'=>'Question','name'=>'Can I assign specific services to specific staff?','acceptedAnswer'=>['@type'=>'Answer','text'=>'Yes. Every staff member has a list of services they are qualified to perform, which controls what shows up as bookable under their name on the online booking calendar.']],
      ['@type'=>'Question','name'=>'Does Certxa handle contractor payouts?','acceptedAnswer'=>['@type'=>'Answer','text'=>'Yes. Contractors connect their own bank details through Stripe, and payouts move directly to their account. Contractors can also keep their 1099 mailing address up to date themselves from their own profile.']],
      ['@type'=>'Question','name'=>'Where does payroll live in Certxa?','acceptedAnswer'=>['@type'=>'Answer','text'=>'Team, commissions, and payroll runs are consolidated into a single Payroll hub. An owner runs payroll, reviews the calculated totals per staff member, and finalizes the run to produce pay records — including printed paychecks where that is how a staff member is paid.']],
    ],
  ],
]));
require 'includes/header.php';
require 'includes/nav.php';
?>

<style>
@import url('https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@400;500;600;700;800&display=swap');

.sm-page { background: #f8faf9; }

/* ── Hero ───────────────────────────────────────────── */
.sm-hero {
  background: linear-gradient(160deg, #052e1f 0%, #0a4a30 45%, #052018 100%);
  padding: 120px 0 100px;
  text-align: center;
  position: relative;
  overflow: hidden;
}
.sm-hero::before {
  content: '';
  position: absolute;
  top: -200px; left: 50%;
  transform: translateX(-50%);
  width: 800px; height: 800px;
  background: radial-gradient(circle, rgba(16,185,129,.22) 0%, transparent 65%);
  pointer-events: none;
}
.sm-eyebrow {
  display: inline-flex; align-items: center; gap: 8px;
  background: rgba(16,185,129,.12); border: 1px solid rgba(16,185,129,.35);
  border-radius: 50px; padding: 6px 20px; margin-bottom: 28px;
  font-family: 'Instrument Sans', sans-serif;
  font-size: .72rem; font-weight: 700; color: #6ee7b7;
  letter-spacing: .12em; text-transform: uppercase;
}
.sm-headline {
  font-family: 'Instrument Sans', sans-serif;
  font-size: clamp(2.8rem, 6.5vw, 5.5rem);
  font-weight: 800; line-height: 1.06; letter-spacing: -.04em;
  color: #fff; margin-bottom: 24px;
}
.sm-headline em { font-style: normal; color: #34d399; }
.sm-sub {
  font-size: clamp(1rem, 1.8vw, 1.2rem);
  color: rgba(255,255,255,.65); max-width: 620px;
  margin: 0 auto 44px; line-height: 1.75;
}
.sm-hero-btns { display: flex; gap: 14px; justify-content: center; flex-wrap: wrap; margin-bottom: 56px; }
.sm-btn-primary {
  display: inline-block; padding: 14px 32px; border-radius: 50px;
  background: linear-gradient(135deg, #059669, #10b981);
  color: #fff; font-weight: 700; font-size: .95rem; text-decoration: none;
  box-shadow: 0 8px 30px rgba(5,150,105,.4);
  transition: transform .15s, box-shadow .15s;
}
.sm-btn-primary:hover { transform: translateY(-2px); box-shadow: 0 12px 40px rgba(5,150,105,.55); }
.sm-btn-outline {
  display: inline-block; padding: 14px 32px; border-radius: 50px;
  border: 1.5px solid rgba(110,231,183,.5);
  color: #a7f3d0; font-weight: 600; font-size: .95rem; text-decoration: none;
  transition: border-color .15s, background .15s;
}
.sm-btn-outline:hover { border-color: #6ee7b7; background: rgba(110,231,183,.08); }

/* ── Mock dashboard ──────────────────────────────────── */
.sm-mock {
  max-width: 900px; margin: 0 auto;
  background: rgba(255,255,255,.04); border: 1px solid rgba(110,231,183,.2);
  border-radius: 20px; overflow: hidden;
  box-shadow: 0 40px 100px rgba(0,0,0,.5);
}
.sm-mock-bar { background: rgba(0,0,0,.4); padding: 12px 20px; display: flex; align-items: center; gap: 8px; border-bottom: 1px solid rgba(255,255,255,.06); }
.sm-mock-dot { width: 10px; height: 10px; border-radius: 50%; }
.sm-mock-url { flex: 1; margin-left: 8px; background: rgba(255,255,255,.06); border-radius: 6px; padding: 4px 12px; font-size: .72rem; color: #6b7280; text-align: center; }
.sm-mock-body { padding: 24px; }
.sm-mock-row { display: flex; align-items: center; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid rgba(255,255,255,.05); }
.sm-mock-row:last-child { border-bottom: none; }
.sm-mock-name { font-size: .82rem; font-weight: 600; color: #e5e7eb; }
.sm-mock-sub { font-size: .72rem; color: #9ca3af; margin-top: 1px; }
.sm-avatar { width: 34px; height: 34px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: .65rem; font-weight: 700; color: #fff; flex-shrink: 0; }

/* ── Stats row ───────────────────────────────────────── */
.sm-stats-row { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px,1fr)); gap: 20px; padding: 56px 0; }
.sm-stat { text-align: center; }
.sm-stat-num { font-family: 'Instrument Sans', sans-serif; font-size: clamp(2.2rem, 4vw, 3.2rem); font-weight: 800; letter-spacing: -.03em; color: #047857; line-height: 1; margin-bottom: 6px; }
.sm-stat-label { font-size: .82rem; color: #6b7280; line-height: 1.4; }

/* ── Section headers ─────────────────────────────────── */
.sm-section { padding: 80px 0; }
.sm-section-dark { background: linear-gradient(160deg, #052e1f 0%, #0a4a30 60%, #052018 100%); }
.sm-section-light { background: #f8faf9; }
.sm-section-mid { background: #eef7f1; }
.sm-section-label { display: inline-block; background: rgba(5,150,105,.08); border: 1px solid rgba(5,150,105,.18); color: #047857; border-radius: 50px; padding: 4px 16px; font-size: .7rem; font-weight: 700; letter-spacing: .1em; text-transform: uppercase; margin-bottom: 20px; }
.sm-section-label-dark { background: rgba(110,231,183,.12); border: 1px solid rgba(110,231,183,.3); color: #a7f3d0; }
.sm-section-title { font-family: 'Instrument Sans', sans-serif; font-size: clamp(2rem, 4vw, 3.4rem); font-weight: 800; letter-spacing: -.03em; color: #14231c; line-height: 1.12; margin-bottom: 18px; }
.sm-section-title-light { color: #fff; }
.sm-section-sub { font-size: 1.05rem; color: #6b7280; max-width: 560px; line-height: 1.75; margin-bottom: 48px; }
.sm-section-sub-light { color: rgba(255,255,255,.6); }

/* ── Feature deep-dives ──────────────────────────────── */
.sm-feature-spotlight { display: grid; grid-template-columns: 1fr 1fr; gap: 60px; align-items: center; margin-bottom: 80px; }
.sm-feature-spotlight.reversed { direction: rtl; }
.sm-feature-spotlight.reversed > * { direction: ltr; }
@media (max-width: 860px) {
  .sm-feature-spotlight { grid-template-columns: 1fr; }
  .sm-feature-spotlight.reversed { direction: ltr; }
}
.sm-feature-tag { display: inline-flex; align-items: center; gap: 6px; font-size: .7rem; font-weight: 700; letter-spacing: .1em; text-transform: uppercase; margin-bottom: 14px; }
.sm-feature-title { font-family: 'Instrument Sans', sans-serif; font-size: clamp(1.5rem, 2.5vw, 2rem); font-weight: 800; letter-spacing: -.025em; color: #14231c; line-height: 1.2; margin-bottom: 16px; }
.sm-feature-body { font-size: .95rem; color: #4b5563; line-height: 1.8; margin-bottom: 20px; }
.sm-feature-checks { list-style: none; padding: 0; margin: 0 0 24px; display: flex; flex-direction: column; gap: 8px; }
.sm-feature-checks li { font-size: .88rem; color: #374151; display: flex; align-items: flex-start; gap: 8px; }
.sm-feature-checks li::before { content: '✓'; color: #10b981; font-weight: 700; flex-shrink: 0; margin-top: 1px; }

/* ── Mock cards ──────────────────────────────────────── */
.sm-mock-card { background: #fff; border: 1px solid #e3f0e8; border-radius: 16px; padding: 24px; box-shadow: 0 8px 40px rgba(4,80,53,.08); }
.sm-badge { font-size: .65rem; font-weight: 700; padding: 3px 8px; border-radius: 50px; white-space: nowrap; }

/* ── Feature grid ──────────────────────────────────────── */
.sm-features-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 20px; }
.sm-feat-card { background: rgba(255,255,255,.04); border: 1px solid rgba(110,231,183,.18); border-radius: 16px; padding: 24px; transition: .2s; }
.sm-feat-card:hover { border-color: rgba(110,231,183,.45); background: rgba(110,231,183,.06); }
.sm-feat-icon { width: 42px; height: 42px; border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 1.2rem; margin-bottom: 14px; flex-shrink: 0; }
.sm-feat-label { font-size: .65rem; font-weight: 700; letter-spacing: .1em; text-transform: uppercase; margin-bottom: 2px; }
.sm-feat-subline { font-size: .72rem; color: #6b7280; margin-bottom: 12px; }
.sm-feat-body { font-size: .83rem; color: #d1d5db; line-height: 1.65; }

/* ── How it works ────────────────────────────────────── */
.sm-steps { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px,1fr)); gap: 32px; }
.sm-step { text-align: center; }
.sm-step-num { width: 52px; height: 52px; border-radius: 50%; background: linear-gradient(135deg, rgba(5,150,105,.15), rgba(110,231,183,.15)); border: 1px solid rgba(5,150,105,.25); display: flex; align-items: center; justify-content: center; font-family: 'Instrument Sans', sans-serif; font-size: 1.1rem; font-weight: 800; color: #059669; margin: 0 auto 16px; }
.sm-step-title { font-size: .95rem; font-weight: 700; color: #14231c; margin-bottom: 8px; }
.sm-step-body { font-size: .82rem; color: #6b7280; line-height: 1.7; }

/* ── FAQ ─────────────────────────────────────────────── */
.sm-faq { max-width: 720px; margin: 0 auto; }
.sm-faq-item { border-bottom: 1px solid #e5e7eb; }
.sm-faq-item:last-child { border-bottom: none; }
.sm-faq-q { width: 100%; background: none; border: none; cursor: pointer; display: flex; align-items: center; justify-content: space-between; padding: 20px 0; font-size: .95rem; font-weight: 600; color: #14231c; text-align: left; gap: 16px; }
.sm-faq-q:hover { color: #047857; }
.sm-faq-icon { font-size: 1.4rem; color: #9ca3af; flex-shrink: 0; transition: transform .2s; }
.sm-faq-a { font-size: .88rem; color: #4b5563; line-height: 1.8; padding-bottom: 20px; display: none; }
.sm-faq-item.open .sm-faq-a { display: block; }
.sm-faq-item.open .sm-faq-icon { transform: rotate(45deg); color: #047857; }

/* ── CTA ─────────────────────────────────────────────── */
.sm-cta { background: linear-gradient(135deg, #052e1f, #0a4a30); padding: 80px 0; text-align: center; }

.container { max-width: 1120px; margin: 0 auto; padding: 0 24px; }
.text-center { text-align: center; }
@media (max-width: 640px) {
  .sm-hero { padding: 80px 0 64px; }
  .sm-section { padding: 56px 0; }
}
</style>

<div class="sm-page">
<main id="main-content">

<!-- ── HERO ──────────────────────────────────────────── -->
<section class="sm-hero">
  <div class="container" style="position:relative;z-index:1;">
    <div class="sm-eyebrow">
      <span style="width:6px;height:6px;border-radius:50%;background:#34d399;box-shadow:0 0 8px #34d399;display:inline-block;"></span>
      SalonOS · Staff Management
    </div>
    <h1 class="sm-headline">Your whole team,<br><em>one place to run it.</em></h1>
    <p class="sm-sub">
      Schedules, roles and permissions, a PIN timeclock, commission tracking, and payroll — Certxa keeps your staff operations organised alongside booking, so nothing lives in a spreadsheet on the side.
    </p>
    <div class="sm-hero-btns">
      <a href="/auth?mode=register" class="sm-btn-primary">Start Free Trial</a>
      <a href="/salonos" class="sm-btn-outline">Explore SalonOS →</a>
    </div>

    <div class="sm-mock">
      <div class="sm-mock-bar">
        <div class="sm-mock-dot" style="background:#ff5f57;"></div>
        <div class="sm-mock-dot" style="background:#ffbd2e;"></div>
        <div class="sm-mock-dot" style="background:#28c840;"></div>
        <div class="sm-mock-url">app.certxa.com/payroll</div>
      </div>
      <div class="sm-mock-body">
        <div style="font-size:.65rem;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.08em;margin-bottom:14px;">Team · This Pay Period</div>
        <?php foreach ([
          ['LN','Linh Nguyen','Stylist · Employee','$1,240 accrued','#10b981'],
          ['MT','Marcus T.','Barber · Contractor','$980 accrued','#10b981'],
          ['AK','Aaliyah K.','Colourist · Employee','$1,510 accrued','#10b981'],
          ['PS','Priya S.','Nail Tech · Employee','Clocked in — 3h 12m','#f59e0b'],
        ] as [$init,$name,$role,$status,$color]): ?>
        <div class="sm-mock-row">
          <div style="display:flex;align-items:center;gap:10px;">
            <div class="sm-avatar" style="background:linear-gradient(135deg,#059669,#10b981);"><?= $init ?></div>
            <div>
              <div class="sm-mock-name"><?= $name ?></div>
              <div class="sm-mock-sub"><?= $role ?></div>
            </div>
          </div>
          <div style="font-size:.78rem;font-weight:700;color:<?= $color ?>;"><?= $status ?></div>
        </div>
        <?php endforeach; ?>
      </div>
    </div>
  </div>
</section>

<!-- ── STATS ──────────────────────────────────────────── -->
<section class="sm-section sm-section-light" style="padding:40px 0;">
  <div class="container">
    <div class="sm-stats-row">
      <?php foreach ([
        ['1','Payroll hub for team, commissions, and pay runs'],
        ['PIN','Personal timeclock code per staff member'],
        ['0','Spreadsheets needed to track commission'],
      ] as [$num,$label]): ?>
      <div class="sm-stat">
        <div class="sm-stat-num"><?= $num ?></div>
        <div class="sm-stat-label"><?= $label ?></div>
      </div>
      <?php endforeach; ?>
    </div>
  </div>
</section>

<!-- ── HOW IT WORKS ───────────────────────────────────── -->
<section class="sm-section sm-section-mid">
  <div class="container text-center">
    <div class="sm-section-label">How It Works</div>
    <h2 class="sm-section-title">Set up your team once. Run it every week.</h2>
    <p class="sm-section-sub" style="margin:0 auto 56px;">Add each staff member, set their role and commission structure, and Certxa handles the day-to-day tracking automatically.</p>
    <div class="sm-steps">
      <?php foreach ([
        ['1','Add your team','Create a login for each staff member, assign a permission level, and pick which services they perform.'],
        ['2','They clock in and book','Staff clock in with a personal PIN and work from their own calendar — commission accrues as they complete appointments.'],
        ['3','You review, not chase','Check each staff member\'s running pay-period total any time — no end-of-week spreadsheet reconciliation.'],
        ['4','Run payroll','Finalize a payroll run from the Payroll hub and produce pay records, including printed paychecks where needed.'],
      ] as [$num,$title,$body]): ?>
      <div class="sm-step">
        <div class="sm-step-num"><?= $num ?></div>
        <div class="sm-step-title"><?= $title ?></div>
        <div class="sm-step-body"><?= $body ?></div>
      </div>
      <?php endforeach; ?>
    </div>
  </div>
</section>

<!-- ── ROLES & TIMECLOCK (deep dive) ───────────────────── -->
<section class="sm-section sm-section-light">
  <div class="container">
    <div class="sm-feature-spotlight">
      <div>
        <div class="sm-feature-tag" style="color:#059669;">
          <span>🔐</span> Roles, Permissions & Timeclock
        </div>
        <h2 class="sm-feature-title">Every staff member sees exactly<br>what they should — no more, no less.</h2>
        <p class="sm-feature-body">
          Set a permission level for each person on your team, from a limited front-desk view to full owner access. Staff clock in and out with their own PIN, and that time flows straight into payroll — nobody needs a separate timekeeping app.
        </p>
        <ul class="sm-feature-checks">
          <li>Per-staff permission levels, set and changed by the owner</li>
          <li>Personal PIN or access code per staff member</li>
          <li>PIN-based clock in / clock out feeds payroll directly</li>
          <li>Services assigned per staff member control what's bookable under their name</li>
          <li>Staff manage their own profile photo, name, and contact details</li>
        </ul>
      </div>
      <div>
        <div class="sm-mock-card">
          <div style="font-size:.65rem;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:.08em;margin-bottom:14px;">Timeclock — Today</div>
          <?php foreach ([
            ['LN','Linh Nguyen','Clocked in 9:02 AM','Active','#059669'],
            ['MT','Marcus T.','Clocked in 10:15 AM','Active','#059669'],
            ['AK','Aaliyah K.','Clocked out 1:40 PM','Done for today','#9ca3af'],
          ] as [$init,$name,$time,$status,$color]): ?>
          <div class="sm-mock-row" style="border-bottom:1px solid #f3f4f6;">
            <div style="display:flex;align-items:center;gap:10px;">
              <div class="sm-avatar" style="background:linear-gradient(135deg,#059669,#10b981);"><?= $init ?></div>
              <div>
                <div style="font-size:.82rem;font-weight:600;color:#14231c;"><?= $name ?></div>
                <div style="font-size:.72rem;color:#9ca3af;"><?= $time ?></div>
              </div>
            </div>
            <span class="sm-badge" style="background:<?= $color ?>18;color:<?= $color ?>;"><?= $status ?></span>
          </div>
          <?php endforeach; ?>
        </div>
      </div>
    </div>
  </div>
</section>

<!-- ── COMMISSION & PAY (deep dive) ───────────────────── -->
<section class="sm-section sm-section-mid">
  <div class="container">
    <div class="sm-feature-spotlight reversed">
      <div>
        <div class="sm-feature-tag" style="color:#d97706;">
          <span>💰</span> Commission Tracking
        </div>
        <h2 class="sm-feature-title">Staff see their own numbers,<br>in real time.</h2>
        <p class="sm-feature-body">
          Set a commission structure for each staff member, and Certxa accrues it automatically as they complete appointments. Staff log in and see their own running pay-period total and income history — no more asking the owner "how much have I made this week?"
        </p>
        <ul class="sm-feature-checks">
          <li>Commission structure configured per staff member</li>
          <li>Commission accrues automatically on completed appointments</li>
          <li>Staff self-service pay period totals and income history</li>
          <li>Continuous accrual shown throughout the pay period, not just at close-out</li>
          <li>Full daily breakdown, not just a lump-sum total</li>
        </ul>
      </div>
      <div>
        <div class="sm-mock-card">
          <div style="font-size:.65rem;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:.08em;margin-bottom:14px;">My Pay — Current Period</div>
          <div style="background:rgba(5,150,105,.06);border:1px solid rgba(5,150,105,.18);border-radius:10px;padding:14px 16px;margin-bottom:14px;display:flex;justify-content:space-between;align-items:center;">
            <div>
              <div style="font-size:.72rem;color:#6b7280;">Accrued so far</div>
              <div style="font-size:1.3rem;font-weight:800;color:#047857;">$1,240.00</div>
            </div>
            <span class="sm-badge" style="background:#05966918;color:#059669;">In progress</span>
          </div>
          <?php foreach ([
            ['Mon','Gel manicure ×4, Balayage ×1','$210'],
            ['Tue','Cut & style ×6','$185'],
            ['Wed','Colour ×3, Nails ×2','$260'],
          ] as [$day,$detail,$amt]): ?>
          <div class="sm-mock-row" style="border-bottom:1px solid #f3f4f6;">
            <div>
              <div style="font-size:.8rem;font-weight:600;color:#14231c;"><?= $day ?></div>
              <div style="font-size:.7rem;color:#9ca3af;"><?= $detail ?></div>
            </div>
            <div style="font-size:.85rem;font-weight:700;color:#374151;"><?= $amt ?></div>
          </div>
          <?php endforeach; ?>
        </div>
      </div>
    </div>
  </div>
</section>

<!-- ── PAYROLL & PAYOUTS (deep dive) ───────────────────── -->
<section class="sm-section sm-section-light">
  <div class="container">
    <div class="sm-feature-spotlight">
      <div>
        <div class="sm-feature-tag" style="color:#7c3aed;">
          <span>🧾</span> Payroll & Contractor Payouts
        </div>
        <h2 class="sm-feature-title">One hub for the whole<br>payroll cycle.</h2>
        <p class="sm-feature-body">
          Team, commissions, and payroll live together in a single Payroll hub. Run payroll, review calculated totals per staff member, and finalize the run to produce pay records — including printed paychecks where that's how someone gets paid. Contractors connect their own bank account and get paid out directly.
        </p>
        <ul class="sm-feature-checks">
          <li>Team, commissions, and payroll consolidated in one hub</li>
          <li>Owner reviews and finalizes each payroll run before it's locked</li>
          <li>Printed paychecks supported for staff paid that way</li>
          <li>Contractor payouts move to their own connected bank account</li>
          <li>Contractors manage their own 1099 mailing address</li>
        </ul>
      </div>
      <div>
        <div class="sm-mock-card">
          <div style="font-size:.65rem;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:.08em;margin-bottom:14px;">Payroll Run — Ready to Finalize</div>
          <?php foreach ([
            ['Linh Nguyen','Employee','$1,240.00'],
            ['Marcus T.','Contractor','$980.00'],
            ['Aaliyah K.','Employee','$1,510.00'],
          ] as [$name,$type,$amt]): ?>
          <div class="sm-mock-row" style="border-bottom:1px solid #f3f4f6;">
            <div>
              <div style="font-size:.8rem;font-weight:600;color:#14231c;"><?= $name ?></div>
              <div style="font-size:.7rem;color:#9ca3af;"><?= $type ?></div>
            </div>
            <div style="font-size:.85rem;font-weight:700;color:#374151;"><?= $amt ?></div>
          </div>
          <?php endforeach; ?>
          <div style="margin-top:12px;background:rgba(124,58,237,.06);border:1px solid rgba(124,58,237,.15);border-radius:10px;padding:12px 14px;display:flex;justify-content:space-between;align-items:center;">
            <div style="font-size:.78rem;font-weight:700;color:#374151;">Total this run</div>
            <div style="font-size:1rem;font-weight:800;color:#6d28d9;">$3,730.00</div>
          </div>
        </div>
      </div>
    </div>
  </div>
</section>

<!-- ── FEATURES GRID ────────────────────────────────────── -->
<section class="sm-section sm-section-dark">
  <div class="container">
    <div class="text-center" style="margin-bottom:56px;">
      <div class="sm-section-label sm-section-label-dark">Everything For Your Team</div>
      <h2 class="sm-section-title sm-section-title-light">Staff tools, built into<br><em style="color:#34d399;">the same system.</em></h2>
      <p class="sm-section-sub sm-section-sub-light" style="margin:0 auto;">No separate scheduling app, timeclock app, or payroll spreadsheet — it's all one system.</p>
    </div>
    <div class="sm-features-grid">
      <div class="sm-feat-card">
        <div class="sm-feat-icon" style="background:linear-gradient(135deg,rgba(110,231,183,.3),rgba(5,150,105,.3));">👤</div>
        <div class="sm-feat-label" style="color:#6ee7b7;">Staff Profiles</div>
        <div class="sm-feat-subline">One place per person</div>
        <p class="sm-feat-body">Name, contact details, avatar, and assigned services — each staff member manages their own profile from their own login.</p>
      </div>
      <div class="sm-feat-card">
        <div class="sm-feat-icon" style="background:linear-gradient(135deg,rgba(251,191,36,.25),rgba(180,83,9,.25));">🔑</div>
        <div class="sm-feat-label" style="color:#fbbf24;">Roles & Permissions</div>
        <div class="sm-feat-subline">Owner controls access</div>
        <p class="sm-feat-body">Set a permission level per staff member so front desk, stylists, and managers each see exactly what they need.</p>
      </div>
      <div class="sm-feat-card">
        <div class="sm-feat-icon" style="background:linear-gradient(135deg,rgba(16,185,129,.25),rgba(5,150,105,.25));">⏱️</div>
        <div class="sm-feat-label" style="color:#34d399;">PIN Timeclock</div>
        <div class="sm-feat-subline">No separate app</div>
        <p class="sm-feat-body">Clock in and out with a personal PIN. Hours worked flow directly into payroll — nothing to re-enter.</p>
      </div>
      <div class="sm-feat-card">
        <div class="sm-feat-icon" style="background:linear-gradient(135deg,rgba(245,158,11,.25),rgba(180,83,9,.25));">💵</div>
        <div class="sm-feat-label" style="color:#fbbf24;">Commission Structures</div>
        <div class="sm-feat-subline">Configured per staff member</div>
        <p class="sm-feat-body">Set each person's commission structure once. It accrues automatically as they complete appointments.</p>
      </div>
      <div class="sm-feat-card">
        <div class="sm-feat-icon" style="background:linear-gradient(135deg,rgba(59,130,246,.25),rgba(37,99,235,.25));">📊</div>
        <div class="sm-feat-label" style="color:#60a5fa;">Self-Service Pay</div>
        <div class="sm-feat-subline">Staff check their own numbers</div>
        <p class="sm-feat-body">Every staff member can view their own pay period total, daily breakdown, and income history any time.</p>
      </div>
      <div class="sm-feat-card">
        <div class="sm-feat-icon" style="background:linear-gradient(135deg,rgba(124,58,237,.3),rgba(167,139,250,.3));">🧾</div>
        <div class="sm-feat-label" style="color:#c4b5fd;">Payroll Runs</div>
        <div class="sm-feat-subline">Review, then finalize</div>
        <p class="sm-feat-body">Run payroll from the Payroll hub, review the totals, and finalize to produce pay records — printed paychecks included.</p>
      </div>
      <div class="sm-feat-card">
        <div class="sm-feat-icon" style="background:linear-gradient(135deg,rgba(236,72,153,.25),rgba(190,24,93,.25));">🏦</div>
        <div class="sm-feat-label" style="color:#f472b6;">Contractor Payouts</div>
        <div class="sm-feat-subline">Direct to their own account</div>
        <p class="sm-feat-body">Contractors connect their own bank details and get paid out directly, with their own payout dashboard.</p>
      </div>
      <div class="sm-feat-card">
        <div class="sm-feat-icon" style="background:linear-gradient(135deg,rgba(239,68,68,.25),rgba(185,28,28,.25));">📄</div>
        <div class="sm-feat-label" style="color:#f87171;">1099 Tax Info</div>
        <div class="sm-feat-subline">Kept current by the contractor</div>
        <p class="sm-feat-body">Contractors keep their own mailing address on file, so 1099 paperwork is never chasing outdated information.</p>
      </div>
    </div>
  </div>
</section>

<!-- ── FAQ ────────────────────────────────────────────── -->
<section class="sm-section sm-section-light">
  <div class="container">
    <div class="text-center" style="margin-bottom:48px;">
      <div class="sm-section-label">FAQ</div>
      <h2 class="sm-section-title">Common questions.</h2>
    </div>
    <div class="sm-faq">
      <?php foreach ([
        ['What can staff see and do in Certxa?','Each staff member gets their own login with a permission level you set. They can manage their own calendar, clock in and out with a PIN, see their own commission structure and pay period totals, and — for contractors — view their payout history, all without seeing anything you have not given them access to.'],
        ['Does Certxa track staff hours?','Yes. Staff clock in and out with a personal PIN at a timeclock, and that time feeds directly into payroll runs — no separate time-tracking app or manual timesheet entry required.'],
        ['How does commission tracking work?','Each staff member has their own commission structure configured by the owner. As appointments are completed, commission accrues against that structure in real time, and staff can check their own running pay-period total from their own login at any point — not just after a payroll run closes.'],
        ['Can I assign specific services to specific staff?','Yes. Every staff member has a list of services they are qualified to perform, which controls what shows up as bookable under their name on the online booking calendar.'],
        ['Does Certxa handle contractor payouts?','Yes. Contractors connect their own bank details through Stripe, and payouts move directly to their account. Contractors can also keep their 1099 mailing address up to date themselves from their own profile.'],
        ['Where does payroll live in Certxa?','Team, commissions, and payroll runs are consolidated into a single Payroll hub. An owner runs payroll, reviews the calculated totals per staff member, and finalizes the run to produce pay records — including printed paychecks where that is how a staff member is paid.'],
      ] as [$q,$a]): ?>
      <div class="sm-faq-item">
        <button class="sm-faq-q" onclick="this.parentElement.classList.toggle('open')">
          <?= $q ?>
          <span class="sm-faq-icon">+</span>
        </button>
        <div class="sm-faq-a"><?= $a ?></div>
      </div>
      <?php endforeach; ?>
    </div>
  </div>
</section>

<!-- ── CTA ────────────────────────────────────────────── -->
<section class="sm-cta">
  <div class="container">
    <div style="display:inline-flex;align-items:center;gap:8px;background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.2);border-radius:50px;padding:5px 16px;margin-bottom:24px;">
      <span style="width:6px;height:6px;border-radius:50%;background:#34d399;box-shadow:0 0 8px #34d399;display:inline-block;"></span>
      <span style="font-size:.7rem;font-weight:700;color:rgba(255,255,255,.7);letter-spacing:.12em;text-transform:uppercase;">Included in every SalonOS plan</span>
    </div>
    <h2 style="font-family:'Instrument Sans',sans-serif;font-size:clamp(2.2rem,5vw,3.8rem);font-weight:800;letter-spacing:-.04em;color:#fff;line-height:1.1;margin-bottom:20px;">
      Run your team without<br><em style="color:#34d399;">the spreadsheet.</em>
    </h2>
    <p style="font-size:clamp(.95rem,1.6vw,1.1rem);color:rgba(255,255,255,.65);max-width:480px;margin:0 auto 36px;line-height:1.75;">
      Start a <?= TRIAL_DAYS ?>-day free trial. Credit card required to subscribe — no charge until your trial ends.
    </p>
    <div style="display:flex;gap:14px;justify-content:center;flex-wrap:wrap;">
      <a href="/auth?mode=register" class="sm-btn-primary">Start <?= TRIAL_DAYS ?>-Day Free Trial</a>
      <a href="/pricing" class="sm-btn-outline">View Pricing →</a>
    </div>
    <p style="font-size:.75rem;color:rgba(255,255,255,.4);margin-top:20px;">Credit card required · No charge until trial ends · Cancel any time</p>
  </div>
</section>

</main>

<script>
document.querySelectorAll('.sm-faq-q').forEach(btn => {
  btn.addEventListener('click', () => {
    const item = btn.parentElement;
    const wasOpen = item.classList.contains('open');
    document.querySelectorAll('.sm-faq-item').forEach(i => i.classList.remove('open'));
    if (!wasOpen) item.classList.add('open');
  });
});
</script>

<?php require 'includes/footer.php'; ?>
