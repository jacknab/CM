<?php
define('BRAND_NAME',     'Certxa');
define('PAGE_TITLE',     'Privacy Policy | Certxa');
define('PAGE_DESC',      'Certxa Privacy Policy — how we collect, use, and protect your personal data, including information obtained through Google Business Profile API integration.');
define('PAGE_KEYWORDS',  'certxa privacy policy, data protection, GDPR, CCPA, Google Business Profile API, salon software privacy');
define('PAGE_CANONICAL', 'https://certxa.com/privacy');
define('PAGE_BREADCRUMBS', json_encode([
  ['name'=>'Home',           'url'=>'https://certxa.com/'],
  ['name'=>'Privacy Policy', 'url'=>'https://certxa.com/privacy'],
]));
require 'includes/header.php';
require 'includes/nav.php';

$updated   = 'June 26, 2025';
$effective = 'June 26, 2025';
?>

<style>
.legal-hero {
  background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
  padding: 80px 24px 60px;
  text-align: center;
  color: #fff;
}
.legal-hero h1 {
  font-family: 'Inter', sans-serif;
  font-size: clamp(2rem, 5vw, 3rem);
  font-weight: 800;
  letter-spacing: -.03em;
  margin: 0 0 12px;
}
.legal-hero p {
  color: #94a3b8;
  font-size: 1rem;
  margin: 0;
  font-family: 'Inter', sans-serif;
}
.legal-wrap {
  max-width: 820px;
  margin: 0 auto;
  padding: 64px 24px 100px;
  font-family: 'Inter', sans-serif;
  color: #1e293b;
  line-height: 1.75;
}
.legal-wrap h2 {
  font-size: 1.35rem;
  font-weight: 700;
  color: #0f172a;
  margin: 52px 0 12px;
  letter-spacing: -.02em;
  padding-bottom: 10px;
  border-bottom: 2px solid #f1f5f9;
}
.legal-wrap h3 {
  font-size: 1.05rem;
  font-weight: 700;
  color: #0f172a;
  margin: 28px 0 8px;
}
.legal-wrap p, .legal-wrap li {
  font-size: .96rem;
  color: #334155;
}
.legal-wrap ul, .legal-wrap ol {
  margin: 10px 0 16px;
  padding-left: 22px;
}
.legal-wrap li { margin-bottom: 6px; }
.legal-wrap a { color: #6366f1; text-decoration: none; }
.legal-wrap a:hover { text-decoration: underline; }
.notice-box {
  background: #eff6ff;
  border: 1px solid #bfdbfe;
  border-radius: 10px;
  padding: 20px 24px;
  margin: 32px 0;
}
.notice-box p { margin: 0; color: #1e40af; font-size: .92rem; }
.google-box {
  background: #f0fdf4;
  border: 1.5px solid #86efac;
  border-radius: 10px;
  padding: 24px 28px;
  margin: 24px 0;
}
.google-box h3 { color: #15803d; margin-top: 0; }
.google-box p, .google-box li { color: #166534; }
.toc {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  padding: 20px 28px;
  margin: 28px 0 40px;
}
.toc p { font-weight: 700; margin: 0 0 10px; font-size: .9rem; color: #0f172a; }
.toc ol { margin: 0; padding-left: 18px; }
.toc li { font-size: .88rem; margin-bottom: 4px; }
.tag-row { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 8px; }
.tag {
  display: inline-block;
  padding: 2px 10px;
  border-radius: 999px;
  font-size: .75rem;
  font-weight: 600;
  letter-spacing: .03em;
}
.tag-gdpr { background: #ede9fe; color: #6d28d9; }
.tag-ccpa { background: #fff7ed; color: #c2410c; }
.tag-google { background: #f0fdf4; color: #15803d; border: 1px solid #86efac; }
</style>

<div class="legal-hero">
  <h1>Privacy Policy</h1>
  <p>Effective: <?= $effective ?> &nbsp;·&nbsp; Last updated: <?= $updated ?></p>
</div>

<div class="legal-wrap">

  <div class="notice-box">
    <p><strong>Plain-English summary:</strong> Certxa collects only what we need to run our service. We never sell your personal data or use it for advertising. We never share it with third parties except to operate the platform (payments, messaging, AI). If you connect Google Business Profile, your Google data is used solely to manage your listing inside Certxa. You can request deletion or export of your data at any time.</p>
  </div>

  <div class="toc">
    <p>Table of Contents</p>
    <ol>
      <li><a href="#who-we-are">Who We Are</a></li>
      <li><a href="#data-we-collect">Data We Collect</a></li>
      <li><a href="#google-api">Google Business Profile API Data</a></li>
      <li><a href="#how-we-use">How We Use Your Data</a></li>
      <li><a href="#sharing">Data Sharing &amp; Third Parties</a></li>
      <li><a href="#retention">Data Retention</a></li>
      <li><a href="#security">Security</a></li>
      <li><a href="#your-rights">Your Rights (GDPR &amp; CCPA)</a></li>
      <li><a href="#ccpa">California Privacy Rights (CCPA/CPRA)</a></li>
      <li><a href="#cookies">Cookies &amp; Tracking</a></li>
      <li><a href="#children">Children's Privacy</a></li>
      <li><a href="#changes">Changes to This Policy</a></li>
      <li><a href="#sms">SMS Communications</a></li>
      <li><a href="#contact">Contact Us</a></li>
    </ol>
  </div>

  <!-- 1 -->
  <h2 id="who-we-are">1. Who We Are</h2>
  <p>Certxa ("Certxa", "we", "us", "our") operates the SalonOS salon management platform available at <a href="https://certxa.com">certxa.com</a> and its sub-domains. We provide appointment scheduling, point-of-sale, client management, AI receptionist, loyalty programs, staff management, payroll, multi-location tools, and Google Business Profile review management to beauty and wellness professionals.</p>
  <p>This Privacy Policy describes how we collect, use, store, and share information when you use our platform. By using Certxa, you agree to the practices described in this Policy.</p>
  <p>For privacy-related questions, contact us at <a href="mailto:privacy@certxa.com">privacy@certxa.com</a>.</p>

  <!-- 2 -->
  <h2 id="data-we-collect">2. Data We Collect</h2>

  <h3>Account &amp; Profile Data</h3>
  <ul>
    <li>Name, email address, phone number</li>
    <li>Business name, address, type (nail salon, nail studio, etc.), and operating hours</li>
    <li>Password (stored as a salted bcrypt hash — never in plain text)</li>
    <li>Profile photo and business logo (if uploaded)</li>
    <li>Billing and subscription information (processed by Stripe — we do not store raw card numbers or CVVs)</li>
    <li>Government-issued ID or tax information if required for Stripe Connect payouts</li>
  </ul>

  <h3>Business Operational Data</h3>
  <ul>
    <li>Services offered, pricing, and service duration settings</li>
    <li>Staff profiles, schedules, roles, and commission structures</li>
    <li>Contractor and booth-renter agreements and payout records</li>
    <li>Appointment records, cancellations, and no-show history</li>
    <li>Point-of-sale transaction records, cash drawer logs, and end-of-day reports</li>
    <li>Inventory and retail product records</li>
    <li>Multi-location configurations and location-specific settings</li>
    <li>Subscription tier and billing cycle information</li>
  </ul>

  <h3>Client Data You Provide</h3>
  <p>When you add clients to Certxa, you provide us with their names, phone numbers, email addresses, visit history, appointment notes, and optional loyalty point balances. <strong>You represent that you have obtained any necessary consent from your clients to store their data and contact them through our platform.</strong> Your clients' data belongs to you — we process it on your behalf to operate the platform.</p>

  <h3>AI Receptionist &amp; Communication Data</h3>
  <ul>
    <li>Inbound and outbound call logs, including AI-generated call transcripts</li>
    <li>SMS message logs sent or received through the platform (via Twilio)</li>
    <li>Email communication logs for appointment reminders and marketing</li>
    <li>Audio recordings of calls where legally permitted and with appropriate disclosures</li>
  </ul>

  <h3>Usage &amp; Technical Data</h3>
  <ul>
    <li>Log data: IP address, browser type, pages visited, and timestamps</li>
    <li>Device information: screen resolution, operating system, and browser version</li>
    <li>Session tokens (stored in encrypted, server-side sessions via secure HttpOnly cookies)</li>
    <li>In-app feature usage and navigation patterns (aggregated and anonymised)</li>
  </ul>

  <h3>Analytics &amp; Check-In Kiosk Data</h3>
  <ul>
    <li>Walk-in queue events, kiosk check-in timestamps, and service selection logs</li>
    <li>Revenue reporting metrics and trend data tied to your business account</li>
    <li>Booking source attribution (online, kiosk, staff-created, AI-booked)</li>
  </ul>

  <!-- 3 -->
  <h2 id="google-api">3. Google Business Profile API Data</h2>

  <div class="google-box">
    <h3>Google API Services User Data Policy</h3>
    <p>Certxa's use and transfer of information received from Google APIs adheres to the <a href="https://developers.google.com/terms/api-services-user-data-policy" style="color:#15803d;">Google API Services User Data Policy</a>, including all applicable Limited Use requirements. We do not use Google user data to serve advertising, and we do not allow humans to read Google user data except as required to provide the service, respond to your support requests, or comply with applicable law.</p>
  </div>

  <h3>What Google Data We Access</h3>
  <p>Certxa allows business owners to connect their Google Business Profile account using Google's secure OAuth 2.0 authorization process. This connection is entirely optional and requires explicit user consent before any Google data is accessed. When a business owner connects their Google Business Profile, Certxa may access:</p>
  <ul>
    <li>Business location and profile information (name, address, operating hours, categories)</li>
    <li>Public Google reviews associated with the business listing</li>
    <li>Business website URL field (only when you choose to update or synchronize your Certxa-hosted website URL)</li>
    <li>Business photos already published to the listing (read-only, for dashboard display)</li>
  </ul>

  <h3>How We Use This Google Data</h3>
  <p>We use Google Business Profile data solely to provide functionality within the Certxa platform, specifically to:</p>
  <ul>
    <li>Display your Google reviews inside your Certxa dashboard and on your Certxa-hosted website</li>
    <li>Help you manage and respond to reviews from within Certxa</li>
    <li>Allow you to update your Google Business Profile website URL to point to your Certxa booking page</li>
    <li>Synchronize business profile information for display and verification within the Certxa dashboard</li>
  </ul>

  <h3>What We Do Not Do With Google Data</h3>
  <ul>
    <li>We do not access any Google account without explicit, active user authorization</li>
    <li>We do not access personal Gmail, Google Drive, Google Calendar, or any unrelated Google services</li>
    <li>We do not sell, rent, or share Google Business Profile data with any third party</li>
    <li>We do not modify your Google Business Profile data without a direct action or approval from you</li>
    <li>We do not use Google data to train AI models or for any purpose beyond operating Certxa for you</li>
    <li>We do not allow humans to read your Google data except to provide the service, resolve a support issue you raised, or comply with law</li>
  </ul>

  <h3>Data Storage &amp; Disconnection</h3>
  <p>Certxa may temporarily cache Google Business Profile data (e.g., review lists) to reduce API calls and improve performance. You may disconnect your Google account at any time from your Certxa dashboard settings, which immediately revokes our access token and stops further data retrieval. Upon disconnection or account deletion, cached Google data is deleted within 30 days unless a shorter period is required by applicable law.</p>

  <h3>AI Receptionist &amp; Google Data Separation</h3>
  <p>Certxa's AI Receptionist feature is completely separate from the Google Business Profile integration. The AI Receptionist does <strong>not</strong> access, read, or use any data obtained from Google APIs. Call transcripts, booking context, and AI responses are processed using only data in your Certxa account (client records, services, and availability settings). Google Business Profile data and AI Receptionist data are stored separately and never combined for any purpose whatsoever.</p>

  <!-- 4 -->
  <h2 id="how-we-use">4. How We Use Your Data</h2>

  <h3>To Provide the Service</h3>
  <p>We use your data to operate Certxa — running your appointment calendar, online booking page, POS, client management, staff scheduling, payroll calculations, and loyalty program.</p>

  <h3>To Process Payments</h3>
  <p>We pass payment information to Stripe to process charges, issue refunds, and manage subscriptions. For businesses using Stripe Connect, we facilitate payouts to staff and contractors. We do not store full card numbers or CVV codes at any point.</p>

  <h3>To Send Communications</h3>
  <p>We use your data to send appointment reminders, booking confirmations, and marketing messages to your clients via SMS (Twilio) and email (Mailgun), on your behalf and at your direction. We also send you platform notifications, billing receipts, and service updates.</p>

  <h3>To Power the AI Receptionist</h3>
  <p>Call transcripts and booking context are used by our AI systems to answer calls, book appointments, and identify returning clients. These calls are processed using AI services (including OpenAI). Transcripts are stored in your account and may be reviewed by you at any time.</p>

  <h3>To Sync Google Business Profile</h3>
  <p>If connected, we use the Google API to display and help you manage your business listing, reviews, and website URL — as described in Section 3.</p>

  <h3>To Improve the Platform</h3>
  <p>We analyze aggregated, anonymised usage patterns to improve product features, fix bugs, and prioritize development. We never share individual-level data externally for this purpose.</p>

  <h3>To Prevent Fraud &amp; Comply With Law</h3>
  <p>We use data to detect abuse, enforce our Terms of Service, and comply with applicable legal obligations including tax reporting and financial record-keeping.</p>

  <h3>Legal Basis for Processing (GDPR)</h3>
  <p>If you are located in the European Economic Area (EEA) or UK, our lawful basis for processing your personal data is:</p>
  <ul>
    <li><strong>Contract performance</strong> — processing necessary to provide the service you signed up for</li>
    <li><strong>Legitimate interests</strong> — fraud prevention, security monitoring, product improvement, and analytics</li>
    <li><strong>Legal obligation</strong> — financial record-keeping, tax compliance</li>
    <li><strong>Consent</strong> — marketing communications and Google API access (withdrawable at any time)</li>
  </ul>

  <!-- 5 -->
  <h2 id="sharing">5. Data Sharing &amp; Third Parties</h2>
  <p>We do not sell your personal data. We do not share your data with third parties for their own marketing or advertising purposes. We share data only with the following service providers, strictly to operate Certxa:</p>

  <table style="width:100%;border-collapse:collapse;margin:16px 0 24px;font-size:.9rem;">
    <thead>
      <tr style="background:#f8fafc;border-bottom:2px solid #e2e8f0;">
        <th style="padding:10px 14px;text-align:left;font-weight:700;color:#0f172a;">Provider</th>
        <th style="padding:10px 14px;text-align:left;font-weight:700;color:#0f172a;">Purpose</th>
        <th style="padding:10px 14px;text-align:left;font-weight:700;color:#0f172a;">Data Shared</th>
      </tr>
    </thead>
    <tbody>
      <tr style="border-bottom:1px solid #f1f5f9;">
        <td style="padding:10px 14px;font-weight:600;color:#334155;">Stripe</td>
        <td style="padding:10px 14px;color:#475569;">Payment processing &amp; payouts</td>
        <td style="padding:10px 14px;color:#475569;">Billing info, identity data for Stripe Connect</td>
      </tr>
      <tr style="border-bottom:1px solid #f1f5f9;">
        <td style="padding:10px 14px;font-weight:600;color:#334155;">Twilio</td>
        <td style="padding:10px 14px;color:#475569;">SMS and voice call delivery</td>
        <td style="padding:10px 14px;color:#475569;">Phone numbers, message content</td>
      </tr>
      <tr style="border-bottom:1px solid #f1f5f9;">
        <td style="padding:10px 14px;font-weight:600;color:#334155;">Mailgun</td>
        <td style="padding:10px 14px;color:#475569;">Transactional &amp; marketing email</td>
        <td style="padding:10px 14px;color:#475569;">Email addresses, message content</td>
      </tr>
      <tr style="border-bottom:1px solid #f1f5f9;">
        <td style="padding:10px 14px;font-weight:600;color:#334155;">OpenAI</td>
        <td style="padding:10px 14px;color:#475569;">AI Receptionist — call handling &amp; booking automation</td>
        <td style="padding:10px 14px;color:#475569;">Call transcripts, appointment context (no raw PII beyond what's needed for the call)</td>
      </tr>
      <tr style="border-bottom:1px solid #f1f5f9;">
        <td style="padding:10px 14px;font-weight:600;color:#334155;">Google APIs</td>
        <td style="padding:10px 14px;color:#475569;">Business Profile sync, OAuth login</td>
        <td style="padding:10px 14px;color:#475569;">Only data you explicitly authorize via OAuth</td>
      </tr>
      <tr style="border-bottom:1px solid #f1f5f9;">
        <td style="padding:10px 14px;font-weight:600;color:#334155;">Cloud hosting</td>
        <td style="padding:10px 14px;color:#475569;">Infrastructure &amp; storage</td>
        <td style="padding:10px 14px;color:#475569;">All platform data (stored encrypted at rest)</td>
      </tr>
      <tr>
        <td style="padding:10px 14px;font-weight:600;color:#334155;">Analytics</td>
        <td style="padding:10px 14px;color:#475569;">Aggregated usage analysis</td>
        <td style="padding:10px 14px;color:#475569;">Anonymised, aggregated usage events only</td>
      </tr>
    </tbody>
  </table>

  <p>We require all service providers to maintain appropriate data protection standards and contractual data processing agreements where required by law. We do not permit them to use your data for their own independent purposes.</p>
  <p>We may also disclose data when required by applicable law, valid legal process (such as a court order or subpoena), or to protect the rights, property, or safety of Certxa, our users, or the public.</p>

  <!-- 6 -->
  <h2 id="retention">6. Data Retention</h2>
  <ul>
    <li><strong>Active accounts:</strong> Data is retained for the full duration of your active subscription.</li>
    <li><strong>Cancelled or expired accounts:</strong> We retain your data for 90 days after cancellation to allow account recovery, then delete or anonymise it.</li>
    <li><strong>Client data:</strong> Deleted with your account unless you export it first. You may export all client records from your dashboard at any time.</li>
    <li><strong>Google API data:</strong> OAuth tokens are revoked immediately on disconnection. Synced review records are deleted within 30 days of account deletion or disconnection.</li>
    <li><strong>Billing &amp; financial records:</strong> Retained for 7 years as required by applicable financial and tax regulations.</li>
    <li><strong>Call transcripts &amp; AI logs:</strong> Retained for 90 days, then purged unless you choose to archive them.</li>
    <li><strong>Server logs:</strong> Retained for 30 days for security monitoring, then purged.</li>
  </ul>

  <!-- 7 -->
  <h2 id="security">7. Security</h2>
  <p>We take data security seriously and maintain the following controls:</p>
  <ul>
    <li>All data is transmitted over HTTPS/TLS — plain HTTP is redirected and not accepted</li>
    <li>Passwords are stored using bcrypt with per-user random salts — we never store or log plain-text passwords</li>
    <li>OAuth tokens and API keys are stored encrypted at rest using server-side encryption</li>
    <li>Session tokens use HttpOnly, Secure, and SameSite=Lax cookie attributes to prevent XSS and CSRF attacks</li>
    <li>Role-based access control (RBAC) restricts what staff accounts can view or modify</li>
    <li>Database servers are not publicly accessible — only accessible from application servers within a private network</li>
    <li>API credentials and service secrets are stored in secure environment secret vaults, never committed to source code</li>
    <li>Audit logging records sensitive admin actions with timestamps and actor IDs</li>
    <li>We conduct periodic security reviews and dependency vulnerability audits</li>
  </ul>
  <p>If you believe you have discovered a security vulnerability in Certxa, please report it responsibly to <a href="mailto:security@certxa.com">security@certxa.com</a>. We investigate all credible reports promptly.</p>

  <!-- 8 -->
  <h2 id="your-rights">8. Your Rights (GDPR &amp; Global)</h2>
  <p>Depending on your jurisdiction, you may have the following rights regarding your personal data:</p>
  <ul>
    <li><strong>Access:</strong> Request a copy of the personal data we hold about you or your business account</li>
    <li><strong>Correction:</strong> Request correction of inaccurate or incomplete data</li>
    <li><strong>Deletion ("Right to be forgotten"):</strong> Request deletion of your account and associated personal data</li>
    <li><strong>Portability:</strong> Receive your data in a structured, machine-readable format (e.g., CSV export)</li>
    <li><strong>Objection:</strong> Object to processing for direct marketing or based on legitimate interests</li>
    <li><strong>Restriction:</strong> Request that we restrict processing in specific circumstances (e.g., while a dispute is being resolved)</li>
    <li><strong>Withdraw consent:</strong> Where processing is based on consent (e.g., marketing emails, Google connection), you may withdraw at any time without affecting lawfulness of prior processing</li>
  </ul>
  <p>To exercise any of these rights, email <a href="mailto:privacy@certxa.com">privacy@certxa.com</a> from the email address on your account. We will respond within 30 days. For Google-specific data access, you may also manage or revoke our permissions directly via <a href="https://myaccount.google.com/permissions">Google Account Settings</a>.</p>

  <!-- 9 -->
  <h2 id="ccpa">9. California Privacy Rights (CCPA / CPRA)</h2>
  <div class="tag-row">
    <span class="tag tag-ccpa">CCPA / CPRA</span>
  </div>
  <p>If you are a California resident, you have additional rights under the California Consumer Privacy Act (CCPA) and California Privacy Rights Act (CPRA):</p>
  <ul>
    <li><strong>Right to Know:</strong> Request disclosure of the categories and specific pieces of personal information we have collected about you in the past 12 months</li>
    <li><strong>Right to Delete:</strong> Request deletion of your personal information, subject to certain exceptions</li>
    <li><strong>Right to Correct:</strong> Request correction of inaccurate personal information</li>
    <li><strong>Right to Opt-Out of Sale or Sharing:</strong> We do not sell your personal information, and we do not share it for cross-context behavioral advertising. You do not need to opt out, but you may contact us to confirm.</li>
    <li><strong>Right to Limit Use of Sensitive Personal Information:</strong> You may request that we limit our use of sensitive personal information to what is necessary to provide the service</li>
    <li><strong>Right to Non-Discrimination:</strong> We will not discriminate against you for exercising any of these rights</li>
  </ul>
  <p><strong>Do Not Sell or Share My Personal Information:</strong> Certxa does not sell personal information. We do not share personal information with third parties for cross-context behavioral advertising.</p>
  <p>To submit a California privacy request, email <a href="mailto:privacy@certxa.com">privacy@certxa.com</a> with the subject line "California Privacy Request." We will respond within 45 days as required by law.</p>

  <!-- 10 -->
  <h2 id="cookies">10. Cookies &amp; Tracking</h2>
  <p>We use the following types of cookies and similar technologies:</p>
  <ul>
    <li><strong>Strictly necessary:</strong> Session authentication cookie — required for you to stay logged in. Cannot be disabled without breaking login.</li>
    <li><strong>Functional:</strong> Remembers your UI preferences such as timezone and display settings. These expire after your session or within 30 days.</li>
    <li><strong>Analytics:</strong> Aggregated, anonymised page-view analytics to help us understand how the platform is used. No cross-site tracking, no fingerprinting, no individual user profiles shared externally.</li>
  </ul>
  <p>We do not use third-party advertising cookies or tracking pixels. We do not engage in cross-site behavioral advertising. You can manage or clear cookies through your browser settings at any time; disabling the session cookie will log you out.</p>

  <!-- 11 -->
  <h2 id="children">11. Children's Privacy</h2>
  <p>Certxa is a business platform intended for users aged 18 and over. We do not knowingly collect personal data from children under 13. If we become aware that a child under 13 has provided us with personal information, we will delete it promptly. If you believe a child's data has been submitted, contact <a href="mailto:privacy@certxa.com">privacy@certxa.com</a>.</p>

  <!-- 12 -->
  <h2 id="changes">12. Changes to This Policy</h2>
  <p>We may update this Privacy Policy from time to time to reflect changes in our practices, technology, or legal requirements. When we make material changes, we will notify you by email (to the address on your account) at least 14 days before the effective date, and post the updated policy here with a revised "Last updated" date. Continued use of Certxa after the effective date of the updated policy constitutes acceptance. If you do not accept the changes, you may close your account and request deletion of your data.</p>

  <!-- 13 -->
  <h2 id="sms">13. SMS Communications</h2>
  <p>Certxa LLC provides appointment management and customer communication services for salons using the Certxa platform. If you provide your phone number and consent to receive text messages, Certxa LLC may send SMS messages on behalf of the salon you are interacting with.</p>

  <h3>SMS messages may include:</h3>
  <ul>
    <li>Appointment confirmations</li>
    <li>Appointment reminders</li>
    <li>Appointment cancellations</li>
    <li>Appointment rescheduling updates</li>
    <li>Waitlist availability notifications</li>
    <li>Other appointment-related communications</li>
  </ul>

  <p>By providing your phone number and opting in to receive SMS messages, you consent to receive automated text messages from Certxa LLC on behalf of the selected salon. Message frequency varies depending on your appointments and interactions with the salon. Message and data rates may apply.</p>
  <p>You may opt out of SMS communications at any time by replying <strong>STOP</strong> to any message. After you send STOP, you may receive a confirmation message that your request has been processed. You may also reply <strong>HELP</strong> for assistance.</p>
  <p>Your SMS consent is separate from any other communication preferences, and consent to receive text messages is not a condition of purchasing any products or services.</p>
  <p>Certxa LLC does not sell, rent, or share your phone number or SMS consent information with third parties for their own marketing purposes. Phone numbers collected for SMS communications are used only for providing appointment-related notifications and supporting the services requested by you or the salon you are booking with.</p>
  <p>If you have questions about SMS communications, please contact Certxa LLC through the support channels provided on our website.</p>

  <!-- 14 -->
  <h2 id="contact">14. Contact Us</h2>
  <p>For privacy-related questions, data requests, or to exercise your rights:</p>
  <ul>
    <li><strong>Privacy inquiries:</strong> <a href="mailto:privacy@certxa.com">privacy@certxa.com</a></li>
    <li><strong>General support:</strong> <a href="mailto:support@certxa.com">support@certxa.com</a></li>
    <li><strong>Security reports:</strong> <a href="mailto:security@certxa.com">security@certxa.com</a></li>
    <li><strong>Website:</strong> <a href="/contact">certxa.com/contact</a></li>
  </ul>
  <p style="margin-top:24px;font-size:.88rem;color:#64748b;">© <?= date('Y') ?> Certxa. All rights reserved.</p>

</div>

<?php require 'includes/footer.php'; ?>
