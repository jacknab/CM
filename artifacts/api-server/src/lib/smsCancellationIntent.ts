/**
 * Detect clear cancellation intent in an inbound client SMS without relying on a single
 * carrier-reserved keyword. This is deliberately deterministic: cancelling an appointment is a
 * destructive action, so ambiguous questions and negated statements must stay in the inbox for a
 * human instead of being guessed by an LLM.
 */
export interface SmsCancellationIntent {
  shouldCancel: boolean;
  confidence: number;
  matchedPhrase: string | null;
}

const normalize = (input: string) => input
  .toLowerCase()
  .replace(/[’]/g, "'")
  .replace(/[^a-z0-9'\s]/g, " ")
  .replace(/\s+/g, " ")
  .trim();

const NEGATED_CANCELLATION = [
  /\b(?:do not|don't|dont|no need to|please don't|please do not)\s+cancel\b/,
  /\b(?:not|never)\s+cancell?ing\b/,
  /\b(?:can|could|would)\s+(?:i|you)\s+cancel\??$/,
];

const HIGH_CONFIDENCE_PHRASES = [
  /\b(?:please\s+)?cancel\s+(?:my|the|this)\s+(?:appointment|appt|booking|reservation)\b/,
  /\b(?:i\s+)?(?:need|have|want|wish|would like)\s+to\s+cancel\b/,
  /\b(?:i\s+)?(?:can't|cant|cannot|won't|wont|will not)\s+(?:make|attend|come(?:\s+in)?(?:\s+to)?)\b/,
  /\b(?:i\s+)?(?:will|can)\s+not\s+be\s+able\s+to\s+(?:make|attend|come)\b/,
  /\b(?:i\s+)?(?:am|i'm|im)\s+not\s+(?:going\s+to\s+)?(?:make|attend|come)\b/,
  /\b(?:i\s+)?(?:can|will)\s+no\s+longer\s+(?:make|attend|come)\b/,
  /\b(?:please\s+)?(?:take|remove)\s+me\s+(?:off|from)\s+(?:the\s+)?(?:schedule|calendar|appointment|appt|booking)\b/,
  /\b(?:call|take)\s+off\s+(?:my|the)\s+(?:appointment|appt|booking)\b/,
  /\bi\s+(?:have\s+to|must)\s+cancel\b/,
];

const SHORT_DIRECT_REPLIES = new Set([
  "cancel",
  "cancel appointment",
  "cancel my appointment",
  "can't make it",
  "cant make it",
  "can not make it",
  "cannot make it",
  "can not make it",
  "won't make it",
  "wont make it",
  "not coming",
  "please cancel",
]);

export function classifySmsCancellationIntent(input: string): SmsCancellationIntent {
  const text = normalize(input);
  if (!text) return { shouldCancel: false, confidence: 0, matchedPhrase: null };
  if (NEGATED_CANCELLATION.some((pattern) => pattern.test(text))) {
    return { shouldCancel: false, confidence: 0.05, matchedPhrase: null };
  }
  if (SHORT_DIRECT_REPLIES.has(text)) {
    return { shouldCancel: true, confidence: 0.99, matchedPhrase: text };
  }
  const matched = HIGH_CONFIDENCE_PHRASES.find((pattern) => pattern.test(text));
  if (matched) {
    return { shouldCancel: true, confidence: 0.95, matchedPhrase: text.match(matched)?.[0] ?? text };
  }
  return { shouldCancel: false, confidence: 0.2, matchedPhrase: null };
}

/** Replace the legacy reserved-keyword instruction while preserving the salon's custom message. */
export function replaceReservedCancelPrompt(template: string): string {
  return template
    .replace(/reply\s+["']?cancel["']?\s+to\s+cancel(?:\s+(?:your|the)\s+(?:appointment|appt))?\.?/gi,
      "If you can't make it, reply and tell us")
    .replace(/\s+/g, " ")
    .trim();
}
