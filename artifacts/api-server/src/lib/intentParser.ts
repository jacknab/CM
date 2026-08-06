/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Intent Parser  (zero-LLM, regex/keyword)
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Classifies a caller's raw speech transcript into a structured intent object.
 * Called on each `conversation.item.input_audio_transcription.completed` event
 * so the intent is available for logging, analytics, and context injection.
 *
 * Intentionally has ZERO external dependencies and runs in < 1ms.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export type CallIntent =
  | "booking"
  | "cancel"
  | "reschedule"
  | "walkin"
  | "price_inquiry"
  | "confirm_details"
  | "callback_request"
  | "unknown";

export type TimeRange = "morning" | "afternoon" | "evening" | null;

export interface ParsedIntent {
  intent: CallIntent;
  /** Raw service keyword extracted (e.g. "acrylics", "pedicure") */
  serviceKeyword: string | null;
  /** YYYY-MM-DD if a concrete date was parsed, null otherwise */
  date: string | null;
  /** Relative date phrase if detected (e.g. "next friday", "tomorrow") */
  relativeDate: string | null;
  timeRange: TimeRange;
  /** Staff name if caller requested a specific person */
  staffName: string | null;
  urgency: "low" | "high";
  /** 0-1 confidence; >0.7 = high confidence, use directly */
  confidence: number;
}

// ── Keyword tables ─────────────────────────────────────────────────────────────

const BOOKING_KEYWORDS = [
  /\bbook\b/, /\bschedule\b/, /\bappointment\b/, /\bmake\s+an?\s+appt\b/,
  /\bset\s+up\b/, /\bget\s+in\b/, /\bcome\s+in\b/, /\bget\s+an?\s+appt\b/,
  /\breservation\b/, /\bi\s+want\s+(?:a|an|to\s+get)\b/,
];

const CANCEL_KEYWORDS = [
  /\bcancel\b/, /\bcancell\b/, /\btake\s+off\b/, /\bremove\s+(?:my|the)\s+appt\b/,
  /\bdon'?t\s+(?:want|need)\s+(?:it|that|my)\s+(?:anymore|appt)\b/,
  /\bget\s+rid\s+of\b/,
];

const RESCHEDULE_KEYWORDS = [
  /\breschedule\b/, /\bmove\s+(?:it|my|the)\b/, /\bchange\s+(?:it|my|the)\b/,
  /\bdifferent\s+(day|time|date)\b/, /\bswitch\b/,
];

const WALKIN_KEYWORDS = [
  /\bwalk[\s-]?in\b/, /\btoday\b/, /\bright\s+now\b/, /\bthis\s+morning\b/,
  /\bthis\s+afternoon\b/, /\bthis\s+evening\b/, /\bcome\s+in\s+today\b/,
];

const PRICE_KEYWORDS = [
  /\bprice\b/, /\bcost\b/, /\bhow\s+much\b/, /\bcheap\b/, /\bexpensive\b/,
  /\baffordable\b/, /\bbudget\b/, /\bwhat\s+do\s+you\s+charge\b/, /\brate\b/,
];

const CONFIRM_KEYWORDS = [
  /\bconfirm\b/, /\bcheck\s+(?:my|the)\b/, /\bwhat\s+time\s+is\s+my\b/,
  /\bdo\s+i\s+have\s+an?\s+appt\b/, /\bjust\s+checking\b/,
];

const CALLBACK_KEYWORDS = [
  /\bspeak\s+to\s+(?:a\s+)?person\b/, /\btalk\s+to\s+(?:a\s+)?human\b/,
  /\bmanager\b/, /\breal\s+person\b/, /\bcall\s+(?:me\s+)?back\b/,
];

const SERVICE_MAP: Record<string, string> = {
  // manicure variants
  manicure: "manicure", mani: "manicure", nails: "manicure", "gel nails": "manicure",
  "gel manicure": "gel manicure", "gel mani": "gel manicure",
  // pedicure variants
  pedicure: "pedicure", pedi: "pedicure", "gel pedi": "gel pedicure",
  "gel pedicure": "gel pedicure",
  // acrylic/nail art
  acrylics: "acrylics", "acrylic nails": "acrylics", acrylic: "acrylics",
  "full set": "acrylics", "nail art": "nail art", dip: "dip powder",
  "dip powder": "dip powder",
  // hair services
  haircut: "haircut", blowout: "blowout", "blow dry": "blowout",
  "color": "hair color", highlights: "highlights", balayage: "balayage",
  // facial/skin
  facial: "facial", wax: "waxing", waxing: "waxing",
  eyebrows: "eyebrow wax", lashes: "lash extensions", "lash extensions": "lash extensions",
  // massage
  massage: "massage",
};

const TIME_RANGE_PATTERNS: Array<[RegExp, TimeRange]> = [
  [/\bmorning\b|\bbefore\s+noon\b|\bam\b|\b9\s*(?:am|to|till)?\s*(?:to|till)?\s*12\b/, "morning"],
  [/\bafternoon\b|\blunch\b|\b12[\s:]?(?:00)?\s*(?:pm|to|till)?\s*(?:to|till)?\s*5\b/, "afternoon"],
  [/\bevening\b|\bafter\s+5\b|\bafter\s+work\b|\bpm\b|\b5[\s:]?(?:00)?\s*(?:pm|to|till)?\s*(?:to|till)?\s*8\b/, "evening"],
];

const RELATIVE_DATE_PATTERNS: RegExp[] = [
  /\btomorrow\b/,
  /\bnext\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|week|month)\b/,
  /\bthis\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|week|weekend)\b/,
  /\bmonday\b|\btuesday\b|\bwednesday\b|\bthursday\b|\bfriday\b|\bsaturday\b|\bsunday\b/,
  /\bin\s+a\s+(?:couple\s+of\s+)?(?:days?|weeks?)\b/,
  /\bnext\s+\w+day\b/,
];

const STAFF_PATTERNS: RegExp[] = [
  /\bwith\s+(\w+)\b/,
  /\b(\w+)\s+(?:please|only|specifically)\b/,
  /\b(?:ask\s+for|my\s+usual)\s+(\w+)\b/,
];

const URGENCY_PATTERNS = [
  /\burgent\b/, /\basap\b/, /\btoday\b/, /\bright\s+now\b/,
  /\bimmediately\b/, /\bemergency\b/, /\bnow\b/,
];

// ── Main classifier ────────────────────────────────────────────────────────────

export function parseIntent(
  transcript: string,
  services: { id: number; name: string }[] = [],
): ParsedIntent {
  const text = transcript.toLowerCase().trim();

  // ── Intent classification ──
  let intent: CallIntent = "unknown";
  let confidence = 0.5;

  if (CANCEL_KEYWORDS.some((r) => r.test(text))) {
    intent = "cancel";
    confidence = 0.85;
  } else if (RESCHEDULE_KEYWORDS.some((r) => r.test(text))) {
    intent = "reschedule";
    confidence = 0.85;
  } else if (WALKIN_KEYWORDS.some((r) => r.test(text)) && !BOOKING_KEYWORDS.some((r) => r.test(text))) {
    intent = "walkin";
    confidence = 0.75;
  } else if (CONFIRM_KEYWORDS.some((r) => r.test(text))) {
    intent = "confirm_details";
    confidence = 0.8;
  } else if (CALLBACK_KEYWORDS.some((r) => r.test(text))) {
    intent = "callback_request";
    confidence = 0.9;
  } else if (PRICE_KEYWORDS.some((r) => r.test(text))) {
    intent = "price_inquiry";
    confidence = 0.8;
  } else if (BOOKING_KEYWORDS.some((r) => r.test(text))) {
    intent = "booking";
    confidence = 0.85;
  }

  // ── Service keyword extraction ──
  let serviceKeyword: string | null = null;

  // Try static map first
  for (const [keyword, canonical] of Object.entries(SERVICE_MAP)) {
    if (text.includes(keyword)) {
      serviceKeyword = canonical;
      // If intent wasn't classified yet, it's likely a booking
      if (intent === "unknown") { intent = "booking"; confidence = 0.75; }
      break;
    }
  }

  // Try matching against live service names from DB (if provided)
  if (!serviceKeyword && services.length > 0) {
    for (const svc of services) {
      if (text.includes(svc.name.toLowerCase())) {
        serviceKeyword = svc.name;
        if (intent === "unknown") { intent = "booking"; confidence = 0.8; }
        break;
      }
    }
  }

  // ── Date extraction ──
  let relativeDate: string | null = null;
  for (const pattern of RELATIVE_DATE_PATTERNS) {
    const m = text.match(pattern);
    if (m) {
      relativeDate = m[0];
      break;
    }
  }

  // Boost confidence when we have service + date for booking
  if (intent === "booking" && serviceKeyword && relativeDate) {
    confidence = Math.min(0.95, confidence + 0.1);
  }

  // ── Time range ──
  let timeRange: TimeRange = null;
  for (const [pattern, range] of TIME_RANGE_PATTERNS) {
    if (pattern.test(text)) {
      timeRange = range;
      break;
    }
  }

  // ── Staff name ──
  let staffName: string | null = null;
  for (const pattern of STAFF_PATTERNS) {
    const m = transcript.match(pattern); // use original case
    if (m) {
      const candidate = m[1];
      // Filter out common false positives
      if (!["a", "an", "the", "me", "my", "please", "just"].includes(candidate.toLowerCase())) {
        staffName = candidate;
        break;
      }
    }
  }

  // ── Urgency ──
  const urgency: "low" | "high" = URGENCY_PATTERNS.some((r) => r.test(text)) ? "high" : "low";

  return {
    intent,
    serviceKeyword,
    date: null, // Resolved server-side; relative date phrase is enough for Realtime AI
    relativeDate,
    timeRange,
    staffName,
    urgency,
    confidence,
  };
}

/**
 * Formats a ParsedIntent into a brief one-line context hint
 * suitable for injecting as a system note (e.g. in a function result).
 */
export function formatIntentHint(parsed: ParsedIntent): string {
  if (parsed.intent === "unknown" || parsed.confidence < 0.65) return "";

  const parts: string[] = [`DETECTED: ${parsed.intent.toUpperCase()}`];
  if (parsed.serviceKeyword) parts.push(`service="${parsed.serviceKeyword}"`);
  if (parsed.relativeDate) parts.push(`date="${parsed.relativeDate}"`);
  if (parsed.timeRange) parts.push(`time=${parsed.timeRange}`);
  if (parsed.staffName) parts.push(`staff="${parsed.staffName}"`);

  return `[${parts.join(" · ")}]`;
}
