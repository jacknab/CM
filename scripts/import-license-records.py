#!/usr/bin/env python3
"""
Imports nail salons into directory_listings from state license records
(plans/salon-directory.md). The public directory is built from these records,
not from Google Places.

Sources (all public, refreshed by the states):
  tx_tdlr  Texas TDLR "Barbering & Cosmetology Establishments", daily CSV
  ca_bbc   California DCA licensee data, Board of Barbering and Cosmetology, monthly
  fl_dbpr  Florida DBPR cosmetology licenses (CE = cosmetology establishment)

A licensed establishment counts as a nail salon when
  - its name says so (nails, manicure, pedicure, ...)            nail_reason = 'name'
  - it holds a Texas manicurist-establishment license            nail_reason = 'license_type'
  - it matches a salon already in nail_salons (Google's nail-salon
    category) by phone or address, and the names agree           nail_reason = 'directory_match'
Only current, active licenses are imported. Matched rows keep the existing
directory URL (slug) and place_id; nothing else is taken from nail_salons.

Re-running is safe: rows are upserted on (license_source, license_number);
slug, claim, owner fields and opt-outs are never overwritten. Addresses
without coordinates are geocoded with the US Census Geocoder (free, public
domain, 10,000 addresses per batch).

Run:
  set -a; . /etc/certxa.env; set +a
  python3 scripts/import-license-records.py --work /path/to/download/dir [--states tx,ca,fl] [--no-download] [--no-geocode] [--dry]
"""
import argparse
import csv
import hashlib
import io
import json
import os
import re
import subprocess
import sys
import time
import urllib.request

SOURCES = {
    "tx": [("tx_shops.csv", "https://www.tdlr.texas.gov/dbproduction2/ltcosshp.csv")],
    "fl": [("fl_lic.csv", "https://www2.myfloridalicense.com/sto/file_download/extracts/COSMETOLOGYLICENSE_1.csv")],
    # DCA publishes each board's data in a public Box folder linked from
    # https://www.dca.ca.gov/consumers/public_info/index.shtml
    "ca": [
        ("ca00.xls", "https://app.box.com/index.php?rm=box_download_shared_file&shared_name=oss6hf8jys2bmgxqd2gdz7w4oepm2il9&file_id=f_2500009736881"),
        ("ca01.xls", "https://app.box.com/index.php?rm=box_download_shared_file&shared_name=oss6hf8jys2bmgxqd2gdz7w4oepm2il9&file_id=f_2500007767178"),
    ],
}

NAIL = re.compile(r"\bnails?\b|manicur|pedicur|\bnail\w*|\bpolish\b|\blacquer", re.I)
STOP = {"nail", "nails", "salon", "spa", "and", "the", "llc", "inc", "corp", "co", "studio", "bar", "lounge", "beauty", "&"}

csv.field_size_limit(10_000_000)


def phone10(s):
    d = re.sub(r"\D", "", s or "")
    return d[-10:] if len(d) >= 10 else ""


def addr_key(street, zip_):
    m = re.match(r"\s*(\d+[A-Z]?)\s+(?:[NSEW]\.?\s+|NORTH\s+|SOUTH\s+|EAST\s+|WEST\s+)?(\w+)", (street or "").upper())
    return f"{m.group(1)}|{m.group(2)}|{zip_[:5]}" if m and zip_ else None


def name_tokens(name):
    return {t for t in re.findall(r"[a-z0-9]+", (name or "").lower()) if t not in STOP and len(t) > 1}


def names_agree(a, b):
    ta, tb = name_tokens(a), name_tokens(b)
    if not ta or not tb:
        return bool(NAIL.search(a or "")) and bool(NAIL.search(b or ""))
    return len(ta & tb) / min(len(ta), len(tb)) >= 0.5


def title_case(s):
    """License files are mostly upper case; show names the way a salon writes them."""
    s = re.sub(r"\s+", " ", (s or "").strip())
    if s.isupper() or s.islower():
        # Short vowel-less words are initials ("JJ Nails", "N&S"); the rest are words.
        street_words = {"RD", "ST", "DR", "LN", "CT", "PL", "SQ", "HWY", "PKWY", "BLVD", "STE", "FWY", "TRL", "MR", "MRS", "MS"}
        word = lambda w: (w.upper() if re.fullmatch(r"(?i)[b-df-hj-np-tv-xz]{1,3}\.?", w) and w.upper().rstrip(".") not in street_words
                          else w.capitalize())
        s = " ".join("&".join(word(p) for p in w.split("&")) for w in s.split(" "))
        s = re.sub(r"(?<=[A-Za-z])'S\b", "'s", s)
    s = re.sub(r",?\s+\b(LLC|Llc|INC|Inc|CORP|Corp|Co)\b\.?$", "", s)
    return s.strip(" ,.")


def slugify(s):
    return re.sub(r"-+", "-", re.sub(r"[^a-z0-9]+", "-", (s or "").lower())).strip("-")


def short_id(source, number):
    h = hashlib.sha1(f"{source}:{number}".encode()).digest()
    alphabet = "0123456789abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ"
    n = int.from_bytes(h[:8], "big")
    out = ""
    for _ in range(6):
        n, r = divmod(n, len(alphabet))
        out += alphabet[r]
    return out


def date_iso(s):
    s = (s or "").strip()
    for pat in (r"(\d{2})/(\d{2})/(\d{4})", r"(\d{2})-(\d{2})-(\d{4})"):
        m = re.fullmatch(pat, s)
        if m:
            return f"{m.group(3)}-{m.group(1)}-{m.group(2)}"
    return ""


# ── Parsers: each yields dicts with the same keys ─────────────────────────────

def parse_tx(path):
    for x in csv.DictReader(open(path, encoding="latin-1")):
        m = re.match(r"(.*?)\s+([A-Z]{2})\s+(\d{5})", (x["BUSINESS CITY, STATE ZIP"] or "").strip())
        if not m or m.group(2) != "TX":
            continue
        yield dict(source="tx_tdlr", number=str(x["LICENSE NUMBER"]).strip(), type=x["LICENSE TYPE"].strip(),
                   subtype=x["LICENSE SUBTYPE"].strip(), name=x["BUSINESS NAME"], street=x["BUSINESS ADDRESS-LINE1"],
                   city=m.group(1), state="TX", zip=(x["BUSINESS ZIP"] or "")[:5], phone=phone10(x["BUSINESS PHONE"]),
                   status="Active", expires=date_iso(x["LICENSE EXPIRATION DATE"]))


def parse_fl(path):
    # Layout: board, class, name, dba, ?, addr1, addr2, addr3, city, state, zip, county,
    # number, primary status, secondary status, original, effective, expires, ..., full number
    for x in csv.reader(open(path, encoding="latin-1")):
        if len(x) < 21 or x[1] != "CE" or x[9] != "FL":
            continue
        if (x[13], x[14]) != ("C", "A"):  # current, active
            continue
        yield dict(source="fl_dbpr", number=x[20].strip(), type="Cosmetology Establishment", subtype="CE",
                   name=x[3] or x[2], street=x[5], city=x[8], state="FL", zip=x[10][:5], phone="",
                   status="Active", expires=date_iso(x[17]))


def parse_ca(paths):
    for path in paths:
        for x in csv.DictReader(open(path, encoding="latin-1"), delimiter="\t"):
            if x["License Type"] != "Establishment" or x["License Status"] != "Current" or x["State"] != "CA":
                continue
            yield dict(source="ca_bbc", number=x["License Number"].strip(), type="Establishment", subtype="",
                       name=x["Org/Last Name"], street=x["Address Line 1"], city=x["City"], state="CA",
                       zip=(x["Zip"] or "")[:5], phone="", status="Current", expires=date_iso(x["Expiration Date"]))


# ── Database helpers (psql, so the script needs nothing beyond Python) ────────

def psql(sql, stdin=None):
    r = subprocess.run(["psql", os.environ["DATABASE_URL"], "-v", "ON_ERROR_STOP=1", "-q", "-At", "-c", sql],
                       input=stdin, capture_output=True, text=True)
    if r.returncode:
        sys.exit(f"psql failed: {r.stderr.strip()}")
    return r.stdout


def copy_out(sql):
    out = subprocess.run(["psql", os.environ["DATABASE_URL"], "-v", "ON_ERROR_STOP=1", "-c",
                          f"\\copy ({sql}) to stdout with csv header"], capture_output=True, text=True, check=True)
    return list(csv.DictReader(io.StringIO(out.stdout)))


def run_script(sql):
    r = subprocess.run(["psql", os.environ["DATABASE_URL"], "-v", "ON_ERROR_STOP=1", "-q", "-1", "-f", "-"],
                       input=sql, capture_output=True, text=True)
    if r.returncode:
        sys.exit(f"psql failed: {r.stderr.strip()}")
    return r.stdout


# ── Geocoding ─────────────────────────────────────────────────────────────────

def census_geocode(rows):
    """rows: list of (id, street, city, state, zip). Returns {id: (lat, lng)}."""
    found = {}
    for start in range(0, len(rows), 9000):
        chunk = rows[start:start + 9000]
        buf = io.StringIO()
        csv.writer(buf).writerows(chunk)
        boundary = "----certxa" + hashlib.md5(str(time.time()).encode()).hexdigest()
        body = (
            f"--{boundary}\r\nContent-Disposition: form-data; name=\"benchmark\"\r\n\r\nPublic_AR_Current\r\n"
            f"--{boundary}\r\nContent-Disposition: form-data; name=\"addressFile\"; filename=\"a.csv\"\r\n"
            f"Content-Type: text/csv\r\n\r\n{buf.getvalue()}\r\n--{boundary}--\r\n"
        ).encode()
        req = urllib.request.Request("https://geocoding.geo.census.gov/geocoder/locations/addressbatch", data=body,
                                     headers={"Content-Type": f"multipart/form-data; boundary={boundary}"})
        for attempt in range(3):
            try:
                text = urllib.request.urlopen(req, timeout=900).read().decode("utf-8", "replace")
                break
            except Exception as e:  # the service is slow and occasionally drops a batch
                print(f"  geocode batch failed ({e}), retrying", flush=True)
                time.sleep(10)
        else:
            continue
        for rec in csv.reader(io.StringIO(text)):
            if len(rec) >= 6 and rec[2] == "Match" and rec[5]:
                lng, lat = rec[5].split(",")
                found[int(rec[0])] = (float(lat), float(lng))
        print(f"  geocoded {start + len(chunk)}/{len(rows)} ({len(found)} matched)", flush=True)
    return found


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--work", required=True, help="directory for the downloaded files")
    ap.add_argument("--states", default="tx,ca,fl")
    ap.add_argument("--no-download", action="store_true")
    ap.add_argument("--no-geocode", action="store_true")
    ap.add_argument("--dry", action="store_true")
    a = ap.parse_args()
    states = [s.strip() for s in a.states.split(",") if s.strip()]
    os.makedirs(a.work, exist_ok=True)

    if not a.no_download:
        for st in states:
            for fname, url in SOURCES[st]:
                print(f"downloading {fname}", flush=True)
                req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (Certxa directory import)"})
                with urllib.request.urlopen(req, timeout=900) as r, open(os.path.join(a.work, fname), "wb") as f:
                    f.write(r.read())

    licenses = []
    if "tx" in states:
        licenses += parse_tx(os.path.join(a.work, "tx_shops.csv"))
    if "fl" in states:
        licenses += parse_fl(os.path.join(a.work, "fl_lic.csv"))
    if "ca" in states:
        licenses += parse_ca([os.path.join(a.work, f) for f, _ in SOURCES["ca"]])
    print(f"{len(licenses)} active establishment licenses", flush=True)

    # Existing directory rows (Google's nail-salon category) to match against.
    ns = copy_out("SELECT id, slug, name, phone, address, place_id FROM nail_salons WHERE slug IS NOT NULL")
    by_phone, by_addr = {}, {}
    for x in ns:
        m = re.search(r",\s*([A-Z]{2})\s+(\d{5})", x["address"] or "")
        if not m:
            continue
        if phone10(x["phone"]):
            by_phone.setdefault(phone10(x["phone"]), []).append(x)
        k = addr_key((x["address"] or "").split(",")[0], m.group(2))
        if k:
            by_addr.setdefault(k, []).append(x)

    used_ns, out = set(), []
    for lic in licenses:
        match = None
        for cand in by_phone.get(lic["phone"], []) + by_addr.get(addr_key(lic["street"], lic["zip"]), []):
            if cand["id"] not in used_ns and names_agree(lic["name"], cand["name"]):
                match = cand
                break
        if NAIL.search(lic["name"] or ""):
            reason = "name"
        elif lic["source"] == "tx_tdlr" and lic["subtype"] == "MS":
            reason = "license_type"
        elif match:
            reason = "directory_match"
        else:
            continue
        name = title_case(lic["name"])
        city = title_case(lic["city"])
        if match:
            used_ns.add(match["id"])
            slug = match["slug"]
        else:
            slug = f"{slugify(name)[:90]}-{slugify(city)[:40]}-{short_id(lic['source'], lic['number'])}"
        out.append(dict(
            slug=slug, name=name, street=title_case(lic["street"]), city=city, state=lic["state"],
            postal_code=lic["zip"], phone=("+1" + lic["phone"]) if lic["phone"] else "",
            license_source=lic["source"], license_number=lic["number"], license_type=lic["type"],
            license_status=lic["status"], license_expires=lic["expires"], nail_reason=reason,
            nail_salon_id=match["id"] if match else "", place_id=(match or {}).get("place_id") or "",
        ))
    counts = {}
    for r in out:
        counts[(r["state"], r["nail_reason"])] = counts.get((r["state"], r["nail_reason"]), 0) + 1
    print("nail salons:", json.dumps({f"{k[0]} {k[1]}": v for k, v in sorted(counts.items())}), flush=True)
    if a.dry:
        return

    cols = list(out[0].keys())
    buf = io.StringIO()
    w = csv.DictWriter(buf, fieldnames=cols)
    w.writeheader()
    w.writerows(out)
    staged = os.path.join(a.work, "directory_listings.csv")
    open(staged, "w").write(buf.getvalue())

    set_cols = [c for c in cols if c not in ("slug", "license_source", "license_number")]
    run_script(f"""
CREATE TEMP TABLE stage ({", ".join(f"{c} TEXT" for c in cols)});
\\copy stage FROM '{staged}' WITH CSV HEADER
INSERT INTO directory_listings ({", ".join(cols)}, license_checked_at, last_seen_at)
SELECT slug, name, NULLIF(street,''), NULLIF(city,''), state, NULLIF(postal_code,''), NULLIF(phone,''),
       license_source, license_number, NULLIF(license_type,''), NULLIF(license_status,''),
       NULLIF(license_expires,'')::date, nail_reason, NULLIF(nail_salon_id,'')::int, NULLIF(place_id,''),
       now(), now()
FROM stage s
WHERE NOT EXISTS (SELECT 1 FROM directory_listings d WHERE d.slug = s.slug
                  AND (d.license_source, d.license_number) <> (s.license_source, s.license_number))
ON CONFLICT (license_source, license_number) DO UPDATE SET
  {", ".join(f"{c} = EXCLUDED.{c}" for c in set_cols)},
  license_checked_at = now(), last_seen_at = now();
-- Salons that run on Certxa: same phone as a live store with a booking page.
UPDATE directory_listings d SET store_id = l.id
FROM locations l
WHERE l.booking_slug IS NOT NULL AND l.phone IS NOT NULL AND d.store_id IS NULL
  AND RIGHT(regexp_replace(l.phone, '[^0-9]', '', 'g'), 10) = RIGHT(regexp_replace(COALESCE(d.phone,
        (SELECT phone FROM nail_salons WHERE id = d.nail_salon_id), ''), '[^0-9]', '', 'g'), 10);
""")
    # Salons that run on Certxa but aren't in an imported state yet are listed
    # from their own store record (license_source 'certxa'): a nail salon with
    # a live booking page that the earlier directory also knew as a real
    # business (same phone), which leaves out demo and test stores.
    run_script("""
INSERT INTO directory_listings (slug, name, street, city, state, postal_code, phone, latitude, longitude,
  geocode_source, license_source, license_number, license_type, nail_reason, nail_salon_id, place_id, store_id)
SELECT n.slug, l.name, l.address, l.city, upper(l.state), l.postcode,
       '+1' || RIGHT(regexp_replace(l.phone, '[^0-9]', '', 'g'), 10),
       NULLIF(l.store_latitude, '')::double precision, NULLIF(l.store_longitude, '')::double precision,
       CASE WHEN NULLIF(l.store_latitude, '') IS NOT NULL THEN 'store' END,
       'certxa', 'store-' || l.id, 'Certxa store', 'certxa_store', n.id, n.place_id, l.id
FROM locations l
JOIN nail_salons n ON RIGHT(regexp_replace(n.phone, '[^0-9]', '', 'g'), 10) = RIGHT(regexp_replace(l.phone, '[^0-9]', '', 'g'), 10)
WHERE l.booking_slug IS NOT NULL AND l.category ILIKE '%nail%' AND l.suspended_at IS NULL
  AND l.account_status = 'Active' AND length(upper(l.state)) = 2
  AND NOT EXISTS (SELECT 1 FROM directory_listings d WHERE d.store_id = l.id)
  AND NOT EXISTS (SELECT 1 FROM directory_listings d WHERE d.slug = n.slug)
ON CONFLICT (license_source, license_number) DO UPDATE SET last_seen_at = now();
UPDATE directory_listings SET last_seen_at = now() WHERE license_source = 'certxa';
""")
    print(psql("SELECT state, count(*), count(store_id) FROM directory_listings GROUP BY 1 ORDER BY 1"), flush=True)

    if not a.no_geocode:
        todo = copy_out("SELECT id, street, city, state, postal_code FROM directory_listings "
                        "WHERE latitude IS NULL AND street IS NOT NULL ORDER BY id")
        print(f"geocoding {len(todo)} addresses", flush=True)
        found = census_geocode([(r["id"], r["street"], r["city"], r["state"], r["postal_code"]) for r in todo])
        if found:
            vals = "\n".join(f"{i},{lat},{lng}" for i, (lat, lng) in found.items())
            geo = os.path.join(a.work, "geocoded.csv")
            open(geo, "w").write(vals + "\n")
            run_script(f"""
CREATE TEMP TABLE g (id int, lat double precision, lng double precision);
\\copy g FROM '{geo}' WITH CSV
UPDATE directory_listings d SET latitude = g.lat, longitude = g.lng, geocode_source = 'census' FROM g WHERE d.id = g.id;
""")
        print(psql("SELECT count(*), count(latitude) FROM directory_listings"), flush=True)


if __name__ == "__main__":
    main()
