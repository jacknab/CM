export interface Block {
  id: string;
  name: string;
  html: string;
}

export interface BlockCategory {
  id: string;
  name: string;
  icon: string;
  blocks: Block[];
}

// ─── Hero Sections ────────────────────────────────────────────────────────────

const heroBlocks: Block[] = [
  {
    id: 'hero-dark-luxury',
    name: 'Dark Luxury Hero',
    html: `<section style="background:linear-gradient(135deg,#0f0a1a 0%,#1a0333 60%,#0d0820 100%);padding:110px 24px;text-align:center;position:relative;overflow:hidden;font-family:system-ui,sans-serif;">
<div style="position:absolute;inset:0;background:radial-gradient(ellipse at 50% 0%,rgba(201,123,43,.18) 0%,transparent 68%);pointer-events:none;"></div>
<div style="position:relative;max-width:700px;margin:0 auto;">
<p style="color:#C97B2B;font-size:12px;font-weight:700;letter-spacing:.18em;text-transform:uppercase;margin:0 0 20px;">Premium Salon Experience</p>
<h2 style="color:#fff;font-size:clamp(36px,5vw,62px);font-weight:800;line-height:1.08;margin:0 0 24px;font-family:Georgia,serif;">Where Beauty<br>Meets Excellence</h2>
<p style="color:rgba(255,255,255,.62);font-size:17px;line-height:1.75;margin:0 0 42px;">Experience premium salon services crafted to bring out your very best look.</p>
<div style="display:flex;gap:14px;justify-content:center;flex-wrap:wrap;">
<a href="#" style="display:inline-block;background:#C97B2B;color:#fff;font-weight:700;padding:15px 38px;border-radius:50px;text-decoration:none;font-size:14px;letter-spacing:.05em;">Book Appointment</a>
<a href="#" style="display:inline-block;background:rgba(255,255,255,.08);color:#fff;font-weight:600;padding:15px 32px;border-radius:50px;text-decoration:none;font-size:14px;border:1px solid rgba(255,255,255,.18);">View Services</a>
</div>
</div>
</section>`,
  },
  {
    id: 'hero-split',
    name: 'Split Hero',
    html: `<section style="display:flex;min-height:520px;font-family:system-ui,sans-serif;">
<div style="flex:1;background:linear-gradient(145deg,#0f0a1a,#1a0333);padding:80px 48px;display:flex;align-items:center;">
<div style="max-width:440px;">
<span style="display:inline-block;background:#C97B2B;color:#fff;font-size:11px;font-weight:700;letter-spacing:.15em;text-transform:uppercase;padding:5px 14px;border-radius:20px;margin-bottom:24px;">Now Booking</span>
<h2 style="color:#fff;font-size:clamp(28px,3.5vw,48px);font-weight:800;line-height:1.1;margin:0 0 18px;font-family:Georgia,serif;">Your Dream Look Starts Here</h2>
<p style="color:rgba(255,255,255,.6);font-size:16px;line-height:1.7;margin:0 0 36px;">Serving the community with expert stylists, nail artists, and beauty professionals.</p>
<a href="#" style="display:inline-block;background:#C97B2B;color:#fff;font-weight:700;padding:14px 34px;border-radius:8px;text-decoration:none;font-size:14px;">Schedule Now →</a>
</div>
</div>
<div style="flex:1;background:linear-gradient(135deg,#2d1b4e,#4a1d80);display:flex;align-items:center;justify-content:center;min-width:280px;">
<div style="text-align:center;color:rgba(255,255,255,.25);">
<div style="font-size:56px;margin-bottom:12px;">📷</div>
<p style="font-size:13px;letter-spacing:.08em;">SALON PHOTO</p>
</div>
</div>
</section>`,
  },
  {
    id: 'hero-light-minimal',
    name: 'Light Minimal Hero',
    html: `<section style="background:#faf8f5;padding:100px 24px;text-align:center;font-family:system-ui,sans-serif;border-bottom:1px solid #e8e2d9;">
<p style="color:#C97B2B;font-size:12px;font-weight:700;letter-spacing:.2em;text-transform:uppercase;margin:0 0 16px;">Est. 2018 · Award-Winning Salon</p>
<h2 style="color:#1a1205;font-size:clamp(34px,5vw,64px);font-weight:700;line-height:1.1;margin:0 0 22px;font-family:Georgia,serif;letter-spacing:-.02em;">Luxury Treatments,<br><em style="font-style:italic;color:#8b5a2b;">Exceptional Results</em></h2>
<p style="color:#6b5c45;font-size:17px;line-height:1.7;margin:0 auto 40px;max-width:560px;">We believe every visit should feel like a retreat. Come in, relax, and leave looking your absolute best.</p>
<a href="#" style="display:inline-block;background:#1a1205;color:#fff;font-weight:700;padding:16px 40px;border-radius:6px;text-decoration:none;font-size:14px;letter-spacing:.04em;">Book a Session</a>
</section>`,
  },
];

// ─── Services ─────────────────────────────────────────────────────────────────

const serviceBlocks: Block[] = [
  {
    id: 'services-icon-cards',
    name: 'Service Icon Cards',
    html: `<section style="background:#0f0a1a;padding:80px 24px;font-family:system-ui,sans-serif;">
<div style="max-width:1040px;margin:0 auto;">
<div style="text-align:center;margin-bottom:52px;">
<p style="color:#C97B2B;font-size:11px;font-weight:700;letter-spacing:.2em;text-transform:uppercase;margin:0 0 12px;">What We Offer</p>
<h2 style="color:#fff;font-size:clamp(28px,3.5vw,44px);font-weight:700;margin:0;font-family:Georgia,serif;">Our Services</h2>
</div>
<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:20px;">
<div style="background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);border-radius:12px;padding:32px 24px;text-align:center;">
<div style="font-size:36px;margin-bottom:16px;">💅</div>
<h3 style="color:#fff;font-size:17px;font-weight:700;margin:0 0 10px;">Nail Art</h3>
<p style="color:rgba(255,255,255,.5);font-size:13px;line-height:1.6;margin:0 0 16px;">Gel, acrylic, dip powder, and intricate nail art designs.</p>
<p style="color:#C97B2B;font-size:15px;font-weight:700;margin:0;">From $35</p>
</div>
<div style="background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);border-radius:12px;padding:32px 24px;text-align:center;">
<div style="font-size:36px;margin-bottom:16px;">✂️</div>
<h3 style="color:#fff;font-size:17px;font-weight:700;margin:0 0 10px;">Haircuts</h3>
<p style="color:rgba(255,255,255,.5);font-size:13px;line-height:1.6;margin:0 0 16px;">Precision cuts, styling, and blowouts for any hair type.</p>
<p style="color:#C97B2B;font-size:15px;font-weight:700;margin:0;">From $45</p>
</div>
<div style="background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);border-radius:12px;padding:32px 24px;text-align:center;">
<div style="font-size:36px;margin-bottom:16px;">🌿</div>
<h3 style="color:#fff;font-size:17px;font-weight:700;margin:0 0 10px;">Spa Treatments</h3>
<p style="color:rgba(255,255,255,.5);font-size:13px;line-height:1.6;margin:0 0 16px;">Relaxing facials, body wraps, and detox treatments.</p>
<p style="color:#C97B2B;font-size:15px;font-weight:700;margin:0;">From $65</p>
</div>
<div style="background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);border-radius:12px;padding:32px 24px;text-align:center;">
<div style="font-size:36px;margin-bottom:16px;">💇</div>
<h3 style="color:#fff;font-size:17px;font-weight:700;margin:0 0 10px;">Color & Highlights</h3>
<p style="color:rgba(255,255,255,.5);font-size:13px;line-height:1.6;margin:0 0 16px;">Balayage, ombre, full color, and toning services.</p>
<p style="color:#C97B2B;font-size:15px;font-weight:700;margin:0;">From $80</p>
</div>
</div>
</div>
</section>`,
  },
  {
    id: 'services-price-menu',
    name: 'Service Price Menu',
    html: `<section style="background:#faf8f5;padding:80px 24px;font-family:system-ui,sans-serif;">
<div style="max-width:820px;margin:0 auto;">
<div style="text-align:center;margin-bottom:48px;">
<p style="color:#C97B2B;font-size:11px;font-weight:700;letter-spacing:.2em;text-transform:uppercase;margin:0 0 10px;">Our Menu</p>
<h2 style="color:#1a1205;font-size:clamp(26px,3.5vw,40px);font-weight:700;margin:0;font-family:Georgia,serif;">Services &amp; Pricing</h2>
</div>
<div style="display:grid;grid-template-columns:1fr 1fr;gap:0 40px;">
<div>
<p style="color:#C97B2B;font-size:11px;font-weight:700;letter-spacing:.15em;text-transform:uppercase;margin:0 0 16px;padding-bottom:8px;border-bottom:2px solid #C97B2B;">Hair Services</p>
<div style="display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid #e8e2d9;"><span style="color:#3d2b1f;font-size:14px;">Women's Haircut</span><span style="color:#C97B2B;font-weight:700;font-size:14px;">$55</span></div>
<div style="display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid #e8e2d9;"><span style="color:#3d2b1f;font-size:14px;">Men's Haircut</span><span style="color:#C97B2B;font-weight:700;font-size:14px;">$35</span></div>
<div style="display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid #e8e2d9;"><span style="color:#3d2b1f;font-size:14px;">Blowout &amp; Style</span><span style="color:#C97B2B;font-weight:700;font-size:14px;">$45</span></div>
<div style="display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid #e8e2d9;"><span style="color:#3d2b1f;font-size:14px;">Balayage</span><span style="color:#C97B2B;font-weight:700;font-size:14px;">$120+</span></div>
<div style="display:flex;justify-content:space-between;padding:10px 0;"><span style="color:#3d2b1f;font-size:14px;">Full Color</span><span style="color:#C97B2B;font-weight:700;font-size:14px;">$85+</span></div>
</div>
<div>
<p style="color:#C97B2B;font-size:11px;font-weight:700;letter-spacing:.15em;text-transform:uppercase;margin:0 0 16px;padding-bottom:8px;border-bottom:2px solid #C97B2B;">Nail Services</p>
<div style="display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid #e8e2d9;"><span style="color:#3d2b1f;font-size:14px;">Gel Manicure</span><span style="color:#C97B2B;font-weight:700;font-size:14px;">$45</span></div>
<div style="display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid #e8e2d9;"><span style="color:#3d2b1f;font-size:14px;">Acrylic Full Set</span><span style="color:#C97B2B;font-weight:700;font-size:14px;">$65</span></div>
<div style="display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid #e8e2d9;"><span style="color:#3d2b1f;font-size:14px;">Pedicure</span><span style="color:#C97B2B;font-weight:700;font-size:14px;">$50</span></div>
<div style="display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid #e8e2d9;"><span style="color:#3d2b1f;font-size:14px;">Dip Powder</span><span style="color:#C97B2B;font-weight:700;font-size:14px;">$55</span></div>
<div style="display:flex;justify-content:space-between;padding:10px 0;"><span style="color:#3d2b1f;font-size:14px;">Nail Art Design</span><span style="color:#C97B2B;font-weight:700;font-size:14px;">$10+</span></div>
</div>
</div>
</div>
</section>`,
  },
  {
    id: 'services-highlights',
    name: 'Service Highlights',
    html: `<section style="background:#fff;padding:80px 24px;font-family:system-ui,sans-serif;">
<div style="max-width:1000px;margin:0 auto;">
<div style="text-align:center;margin-bottom:52px;">
<h2 style="color:#1a1205;font-size:clamp(26px,3vw,40px);font-weight:700;margin:0 0 12px;font-family:Georgia,serif;">Signature Services</h2>
<p style="color:#6b5c45;font-size:16px;margin:0;">Our most-loved treatments, all in one place.</p>
</div>
<div style="display:flex;flex-direction:column;gap:0;">
<div style="display:flex;gap:0;align-items:stretch;">
<div style="flex:1;background:linear-gradient(135deg,#1a0333,#2d0f5c);padding:48px 40px;display:flex;align-items:center;">
<div>
<p style="color:#C97B2B;font-size:11px;font-weight:700;letter-spacing:.15em;text-transform:uppercase;margin:0 0 12px;">Most Popular</p>
<h3 style="color:#fff;font-size:26px;font-weight:700;margin:0 0 14px;font-family:Georgia,serif;">Luxury Gel Manicure</h3>
<p style="color:rgba(255,255,255,.6);font-size:14px;line-height:1.7;margin:0 0 24px;">A full-service manicure using premium gel products. Long-lasting shine for up to 3 weeks.</p>
<span style="color:#C97B2B;font-size:18px;font-weight:800;">$45</span>
</div>
</div>
<div style="flex:1;background:#f0e8d6;display:flex;align-items:center;justify-content:center;min-height:240px;">
<div style="text-align:center;color:rgba(139,90,43,.3);"><div style="font-size:48px;">💅</div></div>
</div>
</div>
<div style="display:flex;gap:0;align-items:stretch;">
<div style="flex:1;background:#f0e8d6;display:flex;align-items:center;justify-content:center;min-height:220px;">
<div style="text-align:center;color:rgba(139,90,43,.3);"><div style="font-size:48px;">✂️</div></div>
</div>
<div style="flex:1;background:#faf8f5;padding:48px 40px;display:flex;align-items:center;">
<div>
<h3 style="color:#1a1205;font-size:26px;font-weight:700;margin:0 0 14px;font-family:Georgia,serif;">Precision Haircut</h3>
<p style="color:#6b5c45;font-size:14px;line-height:1.7;margin:0 0 24px;">Expertly crafted cuts designed to complement your face shape and lifestyle.</p>
<span style="color:#C97B2B;font-size:18px;font-weight:800;">From $45</span>
</div>
</div>
</div>
</div>
</div>
</section>`,
  },
];

// ─── Pricing ──────────────────────────────────────────────────────────────────

const pricingBlocks: Block[] = [
  {
    id: 'pricing-simple-list',
    name: 'Simple Price List',
    html: `<section style="background:#fff;padding:80px 24px;font-family:system-ui,sans-serif;">
<div style="max-width:640px;margin:0 auto;">
<div style="text-align:center;margin-bottom:48px;">
<p style="color:#C97B2B;font-size:11px;font-weight:700;letter-spacing:.2em;text-transform:uppercase;margin:0 0 10px;">Transparent Pricing</p>
<h2 style="color:#1a1205;font-size:clamp(26px,3.5vw,40px);font-weight:700;margin:0;font-family:Georgia,serif;">Simple, Clear Prices</h2>
</div>
<div style="background:#faf8f5;border-radius:12px;overflow:hidden;border:1px solid #e8e2d9;">
<div style="background:#1a0333;padding:18px 24px;"><p style="color:#C97B2B;font-size:12px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;margin:0;">Hair Services</p></div>
<div style="padding:0 24px;">
<div style="display:flex;justify-content:space-between;align-items:center;padding:16px 0;border-bottom:1px solid #e8e2d9;"><div><p style="color:#1a1205;font-size:15px;font-weight:600;margin:0;">Women's Cut &amp; Style</p><p style="color:#8b7c6e;font-size:12px;margin:4px 0 0;">Shampoo, cut, and blowout</p></div><span style="color:#C97B2B;font-size:17px;font-weight:800;">$65</span></div>
<div style="display:flex;justify-content:space-between;align-items:center;padding:16px 0;border-bottom:1px solid #e8e2d9;"><div><p style="color:#1a1205;font-size:15px;font-weight:600;margin:0;">Men's Cut</p><p style="color:#8b7c6e;font-size:12px;margin:4px 0 0;">Includes shampoo and styling</p></div><span style="color:#C97B2B;font-size:17px;font-weight:800;">$38</span></div>
<div style="display:flex;justify-content:space-between;align-items:center;padding:16px 0;border-bottom:1px solid #e8e2d9;"><div><p style="color:#1a1205;font-size:15px;font-weight:600;margin:0;">Color Treatment</p><p style="color:#8b7c6e;font-size:12px;margin:4px 0 0;">Single process, includes gloss</p></div><span style="color:#C97B2B;font-size:17px;font-weight:800;">$90+</span></div>
<div style="display:flex;justify-content:space-between;align-items:center;padding:16px 0;"><div><p style="color:#1a1205;font-size:15px;font-weight:600;margin:0;">Balayage / Highlights</p><p style="color:#8b7c6e;font-size:12px;margin:4px 0 0;">Full or partial, includes toner</p></div><span style="color:#C97B2B;font-size:17px;font-weight:800;">$130+</span></div>
</div>
</div>
</div>
</section>`,
  },
  {
    id: 'pricing-tier-cards',
    name: 'Pricing Tier Cards',
    html: `<section style="background:#0f0a1a;padding:80px 24px;font-family:system-ui,sans-serif;">
<div style="max-width:900px;margin:0 auto;">
<div style="text-align:center;margin-bottom:52px;">
<p style="color:#C97B2B;font-size:11px;font-weight:700;letter-spacing:.2em;text-transform:uppercase;margin:0 0 12px;">Choose Your Plan</p>
<h2 style="color:#fff;font-size:clamp(26px,3.5vw,42px);font-weight:700;margin:0;font-family:Georgia,serif;">Membership Packages</h2>
</div>
<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:20px;">
<div style="background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.1);border-radius:16px;padding:36px 28px;">
<p style="color:rgba(255,255,255,.5);font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:.1em;margin:0 0 8px;">Essential</p>
<p style="color:#fff;font-size:42px;font-weight:800;margin:0 0 4px;">$89<span style="font-size:16px;font-weight:400;color:rgba(255,255,255,.4)">/mo</span></p>
<p style="color:rgba(255,255,255,.45);font-size:13px;margin:0 0 28px;">Perfect for regular maintenance</p>
<div style="border-top:1px solid rgba(255,255,255,.08);padding-top:24px;display:flex;flex-direction:column;gap:12px;">
<p style="color:rgba(255,255,255,.7);font-size:14px;margin:0;">✓ 1 haircut per month</p>
<p style="color:rgba(255,255,255,.7);font-size:14px;margin:0;">✓ 10% off all services</p>
<p style="color:rgba(255,255,255,.7);font-size:14px;margin:0;">✓ Priority booking</p>
</div>
<a href="#" style="display:block;margin-top:28px;background:rgba(255,255,255,.08);color:#fff;text-align:center;padding:12px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;border:1px solid rgba(255,255,255,.12);">Get Started</a>
</div>
<div style="background:linear-gradient(145deg,#C97B2B,#a85e1a);border-radius:16px;padding:36px 28px;position:relative;">
<p style="position:absolute;top:-12px;left:50%;transform:translateX(-50%);background:#fff;color:#C97B2B;font-size:11px;font-weight:800;padding:4px 14px;border-radius:20px;letter-spacing:.08em;white-space:nowrap;">MOST POPULAR</p>
<p style="color:rgba(255,255,255,.8);font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:.1em;margin:0 0 8px;">Luxury</p>
<p style="color:#fff;font-size:42px;font-weight:800;margin:0 0 4px;">$149<span style="font-size:16px;font-weight:400;color:rgba(255,255,255,.6)">/mo</span></p>
<p style="color:rgba(255,255,255,.7);font-size:13px;margin:0 0 28px;">For the full salon experience</p>
<div style="border-top:1px solid rgba(255,255,255,.25);padding-top:24px;display:flex;flex-direction:column;gap:12px;">
<p style="color:#fff;font-size:14px;margin:0;">✓ 2 services per month</p>
<p style="color:#fff;font-size:14px;margin:0;">✓ 20% off all services</p>
<p style="color:#fff;font-size:14px;margin:0;">✓ Free nail art design</p>
<p style="color:#fff;font-size:14px;margin:0;">✓ VIP priority booking</p>
</div>
<a href="#" style="display:block;margin-top:28px;background:#fff;color:#C97B2B;text-align:center;padding:12px;border-radius:8px;text-decoration:none;font-weight:700;font-size:14px;">Get Started</a>
</div>
</div>
</div>
</section>`,
  },
  {
    id: 'pricing-table',
    name: 'Service Price Table',
    html: `<section style="background:#faf8f5;padding:80px 24px;font-family:system-ui,sans-serif;">
<div style="max-width:780px;margin:0 auto;">
<div style="text-align:center;margin-bottom:48px;">
<h2 style="color:#1a1205;font-size:clamp(26px,3.5vw,40px);font-weight:700;margin:0 0 12px;font-family:Georgia,serif;">Full Service Menu</h2>
<p style="color:#6b5c45;font-size:16px;margin:0;">All prices listed are starting prices. Final cost depends on hair length and complexity.</p>
</div>
<table style="width:100%;border-collapse:collapse;">
<thead><tr style="background:#1a0333;"><th style="color:#C97B2B;font-size:11px;letter-spacing:.12em;text-transform:uppercase;padding:14px 20px;text-align:left;">Service</th><th style="color:#C97B2B;font-size:11px;letter-spacing:.12em;text-transform:uppercase;padding:14px 20px;text-align:left;">Description</th><th style="color:#C97B2B;font-size:11px;letter-spacing:.12em;text-transform:uppercase;padding:14px 20px;text-align:right;">Price</th></tr></thead>
<tbody>
<tr style="background:#fff;"><td style="padding:14px 20px;color:#1a1205;font-weight:600;font-size:14px;border-bottom:1px solid #e8e2d9;">Haircut &amp; Style</td><td style="padding:14px 20px;color:#6b5c45;font-size:13px;border-bottom:1px solid #e8e2d9;">Shampoo, cut, and blowdry</td><td style="padding:14px 20px;color:#C97B2B;font-weight:700;font-size:15px;text-align:right;border-bottom:1px solid #e8e2d9;">$55+</td></tr>
<tr style="background:#faf8f5;"><td style="padding:14px 20px;color:#1a1205;font-weight:600;font-size:14px;border-bottom:1px solid #e8e2d9;">Full Color</td><td style="padding:14px 20px;color:#6b5c45;font-size:13px;border-bottom:1px solid #e8e2d9;">Single process color, all lengths</td><td style="padding:14px 20px;color:#C97B2B;font-weight:700;font-size:15px;text-align:right;border-bottom:1px solid #e8e2d9;">$85+</td></tr>
<tr style="background:#fff;"><td style="padding:14px 20px;color:#1a1205;font-weight:600;font-size:14px;border-bottom:1px solid #e8e2d9;">Balayage</td><td style="padding:14px 20px;color:#6b5c45;font-size:13px;border-bottom:1px solid #e8e2d9;">Hand-painted highlights + toner</td><td style="padding:14px 20px;color:#C97B2B;font-weight:700;font-size:15px;text-align:right;border-bottom:1px solid #e8e2d9;">$130+</td></tr>
<tr style="background:#faf8f5;"><td style="padding:14px 20px;color:#1a1205;font-weight:600;font-size:14px;border-bottom:1px solid #e8e2d9;">Gel Manicure</td><td style="padding:14px 20px;color:#6b5c45;font-size:13px;border-bottom:1px solid #e8e2d9;">Gel polish, 3-week wear</td><td style="padding:14px 20px;color:#C97B2B;font-weight:700;font-size:15px;text-align:right;border-bottom:1px solid #e8e2d9;">$45</td></tr>
<tr style="background:#fff;"><td style="padding:14px 20px;color:#1a1205;font-weight:600;font-size:14px;">Pedicure</td><td style="padding:14px 20px;color:#6b5c45;font-size:13px;">Soak, scrub, polish</td><td style="padding:14px 20px;color:#C97B2B;font-weight:700;font-size:15px;text-align:right;">$50</td></tr>
</tbody>
</table>
</div>
</section>`,
  },
];

// ─── Gallery ──────────────────────────────────────────────────────────────────

const galleryBlocks: Block[] = [
  {
    id: 'gallery-4col',
    name: 'Photo Grid (4 col)',
    html: `<section style="background:#1a1205;padding:80px 24px;font-family:system-ui,sans-serif;">
<div style="max-width:1040px;margin:0 auto;">
<div style="text-align:center;margin-bottom:48px;">
<p style="color:#C97B2B;font-size:11px;font-weight:700;letter-spacing:.2em;text-transform:uppercase;margin:0 0 12px;">Our Work</p>
<h2 style="color:#fff;font-size:clamp(26px,3.5vw,40px);font-weight:700;margin:0;font-family:Georgia,serif;">Portfolio</h2>
</div>
<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;">
<div style="aspect-ratio:1;background:linear-gradient(135deg,#2d1b4e,#4a1d80);border-radius:6px;display:flex;align-items:center;justify-content:center;"><span style="font-size:32px;opacity:.4;">📷</span></div>
<div style="aspect-ratio:1;background:linear-gradient(135deg,#3d1205,#7a1f0a);border-radius:6px;display:flex;align-items:center;justify-content:center;"><span style="font-size:32px;opacity:.4;">📷</span></div>
<div style="aspect-ratio:1;background:linear-gradient(135deg,#0a2d1a,#1a5c38);border-radius:6px;display:flex;align-items:center;justify-content:center;"><span style="font-size:32px;opacity:.4;">📷</span></div>
<div style="aspect-ratio:1;background:linear-gradient(135deg,#2d2000,#6b4a00);border-radius:6px;display:flex;align-items:center;justify-content:center;"><span style="font-size:32px;opacity:.4;">📷</span></div>
<div style="aspect-ratio:1;background:linear-gradient(135deg,#001a3d,#0a3d7a);border-radius:6px;display:flex;align-items:center;justify-content:center;"><span style="font-size:32px;opacity:.4;">📷</span></div>
<div style="aspect-ratio:1;background:linear-gradient(135deg,#1a0020,#4d0060);border-radius:6px;display:flex;align-items:center;justify-content:center;"><span style="font-size:32px;opacity:.4;">📷</span></div>
<div style="aspect-ratio:1;background:linear-gradient(135deg,#1a1a00,#4d4d00);border-radius:6px;display:flex;align-items:center;justify-content:center;"><span style="font-size:32px;opacity:.4;">📷</span></div>
<div style="aspect-ratio:1;background:linear-gradient(135deg,#001a1a,#004d4d);border-radius:6px;display:flex;align-items:center;justify-content:center;"><span style="font-size:32px;opacity:.4;">📷</span></div>
</div>
<p style="text-align:center;margin:32px 0 0;"><a href="#" style="display:inline-block;border:1px solid rgba(255,255,255,.2);color:rgba(255,255,255,.7);padding:12px 32px;border-radius:8px;text-decoration:none;font-size:14px;font-weight:600;">View Full Gallery</a></p>
</div>
</section>`,
  },
  {
    id: 'gallery-3col-captions',
    name: 'Gallery with Captions',
    html: `<section style="background:#faf8f5;padding:80px 24px;font-family:system-ui,sans-serif;">
<div style="max-width:960px;margin:0 auto;">
<div style="text-align:center;margin-bottom:48px;">
<h2 style="color:#1a1205;font-size:clamp(26px,3.5vw,40px);font-weight:700;margin:0 0 12px;font-family:Georgia,serif;">Our Work Speaks for Itself</h2>
<p style="color:#6b5c45;font-size:15px;margin:0;">Real results from real clients.</p>
</div>
<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:20px;">
<div style="background:#fff;border-radius:10px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.06);">
<div style="height:200px;background:linear-gradient(135deg,#2d1b4e,#4a1d80);display:flex;align-items:center;justify-content:center;"><span style="font-size:40px;opacity:.35;">📷</span></div>
<div style="padding:16px;"><p style="color:#1a1205;font-weight:600;font-size:14px;margin:0 0 4px;">Balayage &amp; Gloss</p><p style="color:#8b7c6e;font-size:12px;margin:0;">Hand-painted highlights with toner</p></div>
</div>
<div style="background:#fff;border-radius:10px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.06);">
<div style="height:200px;background:linear-gradient(135deg,#1a2d00,#3a6600);display:flex;align-items:center;justify-content:center;"><span style="font-size:40px;opacity:.35;">📷</span></div>
<div style="padding:16px;"><p style="color:#1a1205;font-weight:600;font-size:14px;margin:0 0 4px;">Nail Art Design</p><p style="color:#8b7c6e;font-size:12px;margin:0;">Custom gel nail art with florals</p></div>
</div>
<div style="background:#fff;border-radius:10px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.06);">
<div style="height:200px;background:linear-gradient(135deg,#3d1205,#7a1f0a);display:flex;align-items:center;justify-content:center;"><span style="font-size:40px;opacity:.35;">📷</span></div>
<div style="padding:16px;"><p style="color:#1a1205;font-weight:600;font-size:14px;margin:0 0 4px;">Precision Haircut</p><p style="color:#8b7c6e;font-size:12px;margin:0;">Bob with texture and layers</p></div>
</div>
</div>
</div>
</section>`,
  },
];

// ─── Testimonials ─────────────────────────────────────────────────────────────

const testimonialBlocks: Block[] = [
  {
    id: 'testimonials-star-cards',
    name: 'Star Rating Cards',
    html: `<section style="background:#fff;padding:80px 24px;font-family:system-ui,sans-serif;">
<div style="max-width:1000px;margin:0 auto;">
<div style="text-align:center;margin-bottom:48px;">
<p style="color:#C97B2B;font-size:11px;font-weight:700;letter-spacing:.2em;text-transform:uppercase;margin:0 0 12px;">Client Love</p>
<h2 style="color:#1a1205;font-size:clamp(26px,3.5vw,40px);font-weight:700;margin:0;font-family:Georgia,serif;">What Our Clients Say</h2>
</div>
<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:20px;">
<div style="background:#faf8f5;border-radius:12px;padding:28px;border:1px solid #e8e2d9;">
<p style="color:#C97B2B;font-size:18px;margin:0 0 14px;letter-spacing:2px;">★★★★★</p>
<p style="color:#3d2b1f;font-size:14px;line-height:1.7;margin:0 0 20px;">"Absolutely amazing experience every single time. The team is so talented and always makes me feel so beautiful. I won't go anywhere else!"</p>
<div style="display:flex;align-items:center;gap:12px;"><div style="width:38px;height:38px;border-radius:50%;background:linear-gradient(135deg,#C97B2B,#a85e1a);display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:14px;">S</div><div><p style="color:#1a1205;font-weight:700;font-size:13px;margin:0;">Sarah M.</p><p style="color:#8b7c6e;font-size:11px;margin:2px 0 0;">Verified Client</p></div></div>
</div>
<div style="background:#faf8f5;border-radius:12px;padding:28px;border:1px solid #e8e2d9;">
<p style="color:#C97B2B;font-size:18px;margin:0 0 14px;letter-spacing:2px;">★★★★★</p>
<p style="color:#3d2b1f;font-size:14px;line-height:1.7;margin:0 0 20px;">"I came in for a balayage and left looking like a whole new person. The stylist really listened to what I wanted. Highly recommend!"</p>
<div style="display:flex;align-items:center;gap:12px;"><div style="width:38px;height:38px;border-radius:50%;background:linear-gradient(135deg,#4a1d80,#2d1b4e);display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:14px;">J</div><div><p style="color:#1a1205;font-weight:700;font-size:13px;margin:0;">Jessica L.</p><p style="color:#8b7c6e;font-size:11px;margin:2px 0 0;">Verified Client</p></div></div>
</div>
<div style="background:#faf8f5;border-radius:12px;padding:28px;border:1px solid #e8e2d9;">
<p style="color:#C97B2B;font-size:18px;margin:0 0 14px;letter-spacing:2px;">★★★★★</p>
<p style="color:#3d2b1f;font-size:14px;line-height:1.7;margin:0 0 20px;">"The nail techs here are truly artists. My gel nails lasted a full month and I got so many compliments. This place is a gem!"</p>
<div style="display:flex;align-items:center;gap:12px;"><div style="width:38px;height:38px;border-radius:50%;background:linear-gradient(135deg,#1a5c38,#0a2d1a);display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:14px;">M</div><div><p style="color:#1a1205;font-weight:700;font-size:13px;margin:0;">Michelle T.</p><p style="color:#8b7c6e;font-size:11px;margin:2px 0 0;">Verified Client</p></div></div>
</div>
</div>
</div>
</section>`,
  },
  {
    id: 'testimonials-featured',
    name: 'Featured Testimonial',
    html: `<section style="background:linear-gradient(135deg,#1a0333,#0f0a1a);padding:90px 24px;font-family:system-ui,sans-serif;">
<div style="max-width:720px;margin:0 auto;text-align:center;">
<p style="color:#C97B2B;font-size:28px;margin:0 0 24px;letter-spacing:3px;">★★★★★</p>
<p style="color:#fff;font-size:clamp(18px,2.5vw,26px);font-weight:300;line-height:1.6;margin:0 0 36px;font-style:italic;font-family:Georgia,serif;">"I've been coming here for three years and I wouldn't trust anyone else with my hair. The team is consistently exceptional — professional, creative, and genuinely passionate about their craft."</p>
<div style="display:flex;align-items:center;justify-content:center;gap:16px;">
<div style="width:52px;height:52px;border-radius:50%;background:linear-gradient(135deg,#C97B2B,#a85e1a);display:flex;align-items:center;justify-content:center;color:#fff;font-weight:800;font-size:18px;">A</div>
<div style="text-align:left;"><p style="color:#fff;font-weight:700;font-size:15px;margin:0;">Amanda K.</p><p style="color:rgba(255,255,255,.45);font-size:13px;margin:4px 0 0;">Loyal Client · 3 Years</p></div>
</div>
</div>
</section>`,
  },
  {
    id: 'testimonials-strip',
    name: 'Review Strip',
    html: `<section style="background:#faf8f5;padding:56px 24px;font-family:system-ui,sans-serif;border-top:1px solid #e8e2d9;border-bottom:1px solid #e8e2d9;">
<div style="max-width:1040px;margin:0 auto;">
<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:0;border-radius:12px;overflow:hidden;border:1px solid #e8e2d9;background:#fff;">
<div style="padding:28px 24px;border-right:1px solid #e8e2d9;text-align:center;">
<p style="color:#C97B2B;font-size:36px;font-weight:800;margin:0 0 4px;">4.9</p>
<p style="color:#C97B2B;font-size:14px;margin:0 0 8px;">★★★★★</p>
<p style="color:#8b7c6e;font-size:12px;margin:0;">Google Reviews</p>
</div>
<div style="padding:28px 24px;border-right:1px solid #e8e2d9;text-align:center;">
<p style="color:#1a1205;font-size:36px;font-weight:800;margin:0 0 4px;">500+</p>
<p style="color:#C97B2B;font-size:14px;margin:0 0 8px;">⭐ Happy Clients</p>
<p style="color:#8b7c6e;font-size:12px;margin:0;">And counting</p>
</div>
<div style="padding:28px 24px;border-right:1px solid #e8e2d9;text-align:center;">
<p style="color:#1a1205;font-size:36px;font-weight:800;margin:0 0 4px;">8+</p>
<p style="color:#C97B2B;font-size:14px;margin:0 0 8px;">Years of Experience</p>
<p style="color:#8b7c6e;font-size:12px;margin:0;">Est. 2016</p>
</div>
<div style="padding:28px 24px;text-align:center;">
<p style="color:#1a1205;font-size:36px;font-weight:800;margin:0 0 4px;">15</p>
<p style="color:#C97B2B;font-size:14px;margin:0 0 8px;">Expert Stylists</p>
<p style="color:#8b7c6e;font-size:12px;margin:0;">Award-winning team</p>
</div>
</div>
</div>
</section>`,
  },
];

// ─── Team ─────────────────────────────────────────────────────────────────────

const teamBlocks: Block[] = [
  {
    id: 'team-cards',
    name: 'Team Cards',
    html: `<section style="background:#fff;padding:80px 24px;font-family:system-ui,sans-serif;">
<div style="max-width:980px;margin:0 auto;">
<div style="text-align:center;margin-bottom:52px;">
<p style="color:#C97B2B;font-size:11px;font-weight:700;letter-spacing:.2em;text-transform:uppercase;margin:0 0 12px;">The Experts</p>
<h2 style="color:#1a1205;font-size:clamp(26px,3.5vw,40px);font-weight:700;margin:0;font-family:Georgia,serif;">Meet Our Team</h2>
</div>
<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:24px;">
<div style="text-align:center;">
<div style="width:100px;height:100px;border-radius:50%;background:linear-gradient(135deg,#2d1b4e,#4a1d80);margin:0 auto 16px;display:flex;align-items:center;justify-content:center;font-size:36px;">👩</div>
<h3 style="color:#1a1205;font-size:17px;font-weight:700;margin:0 0 4px;">Jessica Rivera</h3>
<p style="color:#C97B2B;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:.1em;margin:0 0 10px;">Lead Stylist</p>
<p style="color:#6b5c45;font-size:13px;line-height:1.6;margin:0;">8 years specializing in color and balayage. Known for her attention to detail and warm chair-side manner.</p>
</div>
<div style="text-align:center;">
<div style="width:100px;height:100px;border-radius:50%;background:linear-gradient(135deg,#C97B2B,#a85e1a);margin:0 auto 16px;display:flex;align-items:center;justify-content:center;font-size:36px;">👨</div>
<h3 style="color:#1a1205;font-size:17px;font-weight:700;margin:0 0 4px;">Marcus Lee</h3>
<p style="color:#C97B2B;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:.1em;margin:0 0 10px;">Barber Specialist</p>
<p style="color:#6b5c45;font-size:13px;line-height:1.6;margin:0;">Master barber with 10 years of experience in precision fades, tapers, and beard sculpting.</p>
</div>
<div style="text-align:center;">
<div style="width:100px;height:100px;border-radius:50%;background:linear-gradient(135deg,#1a5c38,#0a2d1a);margin:0 auto 16px;display:flex;align-items:center;justify-content:center;font-size:36px;">💅</div>
<h3 style="color:#1a1205;font-size:17px;font-weight:700;margin:0 0 4px;">Anh Nguyen</h3>
<p style="color:#C97B2B;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:.1em;margin:0 0 10px;">Nail Technician</p>
<p style="color:#6b5c45;font-size:13px;line-height:1.6;margin:0;">Certified nail tech specializing in gel, acrylic, and intricate 3D nail art designs for every occasion.</p>
</div>
</div>
</div>
</section>`,
  },
  {
    id: 'team-list',
    name: 'Team List',
    html: `<section style="background:#0f0a1a;padding:80px 24px;font-family:system-ui,sans-serif;">
<div style="max-width:820px;margin:0 auto;">
<div style="margin-bottom:48px;">
<p style="color:#C97B2B;font-size:11px;font-weight:700;letter-spacing:.2em;text-transform:uppercase;margin:0 0 12px;">Our Specialists</p>
<h2 style="color:#fff;font-size:clamp(26px,3.5vw,40px);font-weight:700;margin:0;font-family:Georgia,serif;">The People Behind Your Look</h2>
</div>
<div style="display:flex;flex-direction:column;gap:0;">
<div style="display:flex;align-items:center;gap:20px;padding:20px 0;border-bottom:1px solid rgba(255,255,255,.08);">
<div style="width:56px;height:56px;border-radius:50%;background:linear-gradient(135deg,#C97B2B,#a85e1a);display:flex;align-items:center;justify-content:center;font-size:22px;flex-shrink:0;">👩</div>
<div style="flex:1;"><h3 style="color:#fff;font-size:15px;font-weight:700;margin:0 0 2px;">Jessica Rivera</h3><p style="color:#C97B2B;font-size:12px;margin:0 0 6px;font-weight:600;">Lead Stylist · 8 years</p><p style="color:rgba(255,255,255,.45);font-size:13px;margin:0;">Color, balayage, and cuts</p></div>
<a href="#" style="background:rgba(201,123,43,.15);color:#C97B2B;border:1px solid rgba(201,123,43,.3);padding:8px 18px;border-radius:6px;text-decoration:none;font-size:13px;font-weight:600;white-space:nowrap;">Book</a>
</div>
<div style="display:flex;align-items:center;gap:20px;padding:20px 0;border-bottom:1px solid rgba(255,255,255,.08);">
<div style="width:56px;height:56px;border-radius:50%;background:linear-gradient(135deg,#2d1b4e,#4a1d80);display:flex;align-items:center;justify-content:center;font-size:22px;flex-shrink:0;">👨</div>
<div style="flex:1;"><h3 style="color:#fff;font-size:15px;font-weight:700;margin:0 0 2px;">Marcus Lee</h3><p style="color:#C97B2B;font-size:12px;margin:0 0 6px;font-weight:600;">Barber Specialist · 10 years</p><p style="color:rgba(255,255,255,.45);font-size:13px;margin:0;">Fades, tapers, beard sculpting</p></div>
<a href="#" style="background:rgba(201,123,43,.15);color:#C97B2B;border:1px solid rgba(201,123,43,.3);padding:8px 18px;border-radius:6px;text-decoration:none;font-size:13px;font-weight:600;white-space:nowrap;">Book</a>
</div>
<div style="display:flex;align-items:center;gap:20px;padding:20px 0;">
<div style="width:56px;height:56px;border-radius:50%;background:linear-gradient(135deg,#1a5c38,#0a2d1a);display:flex;align-items:center;justify-content:center;font-size:22px;flex-shrink:0;">💅</div>
<div style="flex:1;"><h3 style="color:#fff;font-size:15px;font-weight:700;margin:0 0 2px;">Anh Nguyen</h3><p style="color:#C97B2B;font-size:12px;margin:0 0 6px;font-weight:600;">Nail Technician · 6 years</p><p style="color:rgba(255,255,255,.45);font-size:13px;margin:0;">Gel, acrylic, nail art design</p></div>
<a href="#" style="background:rgba(201,123,43,.15);color:#C97B2B;border:1px solid rgba(201,123,43,.3);padding:8px 18px;border-radius:6px;text-decoration:none;font-size:13px;font-weight:600;white-space:nowrap;">Book</a>
</div>
</div>
</div>
</section>`,
  },
];

// ─── Call to Action ───────────────────────────────────────────────────────────

const ctaBlocks: Block[] = [
  {
    id: 'cta-dark-band',
    name: 'Dark CTA Band',
    html: `<section style="background:linear-gradient(90deg,#0f0a1a 0%,#1a0333 50%,#0f0a1a 100%);padding:72px 24px;text-align:center;font-family:system-ui,sans-serif;">
<div style="max-width:640px;margin:0 auto;">
<h2 style="color:#fff;font-size:clamp(24px,3.5vw,40px);font-weight:700;margin:0 0 16px;font-family:Georgia,serif;">Ready to Transform Your Look?</h2>
<p style="color:rgba(255,255,255,.6);font-size:16px;line-height:1.7;margin:0 0 36px;">Book your appointment today and let our expert stylists work their magic.</p>
<div style="display:flex;gap:14px;justify-content:center;flex-wrap:wrap;">
<a href="#" style="display:inline-block;background:#C97B2B;color:#fff;font-weight:700;padding:16px 40px;border-radius:50px;text-decoration:none;font-size:15px;">Book Now</a>
<a href="#" style="display:inline-block;border:1px solid rgba(255,255,255,.25);color:rgba(255,255,255,.8);padding:16px 32px;border-radius:50px;text-decoration:none;font-size:15px;font-weight:600;">Call Us</a>
</div>
</div>
</section>`,
  },
  {
    id: 'cta-with-stats',
    name: 'CTA with Stats',
    html: `<section style="background:#C97B2B;padding:72px 24px;font-family:system-ui,sans-serif;">
<div style="max-width:960px;margin:0 auto;display:flex;align-items:center;gap:48px;flex-wrap:wrap;">
<div style="flex:1;min-width:280px;">
<h2 style="color:#fff;font-size:clamp(24px,3vw,38px);font-weight:800;margin:0 0 14px;line-height:1.15;font-family:Georgia,serif;">Join 500+ Happy Clients</h2>
<p style="color:rgba(255,255,255,.8);font-size:16px;line-height:1.7;margin:0 0 28px;">From everyday cuts to special occasions — we've got you covered.</p>
<a href="#" style="display:inline-block;background:#fff;color:#C97B2B;font-weight:800;padding:14px 36px;border-radius:8px;text-decoration:none;font-size:15px;">Book Appointment</a>
</div>
<div style="display:flex;gap:32px;flex-wrap:wrap;">
<div style="text-align:center;"><p style="color:#fff;font-size:40px;font-weight:900;margin:0 0 4px;">500+</p><p style="color:rgba(255,255,255,.7);font-size:13px;margin:0;font-weight:600;">Happy Clients</p></div>
<div style="text-align:center;"><p style="color:#fff;font-size:40px;font-weight:900;margin:0 0 4px;">4.9★</p><p style="color:rgba(255,255,255,.7);font-size:13px;margin:0;font-weight:600;">Google Rating</p></div>
<div style="text-align:center;"><p style="color:#fff;font-size:40px;font-weight:900;margin:0 0 4px;">8yr</p><p style="color:rgba(255,255,255,.7);font-size:13px;margin:0;font-weight:600;">In Business</p></div>
</div>
</div>
</section>`,
  },
  {
    id: 'cta-booking-strip',
    name: 'Booking Strip',
    html: `<section style="background:#faf8f5;border:1px solid #e8e2d9;padding:0 24px;font-family:system-ui,sans-serif;">
<div style="max-width:900px;margin:0 auto;display:flex;align-items:center;justify-content:space-between;gap:24px;padding:32px 0;flex-wrap:wrap;">
<div style="display:flex;align-items:center;gap:20px;">
<div style="width:50px;height:50px;border-radius:12px;background:#1a0333;display:flex;align-items:center;justify-content:center;font-size:24px;">📅</div>
<div><h3 style="color:#1a1205;font-size:18px;font-weight:700;margin:0 0 4px;">Book Your Next Appointment</h3><p style="color:#6b5c45;font-size:14px;margin:0;">Same-day &amp; weekend slots available</p></div>
</div>
<div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap;">
<p style="color:#6b5c45;font-size:14px;margin:0;">📞 (555) 123-4567</p>
<a href="#" style="display:inline-block;background:#C97B2B;color:#fff;font-weight:700;padding:12px 28px;border-radius:8px;text-decoration:none;font-size:14px;">Book Online</a>
</div>
</div>
</section>`,
  },
];

// ─── Contact ──────────────────────────────────────────────────────────────────

const contactBlocks: Block[] = [
  {
    id: 'contact-two-col',
    name: 'Contact Info + Form',
    html: `<section style="background:#faf8f5;padding:80px 24px;font-family:system-ui,sans-serif;">
<div style="max-width:960px;margin:0 auto;display:grid;grid-template-columns:1fr 1fr;gap:48px;align-items:start;">
<div>
<p style="color:#C97B2B;font-size:11px;font-weight:700;letter-spacing:.2em;text-transform:uppercase;margin:0 0 16px;">Get in Touch</p>
<h2 style="color:#1a1205;font-size:clamp(24px,3vw,36px);font-weight:700;margin:0 0 24px;font-family:Georgia,serif;">Visit Us Today</h2>
<div style="display:flex;flex-direction:column;gap:20px;">
<div style="display:flex;gap:14px;align-items:flex-start;">
<div style="width:36px;height:36px;border-radius:8px;background:#1a0333;display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0;">📍</div>
<div><p style="color:#1a1205;font-weight:600;font-size:14px;margin:0 0 2px;">Location</p><p style="color:#6b5c45;font-size:13px;line-height:1.5;margin:0;">123 Salon Street, Suite 200<br>Your City, ST 00000</p></div>
</div>
<div style="display:flex;gap:14px;align-items:flex-start;">
<div style="width:36px;height:36px;border-radius:8px;background:#1a0333;display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0;">🕐</div>
<div><p style="color:#1a1205;font-weight:600;font-size:14px;margin:0 0 2px;">Hours</p><p style="color:#6b5c45;font-size:13px;line-height:1.5;margin:0;">Mon–Fri: 9am – 8pm<br>Sat: 8am – 6pm · Sun: 10am – 5pm</p></div>
</div>
<div style="display:flex;gap:14px;align-items:flex-start;">
<div style="width:36px;height:36px;border-radius:8px;background:#1a0333;display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0;">📞</div>
<div><p style="color:#1a1205;font-weight:600;font-size:14px;margin:0 0 2px;">Phone</p><p style="color:#6b5c45;font-size:13px;margin:0;">(555) 123-4567</p></div>
</div>
</div>
</div>
<div style="background:#fff;border-radius:12px;padding:32px;border:1px solid #e8e2d9;">
<h3 style="color:#1a1205;font-size:18px;font-weight:700;margin:0 0 24px;">Send Us a Message</h3>
<div style="display:flex;flex-direction:column;gap:14px;">
<input type="text" placeholder="Your Name" style="width:100%;padding:12px 14px;border:1px solid #e8e2d9;border-radius:8px;font-size:14px;color:#1a1205;background:#faf8f5;box-sizing:border-box;outline:none;font-family:system-ui,sans-serif;" />
<input type="email" placeholder="Email Address" style="width:100%;padding:12px 14px;border:1px solid #e8e2d9;border-radius:8px;font-size:14px;color:#1a1205;background:#faf8f5;box-sizing:border-box;outline:none;font-family:system-ui,sans-serif;" />
<textarea placeholder="Your message…" rows="4" style="width:100%;padding:12px 14px;border:1px solid #e8e2d9;border-radius:8px;font-size:14px;color:#1a1205;background:#faf8f5;resize:vertical;box-sizing:border-box;outline:none;font-family:system-ui,sans-serif;"></textarea>
<button style="background:#C97B2B;color:#fff;border:none;padding:13px;border-radius:8px;font-weight:700;font-size:14px;cursor:pointer;font-family:system-ui,sans-serif;">Send Message</button>
</div>
</div>
</div>
</section>`,
  },
  {
    id: 'contact-centered',
    name: 'Centered Contact',
    html: `<section style="background:#0f0a1a;padding:80px 24px;text-align:center;font-family:system-ui,sans-serif;">
<div style="max-width:700px;margin:0 auto;">
<p style="color:#C97B2B;font-size:11px;font-weight:700;letter-spacing:.2em;text-transform:uppercase;margin:0 0 16px;">Find Us</p>
<h2 style="color:#fff;font-size:clamp(26px,3.5vw,40px);font-weight:700;margin:0 0 40px;font-family:Georgia,serif;">Come See Us</h2>
<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:20px;margin-bottom:40px;">
<div style="background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);border-radius:12px;padding:24px 16px;"><div style="font-size:28px;margin-bottom:12px;">📍</div><p style="color:#fff;font-size:13px;font-weight:600;margin:0 0 6px;">Address</p><p style="color:rgba(255,255,255,.5);font-size:12px;line-height:1.5;margin:0;">123 Salon Street<br>Your City, ST 00000</p></div>
<div style="background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);border-radius:12px;padding:24px 16px;"><div style="font-size:28px;margin-bottom:12px;">📞</div><p style="color:#fff;font-size:13px;font-weight:600;margin:0 0 6px;">Phone</p><p style="color:rgba(255,255,255,.5);font-size:12px;line-height:1.5;margin:0;">(555) 123-4567<br>Text or call</p></div>
<div style="background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);border-radius:12px;padding:24px 16px;"><div style="font-size:28px;margin-bottom:12px;">🕐</div><p style="color:#fff;font-size:13px;font-weight:600;margin:0 0 6px;">Hours</p><p style="color:rgba(255,255,255,.5);font-size:12px;line-height:1.5;margin:0;">Mon–Sat 9am–8pm<br>Sun 10am–5pm</p></div>
</div>
<a href="#" style="display:inline-block;background:#C97B2B;color:#fff;font-weight:700;padding:15px 38px;border-radius:50px;text-decoration:none;font-size:14px;">Get Directions</a>
</div>
</section>`,
  },
];

// ─── Footers ──────────────────────────────────────────────────────────────────

const footerBlocks: Block[] = [
  {
    id: 'footer-multi-col',
    name: 'Multi-Column Footer',
    html: `<footer style="background:#0f0a1a;padding:64px 24px 32px;font-family:system-ui,sans-serif;">
<div style="max-width:1040px;margin:0 auto;">
<div style="display:grid;grid-template-columns:2fr 1fr 1fr 1fr;gap:40px;margin-bottom:48px;">
<div>
<p style="color:#C97B2B;font-size:20px;font-weight:800;margin:0 0 14px;letter-spacing:.03em;">Lumière Salon</p>
<p style="color:rgba(255,255,255,.45);font-size:13px;line-height:1.7;margin:0 0 20px;">Premium beauty services in the heart of the city. Where every visit is an experience.</p>
<div style="display:flex;gap:10px;"><a href="#" style="width:34px;height:34px;border-radius:8px;background:rgba(255,255,255,.06);display:flex;align-items:center;justify-content:center;text-decoration:none;font-size:16px;">📸</a><a href="#" style="width:34px;height:34px;border-radius:8px;background:rgba(255,255,255,.06);display:flex;align-items:center;justify-content:center;text-decoration:none;font-size:16px;">👍</a></div>
</div>
<div><p style="color:#fff;font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;margin:0 0 16px;">Services</p><div style="display:flex;flex-direction:column;gap:10px;"><a href="#" style="color:rgba(255,255,255,.45);font-size:13px;text-decoration:none;">Hair Services</a><a href="#" style="color:rgba(255,255,255,.45);font-size:13px;text-decoration:none;">Nail Services</a><a href="#" style="color:rgba(255,255,255,.45);font-size:13px;text-decoration:none;">Spa Treatments</a><a href="#" style="color:rgba(255,255,255,.45);font-size:13px;text-decoration:none;">Pricing</a></div></div>
<div><p style="color:#fff;font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;margin:0 0 16px;">Salon</p><div style="display:flex;flex-direction:column;gap:10px;"><a href="#" style="color:rgba(255,255,255,.45);font-size:13px;text-decoration:none;">About Us</a><a href="#" style="color:rgba(255,255,255,.45);font-size:13px;text-decoration:none;">Our Team</a><a href="#" style="color:rgba(255,255,255,.45);font-size:13px;text-decoration:none;">Gallery</a><a href="#" style="color:rgba(255,255,255,.45);font-size:13px;text-decoration:none;">Reviews</a></div></div>
<div><p style="color:#fff;font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;margin:0 0 16px;">Contact</p><div style="display:flex;flex-direction:column;gap:10px;"><p style="color:rgba(255,255,255,.45);font-size:13px;margin:0;">123 Salon Street</p><p style="color:rgba(255,255,255,.45);font-size:13px;margin:0;">(555) 123-4567</p><a href="#" style="color:#C97B2B;font-size:13px;text-decoration:none;font-weight:600;">Book Online</a></div></div>
</div>
<div style="border-top:1px solid rgba(255,255,255,.08);padding-top:24px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;">
<p style="color:rgba(255,255,255,.25);font-size:12px;margin:0;">© 2025 Lumière Salon. All rights reserved.</p>
<p style="color:rgba(255,255,255,.25);font-size:12px;margin:0;"><a href="#" style="color:rgba(255,255,255,.3);text-decoration:none;">Privacy Policy</a> · <a href="#" style="color:rgba(255,255,255,.3);text-decoration:none;">Terms of Service</a></p>
</div>
</div>
</footer>`,
  },
  {
    id: 'footer-simple',
    name: 'Simple Footer',
    html: `<footer style="background:#1a1205;padding:40px 24px;font-family:system-ui,sans-serif;">
<div style="max-width:960px;margin:0 auto;display:flex;flex-direction:column;align-items:center;gap:20px;">
<p style="color:#C97B2B;font-size:22px;font-weight:800;margin:0;letter-spacing:.03em;">Lumière Salon</p>
<div style="display:flex;gap:28px;flex-wrap:wrap;justify-content:center;">
<a href="#" style="color:rgba(255,255,255,.5);font-size:13px;text-decoration:none;">Services</a>
<a href="#" style="color:rgba(255,255,255,.5);font-size:13px;text-decoration:none;">Gallery</a>
<a href="#" style="color:rgba(255,255,255,.5);font-size:13px;text-decoration:none;">Team</a>
<a href="#" style="color:rgba(255,255,255,.5);font-size:13px;text-decoration:none;">Pricing</a>
<a href="#" style="color:rgba(255,255,255,.5);font-size:13px;text-decoration:none;">Contact</a>
</div>
<p style="color:rgba(255,255,255,.25);font-size:12px;margin:0;">© 2025 Lumière Salon · (555) 123-4567 · 123 Salon Street</p>
</div>
</footer>`,
  },
];

// ─── Announcement Bars ────────────────────────────────────────────────────────

const announcementBlocks: Block[] = [
  {
    id: 'announce-promo',
    name: 'Promo Announcement',
    html: `<div style="background:#C97B2B;padding:12px 24px;text-align:center;font-family:system-ui,sans-serif;">
<p style="color:#fff;font-size:14px;font-weight:600;margin:0;letter-spacing:.02em;">🎉 Special Offer: Book any service this month and get 20% off your next visit! <a href="#" style="color:#fff;font-weight:800;text-decoration:underline;">Book Now →</a></p>
</div>`,
  },
  {
    id: 'announce-hours',
    name: 'Hours Announcement',
    html: `<div style="background:#1a0333;padding:10px 24px;text-align:center;font-family:system-ui,sans-serif;">
<p style="color:rgba(255,255,255,.8);font-size:13px;margin:0;letter-spacing:.03em;">Now Accepting Walk-Ins &amp; Online Bookings — Open 7 Days a Week <span style="color:#C97B2B;font-weight:700;margin-left:8px;">📞 (555) 123-4567</span></p>
</div>`,
  },
];

// ─── Full Library ─────────────────────────────────────────────────────────────

export const BLOCK_LIBRARY: BlockCategory[] = [
  { id: 'announcement', name: 'Announcements', icon: '📣', blocks: announcementBlocks },
  { id: 'hero', name: 'Hero Sections', icon: '🖼', blocks: heroBlocks },
  { id: 'services', name: 'Services', icon: '✂️', blocks: serviceBlocks },
  { id: 'pricing', name: 'Pricing', icon: '💰', blocks: pricingBlocks },
  { id: 'gallery', name: 'Gallery', icon: '📷', blocks: galleryBlocks },
  { id: 'testimonials', name: 'Testimonials', icon: '⭐', blocks: testimonialBlocks },
  { id: 'team', name: 'Team', icon: '👥', blocks: teamBlocks },
  { id: 'cta', name: 'Call to Action', icon: '🎯', blocks: ctaBlocks },
  { id: 'contact', name: 'Contact', icon: '📍', blocks: contactBlocks },
  { id: 'footers', name: 'Footers', icon: '📄', blocks: footerBlocks },
];
