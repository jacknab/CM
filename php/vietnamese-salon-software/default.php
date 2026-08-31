<?php
define('BRAND_NAME',    'Certxa');
define('PAGE_LANG',     'vi');
define('PAGE_TITLE',    'Phần Mềm Quản Lý Tiệm Nail Cho Chủ Tiệm Người Việt | Certxa');
define('PAGE_DESC',     'Certxa — phần mềm quản lý tiệm nail được sáng lập bởi một chủ tiệm nail người Việt tại Phoenix, Arizona. Đặt lịch trực tuyến, máy check-in tự động, POS, nhắc hẹn tự động — không hợp đồng dài hạn, hủy bất cứ lúc nào. Dùng thử miễn phí 60 ngày.');
define('PAGE_KEYWORDS', 'phần mềm quản lý tiệm nail, phần mềm tiệm nail người Việt, đặt lịch hẹn tiệm nail, phần mềm tiệm nail, quản lý tiệm nail, phần mềm cho thợ nail, certxa tiếng việt');
define('PAGE_CANONICAL','https://certxa.com/vietnamese-salon-software');
define('PAGE_ALTERNATES', json_encode([
  ['hreflang'=>'en',        'href'=>'https://certxa.com/nail-salon-software'],
  ['hreflang'=>'vi',        'href'=>'https://certxa.com/vietnamese-salon-software'],
  ['hreflang'=>'x-default', 'href'=>'https://certxa.com/nail-salon-software'],
]));
define('PAGE_OG_IMAGE',  'https://certxa.com/assets/images/og-image.jpg');
define('PAGE_BREADCRUMBS', json_encode([
  ['name'=>'Trang chủ','url'=>'https://certxa.com/'],
  ['name'=>'Dành Cho Chủ Tiệm Người Việt','url'=>'https://certxa.com/vietnamese-salon-software'],
]));
define('PAGE_SCHEMA', json_encode([
  [
    '@type'       => 'WebPage',
    '@id'         => 'https://certxa.com/vietnamese-salon-software',
    'name'        => 'Phần Mềm Quản Lý Tiệm Nail Cho Chủ Tiệm Người Việt',
    'description' => 'Certxa là phần mềm quản lý tiệm nail được sáng lập bởi một chủ tiệm nail người Việt, không hợp đồng dài hạn, hỗ trợ giao diện Tiếng Việt.',
    'url'         => 'https://certxa.com/vietnamese-salon-software',
    'inLanguage'  => 'vi',
    'isPartOf'    => ['@id'=>'https://certxa.com/#website'],
    'about'       => ['@id'=>'https://certxa.com/#software'],
  ],
  [
    '@type'      => 'FAQPage',
    'inLanguage' => 'vi',
    'mainEntity' => [
      ['@type'=>'Question','name'=>'Certxa có hỗ trợ giao diện Tiếng Việt không?','acceptedAnswer'=>['@type'=>'Answer','text'=>'Có. Certxa hỗ trợ giao diện Tiếng Việt cho chủ tiệm và nhân viên, ngoài tiếng Anh. Quý vị có thể chọn ngôn ngữ Tiếng Việt trong phần cài đặt tài khoản bất cứ lúc nào.']],
      ['@type'=>'Question','name'=>'Certxa có bắt ký hợp đồng dài hạn không?','acceptedAnswer'=>['@type'=>'Answer','text'=>'Không. Certxa tính phí theo tháng, không có hợp đồng dài hạn và không có phí thiết lập ban đầu. Quý vị có thể hủy bất cứ lúc nào mà không bị phạt.']],
      ['@type'=>'Question','name'=>'Ai đã sáng lập ra Certxa?','acceptedAnswer'=>['@type'=>'Answer','text'=>'Certxa được sáng lập bởi Tom Tham, một chủ tiệm nail người Việt, tại Phoenix, Arizona vào tháng 2 năm 2026. Anh xây dựng Certxa sau khi chứng kiến nhiều tiệm nail người Việt bị các công ty phần mềm khác ép ký hợp đồng dài hạn chỉ để có được những công cụ cơ bản như đặt lịch và check-in.']],
      ['@type'=>'Question','name'=>'Certxa có phù hợp với tiệm nail nhỏ, chỉ có một hai thợ không?','acceptedAnswer'=>['@type'=>'Answer','text'=>'Có. Gói Solo của Certxa được thiết kế riêng cho thợ nail độc lập hoặc chủ tiệm nhỏ, với đầy đủ tính năng đặt lịch, quản lý khách hàng, và thanh toán — không cần trả thêm phí cho nhân viên không có.']],
      ['@type'=>'Question','name'=>'Certxa có dùng thử miễn phí không?','acceptedAnswer'=>['@type'=>'Answer','text'=>'Có, Certxa cho dùng thử miễn phí 60 ngày. Cần có thẻ tín dụng để đăng ký nhưng sẽ không bị tính phí cho đến khi hết thời gian dùng thử.']],
    ],
  ],
]));
require 'includes/header.php';
require 'includes/nav.php';
?>

<!-- HERO -->
<section class="hero-dark-section" style="padding:100px 0 80px;">
  <div class="orb orb-1"></div><div class="orb orb-2"></div>
  <div class="container">
    <div class="hero-dark-inner" style="align-items:center;gap:60px;">
      <div class="hero-dark-copy animate-fade-up">
        <div class="hero-stars-row">
          <span class="stars-badge"><span>🇻🇳</span><span>Được Sáng Lập Bởi Chủ Tiệm Nail Người Việt</span></span>
        </div>
        <h1 class="hero-dark-headline">
          Phần mềm tiệm nail<br>
          <em>do người Việt làm chủ,<br>cho người Việt.</em>
        </h1>
        <p class="hero-dark-sub">
          Certxa được sáng lập bởi một chủ tiệm nail người Việt tại Phoenix, Arizona — không phải bởi một công ty phần mềm xa lạ chưa từng bước vào một tiệm nail. Đặt lịch trực tuyến, máy check-in, POS, nhắc hẹn tự động — tất cả trong một hệ thống, không hợp đồng dài hạn.
        </p>
        <div class="hero-dark-actions">
          <a href="/auth?mode=register" class="btn btn-gold btn-lg">Dùng Thử Miễn Phí <?= TRIAL_DAYS ?> Ngày</a>
          <a href="/about" class="btn-play-wrap"><span class="btn-play-icon">→</span><span>Đọc câu chuyện sáng lập</span></a>
        </div>
        <div style="margin-top:24px;font-size:.82rem;color:rgba(255,255,255,.55);">Không hợp đồng dài hạn · Không phí thiết lập · Hủy bất cứ lúc nào</div>
      </div>

      <div class="hero-dark-visual animate-fade-up animate-delay-2">
        <div class="ui-card" style="max-width:340px;width:100%;">
          <div style="font-size:.68rem;font-weight:700;color:var(--mid-grey);text-transform:uppercase;letter-spacing:.1em;margin-bottom:12px;">Certxa — Tổng Quan</div>
          <?php foreach ([
            ['Sáng lập','Tháng 2, 2026'],
            ['Trụ sở','Phoenix, Arizona'],
            ['Người sáng lập','Chủ tiệm nail người Việt'],
            ['Ngôn ngữ','Tiếng Việt &amp; Tiếng Anh'],
            ['Hợp đồng','Không — hủy bất cứ lúc nào'],
          ] as $f): ?>
          <div style="display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid rgba(255,255,255,.1);">
            <span style="font-size:.82rem;color:rgba(255,255,255,.55);"><?= $f[0] ?></span>
            <span style="font-size:.82rem;font-weight:700;color:#fff;"><?= $f[1] ?></span>
          </div>
          <?php endforeach; ?>
        </div>
      </div>
    </div>
  </div>
</section>

<!-- FOUNDER STORY -->
<section class="section" id="founder">
  <div class="container" style="max-width:920px;">
    <div class="feature-block">
      <div class="feature-content">
        <span class="tag tag-plum">Câu Chuyện Sáng Lập</span>
        <h2 class="feature-title">Xây dựng bởi người đã từng đứng sau bàn tiếp tân, không phải bởi một đội ngũ tiếp thị.</h2>
        <p class="feature-text">Certxa được sáng lập tại Phoenix, Arizona bởi Tom Tham — một chủ tiệm nail người Việt. Anh bắt đầu xây dựng Certxa sau khi chứng kiến nhiều tiệm nail người Việt, trong đó có cộng đồng của chính mình, bị các công ty phần mềm hiện có ép ký hợp đồng dài hạn chỉ để có được những công cụ cơ bản như đặt lịch hẹn và check-in.</p>
        <p class="feature-text">Anh muốn xây dựng một lựa chọn khác thật sự: không ràng buộc hợp đồng dài hạn, và phần mềm được làm ra bởi một người đã thật sự điều hành một tiệm nail — không chỉ bán phần mềm cho tiệm nail.</p>
        <div style="margin-top:20px;display:flex;gap:10px;">
          <a href="/about" class="btn btn-primary">Đọc Thêm Về Certxa</a>
          <a href="/auth?mode=register" style="font-size:.85rem;color:var(--plum);font-weight:600;display:flex;align-items:center;gap:4px;">Dùng Thử Miễn Phí →</a>
        </div>
      </div>
      <div class="feature-visual" style="background:linear-gradient(145deg,#f5f3ff,#ede9fe);">
        <div style="text-align:center;padding:16px;">
          <div style="font-size:3.5rem;margin-bottom:12px;">💅</div>
          <p style="font-size:.92rem;color:var(--plum);font-weight:600;line-height:1.6;">"Tôi xây dựng Certxa cho những chủ tiệm giống như tôi — những người muốn một hệ thống đáng tin cậy, không ràng buộc, và không phải trả giá đắt để có được điều đó."</p>
          <p style="font-size:.78rem;color:var(--mid-grey);margin-top:14px;">— Tom Tham, Người Sáng Lập Certxa</p>
        </div>
      </div>
    </div>
  </div>
</section>

<!-- LANGUAGE + FEATURES -->
<section class="section section-alt">
  <div class="container" style="max-width:1000px;">
    <div class="section-header">
      <span class="tag tag-gold">Hỗ Trợ Tiếng Việt</span>
      <h2 class="section-title">Một hệ thống, đầy đủ những gì tiệm nail cần</h2>
      <p class="section-subtitle">Certxa hỗ trợ giao diện Tiếng Việt cho chủ tiệm và nhân viên — quý vị và thợ trong tiệm có thể dùng hệ thống bằng ngôn ngữ mình quen thuộc nhất.</p>
    </div>
    <div class="bento" style="grid-template-columns:repeat(3,1fr);margin-top:40px;">
      <div class="bento-card">
        <h3 class="bento-title">Đặt Lịch Trực Tuyến 24/7</h3>
        <p class="bento-text">Khách hàng tự đặt lịch hẹn bất cứ lúc nào — qua website, Instagram, hoặc Google — không cần gọi điện qua lại.</p>
      </div>
      <div class="bento-card">
        <h3 class="bento-title">Máy Check-In Tự Động</h3>
        <p class="bento-text">Khách vãng lai tự check-in trên máy tính bảng, chọn dịch vụ và thợ mong muốn, tự động vào danh sách chờ.</p>
      </div>
      <div class="bento-card">
        <h3 class="bento-title">Hồ Sơ Khách Hàng</h3>
        <p class="bento-text">Lưu công thức màu gel, kiểu dáng, ghi chú riêng cho từng khách — mỗi lần khách đến, thợ đều nhớ chính xác họ muốn gì.</p>
      </div>
      <div class="bento-card">
        <h3 class="bento-title">Nhắc Hẹn Tự Động</h3>
        <p class="bento-text">Tin nhắn SMS và email nhắc lịch hẹn tự động gửi đến khách — giảm đáng kể số lượng khách "no-show".</p>
      </div>
      <div class="bento-card">
        <h3 class="bento-title">Hệ Thống Thanh Toán (POS)</h3>
        <p class="bento-text">Nhận thanh toán thẻ, Apple Pay, Google Pay ngay tại tiệm hoặc trực tuyến — tiền chuyển vào tài khoản ngân hàng vào ngày làm việc kế tiếp.</p>
      </div>
      <div class="bento-card">
        <h3 class="bento-title">Website Riêng Cho Tiệm</h3>
        <p class="bento-text">Tạo website đẹp, có sẵn chức năng đặt lịch, trong vài phút — không cần biết thiết kế web.</p>
      </div>
    </div>
  </div>
</section>

<!-- PRICING SNAPSHOT -->
<section class="section">
  <div class="container" style="max-width:820px;">
    <div class="section-header">
      <span class="tag tag-plum">Giá Cả Rõ Ràng</span>
      <h2 class="section-title">Không hợp đồng. Không phí ẩn.</h2>
      <p class="section-subtitle">Gói giá bắt đầu từ $9/tháng. Dùng thử miễn phí <?= TRIAL_DAYS ?> ngày, cần thẻ tín dụng nhưng sẽ không bị tính phí cho đến khi hết thời gian dùng thử.</p>
    </div>
    <div style="display:flex;gap:16px;justify-content:center;flex-wrap:wrap;margin-top:32px;">
      <a href="/auth?mode=register" class="btn btn-primary btn-lg">Bắt Đầu Dùng Thử Miễn Phí</a>
      <a href="/pricing" class="btn btn-secondary btn-lg">Xem Bảng Giá Chi Tiết</a>
    </div>
  </div>
</section>

<!-- FAQ -->
<section class="section section-alt">
  <div class="container" style="max-width:820px;">
    <div class="section-header">
      <span class="tag tag-plum">Câu Hỏi Thường Gặp</span>
      <h2 class="section-title">Những câu hỏi thường gặp</h2>
    </div>
    <div class="accordion">
      <div class="accordion-item">
        <h3 class="accordion-heading"><button class="accordion-btn">Certxa có hỗ trợ giao diện Tiếng Việt không? <span class="accordion-icon">+</span></button></h3>
        <div class="accordion-body">Có. Certxa hỗ trợ giao diện Tiếng Việt cho chủ tiệm và nhân viên, ngoài tiếng Anh. Quý vị có thể chọn ngôn ngữ Tiếng Việt trong phần cài đặt tài khoản bất cứ lúc nào.</div>
      </div>
      <div class="accordion-item">
        <h3 class="accordion-heading"><button class="accordion-btn">Certxa có bắt ký hợp đồng dài hạn không? <span class="accordion-icon">+</span></button></h3>
        <div class="accordion-body">Không. Certxa tính phí theo tháng, không có hợp đồng dài hạn và không có phí thiết lập ban đầu. Quý vị có thể hủy bất cứ lúc nào mà không bị phạt.</div>
      </div>
      <div class="accordion-item">
        <h3 class="accordion-heading"><button class="accordion-btn">Ai đã sáng lập ra Certxa? <span class="accordion-icon">+</span></button></h3>
        <div class="accordion-body">Certxa được sáng lập bởi Tom Tham, một chủ tiệm nail người Việt, tại Phoenix, Arizona vào tháng 2 năm 2026. Anh xây dựng Certxa sau khi chứng kiến nhiều tiệm nail người Việt bị các công ty phần mềm khác ép ký hợp đồng dài hạn chỉ để có được những công cụ cơ bản như đặt lịch và check-in.</div>
      </div>
      <div class="accordion-item">
        <h3 class="accordion-heading"><button class="accordion-btn">Certxa có phù hợp với tiệm nail nhỏ, chỉ có một hai thợ không? <span class="accordion-icon">+</span></button></h3>
        <div class="accordion-body">Có. Gói Solo của Certxa được thiết kế riêng cho thợ nail độc lập hoặc chủ tiệm nhỏ, với đầy đủ tính năng đặt lịch, quản lý khách hàng, và thanh toán — không cần trả thêm phí cho nhân viên không có.</div>
      </div>
      <div class="accordion-item">
        <h3 class="accordion-heading"><button class="accordion-btn">Certxa có dùng thử miễn phí không? <span class="accordion-icon">+</span></button></h3>
        <div class="accordion-body">Có, Certxa cho dùng thử miễn phí 60 ngày. Cần có thẻ tín dụng để đăng ký nhưng sẽ không bị tính phí cho đến khi hết thời gian dùng thử.</div>
      </div>
    </div>

    <div class="contact-banner" style="background:linear-gradient(135deg,#6366f1 0%,#8b5cf6 100%);border-radius:20px;padding:48px 40px;text-align:center;margin-top:40px;color:#fff;">
      <h2 style="color:#fff;margin:0 0 12px;font-size:1.8rem;font-family:'Cormorant Garamond',serif;font-weight:700;letter-spacing:-.02em;">Hãy thử Certxa ngay hôm nay.</h2>
      <p style="color:rgba(255,255,255,.8);margin:0 0 24px;font-size:1rem;">Dùng thử miễn phí <?= TRIAL_DAYS ?> ngày — không bị tính phí cho đến khi hết thời gian dùng thử.</p>
      <a href="/auth?mode=register" style="display:inline-block;background:#fff;color:#6366f1;font-weight:700;font-size:.95rem;padding:14px 32px;border-radius:9999px;text-decoration:none;">Bắt Đầu Dùng Thử Miễn Phí</a>
    </div>
  </div>
</section>

<?php require 'includes/footer.php'; ?>
