<?php
define('BRAND_NAME',    'Certxa');
define('PAGE_TITLE',    'Nail Salon Online Booking | Certxa');
define('PAGE_DESC',     'Nail salon booking software for online appointments, technician selection, deposits, reminders, waitlists, and walk-ins. Let clients book from your website, social profiles, or Google with Certxa.');
define('PAGE_KEYWORDS', 'nail salon booking software, nail salon booking system, nail salon scheduling software, online booking for nail salons, nail technician booking software, salon appointment scheduling');
define('PAGE_CANONICAL', 'https://certxa.com/online-booking');
define('PAGE_BREADCRUMBS', json_encode([
  ['name'=>'Home','url'=>'https://certxa.com/'],
  ['name'=>'Online Booking','url'=>'https://certxa.com/online-booking'],
]));
define('PAGE_SCHEMA', json_encode([
  [
    '@type'       => 'WebPage',
    '@id'         => 'https://certxa.com/online-booking',
    'name'        => 'Online Booking for Salons — Certxa',
    'description' => 'Let clients book salon appointments 24/7 from your website, social media, and Google. No phone calls needed.',
    'url'         => 'https://certxa.com/online-booking',
    'isPartOf'    => ['@id'=>'https://certxa.com/#website'],
    'about'       => ['@id'=>'https://certxa.com/#software'],
    'breadcrumb'  => ['@id'=>'https://certxa.com/online-booking#breadcrumb'],
  ],
  [
    '@type'      => 'FAQPage',
    'mainEntity' => [
      [
        '@type'          => 'Question',
        'name'           => 'Do my clients need to create an account to book online?',
        'acceptedAnswer' => ['@type'=>'Answer','text'=>'No — clients can book instantly without creating an account or downloading anything. They simply choose a service, pick a time, and confirm with their name and contact details.'],
      ],
      [
        '@type'          => 'Question',
        'name'           => 'Can I accept deposits or prepayments when clients book online?',
        'acceptedAnswer' => ['@type'=>'Answer','text'=>'Yes. You can require a deposit (fixed amount or percentage of the service price) to secure bookings. This dramatically reduces no-shows and protects your time for high-value services like gel manicures and acrylic sets.'],
      ],
      [
        '@type'          => 'Question',
        'name'           => 'Can I manage multiple staff members with online booking?',
        'acceptedAnswer' => ['@type'=>'Answer','text'=>'Yes — Certxa supports unlimited staff members, each with their own calendar, services, and working hours. Clients can choose a specific stylist or let the system assign the next available technician.'],
      ],
      [
        '@type'          => 'Question',
        'name'           => 'Will I get notified when a new booking comes in?',
        'acceptedAnswer' => ['@type'=>'Answer','text'=>'You receive instant push notifications, email alerts, or SMS every time a client books, cancels, or reschedules. You can also view all upcoming bookings in real time from your Certxa dashboard.'],
      ],
    ],
  ],
]));
require 'includes/header.php';
require 'includes/nav.php';

// Calendar positioning helpers
$CAL_START = 9;   // 9 AM
$CAL_PPH   = 52;  // pixels per hour

function cal_top(string $time, int $start = 9, int $pph = 52): int {
  [$h, $m] = array_map('intval', explode(':', $time));
  return (int)(($h - $start) * $pph + $m / 60 * $pph);
}
function cal_h(int $min, int $pph = 52): int {
  return max((int)($min / 60 * $pph) - 3, 18);
}

$technicians = [
  ['initials'=>'EK','name'=>'Emma K.','role'=>'Colour Specialist','grad'=>'linear-gradient(135deg,#a78bfa,#7c3aed)','count'=>4],
  ['initials'=>'SR','name'=>'Sophie R.','role'=>'Colorist','grad'=>'linear-gradient(135deg,#f9a8d4,#ec4899)','count'=>3],
  ['initials'=>'JT','name'=>'James T.','role'=>'Stylist','grad'=>'linear-gradient(135deg,#6ee7b7,#059669)','count'=>5],
  ['initials'=>'AL','name'=>'Ava L.','role'=>'Nail Tech','grad'=>'linear-gradient(135deg,#fcd34d,#f59e0b)','count'=>3],
];

// [time, duration_min, client, service, bg, text]
$appointments = [
  0 => [
    ['9:00',  90,  'Emma Clarke',  'Balayage + Toner', '#ede9fe','#4c1d95'],
    ['11:00', 60,  'Rachel Park',  'Cut & Style',      '#ede9fe','#5b21b6'],
    ['13:30', 45,  'Lily Chen',    'Blowout',          '#f5f3ff','#6d28d9'],
    ['15:00', 60,  'Priya Shah',   'Highlights',       '#ede9fe','#4c1d95'],
  ],
  1 => [
    ['9:30',  150, 'Sophie Hart',  'Full Colour',      '#fce7f3','#9d174d'],
    ['13:00', 60,  'Mia Torres',   'Balayage',         '#fdf2f8','#be185d'],
    ['14:30', 45,  'Anna Lee',     'Toner',            '#fce7f3','#db2777'],
  ],
  2 => [
    ['9:00',  30,  'Jake P.',      "Men's Cut",        '#d1fae5','#064e3b'],
    ['10:00', 60,  'Tom Walsh',    'Cut & Beard',      '#ecfdf5','#047857'],
    ['11:30', 45,  'Sam Fox',      'Perm',             '#d1fae5','#065f46'],
    ['13:30', 60,  'David K.',     'Cut & Style',      '#ecfdf5','#047857'],
    ['15:00', 30,  'Harry M.',     "Men's Cut",        '#d1fae5','#064e3b'],
  ],
  3 => [
    ['9:00',  90,  'Zara Singh',   'Gel Nails',        '#fef3c7','#92400e'],
    ['11:00', 60,  'Grace Wu',     'Pedicure',         '#fffbeb','#78350f'],
    ['13:00', 90,  'Chloe M.',     'Full Set + Art',   '#fef3c7','#b45309'],
    ['15:00', 45,  'Isla Brown',   'Nail Art',         '#fffbeb','#d97706'],
  ],
];

$time_labels = ['9 AM','10','11','12 PM','1','2','3','4','5 PM'];
$total_h = (17 - $CAL_START) * $CAL_PPH; // 9am-5pm
$now_top = cal_top('11:20'); // simulate current time line
?>

<!-- HERO — CALENDAR MOCKUP -->
<section class="hero-dark-section" style="padding:100px 0 80px;">
  <div class="orb orb-1"></div>
  <div class="orb orb-2"></div>

  <div class="container">
    <div class="hero-dark-inner">

      <!-- copy -->
      <div class="hero-dark-copy animate-fade-up">
        <div class="hero-stars-row">
          <span class="stars-badge">
            <span class="stars-gold">📅</span>
            <span>Smart Multi-Staff Scheduling</span>
          </span>
        </div>

        <h1 class="hero-dark-headline">
          Nail salon<br>booking that<br><em>fills your calendar.</em>
        </h1>

        <p class="hero-dark-sub">
          Let clients choose a service, technician, and available time online while Certxa keeps your team calendar organised. Accept bookings around the clock from your website, social profiles, or Google.
        </p>

        <div class="hero-dark-actions">
          <a href="/auth?mode=register" class="btn btn-gold btn-lg">Start Free Trial</a>
          <a href="/pricing" class="btn btn-outline-white btn-lg">See Pricing</a>
        </div>

        <div class="hero-dark-trust" style="margin-top:32px;">
          <div class="avatar-stack">
            <div class="av-dot" style="background:linear-gradient(135deg,#a78bfa,#7c3aed)">JM</div>
            <div class="av-dot" style="background:linear-gradient(135deg,#f9a8d4,#ec4899)">RP</div>
            <div class="av-dot" style="background:linear-gradient(135deg,#fcd34d,#f59e0b)">DK</div>
          </div>
          <span class="trust-text">Booking tools designed around real nail salon services and technician availability</span>
        </div>
      </div>

      <!-- calendar mockup -->
      <div class="hero-dark-visual animate-fade-up animate-delay-2" style="position:relative;">
        <div class="dash-shell" style="flex-direction:column;overflow:hidden;">

          <!-- sidebar + topbar row -->
          <div style="display:flex;overflow:hidden;flex:1;">

            <!-- sidebar -->
            <div class="dash-sidebar" style="justify-content:flex-start;padding-top:16px;">
              <div class="dash-sidebar-logo" style="margin-bottom:16px;">CX</div>
              <div class="dash-sidebar-nav">
                <div class="dash-nav-item" title="Dashboard">
                  <svg viewBox="0 0 20 20" fill="currentColor"><path d="M2 11l8-8 8 8v7a1 1 0 01-1 1H3a1 1 0 01-1-1v-7z"/></svg>
                </div>
                <div class="dash-nav-item active" title="Calendar">
                  <svg viewBox="0 0 20 20" fill="currentColor"><path d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zM4 8h12v8H4V8z"/></svg>
                </div>
                <div class="dash-nav-item" title="Clients">
                  <svg viewBox="0 0 20 20" fill="currentColor"><path d="M9 6a3 3 0 11-6 0 3 3 0 016 0zM17 6a3 3 0 11-6 0 3 3 0 016 0zM12.93 17c.046-.327.07-.66.07-1a6.97 6.97 0 00-1.5-4.33A5 5 0 0119 16v1h-6.07zM6 11a5 5 0 015 5v1H1v-1a5 5 0 015-5z"/></svg>
                </div>
                <div class="dash-nav-item" title="Payments">
                  <svg viewBox="0 0 20 20" fill="currentColor"><path d="M4 4a2 2 0 00-2 2v1h16V6a2 2 0 00-2-2H4zM18 9H2v5a2 2 0 002 2h12a2 2 0 002-2V9z"/></svg>
                </div>
              </div>
            </div>

            <!-- main -->
            <div class="dash-main" style="padding:14px 14px 0;display:flex;flex-direction:column;">

              <!-- topbar -->
              <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
                <div>
                  <div style="font-size:.65rem;color:var(--mid-grey);">Today's Schedule</div>
                  <div style="font-size:.9rem;font-weight:700;color:var(--charcoal);">Thursday, 30 April</div>
                </div>
                <div style="display:flex;align-items:center;gap:6px;">
                  <div style="display:flex;border:1px solid var(--light-grey);border-radius:8px;overflow:hidden;font-size:.65rem;font-weight:600;">
                    <span style="padding:4px 8px;background:var(--plum);color:#fff;">Day</span>
                    <span style="padding:4px 8px;color:var(--mid-grey);">Week</span>
                    <span style="padding:4px 8px;color:var(--mid-grey);">Month</span>
                  </div>
                  <div style="background:var(--plum);color:#fff;border-radius:7px;padding:5px 10px;font-size:.65rem;font-weight:700;cursor:pointer;">+ New</div>
                </div>
              </div>

              <!-- technician headers -->
              <div style="display:grid;grid-template-columns:32px repeat(4,1fr);gap:2px;margin-bottom:6px;">
                <div></div>
                <?php foreach ($technicians as $t): ?>
                <div style="background:var(--white);border-radius:8px;padding:7px 8px;border:1px solid var(--light-grey);text-align:center;">
                  <div style="width:26px;height:26px;border-radius:7px;background:<?= $t['grad'] ?>;display:flex;align-items:center;justify-content:center;font-size:.6rem;font-weight:800;color:#fff;margin:0 auto 4px;">
                    <?= $t['initials'] ?>
                  </div>
                  <div style="font-size:.63rem;font-weight:700;color:var(--charcoal);"><?= $t['name'] ?></div>
                  <div style="font-size:.57rem;color:var(--mid-grey);"><?= $t['role'] ?></div>
                  <div style="font-size:.55rem;color:var(--plum);font-weight:600;margin-top:2px;"><?= $t['count'] ?> appts</div>
                </div>
                <?php endforeach; ?>
              </div>

              <!-- time grid -->
              <div style="flex:1;overflow:hidden;">
                <div style="display:grid;grid-template-columns:32px repeat(4,1fr);gap:2px;height:<?= $total_h ?>px;position:relative;">

                  <!-- time labels column -->
                  <div style="position:relative;">
                    <?php foreach ($time_labels as $i => $label): ?>
                    <div style="position:absolute;top:<?= $i * $CAL_PPH - 7 ?>px;right:4px;font-size:.55rem;color:var(--mid-grey);white-space:nowrap;font-weight:500;">
                      <?= $label ?>
                    </div>
                    <?php endforeach; ?>
                  </div>

                  <!-- technician columns -->
                  <?php foreach ($technicians as $col_idx => $tech): ?>
                  <div style="position:relative;background:var(--white);border-radius:8px;border:1px solid var(--light-grey);overflow:hidden;">

                    <!-- hour grid lines -->
                    <?php for ($hr = 0; $hr <= 8; $hr++): ?>
                    <div style="position:absolute;top:<?= $hr * $CAL_PPH ?>px;left:0;right:0;border-top:1px solid <?= $hr === 0 ? 'transparent' : '#f0f0f0' ?>;"></div>
                    <?php endfor; ?>

                    <!-- booking cards -->
                    <?php foreach ($appointments[$col_idx] as $appt): ?>
                    <div style="
                      position:absolute;
                      top:<?= cal_top($appt[0]) ?>px;
                      height:<?= cal_h($appt[1]) ?>px;
                      left:2px;right:2px;
                      background:<?= $appt[4] ?>;
                      border-left:3px solid <?= $appt[5] ?>;
                      border-radius:5px;
                      padding:3px 5px;
                      overflow:hidden;
                      cursor:pointer;
                      transition:opacity .15s;
                    ">
                      <div style="font-size:.58rem;font-weight:700;color:<?= $appt[5] ?>;line-height:1.2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;"><?= $appt[2] ?></div>
                      <?php if (cal_h($appt[1]) > 25): ?>
                      <div style="font-size:.53rem;color:<?= $appt[5] ?>;opacity:.75;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;"><?= $appt[3] ?></div>
                      <?php endif; ?>
                    </div>
                    <?php endforeach; ?>

                    <!-- current time line (column 0 only for effect) -->
                    <?php if ($col_idx === 0): ?>
                    <div style="position:absolute;top:<?= $now_top ?>px;left:0;right:0;border-top:2px solid #EF4444;z-index:10;">
                      <div style="position:absolute;left:-3px;top:-4px;width:8px;height:8px;background:#EF4444;border-radius:50%;"></div>
                    </div>
                    <?php endif; ?>
                  </div>
                  <?php endforeach; ?>

                </div>
              </div>

            </div>
          </div>
        </div>

        <!-- floating badge -->
        <div class="float-badge float-badge-top" style="top:-18px;right:-20px;">
          <div class="float-badge-icon">🔔</div>
          <div class="float-badge-body"><strong>New Booking</strong><span>Hannah just booked with Emma K.</span></div>
        </div>
        <div class="float-badge float-badge-bottom" style="bottom:-14px;left:-20px;">
          <div class="float-badge-icon">✅</div>
          <div class="float-badge-body"><strong>Fully booked</strong><span>Saturday · All 4 stylists</span></div>
        </div>

      </div>
    </div>
  </div>
</section>

<!-- STATS -->
<section class="stats-strip">
  <div class="container">
    <div class="stats-grid">
      <div class="stat-item"><div class="stat-value"><span>24/7</span></div><div class="stat-label">Online booking availability</div></div>
      <div class="stat-item"><div class="stat-value"><span>1</span></div><div class="stat-label">Shared calendar for your team</div></div>
      <div class="stat-item"><div class="stat-value"><span>3</span></div><div class="stat-label">Simple setup steps</div></div>
      <div class="stat-item"><div class="stat-value"><span>0</span></div><div class="stat-label">Phone calls required for online bookings</div></div>
    </div>
  </div>
</section>

<!-- FEATURES -->
<section class="section">
  <div class="container">
    <div class="section-header">
      <span class="tag tag-plum">How It Works</span>
      <h2 class="section-title">Booking that works around the clock</h2>
      <p class="section-subtitle">Your booking page never sleeps. Clients can see your real-time availability and confirm appointments instantly — without ever picking up the phone.</p>
    </div>

    <div class="feature-block">
      <div class="feature-content">
        <span class="tag tag-plum">Instant Availability</span>
        <h3 class="feature-title">Real-time booking, zero back-and-forth</h3>
        <p class="feature-text">Clients see your live calendar and choose from available slots immediately. No waiting, no phone tag, no double bookings — ever. Your schedule stays perfectly organised automatically.</p>
        <ul class="feature-list">
          <li>Live calendar synced across all devices</li>
          <li>Clients choose services, stylists, and times themselves</li>
          <li>Instant confirmation sent automatically</li>
          <li>Buffer times and breaks handled for you</li>
        </ul>
        <a href="/auth?mode=register" class="btn btn-primary">Try nail salon booking free</a>
      </div>
      <div class="feature-visual" style="background:linear-gradient(145deg,#F0FDF4,#DCFCE7);">
        <div class="ui-card" style="width:100%;max-width:340px;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
            <strong style="font-size:.95rem;">May 2025</strong>
            <div style="display:flex;gap:8px;">
              <button style="border:1px solid var(--light-grey);background:#fff;width:28px;height:28px;border-radius:6px;cursor:pointer;font-size:.9rem;">‹</button>
              <button style="border:1px solid var(--light-grey);background:#fff;width:28px;height:28px;border-radius:6px;cursor:pointer;font-size:.9rem;">›</button>
            </div>
          </div>
          <?php
          $days = ['M','T','W','T','F','S','S'];
          $dates = range(1, 31);
          echo '<div style="display:grid;grid-template-columns:repeat(7,1fr);gap:4px;text-align:center;margin-bottom:8px;">';
          foreach ($days as $d) echo "<div style='font-size:.72rem;font-weight:600;color:var(--mid-grey);padding:4px 0;'>$d</div>";
          echo '</div>';
          echo '<div style="display:grid;grid-template-columns:repeat(7,1fr);gap:4px;text-align:center;">';
          $avail = [5,6,8,9,12,13,15,19,20,22,26,27];
          $booked = [7,10,14,16,21,23];
          for ($i = 1; $i <= 31; $i++) {
            $style = 'padding:6px 4px;border-radius:6px;font-size:.78rem;cursor:pointer;';
            if (in_array($i, $avail)) $style .= 'background:#DCFCE7;color:#14532D;font-weight:600;';
            elseif (in_array($i, $booked)) $style .= 'background:var(--plum-light);color:var(--plum);font-weight:600;';
            elseif ($i === 15) $style .= 'background:var(--plum);color:#fff;font-weight:700;border-radius:50%;';
            else $style .= 'color:var(--mid-grey);';
            echo "<div style='$style'>$i</div>";
          }
          echo '</div>';
          ?>
          <div style="display:flex;gap:10px;margin-top:14px;font-size:.72rem;">
            <span style="display:flex;align-items:center;gap:4px;"><span style="width:10px;height:10px;background:#DCFCE7;border-radius:2px;display:inline-block;"></span>Available</span>
            <span style="display:flex;align-items:center;gap:4px;"><span style="width:10px;height:10px;background:var(--plum-light);border-radius:2px;display:inline-block;"></span>Booked</span>
          </div>
        </div>
      </div>
    </div>

    <div class="feature-block reverse">
      <div class="feature-content">
        <span class="tag tag-gold">Multi-Channel</span>
        <h3 class="feature-title">Book from anywhere your clients find you</h3>
        <p class="feature-text">Share your booking link everywhere — your website, Instagram bio, Facebook page, Google listing, or even a QR code at your front desk. Clients book wherever they discover you.</p>
        <ul class="feature-list">
          <li>Embeddable booking widget for any website</li>
          <li>Direct link for Instagram &amp; social profiles</li>
          <li>Google Business Profile booking link built-in</li>
          <li>QR code for in-salon display</li>
        </ul>
        <a href="/google-business-profile" class="btn btn-primary">See Google booking setup</a>
      </div>
      <div class="feature-visual" style="background:linear-gradient(145deg,var(--cream),var(--cream-dark));">
        <div style="display:flex;flex-direction:column;gap:12px;width:100%;max-width:320px;">
          <?php
          $channels = [
            ['🌐', 'Your Website', 'Embedded booking widget', '#10B981'],
            ['📱', 'Instagram', 'Link in bio booking', '#E1306C'],
            ['🔍', 'Google Search', 'Book via Google listing', '#4285F4'],
            ['📘', 'Facebook', 'Book Now button', '#1877F2'],
          ];
          foreach ($channels as $ch):
          ?>
          <div style="background:#fff;border-radius:10px;padding:14px 16px;display:flex;align-items:center;gap:14px;box-shadow:var(--shadow-sm);border:1px solid var(--light-grey);">
            <span style="font-size:1.4rem;"><?= $ch[0] ?></span>
            <div style="flex:1;">
              <div style="font-weight:600;font-size:.88rem;"><?= $ch[1] ?></div>
              <div style="font-size:.76rem;color:var(--mid-grey);"><?= $ch[2] ?></div>
            </div>
            <div style="width:8px;height:8px;border-radius:50%;background:<?= $ch[3] ?>;"></div>
          </div>
          <?php endforeach; ?>
        </div>
      </div>
    </div>

    <div class="feature-block">
      <div class="feature-content">
        <span class="tag tag-plum">Smart Scheduling</span>
        <h3 class="feature-title">Your rules, your schedule — always</h3>
        <p class="feature-text">Set your working hours, block out holidays, add custom booking rules, and manage multiple staff members with ease. Certxa adapts to how your business actually works.</p>
        <ul class="feature-list">
          <li>Custom hours and holiday blocking</li>
          <li>Multi-staff scheduling and individual calendars</li>
          <li>Minimum notice and advance booking windows</li>
          <li>Service-specific durations and pricing</li>
        </ul>
        <a href="/auth?mode=register" class="btn btn-primary">Try online booking free</a>
      </div>
      <div class="feature-visual">
        <div class="ui-card" style="width:100%;max-width:320px;">
          <div class="ui-card-header">
            <div class="ui-avatar" style="background:#F0FDF4;color:#14532D;">SJ</div>
            <div><div class="ui-name">Sophie Jenkins</div><div class="ui-meta">Today at 2:30pm &middot; Cut &amp; Colour</div></div>
            <span class="ui-badge confirmed" style="margin-left:auto;">Confirmed</span>
          </div>
          <?php
          $upcoming = [
            ['Emma Clarke', '3:45pm', 'Balayage', 'confirmed'],
            ['Lisa Tran', '5:00pm', 'Blow Dry', 'confirmed'],
            ['Anna White', 'Tomorrow 10am', 'Full Highlights', 'pending'],
          ];
          foreach ($upcoming as $u):
          ?>
          <div class="ui-row">
            <div>
              <div style="font-weight:600;font-size:.85rem;"><?= $u[0] ?></div>
              <div style="font-size:.75rem;color:var(--mid-grey);"><?= $u[1] ?> &middot; <?= $u[2] ?></div>
            </div>
            <span class="ui-badge <?= $u[3] ?>"><?= ucfirst($u[3]) ?></span>
          </div>
          <?php endforeach; ?>
        </div>
      </div>
    </div>
  </div>
</section>

<!-- HOW IT WORKS -->
<section class="section section-alt">
  <div class="container">
    <div class="section-header">
      <span class="tag tag-plum">Simple Setup</span>
      <h2 class="section-title">Up and running in minutes</h2>
    </div>
    <div class="steps-grid">
      <div class="step">
        <div class="step-number">1</div>
        <h4 class="step-title">Add your services</h4>
        <p class="step-text">List your services with names, durations, and prices. Organise them into categories so clients can find what they need instantly.</p>
      </div>
      <div class="step">
        <div class="step-number">2</div>
        <h4 class="step-title">Set your availability</h4>
        <p class="step-text">Tell us your working hours and any blocked dates. Certxa automatically shows only your available slots to clients.</p>
      </div>
      <div class="step">
        <div class="step-number">3</div>
        <h4 class="step-title">Share your booking link</h4>
        <p class="step-text">Copy your unique booking link and share it everywhere — your website, socials, email signature, wherever your clients find you.</p>
      </div>
    </div>
  </div>
</section>

<!-- FAQ -->
<section class="section">
  <div class="container" style="max-width:720px;">
    <div class="section-header">
      <span class="tag tag-plum">FAQ</span>
      <h2 class="section-title">Common questions</h2>
    </div>
    <div class="accordion">
      <div class="accordion-item">
        <button class="accordion-btn">Do my clients need to create an account to book? <span class="accordion-icon">+</span></button>
        <div class="accordion-body">No — clients can book instantly without creating an account or downloading anything. They simply choose a service, pick a time, and confirm with their name and contact details. It couldn't be simpler.</div>
      </div>
      <div class="accordion-item">
        <button class="accordion-btn">Can I accept deposits or prepayments at booking? <span class="accordion-icon">+</span></button>
        <div class="accordion-body">Absolutely. You can require a deposit (fixed amount or percentage) to secure bookings. This dramatically reduces no-shows and protects your time for high-value services.</div>
      </div>
      <div class="accordion-item">
        <button class="accordion-btn">Can I manage multiple staff members' schedules? <span class="accordion-icon">+</span></button>
        <div class="accordion-body">Yes — Certxa supports unlimited staff members, each with their own calendar, services, and working hours. Clients can choose a specific stylist or let the system assign the next available one.</div>
      </div>
      <div class="accordion-item">
        <button class="accordion-btn">Will I get notified when a new booking comes in? <span class="accordion-icon">+</span></button>
        <div class="accordion-body">You receive instant push notifications, email alerts, or SMS (your choice) every time a client books, cancels, or reschedules. You're always in the loop.</div>
      </div>
    </div>
  </div>
</section>

<!-- CTA -->
<section class="cta-section">
  <div class="container" style="position:relative;z-index:1;">
    <span class="tag" style="background:rgba(255,255,255,.15);color:#fff;margin-bottom:16px;display:inline-block;">Start Booking Today</span>
    <h2 class="cta-title">Fill your calendar.<br><em>Grow your business.</em></h2>
    <p class="cta-text">Join thousands of salon owners who've transformed their booking process with Certxa. Start your free trial today.</p>
    <div class="cta-actions">
          <a href="/auth?mode=register" class="btn btn-gold">Start Free Trial</a>
          <a href="/nail-salon-software" class="btn btn-outline-white">Explore nail salon software</a>
    </div>
    <p class="cta-note">Credit card required · No charge until trial ends &middot; <?= TRIAL_DAYS ?>-day free trial</p>
  </div>
</section>

<?php require 'includes/footer.php'; ?>
