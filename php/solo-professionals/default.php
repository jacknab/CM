<?php
define('BRAND_NAME',    'Certxa');
define('PAGE_TITLE',    'Nail Salon Software for Solo Nail Technicians | Run Your Nail Business Solo — Certxa');
define('PAGE_DESC',     'Certxa is the best software for solo nail technicians — manage bookings, walk-ins, client nail records, loyalty rewards, and a self-service check-in kiosk all from one app. Free ' . TRIAL_DAYS . '-day trial, no contracts.');
define('PAGE_KEYWORDS', 'solo nail technician software, independent nail tech software, one person nail salon software, nail tech booking app, solo nail salon app, freelance nail technician software, nail tech scheduling software, solo nail studio software');
define('PAGE_CANONICAL','https://certxa.com/solo-professionals');
define('PAGE_BREADCRUMBS', json_encode([
  ['name'=>'Home','url'=>'https://certxa.com/'],
  ['name'=>'Solo Professionals','url'=>'https://certxa.com/solo-professionals'],
]));
define('PAGE_SCHEMA', json_encode([
  ['@type'=>'FAQPage','mainEntity'=>[
    ['@type'=>'Question','name'=>'Is Certxa good for a solo nail technician?','acceptedAnswer'=>['@type'=>'Answer','text'=>'Certxa is designed to be your virtual front desk, bookkeeper, and marketing team all in one. Solo nail techs get the same full feature set as larger studios — online booking, POS, client nail records, automated reminders, loyalty rewards, and a self-service walk-in kiosk — without paying for unused staff seats.']],
    ['@type'=>'Question','name'=>'Can a solo nail tech use the walk-in kiosk feature?','acceptedAnswer'=>['@type'=>'Answer','text'=>'Yes — Certxa\'s self-service walk-in kiosk lets clients check themselves in without you interrupting a service. The kiosk adds them to your waitlist, captures their name and service preference, and notifies you instantly. Perfect for solo operators who can\'t always stop to greet the door.']],
    ['@type'=>'Question','name'=>'How does Certxa replace a front desk for a solo nail tech?','acceptedAnswer'=>['@type'=>'Answer','text'=>'Certxa automates every task a front desk would handle: 24/7 online booking, appointment confirmations, reminders, client nail records, checkout and payment processing, and follow-up messages — plus a self-service kiosk for walk-in clients — all without you lifting a finger.']],
  ]],
  ['@type'=>'SoftwareApplication','name'=>'Certxa for Solo Professionals','applicationCategory'=>'BusinessApplication','operatingSystem'=>'Web, iOS, Android','offers'=>['@type'=>'Offer','price'=>'0','priceCurrency'=>'USD','description'=>TRIAL_DAYS . '-day free trial, then from $9/month']],
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
          <span class="stars-badge"><span>💅</span><span>Built for Solo Nail Technicians</span></span>
        </div>
        <h1 class="hero-dark-headline">
          You are the<br>front desk, the nail tech,<br>
          <em>and the boss.</em>
        </h1>
        <p class="hero-dark-sub">
          Certxa is the all-in-one nail salon app that handles your bookings, walk-in kiosk, client nail records, payments, and marketing — so you can focus on doing the work you love.
        </p>
        <div class="hero-dark-actions">
          <a href="/auth?mode=register" class="btn btn-gold btn-lg">Start <?= TRIAL_DAYS ?>-Day Free Trial</a>
          <a href="/pricing" class="btn-play-wrap"><span class="btn-play-icon">→</span><span>See pricing</span></a>
        </div>
        <div style="margin-top:24px;font-size:.82rem;color:rgba(255,255,255,.55);">Trusted by 10,000+ solo nail technicians · Credit card required · No charge until trial ends</div>
      </div>

      <!-- UI mockup -->
      <div class="hero-dark-visual animate-fade-up animate-delay-2">
        <div class="ui-card" style="max-width:310px;width:100%;">
          <div style="font-size:.68rem;font-weight:700;color:var(--mid-grey);text-transform:uppercase;letter-spacing:.1em;margin-bottom:14px;">This week's snapshot</div>
          <?php
          $stats = [
            ['Appointments', '24', '#5b21b6'],
            ['New clients', '6', '#2563eb'],
            ['Revenue', '$1,840', '#059669'],
            ['No-shows', '0', '#dc2626'],
            ['Rebookings', '18', '#5b21b6'],
          ];
          foreach ($stats as $s): ?>
          <div class="ui-row" style="padding:9px 0;border-bottom:1px solid var(--light-grey);">
            <span style="font-size:.82rem;color:var(--mid-grey);"><?= $s[0] ?></span>
            <span style="font-size:.95rem;font-weight:800;color:<?= $s[2] ?>;"><?= $s[1] ?></span>
          </div>
          <?php endforeach; ?>
          <div style="margin-top:14px;padding:10px 0 0;">
            <div style="font-size:.72rem;color:var(--mid-grey);margin-bottom:6px;">Next appointment</div>
            <div style="background:rgba(91,33,182,.07);border-radius:8px;padding:10px 12px;">
              <div style="font-size:.88rem;font-weight:700;color:var(--charcoal);">Keisha M. — Gel Manicure</div>
              <div style="font-size:.75rem;color:var(--mid-grey);margin-top:2px;">Tomorrow at 10:00 AM · Confirmed ✓</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</section>

<!-- WHO IT'S FOR -->
<section class="section" style="background:#fff;">
  <div class="container">
    <div class="section-header">
      <span class="tag tag-plum">Who uses Certxa</span>
      <h2 class="section-title">Built for every solo<br><em>beauty professional.</em></h2>
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:16px;margin-top:48px;">
      <?php
      $types = [
        ['✂️', 'Hairstylists', 'Manage color formulas, cuts, treatments, and a full book.'],
        ['💅', 'Nail Technicians', 'Book gel, acrylic, nail art, and spa pedicure services.'],
        ['👁️', 'Lash Artists', 'Full & hybrid sets, fills, and removal — all organized.'],
        ['🌿', 'Estheticians', 'Facials, waxing, peels, and skincare consultations.'],
        ['💆', 'Brow Specialists', 'Microblading, lamination, tinting, and waxing.'],
        ['💋', 'Makeup Artists', 'Bridal, editorial, and event bookings with deposits.'],
        ['💪', 'Massage Therapists', 'Intake forms, room scheduling, and session notes.'],
        ['🧖', 'Waxing Pros', 'Full menu management with package and series pricing.'],
      ];
      foreach ($types as $t): ?>
      <div style="background:#fafafa;border:1px solid #f0f0f2;border-radius:14px;padding:22px 18px;text-align:center;">
        <div style="font-size:1.8rem;margin-bottom:10px;"><?= $t[0] ?></div>
        <div style="font-size:.88rem;font-weight:700;color:var(--charcoal);margin-bottom:6px;"><?= $t[1] ?></div>
        <div style="font-size:.78rem;color:var(--mid-grey);line-height:1.5;"><?= $t[2] ?></div>
      </div>
      <?php endforeach; ?>
    </div>
  </div>
</section>

<!-- CORE FEATURES -->
<section class="section" style="background:#fafafa;">
  <div class="container">
    <div class="section-header">
      <span class="tag tag-plum">Everything in one app</span>
      <h2 class="section-title">Your virtual front desk,<br><em>open 24/7.</em></h2>
      <p class="section-sub">No receptionist? No problem. Certxa handles the tasks that eat your time so you can stay behind the chair and making money.</p>
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:24px;margin-top:48px;">
      <?php
      $features = [
        ['🌐', '24/7 Online Booking', 'Clients book, reschedule, and cancel themselves — any time of day, from any device. You get notified instantly.'],
        ['📲', 'Auto Confirmations & Reminders', 'Every client gets a confirmation when they book, and a reminder before their appointment. No-shows drop dramatically.'],
        ['💳', 'Integrated Card Payments', 'Tap, swipe, or type — accept any payment at checkout. Funds hit your bank account within 1 business day.'],
        ['📋', 'Client Profiles', 'Save service notes, color formulas, intake responses, and visit history for every client — forever.'],
        ['📝', 'Digital Intake Forms', 'Send customizable forms before new appointments. Collect allergies, preferences, and consents automatically.'],
        ['⭐', 'Loyalty Program', 'Reward your best clients with points they earn every visit. A simple loyalty program that runs itself.'],
        ['💬', 'Review Requests', 'After each appointment, Certxa sends a review request automatically. Build your Google rating on autopilot.'],
        ['📈', 'Revenue Analytics', 'See what\'s working — your busiest days, top services, best clients, and monthly revenue trends at a glance.'],
        ['🎁', 'Gift Cards', 'Sell digital gift cards from your booking page. Perfect for holidays, birthdays, and upselling referrals.'],
        ['🔔', 'Rebooking Nudges', 'When a client hasn\'t rebooked, Certxa sends a friendly nudge at the right time to bring them back.'],
        ['📷', 'Client Photos', 'Attach before/after photos directly to client profiles. Build a visual record of every transformation.'],
        ['🔗', 'Google Business Profile', 'Sync your booking link to your Google listing so clients can book you directly from Google Search and Maps.'],
      ];
      foreach ($features as $f): ?>
      <div style="background:#fff;border:1px solid #f0f0f2;border-radius:14px;padding:24px;">
        <div style="font-size:1.5rem;margin-bottom:10px;"><?= $f[0] ?></div>
        <h3 style="font-size:.95rem;font-weight:700;color:var(--charcoal);margin:0 0 8px;"><?= $f[1] ?></h3>
        <p style="font-size:.84rem;color:var(--mid-grey);line-height:1.6;margin:0;"><?= $f[2] ?></p>
      </div>
      <?php endforeach; ?>
    </div>
  </div>
</section>

<!-- PRICING CALLOUT -->
<section class="section" style="background:#fff;">
  <div class="container" style="max-width:720px;text-align:center;">
    <span class="tag tag-plum">Simple Pricing</span>
    <h2 class="section-title" style="margin-top:16px;">One flat rate.<br><em>Core platform included.</em></h2>
    <p style="color:var(--mid-grey);font-size:1rem;line-height:1.65;margin-bottom:40px;">Your monthly subscription covers all core platform features. Optional add-ons like the Autumn AI receptionist and SMS beyond your plan allowance are usage-based and billed separately.</p>
    <div style="display:inline-block;background:#fafafa;border:2px solid #f0f0f2;border-radius:20px;padding:36px 48px;text-align:center;">
      <div style="font-size:.8rem;font-weight:700;color:var(--mid-grey);text-transform:uppercase;letter-spacing:.1em;margin-bottom:8px;">Starting at</div>
      <div style="font-size:3.2rem;font-weight:900;color:var(--charcoal);line-height:1;margin-bottom:4px;">$9<span style="font-size:1.2rem;color:var(--mid-grey);font-weight:500;">/mo</span></div>
      <div style="font-size:.85rem;color:var(--mid-grey);margin-bottom:24px;">After your <?= TRIAL_DAYS ?>-day free trial</div>
      <?php
      $includes = ['Online booking page','POS & card payments','Unlimited client profiles','Automated reminders','Loyalty program','Gift cards','Analytics dashboard','Google Reviews manager','Google Business Profile booking link','No contracts or setup fees'];
      foreach ($includes as $item): ?>
      <div style="display:flex;align-items:center;gap:10px;text-align:left;margin-bottom:8px;">
        <span style="width:18px;height:18px;border-radius:50%;background:rgba(91,33,182,.1);display:flex;align-items:center;justify-content:center;font-size:.7rem;color:#5b21b6;font-weight:700;flex-shrink:0;">✓</span>
        <span style="font-size:.85rem;color:var(--charcoal);"><?= $item ?></span>
      </div>
      <?php endforeach; ?>
      <a href="/auth?mode=register" class="btn btn-plum btn-lg" style="margin-top:24px;display:block;">Start Free — <?= TRIAL_DAYS ?> Days</a>
    </div>
  </div>
</section>

<!-- TESTIMONIALS -->
<section class="section" style="background:#fafafa;">
  <div class="container" style="max-width:900px;">
    <div class="section-header">
      <span class="tag tag-plum">Real Solo Professionals</span>
      <h2 class="section-title">They did it alone.<br><em>With Certxa.</em></h2>
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:24px;margin-top:40px;">
      <?php
      $testimonials = [
        ['"I\'m a one-woman show. Certxa handles my whole front desk — bookings, reminders, payments — while I do the actual work."', 'Priya S.', 'Independent Esthetician', 'PS'],
        ['"I used to text clients manually to confirm. Now Certxa does it for me and I get 4.9 stars on Google because it reminds them to leave a review."', 'Taylor B.', 'Solo Nail Tech, Miami', 'TB'],
        ['"Certxa paid for itself in the first week. I went from 3 no-shows a week to almost zero. That alone is worth $29."', 'Jasmine R.', 'Lash Artist & Stylist', 'JR'],
      ];
      foreach ($testimonials as $t): ?>
      <div style="background:#fff;border:1px solid #f0f0f2;border-radius:16px;padding:28px;">
        <div style="display:flex;gap:2px;margin-bottom:14px;">
          <?php for ($i = 0; $i < 5; $i++): ?>
          <svg width="14" height="14" viewBox="0 0 20 20" fill="#F59E0B"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/></svg>
          <?php endfor; ?>
        </div>
        <p style="font-size:.88rem;color:var(--mid-grey);line-height:1.65;font-style:italic;margin:0 0 18px;"><?= $t[0] ?></p>
        <div style="display:flex;align-items:center;gap:10px;">
          <div style="width:36px;height:36px;border-radius:50%;background:linear-gradient(135deg,#5b21b6,#3b0764);display:flex;align-items:center;justify-content:center;font-size:.65rem;font-weight:800;color:#fff;flex-shrink:0;"><?= $t[2] ?></div>
          <div>
            <div style="font-size:.85rem;font-weight:700;color:var(--charcoal);"><?= $t[1] ?></div>
            <div style="font-size:.75rem;color:var(--mid-grey);"><?= $t[2] ?></div>
          </div>
        </div>
      </div>
      <?php endforeach; ?>
    </div>
  </div>
</section>

<!-- CTA -->
<section class="section cta-section">
  <div class="container" style="max-width:680px;text-align:center;">
    <span class="tag" style="background:rgba(245,158,11,.15);color:#FCD34D;border-color:rgba(245,158,11,.3);margin-bottom:20px;display:inline-flex;">Free for <?= TRIAL_DAYS ?> days</span>
    <h2 class="section-title" style="color:#fff;">Stop running your business<br><em style="color:#F59E0B;">on sticky notes.</em></h2>
    <p style="color:rgba(255,255,255,.65);font-size:1rem;line-height:1.65;margin-bottom:36px;">Get the full Certxa platform free for <?= TRIAL_DAYS ?> days. Credit card required to subscribe — no charge until your trial ends.</p>
    <a href="/auth?mode=register" class="btn btn-gold btn-lg">Start Your Free Trial</a>
    <div style="margin-top:16px;font-size:.82rem;color:rgba(255,255,255,.4);"><?= TRIAL_DAYS ?> days free · from $9/mo after · Cancel anytime</div>
  </div>
</section>

<?php require 'includes/footer.php'; ?>
