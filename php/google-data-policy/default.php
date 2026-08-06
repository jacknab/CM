<?php
define('BRAND_NAME',     'Certxa');
define('PAGE_TITLE',     'Google Data Policy | How Certxa Uses Google Business Profile Data');
define('PAGE_DESC',      'Certxa uses Google Business Profile API access only to manage your business listing, sync reviews, and update listing information — all on your behalf and with your explicit consent. Learn exactly what we access, how it is used, and how to revoke access instantly.');
define('PAGE_KEYWORDS',  'certxa google data policy, google business profile api, certxa google permissions, revoke google access certxa');
define('PAGE_CANONICAL', 'https://certxa.com/google-data-policy');
define('PAGE_BREADCRUMBS', json_encode([
  ['name'=>'Home',               'url'=>'https://certxa.com/'],
  ['name'=>'Google Data Policy', 'url'=>'https://certxa.com/google-data-policy'],
]));
require 'includes/header.php';
require 'includes/nav.php';
?>

<style>
.gdp-hero {
  background: linear-gradient(135deg, #065f46 0%, #0f766e 100%);
  padding: 80px 24px 60px;
  text-align: center;
  color: #fff;
}
.gdp-hero h1 {
  font-family: 'Inter', sans-serif;
  font-size: clamp(1.8rem, 4vw, 2.6rem);
  font-weight: 800;
  letter-spacing: -.03em;
  margin: 0 0 14px;
}
.gdp-hero p {
  color: rgba(255,255,255,.75);
  font-size: 1rem;
  margin: 0;
  font-family: 'Inter', sans-serif;
  max-width: 560px;
  margin: 0 auto;
  line-height: 1.6;
}
.gdp-hero .g-badge {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  background: rgba(255,255,255,.15);
  border: 1px solid rgba(255,255,255,.3);
  border-radius: 999px;
  padding: 6px 16px;
  font-size: .82rem;
  font-weight: 600;
  color: #fff;
  margin-bottom: 20px;
  letter-spacing: .02em;
}
.gdp-wrap {
  max-width: 820px;
  margin: 0 auto;
  padding: 60px 24px 100px;
  font-family: 'Inter', sans-serif;
  color: #1e293b;
  line-height: 1.75;
}
/* Quick-answer cards */
.qa-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
  margin: 32px 0 48px;
}
@media (max-width: 600px) { .qa-grid { grid-template-columns: 1fr; } }
.qa-card {
  background: #fff;
  border: 1.5px solid #e2e8f0;
  border-radius: 14px;
  padding: 22px 24px;
  box-shadow: 0 2px 8px rgba(0,0,0,.04);
}
.qa-card .q {
  font-size: .72rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: .08em;
  color: #64748b;
  margin: 0 0 8px;
}
.qa-card .a {
  font-size: .95rem;
  font-weight: 700;
  color: #0f172a;
  margin: 0;
  line-height: 1.4;
}
.qa-card .a.green { color: #15803d; }
.qa-card .a.blue  { color: #1e40af; }
/* Section styles */
.gdp-wrap h2 {
  font-size: 1.25rem;
  font-weight: 700;
  color: #0f172a;
  margin: 48px 0 12px;
  letter-spacing: -.02em;
  padding-bottom: 10px;
  border-bottom: 2px solid #f1f5f9;
}
.gdp-wrap h3 {
  font-size: 1rem;
  font-weight: 700;
  color: #0f172a;
  margin: 24px 0 8px;
}
.gdp-wrap p, .gdp-wrap li { font-size: .95rem; color: #334155; }
.gdp-wrap ul { margin: 10px 0 16px; padding-left: 22px; }
.gdp-wrap li { margin-bottom: 6px; }
.gdp-wrap a { color: #1d4ed8; text-decoration: none; }
.gdp-wrap a:hover { text-decoration: underline; }
/* Callout boxes */
.yes-box {
  background: #f0fdf4;
  border: 1.5px solid #86efac;
  border-radius: 12px;
  padding: 20px 24px;
  margin: 16px 0;
}
.yes-box h3 { color: #15803d; margin: 0 0 10px; }
.yes-box p, .yes-box li { color: #166534; font-size: .93rem; }
.yes-box ul { margin: 8px 0; }
.no-box {
  background: #fef9f0;
  border: 1.5px solid #fcd34d;
  border-radius: 12px;
  padding: 20px 24px;
  margin: 16px 0;
}
.no-box h3 { color: #92400e; margin: 0 0 10px; }
.no-box p, .no-box li { color: #78350f; font-size: .93rem; }
.no-box ul { margin: 8px 0; }
/* Disconnect CTA */
.disconnect-box {
  background: #eff6ff;
  border: 1.5px solid #bfdbfe;
  border-radius: 14px;
  padding: 28px 32px;
  margin: 32px 0;
  display: flex;
  align-items: flex-start;
  gap: 20px;
}
.disconnect-box .icon {
  font-size: 2rem;
  flex-shrink: 0;
  margin-top: 2px;
}
.disconnect-box h3 { color: #1e3a8a; margin: 0 0 6px; }
.disconnect-box p  { color: #1e40af; font-size: .93rem; margin: 0 0 14px; }
.disconnect-box a.btn-revoke {
  display: inline-block;
  background: #1d4ed8;
  color: #fff;
  font-weight: 700;
  font-size: .875rem;
  padding: 10px 22px;
  border-radius: 999px;
  text-decoration: none;
  transition: background .15s;
  margin-right: 10px;
}
.disconnect-box a.btn-revoke:hover { background: #1e40af; text-decoration: none; }
.disconnect-box a.btn-dash {
  display: inline-block;
  color: #1d4ed8;
  font-weight: 600;
  font-size: .875rem;
  padding: 10px 18px;
  border-radius: 999px;
  border: 1.5px solid #93c5fd;
  text-decoration: none;
  background: #fff;
  transition: background .15s;
}
.disconnect-box a.btn-dash:hover { background: #dbeafe; text-decoration: none; }
/* Scope table */
.scope-table {
  width: 100%;
  border-collapse: collapse;
  margin: 16px 0 24px;
  font-size: .9rem;
}
.scope-table th {
  background: #f8fafc;
  border-bottom: 2px solid #e2e8f0;
  padding: 10px 14px;
  text-align: left;
  font-weight: 700;
  color: #0f172a;
}
.scope-table td {
  padding: 10px 14px;
  border-bottom: 1px solid #f1f5f9;
  color: #475569;
  vertical-align: top;
}
.scope-table td:first-child { font-weight: 600; color: #0f172a; }
.badge-scope {
  display: inline-block;
  background: #ede9fe;
  color: #6d28d9;
  font-size: .75rem;
  font-weight: 700;
  padding: 2px 10px;
  border-radius: 999px;
  letter-spacing: .03em;
}
.badge-yes { background:#dcfce7; color:#15803d; }
.badge-no  { background:#fee2e2; color:#991b1b; }
/* Not Google box */
.not-google {
  background: #0f172a;
  color: #fff;
  border-radius: 14px;
  padding: 28px 32px;
  margin: 32px 0;
}
.not-google h3 { color: #f8fafc; margin: 0 0 10px; font-size: 1.1rem; }
.not-google p  { color: rgba(255,255,255,.7); font-size: .93rem; margin: 0; line-height: 1.7; }
</style>

<div class="gdp-hero">
  <div class="g-badge">
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12.48 10.92v3.28h7.84c-.24 1.84-.853 3.187-1.787 4.133-1.147 1.147-2.933 2.4-6.053 2.4-4.827 0-8.6-3.893-8.6-8.72s3.773-8.72 8.6-8.72c2.6 0 4.507 1.027 5.907 2.347l2.307-2.307C18.747 1.44 16.133 0 12.48 0 5.867 0 .307 5.387.307 12s5.56 12 12.173 12c3.573 0 6.267-1.173 8.373-3.36 2.16-2.16 2.84-5.213 2.84-7.667 0-.76-.053-1.467-.173-2.053H12.48z"/></svg>
    Google Business Profile — Data Policy
  </div>
  <h1>How Certxa Uses Your<br>Google Business Profile</h1>
  <p>Certxa helps nail studio and salon owners manage their bookings and Google Business Profile from one dashboard. This page explains exactly what Google data we access, why, and how to revoke access at any time.</p>
</div>

<div class="gdp-wrap">

  <!-- Quick-answer grid -->
  <div class="qa-grid">
    <div class="qa-card">
      <p class="q">What does Certxa do?</p>
      <p class="a green">Certxa helps service businesses manage bookings and their Google Business Profile listing from one dashboard.</p>
    </div>
    <div class="qa-card">
      <p class="q">Why does Certxa need Google data?</p>
      <p class="a blue">To sync your business listing info and public reviews so you can manage and respond to them inside Certxa — without leaving the dashboard.</p>
    </div>
    <div class="qa-card">
      <p class="q">What happens to your data?</p>
      <p class="a">Your Google Business Profile data is used only to operate the Certxa integration for you. It is never sold, shared with third parties, or used for advertising.</p>
    </div>
    <div class="qa-card">
      <p class="q">Can you disconnect instantly?</p>
      <p class="a green">Yes. Disconnect from your Certxa dashboard in one click, or revoke directly from Google Account Settings. Access is revoked immediately.</p>
    </div>
  </div>

  <!-- 1 -->
  <h2>1. Who Certxa Is — and Who We Are Not</h2>

  <div class="not-google">
    <h3>🔴 Certxa is NOT Google</h3>
    <p>Certxa is an independent, third-party SaaS platform for salons and service businesses. We are not affiliated with, endorsed by, or a product of Google LLC. "Google" and "Google Business Profile" are trademarks of Google LLC. Google is not responsible for Certxa's actions, data practices, or this policy.</p>
  </div>

  <p>Certxa is a multi-feature salon management platform providing appointment scheduling, POS, client management, staff scheduling, and Google Business Profile integration — all in one place, built specifically for beauty and wellness professionals.</p>
  <p>We connect to Google Business Profile using Google's official OAuth 2.0 authorization. The connection is optional, initiated entirely by you, and can be revoked at any time.</p>

  <!-- 2 -->
  <h2>2. What Google Data We Access</h2>
  <p>Certxa requests the <span class="badge-scope">business.manage</span> scope — Google's standard scope for managing a business listing — and uses it only to:</p>

  <table class="scope-table">
    <thead>
      <tr>
        <th>Data</th>
        <th>Purpose</th>
        <th>Accessed?</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>Business name, address, hours</td>
        <td>Display connected listing info in your Certxa dashboard</td>
        <td><span class="badge-scope badge-yes">Yes — read</span></td>
      </tr>
      <tr>
        <td>Public Google reviews</td>
        <td>Sync reviews so you can view and respond to them inside Certxa</td>
        <td><span class="badge-scope badge-yes">Yes — read</span></td>
      </tr>
      <tr>
        <td>Business website URL field</td>
        <td>Update to point to your Certxa booking page — only when you initiate this</td>
        <td><span class="badge-scope badge-yes">Yes — write (on request)</span></td>
      </tr>
      <tr>
        <td>Gmail / email</td>
        <td>—</td>
        <td><span class="badge-scope badge-no">Never accessed</span></td>
      </tr>
      <tr>
        <td>Google Drive / Docs / Sheets</td>
        <td>—</td>
        <td><span class="badge-scope badge-no">Never accessed</span></td>
      </tr>
      <tr>
        <td>Google Calendar</td>
        <td>—</td>
        <td><span class="badge-scope badge-no">Never accessed</span></td>
      </tr>
      <tr>
        <td>Google Contacts</td>
        <td>—</td>
        <td><span class="badge-scope badge-no">Never accessed</span></td>
      </tr>
      <tr>
        <td>Personal Google account data</td>
        <td>—</td>
        <td><span class="badge-scope badge-no">Never accessed</span></td>
      </tr>
    </tbody>
  </table>

  <!-- 3 -->
  <h2>3. How We Use Google Data</h2>

  <div class="yes-box">
    <h3>✅ What Certxa DOES with Google data</h3>
    <ul>
      <li>Displays your business listing details inside your Certxa dashboard</li>
      <li>Shows your Google reviews so you can read and respond to them in one place</li>
      <li>Syncs review data automatically every 6 hours to keep your dashboard current</li>
      <li>Updates your Google Business Profile website URL to your Certxa booking page (only when you click "update")</li>
    </ul>
  </div>

  <div class="no-box">
    <h3>❌ What Certxa does NOT do with Google data</h3>
    <ul>
      <li>Does NOT sell, rent, or share your Google data with any third party</li>
      <li>Does NOT use Google data for advertising, marketing analytics, or insights</li>
      <li>Does NOT use Google data to train AI models</li>
      <li>Does NOT access your Google account without your explicit authorization</li>
      <li>Does NOT make changes to your Google Business Profile without your direct action</li>
      <li>Does NOT allow any human to read your Google data except to provide the service, resolve a support request you raised, or comply with law</li>
      <li>Does NOT combine Google Business Profile data with AI Receptionist call data (these are entirely separate systems)</li>
    </ul>
  </div>

  <h3>AI Receptionist — Entirely Separate</h3>
  <p>Certxa's AI Receptionist (automated phone booking) is a completely separate feature. It does not read, access, or use any data obtained from Google APIs. The AI Receptionist uses only your Certxa account data — client records, services, and availability — to answer calls and book appointments. These two features share no data whatsoever.</p>

  <!-- 4 -->
  <h2>4. How We Store Google Data</h2>
  <ul>
    <li><strong>OAuth tokens</strong> are stored encrypted at rest on our servers. They are used only to make authorized API calls on your behalf.</li>
    <li><strong>Review data</strong> is cached to reduce repeated API calls and improve dashboard performance. Cached data is refreshed automatically every 6 hours.</li>
    <li><strong>On disconnection</strong>, your OAuth token is revoked immediately and all cached Google data is deleted within 30 days.</li>
    <li><strong>On account deletion</strong>, all associated Google data (tokens and cached reviews) is deleted within 30 days.</li>
    <li>We never store data beyond what is necessary to operate the integration for you.</li>
  </ul>

  <!-- 5 -->
  <h2>5. How to Revoke Access — Instantly</h2>

  <div class="disconnect-box">
    <div class="icon">🔌</div>
    <div>
      <h3>Disconnect in one click</h3>
      <p>You can revoke Certxa's access to your Google Business Profile at any time. Disconnecting immediately revokes our OAuth token and stops all further data retrieval. You can also revoke directly from your Google Account settings — both methods work instantly.</p>
      <div style="display:flex;flex-wrap:wrap;gap:10px;margin-top:4px;">
        <a href="/google-business-profile" class="btn-revoke">Disconnect from Certxa Dashboard</a>
        <a href="https://myaccount.google.com/permissions" target="_blank" rel="noopener noreferrer" class="btn-dash">Revoke via Google Account →</a>
      </div>
    </div>
  </div>

  <h3>What happens after you disconnect</h3>
  <ul>
    <li>Certxa's OAuth token is revoked immediately — we can no longer access your Google account</li>
    <li>Your Certxa account and all non-Google data remain intact</li>
    <li>Cached Google review data is deleted from our servers within 30 days</li>
    <li>You can reconnect at any time from your Certxa dashboard if you change your mind</li>
  </ul>

  <!-- 6 -->
  <h2>6. Compliance</h2>
  <p>Certxa's use and transfer of information received from Google APIs adheres to the <a href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noopener">Google API Services User Data Policy</a>, including all applicable <strong>Limited Use requirements</strong>. Specifically:</p>
  <ul>
    <li>We only use Google data to provide and improve the Google Business Profile integration feature for you</li>
    <li>We do not use Google data to serve advertising</li>
    <li>We do not allow humans to read Google data except to provide the service, respond to your support requests, or comply with applicable law</li>
    <li>We do not transfer Google data to third parties except as necessary to operate the integration (e.g., secure hosting infrastructure)</li>
  </ul>
  <p>Our full data handling practices for Google APIs are documented in our <a href="/privacy#google-api">Privacy Policy, Section 3</a>.</p>

  <!-- 7 -->
  <h2>7. Contact Us</h2>
  <p>Questions about how Certxa uses your Google data?</p>
  <ul>
    <li><strong>Privacy:</strong> <a href="mailto:privacy@certxa.com">privacy@certxa.com</a></li>
    <li><strong>Support:</strong> <a href="mailto:support@certxa.com">support@certxa.com</a></li>
    <li><strong>Full Privacy Policy:</strong> <a href="/privacy">certxa.com/privacy</a></li>
    <li><strong>Terms of Service:</strong> <a href="/terms">certxa.com/terms</a></li>
  </ul>

  <p style="margin-top:40px;font-size:.88rem;color:#64748b;">Last updated: <?= date('F j, Y') ?> &nbsp;·&nbsp; © <?= date('Y') ?> Certxa. All rights reserved. Certxa is not affiliated with or endorsed by Google LLC.</p>

</div>

<?php require 'includes/footer.php'; ?>
