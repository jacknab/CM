<?php
define('BRAND_NAME',    'Certxa');
define('PAGE_TITLE',    'Salon Appointment Reminders | Certxa');
define('PAGE_DESC',     'Nail salon appointment reminders and automated client notifications for booking confirmations, reminders, follow-ups, and rebooking messages. Certxa helps keep clients informed across your salon booking workflow.');
define('PAGE_KEYWORDS', 'nail salon appointment reminders, automated nail salon reminders, nail salon SMS reminders, nail salon no-show reduction, nail salon booking confirmation, nail salon follow-up messages, nail salon automated notifications, nail salon text reminders');
define('PAGE_CANONICAL', 'https://certxa.com/client-notifications');
define('PAGE_BREADCRUMBS', json_encode([
  ['name'=>'Home','url'=>'https://certxa.com/'],
  ['name'=>'Client Notifications','url'=>'https://certxa.com/client-notifications'],
]));
define('PAGE_SCHEMA', json_encode([
  [
    '@type'       => 'WebPage',
    '@id'         => 'https://certxa.com/client-notifications',
    'name'        => 'Salon Appointment Reminders & Automated Notifications — Certxa',
    'description' => 'Automated appointment reminders and client notifications for nail salons, beauty studios, and other appointment-based businesses.',
    'url'         => 'https://certxa.com/client-notifications',
    'isPartOf'    => ['@id'=>'https://certxa.com/#website'],
    'about'       => ['@id'=>'https://certxa.com/#software'],
  ],
]));
require 'includes/header.php';
require 'includes/nav.php';
?>

<!-- HERO -->
<section class="hero hero-notifications" style="padding:110px 0 90px;">
  <div class="container">
    <div class="hero-inner">
      <div class="hero-copy animate-fade-up">
        <div class="hero-badge"><span class="tag tag-plum">Client Notifications</span></div>
        <h1 class="hero-headline">Fewer no-shows.<br><em>More loyal clients.</em></h1>
        <p class="hero-subtext">Automated reminders, booking confirmations, and follow-up messages that keep your clients engaged and your diary full — all running in the background without any effort from you.</p>
        <div class="hero-actions">
          <a href="/auth?mode=register" class="btn btn-primary">Start Free Trial</a>
          <a href="/online-booking" class="btn btn-secondary">Explore Online Booking</a>
        </div>
        <p class="hero-note">Fully automated &middot; SMS, email and push &middot; GDPR compliant</p>
      </div>
      <div class="hero-visual animate-fade-up animate-delay-2">
        <div class="hero-mockup" style="max-width:360px;">
          <div class="hero-mockup-header">
            <div class="mockup-dot red"></div>
            <div class="mockup-dot yellow"></div>
            <div class="mockup-dot green"></div>
            <div class="mockup-bar">Notification Centre</div>
          </div>
          <?php
          $notifs = [
            ['📅', 'Booking Confirmed', 'Emma Clarke confirmed for Gel Manicure on Fri 16 May at 2pm', 'Just now', ''],
            ['⏰', 'Reminder Sent', '24-hour reminder sent to 3 clients for tomorrow', '2 min ago', 'gold-border'],
            ['⭐', 'Review Received', 'Lisa Tran left a 5-star review — "Absolutely stunning!"', '1 hr ago', 'green-border'],
            ['💬', 'Win-Back Sent', 'Re-engagement SMS sent to 5 lapsed clients', '3 hr ago', ''],
          ];
          foreach ($notifs as $n):
          ?>
          <div class="notif-card <?= $n[4] ?>">
            <div class="notif-icon"><?= $n[0] ?></div>
            <div class="notif-content">
              <div class="notif-title"><?= $n[1] ?></div>
              <div class="notif-text"><?= $n[2] ?></div>
              <div class="notif-time"><?= $n[3] ?></div>
            </div>
          </div>
          <?php endforeach; ?>
        </div>
      </div>
    </div>
  </div>
</section>

<!-- STATS -->
<section class="stats-strip">
  <div class="container">
    <div class="stats-grid">
      <div class="stat-item"><div class="stat-value"><span>24/7</span></div><div class="stat-label">Booking notification availability</div></div>
      <div class="stat-item"><div class="stat-value"><span>1</span></div><div class="stat-label">Connected client communication workflow</div></div>
      <div class="stat-item"><div class="stat-value"><span>3</span></div><div class="stat-label">Message moments: booking, visit, and follow-up</div></div>
      <div class="stat-item"><div class="stat-value"><span>0</span></div><div class="stat-label">Manual reminder list to maintain</div></div>
    </div>
  </div>
</section>

<!-- FEATURES -->
<section class="section">
  <div class="container">
    <div class="section-header">
      <span class="tag tag-plum">Smart Automation</span>
      <h2 class="section-title">The right message, at the right time — automatically</h2>
      <p class="section-subtitle">Certxa sends perfectly timed communications to your clients so you never have to think about it. Every message feels personal, because it is.</p>
    </div>

    <div class="feature-block">
      <div class="feature-content">
        <span class="tag tag-plum">Appointment Reminders</span>
        <h3 class="feature-title">Stop losing money to forgotten appointments</h3>
        <p class="feature-text">Certxa automatically sends reminders at the exact timing that works best — typically 48 hours and again 2 hours before an appointment. Clients can confirm, cancel, or reschedule right from the message, with no calls needed.</p>
        <ul class="feature-list">
          <li>Customisable reminder timing (24h, 48h, 72h before)</li>
          <li>SMS, email, and push notification options</li>
          <li>One-tap confirm, cancel, or reschedule for clients</li>
          <li>Instant notification to you when a client responds</li>
          <li>Cancellation policy enforced automatically</li>
        </ul>
        <a href="/auth?mode=register" class="btn btn-primary">Start Free Trial</a>
      </div>
      <div class="feature-visual" style="background:linear-gradient(145deg,var(--plum-light),#DDD6FE);">
        <div style="width:100%;max-width:300px;">
          <div style="background:#fff;border-radius:16px;padding:20px;box-shadow:var(--shadow-md);margin-bottom:12px;">
            <div style="font-size:.72rem;font-weight:700;color:var(--mid-grey);text-transform:uppercase;letter-spacing:.08em;margin-bottom:8px;">SMS Preview</div>
            <div style="background:var(--plum);color:#fff;border-radius:12px 12px 12px 0;padding:14px 16px;font-size:.88rem;line-height:1.6;">
              Hi Emma! Just a reminder that your Gel Manicure appointment with Sophie is tomorrow (Fri 16 May) at 2:00pm. Reply YES to confirm or call us to reschedule. See you soon! 💜 — Certxa
            </div>
            <div style="display:flex;gap:8px;margin-top:12px;">
              <div style="flex:1;background:#D1FAE5;color:#065F46;text-align:center;padding:8px;border-radius:8px;font-size:.8rem;font-weight:700;cursor:pointer;">YES ✓</div>
              <div style="flex:1;background:#FEE2E2;color:#991B1B;text-align:center;padding:8px;border-radius:8px;font-size:.8rem;font-weight:700;cursor:pointer;">CANCEL</div>
            </div>
          </div>
          <div style="text-align:center;font-size:.78rem;color:var(--mid-grey);">Delivered &middot; Read 09:14am</div>
        </div>
      </div>
    </div>

    <div class="feature-block reverse">
      <div class="feature-content">
        <span class="tag tag-gold">Client Retention</span>
        <h3 class="feature-title">Bring lapsed clients back on autopilot</h3>
        <p class="feature-text">When a client hasn't visited in a while, Certxa sends a gentle, personalised message to bring them back — before they start going elsewhere. Fully automated, completely personal.</p>
        <ul class="feature-list">
          <li>Customisable lapse triggers (e.g. 6, 8, 12 weeks)</li>
          <li>Personalised messages using client name and service</li>
          <li>Optional exclusive offer or discount to incentivise return</li>
          <li>Track re-engagement rate per campaign</li>
        </ul>
        <a href="/client-management" class="btn btn-primary">Explore Client Management</a>
      </div>
      <div class="feature-visual">
        <div class="ui-card" style="width:100%;max-width:320px;">
          <div style="font-weight:700;font-size:.9rem;margin-bottom:14px;">Re-engagement Campaign</div>
          <div style="background:var(--gold-light);border-radius:8px;padding:12px;margin-bottom:14px;font-size:.85rem;color:#78350F;line-height:1.6;">
            <strong>Message Preview:</strong><br>
            "Hi [Name], we've missed you! It's been a while since your last [service]. Book before [date] and enjoy 10% off. Tap to book: [link]"
          </div>
          <?php
          $stats2 = [['Sent', '47'], ['Opened', '39 (83%)'], ['Booked', '18 (38%)'], ['Revenue', '$1,260']];
          foreach ($stats2 as $st):
          ?>
          <div class="ui-row">
            <span class="ui-row-label"><?= $st[0] ?></span>
            <span class="ui-row-value green"><?= $st[1] ?></span>
          </div>
          <?php endforeach; ?>
        </div>
      </div>
    </div>

    <div class="feature-block">
      <div class="feature-content">
        <span class="tag tag-plum">Client Engagement</span>
        <h3 class="feature-title">Keep clients coming back automatically</h3>
        <p class="feature-text">Certxa sends the right message at the right moment — whether it's a thank-you after a visit, a rebooking nudge, or a seasonal offer. Small, timely touches that build lasting loyalty without any manual effort.</p>
        <ul class="feature-list">
          <li>Post-visit thank-you and review request</li>
          <li>Seasonal campaigns and promotional messages</li>
          <li>Lapsed client re-engagement nudges</li>
          <li>Personalised rebooking reminders</li>
        </ul>
        <a href="/auth?mode=register" class="btn btn-primary">Try Notifications Free</a>
      </div>
      <div class="feature-visual" style="background:linear-gradient(145deg,#FFF7ED,var(--gold-light));">
        <div style="display:flex;flex-direction:column;gap:10px;width:100%;max-width:300px;">
          <?php
          $occasions = [
            ['🌟', 'Post-Visit Thanks', 'Thank you for visiting today, Lisa! We loved having you. Please leave us a review — it means everything.', '#F0FDF4', '#14532D'],
            ['💬', 'Rebooking Nudge', 'Hey Sarah! It\'s been a little while — ready to book your next visit? Tap here to find a time that works for you.', '#F5F3FF', '#4C1D95'],
            ['🎯', 'Win-Back Offer', 'We miss you, Emma! Come back this month and enjoy 10% off your next appointment. Book now 💜', '#FEF3C7', '#78350F'],
          ];
          foreach ($occasions as $o):
          ?>
          <div style="background:#fff;border-radius:10px;padding:14px;box-shadow:var(--shadow-sm);">
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
              <span style="font-size:1.2rem;"><?= $o[0] ?></span>
              <strong style="font-size:.85rem;"><?= $o[1] ?></strong>
            </div>
            <p style="font-size:.8rem;color:var(--mid-grey);line-height:1.6;"><?= $o[2] ?></p>
          </div>
          <?php endforeach; ?>
        </div>
      </div>
    </div>
  </div>
</section>

<!-- NOTIFICATION TYPES -->
<section class="section section-alt">
  <div class="container">
    <div class="section-header">
      <span class="tag tag-plum">All Channels</span>
      <h2 class="section-title">Reach clients wherever they are</h2>
      <p class="section-subtitle">Choose SMS, email, push notifications — or all three. Certxa adapts to how your clients prefer to communicate.</p>
    </div>
    <div class="cards-grid">
      <div class="card">
        <div class="card-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" stroke-linecap="round" stroke-linejoin="round"/></svg></div>
        <h3 class="card-title">SMS Text Messages</h3>
        <p class="card-text">Highest open rate of any channel — 98% of texts are read within 3 minutes. Perfect for time-sensitive reminders and confirmations.</p>
      </div>
      <div class="card">
        <div class="card-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" stroke-linecap="round" stroke-linejoin="round"/></svg></div>
        <h3 class="card-title">Branded Email</h3>
        <p class="card-text">Beautiful, fully branded email templates for booking confirmations, receipts, newsletters, and promotional campaigns.</p>
      </div>
      <div class="card">
        <div class="card-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" stroke-linecap="round" stroke-linejoin="round"/></svg></div>
        <h3 class="card-title">Push Notifications</h3>
        <p class="card-text">Instant push alerts for clients who have your branded app — bookings, reminders, and offers delivered straight to their lock screen.</p>
      </div>
    </div>
  </div>
</section>

<!-- CTA -->
<section class="cta-section">
  <div class="container" style="position:relative;z-index:1;">
    <span class="tag" style="background:rgba(255,255,255,.15);color:#fff;margin-bottom:16px;display:inline-block;">Automate Your Communications</span>
    <h2 class="cta-title">Set it once.<br><em>Profit forever.</em></h2>
    <p class="cta-text">Spend 15 minutes setting up your notification flows and let Certxa handle every client communication from that moment on.</p>
    <div class="cta-actions">
      <a href="/auth?mode=register" class="btn btn-gold">Start Free Trial</a>
      <a href="/online-booking" class="btn btn-outline-white">Explore Online Booking</a>
    </div>
    <p class="cta-note">Credit card required · No charge until trial ends &middot; Unlimited notifications included</p>
  </div>
</section>

<?php require 'includes/footer.php'; ?>
