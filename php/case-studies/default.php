<?php
define('BRAND_NAME',    'Certxa');
define('PAGE_TITLE',    'Why Nail Salons Choose Certxa | Certxa');
define('PAGE_DESC',     'Certxa is a new platform, built by a nail salon owner — not a marketing team. Here is the story behind it, and what early customers actually get.');
define('PAGE_KEYWORDS', 'certxa story, nail salon software founder, tom tham certxa, why choose certxa, nail salon software built by a salon owner');
define('PAGE_CANONICAL','https://certxa.com/case-studies');
define('PAGE_BREADCRUMBS', json_encode([
  ['name'=>'Home','url'=>'https://certxa.com/'],
  ['name'=>'Why Certxa','url'=>'https://certxa.com/case-studies'],
]));
define('PAGE_SCHEMA', json_encode([
  [
    '@type'       => 'WebPage',
    '@id'         => 'https://certxa.com/case-studies',
    'name'        => 'Why Nail Salons Choose Certxa',
    'description' => 'Certxa is a new platform, built by a nail salon owner. This page explains the founding story and what early customers get.',
    'url'         => 'https://certxa.com/case-studies',
    'isPartOf'    => ['@id'=>'https://certxa.com/#website'],
    'about'       => ['@id'=>'https://certxa.com/#software'],
  ],
]));
require 'includes/header.php';
require 'includes/nav.php';
?>

<!-- HERO -->
<section class="hero-dark-section" style="padding:90px 0 70px;text-align:center;">
  <div class="orb orb-1"></div><div class="orb orb-2"></div>
  <div class="container" style="max-width:720px;">
    <span class="tag tag-gold" style="margin-bottom:20px;display:inline-block;">Founded February 2026</span>
    <h1 class="hero-dark-headline" style="font-size:clamp(2.2rem,5vw,3.6rem);margin-bottom:20px;">
      We're new.<br><em>Here's why that's a good thing.</em>
    </h1>
    <p class="hero-dark-sub" style="max-width:560px;margin:0 auto;">Certxa doesn't have a decade of case studies yet. What it has is a founder who ran a nail salon himself, and a platform built to fix exactly what he found frustrating about the software that came before it.</p>
  </div>
</section>

<!-- FOUNDER STORY -->
<section class="section" id="founder">
  <div class="container" style="max-width:920px;">
    <div class="feature-block">
      <div class="feature-content">
        <span class="tag tag-plum">Why Certxa Exists</span>
        <h2 class="feature-title">Built by a nail salon owner, not a marketing team.</h2>
        <p class="feature-text">Certxa was founded in Phoenix, Arizona by Tom Tham, a Vietnamese nail salon owner himself. Tom started Certxa after watching Vietnamese-owned nail salons — a community he's part of — get pushed into long-term contracts with existing salon software providers just to get basic booking and check-in tools. He wanted to build something different: software with no long-term lock-in, made by someone who has actually run a nail salon.</p>
        <p class="feature-text">That's still the idea behind Certxa today — not the loudest salon software company, just one salon owners can depend on.</p>
        <div style="margin-top:20px;display:flex;gap:10px;">
          <a href="/about" class="btn btn-primary">Read the Full Story</a>
          <a href="/auth?mode=register" style="font-size:.85rem;color:var(--plum);font-weight:600;display:flex;align-items:center;gap:4px;">Start Free Trial →</a>
        </div>
      </div>
      <div class="feature-visual" style="background:linear-gradient(145deg,#f5f3ff,#ede9fe);">
        <div style="text-align:center;padding:16px;">
          <div style="font-size:.75rem;font-weight:700;color:var(--plum);text-transform:uppercase;letter-spacing:.1em;margin-bottom:16px;">Certxa at a glance</div>
          <?php foreach ([['Founded','Feb 2026'],['HQ','Phoenix, AZ'],['Built by','A nail salon owner'],['Contracts','None — cancel any time']] as $f): ?>
          <div style="display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid rgba(59,7,100,.1);">
            <span style="font-size:.82rem;color:var(--mid-grey);"><?= $f[0] ?></span>
            <span style="font-size:.82rem;font-weight:700;color:var(--plum);"><?= $f[1] ?></span>
          </div>
          <?php endforeach; ?>
        </div>
      </div>
    </div>
  </div>
</section>

<!-- WHAT EARLY CUSTOMERS GET -->
<section class="section section-alt">
  <div class="container" style="max-width:920px;">
    <div class="section-header">
      <span class="tag tag-gold">Early Customer</span>
      <h2 class="section-title">What you get by joining early</h2>
      <p class="section-subtitle">Honestly, this isn't a page of manufactured success metrics. Here's what being an early Certxa customer actually looks like.</p>
    </div>
    <div class="bento" style="grid-template-columns:repeat(3,1fr);margin-top:40px;">
      <div class="bento-card">
        <h3 class="bento-title">Direct access to the founder</h3>
        <p class="bento-text">Support requests and feature ideas reach a nail salon owner who understands the day-to-day, not a support queue.</p>
      </div>
      <div class="bento-card">
        <h3 class="bento-title">A say in what gets built next</h3>
        <p class="bento-text">Early customer feedback directly shapes the roadmap — you're not waiting years for a request to be heard.</p>
      </div>
      <div class="bento-card">
        <h3 class="bento-title">No long-term contract</h3>
        <p class="bento-text">Month to month, cancel any time. Certxa was built specifically to avoid the lock-in other platforms require.</p>
      </div>
    </div>
  </div>
</section>

<!-- CTA -->
<section style="background:var(--plum);padding:56px 0;">
  <div class="container" style="max-width:680px;text-align:center;">
    <h2 style="font-family:'Cormorant Garamond',serif;font-size:1.8rem;color:#fff;margin-bottom:8px;">Be one of Certxa's first success stories.</h2>
    <p style="color:rgba(255,255,255,.7);margin-bottom:28px;">Start your free <?= TRIAL_DAYS ?>-day trial. No charge until it ends.</p>
    <a href="/auth?mode=register" class="btn btn-gold btn-lg">Start Your <?= TRIAL_DAYS ?>-Day Free Trial</a>
    <p style="color:rgba(255,255,255,.5);font-size:.78rem;margin-top:12px;">Credit card required · No charge until trial ends &middot; No setup fees &middot; Cancel any time</p>
  </div>
</section>

<?php require 'includes/footer.php'; ?>
