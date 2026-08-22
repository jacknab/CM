import html, json, re, urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

SITEMAP = "https://glossgenius.com/sitemap.xml"
OUT = Path("core-pages")
BASE = "https://www.certxa.com"
SKIP = {"blog"}

def get_urls():
    req = urllib.request.Request(SITEMAP, headers={"User-Agent": "Mozilla/5.0"})
    xml = urllib.request.urlopen(req, timeout=30).read().decode("utf-8", "ignore")
    urls = re.findall(r"<loc>(.*?)</loc>", xml)
    out = []
    for url in urls:
        path = url.split("glossgenius.com", 1)[1].strip("/")
        if path.startswith("blog/") or path.startswith("legal/") or not path:
            continue
        if path in SKIP or any(x in path for x in ("calculator", "paid-social", "paid-search", "rebrand", "old", "components", "home-page", "lp-", "sola", "explore-gold")):
            continue
        out.append("/" + path)
    return out[:77]

def fetch(path):
    try:
        req = urllib.request.Request("https://glossgenius.com" + path, headers={"User-Agent": "Mozilla/5.0"})
        raw = urllib.request.urlopen(req, timeout=25).read().decode("utf-8", "ignore")
        title = re.search(r"<title[^>]*>(.*?)</title>", raw, re.I | re.S)
        desc = re.search(r'<meta[^>]+name=["\']description["\'][^>]+content=["\'](.*?)["\']', raw, re.I | re.S)
        h1 = re.search(r"<h1[^>]*>(.*?)</h1>", raw, re.I | re.S)
        h2s = re.findall(r"<h2[^>]*>(.*?)</h2>", raw, re.I | re.S)
        clean = lambda x: re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", html.unescape(x or ""))).strip()
        return {"path": path, "title": clean(title.group(1) if title else "") or "Business software", "description": clean(desc.group(1) if desc else ""), "h1": clean(h1.group(1) if h1 else "") or "More room for your best work", "h2s": [clean(x) for x in h2s[:4] if clean(x)]}
    except Exception:
        label = path.strip("/").replace("-", " ").replace("/", " · ").title()
        return {"path": path, "title": label + " | Certxa", "description": "Certxa software helps modern service businesses book clients, accept payments, and grow with less busywork.", "h1": label, "h2s": []}

def esc(s): return html.escape(s, quote=True)

def render(d):
    path = d["path"]
    slug = path.strip("/").replace("/", "-") or "home"
    title = re.sub(r"\s*[|—-]\s*GlossGenius\s*$", "", d["title"], flags=re.I).strip()
    title = title + " | Certxa" if "certxa" not in title.lower() else title
    description = d["description"] or "Certxa brings booking, payments, client relationships, and operations together for modern service businesses."
    h1 = re.sub(r"\bGlossGenius\b", "Certxa", d["h1"], flags=re.I)
    h2s = [re.sub(r"\bGlossGenius\b", "Certxa", x, flags=re.I) for x in d["h2s"]]
    cards = "".join(f'<article><span>0{i+1:02d}</span><h3>{esc(x)}</h3><p>Simple, connected tools help your business move forward with less busywork.</p><a href="../features.html">Explore Certxa →</a></article>' for i, x in enumerate(h2s[:3]))
    if not cards:
        cards = '<article><span>01</span><h3>Bring the day together</h3><p>Scheduling, payments, clients, and operations in one calm system.</p><a href="../features.html">Explore Certxa →</a></article>'
    canonical = BASE + (path if path != "/" else "/")
    return f'''<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{esc(title)}</title><meta name="description" content="{esc(description)}"><meta name="robots" content="index,follow"><link rel="canonical" href="{esc(canonical)}">
<meta property="og:type" content="website"><meta property="og:site_name" content="Certxa"><meta property="og:title" content="{esc(title)}"><meta property="og:description" content="{esc(description)}"><meta property="og:url" content="{esc(canonical)}"><meta name="twitter:card" content="summary"><meta name="twitter:title" content="{esc(title)}"><meta name="twitter:description" content="{esc(description)}">
<script type="application/ld+json">{{"@context":"https://schema.org","@type":"WebPage","name":{json.dumps(title)},"description":{json.dumps(description)},"url":{json.dumps(canonical)}}}</script>
<link rel="stylesheet" href="../styles.css"><link rel="stylesheet" href="../core-pages.css"></head>
<body><div class="announcement">Meet the smarter way to run your business <a href="../features.html">Explore Certxa →</a></div>
<header class="nav wrap"><a class="brand" href="../index.html">certxa<span>®</span></a><nav><a href="../features.html">Platform</a><a href="../pricing.html">Pricing</a><a href="../index.html#stories">Customer stories</a></nav><div class="nav-actions"><a class="login" href="../signup.html">Log in</a><a class="button small" href="../signup.html">Get started</a></div></header>
<main><section class="core-hero wrap"><div><p class="eyebrow">The Certxa platform</p><h1>{esc(h1)}</h1><p class="lede">A smarter way to run your business, connect with your clients, and make more room for the work you love.</p><a class="button" href="../signup.html">Get started for free <span>↗</span></a><p class="fine">No credit card required · 14-day free trial</p></div><div class="core-art"><div class="core-panel"><small>CERTXA OVERVIEW</small><strong>More momentum.</strong><span>Less busywork.</span><div class="core-lines"><i></i><i></i><i></i><i></i></div></div></div></section>
<section class="core-content wrap"><p class="eyebrow">Built around your day</p><h2>Tools that work<br><em>in your favor.</em></h2><div class="core-grid">{cards}</div></section>
<section class="core-band"><div class="wrap"><p class="eyebrow light">Everything connected</p><h2>More time for<br><em>what’s next.</em></h2><p>Certxa brings the important details into one clear view, so your business keeps moving while you focus on your clients.</p><a class="button light-button" href="../signup.html">Start for free <span>↗</span></a></div></section>
<section class="core-faq wrap"><p class="eyebrow">Questions, answered</p><h2>Good to know.</h2><details open><summary>What is Certxa?</summary><p>Certxa is an all-in-one platform for scheduling, payments, client relationships, and operations.</p></details><details><summary>Is Certxa right for my business?</summary><p>Certxa is designed for independent professionals, growing teams, and modern service businesses.</p></details></section></main>
<footer class="footer"><div class="wrap footer-top"><a class="brand light-brand" href="../index.html">certxa<span>®</span></a><div><h4>Product</h4><a href="../features.html">Platform</a><a href="../online-booking.html">Online booking</a><a href="../pricing.html">Pricing</a></div><div><h4>Company</h4><a href="../index.html#stories">Stories</a><a href="#">About</a><a href="#">Contact</a></div><div><h4>Follow along</h4><a href="#">Instagram</a><a href="#">LinkedIn</a><a href="#">TikTok</a></div></div><div class="wrap footer-bottom"><span>© 2026 Certxa, Inc.</span><span>Privacy · Terms</span></div></footer></body></html>'''

def main():
    OUT.mkdir(exist_ok=True)
    with ThreadPoolExecutor(max_workers=10) as pool:
        pages = list(pool.map(fetch, get_urls()))
    for d in pages:
        (OUT / (d["path"].strip("/").replace("/", "-") or "home") .__class__(str) if False else OUT / (d["path"].strip("/").replace("/", "-") or "home")).with_suffix(".html").write_text(render(d), encoding="utf-8")
    (OUT / "manifest.json").write_text(json.dumps(pages, indent=2), encoding="utf-8")
    sitemap = ['<?xml version="1.0" encoding="UTF-8"?>', '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
    for d in pages:
        sitemap.append(f'  <url><loc>{BASE}{d["path"]}</loc><changefreq>monthly</changefreq><priority>0.7</priority></url>')
    sitemap.append("</urlset>")
    (OUT / "sitemap.xml").write_text("\n".join(sitemap), encoding="utf-8")
    print("generated", len(pages), "pages")

if __name__ == "__main__":
    main()