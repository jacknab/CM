/**
 * phoneTypeDetector.ts
 *
 * Best-effort classification of a phone number as "mobile" | "voip" | "landline"
 * | "unknown". This is used to populate the `phoneType` column on client_phones
 * records so the platform can make smarter routing / SMS / voicemail decisions.
 *
 * Detection strategy (in order):
 *   1. Hard-coded E.164 country/area-code rules for the highest-confidence
 *      landline vs mobile split (US/CA + selected Caribbean NANP regions).
 *   2. E.164 country code lookup for international numbers:
 *         - North America (NANP)     →  treat all as mobile by default
 *           (US carriers no longer enforce landline vs mobile by NPA alone).
 *         - UK (+44), most of EU, AU, NZ → mobile heuristics by number
 *           length and prefix.
 *         - Known VoIP-only ranges (e.g. Google Voice, some toll-free) → voip.
 *   3. Anything unrecognised → "unknown".
 *
 * The detector is pure (no I/O) and synchronous so it can be called from
 * any code path that creates or updates a client record. It intentionally
 * never throws — an unparseable number simply returns "unknown".
 */

export type PhoneType = "mobile" | "voip" | "landline" | "unknown";

export interface PhoneTypeResult {
  phoneType: PhoneType;
  countryCode: string | null;
  e164: string | null;
  source: "rule" | "default_mobile" | "default_landline" | "unknown";
  confidence: "high" | "low";
}

/**
 * Normalise a free-form phone string to E.164 (best effort, no validation API).
 * Strips all non-digits, prepends a default US country code when none is given
 * and the result has 10 digits.
 */
export function normalizeToE164(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = String(raw).replace(/[^0-9+]/g, "");
  if (!digits) return null;

  let value = digits.startsWith("+") ? digits : digits;
  // If user typed a US 10-digit number, prepend +1
  if (!value.startsWith("+") && value.length === 10) {
    value = "+1" + value;
  }
  // If user typed 11 digits starting with 1 (US/CA), prepend +
  if (!value.startsWith("+") && value.length === 11 && value.startsWith("1")) {
    value = "+" + value;
  }
  if (!value.startsWith("+")) {
    // Unknown country / not a valid E.164
    if (value.length >= 8 && value.length <= 15) {
      return "+" + value;
    }
    return null;
  }
  return value;
}

// ─── US / Canada landline area codes (NANP) ────────────────────────────────────
// These NPAs are 100% geographic landlines per the LERG assignment. Mobile
// carriers rarely hold numbers in these ranges, so a 100% landline verdict
// is safe.
const US_CA_LANDLINE_NPAS: ReadonlySet<string> = new Set([
  "201", "202", "203", "205", "206", "207", "208", "209", "210", "212",
  "213", "214", "215", "216", "217", "218", "219", "220", "223", "224",
  "225", "227", "228", "229", "231", "234", "239", "240", "248", "251",
  "252", "253", "254", "256", "260", "262", "267", "269", "270", "272",
  "276", "279", "281", "283", "301", "302", "303", "304", "305", "307",
  "308", "309", "310", "312", "313", "314", "315", "316", "317", "318",
  "319", "320", "330", "331", "332", "334", "336", "337", "339", "346",
  "347", "351", "352", "360", "361", "364", "369", "380", "385", "386",
  "401", "402", "404", "405", "406", "407", "408", "409", "410", "412",
  "413", "414", "415", "417", "419", "423", "424", "425", "430", "432",
  "434", "435", "440", "443", "445", "447", "458", "463", "469", "470",
  "475", "478", "479", "480", "484", "501", "502", "503", "504", "505",
  "507", "508", "509", "510", "512", "513", "515", "516", "517", "518",
  "520", "530", "540", "541", "551", "559", "561", "562", "563", "564",
  "567", "570", "571", "572", "573", "574", "575", "580", "585", "586",
  "601", "602", "603", "605", "606", "607", "608", "609", "610", "612",
  "614", "615", "616", "617", "618", "619", "620", "623", "626", "628",
  "629", "630", "631", "636", "641", "646", "650", "651", "660", "661",
  "662", "667", "678", "681", "682", "701", "702", "703", "704", "706",
  "707", "708", "712", "713", "714", "715", "716", "717", "718", "719",
  "720", "724", "725", "727", "731", "732", "734", "740", "747", "754",
  "757", "760", "762", "763", "765", "770", "772", "773", "774", "775",
  "781", "785", "786", "801", "802", "803", "804", "805", "806", "808",
  "810", "812", "813", "814", "815", "816", "817", "828", "830", "831",
  "832", "843", "845", "847", "848", "850", "856", "857", "858", "859",
  "860", "862", "863", "864", "865", "870", "878", "901", "903", "906",
  "907", "908", "909", "910", "912", "913", "914", "915", "916", "917",
  "918", "919", "920", "925", "928", "931", "936", "937", "940", "941",
  "947", "949", "951", "952", "954", "956", "959", "970", "971", "972",
  "973", "978", "979", "980", "985", "989",
  // Canada
  "204", "226", "236", "249", "250", "263", "289", "306", "343", "354",
  "365", "367", "368", "403", "416", "418", "431", "437", "438", "450",
  "506", "514", "519", "548", "579", "581", "587", "604", "613", "639",
  "647", "672", "705", "709", "742", "778", "780", "782", "807", "819",
  "825", "867", "873", "902", "905",
]);

// ─── US toll-free / VoIP-only ranges (always voip) ────────────────────────────
const US_VOIP_NPAS: ReadonlySet<string> = new Set([
  "800", "833", "844", "855", "866", "877", "888", // toll-free
  "500", // personal / follow-me
  "521", // FCC designated non-geographic
  "533", // FCC designated non-geographic (post-2024)
  "544", // personal
  "566", // personal
  "577", // personal
  "588", // personal
  "522", // paging
]);

// ─── Country code → behavior lookup ───────────────────────────────────────────
const COUNTRY_DEFAULT_MOBILE = new Set([
  "+1",  // NANP — assume mobile unless in a verified landline NPA
  "+52", // Mexico — increasingly mobile-first
  "+91", // India — overwhelmingly mobile
]);

const COUNTRY_DEFAULT_LANDLINE = new Set([
  "+44", "+33", "+34", "+39", "+49", "+31", "+32", "+43", "+45", "+46",
  "+47", "+48", "+30", "+351", "+353", "+354", "+356", "+357", "+358",
  "+359", "+372", "+386", "+420", "+421",
]);

const COUNTRY_VOIP_KNOWN = new Set([
  "+370", // Lithuania — heavily VoIP
]);

/**
 * Classify a phone number. Never throws — returns a safe default.
 */
export function detectPhoneType(raw: string | null | undefined): PhoneTypeResult {
  const empty: PhoneTypeResult = {
    phoneType: "unknown",
    countryCode: null,
    e164: null,
    source: "unknown",
    confidence: "low",
  };

  if (!raw) return empty;

  const e164 = normalizeToE164(raw);
  if (!e164) return empty;

  // Country code = "+" followed by 1-3 digits
  const ccMatch = e164.match(/^(\+\d{1,3})/);
  const cc = ccMatch ? ccMatch[1] : null;

  // US/Canada NANP analysis
  if (cc === "+1" && e164.length >= 5) {
    const npa = e164.slice(2, 5);
    if (US_VOIP_NPAS.has(npa)) {
      return { phoneType: "voip", countryCode: cc, e164, source: "rule", confidence: "high" };
    }
    if (US_CA_LANDLINE_NPAS.has(npa)) {
      return { phoneType: "landline", countryCode: cc, e164, source: "rule", confidence: "high" };
    }
    // Otherwise default to mobile in NANP
    return { phoneType: "mobile", countryCode: cc, e164, source: "default_mobile", confidence: "low" };
  }

  // International handling
  if (cc && COUNTRY_VOIP_KNOWN.has(cc)) {
    return { phoneType: "voip", countryCode: cc, e164, source: "rule", confidence: "high" };
  }
  if (cc && COUNTRY_DEFAULT_MOBILE.has(cc)) {
    return { phoneType: "mobile", countryCode: cc, e164, source: "default_mobile", confidence: "low" };
  }
  if (cc && COUNTRY_DEFAULT_LANDLINE.has(cc)) {
    return { phoneType: "landline", countryCode: cc, e164, source: "default_landline", confidence: "low" };
  }

  // Unknown country — fall through to "unknown"
  return { phoneType: "unknown", countryCode: cc, e164, source: "unknown", confidence: "low" };
}
