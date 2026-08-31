<?php
define('BRAND_NAME',    'Certxa');
define('PAGE_TITLE',    'Booth Rental Software | Certxa');
define('PAGE_DESC',     'Booking and management software for nail tech booth renters and chair renters. Manage your own clients, nail records, payments, and appointment workflow with Certxa in an account built for independent nail professionals.');
define('PAGE_KEYWORDS', 'nail salon software booth renters, nail tech chair rental software, independent nail technician app, nail booth renter booking software, nail studio booth rental app, nail tech independent software, chair rental nail salon booking');
define('PAGE_CANONICAL','https://certxa.com/booth-renters');
define('PAGE_BREADCRUMBS', json_encode([
  ['name'=>'Home','url'=>'https://certxa.com/'],
  ['name'=>'Booth Renters','url'=>'https://certxa.com/booth-renters'],
]));
define('PAGE_SCHEMA', json_encode([
  ['@type'=>'FAQPage','mainEntity'=>[
    ['@type'=>'Question','name'=>'Can nail tech booth renters use Certxa independently from the studio owner?','acceptedAnswer'=>['@type'=>'Answer','text'=>'Yes — Certxa gives every nail tech booth renter a completely independent account. Your clients, booking history, nail records, payments, and data are 100% yours. You are never visible inside the studio owner\'s account unless you choose to be.']],
    ['@type'=>'Question','name'=>'Does Certxa work for a solo nail technician renting a booth?','acceptedAnswer'=>['@type'=>'Answer','text'=>'Certxa is designed to work perfectly as a one-person nail studio. You get online booking, a self-service walk-in kiosk, POS, client nail records with product notes, automated reminders, loyalty rewards, and analytics — everything a full nail salon team gets, sized for one.']],
    ['@type'=>'Question','name'=>'How much does Certxa cost for a nail tech booth renter?','acceptedAnswer'=>['@type'=>'Answer','text'=>'Certxa starts at $9/month after a full ' . TRIAL_DAYS . '-day free trial. There are no contracts and no subscription setup fees. Optional add-ons like the Autumn AI receptionist are usage-based and billed separately through your Platform Wallet.']],
  ]],
  // Canonical SoftwareApplication (@id #software) is injected site-wide by includes/header.php.
]));
require 'includes/header.php';
require 'includes/nav.php';
?>

<!-- HERO -->
<section class="hero-dark-section" style="padding:110px 0 80px;">
  <div class="orb orb-1"></div><div class="orb orb-2"></div>
  <div class="container">
    <div class="hero-dark-inner" style="align-items:center;gap:60px;">
      <div class="hero-dark-copy animate-fade-up">
        <div class="hero-stars-row">
          <span class="stars-badge"><span>💅</span><span>Built for Nail Tech Booth Renters</span></span>
        </div>
        <h1 class="hero-dark-headline">
          Your station.<br>Your clients.<br>
          <em>Your business.</em>
        </h1>
        <p class="hero-dark-sub">
          Certxa gives nail tech booth renters everything a full nail studio gets — online booking, walk-in kiosk, POS, client nail records, loyalty rewards, and automated reminders — in one independent account that is 100% yours.
        </p>
        <div class="hero-dark-actions">
          <a href="/auth?mode=register" class="btn btn-gold btn-lg">Start <?= TRIAL_DAYS ?>-Day Free Trial</a>
          <a href="/pricing" class="btn-play-wrap"><span class="btn-play-icon">→</span><span>See pricing</span></a>
        </div>
        <div style="margin-top:24px;font-size:.82rem;color:rgba(255,255,255,.55);">Credit card required · No charge until trial ends · Cancel anytime</div>
      </div>

      <!-- UI mockup -->
      <div class="hero-dark-visual animate-fade-up animate-delay-2">
        <div class="ui-card" style="max-width:320px;width:100%;">
          <div style="font-size:.68rem;font-weight:700;color:var(--mid-grey);text-transform:uppercase;letter-spacing:.1em;margin-bottom:12px;">Your Day — Wednesday</div>
          <?php
          $appts = [
            ['9:00 AM', 'Gel Manicure', 'Keisha M.', '#7c3aed'],
            ['11:00 AM', 'Acrylic Full Set', 'Taylor B.', '#2563eb'],
            ['1:00 PM', 'Pedicure + Gel Polish', 'Monique D.', '#0891b2'],
            ['3:00 PM', 'Nail Art (Chrome)', 'Ava R.', '#7c3aed'],
            ['5:00 PM', 'SNS Fill', 'Priya S.', '#16a34a'],
          ];
          foreach ($appts as $a): ?>
          <div class="ui-row" style="padding:10px 0;border-bottom:1px solid var(--light-grey);">
            <div style="display:flex;align-items:center;gap:10px;">
              <span style="width:3px;height:32px;border-radius:2px;background:<?= $a[3] ?>;flex-shrink:0;"></span>
              <div>
                <div style="font-size:.8rem;font-weight:600;color:var(--charcoal);"><?= $a[2] ?></div>
                <div style="font-size:.72rem;color:var(--mid-grey);"><?= $a[1] ?></div>
              </div>
            </div>
            <span style="font-size:.72rem;font-weight:600;color:var(--mid-grey);"><?= $a[0] ?></span>
          </div>
          <?php endforeach; ?>
          <div style="margin-top:14px;padding:10px 12px;background:rgba(124,58,237,.08);border-radius:8px;display:flex;justify-content:space-between;align-items:center;">
            <span style="font-size:.78rem;font-weight:600;color:#5b21b6;">Today's revenue</span>
            <span style="font-size:1.05rem;font-weight:800;color:#5b21b6;">$742</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</section>

<!-- STATS STRIP -->
<section class="stats-strip">
  <div class="container">
    <div class="stats-grid">
      <div class="stat-item"><div class="stat-value">100%</div><div class="stat-label">Your data, always</div></div>
      <div class="stat-item"><div class="stat-value"><?= TRIAL_DAYS ?></div><div class="stat-label">Day free trial</div></div>
      <div class="stat-item"><div class="stat-value">2.49%</div><div class="stat-label">+ 15¢ payment processing</div></div>
      <div class="stat-item"><div class="stat-value">$0</div><div class="stat-label">Setup fee or contract</div></div>
    </div>
  </div>
</section>

<!-- WHAT BOOTH RENTERS GET -->
<section class="section" style="background:#fff;">
  <div class="container">
    <div class="section-header">
      <span class="tag tag-plum">Built for Independence</span>
      <h2 class="section-title">Everything you need.<br><em>Nothing you don't.</em></h2>
      <p class="section-sub">You're your own boss. Your software should be too. Certxa gives you a fully independent business command center — no shared access with the salon owner, no shared data, no drama.</p>
    </div>

    <div class="features-grid" style="grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:28px;margin-top:48px;">
      <?php
      $features = [
        ['🗓️', 'Your own booking page', 'A personalized link — certxa.com/your-name — clients can book with you directly, 24/7. No front desk required.'],
        ['📱', 'Independent account', 'Your account is 100% yours. Your clients, your payment history, and your data are never shared with the salon owner.'],
        ['💳', 'Integrated POS & card reader', 'Accept cards, Apple Pay, and Google Pay right at your station. Funds deposit to your bank account, not the salon\'s.'],
        ['👥', 'Client nail records & notes', 'Save gel brand, colour codes, nail shape, product notes, and visit history for every client. Never lose a detail between appointments.'],
        ['⭐', 'Loyalty rewards', 'Run your own loyalty program. Reward repeat clients with points, perks, or discounts — totally independent of the salon.'],
        ['🎁', 'Gift cards', 'Sell digital gift cards from your personal booking page. A great revenue stream and marketing tool all in one.'],
        ['📣', 'Automated reminders', 'Reduce no-shows automatically with text and email reminders, sent from your name — not the salon\'s front desk.'],
        ['📊', 'Personal analytics', 'See your revenue, top services, busiest days, and client retention rate in a clean dashboard built just for you.'],
        ['📝', 'Client intake forms', 'Send digital intake forms before new-client appointments. Collect allergies, preferences, and consent — paperless.'],
        ['💬', 'Two-way messaging', 'Message clients directly from Certxa. Confirm appointments, send after-care tips, and ask for reviews — all in one thread.'],
        ['🌐', 'Your own mini website', 'Get a branded profile page with your services, prices, photos, and reviews. Looks like a real website, zero design skills needed.'],
        ['🔔', 'Rebooking reminders', 'Automatically nudge clients to book their next appointment. Keep your calendar full without lifting a finger.'],
      ];
      foreach ($features as $f): ?>
      <div class="feature-card" style="background:#fafafa;border:1px solid #f0f0f2;border-radius:16px;padding:28px;">
        <div style="font-size:1.6rem;margin-bottom:12px;"><?= $f[0] ?></div>
        <h3 style="font-size:1rem;font-weight:700;color:var(--charcoal);margin:0 0 8px;"><?= $f[1] ?></h3>
        <p style="font-size:.875rem;color:var(--mid-grey);line-height:1.6;margin:0;"><?= $f[2] ?></p>
      </div>
      <?php endforeach; ?>
    </div>
  </div>
</section>

<!-- YOUR DATA, YOUR RULES -->
<section class="section" style="background:var(--plum-dark);color:#fff;">
  <div class="container" style="max-width:860px;text-align:center;">
    <span class="tag" style="background:rgba(245,158,11,.15);color:#FCD34D;border-color:rgba(245,158,11,.3);">Data Ownership</span>
    <h2 class="section-title" style="color:#fff;margin-top:16px;">You own everything.<br><em style="color:#F59E0B;">Always.</em></h2>
    <p style="color:rgba(255,255,255,.65);font-size:1rem;line-height:1.7;max-width:580px;margin:0 auto 48px;">
      When you're a booth renter, your client relationships are your most valuable asset. Certxa keeps your data completely private — the salon owner cannot see your clients, your revenue, or your appointments. Ever.
    </p>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:20px;text-align:left;">
      <?php
      $ownership = [
        ['🔒', 'Private client list', 'Only you can see your client records. The salon owner has no access.'],
        ['💰', 'Direct deposits', 'Your card payments go straight to your bank — not pooled with the salon.'],
        ['📤', 'Export anytime', 'Download your client list and data at any time in one click. No exit fees.'],
        ['🚪', 'Take your book with you', 'If you ever move locations, your entire client history moves with you.'],
      ];
      foreach ($ownership as $o): ?>
      <div style="background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.10);border-radius:14px;padding:22px;">
        <div style="font-size:1.4rem;margin-bottom:10px;"><?= $o[0] ?></div>
        <h4 style="font-size:.9rem;font-weight:700;color:#fff;margin:0 0 6px;"><?= $o[1] ?></h4>
        <p style="font-size:.8rem;color:rgba(255,255,255,.55);margin:0;line-height:1.5;"><?= $o[2] ?></p>
      </div>
      <?php endforeach; ?>
    </div>
  </div>
</section>

<!-- HOW IT COMPARES -->
<section class="section" style="background:#fff;">
  <div class="container" style="max-width:740px;">
    <div class="section-header">
      <span class="tag tag-plum">Why Certxa</span>
      <h2 class="section-title">Better than going<br><em>commission-based.</em></h2>
    </div>
    <div style="overflow-x:auto;margin-top:40px;">
      <table style="width:100%;border-collapse:collapse;font-size:.88rem;">
        <thead>
          <tr style="border-bottom:2px solid #f0f0f2;">
            <th style="text-align:left;padding:12px 16px;color:var(--mid-grey);font-weight:600;font-size:.75rem;text-transform:uppercase;letter-spacing:.08em;">Feature</th>
            <th style="text-align:center;padding:12px 16px;color:#5b21b6;font-weight:700;">Certxa</th>
            <th style="text-align:center;padding:12px 16px;color:var(--mid-grey);font-weight:600;">Paper / Cash</th>
          </tr>
        </thead>
        <tbody>
          <?php
          $rows = [
            ['24/7 online booking', true, false],
            ['Automated appointment reminders', true, false],
            ['Client history & color notes', true, false],
            ['Instant card payments', true, false],
            ['Loyalty & rewards program', true, false],
            ['Revenue analytics', true, false],
            ['No-show deposits', true, false],
            ['Gift card sales', true, false],
          ];
          foreach ($rows as $i => $row): ?>
          <tr style="border-bottom:1px solid #f9f9fb;background:<?= $i % 2 === 0 ? '#fff' : '#fafafa' ?>;">
            <td style="padding:12px 16px;color:var(--charcoal);font-weight:500;"><?= $row[0] ?></td>
            <td style="text-align:center;padding:12px 16px;">
              <span style="width:22px;height:22px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;background:<?= $row[1] ? 'rgba(16,185,129,.12)' : 'rgba(239,68,68,.08)' ?>;color:<?= $row[1] ? '#059669' : '#dc2626' ?>;font-size:.85rem;font-weight:700;"><?= $row[1] ? '✓' : '✗' ?></span>
            </td>
            <td style="text-align:center;padding:12px 16px;">
              <span style="width:22px;height:22px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;background:<?= $row[2] ? 'rgba(16,185,129,.12)' : 'rgba(239,68,68,.08)' ?>;color:<?= $row[2] ? '#059669' : '#dc2626' ?>;font-size:.85rem;font-weight:700;"><?= $row[2] ? '✓' : '✗' ?></span>
            </td>
          </tr>
          <?php endforeach; ?>
        </tbody>
      </table>
    </div>
  </div>
</section>

<!-- CTA -->
<section class="section cta-section">
  <div class="container" style="max-width:700px;text-align:center;">
    <span class="tag" style="background:rgba(245,158,11,.15);color:#FCD34D;border-color:rgba(245,158,11,.3);margin-bottom:20px;display:inline-flex;">Free for <?= TRIAL_DAYS ?> days</span>
    <h2 class="section-title" style="color:#fff;">Ready to run your<br><em style="color:#F59E0B;">booth like a business?</em></h2>
    <p style="color:rgba(255,255,255,.65);font-size:1rem;line-height:1.65;margin-bottom:36px;">Certxa helps independent nail technicians fill their books, retain their clients, and get paid on time — every time.</p>
    <a href="/auth?mode=register" class="btn btn-gold btn-lg">Start Free — <?= TRIAL_DAYS ?> Days</a>
    <div style="margin-top:16px;font-size:.82rem;color:rgba(255,255,255,.4);"><?= TRIAL_DAYS ?>-day trial · From $9/mo · Cancel anytime</div>
  </div>
</section>

<?php require 'includes/footer.php'; ?>
