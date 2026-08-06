<?php
define('BRAND_NAME',     'Certxa');
define('PAGE_TITLE',     'Terms of Service | Certxa');
define('PAGE_DESC',      'Certxa Terms of Service — the agreement between you and Certxa governing use of our salon management platform, including booking, payments, AI features, and Google Business Profile integrations.');
define('PAGE_KEYWORDS',  'certxa terms of service, terms and conditions, salon software agreement, user agreement, SaaS terms');
define('PAGE_CANONICAL', 'https://certxa.com/terms');
define('PAGE_BREADCRUMBS', json_encode([
  ['name'=>'Home',             'url'=>'https://certxa.com/'],
  ['name'=>'Terms of Service', 'url'=>'https://certxa.com/terms'],
]));
require 'includes/header.php';
require 'includes/nav.php';

$updated = 'June 27, 2026';
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
.warning-box {
  background: #fff7ed;
  border: 1px solid #fed7aa;
  border-radius: 10px;
  padding: 20px 24px;
  margin: 24px 0;
}
.warning-box p { margin: 0; color: #9a3412; font-size: .92rem; }
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
.caps { text-transform: uppercase; font-size: .88rem; letter-spacing: .04em; font-weight: 700; }
</style>

<div class="legal-hero">
  <h1>Terms of Service</h1>
  <p>Last updated: <?= $updated ?></p>
</div>

<div class="legal-wrap">

  <div class="notice-box">
    <p>By creating an account or using Certxa, you agree to these Terms of Service and our <a href="/privacy" style="color:#1e40af;">Privacy Policy</a>. If you do not agree, do not use the platform. These Terms constitute a binding agreement between you (the business or individual account holder) and Certxa.</p>
  </div>

  <div class="toc">
    <p>Table of Contents</p>
    <ol>
      <li><a href="#service">Description of Service</a></li>
      <li><a href="#accounts">Accounts &amp; Eligibility</a></li>
      <li><a href="#subscription">Subscription &amp; Billing</a></li>
      <li><a href="#data-ownership">Data Ownership</a></li>
      <li><a href="#ai-receptionist">AI Receptionist</a></li>
      <li><a href="#payments-stripe">Payments &amp; Stripe Connect</a></li>
      <li><a href="#staff-accounts">Staff Accounts &amp; Multi-Location</a></li>
      <li><a href="#google-api">Google Business Profile Integration</a></li>
      <li><a href="#acceptable-use">Acceptable Use</a></li>
      <li><a href="#third-party">Third-Party Services</a></li>
      <li><a href="#availability">Service Availability</a></li>
      <li><a href="#disclaimer">Disclaimer of Warranties</a></li>
      <li><a href="#liability">Limitation of Liability</a></li>
      <li><a href="#indemnification">Indemnification</a></li>
      <li><a href="#termination">Termination</a></li>
      <li><a href="#governing-law">Governing Law &amp; Disputes</a></li>
      <li><a href="#changes">Changes to These Terms</a></li>
      <li><a href="#contact">Contact</a></li>
    </ol>
  </div>

  <!-- 1 -->
  <h2 id="service">1. Description of Service</h2>
  <p>Certxa provides a multi-tenant SaaS platform ("the Service") built for nail salons, nail studios, and independent nail technicians. The Service includes:</p>
  <ul>
    <li>Online appointment scheduling and client-facing booking pages</li>
    <li>Point-of-sale (POS) system including product sales, tipping, and cash drawer management</li>
    <li>Client CRM, visit history, notes, and loyalty point management</li>
    <li>Staff scheduling, role management, and commission/payroll tracking</li>
    <li>Contractor and booth-renter agreement and payout management</li>
    <li>Walk-in kiosk and waitlist system</li>
    <li>AI Receptionist for automated phone call handling and booking</li>
    <li>SMS and email marketing and reminder automation</li>
    <li>Multi-location management tools</li>
    <li>Revenue analytics and reporting</li>
    <li>Custom website builder and Certxa-hosted booking websites</li>
    <li>Google Business Profile integration for review management and website sync</li>
    <li>Subscription billing management via Stripe</li>
  </ul>
  <p>We reserve the right to modify, add, or discontinue features at any time. Material changes will be communicated with reasonable notice.</p>

  <!-- 2 -->
  <h2 id="accounts">2. Accounts &amp; Eligibility</h2>

  <h3>Eligibility</h3>
  <p>You must be at least 18 years old and legally capable of entering into a binding contract to create a Certxa account. By using the Service, you represent that you meet these requirements.</p>

  <h3>Account Responsibility</h3>
  <p>You are responsible for maintaining the confidentiality of your login credentials. You agree to notify us immediately at <a href="mailto:support@certxa.com">support@certxa.com</a> if you become aware of any unauthorized access to your account. Certxa is not liable for any loss or damage resulting from unauthorized access caused by your failure to safeguard your credentials.</p>

  <h3>Business Representation</h3>
  <p>Each Certxa account must represent a real, lawfully operating business entity or an independent professional. You may not create accounts to impersonate others, misrepresent your business, or engage in fraudulent activity. If you create an account on behalf of a company or organization, you represent that you have authority to bind that entity to these Terms.</p>

  <h3>Account Accuracy</h3>
  <p>You agree to provide accurate, current, and complete information during registration and to keep it updated. Inaccurate or misleading information may result in suspension or termination of your account.</p>

  <!-- 3 -->
  <h2 id="subscription">3. Subscription &amp; Billing</h2>

  <h3>Plans &amp; Fees</h3>
  <p>Certxa offers paid subscription plans billed monthly or annually. Current plan details and pricing are displayed at <a href="/pricing">certxa.com/pricing</a>. Prices may change with at least 30 days' advance notice to active subscribers.</p>

  <h3>Trial Period</h3>
  <p>New accounts may be eligible for a free trial period as displayed at sign-up. No payment information is required during the trial unless otherwise stated. At the end of the trial, you will be prompted to select a paid plan to continue using the Service.</p>

  <h3>Billing &amp; Auto-Renewal</h3>
  <p>Subscriptions are billed automatically at the start of each billing period (monthly or annual) using the payment method on file, processed securely through Stripe. By subscribing, you authorize Certxa to charge your payment method on a recurring basis until you cancel.</p>

  <h3>Refund Policy</h3>
  <p>All subscription fees are non-refundable except where required by applicable law. If you cancel your subscription, you will retain access to the Service through the end of your current billing period. We do not provide prorated refunds for partial months unless required by law. In exceptional circumstances (e.g., significant service outages attributable to Certxa), we may issue account credits at our sole discretion.</p>

  <h3>Late Payments &amp; Failed Charges</h3>
  <p>If a payment fails, we will attempt to retry the charge. Continued failure to pay may result in suspension of your account. You remain responsible for any amounts owed even after suspension or termination.</p>

  <h3>Cancellation</h3>
  <p>You may cancel your subscription at any time from your account settings or by contacting <a href="mailto:support@certxa.com">support@certxa.com</a>. Cancellation takes effect at the end of the current billing period. We do not charge cancellation fees.</p>

  <!-- 4 -->
  <h2 id="data-ownership">4. Data Ownership</h2>

  <h3>Your Data Belongs to You</h3>
  <p>All business data, client data, appointment records, and content you create or upload within Certxa remains your property. You grant Certxa a limited, non-exclusive license to process and store your data solely to provide the Service.</p>

  <h3>Client Data</h3>
  <p>You are the data controller for client information you enter into Certxa. Certxa acts as a data processor on your behalf. You are responsible for ensuring you have the necessary consents, permissions, and legal bases to collect your clients' personal information and use our platform to contact them.</p>

  <h3>Data Export</h3>
  <p>You may export your data (clients, appointments, financial records) at any time from your dashboard. We will provide your data in standard formats (CSV, JSON). After account deletion, data may be irretrievable, so we recommend exporting before cancellation.</p>

  <h3>Account Deletion &amp; Data Retention</h3>
  <p>You may permanently delete your account at any time directly from your <strong>Account Settings</strong> page (Account → Danger Zone → Delete my account). Deletion requires your current password and confirmation. Once deleted:</p>
  <ul>
    <li>Your access to the platform is removed immediately</li>
    <li>Your active subscription is cancelled at end of the current billing period</li>
    <li>Business data, client records, and appointments are deactivated and no longer accessible to you</li>
    <li>Financial records (appointments, payroll, invoices, payments) are retained until <strong>February 1st of the following calendar year</strong> for tax and legal compliance purposes, after which they are permanently purged</li>
    <li>Staff accounts linked to your business also lose access upon account deletion</li>
  </ul>
  <p>If you signed up with Google, contact <a href="mailto:support@certxa.com">support@certxa.com</a> to initiate deletion (password confirmation is not possible for Google-linked accounts via the in-app flow). We will process your request within 5 business days.</p>

  <h3>No Claim on Your Data</h3>
  <p>Certxa will never sell your business data or client data to third parties, use it to train AI models without your consent, or use it for purposes beyond operating the Service for you.</p>

  <!-- 5 -->
  <h2 id="ai-receptionist">5. AI Receptionist</h2>

  <div class="warning-box">
    <p><strong>Important:</strong> The AI Receptionist is an automated tool. It may make mistakes. You are responsible for verifying all bookings, cancellations, and reschedules created by the AI before treating them as confirmed.</p>
  </div>

  <h3>How It Works</h3>
  <p>Certxa's AI Receptionist answers inbound phone calls on your behalf, uses AI voice and language models (including OpenAI) to understand caller requests, and can book, cancel, or reschedule appointments based on your live availability settings.</p>

  <h3>Accuracy Disclaimer</h3>
  <p>The AI Receptionist may mishear callers, misinterpret requests, or generate incorrect responses. AI-created booking actions are not legally binding commitments from Certxa. You remain solely responsible for verifying and honoring (or correcting) appointments created by the AI.</p>

  <h3>Not Legal or Medical Advice</h3>
  <p>The AI Receptionist does not provide legal, medical, financial, or professional advice of any kind. Any information it conveys is for appointment coordination purposes only.</p>

  <h3>Google Data Separation</h3>
  <p>The AI Receptionist does <strong>not</strong> access, read, or use any data from Google Business Profile or any other Google API. Call handling, appointment booking, and all AI Receptionist responses are based solely on data stored in your Certxa account (client records, services, and availability). The AI Receptionist and Google Business Profile integration are completely separate systems that do not share data.</p>

  <h3>Call Recording &amp; Transcripts</h3>
  <p>Calls handled by the AI Receptionist may be transcribed and stored in your account for your review. If your jurisdiction requires disclosure to callers that a call is being recorded or handled by AI, you are responsible for ensuring that disclosure is made (e.g., via a greeting message you configure in the platform).</p>

  <h3>Caller Recognition</h3>
  <p>The AI Receptionist may attempt to identify returning callers based on phone number matching to existing client records. This feature uses only data stored in your Certxa account.</p>

  <!-- 6 -->
  <h2 id="payments-stripe">6. Payments &amp; Stripe Connect</h2>

  <h3>Payment Processing</h3>
  <p>Certxa uses Stripe to process all payments made through the platform, including client charges, subscription billing, and staff/contractor payouts via Stripe Connect. By using payment features, you agree to <a href="https://stripe.com/legal/ssa" target="_blank" rel="noopener">Stripe's Connected Account Agreement</a> and <a href="https://stripe.com/privacy" target="_blank" rel="noopener">Stripe's Privacy Policy</a>.</p>

  <h3>Certxa Is Not a Bank</h3>
  <p>Certxa is a software platform, not a bank, money services business, or payment processor. All payment processing, fund holding, and payout operations are performed by Stripe. Certxa does not hold client funds on your behalf.</p>

  <h3>Platform Fees</h3>
  <p>Certxa may charge platform fees separate from your subscription (e.g., per-transaction fees for certain payment features). These fees are disclosed clearly before you enable them. Stripe also charges its own processing fees, which are separate from Certxa's fees.</p>

  <h3>Chargebacks &amp; Disputes</h3>
  <p>You are responsible for managing payment disputes and chargebacks with your clients. Certxa will provide transaction records to assist with disputes but is not liable for funds lost due to chargebacks or fraud initiated by your clients.</p>

  <h3>Payout Timing</h3>
  <p>Payout timing for Stripe Connect accounts is governed by Stripe's policies, not Certxa's. Certxa is not responsible for delays in payouts caused by Stripe's verification processes, banking delays, or regulatory holds.</p>

  <!-- 7 -->
  <h2 id="staff-accounts">7. Staff Accounts &amp; Multi-Location</h2>

  <h3>Staff Access</h3>
  <p>As a business owner, you may invite staff members to your Certxa account. You are responsible for managing your staff's access levels and revoking access promptly when a staff member leaves your business. Staff accounts operate under your master account and are bound by these Terms.</p>

  <h3>Role Permissions</h3>
  <p>Certxa offers role-based access control (e.g., owner, manager, staff). You are responsible for assigning appropriate roles. Certxa is not liable for actions taken by staff members using permissions you have granted them.</p>

  <h3>Multi-Location Accounts</h3>
  <p>Multi-location features allow a single account owner to manage multiple business locations. All locations under an account are governed by a single subscription (depending on your plan). You are responsible for ensuring compliance across all locations you manage through the platform.</p>

  <h3>Contractors &amp; Booth Renters</h3>
  <p>Certxa provides tools for managing booth renters and independent contractors. You are solely responsible for classifying workers correctly under applicable employment and tax law. Certxa is not an employer of your contractors and does not determine their employment status.</p>

  <!-- 8 -->
  <h2 id="google-api">8. Google Business Profile Integration</h2>

  <div class="google-box">
    <h3>Google API Compliance</h3>
    <p>Certxa integrates with the Google Business Profile API under <a href="https://developers.google.com/terms/api-services-user-data-policy" style="color:#15803d;">Google API Services User Data Policy</a>. Your use of this integration is also subject to Google's own Terms of Service and policies.</p>
  </div>

  <h3>Certxa is an Independent Third-Party Tool — NOT Google</h3>
  <p><strong>Certxa is not Google LLC.</strong> Certxa is an independent, third-party software company. We are not affiliated with, endorsed by, sponsored by, or in any way a product of Google. "Google", "Google Business Profile", and related marks are trademarks of Google LLC.</p>
  <p>Google LLC is not responsible for Certxa's features, actions, pricing, data practices, service availability, content, or these Terms. Your relationship with Google is governed entirely by Google's own terms and policies.</p>

  <h3>Scope of Google Access</h3>
  <p>Certxa requests the Google Business Profile management scope (<strong>business.manage</strong>) solely to operate the Google Business Profile integration on your behalf. This access is used only to:</p>
  <ul>
    <li>Read your business listing name, address, and operating information</li>
    <li>Sync public Google reviews associated with your business location</li>
    <li>Update your Google Business Profile website URL field when you initiate this action</li>
  </ul>
  <p>Certxa does <strong>not</strong> request access to Gmail, Google Drive, Google Calendar, Google Contacts, or any Google service unrelated to your business listing. We never request more Google access than is required to provide the integration.</p>

  <h3>AI Receptionist and Google Scope — Separate Systems</h3>
  <p>Certxa's AI Receptionist feature is entirely separate from the Google Business Profile integration. The AI Receptionist does <strong>not</strong> access, read, write, or use any data obtained from Google APIs. Call transcripts, appointment booking, and AI responses are based solely on data within your Certxa account — not on Google Business Profile data. These two systems share no data.</p>

  <h3>Authorization Required</h3>
  <p>You must explicitly authorize Certxa to connect to your Google Business Profile via Google's OAuth 2.0 consent flow. By granting authorization, you confirm that you own or are duly authorized to manage the connected Google Business Profile(s).</p>

  <h3>Permitted Use</h3>
  <p>The Google Business Profile integration is permitted only for:</p>
  <ul>
    <li>Displaying your public Google reviews inside your Certxa dashboard and Certxa-hosted website</li>
    <li>Updating your Google Business Profile website URL to point to your Certxa booking page (only when you initiate this action)</li>
    <li>Syncing business profile information for display within Certxa</li>
  </ul>

  <h3>Prohibited Actions</h3>
  <p>You must not use the Google Business Profile integration to:</p>
  <ul>
    <li>Access Google Business Profiles you do not own or are not authorized to manage</li>
    <li>Manipulate, falsify, or spam reviews in violation of Google's policies</li>
    <li>Perform actions on Google's platform in a way that violates Google's Terms of Service</li>
  </ul>

  <h3>Misuse &amp; Suspension</h3>
  <p>Misuse of the Google Business Profile integration — including accessing unauthorized profiles or violating Google's API policies — may result in immediate suspension of the Google integration feature, suspension of your Certxa account, or both. Certxa will report confirmed misuse to Google as required. Additionally, misuse may result in Google LLC independently terminating or suspending API access to your Google account, which is outside of Certxa's control. Your API usage is subject to <a href="https://developers.google.com/terms/">Google's API Terms of Service</a>.</p>

  <h3>API Availability</h3>
  <p>The Google Business Profile integration depends on Google's API availability. Certxa is not responsible for disruptions to this integration caused by Google's API changes, downtime, or policy updates. We will make reasonable efforts to maintain compatibility with Google's current API versions.</p>

  <!-- 9 -->
  <h2 id="acceptable-use">9. Acceptable Use</h2>
  <p>You agree to use Certxa only for lawful purposes and in accordance with these Terms. You must not:</p>
  <ul>
    <li>Use the platform to conduct fraudulent transactions or impersonate another person or business</li>
    <li>Upload or transmit content that is illegal, defamatory, obscene, or infringes third-party intellectual property rights</li>
    <li>Attempt to gain unauthorized access to other users' accounts, data, or systems</li>
    <li>Scrape, crawl, or systematically harvest data from Certxa's platform or API without written permission</li>
    <li>Use the platform to send unsolicited commercial communications (spam) to your clients or others</li>
    <li>Interfere with or disrupt the platform's infrastructure, servers, or networks</li>
    <li>Reverse-engineer, decompile, or attempt to extract source code from the platform</li>
    <li>Resell or sublicense access to the platform without Certxa's prior written consent</li>
    <li>Use the AI Receptionist to deceive callers into believing they are speaking to a human when required disclosures are mandated by law</li>
    <li>Violate any applicable local, state, national, or international law or regulation</li>
  </ul>
  <p>Violation of this Acceptable Use Policy may result in immediate suspension or termination of your account without refund.</p>

  <!-- 10 -->
  <h2 id="third-party">10. Third-Party Services</h2>
  <p>Certxa integrates with third-party services including Stripe, Twilio, Mailgun, OpenAI, and Google. Your use of these services through Certxa is also governed by each provider's own terms and privacy policies. Certxa is not responsible for the actions, availability, or data practices of third-party providers. Relevant policies include:</p>
  <ul>
    <li><a href="https://stripe.com/legal" target="_blank" rel="noopener">Stripe Terms &amp; Privacy</a></li>
    <li><a href="https://www.twilio.com/legal/tos" target="_blank" rel="noopener">Twilio Terms of Service</a></li>
    <li><a href="https://www.mailgun.com/legal/terms/" target="_blank" rel="noopener">Mailgun Terms of Service</a></li>
    <li><a href="https://openai.com/policies/terms-of-use" target="_blank" rel="noopener">OpenAI Terms of Use</a></li>
    <li><a href="https://policies.google.com/terms" target="_blank" rel="noopener">Google Terms of Service</a></li>
  </ul>

  <!-- 11 -->
  <h2 id="availability">11. Service Availability</h2>
  <p>We strive to maintain high availability of the platform but we do not guarantee uninterrupted or error-free operation. The Service may be temporarily unavailable due to maintenance, infrastructure issues, or events outside our control. We will make reasonable efforts to schedule maintenance during off-peak hours and provide advance notice for planned downtime.</p>
  <p>Certxa is not liable for losses arising from service outages, downtime, missed appointments, delayed SMS or email messages, or AI Receptionist failures. See the Limitation of Liability section below.</p>

  <!-- 12 -->
  <h2 id="disclaimer">12. Disclaimer of Warranties</h2>
  <p class="caps">The service is provided "as is" and "as available" without warranties of any kind, express or implied, including but not limited to implied warranties of merchantability, fitness for a particular purpose, accuracy, or non-infringement.</p>
  <p class="caps">Certxa does not warrant that the service will be uninterrupted, error-free, or free of viruses or other harmful components. Certxa does not warrant the accuracy or completeness of any information provided through the platform, including AI-generated responses.</p>
  <p class="caps">Some jurisdictions do not allow the exclusion of implied warranties. In such cases, the above exclusions apply to the maximum extent permitted by applicable law.</p>

  <!-- 13 -->
  <h2 id="liability">13. Limitation of Liability</h2>
  <p class="caps">To the maximum extent permitted by applicable law, Certxa and its officers, directors, employees, and agents shall not be liable for any indirect, incidental, special, consequential, or punitive damages, including but not limited to:</p>
  <ul style="text-transform:uppercase;font-size:.88rem;font-weight:700;letter-spacing:.03em;">
    <li>Loss of revenue or profits</li>
    <li>Missed or incorrectly booked appointments</li>
    <li>Delayed or undelivered SMS or email messages</li>
    <li>AI Receptionist errors or miscommunications</li>
    <li>Data loss caused by hardware failure, software bugs, or user error</li>
    <li>Downtime, service interruptions, or third-party API failures</li>
    <li>Unauthorized access to your account due to compromised credentials</li>
  </ul>
  <p class="caps">In no event shall Certxa's total liability to you for all claims arising out of or relating to these terms or your use of the service exceed the greater of (a) the total fees you paid to Certxa in the three months immediately preceding the claim, or (b) one hundred US dollars ($100).</p>
  <p>Some jurisdictions do not allow the limitation of liability for consequential or incidental damages. In such jurisdictions, our liability is limited to the greatest extent permitted by law.</p>

  <!-- 14 -->
  <h2 id="indemnification">14. Indemnification</h2>
  <p>You agree to indemnify, defend, and hold harmless Certxa and its officers, directors, employees, and agents from any claims, damages, liabilities, costs, or expenses (including reasonable legal fees) arising out of or relating to: (a) your use of the Service; (b) your violation of these Terms; (c) your violation of any applicable law or the rights of a third party; (d) data you upload, store, or transmit through the platform; or (e) your clients' complaints or claims related to your business operations.</p>

  <!-- 15 -->
  <h2 id="termination">15. Termination</h2>

  <h3>Termination by You (Self-Service)</h3>
  <p>You may delete your account at any time through your <strong>Account Settings</strong> (Account → Danger Zone → Delete my account). Deletion requires your current password and typing <code>DELETE</code> to confirm. Upon deletion, access is removed immediately and your subscription is cancelled at the end of your current billing period. We strongly recommend exporting your data before deleting. Financial records are retained for tax and legal compliance as described in Section 4.</p>

  <h3>Termination by Certxa</h3>
  <p>We may suspend or terminate your account immediately, without prior notice, if:</p>
  <ul>
    <li>You materially violate these Terms or our Acceptable Use Policy</li>
    <li>You engage in fraudulent activity, chargebacks abuse, or conduct that poses risk to the platform or other users</li>
    <li>You fail to pay amounts owed after reasonable notice</li>
    <li>We are required to do so by law, court order, or regulatory obligation</li>
    <li>Your use of Google API features violates Google's policies</li>
  </ul>
  <p>In cases of less serious violations, we will provide notice and a reasonable opportunity to cure before termination.</p>

  <h3>Effect of Termination</h3>
  <p>Upon termination, your right to access the Service ends immediately. Provisions of these Terms that by their nature should survive (including data ownership, limitation of liability, indemnification, and governing law) will continue to apply after termination.</p>

  <!-- 16 -->
  <h2 id="governing-law">16. Governing Law &amp; Disputes</h2>
  <p>These Terms are governed by and construed in accordance with the laws of the State of Delaware, United States, without regard to conflict of law principles. Any disputes arising under these Terms will be resolved first through good-faith negotiation. If negotiation fails, disputes shall be resolved through binding arbitration conducted by a recognized arbitration body (such as JAMS or AAA), except that either party may seek injunctive or other equitable relief in a court of competent jurisdiction to prevent irreparable harm.</p>
  <p><strong>Class Action Waiver:</strong> You agree that any dispute resolution proceedings will be conducted solely on an individual basis and not in a class, consolidated, or representative action.</p>

  <!-- 17 -->
  <h2 id="changes">17. Changes to These Terms</h2>
  <p>We may update these Terms from time to time. When we make material changes, we will notify you by email at least 14 days before the changes take effect and post the updated Terms here with a revised "Last updated" date. Your continued use of the Service after the effective date of the updated Terms constitutes acceptance. If you do not accept the updated Terms, you may cancel your account before they take effect.</p>

  <!-- 18 -->
  <h2 id="contact">18. Contact</h2>
  <p>Questions about these Terms?</p>
  <ul>
    <li><strong>Email:</strong> <a href="mailto:support@certxa.com">support@certxa.com</a></li>
    <li><strong>Legal inquiries:</strong> <a href="mailto:legal@certxa.com">legal@certxa.com</a></li>
    <li><strong>Website:</strong> <a href="/contact">certxa.com/contact</a></li>
  </ul>
  <p style="margin-top:24px;font-size:.88rem;color:#64748b;">© <?= date('Y') ?> Certxa. All rights reserved.</p>

</div>

<?php require 'includes/footer.php'; ?>
