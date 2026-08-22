#!/usr/bin/env python3
"""Small live SEO contract test for Certxa's crawl-discovery surfaces.

Usage:
  python3 scripts/seo-contract-test.py
  BASE_URL=https://staging.example.com python3 scripts/seo-contract-test.py

Set CHECK_ALL_SITEMAP_URLS=1 to request every URL listed by the sitemaps. The
default checks the sitemap endpoints and all commercial URLs, avoiding a
51,000-request directory crawl during ordinary CI runs.
"""

from __future__ import annotations

import os
import re
import sys
import urllib.error
import urllib.request
import xml.etree.ElementTree as ET
from html.parser import HTMLParser
from urllib.parse import urljoin, urlparse

BASE = os.environ.get("BASE_URL", "https://certxa.com").rstrip("/")
CHECK_ALL = os.environ.get("CHECK_ALL_SITEMAP_URLS") == "1"
SITEMAPS = [
    "/sitemap.xml",
    "/sitemap-pages.xml",
    "/blog/sitemap.xml",
    "/salon/sitemap.xml",
]
COMMERCIAL = [
    "/nail-salon-software", "/online-booking", "/salonos",
    "/payment-processing", "/client-management", "/client-notifications",
    "/custom-website-builder", "/solo-professionals", "/booth-renters",
    "/client-reviews", "/pricing", "/contact",
]
REACT_FALLBACKS = {
    "/industries": "Booking Software for Every Service Industry | Certxa",
    "/barbers": "Barber Shop Booking Software — Online Appointments & POS | Certxa",
}


class PageParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.title = ""
        self.h1 = 0
        self.description = 0
        self.canonicals = []
        self.robots = ""
        self.canonical = ""
        self.json_ld = []
        self._title = False
        self._json = False
        self._buf = []

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == "title": self._title = True
        if tag == "h1": self.h1 += 1
        if tag == "meta" and attrs.get("name", "").lower() == "description": self.description += 1
        if tag == "meta" and attrs.get("name", "").lower() == "robots": self.robots = attrs.get("content", "")
        if tag == "link" and attrs.get("rel", "").lower() == "canonical": self.canonicals.append(attrs.get("href", ""))
        if tag == "script" and attrs.get("type") == "application/ld+json": self._json, self._buf = True, []

    def handle_endtag(self, tag):
        if tag == "title": self._title = False
        if tag == "script" and self._json:
            self.json_ld.append("".join(self._buf)); self._json = False

    def handle_data(self, data):
        if self._title: self.title += data
        if self._json: self._buf.append(data)


def fetch(path: str):
    url = urljoin(BASE + "/", path.lstrip("/"))
    request = urllib.request.Request(url, headers={"User-Agent": "Certxa-SEO-Contract/1.0"})
    class NoRedirect(urllib.request.HTTPRedirectHandler):
        def redirect_request(self, req, fp, code, msg, headers, newurl):
            return None
    opener = urllib.request.build_opener(NoRedirect())
    try:
        response = opener.open(request, timeout=30)
    except urllib.error.HTTPError as exc:
        response = exc
    return url, response, response.read()


def fail(message: str):
    print(f"FAIL: {message}", file=sys.stderr)
    raise SystemExit(1)


def check_response(path: str, expected_type: str | None = None):
    url, response, body = fetch(path)
    if response.status != 200: fail(f"{path} returned HTTP {response.status}")
    if 300 <= response.status < 400: fail(f"{path} returned a redirect ({response.status})")
    content_type = response.headers.get("Content-Type", "").lower()
    if expected_type and expected_type not in content_type: fail(f"{path} Content-Type is {content_type!r}")
    return url, response, body


def main():
    sitemap_urls = []
    discovered_sitemaps = []
    for path in SITEMAPS:
        url, response, body = check_response(path, "xml")
        if not body.startswith(b"<?xml"):
            fail(f"{path} XML declaration is not at byte 0")
        try: root = ET.fromstring(body)
        except ET.ParseError as exc: fail(f"{path} is not valid XML: {exc}")
        tag = root.tag.rsplit("}", 1)[-1]
        nodes = root.findall(".//{*}loc")
        for node in nodes:
            value = (node.text or "").strip()
            parsed = urlparse(value)
            if parsed.scheme != "https" or parsed.netloc != urlparse(BASE).netloc:
                fail(f"non-canonical sitemap URL in {path}: {value}")
            # Sitemap indexes contain child sitemap URLs. Only urlset entries
            # are page URLs and should participate in duplicate/indexability
            # checks.
            if tag == "urlset":
                sitemap_urls.append(value)
            elif tag == "sitemapindex":
                discovered_sitemaps.append(value)
        print(f"PASS: {path} ({tag}, {len(nodes)} URLs)")

    # Validate all salon shards declared by the live sitemap index instead of
    # hard-coding shard numbers. This automatically tracks future data growth
    # and changes to the configured shard size.
    salon_shards = [
        value for value in discovered_sitemaps
        if urlparse(value).path.startswith("/salon/sitemap-")
    ]
    if not salon_shards:
        fail("/salon/sitemap.xml declares no salon sitemap shards")
    for value in salon_shards:
        path = urlparse(value).path
        _, _, body = check_response(path, "xml")
        if not body.startswith(b"<?xml"):
            fail(f"{path} XML declaration is not at byte 0")
        try: root = ET.fromstring(body)
        except ET.ParseError as exc: fail(f"{path} is not valid XML: {exc}")
        if root.tag.rsplit("}", 1)[-1] != "urlset":
            fail(f"{path} is not a urlset")
        nodes = root.findall(".//{*}loc")
        if len(nodes) > 5_000:
            fail(f"{path} contains {len(nodes)} URLs; expected at most 5,000")
        for node in nodes:
            page_url = (node.text or "").strip()
            parsed = urlparse(page_url)
            if parsed.scheme != "https" or parsed.netloc != urlparse(BASE).netloc:
                fail(f"non-canonical sitemap URL in {path}: {page_url}")
            sitemap_urls.append(page_url)
        print(f"PASS: {path} (urlset, {len(nodes)} URLs)")

    if len(sitemap_urls) != len(set(sitemap_urls)):
        fail("duplicate URL found across sitemap files")

    for path in COMMERCIAL:
        url, response, body = check_response(path, "text/html")
        parser = PageParser(); parser.feed(body.decode("utf-8", "replace"))
        expected = url.rstrip("/")
        if parser.h1 != 1: fail(f"{path} has {parser.h1} H1 elements")
        if not parser.title.strip(): fail(f"{path} has no title")
        if parser.description != 1: fail(f"{path} has {parser.description} meta descriptions")
        if len(parser.canonicals) != 1: fail(f"{path} has {len(parser.canonicals)} canonical links")
        if parser.canonicals[0].rstrip("/") != expected: fail(f"{path} canonical is {parser.canonicals[0]!r}")
        if "noindex" in parser.robots.lower(): fail(f"{path} has noindex robots directive")
        if "noindex" in response.headers.get("X-Robots-Tag", "").lower(): fail(f"{path} has X-Robots-Tag: noindex")
        if not parser.json_ld: fail(f"{path} has no JSON-LD")
        print(f"PASS: {path} (200, title, H1, canonical, indexable, JSON-LD)")

    # React-only routes validate the second half of the hybrid architecture.
    # Their initial HTML must carry route-specific metadata even if the React
    # SSR bundle is unavailable, rather than returning the generic SPA head.
    for path, expected_title in REACT_FALLBACKS.items():
        url, response, body = check_response(path, "text/html")
        parser = PageParser(); parser.feed(body.decode("utf-8", "replace"))
        if parser.title.strip() != expected_title:
            fail(f"{path} fallback title is {parser.title.strip()!r}")
        if parser.description != 1:
            fail(f"{path} fallback has {parser.description} meta descriptions")
        if len(parser.canonicals) != 1:
            fail(f"{path} fallback has {len(parser.canonicals)} canonical links")
        if parser.canonicals[0].rstrip("/") != url.rstrip("/"):
            fail(f"{path} fallback canonical is {parser.canonicals[0]!r}")
        print(f"PASS: {path} React fallback (route-specific title, description, canonical)")

    robots_url, robots_response, robots = check_response("/robots.txt", "text/plain")
    robots_text = robots.decode("utf-8", "replace")
    if "Sitemap: " + BASE + "/sitemap.xml" not in robots_text:
        fail("robots.txt does not declare the canonical root sitemap")
    if "Disallow: /*?*" in robots_text:
        fail("robots.txt broadly blocks query strings")
    print("PASS: /robots.txt (canonical sitemap, query strings permitted)")

    targets = sitemap_urls if CHECK_ALL else [urljoin(BASE + "/", p.lstrip("/")) for p in COMMERCIAL]
    missing = [url for url in targets if url not in sitemap_urls]
    if missing: fail("commercial URLs missing from sitemap: " + ", ".join(missing))
    print(f"PASS: {len(COMMERCIAL)} commercial URLs present in sitemap set")
    if CHECK_ALL:
        for value in targets:
            _, response, _ = fetch(value)
            if response.status != 200: fail(f"sitemap URL is not HTTP 200: {value}")
        print(f"PASS: all {len(targets)} sitemap URLs returned HTTP 200")


if __name__ == "__main__": main()
