export type SalesMemoryObject = Record<string, unknown>;

export interface IdentityCandidate {
  name?: string | null;
  businessName?: string | null;
  email?: string | null;
}

export function normalizeIdentity(value: unknown): string {
  return typeof value === "string"
    ? value.normalize("NFKC").toLocaleLowerCase("en-US").replace(/[^\p{L}\p{N}]+/gu, " ").trim().replace(/\s+/g, " ")
    : "";
}

/** Convert the pronunciation-only alias (Sir-Tex-uh; older Sir Text uh / Cert-ex-ah) back to Certxa in saved written transcripts. */
const SPOKEN_BRAND = String.raw`(?:sir[\s-]+text?[\s-]+(?:uh|a)|cert[\s-]+ex[\s-]+ah)`;
export function canonicalizeSpokenBrandForText(text: string): string {
  return text
    .replace(new RegExp(String.raw`\b${SPOKEN_BRAND}\s*(?:dot|period)?\s*com\b`, "gi"), "Certxa.com")
    .replace(new RegExp(String.raw`\b${SPOKEN_BRAND}\b`, "gi"), "Certxa");
}

/** Only caller-volunteered identity values are compared. Never reveal stored values to ask a challenge question. */
export function identityMatches(profile: IdentityCandidate, supplied: IdentityCandidate): boolean {
  const storedName = normalizeIdentity(profile.name);
  const suppliedName = normalizeIdentity(supplied.name);
  if (!suppliedName || (storedName && storedName !== suppliedName)) return false;
  const storedBusiness = normalizeIdentity(profile.businessName);
  const storedEmail = normalizeIdentity(profile.email);
  if (!storedName && !storedBusiness && !storedEmail) return false;
  if (!storedBusiness && !storedEmail) return Boolean(storedName && storedName === suppliedName);
  const businessMatches = Boolean(storedBusiness && normalizeIdentity(supplied.businessName) === storedBusiness);
  const emailMatches = Boolean(storedEmail && normalizeIdentity(supplied.email) === storedEmail);
  return businessMatches || emailMatches;
}

export function identityNeedsMoreInformation(profile: IdentityCandidate, supplied: IdentityCandidate): boolean {
  const storedName = normalizeIdentity(profile.name);
  const suppliedName = normalizeIdentity(supplied.name);
  if (!suppliedName || (storedName && storedName !== suppliedName)) return false;
  const storedBusiness = normalizeIdentity(profile.businessName);
  const storedEmail = normalizeIdentity(profile.email);
  const suppliedBusiness = normalizeIdentity(supplied.businessName);
  const suppliedEmail = normalizeIdentity(supplied.email);
  if (!storedName && !storedBusiness && !storedEmail) return false;
  if ((!storedBusiness && !storedEmail && storedName) ||
      (storedBusiness && suppliedBusiness === storedBusiness) ||
      (storedEmail && suppliedEmail === storedEmail)) return false;
  return !suppliedBusiness && !suppliedEmail;
}

function nonEmpty(value: unknown): boolean {
  if (typeof value === "string") return value.trim().length > 0;
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value === "boolean") return true;
  if (Array.isArray(value)) return value.some(nonEmpty);
  return value !== null && value !== undefined && typeof value === "object";
}

function mergeValue(previous: unknown, incoming: unknown): unknown {
  if (!nonEmpty(incoming)) return previous;
  if (Array.isArray(incoming)) {
    const oldValues = Array.isArray(previous) ? previous : [];
    const merged = [...oldValues];
    const seen = new Set(oldValues.map((v) => normalizeIdentity(typeof v === "string" ? v : JSON.stringify(v))));
    for (const value of incoming) {
      if (!nonEmpty(value)) continue;
      const key = normalizeIdentity(typeof value === "string" ? value : JSON.stringify(value));
      if (!key || seen.has(key)) continue;
      seen.add(key);
      merged.push(value);
    }
    return merged;
  }
  if (typeof incoming === "object" && incoming !== null) {
    const oldObject = typeof previous === "object" && previous !== null && !Array.isArray(previous)
      ? previous as SalesMemoryObject
      : {};
    const result: SalesMemoryObject = { ...oldObject };
    for (const [key, value] of Object.entries(incoming as SalesMemoryObject)) {
      if (!nonEmpty(value)) continue;
      result[key] = mergeValue(oldObject[key], value);
    }
    return result;
  }
  return incoming;
}

/** Merge only present values; current scalar facts may be corrected, history arrays are append-only. */
export function mergeProfileData(existing: unknown, incoming: SalesMemoryObject): SalesMemoryObject {
  const base = typeof existing === "object" && existing !== null && !Array.isArray(existing)
    ? existing as SalesMemoryObject
    : {};
  return mergeValue(base, incoming) as SalesMemoryObject;
}

function normalizedTranscript(text: string): string {
  return text.normalize("NFKC").toLocaleLowerCase("en-US").replace(/[^\p{L}\p{N}]+/gu, " ").trim().replace(/\s+/g, " ");
}

/** A summary-derived profile fact is trusted only when its quoted evidence appears in caller transcript text. */
export function hasTranscriptEvidence(
  transcript: Array<{ role: string; text: string }>,
  role: string,
  evidence: unknown,
): boolean {
  if (typeof evidence !== "string" || !evidence.trim()) return false;
  const quote = normalizedTranscript(evidence);
  if (quote.length < 4) return false;
  const sourceText = normalizedTranscript(transcript.filter((turn) => turn.role === role).map((turn) => turn.text).join(" "));
  return ` ${sourceText} `.includes(` ${quote} `);
}

export const hasCallerEvidence = (transcript: Array<{ role: string; text: string }>, evidence: unknown) =>
  hasTranscriptEvidence(transcript, "caller", evidence);

export function callerAffirmsIdentity(transcript: Array<{ role: string; text: string }>, name: unknown): boolean {
  const target = normalizeIdentity(name);
  if (!target) return false;
  return transcript.filter((turn) => turn.role === "caller").some((turn) => {
    const source = normalizedTranscript(turn.text);
    const index = source.indexOf(target);
    if (index < 0 || ` ${source} `.indexOf(` ${target} `) < 0) return false;
    const before = source.slice(Math.max(0, index - 40), index);
    return !/(\bnot\b|\bisnt\b|\bis not\b|\bno\b|\bwrong\b)\s+(?:me\s+as\s+|the\s+caller\s+as\s+)?$/.test(before);
  });
}

export function callerExplicitlyDeclined(transcript: Array<{ role: string; text: string }>): boolean {
  return transcript.some((turn) => turn.role === "caller" &&
    /\b(?:not interested|not for me|don't want (?:it|to|a)|do not want (?:it|to|a)|not looking to (?:sign up|start)|i(?:'m| am) not going to (?:sign up|start)|no thanks,? (?:i(?:'m| am) )?not interested)\b/i.test(turn.text));
}

export function stringsOnly(value: unknown, maxItems = 30, maxLength = 500): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    .map((item) => item.trim().slice(0, maxLength))
    .filter((item, index, all) => all.findIndex((candidate) => normalizeIdentity(candidate) === normalizeIdentity(item)) === index)
    .slice(0, maxItems);
}

export function safeStructuredSummary(value: unknown): SalesMemoryObject | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const raw = value as SalesMemoryObject;
  const stringField = (key: string, max = 1000): string | null =>
    typeof raw[key] === "string" && (raw[key] as string).trim()
      ? (raw[key] as string).trim().slice(0, max)
      : null;
  const facts = Array.isArray(raw.profileFacts)
    ? raw.profileFacts.slice(0, 30).flatMap((item) => {
        if (typeof item !== "object" || item === null || Array.isArray(item)) return [];
        const fact = item as SalesMemoryObject;
        if (typeof fact.field !== "string" || typeof fact.value !== "string" || typeof fact.evidence !== "string") return [];
        return [{
          field: fact.field.slice(0, 100),
          value: fact.value.trim().slice(0, 500),
          evidenceRole: fact.evidenceRole === "tom" ? "tom" : "caller",
          evidence: fact.evidence.trim().slice(0, 500),
        }];
      })
    : [];
  return {
    summary: stringField("summary"),
    callerIntent: stringField("callerIntent"),
    businessDetails: typeof raw.businessDetails === "object" && raw.businessDetails !== null && !Array.isArray(raw.businessDetails)
      ? raw.businessDetails
      : {},
    problems: stringsOnly(raw.problems),
    featuresDiscussed: stringsOnly(raw.featuresDiscussed),
    plansAndPricing: stringsOnly(raw.plansAndPricing),
    questions: stringsOnly(raw.questions),
    objections: stringsOnly(raw.objections),
    outstandingQuestions: stringsOnly(raw.outstandingQuestions),
    commitments: stringsOnly(raw.commitments),
    expressedInterest: stringField("expressedInterest", 500),
    outcome: stringField("outcome", 300),
    nextAction: stringField("nextAction", 500),
    profileFacts: facts,
  };
}

function exactItems(value: unknown, transcript: Array<{ role: string; text: string }>, roles: string[]): string[] {
  return stringsOnly(value).filter((item) => roles.some((role) => hasTranscriptEvidence(transcript, role, item)));
}

/** Keep only evidence-backed statements in the memory that will be given to Tom on a later call. */
export function safeSummaryForCallerMemory(
  summary: SalesMemoryObject,
  transcript: Array<{ role: string; text: string }>,
): SalesMemoryObject {
  const facts = verifiedProfilePatch(summary, transcript);
  const nextAction = typeof summary.nextAction === "string" &&
    hasTranscriptEvidence(transcript, "tom", summary.nextAction) ? summary.nextAction : null;
  const callerIntent = typeof summary.callerIntent === "string" && hasCallerEvidence(transcript, summary.callerIntent)
    ? summary.callerIntent
    : null;
  const expressedInterest = typeof summary.expressedInterest === "string" && hasCallerEvidence(transcript, summary.expressedInterest)
    ? summary.expressedInterest
    : null;
  const verifiedFacts = (Array.isArray(summary.profileFacts) ? summary.profileFacts : []).filter((item) => {
    if (typeof item !== "object" || item === null || Array.isArray(item)) return false;
    const fact = item as SalesMemoryObject;
    const role = fact.evidenceRole === "tom" ? "tom" : "caller";
    return Object.prototype.hasOwnProperty.call(facts.provenance, String(fact.field)) &&
      hasTranscriptEvidence(transcript, role, fact.evidence);
  });
  return {
    callerIntent,
    expressedInterest,
    businessFacts: facts.profileData.business ?? {},
    businessContactFacts: facts.columns,
    salesFacts: facts.profileData.sales ?? {},
    problems: exactItems(summary.problems, transcript, ["caller"]),
    featuresDiscussed: exactItems(summary.featuresDiscussed, transcript, ["caller", "tom"]),
    plansAndPricing: exactItems(summary.plansAndPricing, transcript, ["caller", "tom"]),
    questions: exactItems(summary.questions, transcript, ["caller"]),
    objections: exactItems(summary.objections, transcript, ["caller"]),
    outstandingQuestions: exactItems(summary.outstandingQuestions, transcript, ["caller"]),
    commitments: exactItems(summary.commitments, transcript, ["tom"]),
    nextAction,
    profileFacts: verifiedFacts,
  };
}

const PROFILE_FACT_COLUMNS: Record<string, string> = {
  name: "name",
  email: "email",
  businessName: "business_name",
  businessType: "business_type",
  teamSize: "team_size",
  city: "city",
  currentSoftware: "current_software",
  interestedPlan: "interested_plan",
};

const PROFILE_DATA_PATHS: Record<string, string[]> = {
  alternatePhone: ["contact", "alternatePhone"],
  locationCount: ["business", "locationCount"],
  serviceModel: ["business", "serviceModel"],
  bookingProcess: ["business", "bookingProcess"],
  clientManagementProcess: ["business", "clientManagementProcess"],
  checkoutProcess: ["business", "checkoutProcess"],
  turnRotationProcess: ["business", "turnRotationProcess"],
  commissionProcess: ["business", "commissionProcess"],
  problem: ["business", "problems"],
  featureOfInterest: ["sales", "featuresOfInterest"],
  planDiscussed: ["sales", "plansDiscussed"],
  pricingDiscussed: ["sales", "pricingDiscussed"],
  signupLinkRequested: ["sales", "signupLinkRequested"],
  question: ["sales", "questionsAsked"],
  objection: ["sales", "objections"],
  trialRequested: ["sales", "trialRequested"],
  notInterested: ["sales", "notInterested"],
  outstandingQuestion: ["sales", "outstandingQuestions"],
  commitment: ["sales", "commitments"],
};

const PROFILE_LIST_FACTS = new Set([
  "problem", "featureOfInterest", "planDiscussed", "pricingDiscussed", "signupLinkRequested",
  "question", "objection", "trialRequested", "notInterested", "outstandingQuestion", "commitment",
]);

export function verifiedProfilePatch(
  summary: SalesMemoryObject,
  transcript: Array<{ role: string; text: string }>,
): { columns: Record<string, string>; profileData: SalesMemoryObject; provenance: SalesMemoryObject } {
  const columns: Record<string, string> = {};
  const profileData: SalesMemoryObject = {};
  const provenance: SalesMemoryObject = {};
  for (const item of Array.isArray(summary.profileFacts) ? summary.profileFacts : []) {
    if (typeof item !== "object" || item === null || Array.isArray(item)) continue;
    const fact = item as SalesMemoryObject;
    const field = typeof fact.field === "string" ? fact.field : "";
    const value = typeof fact.value === "string" ? fact.value.trim().slice(0, 500) : "";
    const role = fact.evidenceRole === "tom" ? "tom" : "caller";
    if (!field || !value || !hasTranscriptEvidence(transcript, role, fact.evidence)) continue;
    if (role === "tom" && !["planDiscussed", "pricingDiscussed", "commitment"].includes(field)) continue;

    if (field === "email") {
      const email = value.toLowerCase();
      const tomText = normalizedTranscript(transcript.filter((turn) => turn.role === "tom").map((turn) => turn.text).join(" "));
      if (role !== "caller" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !tomText.includes(normalizedTranscript(email))) continue;
    }

    const column = PROFILE_FACT_COLUMNS[field];
    if (column) {
      columns[column] = value;
      provenance[field] = { source: `${role}_statement`, evidence: String(fact.evidence).slice(0, 500) };
      continue;
    }
    const path = PROFILE_DATA_PATHS[field];
    if (!path) continue;
    let parent = profileData;
    for (const segment of path.slice(0, -1)) {
      if (!parent[segment] || typeof parent[segment] !== "object") parent[segment] = {};
      parent = parent[segment] as SalesMemoryObject;
    }
    const key = path[path.length - 1];
    if (PROFILE_LIST_FACTS.has(field)) {
      parent[key] = [...(Array.isArray(parent[key]) ? parent[key] as unknown[] : []), value];
    } else parent[key] = value;
    provenance[field] = { source: `${role}_statement`, evidence: String(fact.evidence).slice(0, 500) };
  }
  if (Object.keys(provenance).length) profileData.provenance = provenance;
  return { columns, profileData, provenance };
}

export function summarizeMemoryContext(profile: SalesMemoryObject, recentCalls: Array<SalesMemoryObject>): string {
  const contact = {
    name: profile.name,
    business: profile.business_name,
    type: profile.business_type,
    technicians: profile.team_size,
    plan: profile.interested_plan,
    locations: profile.profile_data && (profile.profile_data as any)?.business?.locationCount,
    email: profile.email,
  };
  const data = (profile.profile_data && typeof profile.profile_data === "object" ? profile.profile_data : {}) as SalesMemoryObject;
  const calls = recentCalls.slice(0, 4).map((call) => ({
    date: call.started_at,
    handledBy: call.sales_agent_id === "shavez" ? "Shavez" : "Tom",
    notes: (call.structured_summary as SalesMemoryObject | undefined)?.memoryNotes ?? {},
    unansweredQuestions: (call.structured_summary as SalesMemoryObject | undefined)?.outstandingQuestions ?? [],
    internalSuggestedNextStep: (call.structured_summary as SalesMemoryObject | undefined)?.nextAction ?? null,
    legacySummaryForContextOnly: call.structured_summary ? null : call.summary,
    sms: call.sms_events,
    outcome: call.outcome,
  }));
  return JSON.stringify({
    contact: Object.fromEntries(Object.entries(contact).filter(([, value]) => nonEmpty(value))),
    business: data.business ?? {},
    sales: { status: profile.status ?? "new", ...((data.sales as SalesMemoryObject | undefined) ?? {}) },
    provenance: data.provenance ?? {},
    recentCalls: calls,
  }).slice(0, 5000);
}

export function profileNeedsIdentityCheck(profile: SalesMemoryObject, hasVerifiedHistory: boolean): boolean {
  if (hasVerifiedHistory || profile.name || profile.business_name || profile.email) return true;
  const data = typeof profile.profile_data === "object" && profile.profile_data !== null
    ? profile.profile_data as SalesMemoryObject
    : {};
  const contact = typeof data.contact === "object" && data.contact !== null ? data.contact as SalesMemoryObject : {};
  const business = typeof data.business === "object" && data.business !== null ? data.business as SalesMemoryObject : {};
  const sales = typeof data.sales === "object" && data.sales !== null ? data.sales as SalesMemoryObject : {};
  const otherSalesFacts = Object.keys(sales).some((key) => !["signupLinkSent", "currentStage"].includes(key));
  return Boolean(Object.keys(contact).length || Object.keys(business).length || otherSalesFacts);
}

export function shouldAssociateCallWithProfile(input: {
  identityVerified: boolean;
  profileLookupCompleted: boolean;
  profileCandidate: boolean;
  identityBlocked: boolean;
}): boolean {
  return input.identityVerified || (input.profileLookupCompleted && !input.profileCandidate && !input.identityBlocked);
}

const SALES_STAGE_RANK: Record<string, number> = {
  new_prospect: 0,
  interested: 1,
  signup_link_requested: 2,
  signup_link_sent: 3,
  follow_up_required: 4,
  trial_active: 5,
  paying_customer: 6,
};

/** Progress monotonically on evidence; explicit renewed interest can revive a previously declined prospect. */
export function advanceSalesStage(current: unknown, incoming: unknown): string {
  const currentStage = typeof current === "string" ? current : "new_prospect";
  const nextStage = typeof incoming === "string" ? incoming : "";
  if (!nextStage || nextStage === currentStage) return currentStage;
  if (nextStage === "not_interested") return (SALES_STAGE_RANK[currentStage] ?? -1) >= 5 ? currentStage : "not_interested";
  if (currentStage === "not_interested") return SALES_STAGE_RANK[nextStage] !== undefined ? nextStage : currentStage;
  if (SALES_STAGE_RANK[nextStage] === undefined) return currentStage;
  return (SALES_STAGE_RANK[nextStage] ?? -1) > (SALES_STAGE_RANK[currentStage] ?? -1) ? nextStage : currentStage;
}

export function stageHistoryUpdate(
  currentSales: SalesMemoryObject,
  requestedStage: unknown,
  source: string,
  at = new Date().toISOString(),
): SalesMemoryObject {
  const current = typeof currentSales.currentStage === "string" ? currentSales.currentStage : "new_prospect";
  const next = advanceSalesStage(current, requestedStage);
  if (next === current) return currentSales;
  const history = Array.isArray(currentSales.stageHistory) ? currentSales.stageHistory : [];
  return {
    ...currentSales,
    currentStage: next,
    stageHistory: [...history, { stage: next, at, source }].slice(-50),
  };
}

/** An immediately ended call still waits for its asynchronous INSERT before persisting the final transcript. */
export async function finalizeAfterInsert(
  insert: Promise<number | null>,
  actions: Promise<unknown>[],
  update: (callId: number) => Promise<void>,
): Promise<number | null> {
  await Promise.allSettled(actions);
  const callId = await insert;
  if (!callId) return null;
  await update(callId);
  return callId;
}
