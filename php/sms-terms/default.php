<?php
define('BRAND_NAME',     'Certxa');
define('PAGE_TITLE',     'SMS Text Messaging Terms & Conditions | Certxa');
define('PAGE_DESC',      'Certxa SMS Text Messaging Terms & Conditions — learn how we use SMS text messaging, how to opt in and out, and your rights regarding automated messages.');
define('PAGE_KEYWORDS',  'certxa sms terms, text messaging terms, SMS conditions, opt out sms, certxa text messages');
define('PAGE_CANONICAL', 'https://certxa.com/sms-terms');
define('PAGE_BREADCRUMBS', json_encode([
  ['name'=>'Home',                                'url'=>'https://certxa.com/'],
  ['name'=>'SMS Text Messaging Terms & Conditions', 'url'=>'https://certxa.com/sms-terms'],
]));
require __DIR__ . '/../includes/header.php';
require __DIR__ . '/../includes/nav.php';

$updated = 'July 28, 2026';
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
.highlight-box {
  background: #f0fdf4;
  border: 1.5px solid #86efac;
  border-radius: 10px;
  padding: 24px 28px;
  margin: 32px 0;
}
.highlight-box p { margin: 0 0 8px; color: #166534; font-size: .94rem; }
.highlight-box p:last-child { margin-bottom: 0; }
.highlight-box strong { color: #14532d; }
.warning-box {
  background: #fff7ed;
  border: 1px solid #fed7aa;
  border-radius: 10px;
  padding: 20px 24px;
  margin: 24px 0;
}
.warning-box p { margin: 0; color: #9a3412; font-size: .92rem; }
.legal-wrap table {
  width: 100%;
  border-collapse: collapse;
  margin: 20px 0 28px;
  font-size: .93rem;
}
.legal-wrap table th {
  background: #f8fafc;
  font-weight: 700;
  color: #0f172a;
  padding: 10px 14px;
  text-align: left;
  border: 1px solid #e2e8f0;
}
.legal-wrap table td {
  padding: 10px 14px;
  border: 1px solid #e2e8f0;
  color: #334155;
  vertical-align: top;
}
.legal-wrap table tr:nth-child(even) td { background: #f8fafc; }
</style>

<div class="legal-hero">
  <h1>SMS Text Messaging Terms &amp; Conditions</h1>
  <p>Last updated: <?= htmlspecialchars($updated) ?></p>
</div>

<div class="legal-wrap">

  <div class="notice-box">
    <p>Certxa provides these SMS Text Messaging Terms &amp; Conditions ("SMS Terms") to explain how we use SMS text messaging. Please read them carefully. By opting in to receive text messages from Certxa, you agree to be bound by these SMS Terms.</p>
  </div>

  <h2>1. Consent to Receive Text Messages</h2>
  <p>By completing the opt-in process — whether through our website, mobile app, or during account registration — you expressly consent to receive marketing and non-marketing text messages from Certxa, Inc. ("Certxa," "we," "us," or "our"), including messages sent using an automatic telephone dialing system or automated technology, at the mobile number you provide.</p>
  <p>Messages may be recurring or one-time and may include, but are not limited to:</p>
  <ul>
    <li>Appointment reminders and booking confirmations</li>
    <li>Promotional offers, discounts, and special announcements</li>
    <li>Waitlist notifications and check-in updates</li>
    <li>Account alerts, billing notices, and service updates</li>
    <li>Responses to messages you initiate with us</li>
  </ul>
  <p><strong>Opting in to receive text messages is not a condition of purchasing any products or services from Certxa.</strong> By providing your mobile number and opting in, you confirm that you have ownership rights to, or permission to use, the mobile number you provide to us.</p>

  <h2>2. How to Opt Out</h2>
  <p>You may opt out of receiving text messages from Certxa at any time. To unsubscribe, reply <strong>STOP</strong> to any message you have received from us. After we receive your opt-out request, we will send you a one-time confirmation message and you will no longer receive SMS messages from that particular short code or number.</p>
  <p>If you wish to re-subscribe in the future, you may do so by opting in again through the same method you used originally, and Certxa will resume sending messages to you.</p>

  <div class="highlight-box">
    <p><strong>Quick Reference — Standard SMS Commands</strong></p>
    <p>Reply <strong>STOP</strong> to unsubscribe from all messages.</p>
    <p>Reply <strong>HELP</strong> to receive support information and contact details.</p>
    <p>Reply <strong>INFO</strong> to receive information about the program you are enrolled in.</p>
  </div>

  <h2>3. How to Get Help</h2>
  <p>You can receive assistance at any time by:</p>
  <ul>
    <li>Replying <strong>HELP</strong> to any text message you receive from Certxa</li>
    <li>Emailing us at <a href="mailto:support@certxa.com">support@certxa.com</a></li>
    <li>Visiting our <a href="/contact">Contact page</a></li>
  </ul>

  <h2>4. Message Frequency</h2>
  <p>The number of messages you receive will vary based on your account activity, the services you use, and the programs you opt into. Appointment-related messages are triggered by your booking activity. Promotional messages are sent periodically and may vary in frequency.</p>

  <h2>5. Message and Data Rates</h2>
  <div class="warning-box">
    <p><strong>Message and data rates may apply.</strong> Any messages sent to you from Certxa, or sent by you to Certxa, may be subject to charges from your wireless carrier. If you have questions about your text or data plan, please contact your wireless provider directly.</p>
  </div>
  <p>Certxa is not responsible for any fees or charges assessed by your wireless carrier in connection with SMS messages.</p>

  <h2>6. Supported Carriers</h2>
  <p>Certxa's SMS services are available on most major U.S. wireless carriers, including but not limited to AT&amp;T, Verizon, T-Mobile, Sprint, U.S. Cellular, and their affiliates. Availability may vary by carrier. Certxa and your wireless carrier are not liable for delayed or undelivered messages.</p>

  <h2>7. Information We Collect via SMS</h2>
  <p>Data obtained from you in connection with this SMS messaging service may include:</p>
  <ul>
    <li>Your mobile phone number</li>
    <li>Your wireless carrier's name</li>
    <li>The date, time, and content of messages you send to or receive from us</li>
    <li>Other information you provide to Certxa as part of the service</li>
  </ul>
  <p>Certxa may use this information to contact you, provide services you request, and as described in our <a href="/privacy">Privacy Policy</a>. We do not sell or share your mobile phone number with third parties for their own marketing purposes.</p>

  <h2>8. Privacy</h2>
  <p>Your use of Certxa's SMS services is also governed by our <a href="/privacy">Privacy Policy</a>, which is incorporated into these SMS Terms by reference. If you have questions regarding our privacy practices, please review our Privacy Policy at <a href="https://certxa.com/privacy">certxa.com/privacy</a>.</p>

  <h2>9. Changes to These SMS Terms</h2>
  <p>Certxa may revise, modify, or amend these SMS Terms at any time. Any such revision, modification, or amendment shall take effect when it is posted to the Certxa website. We encourage you to review these SMS Terms periodically to ensure that you are aware of any changes. Your continued consent to receive text messages from Certxa following any posted changes will constitute your acceptance of those changes.</p>

  <h2>10. Relationship to Other Terms</h2>
  <p>These SMS Terms do not supersede the terms contained in our <a href="/terms">Terms of Service</a>. In the event of any conflict between these SMS Terms and the Terms of Service, such conflict shall be resolved in favor of the Terms of Service, which are controlling over these SMS Terms to the extent permitted by applicable law.</p>

  <h2>11. Contact Us</h2>
  <p>If you have any questions about these SMS Terms or our text messaging practices, please contact us:</p>
  <table>
    <tr><th>Method</th><th>Details</th></tr>
    <tr><td>Email</td><td><a href="mailto:support@certxa.com">support@certxa.com</a></td></tr>
    <tr><td>Website</td><td><a href="/contact">certxa.com/contact</a></td></tr>
    <tr><td>Mailing Address</td><td>Certxa, Inc.<br>Legal Department<br>United States</td></tr>
  </table>

</div>

<?php require __DIR__ . '/../includes/footer.php'; ?>
