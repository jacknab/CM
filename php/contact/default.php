<?php
define('BRAND_NAME',    'Certxa');
define('PAGE_TITLE',    'Certxa Support | Contact Us');
define('PAGE_DESC',     'Get in touch with the Certxa support team. Reach us by phone, email, or live chat. Available Monday–Friday 9am–6pm ET. Toll-free support for all Certxa customers.');
define('PAGE_KEYWORDS', 'certxa contact, certxa support, nail salon software help, certxa phone number, certxa customer service, nail salon software support');
define('PAGE_CANONICAL', 'https://certxa.com/contact');
define('PAGE_BREADCRUMBS', json_encode([
  ['name'=>'Home','url'=>'https://certxa.com/'],
  ['name'=>'Contact','url'=>'https://certxa.com/contact'],
]));
define('PAGE_SCHEMA', json_encode([
  [
    '@type'       => 'ContactPage',
    '@id'         => 'https://certxa.com/contact',
    'name'        => 'Contact Certxa Support',
    'url'         => 'https://certxa.com/contact',
    'isPartOf'    => ['@id'=>'https://certxa.com/#website'],
  ],
]));
// Note: the site-wide Organization node (with telephone/hoursAvailable) is
// injected once by includes/header.php under @id "#organization" — do not
// duplicate it here with a different @id, or entity resolution splits.
require 'includes/header.php';
require 'includes/nav.php';
?>

<!-- ── HERO ─────────────────────────────────────────────── -->
<section style="background:linear-gradient(160deg,#1a0033 0%,#2d0057 50%,#1a0033 100%);padding:100px 0 80px;position:relative;overflow:hidden;">
  <!-- Orbs -->
  <div style="position:absolute;top:-120px;right:-80px;width:500px;height:500px;background:radial-gradient(circle,rgba(109,40,217,.2) 0%,transparent 65%);pointer-events:none;"></div>
  <div style="position:absolute;bottom:-80px;left:-60px;width:380px;height:380px;background:radial-gradient(circle,rgba(245,158,11,.09) 0%,transparent 65%);pointer-events:none;"></div>

  <div class="container" style="text-align:center;position:relative;z-index:1;">
    <span class="tag" style="background:rgba(255,255,255,.1);color:rgba(255,255,255,.75);margin-bottom:24px;display:inline-block;">Customer Support</span>
    <h1 style="font-family:'Cormorant Garamond',serif;font-size:clamp(3rem,6vw,5.5rem);font-weight:700;color:#fff;letter-spacing:-.03em;line-height:1.05;margin-bottom:20px;">
      We're here<br><em style="background:linear-gradient(135deg,#F59E0B,#FBBF24);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;">to help.</em>
    </h1>
    <p style="font-size:1.12rem;color:rgba(255,255,255,.62);max-width:480px;margin:0 auto 36px;line-height:1.75;">
      Your success is our priority. Our team is on hand Monday–Friday to help you get the most from Certxa.
    </p>

    <!-- Toll-free number -->
    <a href="tel:+18002784392" style="display:inline-flex;align-items:center;gap:12px;background:rgba(255,255,255,.08);border:1.5px solid rgba(255,255,255,.18);border-radius:60px;padding:14px 32px;color:#fff;font-size:1.08rem;font-weight:600;letter-spacing:.01em;transition:.2s;" onmouseover="this.style.background='rgba(255,255,255,.14)'" onmouseout="this.style.background='rgba(255,255,255,.08)'">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#F59E0B" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.81 19.79 19.79 0 01.06 1.24 2 2 0 012 .06h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.09 7.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 14.92v2z"/></svg>
      1 (800) 278-4392 &nbsp;<span style="font-weight:400;color:rgba(255,255,255,.45);font-size:.88rem;">Toll-Free</span>
    </a>

    <!-- Hours -->
    <div style="margin-top:20px;color:rgba(255,255,255,.45);font-size:.88rem;display:flex;align-items:center;justify-content:center;gap:8px;">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
      Monday – Friday &nbsp;·&nbsp; 9:00 am – 6:00 pm ET &nbsp;·&nbsp; Closed weekends
    </div>
  </div>
</section>

<!-- ── CONTACT CHANNELS ───────────────────────────────────── -->
<section class="section" style="background:var(--cream);padding:72px 0;">
  <div class="container">
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:24px;" class="contact-channels-grid">

      <!-- Phone -->
      <div style="background:#fff;border-radius:20px;padding:36px 28px;border:1.5px solid var(--light-grey);box-shadow:0 4px 24px rgba(59,7,100,.06);text-align:center;">
        <div style="width:56px;height:56px;background:linear-gradient(135deg,var(--plum),#6d28d9);border-radius:16px;display:flex;align-items:center;justify-content:center;margin:0 auto 20px;">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.81 19.79 19.79 0 01.06 1.24 2 2 0 012 .06h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.09 7.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 14.92v2z"/></svg>
        </div>
        <h3 style="font-family:'Cormorant Garamond',serif;font-size:1.35rem;font-weight:600;color:var(--plum);margin-bottom:10px;">Call Us</h3>
        <p style="font-size:.88rem;color:var(--mid-grey);line-height:1.65;margin-bottom:20px;">Speak directly with a Certxa specialist. Fastest way to resolve urgent issues.</p>
        <a href="tel:+18002784392" style="font-size:1.1rem;font-weight:700;color:var(--plum);display:block;margin-bottom:6px;">1 (800) 278-4392</a>
        <div style="font-size:.78rem;color:var(--mid-grey);">Toll-free · Mon–Fri 9am–6pm ET</div>
      </div>

      <!-- Live Chat -->
      <div style="background:var(--plum);border-radius:20px;padding:36px 28px;text-align:center;position:relative;overflow:hidden;box-shadow:0 12px 40px rgba(59,7,100,.35);">
        <div style="position:absolute;top:-40px;right:-40px;width:160px;height:160px;background:rgba(255,255,255,.05);border-radius:50%;pointer-events:none;"></div>
        <div style="width:56px;height:56px;background:rgba(255,255,255,.15);border-radius:16px;display:flex;align-items:center;justify-content:center;margin:0 auto 20px;border:1px solid rgba(255,255,255,.2);">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
        </div>
        <h3 style="font-family:'Cormorant Garamond',serif;font-size:1.35rem;font-weight:600;color:#fff;margin-bottom:10px;">Live Chat</h3>
        <p style="font-size:.88rem;color:rgba(255,255,255,.65);line-height:1.65;margin-bottom:24px;">Chat with us right inside the Certxa app or on this page. Average response under 2 minutes.</p>
        <span style="background:rgba(255,255,255,.15);border:1px solid rgba(255,255,255,.25);color:#fff;padding:3px 12px;border-radius:50px;font-size:.72rem;font-weight:600;letter-spacing:.08em;text-transform:uppercase;display:inline-block;margin-bottom:16px;">Mon–Fri · 9am–6pm ET</span>
        <br>
        <button onclick="certxaChatOpen()" class="btn btn-gold" style="margin-top:4px;display:inline-block;border:none;cursor:pointer;">Start Live Chat</button>
      </div>

      <!-- Email -->
      <div style="background:#fff;border-radius:20px;padding:36px 28px;border:1.5px solid var(--light-grey);box-shadow:0 4px 24px rgba(59,7,100,.06);text-align:center;">
        <div style="width:56px;height:56px;background:linear-gradient(135deg,#B45309,#F59E0B);border-radius:16px;display:flex;align-items:center;justify-content:center;margin:0 auto 20px;">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
        </div>
        <h3 style="font-family:'Cormorant Garamond',serif;font-size:1.35rem;font-weight:600;color:var(--plum);margin-bottom:10px;">Email Support</h3>
        <p style="font-size:.88rem;color:var(--mid-grey);line-height:1.65;margin-bottom:20px;">Send us a message and we'll reply within one business day — usually much faster.</p>
        <a href="mailto:support@certxa.com" style="font-size:1rem;font-weight:700;color:var(--gold);display:block;margin-bottom:6px;">support@certxa.com</a>
        <div style="font-size:.78rem;color:var(--mid-grey);">Response within 1 business day</div>
      </div>

    </div>
  </div>
</section>

<!-- ── HOURS & CONTACT FORM ───────────────────────────────── -->
<section class="section" style="padding:80px 0;">
  <div class="container">
    <div style="display:grid;grid-template-columns:1fr 1.4fr;gap:64px;align-items:start;" class="contact-form-grid">

      <!-- Left: hours + info -->
      <div>
        <span class="tag tag-plum" style="margin-bottom:16px;display:inline-block;">Support Hours</span>
        <h2 style="font-family:'Cormorant Garamond',serif;font-size:2.4rem;font-weight:700;color:var(--plum);letter-spacing:-.02em;line-height:1.15;margin-bottom:20px;">
          Real people,<br>ready to help.
        </h2>
        <p style="font-size:.97rem;color:var(--mid-grey);line-height:1.75;margin-bottom:36px;">
          Our support team is made up of nail industry experts who know your world. No scripts, no bots — just people who genuinely care about your business.
        </p>

        <!-- Hours table -->
        <div style="background:var(--cream);border-radius:16px;padding:24px;border:1.5px solid var(--light-grey);">
          <div style="font-size:.7rem;font-weight:700;text-transform:uppercase;letter-spacing:.12em;color:var(--mid-grey);margin-bottom:16px;">Support Hours (ET)</div>
          <?php
          $hours = [
            ['Monday',    '9:00 am – 6:00 pm', true],
            ['Tuesday',   '9:00 am – 6:00 pm', true],
            ['Wednesday', '9:00 am – 6:00 pm', true],
            ['Thursday',  '9:00 am – 6:00 pm', true],
            ['Friday',    '9:00 am – 6:00 pm', true],
            ['Saturday',  'Closed', false],
            ['Sunday',    'Closed', false],
          ];
          foreach ($hours as $h):
          ?>
          <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid var(--light-grey);<?= $h === end($hours) ? 'border-bottom:none;' : '' ?>">
            <span style="font-size:.88rem;font-weight:<?= $h[2] ? '500' : '400' ?>;color:<?= $h[2] ? 'var(--charcoal)' : 'var(--mid-grey)' ?>;"><?= $h[0] ?></span>
            <span style="font-size:.85rem;font-weight:600;color:<?= $h[2] ? 'var(--plum)' : 'var(--mid-grey)' ?>;"><?= $h[1] ?></span>
          </div>
          <?php endforeach; ?>
        </div>

        <div style="margin-top:24px;padding:16px 20px;background:rgba(59,7,100,.05);border-radius:12px;border-left:3px solid var(--plum);">
          <p style="font-size:.83rem;color:var(--mid-grey);line-height:1.6;margin:0;">
            <strong style="color:var(--plum);">Holiday notice:</strong> Support hours may vary on US public holidays. We'll always post updates inside the Certxa app.
          </p>
        </div>
      </div>

      <!-- Right: contact form -->
      <div style="background:#fff;border-radius:24px;padding:40px;border:1.5px solid var(--light-grey);box-shadow:0 8px 40px rgba(59,7,100,.08);">
        <h3 style="font-family:'Cormorant Garamond',serif;font-size:1.8rem;font-weight:700;color:var(--plum);margin-bottom:6px;">Send us a message</h3>
        <p style="font-size:.88rem;color:var(--mid-grey);margin-bottom:28px;">We'll get back to you within one business day.</p>

        <form style="display:flex;flex-direction:column;gap:18px;" onsubmit="handleContactForm(event)">
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
            <div>
              <label style="font-size:.78rem;font-weight:600;color:var(--charcoal);display:block;margin-bottom:6px;">First Name</label>
              <input type="text" placeholder="Sophie" required style="width:100%;padding:12px 14px;border:1.5px solid var(--light-grey);border-radius:10px;font-size:.9rem;color:var(--charcoal);outline:none;transition:.2s;font-family:'Inter',sans-serif;" onfocus="this.style.borderColor='var(--plum)'" onblur="this.style.borderColor='var(--light-grey)'">
            </div>
            <div>
              <label style="font-size:.78rem;font-weight:600;color:var(--charcoal);display:block;margin-bottom:6px;">Last Name</label>
              <input type="text" placeholder="Clarke" required style="width:100%;padding:12px 14px;border:1.5px solid var(--light-grey);border-radius:10px;font-size:.9rem;color:var(--charcoal);outline:none;transition:.2s;font-family:'Inter',sans-serif;" onfocus="this.style.borderColor='var(--plum)'" onblur="this.style.borderColor='var(--light-grey)'">
            </div>
          </div>

          <div>
            <label style="font-size:.78rem;font-weight:600;color:var(--charcoal);display:block;margin-bottom:6px;">Email Address</label>
            <input type="email" placeholder="sophie@blossomhair.com" required style="width:100%;padding:12px 14px;border:1.5px solid var(--light-grey);border-radius:10px;font-size:.9rem;color:var(--charcoal);outline:none;transition:.2s;font-family:'Inter',sans-serif;" onfocus="this.style.borderColor='var(--plum)'" onblur="this.style.borderColor='var(--light-grey)'">
          </div>

          <div>
            <label style="font-size:.78rem;font-weight:600;color:var(--charcoal);display:block;margin-bottom:6px;">Phone Number <span style="font-weight:400;color:var(--mid-grey);">(optional)</span></label>
            <input type="tel" placeholder="(555) 000-0000" style="width:100%;padding:12px 14px;border:1.5px solid var(--light-grey);border-radius:10px;font-size:.9rem;color:var(--charcoal);outline:none;transition:.2s;font-family:'Inter',sans-serif;" onfocus="this.style.borderColor='var(--plum)'" onblur="this.style.borderColor='var(--light-grey)'">
          </div>

          <div>
            <label style="font-size:.78rem;font-weight:600;color:var(--charcoal);display:block;margin-bottom:6px;">What can we help you with?</label>
            <select style="width:100%;padding:12px 14px;border:1.5px solid var(--light-grey);border-radius:10px;font-size:.9rem;color:var(--charcoal);outline:none;transition:.2s;background:#fff;font-family:'Inter',sans-serif;appearance:none;cursor:pointer;" onfocus="this.style.borderColor='var(--plum)'" onblur="this.style.borderColor='var(--light-grey)'">
              <option value="">Select a topic…</option>
              <option>Getting started / onboarding</option>
              <option>Billing or subscription</option>
              <option>Booking & scheduling</option>
              <option>Payments & card reader</option>
              <option>Website builder</option>
              <option>Account or login issues</option>
              <option>Feature request</option>
              <option>Other</option>
            </select>
          </div>

          <div>
            <label style="font-size:.78rem;font-weight:600;color:var(--charcoal);display:block;margin-bottom:6px;">Message</label>
            <textarea rows="5" placeholder="Tell us what's going on and we'll get you sorted…" required style="width:100%;padding:12px 14px;border:1.5px solid var(--light-grey);border-radius:10px;font-size:.9rem;color:var(--charcoal);outline:none;transition:.2s;font-family:'Inter',sans-serif;resize:vertical;line-height:1.6;" onfocus="this.style.borderColor='var(--plum)'" onblur="this.style.borderColor='var(--light-grey)'"></textarea>
          </div>

          <button type="submit" class="btn btn-primary" style="width:100%;padding:14px;font-size:.97rem;justify-content:center;text-align:center;" id="contact-submit-btn">
            Send Message
          </button>

          <p style="font-size:.75rem;color:var(--mid-grey);text-align:center;margin:0;">
            By submitting this form you agree to our <a href="/privacy" style="color:var(--plum);">Privacy Policy</a>. We'll never share your data.
          </p>
        </form>

        <!-- Success state (hidden by default) -->
        <div id="contact-success" style="display:none;text-align:center;padding:40px 20px;">
          <div style="width:64px;height:64px;background:linear-gradient(135deg,#059669,#10b981);border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 20px;">
            <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
          </div>
          <h4 style="font-family:'Cormorant Garamond',serif;font-size:1.6rem;color:var(--plum);margin-bottom:10px;">Message received!</h4>
          <p style="font-size:.9rem;color:var(--mid-grey);line-height:1.65;">We'll be in touch within one business day. If it's urgent, call us on <strong>1 (800) 278-4392</strong>.</p>
        </div>
      </div>
    </div>
  </div>
</section>

<!-- ── FAQ ───────────────────────────────────────────────── -->
<section class="section section-alt" style="background:var(--cream);padding:72px 0;">
  <div class="container">
    <div class="section-header">
      <span class="tag tag-plum">Quick Answers</span>
      <h2 class="section-title">Common questions</h2>
    </div>
    <div style="max-width:720px;margin:0 auto;display:flex;flex-direction:column;gap:4px;">
      <?php
      $faqs = [
        ['How quickly will I get a response?', 'Phone and live chat are answered in real time during business hours. Email tickets are responded to within one business day — usually the same day.'],
        ['Is the support line really toll-free?', 'Yes. Calls to 1 (800) 278-4392 are completely free from any US or Canadian phone number, including mobile.'],
        ['Do you offer support outside the US?', 'Our primary support team operates in ET, but you can always reach us via email at support@certxa.com regardless of your time zone.'],
        ['Can I get help setting up my account?', 'Absolutely. Our onboarding team offers free 1-on-1 setup calls for all new Certxa customers. Just select "Getting started / onboarding" in the form above and we\'ll reach out to schedule.'],
        ['What if I have an urgent issue outside business hours?', 'Our Help Centre at certxa.com/help has step-by-step guides for the most common issues. For payment emergencies, our payment processor provides 24/7 urgent support.'],
      ];
      foreach ($faqs as $i => $faq):
      ?>
      <details style="background:#fff;border-radius:14px;border:1.5px solid var(--light-grey);overflow:hidden;" open="<?= $i === 0 ? 'open' : '' ?>">
        <summary style="padding:20px 24px;font-size:.97rem;font-weight:600;color:var(--charcoal);cursor:pointer;display:flex;justify-content:space-between;align-items:center;list-style:none;user-select:none;">
          <?= $faq[0] ?>
          <span style="font-size:1.2rem;color:var(--plum);flex-shrink:0;margin-left:16px;transition:.2s;">+</span>
        </summary>
        <div style="padding:0 24px 20px;font-size:.9rem;color:var(--mid-grey);line-height:1.75;border-top:1px solid var(--light-grey);">
          <div style="padding-top:16px;"><?= $faq[1] ?></div>
        </div>
      </details>
      <?php endforeach; ?>
    </div>
  </div>
</section>

<!-- ── CTA ───────────────────────────────────────────────── -->
<section class="cta-section">
  <div class="container" style="position:relative;z-index:1;">
    <span class="tag" style="background:rgba(255,255,255,.15);color:#fff;margin-bottom:16px;display:inline-block;">Start Today</span>
    <h2 class="cta-title">Not a Certxa customer yet?<br><em>Start your <?= TRIAL_DAYS ?>-day free trial.</em></h2>
    <p class="cta-text">The all-in-one platform built exclusively for nail studios and nail technicians.</p>
    <div class="cta-actions">
      <a href="/auth?mode=register" class="btn btn-gold">Start Free Trial</a>
      <a href="/pricing" class="btn btn-outline-white">View Pricing</a>
    </div>
    <p class="cta-note">Credit card required · No charge until trial ends &middot; Cancel any time</p>
  </div>
</section>

<script>
function handleContactForm(e) {
  e.preventDefault();
  const btn = document.getElementById('contact-submit-btn');
  btn.textContent = 'Sending…';
  btn.disabled = true;
  setTimeout(() => {
    e.target.style.display = 'none';
    document.getElementById('contact-success').style.display = 'block';
  }, 1200);
}
</script>

<style>
@media (max-width: 900px) {
  .contact-channels-grid { grid-template-columns: 1fr !important; max-width: 480px; margin: 0 auto; }
  .contact-form-grid     { grid-template-columns: 1fr !important; }
}
@media (max-width: 640px) {
  .contact-form-grid > div:last-child form > div:first-child { grid-template-columns: 1fr !important; }
}
</style>

<!-- ── LIVE CHAT OVERLAY ─────────────────────────────────────────────────── -->
<div id="certxa-chat-overlay" style="display:none;position:fixed;inset:0;z-index:9998;background:rgba(0,0,0,.45);backdrop-filter:blur(3px);" onclick="if(event.target===this)certxaChatClose()"></div>

<div id="certxa-chat-panel" style="display:none;position:fixed;bottom:24px;right:24px;width:380px;max-height:88vh;z-index:9999;display:none;flex-direction:column;border-radius:20px;overflow:hidden;box-shadow:0 28px 64px rgba(0,0,0,.42),0 0 0 1px rgba(255,255,255,.07);transform-origin:bottom right;transition:transform 220ms cubic-bezier(.4,0,.2,1),opacity 180ms ease;transform:scale(.88);opacity:0;pointer-events:none;">

  <!-- Header -->
  <div style="background:linear-gradient(135deg,#1e1b4b 0%,#312e81 100%);padding:14px 16px;display:flex;align-items:center;gap:12px;flex-shrink:0;">
    <div style="width:36px;height:36px;border-radius:50%;background:rgba(139,92,246,.35);display:flex;align-items:center;justify-content:center;flex-shrink:0;">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#c4b5fd" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
    </div>
    <div style="flex:1;min-width:0;">
      <p style="color:#fff;font-size:14px;font-weight:700;margin:0;line-height:1.2;">Chat with Certxa Support</p>
      <p id="certxa-chat-status-text" style="color:#a5b4fc;font-size:11px;margin:0;margin-top:2px;">We're here to help</p>
    </div>
    <button onclick="certxaChatClose()" title="Close" style="background:none;border:none;cursor:pointer;color:rgba(255,255,255,.55);padding:4px 6px;border-radius:6px;display:flex;align-items:center;" onmouseover="this.style.color='#fff'" onmouseout="this.style.color='rgba(255,255,255,.55)'">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
    </button>
  </div>

  <!-- Start form -->
  <div id="certxa-chat-form" style="flex:1;background:#fff;padding:24px;overflow-y:auto;">
    <p style="font-size:14px;color:#374151;margin:0 0 20px;line-height:1.6;">Hi there 👋 Start a conversation and a support agent will be with you shortly.</p>
    <div style="display:flex;flex-direction:column;gap:12px;">
      <div>
        <label style="font-size:11px;font-weight:600;color:#6b7280;display:block;margin-bottom:4px;text-transform:uppercase;letter-spacing:.06em;">Your Name <span style="color:#ef4444;">*</span></label>
        <input id="certxa-chat-name" type="text" placeholder="Sophie Clarke" style="width:100%;padding:10px 12px;border:1.5px solid #e5e7eb;border-radius:10px;font-size:14px;color:#111;outline:none;box-sizing:border-box;font-family:inherit;" onfocus="this.style.borderColor='#6d28d9'" onblur="this.style.borderColor='#e5e7eb'">
      </div>
      <div>
        <label style="font-size:11px;font-weight:600;color:#6b7280;display:block;margin-bottom:4px;text-transform:uppercase;letter-spacing:.06em;">Email <span style="font-weight:400;color:#9ca3af;">(optional)</span></label>
        <input id="certxa-chat-email" type="email" placeholder="sophie@example.com" style="width:100%;padding:10px 12px;border:1.5px solid #e5e7eb;border-radius:10px;font-size:14px;color:#111;outline:none;box-sizing:border-box;font-family:inherit;" onfocus="this.style.borderColor='#6d28d9'" onblur="this.style.borderColor='#e5e7eb'">
      </div>
      <div>
        <label style="font-size:11px;font-weight:600;color:#6b7280;display:block;margin-bottom:4px;text-transform:uppercase;letter-spacing:.06em;">How can we help?</label>
        <textarea id="certxa-chat-subject" rows="3" placeholder="Describe your question or issue…" style="width:100%;padding:10px 12px;border:1.5px solid #e5e7eb;border-radius:10px;font-size:14px;color:#111;outline:none;resize:none;box-sizing:border-box;font-family:inherit;line-height:1.55;" onfocus="this.style.borderColor='#6d28d9'" onblur="this.style.borderColor='#e5e7eb'"></textarea>
      </div>
      <p id="certxa-chat-form-error" style="display:none;color:#ef4444;font-size:12px;margin:0;"></p>
      <button onclick="certxaChatStart()" id="certxa-chat-start-btn" style="width:100%;padding:12px;background:linear-gradient(135deg,#6d28d9,#7c3aed);color:#fff;border:none;border-radius:10px;font-size:14px;font-weight:700;cursor:pointer;transition:opacity .15s;font-family:inherit;" onmouseover="this.style.opacity='.88'" onmouseout="this.style.opacity='1'">Start Chat</button>
    </div>
  </div>

  <!-- Chat view (hidden until session starts) -->
  <div id="certxa-chat-view" style="display:none;flex:1;flex-direction:column;background:#fff;overflow:hidden;">
    <!-- Queue / connecting banner -->
    <div id="certxa-chat-queue-banner" style="background:#eff6ff;border-bottom:1px solid #bfdbfe;padding:10px 16px;font-size:12px;color:#1e40af;display:flex;align-items:center;gap:8px;flex-shrink:0;">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
      <span id="certxa-chat-queue-text">Connecting you to an agent…</span>
    </div>
    <!-- Messages -->
    <div id="certxa-chat-messages" style="flex:1;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:10px;"></div>
    <!-- Typing indicator -->
    <div id="certxa-chat-typing" style="display:none;padding:4px 16px 8px;font-size:12px;color:#9ca3af;font-style:italic;flex-shrink:0;">Agent is typing…</div>
    <!-- Input bar -->
    <div id="certxa-chat-input-bar" style="padding:12px 16px;border-top:1px solid #f3f4f6;display:flex;gap:8px;flex-shrink:0;background:#fff;">
      <input id="certxa-chat-input" type="text" placeholder="Type a message…" maxlength="2000" style="flex:1;padding:10px 14px;border:1.5px solid #e5e7eb;border-radius:24px;font-size:14px;color:#111;outline:none;font-family:inherit;" onfocus="this.style.borderColor='#6d28d9'" onblur="this.style.borderColor='#e5e7eb'" onkeydown="if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();certxaChatSend();}">
      <button onclick="certxaChatSend()" style="width:40px;height:40px;border-radius:50%;background:linear-gradient(135deg,#6d28d9,#7c3aed);border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;" title="Send">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
      </button>
    </div>
    <!-- Closed state -->
    <div id="certxa-chat-closed-bar" style="display:none;padding:12px 16px;border-top:1px solid #f3f4f6;background:#f9fafb;text-align:center;font-size:12px;color:#6b7280;flex-shrink:0;">
      This chat has ended. <button onclick="certxaChatReset()" style="background:none;border:none;color:#6d28d9;font-weight:700;cursor:pointer;font-size:12px;font-family:inherit;">Start a new chat</button>
    </div>
  </div>

</div>

<script>
(function () {
  var chatId = null, ws = null, visitorName = '';
  var panelEl   = document.getElementById('certxa-chat-panel');
  var overlayEl = document.getElementById('certxa-chat-overlay');

  function setStatus(txt) {
    var el = document.getElementById('certxa-chat-status-text');
    if (el) el.textContent = txt;
  }

  function showPanel() {
    panelEl.style.display = 'flex';
    overlayEl.style.display = 'block';
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        panelEl.style.transform = 'scale(1)';
        panelEl.style.opacity = '1';
        panelEl.style.pointerEvents = 'auto';
      });
    });
  }

  function hidePanel() {
    panelEl.style.transform = 'scale(.88)';
    panelEl.style.opacity = '0';
    panelEl.style.pointerEvents = 'none';
    overlayEl.style.display = 'none';
    setTimeout(function () { panelEl.style.display = 'none'; }, 230);
  }

  window.certxaChatOpen = function () {
    showPanel();
    setTimeout(function () {
      var inp = document.getElementById('certxa-chat-name');
      if (inp) inp.focus();
    }, 250);
  };

  window.certxaChatClose = function () {
    hidePanel();
  };

  window.certxaChatReset = function () {
    if (ws) { try { ws.close(); } catch (_) {} ws = null; }
    chatId = null; visitorName = '';
    document.getElementById('certxa-chat-name').value = '';
    document.getElementById('certxa-chat-email').value = '';
    document.getElementById('certxa-chat-subject').value = '';
    document.getElementById('certxa-chat-messages').innerHTML = '';
    document.getElementById('certxa-chat-queue-banner').style.display = 'flex';
    document.getElementById('certxa-chat-closed-bar').style.display = 'none';
    document.getElementById('certxa-chat-input-bar').style.display = 'flex';
    document.getElementById('certxa-chat-form').style.display = 'block';
    document.getElementById('certxa-chat-view').style.display = 'none';
    setStatus('We\'re here to help');
  };

  window.certxaChatStart = function () {
    var nameEl    = document.getElementById('certxa-chat-name');
    var emailEl   = document.getElementById('certxa-chat-email');
    var subjectEl = document.getElementById('certxa-chat-subject');
    var errEl     = document.getElementById('certxa-chat-form-error');
    var btn       = document.getElementById('certxa-chat-start-btn');

    var name = nameEl.value.trim();
    if (!name) {
      errEl.textContent = 'Please enter your name.';
      errEl.style.display = 'block';
      nameEl.focus();
      return;
    }
    errEl.style.display = 'none';
    visitorName = name;

    btn.textContent = 'Connecting…';
    btn.disabled = true;

    fetch('/api/live-chat/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        visitorName: name,
        visitorEmail: emailEl.value.trim() || null,
        subject: subjectEl.value.trim() || null,
        pageUrl: window.location.href,
      }),
    })
    .then(function (r) { return r.json(); })
    .then(function (data) {
      if (!data.chatId) throw new Error('No chatId');
      chatId = data.chatId;

      // Switch to chat view
      document.getElementById('certxa-chat-form').style.display = 'none';
      var view = document.getElementById('certxa-chat-view');
      view.style.display = 'flex';

      var pos = data.queuePosition || 1;
      var wait = data.estimatedWaitMin ? ('~' + data.estimatedWaitMin + ' min wait') : '';
      document.getElementById('certxa-chat-queue-text').textContent =
        'You\'re #' + pos + ' in queue' + (wait ? ' · ' + wait : '') + '. An agent will be with you shortly.';
      setStatus('In queue…');

      // Append system welcome message
      appendMessage('system', 'Hi ' + name + '! You\'re in the queue. We\'ll be right with you.');

      connectWs();
    })
    .catch(function (err) {
      btn.textContent = 'Start Chat';
      btn.disabled = false;
      errEl.textContent = 'Could not start chat. Please try again.';
      errEl.style.display = 'block';
    });
  };

  function connectWs() {
    var proto  = location.protocol === 'https:' ? 'wss' : 'ws';
    var wsUrl  = proto + '://' + location.host + '/ws/live-chat?role=visitor&chatId=' + encodeURIComponent(chatId);
    ws = new WebSocket(wsUrl);

    ws.onopen = function () { /* connected */ };

    ws.onmessage = function (e) {
      try {
        var msg = JSON.parse(e.data);
      } catch (_) { return; }

      if (msg.type === 'message') {
        hideBanner();
        appendMessage('agent', msg.content, msg.agentName);
      } else if (msg.type === 'assigned') {
        hideBanner();
        setStatus('Connected · ' + (msg.agentName || 'Support Agent'));
        appendAgentJoined(msg.agentName || 'A support agent');
        document.getElementById('certxa-chat-input').focus();
      } else if (msg.type === 'transferred') {
        var who = msg.agentName || (msg.departmentName ? msg.departmentName + ' team' : 'another agent');
        appendMessage('system', 'Chat transferred to ' + who + '.');
        setStatus('Connected · ' + who);
      } else if (msg.type === 'typing') {
        document.getElementById('certxa-chat-typing').style.display = msg.isTyping ? 'block' : 'none';
      } else if (msg.type === 'closed') {
        setStatus('Chat ended');
        appendMessage('system', 'Chat closed. Thanks for contacting Certxa support!');
        document.getElementById('certxa-chat-input-bar').style.display = 'none';
        document.getElementById('certxa-chat-closed-bar').style.display = 'block';
        document.getElementById('certxa-chat-queue-banner').style.display = 'none';
        document.getElementById('certxa-chat-typing').style.display = 'none';
      }
    };

    ws.onclose = function () { ws = null; };
    ws.onerror = function () { ws = null; };
  }

  function hideBanner() {
    document.getElementById('certxa-chat-queue-banner').style.display = 'none';
  }

  function appendMessage(role, content, senderName) {
    var messagesEl = document.getElementById('certxa-chat-messages');
    var wrap = document.createElement('div');

    if (role === 'system') {
      wrap.style.cssText = 'text-align:center;';
      var span = document.createElement('span');
      span.style.cssText = 'font-size:11px;color:#9ca3af;background:#f3f4f6;border-radius:20px;padding:3px 10px;display:inline-block;';
      span.textContent = content;
      wrap.appendChild(span);
    } else if (role === 'visitor') {
      wrap.style.cssText = 'display:flex;justify-content:flex-end;';
      var bubble = document.createElement('div');
      bubble.style.cssText = 'max-width:75%;background:linear-gradient(135deg,#6d28d9,#7c3aed);color:#fff;border-radius:18px 18px 4px 18px;padding:10px 14px;font-size:14px;line-height:1.5;word-break:break-word;';
      bubble.textContent = content;
      wrap.appendChild(bubble);
    } else {
      wrap.style.cssText = 'display:flex;flex-direction:column;align-items:flex-start;gap:3px;';
      if (senderName) {
        var nameSpan = document.createElement('span');
        nameSpan.style.cssText = 'font-size:11px;font-weight:600;color:#6b7280;padding-left:4px;';
        nameSpan.textContent = senderName;
        wrap.appendChild(nameSpan);
      }
      var bubble = document.createElement('div');
      bubble.style.cssText = 'max-width:75%;background:#f3f4f6;color:#111827;border-radius:18px 18px 18px 4px;padding:10px 14px;font-size:14px;line-height:1.5;word-break:break-word;';
      bubble.textContent = content;
      wrap.appendChild(bubble);
    }

    messagesEl.appendChild(wrap);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function appendAgentJoined(agentName) {
    var messagesEl = document.getElementById('certxa-chat-messages');
    var wrap = document.createElement('div');
    wrap.style.cssText = 'display:flex;align-items:center;gap:10px;padding:4px 0;';

    var avatar = document.createElement('div');
    avatar.style.cssText = 'width:32px;height:32px;border-radius:50%;background:linear-gradient(135deg,#6d28d9,#7c3aed);display:flex;align-items:center;justify-content:center;flex-shrink:0;';
    avatar.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>';

    var textBlock = document.createElement('div');
    textBlock.style.cssText = 'flex:1;';

    var nameEl = document.createElement('p');
    nameEl.style.cssText = 'font-size:13px;font-weight:700;color:#111827;margin:0;line-height:1.3;';
    nameEl.textContent = agentName + ' joined';

    var subEl = document.createElement('p');
    subEl.style.cssText = 'font-size:11px;color:#6b7280;margin:2px 0 0;';
    subEl.textContent = 'Support agent · ready to help';

    textBlock.appendChild(nameEl);
    textBlock.appendChild(subEl);
    wrap.appendChild(avatar);
    wrap.appendChild(textBlock);

    // Separator line above
    var sep = document.createElement('div');
    sep.style.cssText = 'border-top:1px solid #f3f4f6;margin:4px 0;';
    messagesEl.appendChild(sep);
    messagesEl.appendChild(wrap);

    var sep2 = document.createElement('div');
    sep2.style.cssText = 'border-top:1px solid #f3f4f6;margin:4px 0;';
    messagesEl.appendChild(sep2);

    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  window.certxaChatSend = function () {
    var input = document.getElementById('certxa-chat-input');
    var content = input.value.trim();
    if (!content || !ws || ws.readyState !== 1) return;
    ws.send(JSON.stringify({ type: 'message', content: content }));
    appendMessage('visitor', content);
    input.value = '';
    input.focus();
  };
})();
</script>

<?php require 'includes/footer.php'; ?>
