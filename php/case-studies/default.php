<?php
define('BRAND_NAME',    'Certxa');
define('PAGE_TITLE',    'Nail Studio Success Stories & Case Studies | Real Results with Certxa');
define('PAGE_DESC',     'See how real nail studios and nail technicians transformed their business with Certxa. From solo booth renters to multi-location nail studios — read the numbers, hear the stories.');
define('PAGE_KEYWORDS', 'nail salon software success stories, certxa case studies, nail salon booking software results, nail salon software reviews, nail tech software results, certxa reviews, nail salon management software testimonials');
define('PAGE_CANONICAL','https://certxa.com/case-studies');
define('PAGE_BREADCRUMBS', json_encode([
  ['name'=>'Home','url'=>'https://certxa.com/'],
  ['name'=>'Success Stories','url'=>'https://certxa.com/case-studies'],
]));
define('PAGE_SCHEMA', json_encode([
  [
    '@type'      => 'ItemList',
    'name'       => 'Certxa Salon Customer Success Stories',
    'itemListElement' => [
      ['@type'=>'ListItem','position'=>1,'name'=>'Jessica Mitchell — 40% more bookings in 60 days','url'=>'https://certxa.com/case-studies#jessica'],
      ['@type'=>'ListItem','position'=>2,'name'=>'Ava Laurent — Nail studio revenue up 52%','url'=>'https://certxa.com/case-studies#ava'],
    ],
  ],
]));
require 'includes/header.php';
require 'includes/nav.php';
?>

<!-- HERO -->
<section class="hero-dark-section" style="padding:90px 0 70px;text-align:center;">
  <div class="orb orb-1"></div><div class="orb orb-2"></div>
  <div class="container" style="max-width:760px;">
    <h1 class="hero-dark-headline" style="font-size:clamp(2.2rem,5vw,3.6rem);margin-bottom:20px;">
      Real nail studios.<br><em>Real results.</em>
    </h1>
    <p class="hero-dark-sub" style="max-width:560px;margin:0 auto 40px;">See what happened when these nail technicians and studio owners switched to Certxa.</p>
    <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:16px;max-width:400px;margin:0 auto;">
      <?php foreach ([['68%','No-show reduction reported'],['40%','Avg booking increase reported']] as $s): ?>
      <div style="background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.12);border-radius:var(--radius-md);padding:16px 12px;text-align:center;">
        <div style="font-size:1.4rem;font-weight:800;color:var(--gold-bright);"><?= $s[0] ?></div>
        <div style="font-size:.72rem;color:rgba(255,255,255,.6);margin-top:4px;"><?= $s[1] ?></div>
      </div>
      <?php endforeach; ?>
    </div>
  </div>
</section>

<!-- CASE STUDY 1 -->
<section class="section" id="jessica">
  <div class="container" style="max-width:920px;">
    <div class="feature-block">
      <div class="feature-content">
        <span class="tag tag-plum">Nail Studio · London</span>
        <h2 class="feature-title">"40% more bookings. 68% fewer no-shows. In 60 days."</h2>
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin:20px 0;">
          <?php foreach ([['Before','4–6 no-shows/week','No-shows'],['After','Under 1/week','No-shows'],['Revenue','Up 40%','First 60 days']] as $m): ?>
          <div style="background:<?= $m[0]==='After' ? 'var(--plum-light)' : 'var(--cream)' ?>;border-radius:var(--radius-md);padding:16px;text-align:center;border:1px solid <?= $m[0]==='After' ? 'var(--plum)' : 'var(--light-grey)' ?>;">
            <div style="font-size:.65rem;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:var(--mid-grey);margin-bottom:4px;"><?= $m[0] ?></div>
            <div style="font-size:1.1rem;font-weight:800;color:<?= $m[0]==='After' ? 'var(--plum)' : 'var(--charcoal)' ?>;"><?= $m[1] ?></div>
            <div style="font-size:.72rem;color:var(--mid-grey);"><?= $m[2] ?></div>
          </div>
          <?php endforeach; ?>
        </div>
        <p class="feature-text">"I was losing hundreds of pounds a week to no-shows, especially on gel manicure and nail art days. The moment I turned on deposits in Certxa and set up the automated reminders, everything changed. My no-show rate dropped from 5–6 a week to less than 1. And because my clients were booking themselves online 24/7, my total bookings jumped 40% in the first two months."</p>
        <p style="font-weight:700;color:var(--charcoal);font-size:.88rem;">— Jessica Mitchell, Nail Technician &amp; Salon Owner, London</p>
        <div style="margin-top:20px;display:flex;gap:10px;">
          <a href="#" class="btn btn-primary">Start My Free Trial</a>
          <a href="/online-booking" style="font-size:.85rem;color:var(--plum);font-weight:600;display:flex;align-items:center;gap:4px;">Online Booking features →</a>
        </div>
      </div>
      <div class="feature-visual" style="background:linear-gradient(145deg,#f5f3ff,#ede9fe);">
        <div style="text-align:center;padding:16px;">
          <div style="font-size:.75rem;font-weight:700;color:var(--plum);text-transform:uppercase;letter-spacing:.1em;margin-bottom:16px;">Weekly No-Show Rate</div>
          <?php foreach ([['Before Certxa',85,'#e5e7eb'],['Month 1',45,'#c4b5fd'],['Month 2',12,'var(--plum)']] as $b): ?>
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;">
            <div style="font-size:.75rem;color:var(--mid-grey);width:90px;text-align:right;"><?= $b[0] ?></div>
            <div style="flex:1;background:#f3f4f6;border-radius:50px;height:12px;overflow:hidden;">
              <div style="width:<?= $b[1] ?>%;background:<?= $b[2] ?>;height:100%;border-radius:50px;transition:width 1s;"></div>
            </div>
            <div style="font-size:.75rem;font-weight:700;color:var(--charcoal);width:30px;"><?= $b[1] ?>%</div>
          </div>
          <?php endforeach; ?>
          <div style="margin-top:20px;background:var(--plum);color:#fff;border-radius:10px;padding:14px;">
            <div style="font-size:1.6rem;font-weight:800;">68%</div>
            <div style="font-size:.8rem;opacity:.85;">Reduction in no-shows</div>
          </div>
        </div>
      </div>
    </div>
  </div>
</section>

<!-- CASE STUDY 2 -->
<section class="section" id="ava">
  <div class="container" style="max-width:920px;">
    <div class="feature-block">
      <div class="feature-content">
        <span class="tag tag-plum">Nail Studio · New York</span>
        <h2 class="feature-title">"Revenue up 52%. No-shows down to almost zero."</h2>
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin:20px 0;">
          <?php foreach ([['Revenue','Up 52%','First 3 months'],['No-shows','Down 91%','With deposits on'],['Online Bookings','78%','Of all appointments']] as $m): ?>
          <div style="background:var(--plum-light);border-radius:var(--radius-md);padding:16px;text-align:center;border:1px solid rgba(59,7,100,.15);">
            <div style="font-size:.65rem;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:var(--mid-grey);margin-bottom:4px;"><?= $m[0] ?></div>
            <div style="font-size:1.1rem;font-weight:800;color:var(--plum);"><?= $m[1] ?></div>
            <div style="font-size:.72rem;color:var(--mid-grey);"><?= $m[2] ?></div>
          </div>
          <?php endforeach; ?>
        </div>
        <p class="feature-text">"I run a nail studio with two techs and before Certxa, no-shows were killing us. Full-set appointments are two hours minimum — a no-show wastes the whole slot. I turned on deposits for all gel and acrylic bookings and the no-shows practically vanished. Combined with 24/7 online booking, my revenue is up 52% in the first three months because I'm filling slots I was previously losing."</p>
        <p style="font-weight:700;color:var(--charcoal);font-size:.88rem;">— Ava Laurent, Owner, Studio Lux Nails, New York</p>
        <div style="margin-top:20px;display:flex;gap:10px;">
          <a href="#" class="btn btn-primary">Start My Free Trial</a>
          <a href="/nail-salon-software" style="font-size:.85rem;color:var(--plum);font-weight:600;display:flex;align-items:center;gap:4px;">Nail salon features →</a>
        </div>
      </div>
      <div class="feature-visual" style="background:linear-gradient(145deg,#fdf2f8,#fce7f3);">
        <div style="text-align:center;padding:16px;">
          <div style="font-size:.75rem;font-weight:700;color:#be185d;text-transform:uppercase;letter-spacing:.1em;margin-bottom:16px;">Revenue Growth</div>
          <?php foreach ([['Month 1','$4,200',40],['Month 2','$5,800',70],['Month 3','$6,380',85]] as $r): ?>
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;">
            <div style="font-size:.75rem;color:var(--mid-grey);width:60px;text-align:right;"><?= $r[0] ?></div>
            <div style="flex:1;background:#f3f4f6;border-radius:50px;height:20px;overflow:hidden;">
              <div style="width:<?= $r[2] ?>%;background:linear-gradient(90deg,#f9a8d4,#ec4899);height:100%;border-radius:50px;display:flex;align-items:center;justify-content:flex-end;padding-right:8px;">
                <span style="font-size:.65rem;font-weight:700;color:#fff;"><?= $r[1] ?></span>
              </div>
            </div>
          </div>
          <?php endforeach; ?>
          <div style="margin-top:16px;background:#ec4899;color:#fff;border-radius:10px;padding:14px;">
            <div style="font-size:1.6rem;font-weight:800;">+52%</div>
            <div style="font-size:.8rem;opacity:.9;">Revenue increase in 90 days</div>
          </div>
        </div>
      </div>
    </div>
  </div>
</section>

<!-- RATINGS STRIP -->
<section style="background:var(--plum);padding:48px 0;">
  <div class="container" style="max-width:860px;text-align:center;">
    <h2 style="font-family:'Cormorant Garamond',serif;font-size:1.8rem;color:#fff;margin-bottom:8px;">Built exclusively for nail studios and nail technicians.</h2>
    <p style="color:rgba(255,255,255,.7);margin-bottom:28px;">Start your free <?= TRIAL_DAYS ?>-day trial. No charge until it ends.</p>
    <div style="display:flex;gap:16px;justify-content:center;flex-wrap:wrap;margin-bottom:28px;">
      <?php foreach ([
        ['"Honestly the best decision I made for my business."','Priya M., Nail Studio Owner'],
        ['"The support team is incredible. They helped me set everything up in an hour."','Keisha T., Nail Technician'],
      ] as $r): ?>
      <div style="background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.15);border-radius:var(--radius-md);padding:18px 20px;max-width:260px;text-align:left;">
        <div style="color:var(--gold-bright);font-size:.85rem;margin-bottom:8px;">★★★★★</div>
        <p style="color:rgba(255,255,255,.85);font-size:.82rem;line-height:1.55;font-style:italic;margin-bottom:10px;"><?= $r[0] ?></p>
        <div style="font-size:.72rem;color:rgba(255,255,255,.5);"><?= $r[1] ?></div>
      </div>
      <?php endforeach; ?>
    </div>
    <a href="/auth?mode=register" class="btn btn-gold btn-lg">Start Your <?= TRIAL_DAYS ?>-Day Free Trial</a>
    <p style="color:rgba(255,255,255,.5);font-size:.78rem;margin-top:12px;">Credit card required · No charge until trial ends &middot; No setup fees &middot; Cancel any time</p>
  </div>
</section>

<?php require 'includes/footer.php'; ?>
