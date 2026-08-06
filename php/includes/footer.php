<?php defined('BRAND_NAME') or define('BRAND_NAME', 'Certxa'); ?>
</main>

<footer class="footer">
  <div class="container">
    <div class="footer-grid">

      <div class="footer-brand">
        <a href="/overview" class="footer-logo"><?= BRAND_NAME ?><span>.</span></a>
        <p class="footer-tagline">The all-in-one platform built for nail salons — booking, POS, kiosk, waitlist, and AI receptionist in one system.</p>
      </div>

      <div>
        <p class="footer-col-title">Product</p>
        <ul class="footer-col-links">
          <li><a href="/online-booking">Online Booking</a></li>
          <li><a href="/checkin-kiosk">Self-Service Kiosk</a></li>
          <li><a href="/salonos#loyalty">Loyalty Rewards</a></li>
          <li><a href="/salonos#waitlist">Waitlist</a></li>
          <li><a href="/autumn">AI Receptionist</a></li>
          <li><a href="/salonos#pos">POS</a></li>
          <li><a href="/launchsite">Website Builder</a></li>
        </ul>
      </div>

      <div>
        <p class="footer-col-title">Company</p>
        <ul class="footer-col-links">
          <li><a href="/pricing">Pricing</a></li>
          <li><a href="/about">About Us</a></li>
          <li><a href="/blog">Blog</a></li>
          <li><a href="/contact">Contact</a></li>
        </ul>
        <p class="footer-col-title" style="margin-top:20px;">Login</p>
        <ul class="footer-col-links">
          <li><a href="/auth">Owner Login</a></li>
          <li><a href="/staff-auth">Staff Login</a></li>
        </ul>
      </div>

    </div>

    <div class="footer-bottom">
      <div class="footer-bottom-left">&copy; <?= date('Y') ?> <?= BRAND_NAME ?>. All rights reserved.</div>
      <div class="footer-bottom-right">
        <a href="/privacy">Privacy Policy</a>
        <a href="/terms">Terms of Service</a>
        <a href="/sms-terms">SMS Terms</a>
      </div>
    </div>
  </div>
</footer>

<script src="/assets/js/main.js"></script>
<script>
(function() {
  fetch('/api/public/trial-days').then(function(r){ return r.json(); }).then(function(d) {
    var days = d && d.days ? d.days : 60;
    document.querySelectorAll('.js-trial-days').forEach(function(el) { el.textContent = days; });
  }).catch(function(){});
})();
</script>
</body>
</html>
