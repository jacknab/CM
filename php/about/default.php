<?php
define('BRAND_NAME',     'Certxa');
define('PAGE_TITLE',     'About Certxa | Salon Software');
define('PAGE_DESC',      'We started Certxa with a simple idea: salon software should help you run your business—not overwhelm it. One platform for booking, POS, payments, team management, payroll, websites, and more.');
define('PAGE_KEYWORDS',  'about certxa, certxa story, salon software platform, all-in-one salon software, certxa mission');
define('PAGE_CANONICAL', 'https://certxa.com/about');
define('PAGE_OG_IMAGE',  'https://certxa.com/assets/images/og-about.jpg');
define('PAGE_BREADCRUMBS', json_encode([
  ['name'=>'Home',  'url'=>'https://certxa.com/'],
  ['name'=>'About', 'url'=>'https://certxa.com/about'],
]));
define('PAGE_SCHEMA', json_encode([
  [
    '@type'       => 'AboutPage',
    '@id'         => 'https://certxa.com/about',
    'url'         => 'https://certxa.com/about',
    'name'        => 'About Certxa — Salon Software Built to Depend On',
    'description' => 'Certxa brings online booking, point of sale, payments, client management, team management, payroll, websites, marketing, and AI-powered tools together in one platform.',
    'publisher'   => ['@id' => 'https://certxa.com/#organization'],
    'mainEntity'  => [
      '@type'       => 'Organization',
      '@id'         => 'https://certxa.com/#organization',
      'name'        => 'Certxa',
      'url'         => 'https://certxa.com',
      'foundingDate'=> '2023',
      'description' => 'Certxa builds all-in-one salon management software with online booking, point of sale, payments, client management, team management, payroll, websites, marketing, and AI-powered tools.',
      'knowsAbout'  => ['Salon Software','Beauty Business Management','Salon Booking Systems','Client Management Software'],
    ],
  ],
]));
require 'includes/header.php';
require 'includes/nav.php';
?>

<style>
.about-hero {
  background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
  padding: 100px 24px 80px;
  text-align: center;
  color: #fff;
}
.about-hero h1 {
  font-family: 'Inter', sans-serif;
  font-size: clamp(2.2rem, 5vw, 3.4rem);
  font-weight: 800;
  letter-spacing: -.035em;
  margin: 0 0 20px;
  line-height: 1.1;
}
.about-hero p {
  color: #94a3b8;
  font-size: 1.1rem;
  max-width: 580px;
  margin: 0 auto;
  font-family: 'Inter', sans-serif;
  line-height: 1.65;
}
.about-wrap {
  max-width: 720px;
  margin: 0 auto;
  padding: 80px 24px 100px;
  font-family: 'Inter', sans-serif;
  color: #1e293b;
  line-height: 1.8;
}
.about-wrap p {
  font-size: 1.05rem;
  color: #475569;
  margin-bottom: 20px;
}
.about-wrap p.closing {
  font-size: 1.1rem;
  font-weight: 700;
  color: #0f172a;
  margin-bottom: 10px;
}
.contact-banner {
  background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
  border-radius: 20px;
  padding: 48px 40px;
  text-align: center;
  margin-top: 72px;
  color: #fff;
}
.contact-banner h2 {
  color: #fff;
  margin: 0 0 12px;
  font-size: 1.8rem;
  font-family: 'Inter', sans-serif;
  font-weight: 800;
  letter-spacing: -.03em;
}
.contact-banner p { color: rgba(255,255,255,.8); margin: 0 0 24px; font-size: 1rem; font-family: 'Inter', sans-serif; }
.contact-banner a {
  display: inline-block;
  background: #fff;
  color: #6366f1;
  font-weight: 700;
  font-size: .95rem;
  padding: 14px 32px;
  border-radius: 9999px;
  text-decoration: none;
  font-family: 'Inter', sans-serif;
}
@media (max-width: 640px) {
  .contact-banner { padding: 36px 24px; }
}
</style>

<div class="about-hero">
  <h1>About Certxa</h1>
  <p>Salon software should help you run your business—not overwhelm it.</p>
</div>

<div class="about-wrap">

  <p>We started Certxa with a simple idea: salon software should help you run your business—not overwhelm it.</p>

  <p>Many platforms require multiple subscriptions, disconnected tools, and complicated workflows just to manage everyday tasks. We wanted to build something different.</p>

  <p>Certxa brings online booking, point of sale, payments, client management, team management, payroll, websites, marketing, and AI-powered tools together in one platform, so you spend less time switching between systems and more time focusing on your clients.</p>

  <p>We believe software should earn your trust through reliability and transparency, not exaggerated promises. That's why we focus on building features that solve real problems instead of making claims we can't prove. Certxa won't magically fill your calendar or grow your business overnight. What it can do is give you the tools to operate more efficiently, deliver a better client experience, and make informed decisions.</p>

  <p>Every feature is designed with simplicity in mind. Whether you're an independent technician, a growing salon, or managing multiple locations, Certxa is built to scale with your business without adding unnecessary complexity.</p>

  <p>We're just getting started, and we're committed to listening to salon owners, improving the platform, and building software based on real feedback from the professionals who use it every day.</p>

  <p class="closing">Our goal isn't to be the loudest salon software company.</p>
  <p class="closing">Our goal is to build one that salon owners can depend on.</p>

  <div class="contact-banner">
    <h2>Want to talk to a real person?</h2>
    <p>We're here to help. Reach out anytime.</p>
    <a href="/contact">Get in touch</a>
  </div>

</div>

<?php require 'includes/footer.php'; ?>
