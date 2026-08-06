<?php
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/data/templates.php';
require_once __DIR__ . '/admin-lib.php';

$id = isset($_GET['id']) ? trim($_GET['id']) : '';

if (!$id || !isset($all_templates[$id])) {
    header('Location: ' . BASE_PATH . '/');
    exit;
}

$t = $all_templates[$id];
$page_title = 'Get Started with ' . $t['name'];

// Load hero images for this template's category
$_cat_slug    = launchit_category_slug($t['category']);
$_media_dir   = launchit_media_dir($t['category']);
$hero_images  = [];
if (is_dir($_media_dir)) {
    $files = glob($_media_dir . '/*.{jpg,jpeg,png,webp}', GLOB_BRACE) ?: [];
    usort($files, fn($a, $b) => filemtime($b) <=> filemtime($a));
    foreach ($files as $f) {
        $bn = basename($f);
        $hero_images[] = [
            'file' => $bn,
            'name' => pathinfo($bn, PATHINFO_FILENAME),
            'url'  => BASE_PATH . '/media/' . $_cat_slug . '/hero_images/' . rawurlencode($bn),
        ];
    }
}

$category_map = [
    'Hair Salon'  => 'hair-salons.php',
    'Barbershop'  => 'barbershops.php',
    'Nail Salon'  => 'nail-salons.php',
];
$back_url    = BASE_PATH . '/' . ($category_map[$t['category']] ?? '');
$preview_url = BASE_PATH . '/preview.php?id=' . urlencode($id);
$api_base    = BASE_PATH . '/api';

require_once __DIR__ . '/includes/header.php';
?>

<section class="select-page">
    <div class="container">
        <a href="<?php echo $back_url; ?>" class="select-back">
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><path d="M10 3L5 8l5 5"/></svg>
            Back to designs
        </a>

        <div class="select-grid">

            <!-- ── Left: template summary ── -->
            <div class="select-preview-col">
                <div class="select-template-card" style="--accent:<?php echo htmlspecialchars($t['accent']); ?>;--dark:<?php echo htmlspecialchars($t['dark']); ?>;">
                    <div class="select-template-thumb">
                        <div class="select-thumb-browser">
                            <span class="stb-dot stb-dot--r"></span>
                            <span class="stb-dot stb-dot--y"></span>
                            <span class="stb-dot stb-dot--g"></span>
                            <span class="stb-url">yourdomain.com</span>
                        </div>
                        <div class="select-thumb-hero" style="background:var(--dark);">
                            <div class="sth-eyebrow" style="background:var(--accent)"></div>
                            <div class="sth-h1"></div>
                            <div class="sth-h1 sth-h1--short"></div>
                            <div class="sth-sub"></div>
                            <div class="sth-btns">
                                <span class="sth-btn sth-btn--fill" style="background:var(--accent)"></span>
                                <span class="sth-btn sth-btn--ghost"></span>
                            </div>
                        </div>
                        <div class="select-thumb-sections">
                            <div class="sts-bar" style="background:var(--dark)"></div>
                            <div class="sts-bar sts-bar--light"></div>
                            <div class="sts-bar" style="background:var(--dark)"></div>
                        </div>
                    </div>
                    <div class="select-template-info">
                        <div class="select-template-meta">
                            <span class="select-template-category"><?php echo htmlspecialchars($t['category']); ?></span>
                            <span class="select-template-style"><?php echo htmlspecialchars($t['style']); ?></span>
                        </div>
                        <h3><?php echo htmlspecialchars($t['name']); ?></h3>
                        <p><?php echo htmlspecialchars($t['desc']); ?></p>
                        <div class="select-features">
                            <?php foreach ($t['features'] as $f): ?>
                            <span class="feature-pill">&#10003; <?php echo htmlspecialchars($f); ?></span>
                            <?php endforeach; ?>
                        </div>
                        <a href="<?php echo $preview_url; ?>" class="select-preview-link">View full preview &rarr;</a>
                    </div>
                </div>

                <div class="select-included">
                    <h4>What&#8217;s included</h4>
                    <ul>
                        <li>&#10003; Fully designed, ready-to-launch website</li>
                        <li>&#10003; Mobile responsive on all devices</li>
                        <li>&#10003; SSL certificate &amp; fast hosting</li>
                        <li>&#10003; Your domain connected</li>
                        <li>&#10003; Optional text editing &#8212; change any words</li>
                        <li>&#10003; Support from the Certxa team</li>
                    </ul>
                </div>
            </div>

            <!-- ── Right: multi-step wizard ── -->
            <div class="select-form-col">
                <div class="select-form-card" id="wizardCard">

                    <!-- Progress indicator -->
                    <div class="wizard-progress" id="wizardProgress">
                        <div class="wizard-step-dot active" data-step="1">
                            <span class="wsd-num">1</span>
                            <span class="wsd-label">Your Business</span>
                        </div>
                        <div class="wizard-step-line"></div>
                        <div class="wizard-step-dot" data-step="2">
                            <span class="wsd-num">2</span>
                            <span class="wsd-label">Hero Image</span>
                        </div>
                        <div class="wizard-step-line"></div>
                        <div class="wizard-step-dot" data-step="3">
                            <span class="wsd-num">3</span>
                            <span class="wsd-label">Hours</span>
                        </div>
                        <div class="wizard-step-line"></div>
                        <div class="wizard-step-dot" data-step="4">
                            <span class="wsd-num">4</span>
                            <span class="wsd-label">Booking</span>
                        </div>
                        <div class="wizard-step-line"></div>
                        <div class="wizard-step-dot" data-step="5">
                            <span class="wsd-num">5</span>
                            <span class="wsd-label">Your Domain</span>
                        </div>
                    </div>

                    <!-- ── Step 1: Business Info ── -->
                    <div class="wizard-panel" id="panel1">
                        <div class="wizard-panel-header">
                            <div class="select-step-badge">Step 1 of 5</div>
                            <h2>Your Business</h2>
                            <p>Tell us about your salon so we can personalise your new website.</p>
                        </div>
                        <div class="select-form">
                            <div class="form-group">
                                <label for="f_business_name">Business name <span class="form-req">*</span></label>
                                <input type="text" id="f_business_name" name="business_name" placeholder="e.g. Sophie&#8217;s Salon" autocomplete="organization" required>
                            </div>
                            <div class="form-row-2">
                                <div class="form-group">
                                    <label for="f_phone">Phone number <span class="form-req">*</span></label>
                                    <input type="tel" id="f_phone" name="phone" placeholder="+44 7700 000000" autocomplete="tel" required>
                                </div>
                                <div class="form-group">
                                    <label for="f_email">Contact email <span class="form-req">*</span></label>
                                    <input type="email" id="f_email" name="contact_email" placeholder="you@example.com" autocomplete="email" required>
                                </div>
                            </div>
                            <div class="form-group">
                                <label for="f_addr1">Address line 1 <span class="form-req">*</span></label>
                                <input type="text" id="f_addr1" name="address_line1" placeholder="12 High Street" autocomplete="address-line1" required>
                            </div>
                            <div class="form-group">
                                <label for="f_addr2">Address line 2 <span class="form-optional">(optional)</span></label>
                                <input type="text" id="f_addr2" name="address_line2" placeholder="Suite 4" autocomplete="address-line2">
                            </div>
                            <div class="form-row-3">
                                <div class="form-group">
                                    <label for="f_city">Town / City <span class="form-req">*</span></label>
                                    <input type="text" id="f_city" name="city" placeholder="London" autocomplete="address-level2" required>
                                </div>
                                <div class="form-group">
                                    <label for="f_county">County <span class="form-optional">(optional)</span></label>
                                    <input type="text" id="f_county" name="county_state" placeholder="Essex" autocomplete="address-level1">
                                </div>
                                <div class="form-group">
                                    <label for="f_postcode">Postcode <span class="form-req">*</span></label>
                                    <input type="text" id="f_postcode" name="postcode" placeholder="SW1A 1AA" autocomplete="postal-code" required>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- ── Step 2: Hero Image ── -->
                    <div class="wizard-panel" id="panel2" hidden>
                        <div class="wizard-panel-header">
                            <div class="select-step-badge">Step 2 of 5</div>
                            <h2>Hero Image</h2>
                            <p>Pick a photo for your website&#8217;s homepage. This is optional &#8212; you can always change it later.</p>
                        </div>
                        <?php if (empty($hero_images)): ?>
                        <div class="hero-picker-empty">
                            <p>No images in the library for <?php echo htmlspecialchars($t['category']); ?> yet.</p>
                            <p>Your template&#8217;s default photo will be used. You can upload images from the admin panel later.</p>
                        </div>
                        <?php else: ?>
                        <div class="hero-picker-grid" id="heroPicker">
                            <?php foreach ($hero_images as $img): ?>
                            <div class="hero-picker-card" data-file="<?php echo htmlspecialchars($img['file']); ?>" data-url="<?php echo htmlspecialchars($img['url']); ?>">
                                <div class="hero-picker-img" style="background-image:url('<?php echo htmlspecialchars($img['url']); ?>')"></div>
                                <div class="hero-picker-check">
                                    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2.5" width="10" height="10"><path d="M3 8l3.5 3.5L13 5"/></svg>
                                </div>
                                <div class="hero-picker-name"><?php echo htmlspecialchars($img['name']); ?></div>
                            </div>
                            <?php endforeach; ?>
                        </div>
                        <?php endif; ?>
                        <p class="hero-picker-skip">
                            <?php if (!empty($hero_images)): ?>No preference? <?php endif; ?>
                            <button type="button" class="btn-link" id="heroSkip">Skip &#8212; use the template default</button>
                        </p>
                    </div>

                    <!-- ── Step 3: Business Hours ── -->
                    <div class="wizard-panel" id="panel3" hidden>
                        <div class="wizard-panel-header">
                            <div class="select-step-badge">Step 3 of 5</div>
                            <h2>Business Hours</h2>
                            <p>We&#8217;ll add these directly to your website. You can always edit them later.</p>
                        </div>
                        <div class="hours-grid">
                            <div class="hours-grid-head">
                                <span>Day</span>
                                <span>Opens</span>
                                <span>Closes</span>
                                <span>Closed</span>
                            </div>
                            <!-- rows injected by JS -->
                        </div>
                    </div>

                    <!-- ── Step 4: Online Booking ── -->
                    <div class="wizard-panel" id="panel4" hidden>
                        <div class="wizard-panel-header">
                            <div class="select-step-badge">Step 4 of 5</div>
                            <h2>Online Booking</h2>
                            <p>Let clients book appointments directly from your website.</p>
                        </div>
                        <div class="booking-gate">
                            <div class="booking-gate__icon">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="36" height="36"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/><path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01"/></svg>
                            </div>
                            <h3>Online Booking</h3>
                            <p>Allow clients to book appointments 24/7, reduce no-shows with automatic reminders, and manage your calendar in one place.</p>
                            <div class="booking-gate__features">
                                <span>&#10003; 24/7 online booking</span>
                                <span>&#10003; Automated reminders</span>
                                <span>&#10003; Calendar management</span>
                                <span>&#10003; Staff scheduling</span>
                            </div>
                            <div class="booking-gate__lock">
                                <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><rect x="3" y="7" width="10" height="8" rx="1"/><path d="M5 7V5a3 3 0 016 0v2"/></svg>
                                Subscriber feature &mdash; coming soon
                            </div>
                            <p class="booking-gate__note">Booking will be available when you upgrade to a subscriber plan. We&#8217;ll notify you when it launches.</p>
                        </div>
                    </div>

                    <!-- ── Step 5: Domain ── -->
                    <div class="wizard-panel" id="panel5" hidden>
                        <div class="wizard-panel-header">
                            <div class="select-step-badge">Step 5 of 5</div>
                            <h2>Your Domain</h2>
                            <p>Choose how people will find your website.</p>
                        </div>
                        <div class="domain-type-cards">
                            <label class="domain-type-card">
                                <input type="radio" name="domain_type" value="subdomain" checked>
                                <span class="dtc-inner">
                                    <span class="dtc-top">
                                        <span class="dtc-title">Free subdomain</span>
                                        <span class="dtc-badge">Free</span>
                                    </span>
                                    <span class="dtc-sub">yourname<strong>.certxa.com</strong></span>
                                    <span class="dtc-note">Live within 24 hours. Includes &#8220;Powered by Certxa&#8221; footer.</span>
                                </span>
                            </label>
                            <label class="domain-type-card">
                                <input type="radio" name="domain_type" value="custom">
                                <span class="dtc-inner">
                                    <span class="dtc-top">
                                        <span class="dtc-title">Custom domain</span>
                                        <span class="dtc-badge dtc-badge--paid">&pound;15/year</span>
                                    </span>
                                    <span class="dtc-sub">mysalon<strong>.co.uk</strong></span>
                                    <span class="dtc-note">Use your own domain. Remove &#8220;Powered by Certxa&#8221;. Inactive until payment.</span>
                                </span>
                            </label>
                        </div>

                        <!-- Subdomain section -->
                        <div id="subdomainSection" class="domain-section">
                            <div class="form-group">
                                <label for="f_subdomain">Choose your subdomain <span class="form-req">*</span></label>
                                <div class="subdomain-input-wrap">
                                    <input type="text" id="f_subdomain" name="subdomain"
                                           placeholder="mysalon"
                                           maxlength="50"
                                           autocomplete="off"
                                           spellcheck="false"
                                           inputmode="url">
                                    <span class="subdomain-suffix">.certxa.com</span>
                                    <span class="subdomain-status" id="subdomainStatus"></span>
                                </div>
                                <span class="form-hint">Lowercase letters, numbers and hyphens only. No spaces.</span>
                            </div>
                            <div class="subdomain-preview" id="subdomainPreview" hidden>
                                Your site will be live at <strong id="subdomainPreviewUrl"></strong>
                            </div>
                        </div>

                        <!-- Custom domain section -->
                        <div id="customDomainSection" class="domain-section" hidden>
                            <div class="form-group">
                                <label for="f_custom_domain">Your domain name <span class="form-req">*</span></label>
                                <input type="text" id="f_custom_domain" name="custom_domain"
                                       placeholder="mysalon.co.uk"
                                       autocomplete="url"
                                       spellcheck="false">
                                <span class="form-hint">Enter your domain without www (e.g. mysalon.co.uk)</span>
                            </div>
                            <div class="custom-domain-info">
                                <div class="cdi-item">
                                    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.75" width="14" height="14"><circle cx="8" cy="8" r="6"/><path d="M8 5v3l2 1.5"/></svg>
                                    After submitting, we&#8217;ll email DNS setup instructions. Point an <strong>A record</strong> to our server &mdash; takes about 5 minutes.
                                </div>
                                <div class="cdi-item">
                                    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.75" width="14" height="14"><path d="M13 5l-7 7-3-3"/></svg>
                                    Your site goes live once your domain is pointed correctly and the &pound;15/year fee is paid.
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- ── Success Screen ── -->
                    <div class="wizard-success" id="wizardSuccess" hidden>
                        <div class="wizard-success-icon">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="36" height="36"><circle cx="12" cy="12" r="10"/><path d="M7 12l3.5 3.5L17 8"/></svg>
                        </div>
                        <h2>You&#8217;re all set!</h2>
                        <p id="successMsg"></p>
                        <div class="success-details" id="successDetails"></div>
                        <p class="success-email-note" id="successEmailNote"></p>
                    </div>

                    <!-- ── Error banner ── -->
                    <div class="wizard-error" id="wizardError" hidden></div>

                    <!-- ── Navigation ── -->
                    <div class="wizard-nav" id="wizardNav">
                        <button type="button" class="btn btn--ghost-sm" id="wizardBack" hidden>
                            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="12" height="12"><path d="M10 3L5 8l5 5"/></svg>
                            Back
                        </button>
                        <div style="flex:1"></div>
                        <button type="button" class="btn btn--orange" id="wizardNext">
                            Next
                            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="12" height="12"><path d="M6 3l5 5-5 5"/></svg>
                        </button>
                        <button type="button" class="btn btn--orange" id="wizardSubmit" hidden>
                            Get My Site Live
                            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="12" height="12"><path d="M6 3l5 5-5 5"/></svg>
                        </button>
                    </div>

                    <p class="select-legal">Credit card required to subscribe — no charge during your <?= TRIAL_DAYS ?>-day trial. By continuing you agree to Certxa&#8217;s <a href="https://certxa.com/terms">Terms of Service</a>.</p>

                </div><!-- /.select-form-card -->
            </div>

        </div><!-- /.select-grid -->
    </div><!-- /.container -->
</section>

<script>
(function () {
'use strict';

var TEMPLATE_ID       = <?php echo json_encode($id); ?>;
var API_BASE          = <?php echo json_encode($api_base); ?>;
var TOTAL_STEPS       = 5;
var currentStep       = 1;
var selectedHeroImage = null; // filename chosen in step 2

// ── Hours data ───────────────────────────────────────────────────────────────
var DAYS = [
    { key:'sun', label:'Sunday',    defOpen:'09:00', defClose:'17:00', defClosed:true  },
    { key:'mon', label:'Monday',    defOpen:'09:00', defClose:'18:00', defClosed:false },
    { key:'tue', label:'Tuesday',   defOpen:'09:00', defClose:'18:00', defClosed:false },
    { key:'wed', label:'Wednesday', defOpen:'09:00', defClose:'18:00', defClosed:false },
    { key:'thu', label:'Thursday',  defOpen:'09:00', defClose:'18:00', defClosed:false },
    { key:'fri', label:'Friday',    defOpen:'09:00', defClose:'18:00', defClosed:false },
    { key:'sat', label:'Saturday',  defOpen:'10:00', defClose:'16:00', defClosed:false },
];

// Build time options: 06:00 to 23:30 in 30-min steps
function buildTimeOptions(selectedVal) {
    var opts = '';
    for (var h = 6; h < 24; h++) {
        ['00','30'].forEach(function (m) {
            var val  = pad(h) + ':' + m;
            var sel  = val === selectedVal ? ' selected' : '';
            var disp = fmt12(h, m);
            opts += '<option value="' + val + '"' + sel + '>' + disp + '</option>';
        });
    }
    return opts;
}
function pad(n) { return n < 10 ? '0' + n : '' + n; }
function fmt12(h, m) {
    var ampm = h < 12 ? 'am' : 'pm';
    var h12  = h % 12 || 12;
    return h12 + ':' + m + ' ' + ampm;
}

// Inject hours rows
var hoursGrid = document.querySelector('.hours-grid');
DAYS.forEach(function (day) {
    var row = document.createElement('div');
    row.className = 'hours-row';
    row.dataset.day = day.key;
    row.innerHTML =
        '<span class="hours-day">' + day.label + '</span>' +
        '<select class="hours-open hours-select" data-role="open" aria-label="' + day.label + ' opening time"' + (day.defClosed ? ' disabled' : '') + '>' +
        buildTimeOptions(day.defOpen) + '</select>' +
        '<select class="hours-close hours-select" data-role="close" aria-label="' + day.label + ' closing time"' + (day.defClosed ? ' disabled' : '') + '>' +
        buildTimeOptions(day.defClose) + '</select>' +
        '<label class="hours-closed-toggle" title="Toggle closed">' +
        '<input type="checkbox" class="hours-closed-cb"' + (day.defClosed ? ' checked' : '') + '>' +
        '<span class="hct-track"><span class="hct-thumb"></span></span>' +
        '</label>';
    hoursGrid.appendChild(row);

    row.querySelector('.hours-closed-cb').addEventListener('change', function () {
        var closed = this.checked;
        row.querySelector('.hours-open').disabled  = closed;
        row.querySelector('.hours-close').disabled = closed;
        row.classList.toggle('hours-row--closed', closed);
    });
    if (day.defClosed) row.classList.add('hours-row--closed');
});

function collectHours() {
    var result = {};
    document.querySelectorAll('.hours-row').forEach(function (row) {
        var key = row.dataset.day;
        result[key] = {
            open:   row.querySelector('[data-role="open"]').value,
            close:  row.querySelector('[data-role="close"]').value,
            closed: row.querySelector('.hours-closed-cb').checked,
        };
    });
    return result;
}

// ── Hero image picker ─────────────────────────────────────────────────────────
var pickerCards = document.querySelectorAll('.hero-picker-card');
pickerCards.forEach(function (card) {
    card.addEventListener('click', function () {
        // Deselect all
        pickerCards.forEach(function (c) { c.classList.remove('selected'); });
        // Select this one
        card.classList.add('selected');
        selectedHeroImage = card.dataset.file;
    });
});

var heroSkipBtn = document.getElementById('heroSkip');
if (heroSkipBtn) {
    heroSkipBtn.addEventListener('click', function () {
        pickerCards.forEach(function (c) { c.classList.remove('selected'); });
        selectedHeroImage = null;
        showStep(currentStep + 1);
    });
}

// ── Domain type toggle ────────────────────────────────────────────────────────
var subSection    = document.getElementById('subdomainSection');
var custSection   = document.getElementById('customDomainSection');
var domainRadios  = document.querySelectorAll('input[name="domain_type"]');

domainRadios.forEach(function (r) {
    r.addEventListener('change', function () {
        var isSub = r.value === 'subdomain';
        subSection.hidden  = !isSub;
        custSection.hidden = isSub;
        clearSubdomainStatus();
    });
});

// ── Subdomain checker ─────────────────────────────────────────────────────────
var subInput    = document.getElementById('f_subdomain');
var subStatus   = document.getElementById('subdomainStatus');
var subPreview  = document.getElementById('subdomainPreview');
var subPrevUrl  = document.getElementById('subdomainPreviewUrl');
var subTimer    = null;
var subAvailable = false;

subInput.addEventListener('input', function () {
    // Force lowercase, strip invalid chars
    var v = this.value.toLowerCase().replace(/[^a-z0-9\-]/g, '');
    if (v !== this.value) this.value = v;
    clearTimeout(subTimer);
    clearSubdomainStatus();
    subAvailable = false;
    if (v.length < 2) { subPreview.hidden = true; return; }
    subTimer = setTimeout(function () { checkSubdomain(v); }, 500);
});

function clearSubdomainStatus() {
    subStatus.textContent = '';
    subStatus.className   = 'subdomain-status';
}

function checkSubdomain(name) {
    subStatus.className   = 'subdomain-status loading';
    subStatus.textContent = 'Checking\u2026';
    fetch(API_BASE + '/check-subdomain.php?name=' + encodeURIComponent(name))
        .then(function (r) { return r.json(); })
        .then(function (data) {
            if (data.error === 'invalid') {
                subStatus.className   = 'subdomain-status unavailable';
                subStatus.textContent = 'Invalid name';
                subAvailable = false;
                subPreview.hidden = true;
                return;
            }
            if (data.available) {
                subStatus.className   = 'subdomain-status available';
                subStatus.textContent = '\u2713 Available';
                subAvailable = true;
                subPrevUrl.textContent = name + '.certxa.com';
                subPreview.hidden = false;
            } else {
                subStatus.className   = 'subdomain-status unavailable';
                subStatus.textContent = '\u2717 Already taken';
                subAvailable = false;
                subPreview.hidden = true;
            }
        })
        .catch(function () {
            subStatus.className   = 'subdomain-status unavailable';
            subStatus.textContent = 'Could not check \u2014 try again';
            subAvailable = false;
        });
}

// ── Step navigation ───────────────────────────────────────────────────────────
var panels    = document.querySelectorAll('.wizard-panel');
var dots      = document.querySelectorAll('.wizard-step-dot');
var btnBack   = document.getElementById('wizardBack');
var btnNext   = document.getElementById('wizardNext');
var btnSubmit = document.getElementById('wizardSubmit');
var errBanner = document.getElementById('wizardError');
var nav       = document.getElementById('wizardNav');
var successEl = document.getElementById('wizardSuccess');
var progress  = document.getElementById('wizardProgress');

function showStep(n) {
    currentStep = n;
    panels.forEach(function (p, i) { p.hidden = (i + 1) !== n; });
    dots.forEach(function (d, i) {
        d.classList.toggle('active', i + 1 === n);
        d.classList.toggle('done',   i + 1 < n);
    });
    btnBack.hidden   = n === 1;
    btnNext.hidden   = n === TOTAL_STEPS;
    btnSubmit.hidden = n !== TOTAL_STEPS;
    hideError();
}

function showError(msg) {
    errBanner.textContent = msg;
    errBanner.hidden = false;
    errBanner.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}
function hideError() { errBanner.hidden = true; }

// Validate current step before advancing
function validateStep(n) {
    if (n === 1) {
        var fields = ['f_business_name','f_phone','f_email','f_addr1','f_city','f_postcode'];
        for (var i = 0; i < fields.length; i++) {
            var el = document.getElementById(fields[i]);
            if (!el.value.trim()) {
                el.focus();
                showError('Please fill in all required fields.');
                return false;
            }
        }
        var emailEl = document.getElementById('f_email');
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailEl.value.trim())) {
            emailEl.focus();
            showError('Please enter a valid email address.');
            return false;
        }
        return true;
    }
    if (n === 2) { return true; } // Hero image — optional, always valid
    if (n === 3) {
        // Basic hours sanity (open < close for non-closed days)
        var ok = true;
        document.querySelectorAll('.hours-row').forEach(function (row) {
            if (row.querySelector('.hours-closed-cb').checked) return;
            var o = row.querySelector('[data-role="open"]').value;
            var c = row.querySelector('[data-role="close"]').value;
            if (o >= c) ok = false;
        });
        if (!ok) {
            showError('Please check your hours \u2014 opening time must be before closing time.');
            return false;
        }
        return true;
    }
    if (n === 4) { return true; } // Booking step — always valid (locked)
    if (n === 5) {
        var dtype = document.querySelector('input[name="domain_type"]:checked').value;
        if (dtype === 'subdomain') {
            var slug = subInput.value.trim();
            if (slug.length < 2) { showError('Please enter a subdomain name (at least 2 characters).'); return false; }
            if (!subAvailable) { showError('That subdomain is not available. Please choose another.'); return false; }
        } else {
            var cd = document.getElementById('f_custom_domain').value.trim();
            if (!cd || !/^[a-z0-9][a-z0-9\-\.]{1,250}[a-z0-9]$/i.test(cd)) {
                showError('Please enter a valid domain name (e.g. mysalon.co.uk).');
                return false;
            }
        }
        return true;
    }
    return true;
}

btnNext.addEventListener('click', function () {
    if (!validateStep(currentStep)) return;
    if (currentStep < TOTAL_STEPS) showStep(currentStep + 1);
});

btnBack.addEventListener('click', function () {
    if (currentStep > 1) showStep(currentStep - 1);
});

// ── Submit ────────────────────────────────────────────────────────────────────
btnSubmit.addEventListener('click', function () {
    if (!validateStep(5)) return;

    var dtype  = document.querySelector('input[name="domain_type"]:checked').value;
    var payload = {
        template_id:     TEMPLATE_ID,
        business_name:   document.getElementById('f_business_name').value.trim(),
        phone:           document.getElementById('f_phone').value.trim(),
        contact_email:   document.getElementById('f_email').value.trim(),
        address_line1:   document.getElementById('f_addr1').value.trim(),
        address_line2:   document.getElementById('f_addr2').value.trim(),
        city:            document.getElementById('f_city').value.trim(),
        county_state:    document.getElementById('f_county').value.trim(),
        postcode:        document.getElementById('f_postcode').value.trim(),
        country:         'GB',
        hours:           collectHours(),
        booking_enabled: false,
        hero_image:      selectedHeroImage || '',
        domain_type:     dtype,
        subdomain:       dtype === 'subdomain' ? subInput.value.trim() : '',
        custom_domain:   dtype === 'custom'    ? document.getElementById('f_custom_domain').value.trim() : '',
    };

    btnSubmit.disabled = true;
    btnSubmit.textContent = 'Submitting\u2026';
    hideError();

    fetch(API_BASE + '/submit-onboarding.php', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(payload),
    })
    .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, data: d }; }); })
    .then(function (res) {
        if (!res.ok || !res.data.success) {
            var msg = res.data.error || 'Something went wrong. Please try again.';
            if (res.data.error === 'subdomain_taken') {
                msg = 'That subdomain was just taken \u2014 please choose another.';
                showStep(5);
                subAvailable = false;
                clearSubdomainStatus();
            }
            showError(msg);
            btnSubmit.disabled   = false;
            btnSubmit.innerHTML  = 'Get My Site Live <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="12" height="12"><path d="M6 3l5 5-5 5"/></svg>';
            return;
        }
        showSuccessScreen(res.data);
    })
    .catch(function () {
        showError('Network error \u2014 please check your connection and try again.');
        btnSubmit.disabled  = false;
        btnSubmit.innerHTML = 'Get My Site Live <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="12" height="12"><path d="M6 3l5 5-5 5"/></svg>';
    });
});

function showSuccessScreen(data) {
    panels.forEach(function (p) { p.hidden = true; });
    progress.hidden = true;
    nav.hidden      = true;

    var msgEl     = document.getElementById('successMsg');
    var detailsEl = document.getElementById('successDetails');
    var emailNote = document.getElementById('successEmailNote');

    msgEl.textContent = 'We\u2019ve received your details for ' + data.business_name + '. Here\u2019s what happens next:';

    if (data.domain_type === 'subdomain') {
        detailsEl.innerHTML =
            '<div class="success-detail-item">' +
            '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M13 5l-7 7-3-3"/></svg>' +
            'Your site will be live at <strong>' + data.subdomain + '.certxa.com</strong> within 24 hours.' +
            '</div>' +
            '<div class="success-detail-item">' +
            '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M13 5l-7 7-3-3"/></svg>' +
            'We\u2019ll email you a link to optionally edit your site\u2019s text.' +
            '</div>';
    } else {
        detailsEl.innerHTML =
            '<div class="success-detail-item">' +
            '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M13 5l-7 7-3-3"/></svg>' +
            'We\u2019ll email you DNS setup instructions for <strong>' + data.custom_domain + '</strong>.' +
            '</div>' +
            '<div class="success-detail-item">' +
            '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M13 5l-7 7-3-3"/></svg>' +
            'Point your domain\u2019s A record to our server &mdash; takes about 5 minutes.' +
            '</div>' +
            '<div class="success-detail-item">' +
            '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M13 5l-7 7-3-3"/></svg>' +
            'Your site goes live once DNS is confirmed and the \u00a315/year fee is paid.' +
            '</div>';
    }

    emailNote.textContent = 'A confirmation email is on its way to ' + data.email + '.';
    successEl.hidden = false;
}

// Init
showStep(1);
})();
</script>

<?php require_once __DIR__ . '/includes/footer.php'; ?>
