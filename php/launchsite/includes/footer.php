<?php if (basename($_SERVER['PHP_SELF']) !== 'preview.php'): ?>
<footer class="site-footer">
    <div class="container">
        <div class="footer-grid">
            <div class="footer-brand">
                <a href="/" class="logo">
                    <span class="logo-text">Certxa<span class="logo-dot">.</span></span>
                </a>
                <p class="footer-tagline">Professional salon websites, built and ready to launch — with your domain, your brand, your text.</p>
            </div>
            <div class="footer-col">
                <h4>Product</h4>
                <ul>
                    <li><a href="/launchsite/">Launchit</a></li>
                    <li><a href="/salonos.php">SalonOS</a></li>
                    <li><a href="/pricing.php">Pricing</a></li>
                </ul>
            </div>
            <div class="footer-col">
                <h4>Designs</h4>
                <ul>
                    <li><a href="/launchsite/hair-salons">Hair Salons</a></li>
                    <li><a href="/launchsite/barbershops">Barbershops</a></li>
                    <li><a href="/launchsite/nail-salons">Nail Salons</a></li>
                </ul>
            </div>
            <div class="footer-col">
                <h4>Company</h4>
                <ul>
                    <li><a href="/about">About</a></li>
                    <li><a href="/contact.php">Contact</a></li>
                    <li><a href="/privacy">Privacy Policy</a></li>
                    <li><a href="/terms">Terms of Service</a></li>
                </ul>
            </div>
        </div>
        <div class="footer-bottom">
            <p>&copy; <?php echo date('Y'); ?> Certxa. All rights reserved.</p>
        </div>
    </div>
</footer>
<?php endif; ?>
<script src="<?php echo BASE_PATH; ?>/assets/js/main.js"></script>
</body>
</html>
