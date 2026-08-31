<?php
define('BRAND_NAME',    'Certxa');
define('PAGE_TITLE',    'Salon Review Management | Certxa');
define('PAGE_DESC',     'Automatically collect 5-star Google reviews after every appointment. Certxa salon review management software builds your online reputation on autopilot — helping new clients find and choose your salon every day.');
define('PAGE_KEYWORDS', 'salon review management, beauty salon Google reviews, salon reputation management, automated salon reviews, hair salon review software, get more salon reviews, salon star rating, nail salon reviews, salon review automation');
define('PAGE_CANONICAL', 'https://certxa.com/client-reviews');
define('PAGE_BREADCRUMBS', json_encode([
  ['name'=>'Home','url'=>'https://certxa.com/'],
  ['name'=>'Client Reviews','url'=>'https://certxa.com/client-reviews'],
]));
define('PAGE_SCHEMA', json_encode([
  [
    '@type'       => 'WebPage',
    '@id'         => 'https://certxa.com/client-reviews',
    'name'        => 'Salon Review Management Software — Certxa',
    'description' => 'Automate 5-star Google review collection after every salon appointment to build your online reputation and attract new clients.',
    'url'         => 'https://certxa.com/client-reviews',
    'isPartOf'    => ['@id'=>'https://certxa.com/#website'],
    'about'       => ['@id'=>'https://certxa.com/#software'],
  ],
  [
    '@type'       => 'HowTo',
    'name'        => 'How to get more 5-star Google reviews for your nail salon',
    'description' => 'A repeatable process nail salons can use to steadily grow their Google review count and star rating.',
    'step' => [
      ['@type'=>'HowToStep','position'=>1,'name'=>'Claim and complete your Google Business Profile','text'=>'Verify your salon on Google, add your hours, services, photos, and booking link. Reviews only help if the profile they land on is complete and accurate.','url'=>'https://certxa.com/client-reviews#how-to'],
      ['@type'=>'HowToStep','position'=>2,'name'=>'Ask every happy client, right after the appointment','text'=>'The best moment is within an hour of the service, while the result is fresh. Ask consistently — not just when you remember.','url'=>'https://certxa.com/client-reviews#how-to'],
      ['@type'=>'HowToStep','position'=>3,'name'=>'Send the request by text with a direct link','text'=>'A text is opened far more often than an email. Link straight to your Google review form so it is one tap, not a search.','url'=>'https://certxa.com/client-reviews#how-to'],
      ['@type'=>'HowToStep','position'=>4,'name'=>'Make the ask personal and specific','text'=>'Use the client\'s name and the service they had. A specific, human message gets a far higher response than a generic blast.','url'=>'https://certxa.com/client-reviews#how-to'],
      ['@type'=>'HowToStep','position'=>5,'name'=>'Reply to every review, good or bad','text'=>'Responding shows future clients you care and keeps your Google Business Profile active. Thank 5-star reviewers; answer criticism calmly and offer to make it right.','url'=>'https://certxa.com/client-reviews#how-to'],
    ],
  ],
  [
    '@type'      => 'FAQPage',
    'mainEntity' => [
      ['@type'=>'Question','name'=>'How do nail salons get more 5-star Google reviews?','acceptedAnswer'=>['@type'=>'Answer','text'=>'Ask every satisfied client right after their appointment, send the request by text with a direct link to your Google review page, personalise the message with their name and service, and reply to every review you receive. Doing this consistently after every appointment is what grows the count — most salons only ask occasionally, which is why their review numbers stay flat.']],
      ['@type'=>'Question','name'=>'When is the best time to ask a client for a review?','acceptedAnswer'=>['@type'=>'Answer','text'=>'Within about an hour of the completed appointment, while the client is still enjoying the result. Response rates drop sharply after the first day. An automated post-appointment text sent on that timing consistently outperforms asking in person at the desk.']],
      ['@type'=>'Question','name'=>'What should a salon review request text say?','acceptedAnswer'=>['@type'=>'Answer','text'=>'Keep it short, warm, and specific: greet the client by name, thank them for coming in for the specific service, and include a one-tap link to your Google review page. For example: "Hi Emma, thank you for coming in for your gel manicure today. If you have a moment, we would love a quick Google review: [link]."']],
      ['@type'=>'Question','name'=>'Is it against Google\'s rules to ask clients for reviews?','acceptedAnswer'=>['@type'=>'Answer','text'=>'No — asking clients for honest reviews is allowed and encouraged. What is against Google\'s policies is offering payment or discounts in exchange for reviews, only asking clients you know are happy while discouraging others, or setting up a review station that filters people by rating before they reach Google. Ask everyone, make it easy for everyone, and let the reviews be honest.']],
      ['@type'=>'Question','name'=>'Should a salon offer a discount in exchange for a review?','acceptedAnswer'=>['@type'=>'Answer','text'=>'No. Incentivising reviews violates Google\'s review policies and US FTC guidance, and Google can remove the reviews or penalise the profile. Offer great service and a frictionless way to leave feedback instead.']],
      ['@type'=>'Question','name'=>'How many Google reviews does a nail salon need?','acceptedAnswer'=>['@type'=>'Answer','text'=>'There is no fixed number, but salons generally become competitive in local results once they are clearly ahead of nearby salons on both review count and recency. A steady trickle of fresh reviews every week matters more than a large number of old ones, because both Google and prospective clients weigh how recent the reviews are.']],
    ],
  ],
]));
require 'includes/header.php';
require 'includes/nav.php';
?>

<!-- HERO -->
<section class="hero hero-reviews" style="padding:110px 0 90px;">
  <div class="container">
    <div class="hero-inner">
      <div class="hero-copy animate-fade-up">
        <div class="hero-badge"><span class="tag" style="background:#FDE68A;color:#78350F;">Client Reviews</span></div>
        <h1 class="hero-headline" style="color:#78350F;">Your reputation,<br><em style="color:#D97706;">working for you.</em></h1>
        <p class="hero-subtext">Certxa automatically asks every happy client for a review right after their appointment — when their experience is fresh and they're most likely to rave about you. Build five-star credibility on autopilot.</p>
        <div class="hero-actions">
          <a href="/auth?mode=register" class="btn btn-primary">Start Collecting Reviews</a>
          <a href="/client-notifications" class="btn btn-secondary">Explore Client Notifications</a>
        </div>
        <p class="hero-note">Automated &middot; Google, Facebook &amp; Trustpilot &middot; No chasing required</p>
      </div>
      <div class="hero-visual animate-fade-up animate-delay-2">
        <div class="hero-mockup">
          <div class="hero-mockup-header">
            <div class="mockup-dot red"></div>
            <div class="mockup-dot yellow"></div>
            <div class="mockup-dot green"></div>
            <div class="mockup-bar">Reviews Dashboard</div>
          </div>
          <div style="text-align:center;padding:8px 0 16px;">
            <div style="font-family:'Cormorant Garamond',serif;font-size:3rem;font-weight:600;color:var(--plum);line-height:1;">4.9</div>
            <div style="color:var(--gold-bright);font-size:1.4rem;margin-bottom:4px;">★★★★★</div>
            <div style="font-size:.78rem;color:var(--mid-grey);">Based on 284 reviews</div>
          </div>
          <?php
          $reviews = [
            ['SJ', 'Sarah J.', '"The gel manicure is perfect — exactly what I wanted. Will definitely be back!"', '★★★★★', '2 hours ago'],
            ['ML', 'Marcus L.', '"Best nail salon I\'ve found. Friendly, professional, and the nail art is outstanding."', '★★★★★', 'Yesterday'],
            ['PK', 'Priya K.', '"Lovely atmosphere and my nail tech really listened to what I wanted."', '★★★★★', '2 days ago'],
          ];
          foreach ($reviews as $r):
          ?>
          <div style="border-top:1px solid var(--light-grey);padding:12px 0;">
            <div style="display:flex;align-items:center;gap:10px;margin-bottom:6px;">
              <div style="width:30px;height:30px;border-radius:50%;background:var(--plum);color:#fff;font-size:.72rem;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0;"><?= $r[0] ?></div>
              <div>
                <div style="font-weight:600;font-size:.82rem;"><?= $r[1] ?></div>
                <div style="font-size:.72rem;color:var(--gold-bright);"><?= $r[3] ?></div>
              </div>
              <div style="margin-left:auto;font-size:.7rem;color:var(--mid-grey);"><?= $r[4] ?></div>
            </div>
            <div style="font-size:.8rem;color:var(--mid-grey);line-height:1.5;font-style:italic;"><?= $r[2] ?></div>
          </div>
          <?php endforeach; ?>
        </div>
      </div>
    </div>
  </div>
</section>

<!-- STATS -->
<section class="stats-strip">
  <div class="container">
    <div class="stats-grid">
      <div class="stat-item"><div class="stat-value"><span>Automatic</span></div><div class="stat-label">A review request after every completed appointment</div></div>
      <div class="stat-item"><div class="stat-value"><span>&lt; 1 hr</span></div><div class="stat-label">Request sent while the client's experience is still fresh</div></div>
      <div class="stat-item"><div class="stat-value"><span>1 tap</span></div><div class="stat-label">Straight to your Google review page — no searching</div></div>
      <div class="stat-item"><div class="stat-value"><span>Every review</span></div><div class="stat-label">Gets a reply, so your profile stays active</div></div>
    </div>
  </div>
</section>

<!-- FEATURES -->
<section class="section">
  <div class="container">
    <div class="section-header">
      <span class="tag tag-plum">Review Automation</span>
      <h2 class="section-title">Build your five-star reputation effortlessly</h2>
      <p class="section-subtitle">Stop hoping clients will leave reviews. Certxa asks them at exactly the right moment — after a great appointment when they're genuinely happy.</p>
    </div>

    <div class="feature-block">
      <div class="feature-content">
        <span class="tag tag-plum">Automated Requests</span>
        <h3 class="feature-title">Ask for reviews at the perfect moment</h3>
        <p class="feature-text">Within an hour of a completed appointment, Certxa automatically sends a friendly review request to your client. The message is personalised with their name and the service they received, making it feel genuine — because it is.</p>
        <ul class="feature-list">
          <li>Sent automatically after every completed appointment</li>
          <li>Personalised with client name and service received</li>
          <li>Links directly to Google, Facebook, or Trustpilot</li>
          <li>Smart filter — unhappy clients are handled privately first</li>
          <li>Follow-up if no response (configurable)</li>
        </ul>
        <a href="/auth?mode=register" class="btn btn-primary">Start Free Trial</a>
      </div>
      <div class="feature-visual" style="background:linear-gradient(145deg,var(--gold-light),#FDE68A);">
        <div style="width:100%;max-width:300px;">
          <div style="background:#fff;border-radius:16px;padding:20px;box-shadow:var(--shadow-md);">
            <div style="font-size:.72rem;font-weight:700;color:var(--mid-grey);text-transform:uppercase;letter-spacing:.08em;margin-bottom:10px;">Post-Visit Message</div>
            <div style="background:var(--plum);color:#fff;border-radius:12px 12px 12px 0;padding:14px 16px;font-size:.85rem;line-height:1.6;margin-bottom:10px;">
              Hi Emma! Thank you so much for visiting us today — it was a pleasure having you in. We'd love to know how your experience was. Would you mind leaving us a quick review? It means the world to us! 💜
            </div>
            <div style="display:flex;flex-direction:column;gap:8px;">
              <a style="display:flex;align-items:center;gap:10px;background:#F3F4F6;border-radius:8px;padding:10px 14px;font-size:.82rem;font-weight:600;color:#374151;text-decoration:none;cursor:pointer;">
                <span style="font-size:1rem;">🔍</span> Leave a Google Review
              </a>
              <a style="display:flex;align-items:center;gap:10px;background:#F3F4F6;border-radius:8px;padding:10px 14px;font-size:.82rem;font-weight:600;color:#374151;text-decoration:none;cursor:pointer;">
                <span style="font-size:1rem;">📘</span> Leave a Facebook Review
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="feature-block reverse">
      <div class="feature-content">
        <span class="tag tag-gold">Smart Filtering</span>
        <h3 class="feature-title">Protect your reputation from negative reviews</h3>
        <p class="feature-text">Certxa's intelligent review funnel first asks clients to rate their experience privately. If they score highly, they're directed to your public review platforms. If they have concerns, you're notified privately so you can address it before it goes public — protecting your hard-earned reputation.</p>
        <ul class="feature-list">
          <li>Private satisfaction rating collected first</li>
          <li>Happy clients directed to Google/Facebook</li>
          <li>Unhappy clients send private feedback to you</li>
          <li>Resolve issues before they become public</li>
        </ul>
        <a href="/client-notifications" class="btn btn-primary">Explore Automated Messages</a>
      </div>
      <div class="feature-visual">
        <div style="text-align:center;width:100%;max-width:300px;">
          <div style="background:#fff;border-radius:12px;padding:20px;box-shadow:var(--shadow-md);margin-bottom:14px;">
            <div style="font-size:.85rem;font-weight:600;margin-bottom:14px;">How was your visit today?</div>
            <div style="display:flex;justify-content:center;gap:12px;font-size:2rem;margin-bottom:14px;">
              <?php foreach (['😞','😐','🙂','😊','🤩'] as $i => $e): ?>
              <span style="cursor:pointer;<?= $i === 4 ? 'transform:scale(1.3);' : 'opacity:.5;' ?>"><?= $e ?></span>
              <?php endforeach; ?>
            </div>
            <div style="font-size:.75rem;color:var(--mid-grey);">Your feedback helps us improve</div>
          </div>
          <div style="display:flex;gap:10px;">
            <div style="flex:1;background:#D1FAE5;border-radius:8px;padding:12px;text-align:center;">
              <div style="font-size:1.4rem;margin-bottom:4px;">⭐</div>
              <div style="font-size:.75rem;font-weight:700;color:#065F46;">Positive</div>
              <div style="font-size:.7rem;color:#065F46;">→ Public review</div>
            </div>
            <div style="flex:1;background:#FEE2E2;border-radius:8px;padding:12px;text-align:center;">
              <div style="font-size:1.4rem;margin-bottom:4px;">🔒</div>
              <div style="font-size:.75rem;font-weight:700;color:#991B1B;">Concern</div>
              <div style="font-size:.7rem;color:#991B1B;">→ Private message to you</div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="feature-block">
      <div class="feature-content">
        <span class="tag tag-plum">Review Showcase</span>
        <h3 class="feature-title">Show off your glowing reputation everywhere</h3>
        <p class="feature-text">Display your best reviews automatically on your Certxa website, your booking page, and social media. Fresh five-star reviews posted automatically — turning your reputation into your most powerful marketing tool.</p>
        <ul class="feature-list">
          <li>Review widget embedded on your website automatically</li>
          <li>Best reviews highlighted on your booking page</li>
          <li>Shareable review graphics for Instagram and Facebook</li>
          <li>Aggregate rating shown on all your public profiles</li>
        </ul>
        <a href="/auth?mode=register" class="btn btn-primary">Try Review Tools Free</a>
      </div>
      <div class="feature-visual" style="background:linear-gradient(145deg,var(--plum-light),#DDD6FE);">
        <div class="ui-card" style="width:100%;max-width:320px;">
          <div style="text-align:center;padding-bottom:14px;border-bottom:1px solid var(--light-grey);">
            <div style="font-size:2.5rem;font-weight:700;font-family:'Cormorant Garamond',serif;color:var(--plum);">4.9</div>
            <div style="color:var(--gold-bright);font-size:1.2rem;">★★★★★</div>
            <div style="font-size:.75rem;color:var(--mid-grey);margin-top:4px;">284 verified reviews</div>
          </div>
          <div style="display:flex;flex-direction:column;gap:8px;margin-top:14px;">
            <?php
            $stars = [[5,'★★★★★','241 reviews','95%'], [4,'★★★★☆','32 reviews','12%'], [3,'★★★☆☆','8 reviews','3%']];
            foreach ($stars as $s):
            ?>
            <div style="display:flex;align-items:center;gap:10px;">
              <span style="font-size:.78rem;color:var(--mid-grey);width:20px;text-align:right;"><?= $s[0] ?></span>
              <span style="font-size:.8rem;color:var(--gold-bright);"><?= $s[1] ?></span>
              <div style="flex:1;height:6px;background:var(--light-grey);border-radius:3px;">
                <div style="height:100%;background:var(--gold-bright);border-radius:3px;width:<?= $s[3] ?>;"></div>
              </div>
              <span style="font-size:.72rem;color:var(--mid-grey);width:60px;"><?= $s[2] ?></span>
            </div>
            <?php endforeach; ?>
          </div>
          <div style="margin-top:14px;background:var(--plum-light);border-radius:8px;padding:8px 12px;text-align:center;font-size:.78rem;color:var(--plum);font-weight:600;">
            Embed this widget on your website →
          </div>
        </div>
      </div>
    </div>
  </div>
</section>

<!-- HOW TO -->
<section id="how-to" class="section section-alt">
  <div class="container">
    <div class="section-header">
      <span class="tag tag-plum">Playbook</span>
      <h2 class="section-title">How to get more 5-star Google reviews for your nail salon</h2>
      <p class="section-subtitle">The mechanics are simple. Almost every salon knows them and almost none of them do it consistently — which is exactly why doing it works.</p>
    </div>

    <div style="max-width:760px;margin:0 auto;display:flex;flex-direction:column;gap:28px;">
      <div>
        <h3 class="feature-title">1. Claim and complete your Google Business Profile</h3>
        <p class="feature-text">Verify your salon on Google and fill in everything — hours, every service, real photos of your work, and your booking link. Reviews send new clients to that profile, so it has to be complete and accurate before you drive traffic to it. See <a href="/google-business-profile">Google Business Profile</a>.</p>
      </div>
      <div>
        <h3 class="feature-title">2. Ask every happy client, right after the appointment</h3>
        <p class="feature-text">The window that matters is the first hour after the service, while the result is fresh and the client is pleased. The single biggest reason review counts stay flat is that salons only ask when they remember. Ask after <em>every</em> completed appointment, automatically.</p>
      </div>
      <div>
        <h3 class="feature-title">3. Send it by text, with a one-tap link</h3>
        <p class="feature-text">A text is opened far more often than an email, and it should link straight to your Google review form — not to a Google search for your salon. One tap, one screen, done.</p>
      </div>
      <div>
        <h3 class="feature-title">4. Make the message personal and specific</h3>
        <p class="feature-text">Use the client's name and the service they had: <em>"Hi Emma, thank you for coming in for your gel manicure today…"</em>. A specific, human note gets a much higher response than a generic blast to everyone.</p>
      </div>
      <div>
        <h3 class="feature-title">5. Reply to every review — good and bad</h3>
        <p class="feature-text">Thank your 5-star reviewers by name. Answer criticism calmly, publicly, and with an offer to make it right. Responding tells prospective clients you pay attention, and it keeps your profile active in Google's eyes.</p>
      </div>
      <div style="background:#FFF7ED;border:1px solid #FED7AA;border-radius:12px;padding:18px 22px;">
        <h3 class="feature-title" style="margin-bottom:8px;">Stay inside Google's rules</h3>
        <p class="feature-text" style="margin:0;">Asking clients for honest reviews is fine. What is not: paying or discounting in exchange for reviews, only asking clients you know are happy, or filtering people by rating before they reach Google. Ask everyone, make it easy for everyone, and let the reviews be honest — it is also what performs best over time.</p>
      </div>
    </div>

    <div style="text-align:center;margin-top:36px;">
      <a href="/auth?mode=register" class="btn btn-primary">Automate steps 2–5 with Certxa</a>
    </div>
  </div>
</section>

<!-- CTA -->
<section class="cta-section">
  <div class="container" style="position:relative;z-index:1;">
    <span class="tag" style="background:rgba(255,255,255,.15);color:#fff;margin-bottom:16px;display:inline-block;">Build Social Proof</span>
    <h2 class="cta-title">Let your happy clients<br><em>do the marketing.</em></h2>
    <p class="cta-text">Start collecting five-star reviews automatically from your very next appointment. The best marketing you'll ever do is letting your work speak for itself.</p>
    <div class="cta-actions">
      <a href="/auth?mode=register" class="btn btn-gold">Start Free Trial</a>
      <a href="/salonos" class="btn btn-outline-white">Explore All Features</a>
    </div>
    <p class="cta-note">Credit card required · No charge until trial ends &middot; Setup in minutes</p>
  </div>
</section>

<?php require 'includes/footer.php'; ?>
